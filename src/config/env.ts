type Environment = Record<string, string | undefined>;

export type DiscordConfig = {
  botToken: string;
  applicationId: string;
  noticeChannelId: string;
  mentionRoleId: string;
};

export type GoogleConfig = {
  spreadsheetId: string;
  sheetGid: number;
  serviceAccount: Record<string, unknown>;
};

export type AppConfig = {
  timezone: string;
  discord: DiscordConfig;
  google: GoogleConfig;
};

export type SchedulingConfig = Pick<AppConfig, 'discord' | 'google' | 'timezone'>;

export type DiscordCommandConfig = Pick<DiscordConfig, 'botToken' | 'applicationId'> & {
  guildId: string;
};

function required(env: Environment, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function parseServiceAccount(value: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
    return parsed as Record<string, unknown>;
  } catch {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON must be valid JSON');
  }
}

function parseSheetGid(value: string): number {
  const gid = Number(value);
  if (!Number.isSafeInteger(gid) || gid < 0) throw new Error('GOOGLE_SHEET_GID must be a non-negative integer');
  return gid;
}

export function loadSchedulingConfig(env: Environment = process.env): SchedulingConfig {
  return {
    timezone: env.TZ?.trim() || 'Asia/Tokyo',
    discord: {
      botToken: required(env, 'DISCORD_BOT_TOKEN'),
      applicationId: '',
      noticeChannelId: required(env, 'DISCORD_NOTICE_CHANNEL_ID'),
      mentionRoleId: required(env, 'DISCORD_MENTION_ROLE_ID'),
    },
    google: {
      spreadsheetId: required(env, 'GOOGLE_SPREADSHEET_ID'),
      sheetGid: parseSheetGid(required(env, 'GOOGLE_SHEET_GID')),
      serviceAccount: parseServiceAccount(required(env, 'GOOGLE_SERVICE_ACCOUNT_JSON')),
    },
  };
}

export function loadAppConfig(env: Environment = process.env): AppConfig {
  const scheduling = loadSchedulingConfig(env);
  return {
    ...scheduling,
    discord: {
      ...scheduling.discord,
      applicationId: required(env, 'DISCORD_APPLICATION_ID'),
    },
  };
}

export function loadDiscordCommandConfig(env: Environment = process.env): DiscordCommandConfig {
  return {
    botToken: required(env, 'DISCORD_BOT_TOKEN'),
    applicationId: required(env, 'DISCORD_APPLICATION_ID'),
    guildId: required(env, 'DISCORD_GUILD_ID'),
  };
}
