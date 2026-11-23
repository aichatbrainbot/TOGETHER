import { DiscordSDK, Events } from '@discord/embedded-app-sdk';
import { buildDiscordAvatarUrl, sanitizeDisplayName } from '@together/game-core';

export interface DiscordUserSummary {
  id: string;
  username: string;
  globalName: string | null;
  displayName: string;
  avatarUrl: string | null;
}

export interface ActivitySessionContext {
  mode: 'discord' | 'local-dev';
  instanceId: string;
  channelId: string | null;
  guildId: string | null;
  platform: 'desktop' | 'mobile' | 'web';
  user: DiscordUserSummary;
  sessionToken: string;
  wsUrl: string;
  initialSdkParticipants: DiscordUserSummary[];
  onParticipantsUpdate: (cb: (participants: DiscordUserSummary[]) => void) => () => void;
  onLayoutModeUpdate: (cb: (layoutMode: number) => void) => () => void;
  cleanup: () => void;
}

export interface BootProgress {
  step: string;
  detail: string;
}

interface TokenApiResponse {
  access_token?: string;
  user?: DiscordUserSummary;
  sessionToken?: string;
  error?: string;
  message?: string;
}

interface RawParticipant {
  id: string;
  username: string;
  global_name?: string | null;
  avatar?: string | null;
  discriminator?: string;
  nickname?: string | null;
}

export function isRunningInsideDiscord(): boolean {
  const params = new URLSearchParams(window.location.search);
  return params.has('frame_id') && params.has('instance_id');
}

function mapSdkParticipant(raw: RawParticipant): DiscordUserSummary {
  const globalName = raw.nickname ?? raw.global_name ?? null;
  return {
    id: raw.id,
    username: raw.username,
    globalName,
    displayName: sanitizeDisplayName(globalName, raw.username),
    avatarUrl: buildDiscordAvatarUrl(raw.id, raw.avatar ?? null, raw.discriminator),
  };
}

function buildWebSocketUrl(useDiscordProxy: boolean): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const path = useDiscordProxy ? '/.proxy/ws' : '/ws';
  return `${protocol}//${window.location.host}${path}`;
}

