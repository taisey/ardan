#!/usr/bin/env bash
# Invoked remotely by setup-cloudflare.sh, not normally run directly.
set -euo pipefail
[[ $EUID -eq 0 ]] || { printf 'Run with sudo\n' >&2; exit 1; }
[[ $# -eq 1 && -s "$1" ]] || { printf 'Missing token file\n' >&2; exit 1; }
token_file=$1
[[ -d /run/systemd/system ]] || { printf 'systemd is required\n' >&2; exit 1; }
command -v apt-get >/dev/null || { printf 'Ubuntu/Debian with apt-get is required\n' >&2; exit 1; }
version=$(systemctl --version | head -n 1)
version=${version#systemd }
version=${version%% *}
[[ "$version" =~ ^[0-9]+$ && "$version" -ge 247 ]] || { printf 'systemd >= 247 is required\n' >&2; exit 1; }
# Never replace the standard connector or accidentally attach a second one.
if systemctl cat cloudflared.service >/dev/null 2>&1; then
  printf 'Existing cloudflared.service found; refusing to modify this VM. Review it first.\n' >&2
  exit 1
fi
export DEBIAN_FRONTEND=noninteractive
if ! command -v cloudflared >/dev/null; then
  apt-get update
  apt-get install -y ca-certificates curl
  install -d -m 0755 /usr/share/keyrings
  key=$(mktemp)
  trap 'rm -f -- "$key"' EXIT
  curl -fsSL --proto '=https' --tlsv1.2 https://pkg.cloudflare.com/cloudflare-main.gpg -o "$key"
  install -m 0644 "$key" /usr/share/keyrings/cloudflare-main.gpg
  rm -f -- "$key"
  trap - EXIT
  printf '%s\n' 'deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared any main' > /etc/apt/sources.list.d/cloudflared.list
  apt-get update
  apt-get install -y cloudflared
fi
binary=$(command -v cloudflared)
[[ "$binary" =~ ^/[a-zA-Z0-9_./-]+$ ]] || { printf 'Unsupported binary path\n' >&2; exit 1; }
"$binary" tunnel run --help | grep -q -- '--token-file' || {
  printf 'cloudflared is too old: upgrade to a version supporting --token-file\n' >&2; exit 1;
}
command -v curl >/dev/null || apt-get install -y curl ca-certificates
install -d -m 0700 /etc/cloudflared-ardan
# Atomic replacement prevents a partial token on interrupted transfer.
install -m 0600 "$token_file" /etc/cloudflared-ardan/tunnel-token.new
mv /etc/cloudflared-ardan/tunnel-token.new /etc/cloudflared-ardan/tunnel-token
unit_dir=$(mktemp -d)
unit=$unit_dir/cloudflared-ardan.service
trap 'rm -rf -- "$unit_dir"' EXIT
cat > "$unit" <<UNIT
[Unit]
Description=Ardan Cloudflare Tunnel connector
Wants=network-online.target
After=network-online.target

[Service]
Type=simple
DynamicUser=yes
LoadCredential=tunnel-token:/etc/cloudflared-ardan/tunnel-token
ExecStart=$binary tunnel --no-autoupdate --metrics 127.0.0.1:20241 run --token-file %d/tunnel-token
Restart=on-failure
RestartSec=5s
NoNewPrivileges=yes
ProtectSystem=strict
ProtectHome=yes
PrivateTmp=yes
ProtectKernelTunables=yes
ProtectKernelModules=yes
ProtectControlGroups=yes
RestrictSUIDSGID=yes
UMask=0077

[Install]
WantedBy=multi-user.target
UNIT
systemd-analyze verify "$unit"
install -m 0644 "$unit" /etc/systemd/system/cloudflared-ardan.service
systemd-analyze verify /etc/systemd/system/cloudflared-ardan.service
systemctl daemon-reload
systemctl enable cloudflared-ardan.service
systemctl restart cloudflared-ardan.service
systemctl is-enabled --quiet cloudflared-ardan.service
systemctl is-active --quiet cloudflared-ardan.service
# /ready returns 200 only after a connector has an active Cloudflare connection.
for attempt in {1..30}; do
  if curl -fsS --max-time 2 http://127.0.0.1:20241/ready >/dev/null 2>&1; then
    printf 'cloudflared-ardan.service enabled, active, and connected to Cloudflare.\n'
    printf 'DNS/ingress and Access authorization still require separate verification.\n'
    exit 0
  fi
  sleep 2
done
printf 'Connector readiness timed out. Inspect: sudo journalctl -u cloudflared-ardan.service\n' >&2
exit 1
