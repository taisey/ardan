import type { DiscordCommand } from './types.js';

export const remindUnansweredCommand: DiscordCommand = {
  definition: {
    name: 'remind_unanswered',
    description: '録音日程の未回答者または未確定の日程をリマインドします',
    type: 1,
  },
  async execute({ scheduling, followUp }): Promise<void> {
    try {
      const reminded = await scheduling.remindUnansweredRecordingPollVoters();
      await followUp(reminded.length
        ? `未回答リマインドを日程調整スレッドに送信しました。対象: ${reminded.length}人。`
        : '未回答者はいません。投票中の日程がある場合、集計結果は初回のみ投稿し、以後は実行のたびにメンショングループへリマインドします。');
    } catch (error) {
      console.error('Unanswered recording-poll reminder failed', error);
      await followUp('未回答リマインドに失敗しました。Botの権限と日程シート、Pollの状態を確認してください。');
    }
  },
};
