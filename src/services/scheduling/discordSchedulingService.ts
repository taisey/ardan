import type { DiscordClient } from '../../clients/discord.js';
import type { RecordingScheduleRepository } from '../../repositories/recordingSchedule/recordingScheduleRepository.js';
import type {
  CreateRecordingDatePoll,
  CreatedRecordingDatePoll,
  SchedulingService,
} from './schedulingService.js';

export function todayInTimeZone(timeZone: string): string {
  const values = new Intl.DateTimeFormat('en-US', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const part = (type: string) => values.find((value) => value.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export class DiscordSchedulingService implements SchedulingService {
  constructor(
    private readonly discord: DiscordClient,
    private readonly recordingSchedules: RecordingScheduleRepository,
    private readonly today: () => string,
  ) {}

  async createRecordingDatePoll(input: CreateRecordingDatePoll): Promise<CreatedRecordingDatePoll> {
    const schedule = await this.recordingSchedules.findLatestNonExpired(this.today());
    if (!schedule || schedule.status === 'in_progress' || schedule.status === 'done') return { created: false };
    await this.recordingSchedules.markInProgress(schedule);
    const { messageId } = await this.discord.createRecordingDatePoll(input.title, input.candidateDates);
    return { created: true, messageId };
  }

}
