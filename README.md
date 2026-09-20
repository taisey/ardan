# Ardan recording scheduler

Discord Gateway を入口にして、録音日程の Discord Poll を作成し、Google Sheets に記録する Node.js / TypeScript アプリです。

MIT License で公開しています。依存ライブラリのライセンスは各パッケージに帰属します。

## Setup

```sh
cp .env.example .env
npm install
npm run build
```

`.env` に値を設定します。`GOOGLE_SERVICE_ACCOUNT_JSON` はサービスアカウント JSON 全体を一行の JSON として入れてください。たとえば private key の改行は JSON 内で `\\n` のまま保存します。対象の Spreadsheet はサービスアカウントのメールアドレスに編集者として共有してください。

`GOOGLE_SHEET_GID` には対象タブのURL末尾にある `gid` を設定します。例: `.../edit#gid=0` なら `0` です。

```sh
npm run dev
# or after build
npm start
```

Discord Developer Portal の Interactions Endpoint URL は空欄にします。Slash Command は `DISCORD_GUILD_ID` に指定したサーバーだけへ同期します。

- `create_recording_date_poll`: 引数なし。最新の未処理行の `start_date`〜`end_date` を候補日としてPollを作成します。
- `aggregate_poll_result`: 作成済みの各日付Pollを、○・△・×の人数と投票者で集計します。
- `fix_recording_date`: `date` に `YYYY-MM-DD` 形式で候補日を渡して録音日を確定します。

コマンド定義は `src/discord/commands/` が原本です。`main` へ反映した後に次を実行すると、追加・更新に加えて原本から削除したコマンドも対象サーバーから削除されます。

```sh
npm run discord:sync-commands
```

`end_date` が今日より前の行を除外し、残りで最も新しい `start_date` の行を判定対象にします。対象行の `status` が空欄なら Poll を作成して `in_progress` に更新し、`in_progress` または `done` なら何もしません。HTTP の日付は日付のみの `YYYY-MM-DD` で、時刻ではありません。

最初に `DISCORD_MENTION_ROLE_ID` のロールmention、`次回録音の日程調整`、`yyyy/mm/dd - yyyy/mm/dd` を投稿し、そのメッセージのスレッド内へ候補日のPollを作成します。日付ごとのPollは、○（参加可能）・△（調整可）・×（不可）の単一選択です。投票期間は7日間です。

日程確定時は `in_progress` のうち最も新しい `start_date` の行を更新します。`fix_date` がその行の `start_date`〜`end_date` の範囲外なら、Sheets を変更せずエラーにします。

## Batches

どちらも HTTP サーバーを起動せず、一度処理して終了します。

```sh
npm run batch:create-recording-date-poll
```

コンパイル後は `node --env-file-if-exists=.env dist/batch/createRecordingDatePoll.js` でも実行できます。Gatewayプロセスは `TZ` を基準に、毎時 `xx:00:00` に同じ処理を実行します。起動直後には実行しません。

## Current Sheets schema

対象タブの1行目には `start_date`, `end_date`, `fix_date`, `status`, `metadata` の5列を使用します。`metadata` には拡張用JSONを保存し、現在は日付ごとのDiscord PollメッセージIDを格納します。

Discord Poll API は投票期間を必須にするため、投票期間は7日間です。

## Verification

```sh
npm run generate
npm run typecheck
npm run build
npm test
```
