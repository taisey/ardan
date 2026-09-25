# Ardan recording scheduler

Discordで録音日の候補を募り、Google Sheetsを状態の原本として管理するNode.js / TypeScriptアプリです。Discord GatewayでSlash Commandを受け取り、日付ごとのPollをスレッドへ投稿します。

```text
Google Sheets の日程行
  └─ /create_recording_date_poll または定時Batch
       └─ 親メッセージ・スレッド・日付ごとのPollをDiscordへ作成
            └─ /aggregate_poll_result で投票を集計
                 └─ /fix_recording_date でSheetsの日程を確定
```

MIT Licenseで公開しています。依存ライブラリのライセンスは各パッケージに帰属します。

## Setup

```sh
cp .env.example .env
npm install
npm run build
```

`.env` に次の値を設定します。

| 変数 | 用途 |
| --- | --- |
| `TZ` | 定時Batchのタイムゾーン。通常は `Asia/Tokyo` |
| `DISCORD_BOT_TOKEN` | Bot Token |
| `DISCORD_APPLICATION_ID` | Discord Application ID |
| `DISCORD_GUILD_ID` | Slash Commandを登録するDiscordサーバーID |
| `DISCORD_NOTICE_CHANNEL_ID` | 日程調整の親メッセージを投稿するチャンネルID |
| `DISCORD_MENTION_ROLE_ID` | 親メッセージでmentionするロールID |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | サービスアカウントJSON全体を1行のJSONで設定。private keyの改行はJSON内で `\n` のまま保存 |
| `GOOGLE_SPREADSHEET_ID` | 対象SpreadsheetのID |
| `GOOGLE_RECORDING_SCHEDULE_SHEET_GID` | 録画日程タブのURL末尾にある `gid`。例: `.../edit#gid=0` なら `0` |

Spreadsheetはサービスアカウントのメールアドレスに編集者として共有します。Botには通知チャンネルで、メッセージ送信・公開スレッド作成・スレッド内メッセージ送信の権限が必要です。

```sh
npm run dev
# コンパイル後
npm start
```

Discord Developer PortalのInteractions Endpoint URLは空欄にします。

## Slash Commandの同期と利用

コマンド定義の原本は `src/discord/commands/` です。次を実行すると、`DISCORD_GUILD_ID` のGuildへ一覧同期します。コードから削除したコマンドもGuildから削除されます。

```sh
npm run discord:sync-commands
```

| Command | 内容 |
| --- | --- |
| `/create_recording_date_poll` | 最新の作成対象日程についてPollを作成 |
| `/aggregate_poll_result` | 日付ごとの○・△・×と投票者を集計し、候補日を最後に表示 |
| `/fix_recording_date date:YYYY/MM/DD` | 進行中の日程を指定日で確定 |

Guild Commandなので、同期結果は指定したDiscordサーバーだけに即時反映されます。

## 日程の状態遷移

Sheetsの各行は次の5列です。

```text
start_date | end_date | fixed_date | status | metadata
```

- `start_date` と `end_date` は `YYYY/MM/DD` の候補範囲です。
- `status` が空欄の行は未開始、`in_progress` は投票中、`done` は確定済み、`canceled` は期限切れで取り消し済みです。
- `metadata` は拡張用JSONです。現在はDiscordスレッドIDと日付ごとのPollメッセージIDを保存します。

### 作成処理: `/create_recording_date_poll` とBatch

Slash Commandと `batch:create-recording-date-poll` は同じ作成処理を呼びます。作成前にすべての `in_progress` 行を確認します。`end_date` が昨日以前の行は `canceled` に更新し、今日以降の `in_progress` 行が1件でもあれば新規作成しません。確定済み（`done`）行のうち最新の `end_date` が今日以降の場合も、新規作成しません。作成可能な場合、対象候補は `end_date` が今日以降の未開始行のうち、最も早く終了する1行です。

```text
対象行なし または end_date < 今日
  └─ skip

期限切れの in_progress 行あり
  └─ status を canceled に更新して次の判定へ

期限内の in_progress 行あり
  └─ skip

done 行の最新 end_date が今日以降
  └─ skip

対象行が status 空欄
  └─ status を in_progress に更新
       └─ ロールmention・タイトル・候補範囲の親メッセージを投稿
            └─ そのスレッドへ各候補日の○・△・× Pollを作成

```

