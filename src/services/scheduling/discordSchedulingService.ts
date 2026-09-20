import type { DiscordClient, PollVoters } from '../../clients/discord.js';
import type { RecordingScheduleRepository } from '../../repositories/recordingSchedule/recordingScheduleRepository.js';
import type {
  CreatedRecordingDatePoll,
  AvailabilityResult,
  SchedulingService,
} from './schedulingService.js';

const POLL_TITLE = '次回録音の日程調整';

type AvailabilityPoll = { date: string; messageId: string; channelId?: string };

export function todayInTimeZone(timeZone: string): string {
  const values = new Intl.DateTimeFormat('en-US', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const part = (type: string) => values.find((value) => value.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function candidateDatesFor(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  const current = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${endDate}T00:00:00.000Z`);
  while (current <= end) {
    dates.push(current.toISOString().slice(0, 10));
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return dates;
}

export class DiscordSchedulingService implements SchedulingService {
  constructor(
    private readonly discord: DiscordClient,
    private readonly recordingSchedules: RecordingScheduleRepository,
    private readonly today: () => string,
  ) {}

  async createRecordingDatePoll(): Promise<CreatedRecordingDatePoll> {
    const schedule = await this.recordingSchedules.findLatestNonExpired(this.today());
    if (!schedule || schedule.status === 'in_progress' || schedule.status === 'done') return { created: false };
    const candidateDates = candidateDatesFor(schedule.startDate, schedule.endDate);
    await this.recordingSchedules.markInProgress(schedule);
    const { threadId } = await this.discord.createAvailabilityThread(schedule.startDate, schedule.endDate);
    const polls: AvailabilityPoll[] = [];
    await this.recordingSchedules.saveMetadata(schedule, this.withPolls(schedule.metadata, polls, threadId));
    for (const date of candidateDates) {
      const { messageId } = await this.discord.createAvailabilityPoll(date, threadId);
      polls.push({ date, messageId, channelId: threadId });
      await this.recordingSchedules.saveMetadata(schedule, this.withPolls(schedule.metadata, polls, threadId));
    }
    return { created: true };
  }

  async aggregatePollResults(): Promise<AvailabilityResult[]> {
    const schedule = await this.recordingSchedules.findLatestInProgress();
    if (!schedule) throw new Error('No in-progress recording schedule exists');
    const polls = this.pollsFromMetadata(schedule.metadata);
    if (!polls.length) throw new Error('No Discord poll metadata exists for the in-progress schedule');
    const results: AvailabilityResult[] = [];
    for (const { date, messageId, channelId } of polls) {
      const voters = await this.discord.getPollVoters(messageId, channelId);
      results.push({
        date,
        available: this.votersFor(voters, '○'),
        tentative: this.votersFor(voters, '△'),
        unavailable: this.votersFor(voters, '×'),
      });
    }
    return results;
  }

  async completeRecordingDate(fixDate: string): Promise<void> {
    await this.recordingSchedules.complete(fixDate);
  }

  private withPolls(metadata: Record<string, unknown> | undefined, polls: AvailabilityPoll[], threadId: string): Record<string, unknown> {
    const discord = metadata?.discord && typeof metadata.discord === 'object' && !Array.isArray(metadata.discord)
      ? metadata.discord as Record<string, unknown> : {};
    return { ...metadata, discord: { ...discord, availabilityThreadId: threadId, availabilityPolls: polls } };
  }

  private pollsFromMetadata(metadata: Record<string, unknown> | undefined): AvailabilityPoll[] {
    const discord = metadata?.discord;
    if (!discord || typeof discord !== 'object' || Array.isArray(discord)) return [];
    const polls = (discord as Record<string, unknown>).availabilityPolls;
    if (!Array.isArray(polls)) return [];
    return polls.flatMap((poll) => {
      if (!poll || typeof poll !== 'object' || Array.isArray(poll)) return [];
      const { date, messageId, channelId } = poll as Record<string, unknown>;
      return typeof date === 'string' && typeof messageId === 'string'
        ? [{ date, messageId, ...(typeof channelId === 'string' ? { channelId } : {}) }] : [];
    });
  }

  private votersFor(voters: PollVoters[], marker: string): string[] {
    return voters.find(({ label }) => label.startsWith(marker))?.userNames ?? [];
  }

}
