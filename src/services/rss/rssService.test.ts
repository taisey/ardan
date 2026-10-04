import { describe, expect, it, vi } from 'vitest';
import { RssService } from './rssService.js';
import { RssClient, type PodcastEpisode } from '../../clients/rss.js';
import { nextRssPollAt } from '../../gateway/rssSchedule.js';
import { loadOptionalRssConfig, loadRssConfig } from '../../config/env.js';
import { GoogleSheetsRssFeedRepository } from '../../repositories/rss/googleSheetsRssFeedRepository.js';
import type { GoogleSheetsClient } from '../../clients/googleSheets.js';

const day = (n: number): number => Date.UTC(2026, 9, n);
const episode = (n: number, title = `Episode ${n}`): PodcastEpisode => ({ title, url: `https://example.com/${n}`, publishedAt: day(n) });

function setup() {
  const read = vi.fn(async (_url: string) => ({ title: 'Podcast', episodes: [episode(1)] }));
  const sendNotice = vi.fn(async (_content: string) => {});
  const stored = [{ url: 'https://example.com/feed', rowNumber: 2, metadata: {} as Record<string, unknown>, pubDate: undefined as string | undefined }];
  const listFeeds = vi.fn(async () => stored.map((feed) => ({ ...feed, metadata: { ...feed.metadata } })));
  const updatePubDate = vi.fn(async (feed: typeof stored[number], pubDate: string) => {
    const row = stored.find(({ url }) => url === feed.url)!;
    row.pubDate = pubDate;
    row.metadata = { ...row.metadata, rss: { pubDate } };
  });
  const service = () => new RssService({ listFeeds, updatePubDate }, { read }, { sendNotice }, () => day(10));
  return { stored, read, sendNotice, listFeeds, updatePubDate, service };
}

