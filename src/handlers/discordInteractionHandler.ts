import nacl from 'tweetnacl';
import { OpenAPI } from '../generated/core/OpenAPI.js';
import { SchedulingService as SchedulingApiClient } from '../generated/services/SchedulingService.js';

type DiscordInteraction = {
  type: number;
  id: string;
  token: string;
  data?: { name?: string; options?: Array<{ name?: string; value?: string | number | boolean }> };
};

type InteractionResult = { response: Record<string, unknown>; afterResponse?: () => Promise<void> };

function option(interaction: DiscordInteraction, name: string): string | undefined {
  const value = interaction.data?.options?.find((item) => item.name === name)?.value;
  return typeof value === 'string' ? value.trim() : undefined;
}

export class DiscordInteractionHandler {
  constructor(
    private readonly publicKey: string,
    apiBaseUrl: string,
    private readonly internalApiKey: string,
    private readonly applicationId: string,
  ) {
    OpenAPI.BASE = apiBaseUrl;
  }

  verify(signature: string | undefined, timestamp: string | undefined, rawBody: Buffer): boolean {
    if (!signature || !timestamp || !/^[0-9a-f]{128}$/i.test(signature) || !/^[0-9a-f]{64}$/i.test(this.publicKey)) return false;
    return nacl.sign.detached.verify(
      Buffer.from(`${timestamp}${rawBody.toString('utf8')}`),
      Buffer.from(signature, 'hex'),
      Buffer.from(this.publicKey, 'hex'),
    );
  }

  handle(interaction: DiscordInteraction): InteractionResult {
    if (interaction.type === 1) return { response: { type: 1 } };
    if (interaction.type !== 2 || !interaction.data?.name) {
      return { response: { type: 4, data: { content: 'Unsupported interaction.', flags: 64 } } };
    }
    if (interaction.data.name === 'create_recording_date_poll') {
      const title = option(interaction, 'title');
      const dates = option(interaction, 'candidate_dates')?.split(',').map((date) => date.trim()).filter(Boolean);
      if (!title || !dates) return { response: { type: 4, data: { content: 'title and candidate_dates are required.', flags: 64 } } };
      return this.deferred(interaction, async () => {
        const result = await SchedulingApiClient.createRecordingDatePoll({
          xInternalApiKey: this.internalApiKey,
          requestBody: { title, candidateDates: dates },
        });
        await this.followUp(interaction.token, result.created ? `投票を作成しました: ${title}` : '作成対象の日程がないため、投票を作成しませんでした。');
      });
    }
    return { response: { type: 4, data: { content: 'Unknown command.', flags: 64 } } };
  }

  private deferred(interaction: DiscordInteraction, operation: () => Promise<void>): InteractionResult {
    return { response: { type: 5, data: { flags: 64 } }, afterResponse: async () => {
      try { await operation(); }
      catch (error) { console.error('Discord interaction operation failed', error); await this.followUp(interaction.token, '処理に失敗しました。設定とログを確認してください。'); }
    } };
  }

  private async followUp(interactionToken: string, content: string): Promise<void> {
    const response = await fetch(`https://discord.com/api/v10/webhooks/${this.applicationId}/${interactionToken}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content, flags: 64 }),
    });
    if (!response.ok) console.error(`Discord follow-up failed (${response.status})`);
  }
}
