type Environment = Record<string, string | undefined>;

export type DiscordConfig = {
  botToken: string;
  applicationId: string;
  guildId: string;
  noticeChannelId: string;
  mentionRoleId: string;
};

export type GoogleConfig = {
  spreadsheetId: string;
  sheetGid: number;
  serviceAccount: Record<string, unknown>;
};

export type EditingScheduleConfig = Pick<AppConfig, 'discord' | 'timezone'> & {
  google: GoogleConfig & {
    editingScheduleSheetGid: number;
    editingScheduleAssignOrderSheetGid: number;
    usersSheetGid: number;
    editingSourceFolderId: string;
  };
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

function parseSheetGid(value: string, name: string): number {
  const gid = Number(value);
  if (!Number.isSafeInteger(gid) || gid < 0) throw new Error(`${name} must be a non-negative integer`);
  return gid;
}

export function loadSchedulingConfig(env: Environment = process.env): SchedulingConfig {
  return {
    timezone: env.TZ?.trim() || 'Asia/Tokyo',
    discord: {
      botToken: required(env, 'DISCORD_BOT_TOKEN'),
      applicationId: '',
      guildId: required(env, 'DISCORD_GUILD_ID'),
      noticeChannelId: required(env, 'DISCORD_NOTICE_CHANNEL_ID'),
      mentionRoleId: required(env, 'DISCORD_MENTION_ROLE_ID'),
    },
    google: {
      spreadsheetId: required(env, 'GOOGLE_SPREADSHEET_ID'),
      sheetGid: parseSheetGid(required(env, 'GOOGLE_RECORDING_SCHEDULE_SHEET_GID'), 'GOOGLE_RECORDING_SCHEDULE_SHEET_GID'),
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

export function loadEditingScheduleConfig(env: Environment = process.env): EditingScheduleConfig {
  const scheduling = loadSchedulingConfig(env);
  return {
    ...scheduling,
    google: {
      ...scheduling.google,
      editingScheduleSheetGid: parseSheetGid(required(env, 'GOOGLE_EDITING_SCHEDULE_SHEET_GID'), 'GOOGLE_EDITING_SCHEDULE_SHEET_GID'),
      editingScheduleAssignOrderSheetGid: parseSheetGid(required(env, 'GOOGLE_EDITING_SCHEDULE_ASSIGN_ORDER_SHEET_GID'), 'GOOGLE_EDITING_SCHEDULE_ASSIGN_ORDER_SHEET_GID'),
      usersSheetGid: parseSheetGid(required(env, 'GOOGLE_USERS_SHEET_GID'), 'GOOGLE_USERS_SHEET_GID'),
      editingSourceFolderId: required(env, 'GOOGLE_EDITING_SOURCE_FOLDER_ID'),
    },
  };
}

export function loadOptionalEditingScheduleConfig(env: Environment = process.env): EditingScheduleConfig | undefined {
  return env.GOOGLE_EDITING_SOURCE_FOLDER_ID?.trim() ? loadEditingScheduleConfig(env) : undefined;
}

export type RssConfig = {
  botToken: string;
  channelId: string;
  spreadsheetId: string;
  sheetGid: number;
  serviceAccount: Record<string, unknown>;
  pollLockPath: string;
};

export function loadRssConfig(env: Environment = process.env): RssConfig {
  return {
    botToken: required(env, 'DISCORD_BOT_TOKEN'),
    channelId: required(env, 'DISCORD_RSS_CHANNEL_ID'),
    spreadsheetId: required(env, 'GOOGLE_SPREADSHEET_ID'),
    sheetGid: parseSheetGid(required(env, 'GOOGLE_RSS_FEEDS_SHEET_GID'), 'GOOGLE_RSS_FEEDS_SHEET_GID'),
    serviceAccount: parseServiceAccount(required(env, 'GOOGLE_SERVICE_ACCOUNT_JSON')),
    pollLockPath: env.RSS_POLL_LOCK_PATH?.trim() || 'data/rss-poll.lock',
  };
}

export function loadOptionalRssConfig(env: Environment = process.env): RssConfig | undefined {
  return env.DISCORD_RSS_CHANNEL_ID?.trim() || env.GOOGLE_RSS_FEEDS_SHEET_GID?.trim() ? loadRssConfig(env) : undefined;
}
