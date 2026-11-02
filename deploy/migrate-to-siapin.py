"""One-time production rename. Run from the VPS: python3 deploy/migrate-to-siapin.py --apply."""

import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import subprocess
import sys


ROOT = Path(__file__).resolve().parents[1]
COMPOSE = ['docker', 'compose']
LEGACY_PROJECT = 'pintar'
LEGACY_VOLUME = 'pintar_postgres_data'
TARGET_VOLUME = 'siapin_postgres_data'


def run(args, **kwargs):
    return subprocess.run(args, cwd=ROOT, check=True, **kwargs)


def output(args):
    return run(args, capture_output=True, text=True, stdin=subprocess.DEVNULL).stdout.strip()


def legacy_containers(service=None):
    args = ['docker', 'ps', '-aq', '--filter', 'label=com.docker.compose.project=' + LEGACY_PROJECT]
    if service:
        args += ['--filter', 'label=com.docker.compose.service=' + service]
    return output(args).splitlines()


def volume_exists(name):
    return subprocess.run(
        ['docker', 'volume', 'inspect', name], cwd=ROOT,
        stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    ).returncode == 0


def sql_args(container, user, database, sql):
    return ['docker', 'exec', container, 'psql', '-XAt', '-v', 'ON_ERROR_STOP=1',
            '-U', user, '-d', database, '-c', sql]


def table_counts(container, user, database):
    tables = output(sql_args(container, user, database,
        "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename"))
    if not tables:
        raise RuntimeError('Database sumber/target tidak mempunyai tabel aplikasi.')
    queries = []
    for table in tables.splitlines():
        literal = table.replace("'", "''")
        identifier = table.replace('"', '""')
        queries.append(f"SELECT '{literal}', count(*) FROM public.\"{identifier}\"")
    return output(sql_args(container, user, database, ' UNION ALL '.join(queries) + ' ORDER BY 1'))


def migrate():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true', help='Back up and transfer the existing production data.')
    args = parser.parse_args()
    if not args.apply:
        parser.error('Migration memerlukan --apply. Hentikan deploy/penulisan manual selama migrasi.')
    if not (ROOT / '.env').is_file():
        raise RuntimeError('File .env VPS belum tersedia.')
    config = json.loads(output(COMPOSE + ['config', '--format', 'json']))
    db = config['services']['siapin-db']['environment']
    if (config['name'], db['POSTGRES_USER'], db['POSTGRES_DB'],
            config['volumes']['postgres_data']['name']) != ('siapin', 'siapin', 'siapin', TARGET_VOLUME):
        raise RuntimeError('Konfigurasi target harus project/user/database siapin dan volume siapin_postgres_data.')
    old = legacy_containers('siapin-db')
    if len(old) != 1:
        raise RuntimeError('Harus ada tepat satu container database instalasi lama; jangan hapus container/volume lama dulu.')
    source = old[0]
    info = json.loads(output(['docker', 'inspect', source]))[0]
    mounted = [m.get('Name') for m in info['Mounts'] if m['Destination'] == '/var/lib/postgresql/data']
    if mounted != [LEGACY_VOLUME] or not info['State']['Running']:
        raise RuntimeError('Database lama harus berjalan dengan volume pintar_postgres_data yang benar.')
    if volume_exists(TARGET_VOLUME):
        raise RuntimeError('Volume target sudah ada. Tidak ditimpa. Periksa hasil percobaan sebelumnya sebelum melanjutkan.')
    expected = set(old + legacy_containers('siapin-api') + legacy_containers('siapin-web'))
    if set(legacy_containers()) != expected:
        raise RuntimeError('Ada service lain pada project lama; periksa sebelum migrasi.')

    print('Build target sebelum menghentikan aplikasi...', flush=True)
    run(COMPOSE + ['build'], stdin=subprocess.DEVNULL)
    os.umask(0o077)
    backup_dir = ROOT / 'backups'
    backup_dir.mkdir(exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
    backup = backup_dir / f'before-siapin-rename-{stamp}.dump'
    temporary = backup.with_suffix('.dump.tmp')
    previously_running = [c for c in expected if c != source and
        json.loads(output(['docker', 'inspect', c]))[0]['State']['Running']]
    target_started = False
    try:
        if previously_running:
            run(['docker', 'stop', *previously_running], stdin=subprocess.DEVNULL)
        counts = table_counts(source, 'pintar', 'pintar')
        with temporary.open('xb') as stream:
            run(['docker', 'exec', source, 'pg_dump', '-U', 'pintar', '-d', 'pintar',
                 '--format=custom', '--no-owner', '--no-privileges'],
                stdin=subprocess.DEVNULL, stdout=stream)
        temporary.rename(backup)
        print(f'Backup tersimpan: {backup}', flush=True)
        target_started = True
        run(COMPOSE + ['up', '-d', 'siapin-db', '--wait', '--wait-timeout', '120'], stdin=subprocess.DEVNULL)
        with backup.open('rb') as stream:
            run(COMPOSE + ['exec', '-T', '--interactive=true', 'siapin-db', 'pg_restore',
                 '-U', 'siapin', '-d', 'siapin', '--no-owner', '--no-privileges',
                 '--single-transaction', '--exit-on-error'], stdin=stream)
        target = output(COMPOSE + ['ps', '-q', 'siapin-db'])
        if table_counts(target, 'siapin', 'siapin') != counts:
            raise RuntimeError('Jumlah baris hasil restore berbeda; aplikasi baru tidak diaktifkan.')
        run(COMPOSE + ['up', '-d', '--wait', '--wait-timeout', '180'], stdin=subprocess.DEVNULL)
    except Exception:
        if target_started:
            subprocess.run(COMPOSE + ['stop'], cwd=ROOT, stdin=subprocess.DEVNULL)
        if previously_running:
            subprocess.run(['docker', 'start', *previously_running], stdin=subprocess.DEVNULL)
        print('Migrasi gagal. Aplikasi lama dicoba dinyalakan kembali; backup dan kedua volume dipertahankan.', file=sys.stderr)
        print('Jangan jalankan ulang dengan menghapus volume tanpa memeriksa datanya.', file=sys.stderr)
        raise

    # Remove old containers only after restore, row counts, and application health pass.
    run(['docker', 'stop', source], stdin=subprocess.DEVNULL)
    run(['docker', 'rm', *sorted(expected)], stdin=subprocess.DEVNULL)
    print('Migrasi selesai. Project, user, dan database sekarang siapin.', flush=True)
    print(f'Volume lama {LEGACY_VOLUME} dan backup tetap disimpan. Jangan gunakan keduanya untuk penulisan baru.')
    print('Perbarui IP database pada DBeaver dan PermitOpen SSH jika sebelumnya dibatasi ke IP container lama.')


if __name__ == '__main__':
    try:
        migrate()
    except (RuntimeError, subprocess.CalledProcessError) as error:
        print(f'ERROR: {error}', file=sys.stderr)
        sys.exit(1)
