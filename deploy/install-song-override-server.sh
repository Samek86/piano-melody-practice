#!/usr/bin/env bash
# Install the localhost song-override service under /home/ubuntu/apps/piano.
# Does not create a token, print a token, or change GitHub.
# Run on the app host: sudo bash deploy/install-song-override-server.sh
set -euo pipefail

APP_ROOT=/home/ubuntu/apps/piano
REPO_ROOT=$(cd "$(dirname "$0")/.." && pwd)

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run with sudo so the systemd unit can be installed." >&2
  exit 1
fi

install -d -m 755 -o ubuntu -g ubuntu "$APP_ROOT/server" "$APP_ROOT/song-overrides" "$APP_ROOT/song-backups"
install -m 755 -o ubuntu -g ubuntu "$REPO_ROOT/server/song_override_server.py" "$APP_ROOT/server/song_override_server.py"
install -m 644 "$REPO_ROOT/deploy/piano-song-overrides.service" /etc/systemd/system/piano-song-overrides.service
systemctl daemon-reload
systemctl enable --now piano-song-overrides.service

echo "Service piano-song-overrides is installed and bound to 127.0.0.1:8787."
echo "Add deploy/nginx-song-overrides.conf.example to the piano.tsutaai.com server block, then:"
echo "  sudo nginx -t && sudo systemctl reload nginx"
if [[ ! -s "$APP_ROOT/.secrets/admin-token" ]]; then
  echo "Admin token file is missing. Create it on the server and do not commit it:"
  echo "  sudo install -d -m 700 -o ubuntu -g ubuntu $APP_ROOT/.secrets"
  echo "  sudo -u ubuntu bash -c 'umask 077 && openssl rand -hex 32 > $APP_ROOT/.secrets/admin-token'"
  echo "  sudo systemctl restart piano-song-overrides"
  echo "Read that file once on the server and type it into the admin 저장 prompt."
fi
