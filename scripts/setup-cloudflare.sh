#!/usr/bin/env bash
set -euo pipefail
root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
exec ansible-playbook -i "$root/ansible/inventory.ini" "$root/ansible/tunnel.yml" "$@"
