import { formatResults, splitMessages } from '../../services/scheduling/formatPollResults.js';
import type { DiscordCommand } from './types.js';

export const aggregatePollResultCommand: DiscordCommand = {
  definition: {
    name: 'aggregate_poll_result',
    description: '日程投票を集計します',
    type: 1,
  },
  async execute({ scheduling, followUp }): Promise<void> {
    try {
      const results = await scheduling.aggregatePollResults();
      for (const content of splitMessages(formatResults(results))) await followUp(content);
    } catch (error) {
      console.error('Discord poll aggregation failed', error);
      await followUp('集計に失敗しました。投票が作成済みか、設定とログを確認してください。');
    }
  },
};
