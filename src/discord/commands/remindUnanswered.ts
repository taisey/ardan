import type { DiscordCommand } from './types.js';

export const remindUnansweredCommand: DiscordCommand = {
  definition: {
    name: 'remind_unanswered',
    description: '録音日程の投票に未回答のメンバーをリマインドします',
    type: 1,
  },
  async execute({ scheduling, followUp }): Promise<void> {
    try {
      const reminded = await scheduling.remindUnansweredRecordingPollVoters();
      await followUp(reminded.length
        ? `未回答リマインドを日程調整スレッドに送信しました。対象: ${reminded.length}人。`
        : '通知対象はありません（投票中の日程なし、または全員回答済み）。');
    } catch (error) {
      console.error('Unanswered recording-poll reminder failed', error);
      await followUp('未回答リマインドに失敗しました。Botの権限と日程シート、Pollの状態を確認してください。');
    }
  },
};

