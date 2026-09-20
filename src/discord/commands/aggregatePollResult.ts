import type { AvailabilityResult } from '../../services/scheduling/schedulingService.js';
import type { DiscordCommand } from './types.js';

export const aggregatePollResultCommand: DiscordCommand = {
  definition: {
    name: 'aggregate_poll_result',
    description: '日程投票を集計します',
    type: 1,
  },
  async execute({ scheduling, followUp }): Promise<void> {
    try {
      const results = await scheduling.aggregatePollResults();
      for (const content of splitMessages(formatResults(results))) await followUp(content);
    } catch (error) {
      console.error('Discord poll aggregation failed', error);
      await followUp('集計に失敗しました。投票が作成済みか、設定とログを確認してください。');
    }
  },
};

function formatResults(results: AvailabilityResult[]): string {
  return [...results.map(({ date, available, tentative, unavailable }) => {
    const rows = [
      ['○', available],
      ['△', tentative],
      ['×', unavailable],
    ] as const;
    const countWidth = Math.max(...rows.map(([, userNames]) => String(userNames.length).length));
    return [
      `**${formatDateWithWeekday(date)}**`,
      '```text',
      ...rows.map(([symbol, userNames]) => `${symbol}  ${String(userNames.length).padStart(countWidth)}  ${names(userNames)}`),
      '```',
    ].join('\n');
  }), formatCandidateDates(results)].join('\n\n');
}

function formatCandidateDates(results: AvailabilityResult[]): string {
  const eligible = results.filter(({ unavailable }) => unavailable.length === 0);
  const voteCounts = [...new Set(eligible.map(({ available }) => available.length))].sort((left, right) => right - left);
  const topCount = voteCounts[0];
  const topRank = topCount === undefined ? [] : eligible.filter(({ available }) => available.length === topCount);
  const secondCount = voteCounts[1];
  const candidateResults = topRank.length >= 2 || secondCount === undefined ? topRank : eligible
    .filter(({ available }) => available.length >= secondCount)
  if (!candidateResults.length) return '**候補日**\n該当なし';
  const countWidth = Math.max(...candidateResults.flatMap(({ available, tentative, unavailable }) =>
    [available.length, tentative.length, unavailable.length].map(String).map((count) => count.length),
  ));
  return [
    '**候補日**',
    '```text',
    ...candidateResults.map(({ date, available, tentative, unavailable }) =>
      `${formatDateWithWeekday(date)}  ○ ${String(available.length).padStart(countWidth)}  △ ${String(tentative.length).padStart(countWidth)}  × ${String(unavailable.length).padStart(countWidth)}`,
    ),
    '```',
  ].join('\n');
}

function formatDateWithWeekday(date: string): string {
  const weekday = new Intl.DateTimeFormat('ja-JP', { timeZone: 'UTC', weekday: 'short' })
    .format(new Date(`${date}T00:00:00.000Z`));
  return `${date.replaceAll('-', '/')}（${weekday}）`;
}

function names(userNames: string[]): string {
  return userNames.length ? userNames.map((name) => name.replaceAll(/[`\r\n]/g, ' ')).join(', ') : '—';
}

function splitMessages(content: string): string[] {
  const chunks: string[] = [];
  let current = '';
  for (const section of content.split('\n\n')) {
    const next = current ? `${current}\n\n${section}` : section;
    if (next.length > 1_900 && current) {
      chunks.push(current);
      current = section;
    } else current = next;
  }
  if (current) chunks.push(current);
  return chunks;
}
