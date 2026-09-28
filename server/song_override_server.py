#!/usr/bin/env python3
"""Localhost store for admin song overrides.

Files live under PIANO_APP_ROOT (default /home/ubuntu/apps/piano), outside dist/:
  song-overrides/{id}.json
  song-backups/YYYYMMDD-HHMMSS/{id}.json   (server local time, previous file only)

Writes require header X-Piano-Admin-Token matching PIANO_ADMIN_TOKEN_FILE
(default $PIANO_APP_ROOT/.secrets/admin-token). The token is never logged.
This process does not commit or push to GitHub.
"""

from __future__ import annotations

import hmac
import json
import os
import shutil
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import unquote, urlparse

PREFIX = '/api/song-overrides'
MAX_BODY = 1_000_000
ID_OK = set('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_')


def app_root() -> str:
    return os.environ.get('PIANO_APP_ROOT', '/home/ubuntu/apps/piano')


def token_file() -> str:
    return os.environ.get('PIANO_ADMIN_TOKEN_FILE', os.path.join(app_root(), '.secrets', 'admin-token'))


def overrides_dir(root: str | None = None) -> str:
    return os.path.join(root or app_root(), 'song-overrides')


def backups_dir(root: str | None = None) -> str:
    return os.path.join(root or app_root(), 'song-backups')


def backup_stamp(now: datetime) -> str:
    """Server local time as YYYYMMDD-HHMMSS."""
    return now.strftime('%Y%m%d-%H%M%S')


def valid_song_id(song_id: str) -> bool:
    return bool(song_id) and len(song_id) <= 80 and all(ch in ID_OK for ch in song_id)


def is_song(value: object, song_id: str) -> bool:
    if not isinstance(value, dict):
        return False
    if value.get('id') != song_id:
        return False
    if not isinstance(value.get('title'), str) or not isinstance(value.get('titleKo'), str):
        return False
    if not isinstance(value.get('key'), str) or not isinstance(value.get('tempo'), (int, float)):
        return False
    signature = value.get('timeSignature')
    if not isinstance(signature, list) or len(signature) != 2:
        return False
    return isinstance(value.get('notes'), list)


def read_token(path: str | None = None) -> str | None:
    try:
        with open(path or token_file(), 'r', encoding='utf-8') as handle:
            token = handle.read().strip()
    except OSError:
        return None
    return token or None


def tokens_match(provided: str, expected: str) -> bool:
    if not provided or not expected:
        return False
    return hmac.compare_digest(provided.encode('utf-8'), expected.encode('utf-8'))


def song_path(root: str, song_id: str) -> str:
    if not valid_song_id(song_id):
        raise ValueError('bad-id')
    return os.path.join(overrides_dir(root), f'{song_id}.json')


def read_songs(root: str) -> dict:
    folder = overrides_dir(root)
    songs: dict = {}
    if not os.path.isdir(folder):
        return songs
    for name in sorted(os.listdir(folder)):
        if not name.endswith('.json'):
            continue
        song_id = name[:-5]
        if not valid_song_id(song_id):
            continue
        path = os.path.join(folder, name)
        try:
            with open(path, 'r', encoding='utf-8') as handle:
                payload = json.load(handle)
        except (OSError, json.JSONDecodeError):
            continue
        if is_song(payload, song_id):
            songs[song_id] = payload
    return songs


def backup_existing(root: str, song_id: str, now: datetime) -> str | None:
    source = song_path(root, song_id)
    if not os.path.isfile(source):
        return None
    folder = os.path.join(backups_dir(root), backup_stamp(now))
    os.makedirs(folder, exist_ok=True)
    dest = os.path.join(folder, f'{song_id}.json')
    if os.path.exists(dest):
        suffix = 2
        while os.path.exists(os.path.join(folder, f'{song_id}-{suffix}.json')):
            suffix += 1
        dest = os.path.join(folder, f'{song_id}-{suffix}.json')
    shutil.copy2(source, dest)
    return os.path.basename(folder)


def atomic_write(path: str, song: dict) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    temporary = f'{path}.tmp'
    with open(temporary, 'w', encoding='utf-8') as handle:
        json.dump(song, handle, ensure_ascii=False, indent=2)
        handle.write('\n')
        handle.flush()
        os.fsync(handle.fileno())
    os.replace(temporary, path)


def save_song(root: str, song: dict, now: datetime | None = None) -> str | None:
    song_id = song.get('id')
    if not isinstance(song_id, str) or not is_song(song, song_id):
        raise ValueError('bad-song')
    path = song_path(root, song_id)
    backed_up = backup_existing(root, song_id, now or datetime.now())
    atomic_write(path, song)
    return backed_up


