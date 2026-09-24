export type EditingSchedule = {
  number: string;
  startDueWeek: string;
  assign: string;
  status: 'in_progress' | 'done';
  metadata?: Record<string, unknown>;
};

export type EditingAssignee = { order: number; name: string };
export type EditingUser = { name: string; discordId: string };

export function isEpisodeNumber(value: string): boolean {
  return /^#?\d+$/.test(value);
}

export function episodeOrder(value: string): number {
  if (!isEpisodeNumber(value)) throw new Error(`Invalid episode number: ${value}`);
  return Number(value.replace(/^#/, ''));
}
