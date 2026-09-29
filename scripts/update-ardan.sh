#!/usr/bin/env bash
set -euo pipefail

readonly APP_DIRECTORY='/opt/ardan'
readonly APP_USER='ardan'
readonly SERVICE_NAME='ardan'
readonly REMINDER_SERVICE_NAME='ardan-editing-reminder'
readonly REMINDER_TIMER_NAME='ardan-editing-reminder.timer'
readonly NPM_BIN='/usr/bin/npm'
readonly BUILD_NODE_OPTIONS='--max-old-space-size=1536'

fail() {
  echo "Error: $*" >&2
  exit 1
}

[[ ${EUID} -eq 0 ]] || fail 'Run this script with sudo.'
[[ -d "$APP_DIRECTORY/.git" ]] || fail "$APP_DIRECTORY is not an Ardan Git repository."
[[ -x "$NPM_BIN" ]] || fail "npm was not found at $NPM_BIN."
[[ "$(runuser -u "$APP_USER" -- git -C "$APP_DIRECTORY" branch --show-current)" == 'main' ]] \
  || fail "$APP_DIRECTORY must be on the main branch before updating."

runuser -u "$APP_USER" -- git -C "$APP_DIRECTORY" pull --ff-only origin main
runuser -u "$APP_USER" -- "$NPM_BIN" --prefix "$APP_DIRECTORY" ci
runuser -u "$APP_USER" -- env NODE_OPTIONS="$BUILD_NODE_OPTIONS" "$NPM_BIN" --prefix "$APP_DIRECTORY" run build
systemctl daemon-reload
systemctl restart "$SERVICE_NAME.service"
systemctl restart "$REMINDER_TIMER_NAME"
systemctl --no-pager --full status "$SERVICE_NAME.service"
systemctl --no-pager list-timers "$REMINDER_TIMER_NAME"
