import { DiscordClient } from '../../clients/discord.js';
import { GoogleSheetsClient } from '../../clients/googleSheets.js';
import { RssClient } from '../../clients/rss.js';
import type { RssConfig } from '../../config/env.js';
import { GoogleSheetsRssFeedRepository } from '../../repositories/rss/googleSheetsRssFeedRepository.js';
import { RssPollLock } from '../../repositories/rss/rssPollLock.js';
import { RssService } from './rssService.js';

export function createRssService(config: RssConfig): RssService {
  return new RssService(
    new GoogleSheetsRssFeedRepository(new GoogleSheetsClient(config.serviceAccount, config.spreadsheetId), config.sheetGid),
    new RssClient(),
    new RssPollLock(config.pollLockPath),
    new DiscordClient(config.botToken, config.channelId, ''),
  );
}
