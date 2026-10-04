type DiscordRequest = { method: string; url: string };

/** Keep route information for debugging while redacting interaction/webhook tokens. */
function safeDiscordUrl(value: string): string {
  try {
    const url = new URL(value);
    const segments = url.pathname.split('/');
    if (segments[3] === 'webhooks' || segments[3] === 'interactions') segments[5] = '[redacted]';
    return `${url.origin}${segments.join('/')}${url.search ? '?[redacted]' : ''}`;
  } catch {
    return '<unavailable>';
  }
}

/** Build useful Discord API diagnostics without including request credentials. */
export async function discordHttpError(operation: string, response: Response, request?: DiscordRequest): Promise<Error> {
  let body = '';
  try {
    body = (await response.text()).trim();
  } catch {
    body = '<response body unavailable>';
  }

  const requestDetails = request
    ? `; request=${request.method} ${safeDiscordUrl(request.url)}; response_url=${safeDiscordUrl(response.url)}; redirected=${response.redirected}`
    : '';
  const details = body ? `; response=${body.slice(0, 2_000)}${body.length > 2_000 ? '…' : ''}` : '';
  return new Error(`${operation} failed (${response.status} ${response.statusText})${requestDetails}${details}`);
}