export async function bootstrapDiscordActivity(
  onProgress: (progress: BootProgress) => void,
): Promise<ActivitySessionContext> {
  const embedded = isRunningInsideDiscord();

  if (!embedded) {
    return bootstrapLocalDevPreview(onProgress);
  }

  const clientId = (import.meta.env.VITE_DISCORD_CLIENT_ID ?? '').trim();
  if (!clientId || clientId === 'your_discord_application_client_id_here') {
    throw new Error(
      'Missing VITE_DISCORD_CLIENT_ID. Set your Discord Application Client ID in the root .env file and rebuild.',
    );
  }

  onProgress({
    step: 'sdk-init',
    detail: 'Connecting to Discord Embedded App SDK...',
  });

  const discordSdk = new DiscordSDK(clientId);
  await discordSdk.ready();

  onProgress({
    step: 'authorize',
    detail: 'Requesting Discord user authorization...',
  });

  const { code } = await discordSdk.commands.authorize({
    client_id: clientId,
    response_type: 'code',
    state: '',
    prompt: 'none',
    scope: ['identify'],
  });

  onProgress({
    step: 'token-exchange',
    detail: 'Verifying session through /.proxy/api/token...',
  });

  const tokenResponse = await fetch('/.proxy/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });

  const tokenData = (await tokenResponse.json().catch(() => ({}))) as TokenApiResponse;
  if (!tokenResponse.ok || !tokenData.access_token || !tokenData.sessionToken || !tokenData.user) {
    throw new Error(
      tokenData.message ??
        `Token exchange failed (HTTP ${tokenResponse.status}). Check your server OAuth2 credentials and Developer Portal OAuth2 settings.`,
    );
  }

  onProgress({
    step: 'authenticate',
    detail: 'Authenticating Discord Activity SDK...',
  });

  const auth = await discordSdk.commands.authenticate({
    access_token: tokenData.access_token,
  });

  if (!auth) {
    throw new Error('Discord SDK authenticate() returned an empty response.');
  }

  onProgress({
    step: 'participants',
    detail: 'Syncing Activity participants...',
  });

  let initialSdkParticipants: DiscordUserSummary[] = [tokenData.user];
  try {
    const res = await discordSdk.commands.getInstanceConnectedParticipants();
    if (res && Array.isArray(res.participants)) {
      initialSdkParticipants = (res.participants as RawParticipant[]).map(mapSdkParticipant);
    }
  } catch {
    // Graceful degradation if participant permissions are restricted
  }

  const participantListeners = new Set<(participants: DiscordUserSummary[]) => void>();
  const layoutListeners = new Set<(layoutMode: number) => void>();

  const handleParticipantsEvent = (event: { participants?: RawParticipant[] }) => {
    if (!event || !Array.isArray(event.participants)) return;
    const mapped = event.participants.map(mapSdkParticipant);
    for (const listener of participantListeners) {
      listener(mapped);
    }
  };

  const handleLayoutEvent = (event: { layout_mode?: number }) => {
    if (!event || typeof event.layout_mode !== 'number') return;
    for (const listener of layoutListeners) {
      listener(event.layout_mode);
    }
  };

  let subscribedParticipants = false;
  let subscribedLayout = false;

  try {
    await discordSdk.subscribe(
      Events.ACTIVITY_INSTANCE_PARTICIPANTS_UPDATE,
      handleParticipantsEvent,
    );
    subscribedParticipants = true;
  } catch {
    // Non-fatal; server WebSocket roster remains authoritative
  }

  try {
    await discordSdk.subscribe(Events.ACTIVITY_LAYOUT_MODE_UPDATE, handleLayoutEvent);
    subscribedLayout = true;
  } catch {
    // Non-fatal
  }

  const sdkPlatform = String(discordSdk.platform ?? 'desktop').toLowerCase();
  const platform: 'desktop' | 'mobile' | 'web' =
    sdkPlatform === 'mobile' ? 'mobile' : 'desktop';

  return {
    mode: 'discord',
    instanceId: discordSdk.instanceId,
    channelId: discordSdk.channelId ?? null,
    guildId: discordSdk.guildId ?? null,
    platform,
    user: tokenData.user,
    sessionToken: tokenData.sessionToken,
    wsUrl: buildWebSocketUrl(true),
    initialSdkParticipants,
    onParticipantsUpdate(cb) {
      participantListeners.add(cb);
      return () => participantListeners.delete(cb);
    },
    onLayoutModeUpdate(cb) {
      layoutListeners.add(cb);
      return () => layoutListeners.delete(cb);
    },
    cleanup() {
      if (subscribedParticipants) {
        void discordSdk
          .unsubscribe(Events.ACTIVITY_INSTANCE_PARTICIPANTS_UPDATE, handleParticipantsEvent)
          .catch(() => {});
      }
      if (subscribedLayout) {
        void discordSdk
          .unsubscribe(Events.ACTIVITY_LAYOUT_MODE_UPDATE, handleLayoutEvent)
          .catch(() => {});
      }
      participantListeners.clear();
      layoutListeners.clear();
    },
  };
}

async function bootstrapLocalDevPreview(
  onProgress: (progress: BootProgress) => void,
): Promise<ActivitySessionContext> {
  onProgress({
    step: 'local-dev',
    detail: 'Running outside Discord — initializing local preview session...',
  });

  const params = new URLSearchParams(window.location.search);
  const instanceId = (params.get('instance') ?? 'local-dev-instance').trim() || 'local-dev-instance';

  let storedUserId = sessionStorage.getItem('together_dev_user_id');
  if (!storedUserId) {
    storedUserId = `dev_${Math.random().toString(36).slice(2, 8)}`;
    sessionStorage.setItem('together_dev_user_id', storedUserId);
  }
  const requestedUserId = params.get('userId')?.trim() || storedUserId;
  const requestedName =
    params.get('user')?.trim() || `DevPlayer_${requestedUserId.slice(-4).toUpperCase()}`;

  const res = await fetch('/api/dev-token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId: requestedUserId,
      username: requestedName,
    }),
  });

  const data = (await res.json().catch(() => ({}))) as TokenApiResponse;
  if (!res.ok || !data.sessionToken || !data.user) {
    throw new Error(
      data.message ??
        'Local dev preview auth failed. Launch this app inside Discord, or enable ALLOW_DEV_AUTH=true in .env.',
    );
  }

  return {
    mode: 'local-dev',
    instanceId,
    channelId: 'local-dev-channel',
    guildId: 'local-dev-guild',
    platform: 'web',
    user: data.user,
    sessionToken: data.sessionToken,
    wsUrl: buildWebSocketUrl(false),
    initialSdkParticipants: [data.user],
    onParticipantsUpdate: () => () => {},
    onLayoutModeUpdate: () => () => {},
    cleanup: () => {},
  };
}
