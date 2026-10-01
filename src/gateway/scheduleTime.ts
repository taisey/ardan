export function nextMidnightInTimeZone(now: Date, timeZone: string): Date {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  });
  const next = new Date(now);
  next.setUTCSeconds(0, 0);
  next.setUTCMinutes(next.getUTCMinutes() + 1);
  for (let minute = 0; minute < 48 * 60; minute++) {
    if (formatter.format(next) === '00:00:00') return next;
    next.setUTCMinutes(next.getUTCMinutes() + 1);
  }
  throw new Error(`Could not find next midnight in ${timeZone}`);
}

