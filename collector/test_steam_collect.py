"""Offline regression coverage: python3 -m unittest discover -s collector -p 'test_*.py'."""
import contextlib
import importlib.util
import io
from pathlib import Path
import subprocess
import sys
import unittest
from unittest.mock import patch
import urllib.error

SCRIPT = Path(__file__).with_name('steam_collect.py')
spec = importlib.util.spec_from_file_location('steam_collect', SCRIPT)
collector = importlib.util.module_from_spec(spec)
spec.loader.exec_module(collector)
collector.KEY = 'test-secret-key'


class CollectorTests(unittest.TestCase):
    def setUp(self):
        collector.reset_requests()
        collector.STEAMID = "76561198197939591"

    def test_profile_formats(self):
        for value, expected in [
            ('76561198197939591', '76561198197939591'),
            (' my-name ', 'my-name'),
            ('https://steamcommunity.com/id/my-name/?foo=bar', 'my-name'),
            ('steamcommunity.com/profiles/76561198197939591/', '76561198197939591'),
        ]:
            with self.subTest(value=value):
                self.assertEqual(collector.normalize_ident(value), expected)

    def test_rejects_invalid_profile_urls(self):
        for value in ['https://example.com/id/name', 'https://steamcommunity.com/app/1',
                      'https://steamcommunity.com/profiles/nope', '', 'a/b']:
            with self.subTest(value=value), self.assertRaises(ValueError):
                collector.normalize_ident(value)

    def test_help_needs_no_credentials(self):
        result = subprocess.run([sys.executable, str(SCRIPT), '--help'], capture_output=True, text=True)
        self.assertEqual(result.returncode, 0)
        self.assertIn('--output', result.stdout)

    def test_bad_arguments_fail_before_network_requests(self):
        for args in [[], ['name', '--key'], ['name', '--workers', '0'], ['name', '--workers', '5'], ['name', '--max-calls', '0'], ['name', '--wat']]:
            result = subprocess.run([sys.executable, str(SCRIPT), *args], capture_output=True, text=True)
            self.assertEqual(result.returncode, 2)
            self.assertNotIn('Traceback', result.stderr)

    def test_systemic_errors_stop_all_later_calls_without_retry(self):
        for status in (401, 403, 429, 503):
            collector.reset_requests()
            error = urllib.error.HTTPError('https://example.com', status, 'busy', {}, None)
            with self.subTest(status=status), patch.object(collector.urllib.request, 'urlopen', side_effect=error) as request:
                with self.assertRaises(collector.CollectionStopped):
                    collector.get('test')
                with self.assertRaises(collector.CollectionStopped):
                    collector.get('other')
                self.assertEqual(request.call_count, 1)

    def test_queued_workers_observe_shared_stop(self):
        error = urllib.error.HTTPError('https://example.com', 429, 'limited', {}, None)
        with patch.object(collector.urllib.request, 'urlopen', side_effect=error) as request:
            with collector.concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
                futures = [pool.submit(collector.get, 'test') for _ in range(8)]
                for future in futures:
                    with self.assertRaises(collector.CollectionStopped):
                        future.result()
            self.assertEqual(request.call_count, 1)

    def test_errors_do_not_expose_api_key(self):
        error = urllib.error.URLError('https://example.com/?key=test-secret-key')
        with patch.object(collector.urllib.request, 'urlopen', side_effect=error):
            with self.assertRaises(collector.CollectionStopped) as caught:
                collector.get('test')
        self.assertNotIn('test-secret-key', str(caught.exception))

    def test_call_allowance_and_spacing(self):
        collector.reset_requests(2)
        with patch.object(collector.urllib.request, 'urlopen', side_effect=lambda *a, **k: io.BytesIO(b'{}')) as request, \
                patch.object(collector.time, 'monotonic', return_value=10), patch.object(collector.time, 'sleep') as sleep:
            collector.get('one')
            collector.get('two')
            with self.assertRaises(collector.CollectionStopped):
                collector.get('three')
            self.assertEqual(request.call_count, 2)
            sleep.assert_called_once_with(0.5)

    def test_known_player_unavailable_does_not_stop_other_games(self):
        error = urllib.error.HTTPError('https://example.com', 403, 'denied', {},
            io.BytesIO(b'{"playerstats":{"success":false,"error":"Requested app has no stats"}}'))
        with patch.object(collector.urllib.request, 'urlopen', side_effect=[error, io.BytesIO(b'{}')]), \
                patch.object(collector.time, 'sleep'):
            self.assertIsNone(collector.get('ISteamUserStats/GetPlayerAchievements/v1'))
            self.assertEqual(collector.get('other'), {})

    def test_empty_schema_avoids_progress_and_rarity(self):
        with patch.object(collector, 'get', return_value={'game': {}}) as request:
            result = collector.process_game({'appid': 10, 'name': 'Counter-Strike'})
            self.assertEqual(result['achievements'], [])
            request.assert_called_once_with('ISteamUserStats/GetSchemaForGame/v2', appid=10)

    def test_systemic_failure_preserves_existing_output(self):
        import tempfile
        with tempfile.TemporaryDirectory() as folder:
            output = Path(folder) / 'old.json'
            output.write_text('previous library')
            with patch.object(sys, 'argv', ['collector', '76561198197939591', '--key', 'test', '--output', str(output)]), \
                    patch.object(collector.urllib.request, 'urlopen', side_effect=urllib.error.URLError('offline')), \
                    contextlib.redirect_stdout(io.StringIO()):
                with self.assertRaises(collector.CollectionStopped):
                    collector.main()
            self.assertEqual(output.read_text(), 'previous library')

    def test_download_matches_source(self):
        self.assertEqual(SCRIPT.read_bytes(), (SCRIPT.parent.parent / 'src/assets/collector.py').read_bytes())


if __name__ == '__main__':
    unittest.main()
