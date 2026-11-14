import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DiscordGateway } from './discordGateway.js';

class FakeWebSocket {
  static OPEN = 1;
  static instances: FakeWebSocket[] = [];

  readyState = FakeWebSocket.OPEN;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: ((event: { type: string }) => void) | null = null;
  send = vi.fn();
  close = vi.fn(() => {
    this.readyState = 3;
    this.onclose?.();
  });

  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this);
  }

  receive(op: number, data: unknown): void {
    this.onmessage?.({ data: JSON.stringify({ op, d: data, s: null, t: null }) });
  }
}

describe('DiscordGateway', () => {
  beforeEach(() => {
    FakeWebSocket.instances = [];
    vi.useFakeTimers();
    vi.stubGlobal('WebSocket', FakeWebSocket);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('reconnects when the next heartbeat is due without an ACK', () => {
    const gateway = new DiscordGateway('token', async () => {});
    gateway.start();
    const first = FakeWebSocket.instances[0];
    first.receive(10, { heartbeat_interval: 5_000 });

    expect(JSON.parse(first.send.mock.calls[0][0])).toEqual({ op: 1, d: null });
    first.receive(11, null);
    vi.advanceTimersByTime(5_000);
    expect(first.send).toHaveBeenCalledTimes(3); // heartbeat, identify, heartbeat

    vi.advanceTimersByTime(5_000);
    expect(first.close).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(1_000);
    expect(FakeWebSocket.instances).toHaveLength(2);
    gateway.stop();
  });

  it('reconnects after an error even when no close event arrives', () => {
    const gateway = new DiscordGateway('token', async () => {});
    gateway.start();
    const first = FakeWebSocket.instances[0];
    first.close = vi.fn();
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});

    first.onerror?.({ type: 'error' });
    vi.advanceTimersByTime(1_000);

    expect(errorLog).toHaveBeenCalledWith('Discord Gateway error', 'error');
    expect(FakeWebSocket.instances).toHaveLength(2);
    first.onclose?.();
    vi.advanceTimersByTime(1_000);
    expect(FakeWebSocket.instances).toHaveLength(2);
    gateway.stop();
  });
});
