import type { GoogleSheetsClient } from '../../clients/googleSheets.js';

export type RssFeedRow = { url: string; rowNumber: number; metadata: Record<string, unknown>; pubDate?: string };

export class GoogleSheetsRssFeedRepository {
  private sheetTitle: Promise<string> | undefined;

  constructor(private readonly sheets: GoogleSheetsClient, private readonly sheetGid: number) {}

  async listFeeds(): Promise<RssFeedRow[]> {
    const title = await this.getSheetTitle();
    const rows = await this.sheets.readRows(`'${title.replaceAll("'", "''")}'!A:B`);
    if (rows[0]?.[0]?.trim() !== 'feed_url' || rows[0]?.[1]?.trim() !== 'metadata') {
      throw new Error('RSS sheet headers must be feed_url | metadata');
    }
    const seen = new Set<string>();
    return rows.slice(1).flatMap((row, index) => {
      const url = row[0]?.trim() ?? '';
      if (!url) return [];
      if (seen.has(url)) throw new Error(`Duplicate RSS feed URL in spreadsheet: ${url}`);
      seen.add(url);
      const metadata = this.parseMetadata(row[1]);
      return { url, rowNumber: index + 2, metadata, pubDate: this.readPubDate(metadata) };
    });
  }

  async updatePubDate(feed: RssFeedRow, pubDate: string): Promise<void> {
    const title = await this.getSheetTitle();
    const metadata = { ...feed.metadata, rss: { ...this.rssMetadata(feed.metadata), pubDate } };
    await this.sheets.updateRow(`'${title.replaceAll("'", "''")}'!B${feed.rowNumber}`, [JSON.stringify(metadata)]);
    feed.metadata = metadata;
    feed.pubDate = pubDate;
  }

  private getSheetTitle(): Promise<string> {
    this.sheetTitle ??= this.sheets.getSheetTitle(this.sheetGid);
    return this.sheetTitle;
  }

  private readPubDate(metadata: Record<string, unknown>): string | undefined {
    const pubDate = this.rssMetadata(metadata).pubDate;
    if (pubDate === undefined) return undefined;
    if (typeof pubDate !== 'string' || !Number.isFinite(Date.parse(pubDate))) {
      throw new Error('RSS metadata.pubDate must be a valid date string');
    }
    return pubDate;
  }

  private rssMetadata(metadata: Record<string, unknown> | undefined): Record<string, unknown> {
    if (!metadata || metadata.rss === undefined) return {};
    if (typeof metadata.rss !== 'object' || metadata.rss === null || Array.isArray(metadata.rss)) {
      throw new Error('RSS metadata.rss must be an object');
    }
    return metadata.rss as Record<string, unknown>;
  }

  private parseMetadata(value: string | undefined): Record<string, unknown> {
    if (!value?.trim()) return {};
    try {
      const parsed: unknown = JSON.parse(value);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
      return parsed as Record<string, unknown>;
    } catch {
      throw new Error('RSS feed metadata must be a JSON object');
    }
  }
}
