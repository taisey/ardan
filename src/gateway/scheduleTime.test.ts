import { describe, expect, it } from 'vitest';
import { nextMidnightInTimeZone } from './scheduleTime.js';

describe('nextMidnightInTimeZone', () => {
  it.each([
    ['2026-10-01T14:59:59Z', 'Asia/Tokyo', '2026-10-01T15:00:00.000Z'],
    ['2026-10-01T15:00:00Z', 'Asia/Tokyo', '2026-10-02T15:00:00.000Z'],
    ['2026-10-01T14:00:00Z', 'UTC', '2026-10-02T00:00:00.000Z'],
    ['2026-03-08T06:00:00Z', 'America/New_York', '2026-03-09T04:00:00.000Z'],
    ['2026-11-01T05:00:00Z', 'America/New_York', '2026-11-02T05:00:00.000Z'],
  ])('schedules strictly after %s in %s', (now, zone, expected) => {
    expect(nextMidnightInTimeZone(new Date(now), zone).toISOString()).toBe(expected);
  });
});

