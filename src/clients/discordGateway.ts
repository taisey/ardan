type GatewayPayload = { op: number; d: unknown; s: number | null; t: string | null };

export type GatewayDispatch = { type: string; data: unknown };

const gatewayUrl = 'wss://gateway.discord.gg/?v=10&encoding=json';

function isPayload(value: unknown): value is GatewayPayload {
  return !!value && typeof value === 'object' && 'op' in value && 'd' in value;
}

export class DiscordGateway {
  private socket: WebSocket | undefined;
  private heartbeat: ReturnType<typeof setInterval> | undefined;
  private sequence: number | null = null;
  private sessionId: string | undefined;
  private resumeUrl = gatewayUrl;
  private stopped = false;

  constructor(
    private readonly token: string,
    private readonly onDispatch: (dispatch: GatewayDispatch) => Promise<void>,
  ) {}

  start(): void {
    this.stopped = false;
    this.connect();
  }

  stop(): void {
    this.stopped = true;
    this.clearHeartbeat();
    this.socket?.close(1000, 'Application shutdown');
  }

  private connect(): void {
    this.socket = new WebSocket(this.resumeUrl);
    this.socket.onmessage = (event) => { void this.receive(event.data); };
    this.socket.onclose = () => {
      this.clearHeartbeat();
      if (!this.stopped) setTimeout(() => this.connect(), 1_000);
    };
    this.socket.onerror = (event) => console.error('Discord Gateway error', event.type);
  }

  private async receive(message: unknown): Promise<void> {
    let parsed: unknown;
    try {
      const text = typeof message === 'string' ? message : await (message as Blob).text();
      parsed = JSON.parse(text);
    } catch {
      console.error('Discord Gateway sent invalid JSON');
      return;
    }
    if (!isPayload(parsed)) return;
    if (typeof parsed.s === 'number') this.sequence = parsed.s;

    switch (parsed.op) {
      case 10: this.hello(parsed.d); break;
      case 0: await this.dispatch(parsed); break;
      case 7: this.socket?.close(); break;
      case 9: this.invalidSession(parsed.d); break;
      case 11: break;
      default: console.warn(`Unhandled Discord Gateway opcode: ${parsed.op}`);
    }
  }

  private hello(data: unknown): void {
    const interval = typeof data === 'object' && data !== null && 'heartbeat_interval' in data
      ? (data as { heartbeat_interval?: unknown }).heartbeat_interval : undefined;
    if (typeof interval !== 'number') throw new Error('Discord Gateway HELLO did not include heartbeat_interval');
    this.send({ op: 1, d: this.sequence });
    this.clearHeartbeat();
    this.heartbeat = setInterval(() => this.send({ op: 1, d: this.sequence }), interval);
    if (this.sessionId && this.sequence !== null) {
      this.send({ op: 6, d: { token: this.token, session_id: this.sessionId, seq: this.sequence } });
    } else {
      this.send({ op: 2, d: { token: this.token, intents: 0, properties: { os: process.platform, browser: 'ardan', device: 'ardan' } } });
    }
  }

  private async dispatch(payload: GatewayPayload): Promise<void> {
    if (payload.t === 'READY' && payload.d && typeof payload.d === 'object') {
      const ready = payload.d as { session_id?: unknown; resume_gateway_url?: unknown };
      if (typeof ready.session_id === 'string') this.sessionId = ready.session_id;
      if (typeof ready.resume_gateway_url === 'string') this.resumeUrl = `${ready.resume_gateway_url}?v=10&encoding=json`;
    }
    if (payload.t) await this.onDispatch({ type: payload.t, data: payload.d });
  }

  private invalidSession(canResume: unknown): void {
    if (canResume !== true) {
      this.sessionId = undefined;
      this.sequence = null;
      this.resumeUrl = gatewayUrl;
    }
    this.socket?.close();
  }

  private send(payload: { op: number; d: unknown }): void {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(payload));
  }

  private clearHeartbeat(): void {
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = undefined;
  }
}
