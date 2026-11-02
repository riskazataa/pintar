import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch


path = Path(__file__).resolve().parents[1] / 'migrate-to-siapin.py'
spec = importlib.util.spec_from_file_location('project_rename', path)
migration = importlib.util.module_from_spec(spec)
spec.loader.exec_module(migration)


class ProjectRenameTest(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.root = Path(self.directory.name)
        (self.root / '.env').touch()
        self.umask = os.umask(0o077)

    def tearDown(self):
        os.umask(self.umask)
        self.directory.cleanup()

    def inspect_output(self, args):
        if args == ['docker', 'compose', 'config', '--format', 'json']:
            return json.dumps({
                'name': 'siapin',
                'services': {'siapin-db': {'environment': {
                    'POSTGRES_USER': 'siapin', 'POSTGRES_DB': 'siapin',
                }}},
                'volumes': {'postgres_data': {'name': 'siapin_postgres_data'}},
            })
        if args[:2] == ['docker', 'inspect']:
            return json.dumps([{
                'Mounts': [{'Destination': '/var/lib/postgresql/data',
                            'Name': 'pintar_postgres_data'}],
                'State': {'Running': True},
            }])
        raise AssertionError(args)

    def containers(self, service=None):
        return {
            'siapin-db': ['old-db'], 'siapin-api': ['old-api'],
            'siapin-web': ['old-web'], None: ['old-db', 'old-api', 'old-web'],
        }[service]

    def test_refuses_existing_target_before_build_or_stop(self):
        with patch.object(migration, 'ROOT', self.root), \
                patch('sys.argv', ['migrate-to-siapin.py', '--apply']), \
                patch.object(migration, 'output', side_effect=self.inspect_output), \
                patch.object(migration, 'legacy_containers', side_effect=self.containers), \
                patch.object(migration, 'volume_exists', return_value=True), \
                patch.object(migration, 'run') as run:
            with self.assertRaisesRegex(RuntimeError, 'Volume target sudah ada'):
                migration.migrate()
            run.assert_not_called()

    def test_restore_failure_stops_target_and_restarts_old_application(self):
        def command(args, **kwargs):
            if 'pg_dump' in args:
                kwargs['stdout'].write(b'fixture archive')
            if 'pg_restore' in args:
                raise subprocess.CalledProcessError(1, args)

        with patch.object(migration, 'ROOT', self.root), \
                patch('sys.argv', ['migrate-to-siapin.py', '--apply']), \
                patch.object(migration, 'output', side_effect=self.inspect_output), \
                patch.object(migration, 'legacy_containers', side_effect=self.containers), \
                patch.object(migration, 'volume_exists', return_value=False), \
                patch.object(migration, 'table_counts', return_value='User|1'), \
                patch.object(migration, 'run', side_effect=command) as run, \
                patch.object(migration.subprocess, 'run') as recovery:
            with self.assertRaises(subprocess.CalledProcessError):
                migration.migrate()
            recovered = [call.args[0] for call in recovery.call_args_list]
            self.assertIn(['docker', 'compose', 'stop'], recovered)
            starts = [args for args in recovered if args[:2] == ['docker', 'start']]
            self.assertEqual(set(starts[0][2:]), {'old-api', 'old-web'})
            self.assertFalse(any(call.args[0][:2] == ['docker', 'rm']
                                 for call in run.call_args_list))
            self.assertEqual(len(list((self.root / 'backups').glob('*.dump'))), 1)
