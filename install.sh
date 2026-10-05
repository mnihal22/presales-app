#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Costing & Proposal Hub — one-command installer for Ubuntu 24.04 (bare metal)
#
#   ./install.sh            install dependencies, build, create .env
#   ./install.sh --service  also install + start a systemd service
#
# For Docker instead, see README.md (docker compose up -d --build).
# ---------------------------------------------------------------------------
set -euo pipefail
cd "$(dirname "$0")"

echo "==> Checking Node.js..."
if ! command -v node >/dev/null 2>&1 || [ "$(node -v | cut -d. -f1 | tr -d v)" -lt 20 ]; then
  echo "    Node.js 20+ not found — installing via NodeSource (needs sudo)..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
echo "    $(node -v) / npm $(npm -v)"

echo "==> Installing dependencies..."
npm install --no-audit --no-fund

echo "==> Building frontend..."
npm run build

if [ ! -f .env ]; then
  echo "==> Creating .env with a random JWT_SECRET..."
  SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
  sed "s/replace-with-a-long-random-string/$SECRET/" .env.example > .env
else
  echo "==> .env already exists — keeping it."
fi

PORT=$(grep -E '^PORT=' .env 2>/dev/null | cut -d= -f2 || true)
PORT=${PORT:-8787}

if [ "${1:-}" = "--service" ]; then
  echo "==> Installing systemd service 'costing-hub'..."
  SERVICE_FILE=/etc/systemd/system/costing-hub.service
  sudo tee "$SERVICE_FILE" >/dev/null <<EOF
[Unit]
Description=Costing & Proposal Hub
After=network.target

[Service]
WorkingDirectory=$(pwd)
EnvironmentFile=$(pwd)/.env
ExecStart=$(command -v npx) tsx server/index.ts
Restart=always
RestartSec=3
User=$(whoami)

[Install]
WantedBy=multi-user.target
EOF
  sudo systemctl daemon-reload
  sudo systemctl enable --now costing-hub
  echo "    Service installed and started."
  echo "    Manage with: sudo systemctl {status|restart|stop} costing-hub"
else
  echo
  echo "==> Done. Start the app with:"
  echo "      npm start"
  echo "    (or re-run: ./install.sh --service  to run it as a system service)"
fi

echo
echo "==> App will be available at:  http://$(hostname -I | awk '{print $1}'):${PORT}"
echo "    First login: admin / admin123  — change it immediately after logging in."
