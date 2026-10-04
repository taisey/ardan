import { describe, expect, it, vi } from 'vitest';
import { findDiscordCommand } from './index.js';
import { pollRssCommand } from './pollRss.js';

describe('pollRssCommand', () => {
  it('is registered as /poll_rss', () => {
    expect(findDiscordCommand('poll_rss')).toBe(pollRssCommand);
  });

  it('reports the number of new episodes posted', async () => {
    const followUp = vi.fn();
    const poll = vi.fn().mockResolvedValue(3);
    await pollRssCommand.execute({ interactionToken: 'token', options: {}, scheduling: {} as never, rss: { poll } as never, followUp });
    expect(poll).toHaveBeenCalledOnce();
    expect(followUp).toHaveBeenCalledWith('RSSを取得しました。新着投稿: 3件。');
  });

  it('reports when RSS is not configured', async () => {
    const followUp = vi.fn();
    await pollRssCommand.execute({ interactionToken: 'token', options: {}, scheduling: {} as never, followUp });
    expect(followUp).toHaveBeenCalledWith('RSS通知が設定されていません。');
  });

  it('reports failures without exposing internal error details', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const followUp = vi.fn();
      await pollRssCommand.execute({ interactionToken: 'token', options: {}, scheduling: {} as never, rss: { poll: vi.fn().mockRejectedValue(new Error('private failure')) } as never, followUp });
      expect(followUp).toHaveBeenCalledWith(expect.stringContaining('失敗'));
      expect(followUp).not.toHaveBeenCalledWith(expect.stringContaining('private failure'));
    } finally { log.mockRestore(); }
  });
});
