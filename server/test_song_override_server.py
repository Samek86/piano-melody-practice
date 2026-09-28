import json
import os
import tempfile
import threading
import unittest
import urllib.request
from datetime import datetime
from urllib.error import HTTPError

from server.song_override_server import make_server, read_songs, save_song


def song(title: str) -> dict:
    return {
        'id': 'school-bell',
        'title': 'School Bell',
        'titleKo': title,
        'key': 'C',
        'tempo': 100,
        'timeSignature': [4, 4],
        'notes': [{'pitch': 60, 'duration': 4, 'finger': 5}],
    }


class BackupTests(unittest.TestCase):
    def test_replacing_a_song_copies_the_previous_file_into_a_dated_folder(self):
        with tempfile.TemporaryDirectory() as root:
            when = datetime(2026, 9, 28, 23, 45, 9)
            self.assertIsNone(save_song(root, song('처음'), when))
            folder = save_song(root, song('수정'), when)
            self.assertEqual(folder, '20260928-234509')
            backup_path = os.path.join(root, 'song-backups', '20260928-234509', 'school-bell.json')
            with open(backup_path, encoding='utf-8') as handle:
                previous = json.load(handle)
            self.assertEqual(previous['titleKo'], '처음')
            self.assertEqual(previous['notes'][0]['finger'], 5)
            self.assertEqual(read_songs(root)['school-bell']['titleKo'], '수정')
            self.assertFalse(os.path.exists(os.path.join(root, 'dist')))

    def test_http_write_requires_the_token_and_a_second_put_backs_up(self):
        with tempfile.TemporaryDirectory() as root:
            token_path = os.path.join(root, 'admin-token')
            with open(token_path, 'w', encoding='utf-8') as handle:
                handle.write('test-token\n')
            server = make_server('127.0.0.1', 0, root, token_path)
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            port = server.server_address[1]
            base = f'http://127.0.0.1:{port}/api/song-overrides/school-bell'
            try:
                denied = self._request(base, 'PUT', song('처음'), None)
                self.assertEqual(denied.status, 401)
                self.assertNotIn(b'test-token', denied.body)
                first = self._request(base, 'PUT', song('처음'), 'test-token')
                self.assertEqual(first.status, 200)
                self.assertEqual(json.loads(first.body)['backedUp'], False)
                second = self._request(base, 'PUT', song('수정'), 'test-token')
                payload = json.loads(second.body)
                self.assertEqual(second.status, 200)
                self.assertEqual(payload['backedUp'], True)
                backup_dir = os.path.join(root, 'song-backups', payload['backupFolder'])
                self.assertTrue(os.path.isfile(os.path.join(backup_dir, 'school-bell.json')))
                listed = self._request(f'http://127.0.0.1:{port}/api/song-overrides', 'GET', None, None)
                songs = json.loads(listed.body)['songs']
                self.assertEqual(songs['school-bell']['titleKo'], '수정')
            finally:
                server.shutdown()
                server.server_close()

    def _request(self, url: str, method: str, payload: dict | None, token: str | None):
        data = None if payload is None else json.dumps(payload).encode('utf-8')
        headers = {}
        if data is not None:
            headers['Content-Type'] = 'application/json'
        if token is not None:
            headers['X-Piano-Admin-Token'] = token
        request = urllib.request.Request(url, data=data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(request) as response:
                return _HttpResult(response.status, response.read())
        except HTTPError as error:
            return _HttpResult(error.code, error.read())


class _HttpResult:
    def __init__(self, status: int, body: bytes):
        self.status = status
        self.body = body


if __name__ == '__main__':
    unittest.main()
