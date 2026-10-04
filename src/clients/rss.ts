import Parser from 'rss-parser';

export type PodcastEpisode = { title: string; url: string; publishedAt: number };
export type PodcastFeed = { title: string; episodes: PodcastEpisode[] };

export class RssClient {
  private readonly parser = new Parser({ timeout: 20_000, headers: { 'User-Agent': 'Ardan RSS reader' } });

  async read(url: string): Promise<PodcastFeed> {
    assertHttpUrl(url);
    return this.toFeed(await this.parser.parseURL(url));
  }

  async parse(xml: string): Promise<PodcastFeed> {
    return this.toFeed(await this.parser.parseString(xml));
  }

  private toFeed(feed: Parser.Output<Record<string, unknown>>): PodcastFeed {
    return {
      title: feed.title?.trim() || 'Podcast',
      episodes: feed.items.map((item) => {
        const publishedAt = Date.parse(item.pubDate ?? '');
        if (!Number.isFinite(publishedAt)) throw new Error('RSS episode has missing or invalid pubDate');
        const url = item.link?.trim() || item.enclosure?.url?.trim();
        if (!url) throw new Error('RSS episode has no link or enclosure URL');
        assertHttpUrl(url);
        return { title: item.title?.trim() || '新しいエピソード', url, publishedAt };
      }),
    };
  }
}

function assertHttpUrl(value: string): void {
  if (!['http:', 'https:'].includes(new URL(value).protocol)) throw new Error('RSS URLs must use HTTP or HTTPS');
}
