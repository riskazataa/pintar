"""Run with: python3 -m unittest discover -s deploy/tests -v."""

import os
from pathlib import Path
import subprocess
import tempfile
import textwrap
import unittest


class DeploymentWorkflowTest(unittest.TestCase):
    def run_remote_script(self, backup_failure=False, legacy_install=False):
        workflow = (
            Path(__file__).resolve().parents[2] / '.github/workflows/deploy.yml'
        ).read_text()
        script = textwrap.dedent(
            workflow.split("<<'DEPLOY'\n", 1)[1].split('\n          DEPLOY', 1)[0]
        )
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / '.git').mkdir()
            (root / '.env').touch()
            commands = root / 'commands'
            commands.mkdir()
            (commands / 'git').write_text(
                '#!/bin/sh\n'
                'if [ "$1" = rev-parse ]; then printf "%s\\n" "$TEST_SHA"; fi\n'
                'exit 0\n'
            )
            (commands / 'docker').write_text(textwrap.dedent('''\
                #!/usr/bin/env python3
                import os
                from pathlib import Path
                import sys

                args = sys.argv[1:]
                with Path(os.environ['COMMAND_LOG']).open('a') as log:
                    log.write(' '.join(args) + '\\n')
                if 'label=com.docker.compose.project=pintar' in args:
                    if os.environ['LEGACY_INSTALL'] == '1':
                        print('legacy-database-container')
                    sys.exit(0)
                if 'pg_dump' in args:
                    if '--interactive=false' not in args:
                        # An interactive exec can consume the remaining SSH script.
                        sys.stdin.read()
                    if os.environ['BACKUP_FAILURE'] == '1':
                        sys.exit(1)
                    print('database-backup')
            '''))
            for command in commands.iterdir():
                command.chmod(0o755)
            log = root / 'commands.log'
            result = subprocess.run(
                ['bash', '-se', '--', str(root), 'a' * 40],
                input=script,
                text=True,
                capture_output=True,
                env={
                    **os.environ,
                    'PATH': str(commands) + os.pathsep + os.environ['PATH'],
                    'TEST_SHA': 'a' * 40,
                    'COMMAND_LOG': str(log),
                    'BACKUP_FAILURE': '1' if backup_failure else '0',
                    'LEGACY_INSTALL': '1' if legacy_install else '0',
                },
            )
            return result, log.read_text().splitlines()

    def test_backup_preserves_remaining_remote_commands(self):
        result, commands = self.run_remote_script()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('compose up -d --wait --wait-timeout 180', commands)
        self.assertIn('compose ps', commands)
        self.assertIn('Deploy selesai:', result.stdout)
        self.assertTrue(any('pg_dump -U siapin -d siapin' in command for command in commands))

    def test_backup_failure_prevents_application_update(self):
        result, commands = self.run_remote_script(backup_failure=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertNotIn('compose up -d --wait --wait-timeout 180', commands)
        self.assertNotIn('Deploy selesai:', result.stdout)

    def test_old_project_requires_migration_before_starting_new_database(self):
        result, commands = self.run_remote_script(legacy_install=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('migrate-to-siapin.py --apply', result.stdout)
        self.assertNotIn('compose build', commands)
        self.assertFalse(any('compose up' in command for command in commands))
