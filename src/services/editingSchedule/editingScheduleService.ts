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
    private readonly reminderDaysBeforeDue = 7,
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
    let dueDate = this.nextDueDate(latestDone?.dueDate);
    const created: EditingSchedule[] = [];
    for (const number of additions) {
      const schedule = { number, dueDate, assign: assignees[assigneeIndex].name, status: '' as const };
      await this.schedules.append(schedule);
      created.push(schedule);
      assigneeIndex = (assigneeIndex + 1) % assignees.length;
      dueDate = addDays(dueDate, 7);
    }
    return created;
  }

  async remindDueEditors(): Promise<EditingSchedule[]> {
    const [schedules, users] = await Promise.all([this.schedules.listSchedules(), this.schedules.listUsers()]);
    const today = normalizeDate(this.today());
    const due = schedules.filter((schedule) => schedule.status !== 'done' && schedule.dueDate
      && addDays(schedule.dueDate, -this.reminderDaysBeforeDue) <= today);
    if (!due.length) return [];
    const usersByName = new Map(users.map((user) => [user.name, user.discordId]));
    const reminded: EditingSchedule[] = [];
    for (const schedule of due) {
      const active = schedule.status === '' ? await this.schedules.markInProgress(schedule.number) : schedule;
      const discordId = usersByName.get(active.assign);
      const overdue = normalizeDate(active.dueDate) < today ? '・期限超過' : '';
      const content = `${discordId ? `<@${discordId}>` : active.assign || '担当未設定'} ${active.number} の編集をお願いします（締切: ${active.dueDate}${overdue}）。`;
      let threadId = this.reminderThreadId(active.metadata);
      if (!threadId) {
        const thread = await this.discord.createEditingReminderThread(active.number, active.dueDate);
        threadId = thread.threadId;
        await this.schedules.saveMetadata(active.number, this.withReminderThread(active.metadata, threadId));
      }
      await this.discord.sendThreadMessage(threadId, content, discordId ? [discordId] : []);
      reminded.push(active);
    }
    return reminded;
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

  private nextDueDate(latestDoneDate: string | undefined): string {
    const earliest = addDays(weekStart(this.today()), 14);
    const next = latestDoneDate ? addDays(latestDoneDate, 7) : earliest;
    return next < earliest ? earliest : next;
  }
}

export function weekStart(value: string): string {
  const date = parseDate(value);
  const mondayOffset = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - mondayOffset);
  return date.toISOString().slice(0, 10).replaceAll('-', '/');
}

function normalizeDate(value: string): string {
  return parseDate(value).toISOString().slice(0, 10).replaceAll('-', '/');
}

function parseDate(value: string): Date {
  const normalized = value.replaceAll('-', '/');
  if (!/^\d{4}\/\d{2}\/\d{2}$/.test(normalized)) throw new Error(`Invalid date: ${value}`);
  const date = new Date(`${normalized.replaceAll('/', '-')}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10).replaceAll('-', '/') !== normalized) {
    throw new Error(`Invalid date: ${value}`);
  }
  return date;
}

function addDays(value: string, days: number): string {
  const date = parseDate(value);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10).replaceAll('-', '/');
}
