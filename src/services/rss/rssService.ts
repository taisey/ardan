import type { PodcastFeed } from '../../clients/rss.js';
import type { GoogleSheetsRssFeedRepository } from '../../repositories/rss/googleSheetsRssFeedRepository.js';

export class RssService {
  constructor(
    private readonly feeds: Pick<GoogleSheetsRssFeedRepository, 'listFeeds' | 'updatePubDate'>,
    private readonly rss: { read(url: string): Promise<PodcastFeed> },
    private readonly discord: { sendNotice(content: string): Promise<void> },
    private readonly now: () => number = Date.now,
  ) {}

  async poll(): Promise<number> {
    const errors: Error[] = [];
    let posted = 0;
    const now = this.now();
    for (const feedRow of await this.feeds.listFeeds()) {
      try {
        const feed = await this.rss.read(feedRow.url);
        const episodes = feed.episodes.filter((episode) => episode.publishedAt <= now)
          .sort((left, right) => left.publishedAt - right.publishedAt);
        if (feedRow.pubDate === undefined) {
          // Establish a baseline without announcing the existing back catalogue.
          await this.saveCheckpoint(feedRow, new Date(episodes.at(-1)?.publishedAt ?? now).toISOString());
          continue;
        }
        const checkpoint = Date.parse(feedRow.pubDate);
        const pending = episodes.filter((episode) => episode.publishedAt > checkpoint);
        for (let index = 0; index < pending.length;) {
          const publishedAt = pending[index].publishedAt;
          // Advance only after every episode sharing this timestamp succeeds.
          do {
            const episode = pending[index];
            const heading = `${feed.title}\n${episode.title}`;
            if (episode.url.length > 1_800) throw new Error('RSS episode URL is too long for a Discord notice');
            await this.discord.sendNotice(`${heading.slice(0, 1_999 - episode.url.length)}\n${episode.url}`);
            posted += 1;
            index += 1;
          } while (index < pending.length && pending[index].publishedAt === publishedAt);
          const checkpoint = new Date(publishedAt).toISOString();
          // Stop the entire run on storage failure: later saves must not persist an uncertain checkpoint.
          await this.saveCheckpoint(feedRow, checkpoint);
        }
      } catch (error) {
        if (error instanceof CheckpointWriteError) throw error;
        errors.push(new Error(`RSS feed failed: ${feedRow.url}`, { cause: error }));
      }
    }
    if (errors.length) throw new AggregateError(errors, 'One or more RSS feeds failed');
    return posted;
  }

  private async saveCheckpoint(feed: { url: string; rowNumber: number; metadata: Record<string, unknown>; pubDate?: string }, pubDate: string): Promise<void> {
    try {
      await this.feeds.updatePubDate(feed, pubDate);
    } catch (error) {
      throw new CheckpointWriteError('RSS checkpoint write failed', { cause: error });
    }
  }
}

class CheckpointWriteError extends Error {}
