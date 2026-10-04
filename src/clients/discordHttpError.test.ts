import { describe, expect, it } from 'vitest';
import { discordHttpError } from './discordHttpError.js';

describe('discordHttpError', () => {
  it('includes sanitized request and response URLs plus Discord response details', async () => {
    const error = await discordHttpError('Discord notice', new Response('{"message":"Method Not Allowed","code":0}', {
      status: 405,
      statusText: 'Method Not Allowed',
    }), { method: 'POST', url: 'https://discord.com/api/v10/webhooks/123/secret-token' });

    expect(error.message).toContain('Discord notice failed (405 Method Not Allowed)');
    expect(error.message).toContain('"message":"Method Not Allowed"');
    expect(error.message).toContain('request=POST https://discord.com/api/v10/webhooks/123/[redacted]');
    expect(error.message).toContain('response_url=<unavailable>');
    expect(error.message).toContain('redirected=false');
    expect(error.message).not.toContain('secret-token');
  });

  it('limits long response bodies', async () => {
    const error = await discordHttpError('Discord notice', new Response('x'.repeat(2_100), { status: 500 }));

    expect(error.message.length).toBeLessThan(2_100);
    expect(error.message.endsWith('…')).toBe(true);
  });

  it('redacts interaction tokens and query parameters from redirected response URLs', async () => {
    const response = {
      status: 405,
      statusText: 'Method Not Allowed',
      url: 'https://discord.com/api/v10/webhooks/123/response-token?secret=value',
      redirected: true,
      text: async () => '',
    } as Response;
    const error = await discordHttpError('Discord follow-up', response, {
      method: 'POST',
      url: 'https://discord.com/api/v10/webhooks/123/request-token',
    });

    expect(error.message).toContain('response_url=https://discord.com/api/v10/webhooks/123/[redacted]?[redacted]');
    expect(error.message).toContain('redirected=true');
    expect(error.message).not.toContain('response-token');
    expect(error.message).not.toContain('secret=value');
  });
});
