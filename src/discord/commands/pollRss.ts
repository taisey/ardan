import type { DiscordCommand } from './types.js';

export const pollRssCommand: DiscordCommand = {
  definition: {
    name: 'poll_rss',
    description: 'Podcast RSSを手動取得します',
    type: 1,
  },
  async execute({ rss, followUp }): Promise<void> {
    if (!rss) {
      await followUp('RSS通知が設定されていません。');
      return;
    }
    try {
      const posted = await rss.poll();
      await followUp(`RSSを取得しました。新着投稿: ${posted}件。`);
    } catch (error) {
      console.error('Manual RSS poll failed', error);
      await followUp('RSSの取得に失敗しました。フィードURLとSpreadsheet、Discordの設定を確認してください。');
    }
  },
};