describe('RSS polling', () => {
  it('baselines silently, orders new episodes, and retains pubDate across service restarts', async () => {
    const s = setup();
    await expect(s.service().poll()).resolves.toBe(0);
    s.read.mockResolvedValue({ title: 'Podcast', episodes: [episode(3), episode(1), episode(2), episode(11)] });
    await expect(s.service().poll()).resolves.toBe(2);
    expect(s.sendNotice.mock.calls.map(([content]) => content)).toEqual([
      'Podcast\nEpisode 2\nhttps://example.com/2', 'Podcast\nEpisode 3\nhttps://example.com/3',
    ]);
    await expect(s.service().poll()).resolves.toBe(0);
    expect(s.stored[0].pubDate).toBe(new Date(day(3)).toISOString());
  });

  it('does not advance past a partially delivered timestamp group', async () => {
    const s = setup();
    await s.service().poll();
    s.read.mockResolvedValue({ title: 'Podcast', episodes: [episode(2, 'A'), episode(2, 'B'), episode(3)] });
    s.sendNotice.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('Discord unavailable'));
    await expect(s.service().poll()).rejects.toThrow('One or more RSS feeds failed');
    expect(s.stored[0].pubDate).toBe(new Date(day(1)).toISOString());
    await expect(s.service().poll()).resolves.toBe(3);
  });

  it('retains successful earlier groups and continues other feeds on fetch failure', async () => {
    const s = setup();
    await s.service().poll();
    s.read.mockResolvedValue({ title: 'Podcast', episodes: [episode(2), episode(3)] });
    s.sendNotice.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('Failed'));
    await expect(s.service().poll()).rejects.toThrow();
    expect(s.stored[0].pubDate).toBe(new Date(day(2)).toISOString());
    s.listFeeds.mockResolvedValue([{ url: 'https://broken.example/feed', rowNumber: 3, metadata: {}, pubDate: undefined }, ...(await s.listFeeds())]);
    s.read.mockImplementation(async (url) => {
      if (url.includes('broken')) throw new Error('Timeout');
      return { title: 'Podcast', episodes: [episode(2), episode(3)] };
    });
    await expect(s.service().poll()).rejects.toThrow();
    expect(s.stored[0].pubDate).toBe(new Date(day(3)).toISOString());
  });

  it('stops on checkpoint write failure and preserves the durable checkpoint', async () => {
    const s = setup();
    await s.service().poll();
    s.read.mockResolvedValue({ title: 'Podcast', episodes: [episode(2), episode(3)] });
    s.updatePubDate.mockRejectedValueOnce(new Error('Sheets unavailable'));
    const service = s.service();
    await expect(service.poll()).rejects.toThrow('checkpoint write failed');
    expect(s.sendNotice).toHaveBeenCalledTimes(1);
    expect(s.stored[0].pubDate).toBe(new Date(day(1)).toISOString());
  });

  it('reads podcast RSS pubDate and falls back to the audio enclosure URL', async () => {
    const client = new RssClient();
    const xml = `<rss version="2.0"><channel><title>Test &amp; Podcast</title><item><title>Episode</title><pubDate>Fri, 02 Oct 2026 09:00:00 +0900</pubDate><enclosure url="https://example.com/audio.mp3" type="audio/mpeg" length="100"/></item></channel></rss>`;
    await expect(client.parse(xml)).resolves.toEqual({ title: 'Test & Podcast', episodes: [{ title: 'Episode', url: 'https://example.com/audio.mp3', publishedAt: day(2) }] });
    await expect(client.parse(xml.replace('Fri, 02 Oct 2026 09:00:00 +0900', 'invalid'))).rejects.toThrow('pubDate');
  });

  it('reads feed URLs and pubDate metadata from the RSS spreadsheet', async () => {
    const sheets = {
      getSheetTitle: vi.fn(async () => "RSS's feeds"),
      readRows: vi.fn(async () => [['feed_url', 'metadata'], [' https://example.com/feed ', '{"rss":{"pubDate":"2026-10-02T00:00:00.000Z"}}']]),
      updateRow: vi.fn(async () => {}),
    };
    const repository = new GoogleSheetsRssFeedRepository(sheets as unknown as GoogleSheetsClient, 0);
    const [feed] = await repository.listFeeds();
    expect(feed).toMatchObject({ url: 'https://example.com/feed', rowNumber: 2, pubDate: '2026-10-02T00:00:00.000Z' });
    await repository.updatePubDate(feed, '2026-10-03T00:00:00.000Z');
    expect(sheets.readRows).toHaveBeenCalledWith("'RSS''s feeds'!A:B");
    expect(sheets.updateRow).toHaveBeenCalledWith("'RSS''s feeds'!B2", ['{"rss":{"pubDate":"2026-10-03T00:00:00.000Z"}}']);
  });

  it('schedules the next quarter hour, including when started exactly at a boundary', () => {
    expect(nextRssPollAt(Date.parse('2026-10-03T12:14:59Z'))).toBe(Date.parse('2026-10-03T12:15:00Z'));
    expect(nextRssPollAt(Date.parse('2026-10-03T12:15:00Z'))).toBe(Date.parse('2026-10-03T12:30:00Z'));
    expect(nextRssPollAt(Date.parse('2026-10-03T23:59:00Z'))).toBe(Date.parse('2026-10-04T00:00:00Z'));
  });

  it('keeps RSS optional and requires only RSS dependencies for the batch', () => {
    expect(loadOptionalRssConfig({})).toBeUndefined();
    expect(() => loadOptionalRssConfig({ DISCORD_RSS_CHANNEL_ID: '123' })).toThrow();
    expect(loadRssConfig({ DISCORD_BOT_TOKEN: 'token', DISCORD_RSS_CHANNEL_ID: '123', GOOGLE_SPREADSHEET_ID: 'sheet', GOOGLE_RSS_FEEDS_SHEET_GID: '0', GOOGLE_SERVICE_ACCOUNT_JSON: '{}' }).sheetGid).toBe(0);
  });
});
