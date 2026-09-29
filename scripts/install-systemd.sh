#!/usr/bin/env bash
set -euo pipefail

readonly REPOSITORY_URL='https://github.com/taisey/ardan.git'
readonly APP_USER='ardan'
readonly APP_GROUP='ardan'
readonly APP_DIRECTORY="${APP_DIRECTORY:-/opt/ardan}"
readonly SERVICE_NAME='ardan'
readonly REMINDER_SERVICE_NAME='ardan-editing-reminder'
readonly REMINDER_TIMER_NAME='ardan-editing-reminder.timer'
readonly NODE_BIN="${NODE_BIN:-/usr/bin/node}"
readonly NPM_BIN="${NPM_BIN:-/usr/bin/npm}"
readonly BUILD_NODE_OPTIONS="${BUILD_NODE_OPTIONS:---max-old-space-size=1536}"

fail() {
  echo "Error: $*" >&2
  exit 1
}

if [[ ${EUID} -ne 0 ]]; then
  fail "Run this script with sudo."
fi

command -v systemctl >/dev/null || fail 'systemd is required.'
[[ -x "$NODE_BIN" ]] || fail "Node.js was not found at $NODE_BIN. Install Node.js 22+ system-wide, or set NODE_BIN to its absolute path."
[[ -x "$NPM_BIN" ]] || fail "npm was not found at $NPM_BIN. Install npm system-wide, or set NPM_BIN to its absolute path."
[[ "$("$NODE_BIN" --version)" =~ ^v(2[2-9]|[3-9][0-9])\. ]] || fail 'Node.js 22 or newer is required.'

if ! id -u "$APP_USER" >/dev/null 2>&1; then
  useradd --system --user-group --no-create-home --home-dir "$APP_DIRECTORY" --shell /usr/sbin/nologin "$APP_USER"
fi

if [[ ! -e "$APP_DIRECTORY" ]]; then
  git clone "$REPOSITORY_URL" "$APP_DIRECTORY"
elif [[ ! -d "$APP_DIRECTORY/.git" ]]; then
  fail "$APP_DIRECTORY already exists and is not an Ardan Git repository."
fi

chown -R "$APP_USER:$APP_GROUP" "$APP_DIRECTORY"

if [[ ! -f "$APP_DIRECTORY/.env" ]]; then
  install --owner="$APP_USER" --group="$APP_GROUP" --mode=600 "$APP_DIRECTORY/.env.example" "$APP_DIRECTORY/.env"
  echo "Created $APP_DIRECTORY/.env. Set its required values, then run this script again."
  exit 0
fi

chmod 600 "$APP_DIRECTORY/.env"
chown "$APP_USER:$APP_GROUP" "$APP_DIRECTORY/.env"

runuser -u "$APP_USER" -- "$NPM_BIN" --prefix "$APP_DIRECTORY" ci
runuser -u "$APP_USER" -- env NODE_OPTIONS="$BUILD_NODE_OPTIONS" "$NPM_BIN" --prefix "$APP_DIRECTORY" run build

cat >"/etc/systemd/system/$SERVICE_NAME.service" <<EOF
[Unit]
Description=Ardan Discord recording scheduler
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$APP_USER
Group=$APP_GROUP
WorkingDirectory=$APP_DIRECTORY
Environment=NODE_ENV=production
ExecStart=$NODE_BIN --env-file-if-exists=.env dist/gateway/main.js
Restart=always
RestartSec=5
TimeoutStopSec=30

[Install]
WantedBy=multi-user.target
EOF

cat >"/etc/systemd/system/$REMINDER_SERVICE_NAME.service" <<EOF
[Unit]
Description=Ardan editing schedule reminder
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
User=$APP_USER
Group=$APP_GROUP
WorkingDirectory=$APP_DIRECTORY
Environment=NODE_ENV=production
ExecStart=$NODE_BIN --env-file-if-exists=.env dist/batch/remindEditingSchedule.js
EOF

cat >"/etc/systemd/system/$REMINDER_TIMER_NAME" <<EOF
[Unit]
Description=Run Ardan editing schedule reminder daily at midnight

[Timer]
OnCalendar=*-*-* 00:00:00
Persistent=true
Unit=$REMINDER_SERVICE_NAME.service

[Install]
WantedBy=timers.target
EOF

systemctl daemon-reload
systemctl enable --now "$SERVICE_NAME.service" "$REMINDER_TIMER_NAME"
systemctl --no-pager --full status "$SERVICE_NAME.service"
systemctl --no-pager list-timers "$REMINDER_TIMER_NAME"
