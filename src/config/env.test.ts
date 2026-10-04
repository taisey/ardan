import { describe, expect, it } from 'vitest';
import { loadDiscordCommandConfig } from './env.js';

describe('loadDiscordCommandConfig', () => {
  it('rejects a Discord application ID containing trailing text', () => {
    expect(() => loadDiscordCommandConfig({
      DISCORD_BOT_TOKEN: 'bot-token',
      DISCORD_APPLICATION_ID: '1550285581467123773# ardan',
      DISCORD_GUILD_ID: 'guild-id',
    })).toThrow('DISCORD_APPLICATION_ID must contain only the numeric Discord application ID');
  });
});