Pollは各日付につき単一選択で、○（参加可能）・△（調整可）・×（不可）を選べます。Pollの回答期間とスレッドの自動アーカイブは7日間です。

作成中にDiscordやSheetsでエラーになった場合、処理は失敗としてログに出ます。`in_progress` への更新後に失敗した行は自動再作成されないため、内容を確認してから手動で状態を調整してください。

### 集計と確定

`/aggregate_poll_result` は最新の `in_progress` 行に記録されたPollを順番に取得し、○・△・×の人数と表示名を日付ごとに出します。Discord APIの429応答時は `retry_after` を待って再試行します。

集計の末尾には候補日を表示します。×が0人の日に絞り、○の最多日が同率で複数ならその日だけ、最多日が1日なら2位（同率を含む）までを候補にします。

`/fix_recording_date` は、最新の `in_progress` 行について指定日が候補範囲内なら、次のように更新します。

```text
in_progress
  └─ fixed_date = 指定日、status = done
       └─ 最新の done 行の end_date を過ぎるまで、新規 Poll 作成を skip
```

候補範囲外の日付、または `in_progress` の行がない場合はSheetsを更新しません。

## Batchと定時実行

手動BatchはHTTPサーバーを起動せず、一度作成処理を実行して終了します。

```sh
npm run batch:create-recording-date-poll
```

Gatewayプロセスは `TZ` を基準に、毎時 `xx:00:00` に同じ作成処理を実行します。起動直後には実行しません。

## 編集スケジュール

同じSpreadsheetに次の3タブを用意します。各タブの1行目はヘッダーです。タブは名前ではなく、URL末尾の `gid`（例: `.../edit#gid=123` の `123`）で指定します。

```text
editing_schedule
# | start_due_week | assign | status | metadata

editing_schedule_assign_order
order | name

user
name | discord_id
```

`status` は編集中の `in_progress` と、公開済みの `done` のいずれかです。

`metadata` はJSON形式の拡張情報です。最初のリマインド時に `{"discord":{"reminderThreadId":"..."}}` が自動保存され、同じ回への以後のリマインドはそのDiscordスレッドに投稿されます。

`GOOGLE_EDITING_SOURCE_FOLDER_ID` には、動画ごとの `#123` 形式の名前を持つDriveフォルダまたはファイルが置かれた親フォルダIDを設定します。サービスアカウントには、そのフォルダの閲覧権限とSpreadsheetの編集権限が必要です。

```env
GOOGLE_EDITING_SOURCE_FOLDER_ID=
GOOGLE_EDITING_SCHEDULE_SHEET_GID=
GOOGLE_EDITING_SCHEDULE_ASSIGN_ORDER_SHEET_GID=
GOOGLE_USERS_SHEET_GID=
```

```sh
npm run batch:sync-editing-schedule
npm run batch:remind-editing-schedule
```

`batch:sync-editing-schedule` は、Driveで見つけた未登録の `#数字` を追加し、最新の `done` 行の担当者の次の人を `editing_schedule_assign_order` の順で割り当てます。`start_due_week` は最新の `done` 行の翌週（月曜）にし、その週に入っている・過ぎている場合は次週にします。複数件を一度に追加した場合は担当者と週を1件ずつ順送りにします。

`batch:remind-editing-schedule` は、開始予定週が当週の `in_progress` 行だけを `user` タブのDiscord IDへメンションして通知チャンネルにリマインドします。過去週の未完了行は自動通知しません。日次実行はcronやsystemd timerなどから、それぞれを必要な時刻に呼び出してください。

`/sync_editing_schedule` は同期だけ、`/remind_editing_schedule` はリマインドだけを手動実行します。`/notify_editing_published episode:#123` は公開通知を投稿し、対象行の `status` を `done` に更新します。追加後はコマンド定義も同期してください。

```sh
npm run discord:sync-commands
```

## Verification

```sh
npm run generate
npm run typecheck
npm run build
npm test
```