def delete_song(root: str, song_id: str, now: datetime | None = None) -> str | None:
    if not valid_song_id(song_id):
        raise ValueError('bad-id')
    path = song_path(root, song_id)
    if not os.path.isfile(path):
        return None
    backed_up = backup_existing(root, song_id, now or datetime.now())
    os.remove(path)
    return backed_up


def split_song_path(raw_path: str) -> tuple[bool, str | None]:
    path = urlparse(raw_path).path.rstrip('/') or '/'
    if path == PREFIX:
        return True, None
    marker = PREFIX + '/'
    if not path.startswith(marker):
        return False, None
    song_id = unquote(path[len(marker):])
    if '/' in song_id or not valid_song_id(song_id):
        return True, ''
    return True, song_id


class SongOverrideHandler(BaseHTTPRequestHandler):
    root = app_root()
    token_path = token_file()

    def log_message(self, fmt: str, *args) -> None:
        # Request line and status only. Headers (including the admin token) are omitted.
        super().log_message(fmt, *args)

    def _send(self, status: int, payload: dict) -> None:
        body = json.dumps(payload).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(body)

    def _authorized(self) -> bool | None:
        expected = read_token(self.token_path)
        if expected is None:
            return None
        provided = self.headers.get('X-Piano-Admin-Token', '')
        return tokens_match(provided, expected)

    def _require_auth(self) -> bool:
        allowed = self._authorized()
        if allowed is None:
            self._send(503, {'error': 'admin-token-not-configured'})
            return False
        if not allowed:
            self._send(401, {'error': 'unauthorized'})
            return False
        return True

    def _read_json(self) -> dict | None:
        try:
            length = int(self.headers.get('Content-Length', '0'))
        except ValueError:
            self._send(400, {'error': 'bad-request'})
            return None
        if length < 0 or length > MAX_BODY:
            self._send(413, {'error': 'too-large'})
            return None
        raw = self.rfile.read(length)
        try:
            payload = json.loads(raw.decode('utf-8'))
        except (UnicodeError, json.JSONDecodeError):
            self._send(400, {'error': 'bad-json'})
            return None
        if not isinstance(payload, dict):
            self._send(400, {'error': 'bad-json'})
            return None
        return payload

    def do_GET(self) -> None:  # noqa: N802
        known, song_id = split_song_path(self.path)
        if not known or song_id is not None:
            self._send(404, {'error': 'not-found'})
            return
        self._send(200, {'songs': read_songs(self.root)})

    def do_PUT(self) -> None:  # noqa: N802
        known, song_id = split_song_path(self.path)
        if not known or not song_id:
            self._send(404, {'error': 'not-found'})
            return
        if not self._require_auth():
            return
        payload = self._read_json()
        if payload is None:
            return
        if payload.get('id') != song_id or not is_song(payload, song_id):
            self._send(400, {'error': 'bad-song'})
            return
        try:
            backed_up = save_song(self.root, payload)
        except ValueError:
            self._send(400, {'error': 'bad-song'})
            return
        except OSError:
            self._send(500, {'error': 'write-failed'})
            return
        self._send(200, {'ok': True, 'backedUp': backed_up is not None, 'backupFolder': backed_up})

    def do_DELETE(self) -> None:  # noqa: N802
        known, song_id = split_song_path(self.path)
        if not known or not song_id:
            self._send(404, {'error': 'not-found'})
            return
        if not self._require_auth():
            return
        path = song_path(self.root, song_id)
        if not os.path.isfile(path):
            self._send(404, {'error': 'not-found'})
            return
        try:
            backed_up = delete_song(self.root, song_id)
        except OSError:
            self._send(500, {'error': 'write-failed'})
            return
        self._send(200, {'ok': True, 'backedUp': backed_up is not None, 'backupFolder': backed_up})


def make_server(host: str, port: int, root: str, token_path: str) -> ThreadingHTTPServer:
    handler = type('BoundSongOverrideHandler', (SongOverrideHandler,), {'root': root, 'token_path': token_path})
    return ThreadingHTTPServer((host, port), handler)


def main() -> None:
    host = os.environ.get('PIANO_BIND', '127.0.0.1')
    port = int(os.environ.get('PIANO_PORT', '8787'))
    root = app_root()
    os.makedirs(overrides_dir(root), exist_ok=True)
    os.makedirs(backups_dir(root), exist_ok=True)
    server = make_server(host, port, root, token_file())
    server.serve_forever()


if __name__ == '__main__':
    main()
