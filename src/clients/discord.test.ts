import { afterEach, describe, expect, it, vi } from 'vitest';
import { DiscordClient } from './discord.js';

afterEach(() => vi.unstubAllGlobals());

describe('DiscordClient', () => {
  it('retries a rate-limited poll retrieval and reads answers sequentially', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ retry_after: 0 }, 429))
      .mockResolvedValueOnce(jsonResponse({
        poll: { answers: [
          { answer_id: 1, poll_media: { text: '○ 参加可能' } },
          { answer_id: 2, poll_media: { text: '△ 調整可' } },
          { answer_id: 3, poll_media: { text: '× 不可' } },
        ] },
      }))
      .mockResolvedValueOnce(jsonResponse({ users: [{ id: 'u1', global_name: 'Alice', username: 'alice' }] }))
      .mockResolvedValueOnce(jsonResponse({ users: [{ id: 'u2', username: 'bob' }] }))
      .mockResolvedValueOnce(jsonResponse({ users: [] }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(new DiscordClient('token', 'channel', 'role').getPollVoters('message')).resolves.toEqual([
      { label: '○ 参加可能', userNames: ['Alice'] },
      { label: '△ 調整可', userNames: ['bob'] },
      { label: '× 不可', userNames: [] },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it('includes a Japanese weekday in the poll title', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ id: 'message' }));
    vi.stubGlobal('fetch', fetchMock);

    await new DiscordClient('token', 'channel', 'role').createAvailabilityPoll('2026/09/21', 'thread');

    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toMatchObject({
      poll: { question: { text: '次回録音の日程調整: 2026/09/21（月）' } },
    });
  });

  it('posts the mention and date range before creating a seven-day thread', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ id: 'parent-message' }))
      .mockResolvedValueOnce(jsonResponse({ id: 'thread' }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(new DiscordClient('token', 'channel', 'role').createAvailabilityThread('2026/09/21', '2026/09/27'))
      .resolves.toEqual({ threadId: 'thread' });

    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toMatchObject({
      content: '<@&role>\n次回録音の日程調整\n2026/09/21 - 2026/09/27',
      allowed_mentions: { parse: [], roles: ['role'] },
    });
    expect(fetchMock.mock.calls[1][0]).toBe('https://discord.com/api/v10/channels/channel/messages/parent-message/threads');
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toMatchObject({ auto_archive_duration: 10_080 });
  });
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}
