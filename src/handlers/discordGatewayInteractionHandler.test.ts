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
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({
      content: '投票を作成しました。',
      allowed_mentions: { parse: [] },
    });
  });
});
