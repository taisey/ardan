# 手動実行の入口

`setup-cloudflare.sh` は `ansible/tunnel.yml` を呼ぶだけの薄いラッパーです。
Tunnel導入、deploy、前提条件、CI設定は [ansible/README.md](../ansible/README.md) にまとめています。

```sh
./scripts/setup-cloudflare.sh
# Ansibleのオプションをそのまま渡せます
./scripts/setup-cloudflare.sh --ask-pass --ask-become-pass
```

Tunnel tokenはAnsibleが非表示で入力を求めます。
以前の独自オプション `--token-file` / `--host` / `--dry-run` は廃止し、Ansible標準オプションに統一しました。
