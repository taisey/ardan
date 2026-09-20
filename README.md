# Ardan recording scheduler

Discord HTTP Interactions を入口にして、録音日程の Discord Poll を作成し、Google Sheets に記録する Node.js / TypeScript アプリです。HTTP API 契約は [src/spec/openapi.yaml](src/spec/openapi.yaml) を原本とし、`src/generated/` は `npm run generate` でのみ更新します。

MIT License で公開しています。依存ライブラリのライセンスは各パッケージに帰属します。

## Setup

```sh
cp .env.example .env
npm install
npm run build
```

`.env` に値を設定します。`GOOGLE_SERVICE_ACCOUNT_JSON` はサービスアカウント JSON 全体を一行の JSON として入れてください。たとえば private key の改行は JSON 内で `\\n` のまま保存します。対象の Spreadsheet はサービスアカウントのメールアドレスに編集者として共有してください。

```sh
npm run dev
# or after build
npm start
```

Discord Developer Portal の Interactions Endpoint URL に `https://<public-host>/interactions` を設定します。Discord のアプリケーションコマンドには次を登録してください。

- `create_recording_date_poll`: `title` (string), `candidate_dates` (comma-separated string, e.g. `2026-10-01,2026-10-08`)

`end_date` が今日より前の行を除外し、残りで最も新しい `start_date` の行を判定対象にします。対象行の `status` が空欄なら Poll を作成して `in_progress` に更新し、`in_progress` または `done` なら何もしません。HTTP の日付は日付のみの `YYYY-MM-DD` で、時刻ではありません。

日程確定時は `in_progress` のうち最も新しい `start_date` の行を更新します。`fix_date` がその行の `start_date`〜`end_date` の範囲外なら、Sheets を変更せずエラーにします。

## Batches

どちらも HTTP サーバーを起動せず、一度処理して終了します。

```sh
npm run batch:create-recording-date-poll -- --title '10月録音' --candidate-dates 2026-10-01,2026-10-08
```

コンパイル後は `node --env-file-if-exists=.env dist/batch/createRecordingDatePoll.js` でも実行できます。

## Current Sheets schema

初回実行時に `recording_schedule` タブを作成し、`start_date`, `end_date`, `fix_date`, `status` の4列を使用します。候補日や Discord のメッセージ ID は保存しません。

Discord Poll API は投票期間を必須にするため、現状は最小の1時間です。

## Verification

```sh
npm run generate
npm run typecheck
npm run build
npm test
```
