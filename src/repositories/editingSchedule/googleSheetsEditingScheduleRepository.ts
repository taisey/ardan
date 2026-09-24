import type { GoogleSheetsClient } from '../../clients/googleSheets.js';
import { episodeOrder, isEpisodeNumber, type EditingAssignee, type EditingSchedule, type EditingUser } from '../../models/editingSchedule.js';

export class GoogleSheetsEditingScheduleRepository {
  constructor(
    private readonly sheets: GoogleSheetsClient,
    private readonly editingScheduleSheetGid: number,
    private readonly assignOrderSheetGid: number,
    private readonly usersSheetGid: number,
  ) {}

  async listSchedules(): Promise<EditingSchedule[]> {
    const rows = await this.sheets.readRows(`${await this.sheetTitle(this.editingScheduleSheetGid)}!A2:E`);
    return rows.flatMap((row) => {
      const number = row[0]?.trim() ?? '';
      if (!number) return [];
      const status = row[3]?.trim();
      if (status !== 'in_progress' && status !== 'done') throw new Error(`${number} status must be in_progress or done`);
      const metadata = this.parseMetadata(row[4]);
      return [{ number, startDueWeek: row[1]?.trim() ?? '', assign: row[2]?.trim() ?? '', status, ...(metadata ? { metadata } : {}) }];
    });
  }

  async listAssignees(): Promise<EditingAssignee[]> {
    const rows = await this.sheets.readRows(`${await this.sheetTitle(this.assignOrderSheetGid)}!A2:B`);
    const assignees = rows.flatMap((row) => {
      const order = Number(row[0]);
      const name = row[1]?.trim() ?? '';
      return Number.isSafeInteger(order) && order > 0 && name ? [{ order, name }] : [];
    }).sort((left, right) => left.order - right.order);
    if (!assignees.length) throw new Error('editing_schedule_assign_order must contain at least one valid order and name');
    return assignees;
  }

  async listUsers(): Promise<EditingUser[]> {
    const rows = await this.sheets.readRows(`${await this.sheetTitle(this.usersSheetGid)}!A2:B`);
    return rows.flatMap((row) => {
      const name = row[0]?.trim() ?? '';
      const discordId = row[1]?.trim() ?? '';
      return name && discordId ? [{ name, discordId }] : [];
    });
  }

  async append(schedule: EditingSchedule): Promise<void> {
    await this.sheets.appendRow(`${await this.sheetTitle(this.editingScheduleSheetGid)}!A:E`, this.toRow(schedule));
  }

  async markDone(number: string): Promise<EditingSchedule> {
    const schedules = await this.listSchedules();
    const requestedOrder = episodeOrder(number);
    const matches = schedules.map((schedule, index) => ({ schedule, index }))
      .filter(({ schedule }) => isEpisodeNumber(schedule.number) && episodeOrder(schedule.number) === requestedOrder);
    if (!matches.length) throw new Error(`Editing schedule not found: ${number}`);
    if (matches.length > 1) throw new Error(`Multiple editing schedules match: ${number}`);
    const { schedule, index } = matches[0];
    const completed: EditingSchedule = { ...schedule, status: 'done' };
    await this.sheets.updateRow(`${await this.sheetTitle(this.editingScheduleSheetGid)}!A${index + 2}:E${index + 2}`, this.toRow(completed));
    return completed;
  }

  async saveMetadata(number: string, metadata: Record<string, unknown>): Promise<void> {
    const schedules = await this.listSchedules();
    const match = schedules.map((schedule, index) => ({ schedule, index }))
      .find(({ schedule }) => schedule.number === number);
    if (!match) throw new Error(`Editing schedule not found: ${number}`);
    await this.sheets.updateRow(`${await this.sheetTitle(this.editingScheduleSheetGid)}!A${match.index + 2}:E${match.index + 2}`,
      this.toRow({ ...match.schedule, metadata }));
  }

  private sheetTitle(gid: number): Promise<string> {
    return this.sheets.getSheetTitle(gid);
  }

  private toRow(schedule: EditingSchedule): string[] {
    return [schedule.number, schedule.startDueWeek, schedule.assign, schedule.status, schedule.metadata ? JSON.stringify(schedule.metadata) : ''];
  }

  private parseMetadata(value: string | undefined): Record<string, unknown> | undefined {
    if (!value) return undefined;
    try {
      const parsed: unknown = JSON.parse(value);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
      return parsed as Record<string, unknown>;
    } catch {
      throw new Error('editing_schedule metadata must be a JSON object');
    }
  }
}
