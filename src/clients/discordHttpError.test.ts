import { describe, expect, it } from 'vitest';
import { discordHttpError } from './discordHttpError.js';

describe('discordHttpError', () => {
  it('includes Discord response details without logging the request URL', async () => {
    const error = await discordHttpError('Discord notice', new Response('{"message":"Method Not Allowed","code":0}', {
      status: 405,
      statusText: 'Method Not Allowed',
    }));

    expect(error.message).toContain('Discord notice failed (405 Method Not Allowed)');
    expect(error.message).toContain('"message":"Method Not Allowed"');
    expect(error.message).not.toContain('https://');
  });

  it('limits long response bodies', async () => {
    const error = await discordHttpError('Discord notice', new Response('x'.repeat(2_100), { status: 500 }));

    expect(error.message.length).toBeLessThan(2_100);
    expect(error.message.endsWith('…')).toBe(true);
  });
});
