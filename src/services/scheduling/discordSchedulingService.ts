import type { DiscordClient, PollVoters } from '../../clients/discord.js';
import type { RecordingScheduleRepository } from '../../repositories/recordingSchedule/recordingScheduleRepository.js';
import { formatResults, splitMessages } from './formatPollResults.js';
import type {
  CreatedRecordingDatePoll,
  AvailabilityResult,
  SchedulingService,
} from './schedulingService.js';

const POLL_TITLE = '次回録音の日程調整';

type AvailabilityPoll = { date: string; messageId: string; channelId?: string };
type ResultAnnouncement = { status: 'sending' | 'done'; sentMessages: number; lastReminderDate?: string };

export function todayInTimeZone(timeZone: string): string {
  const values = new Intl.DateTimeFormat('en-US', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const part = (type: string) => values.find((value) => value.type === type)?.value;
  return `${part('year')}/${part('month')}/${part('day')}`;
}

export function candidateDatesFor(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  const current = new Date(`${startDate.replaceAll('/', '-')}T00:00:00.000Z`);
  const end = new Date(`${endDate.replaceAll('/', '-')}T00:00:00.000Z`);
  while (current <= end) {
    dates.push(current.toISOString().slice(0, 10).replaceAll('-', '/'));
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return dates;
}

export class DiscordSchedulingService implements SchedulingService {
  constructor(
    private readonly discord: DiscordClient,
    private readonly recordingSchedules: RecordingScheduleRepository,
    private readonly today: () => string,
    private readonly guildId: string,
    private readonly mentionRoleId: string,
  ) {}

  async createRecordingDatePoll(): Promise<CreatedRecordingDatePoll> {
    const schedule = await this.recordingSchedules.claimNextPollSchedule(this.today());
    if (!schedule) return { created: false };
    const candidateDates = candidateDatesFor(schedule.startDate, schedule.endDate);
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

  async remindUnansweredRecordingPollVoters(): Promise<string[]> {
    const schedule = await this.recordingSchedules.findLatestInProgress();
    if (!schedule) return [];
    const threadId = this.threadIdFromMetadata(schedule.metadata);
    if (!threadId) throw new Error('No Discord thread metadata exists for the in-progress schedule');
    const polls = this.pollsFromMetadata(schedule.metadata);
    if (!polls.length) throw new Error('No Discord poll metadata exists for the in-progress schedule');

    const groupMemberIds = await this.discord.getRoleMemberIds(this.guildId, this.mentionRoleId);
    const pollVoters = await Promise.all(polls.map(({ messageId, channelId }) => this.discord.getPollVoters(messageId, channelId)));
    const answeredEveryPoll = new Set(groupMemberIds);
    for (const voters of pollVoters) {
      const votersForPoll = new Set(voters.flatMap(({ userIds }) => userIds));
      for (const memberId of answeredEveryPoll) {
        if (!votersForPoll.has(memberId)) answeredEveryPoll.delete(memberId);
      }
    }
    const unanswered = groupMemberIds.filter((memberId) => !answeredEveryPoll.has(memberId));
    const announcement = this.resultAnnouncementFromMetadata(schedule.metadata);
    if (unanswered.length) {
      const mentions = unanswered.map((memberId) => `<@${memberId}>`).join(' ');
      await this.discord.sendThreadMessage(threadId, `録音日程の投票が未回答です。すべてのPollに回答してください。\n未回答: ${mentions}`, unanswered);
    } else if (announcement?.status === 'done') {
      const today = this.today();
      if (announcement.lastReminderDate !== today) {
        await this.discord.sendThreadMessage(
          threadId,
          `<@&${this.mentionRoleId}>\n録音日程はまだ確定していません。候補日を確認して、日程の相談・確定をお願いします。`,
          [],
          [this.mentionRoleId],
        );
        await this.recordingSchedules.saveMetadata(schedule, this.withResultAnnouncement(schedule.metadata, {
          ...announcement, lastReminderDate: today,
        }));
      }
    } else {
      const results = polls.map(({ date }, index) => this.availabilityResult(date, pollVoters[index]));
      const messages = [
        `<@&${this.mentionRoleId}>\n全員の回答が揃いました。投票結果をお知らせします。`,
        ...splitMessages(formatResults(results)),
      ];
      for (let index = announcement?.sentMessages ?? 0; index < messages.length; index += 1) {
        await this.discord.sendThreadMessage(threadId, messages[index], [], index === 0 ? [this.mentionRoleId] : []);
        await this.recordingSchedules.saveMetadata(schedule, this.withResultAnnouncement(schedule.metadata, {
          status: index === messages.length - 1 ? 'done' : 'sending',
          sentMessages: index + 1,
          ...(index === messages.length - 1 ? { lastReminderDate: this.today() } : {}),
        }));
      }
    }
    return unanswered;
  }

  async aggregatePollResults(): Promise<AvailabilityResult[]> {
    const schedule = await this.recordingSchedules.findLatestInProgress();
    if (!schedule) throw new Error('No in-progress recording schedule exists');
    const polls = this.pollsFromMetadata(schedule.metadata);
    if (!polls.length) throw new Error('No Discord poll metadata exists for the in-progress schedule');
    const results: AvailabilityResult[] = [];
    for (const { date, messageId, channelId } of polls) {
      const voters = await this.discord.getPollVoters(messageId, channelId);
      results.push(this.availabilityResult(date, voters));
    }
    return results;
  }

  async completeRecordingDate(fixedDate: string): Promise<void> {
    await this.recordingSchedules.complete(fixedDate);
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

  private threadIdFromMetadata(metadata: Record<string, unknown> | undefined): string | undefined {
    const discord = metadata?.discord;
    if (!discord || typeof discord !== 'object' || Array.isArray(discord)) return undefined;
    const threadId = (discord as Record<string, unknown>).availabilityThreadId;
    return typeof threadId === 'string' ? threadId : undefined;
  }

  private resultAnnouncementFromMetadata(metadata: Record<string, unknown> | undefined): ResultAnnouncement | undefined {
    const discord = metadata?.discord;
    if (!discord || typeof discord !== 'object' || Array.isArray(discord)) return undefined;
    const announcement = (discord as Record<string, unknown>).pollResultAnnouncement;
    if (!announcement || typeof announcement !== 'object' || Array.isArray(announcement)) return undefined;
    const { status, sentMessages, lastReminderDate } = announcement as Record<string, unknown>;
    return (status === 'sending' || status === 'done') && typeof sentMessages === 'number' && Number.isInteger(sentMessages) && sentMessages >= 0
      ? { status, sentMessages, ...(typeof lastReminderDate === 'string' ? { lastReminderDate } : {}) } : undefined;
  }

  private withResultAnnouncement(metadata: Record<string, unknown> | undefined, announcement: ResultAnnouncement): Record<string, unknown> {
    const discord = metadata?.discord && typeof metadata.discord === 'object' && !Array.isArray(metadata.discord)
      ? metadata.discord as Record<string, unknown> : {};
    return { ...metadata, discord: { ...discord, pollResultAnnouncement: announcement } };
  }

  private votersFor(voters: PollVoters[], marker: string): string[] {
    return voters.find(({ label }) => label.startsWith(marker))?.userNames ?? [];
  }

  private availabilityResult(date: string, voters: PollVoters[]): AvailabilityResult {
    return {
      date,
      available: this.votersFor(voters, '○'),
      tentative: this.votersFor(voters, '△'),
      unavailable: this.votersFor(voters, '×'),
    };
  }

}
