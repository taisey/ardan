import { afterEach, describe, expect, it, vi } from 'vitest';
import { DiscordGatewayInteractionHandler } from './discordGatewayInteractionHandler.js';

describe('DiscordGatewayInteractionHandler', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('keeps a command result in the channel or thread where it was invoked', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    const scheduling = { createRecordingDatePoll: vi.fn().mockResolvedValue({ created: true }) };
    const handler = new DiscordGatewayInteractionHandler('application', scheduling as never);

    await handler.handle({ type: 2, id: 'interaction', token: 'token', data: { name: 'create_recording_date_poll' } });

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ type: 5 });
    expect(fetchMock.mock.calls[1][0]).toBe('https://discord.com/api/v10/webhooks/application/token/messages/@original');
    expect(fetchMock.mock.calls[1][1].method).toBe('PATCH');
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({
      content: '投票を作成しました。',
      allowed_mentions: { parse: [] },
    });
  });

  it('posts additional result chunks after editing the deferred original response', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    const aggregatePollResults = vi.fn().mockResolvedValue(Array.from({ length: 100 }, (_, index) => ({
      date: new Date(Date.UTC(2026, 0, index + 1)).toISOString().slice(0, 10).replaceAll('-', '/'),
      available: [],
      tentative: [],
      unavailable: [],
    })));
    const handler = new DiscordGatewayInteractionHandler('application', { aggregatePollResults } as never);

    await handler.handle({ type: 2, id: 'interaction', token: 'token', data: { name: 'aggregate_poll_result' } });

    await vi.waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThan(2));
    expect(fetchMock.mock.calls[1][1].method).toBe('PATCH');
    expect(fetchMock.mock.calls[1][0]).toContain('/messages/@original');
    expect(fetchMock.mock.calls[2][1].method).toBe('POST');
    expect(fetchMock.mock.calls[2][0]).toBe('https://discord.com/api/v10/webhooks/application/token');
  });
});
