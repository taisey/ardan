/** Build useful Discord API diagnostics without including request URLs or credentials. */
export async function discordHttpError(operation: string, response: Response): Promise<Error> {
  let body = '';
  try {
    body = (await response.text()).trim();
  } catch {
    body = '<response body unavailable>';
  }

  const details = body ? `; response=${body.slice(0, 2_000)}${body.length > 2_000 ? '…' : ''}` : '';
  return new Error(`${operation} failed (${response.status} ${response.statusText})${details}`);
}
