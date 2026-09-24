import type { DiscordClient } from '../../clients/discord.js';
import type { GoogleDriveClient } from '../../clients/googleDrive.js';
import { episodeOrder, isEpisodeNumber, type EditingAssignee, type EditingSchedule } from '../../models/editingSchedule.js';
import type { GoogleSheetsEditingScheduleRepository } from '../../repositories/editingSchedule/googleSheetsEditingScheduleRepository.js';

export class EditingScheduleService {
  constructor(
    private readonly drive: GoogleDriveClient,
    private readonly schedules: GoogleSheetsEditingScheduleRepository,
    private readonly discord: DiscordClient,
    private readonly sourceFolderId: string,
    private readonly today: () => string,
  ) {}

  async syncFromDrive(): Promise<EditingSchedule[]> {
    const [names, existing, assignees] = await Promise.all([
      this.drive.listChildNames(this.sourceFolderId), this.schedules.listSchedules(), this.schedules.listAssignees(),
    ]);
    const latestDone = existing.filter((schedule) => schedule.status === 'done' && isEpisodeNumber(schedule.number))
      .sort((left, right) => episodeOrder(right.number) - episodeOrder(left.number))[0];
    const existingNumbers = new Set(existing.filter((schedule) => isEpisodeNumber(schedule.number)).map((schedule) => episodeOrder(schedule.number)));
    const additions = [...new Set(names.filter(isEpisodeNumber))]
      .filter((number) => !existingNumbers.has(episodeOrder(number)))
      .filter((number) => !latestDone || episodeOrder(number) > episodeOrder(latestDone.number))
      .sort((left, right) => episodeOrder(left) - episodeOrder(right));
    if (!additions.length) return [];
    let assigneeIndex = this.nextAssigneeIndex(latestDone?.assign, assignees);
    let dueWeek = this.nextDueWeek(latestDone?.startDueWeek);
    const created: EditingSchedule[] = [];
    for (const number of additions) {
      const schedule = { number, startDueWeek: dueWeek, assign: assignees[assigneeIndex].name, status: 'in_progress' as const };
      await this.schedules.append(schedule);
      created.push(schedule);
      assigneeIndex = (assigneeIndex + 1) % assignees.length;
      dueWeek = addWeeks(dueWeek, 1);
    }
    return created;
  }

  async remindDueEditors(): Promise<EditingSchedule[]> {
    const [schedules, users] = await Promise.all([this.schedules.listSchedules(), this.schedules.listUsers()]);
    const currentWeek = weekStart(this.today());
    const due = schedules.filter((schedule) => schedule.status === 'in_progress' && schedule.startDueWeek && weekStart(schedule.startDueWeek) === currentWeek);
    if (!due.length) return [];
    const usersByName = new Map(users.map((user) => [user.name, user.discordId]));
    for (const schedule of due) {
      const discordId = usersByName.get(schedule.assign);
      const content = `${discordId ? `<@${discordId}>` : schedule.assign || '担当未設定'} ${schedule.number} の編集をお願いします（開始予定週: ${schedule.startDueWeek}）。`;
      let threadId = this.reminderThreadId(schedule.metadata);
      if (!threadId) {
        const thread = await this.discord.createEditingReminderThread(schedule.number, schedule.startDueWeek);
        threadId = thread.threadId;
        await this.schedules.saveMetadata(schedule.number, this.withReminderThread(schedule.metadata, threadId));
      }
      await this.discord.sendThreadMessage(threadId, content, discordId ? [discordId] : []);
    }
    return due;
  }

  async notifyPublished(number: string): Promise<EditingSchedule> {
    if (!isEpisodeNumber(number)) throw new Error('episode must be in #123 format');
    const completed = await this.schedules.markDone(number);
    const user = (await this.schedules.listUsers()).find((candidate) => candidate.name === completed.assign);
    const mention = user ? `<@${user.discordId}> ` : '';
    await this.discord.sendNotice(`${mention}${number} を公開しました。`, user ? [user.discordId] : []);
    return completed;
  }

  private nextAssigneeIndex(lastAssign: string | undefined, assignees: EditingAssignee[]): number {
    if (!lastAssign) return 0;
    const index = assignees.findIndex((assignee) => assignee.name === lastAssign);
    if (index < 0) throw new Error(`The latest done assignee is not in the assignment order: ${lastAssign}`);
    return (index + 1) % assignees.length;
  }

  private reminderThreadId(metadata: Record<string, unknown> | undefined): string | undefined {
    const discord = metadata?.discord;
    if (!discord || typeof discord !== 'object' || Array.isArray(discord)) return undefined;
    const threadId = (discord as Record<string, unknown>).reminderThreadId;
    return typeof threadId === 'string' ? threadId : undefined;
  }

  private withReminderThread(metadata: Record<string, unknown> | undefined, reminderThreadId: string): Record<string, unknown> {
    const discord = metadata?.discord && typeof metadata.discord === 'object' && !Array.isArray(metadata.discord)
      ? metadata.discord as Record<string, unknown> : {};
    return { ...metadata, discord: { ...discord, reminderThreadId } };
  }

  private nextDueWeek(latestDoneWeek: string | undefined): string {
    const next = latestDoneWeek ? addWeeks(weekStart(latestDoneWeek), 1) : addWeeks(weekStart(this.today()), 1);
    return next <= weekStart(this.today()) ? addWeeks(weekStart(this.today()), 1) : next;
  }
}

export function weekStart(value: string): string {
  const normalized = value.replaceAll('-', '/');
  if (!/^\d{4}\/\d{2}\/\d{2}$/.test(normalized)) throw new Error(`Invalid start_due_week: ${value}`);
  const date = new Date(`${normalized.replaceAll('/', '-')}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid start_due_week: ${value}`);
  const mondayOffset = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - mondayOffset);
  return date.toISOString().slice(0, 10).replaceAll('-', '/');
}

function addWeeks(value: string, weeks: number): string {
  const date = new Date(`${value.replaceAll('/', '-')}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + weeks * 7);
  return date.toISOString().slice(0, 10).replaceAll('-', '/');
}
