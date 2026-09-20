import type { DiscordCommand } from './types.js';

export const createRecordingDatePollCommand: DiscordCommand = {
  definition: {
    name: 'create_recording_date_poll',
    description: '次回録音の日程の投票を作成します',
    type: 1,
  },
  async execute({ scheduling, followUp }): Promise<void> {
    try {
      const result = await scheduling.createRecordingDatePoll();
      await followUp(result.created ? '投票を作成しました。' : '作成対象の日程がないため、投票を作成しませんでした。');
    } catch (error) {
      console.error('Discord interaction operation failed', error);
      await followUp('処理に失敗しました。設定とログを確認してください。');
    }
  },
};
