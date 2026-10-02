# VM設定とdeploy

```text
script/setup-cloudflare.sh   → ansible/tunnel.yml（手動の薄い入口）
ansible/tunnel.yml           → tunnel/files/setup-vm.sh（VM側connector設定）
GitHub Actions Deploy       → ansible/deploy.yml（clone・build・systemd）
```

Tunnelとアプリdeployは別playbookです。deployのたびにTunnelを変更しません。
CloudflareのTunnel自体の作成、DNS、Accessの変更は含みません。

## 前提

- 操作側: Ansible Core 2.19以上、SSH。例: `brew install ansible`。
- VM: Ubuntu/Debian、systemd >= 247、SSHで接続可能。
- `inventory.ini` の `ardan_vm` はSSH configの `ardan` に接続します。
- 鍵認証とsudo権限。手動では `--ask-pass --ask-become-pass` も利用可能。
  SSHパスワード認証には操作側のsshpass等、利用するAnsible SSH pluginの依存も必要です。
- deploy前に **Node.js >= 22 とnpmを /usr/bin に用意**してください。
  このplaybookはNode.jsの配布元追加やインストールは行いません。
- repoはHTTPSでcloneします。private repoの場合はVM側のGit認証を別途用意してください。
- 通常のAnsibleホスト鍵検証は維持します。正しいホスト鍵を事前に確認してください。

## Tunnel導入

CloudflareでVM専用のリモート管理型TunnelとTunnel tokenを用意してください。
API tokenとは別物です。別VMのTunnel tokenは流用しないでください。

公開前にCloudflare APIまたは管理画面で次を設定します。

- ホスト名: `ardan.taisey.dev`
- ingress: `ssh://127.0.0.1:22`、末尾は `http_status:404`
- DNS: `<TUNNEL_ID>.cfargotunnel.com` を指すproxied CNAME
- Access: 同じホスト名のSelf-hosted applicationと、本人だけを許可するAllowポリシー

**Accessの保護を用意してから公開してください。**

```sh
# Tunnel tokenを非表示で入力
./script/setup-cloudflare.sh
# 同じ処理を直接呼ぶ場合
ansible-playbook -i ansible/inventory.ini ansible/tunnel.yml
# SSH接続先の上書き
./script/setup-cloudflare.sh -e ansible_host=192.168.151.204 -e ansible_user=ubuntu
# 入力検証のみ。VM接続・変更はしません
./script/setup-cloudflare.sh --check
```

トークンはAnsibleの `vars_prompt: private: true` で入力します。
自動実行ではrepo外の権限0600のYAMLファイルに `cloudflare_tunnel_token` を保存し、
`-e @/absolute/path/to/tunnel-secrets.yml` で渡してください。値をコマンド引数へ直接書かないでください。
トークン処理のタスクは `no_log: true`。秘密ファイルをGitやチャットへ貼らないでください。

VM側の一時トークンは成功・失敗時ともAnsibleの `always` で削除します。
強制終了や接続断の場合は一時ファイルが残る可能性があるため確認してください。
既存の `cloudflared.service` がある場合は上書きせず失敗します。
他の名前のconnectorやコンテナも実行前に確認してください。

配置先:
- `/etc/cloudflared-ardan/tunnel-token`: root所有、0600（親dir 0700）
- `/etc/systemd/system/cloudflared-ardan.service`

systemd `DynamicUser` と `LoadCredential` を使い、unitやプロセス引数にトークンを埋め込みません。
cloudflaredは必要時だけ署名付きapt repositoryからインストールします。
適用後にenabled/activeと `127.0.0.1:20241/ready` を確認します。
再実行は専用unit/トークンを更新して再起動します。自動rollbackはありません。
**connector接続成功はDNS・SSH経路・Access保護の成功ではありません。**

```sh
ssh ardan 'sudo systemctl status cloudflared-ardan.service --no-pager'
ssh ardan 'sudo journalctl -u cloudflared-ardan.service -n 50 --no-pager'
ssh ardan 'sudo systemctl disable --now cloudflared-ardan.service'
```

クライアント側では別SSH aliasを用意します。

```sshconfig
Host ardan-cloudflare
  HostName ardan.taisey.dev
  User ubuntu
  ProxyCommand /absolute/path/to/cloudflared access ssh --hostname %h
```

`ssh ardan-cloudflare` で本人のAccessログイン後にVMのSSH認証が行われること、
許可外のユーザーが拒否されることを別途検証してください。

## アプリdeploy

```sh
ansible-playbook -i ansible/inventory.ini ansible/deploy.yml \
  -e ardan_version=main \
  -e ardan_env_source=/absolute/path/outside/repo/ardan.env
```

- `ardan` system userを作成し、`/opt/ardan` にrepoをclone/update。
- `npm ci` → `npm run build` → `ardan.service` の有効化と再起動。
- `.env` 相当の秘密は `/etc/ardan/ardan.env` にroot所有0600で保存。
  systemdが読み込んでから権限を落とすため、サービスユーザーにファイル読取権限は不要です。
- 次回以降は既存のenvを使えます。初回は `ardan_env_source` が必要です。
- 起動後に `systemctl is-active` を読み戻します。これはプロセス確認のみで、
  Discordログイン・Sheets権限・定時Batchの成功までは保証しません。
- in-place deployなのでbuild中も旧プロセスは動作し、途中失敗時の自動rollbackはありません。
  deploy前に既存の別名サービスで同じBotを動かしていないか確認してください。

## ローカル検証

```sh
bash -n script/setup-cloudflare.sh ansible/tunnel/files/setup-vm.sh
python3 script/tests/test_setup_cloudflare.py
python3 ansible/tests/test_tunnel.py
# PyYAML入りのAnsibleと同じPython環境で実行
python3 ansible/tests/test_workflow.py
ansible-playbook -i ansible/inventory.ini ansible/tunnel.yml --syntax-check
ansible-playbook -i ansible/inventory.ini ansible/deploy.yml --syntax-check
```

ローカル検証は実VMのapt/systemd・Cloudflare・Discord統合を代替しません。
