import fs from 'node:fs';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import {
  type ErrorCode,
  type S2CMessage,
  parseC2SMessage,
  sanitizeDisplayName,
} from '@together/game-core';
import Fastify, { type FastifyInstance } from 'fastify';
import { WebSocketServer, type WebSocket } from 'ws';
import { z } from 'zod';
import {
  DiscordOAuthError,
  type FetchLike,
  exchangeDiscordAuthorizationCode,
} from './auth/discordOAuth.js';
import { createSessionToken, verifySessionToken } from './auth/sessionToken.js';
import { type ServerConfig, loadServerConfig } from './config.js';
import { ActivityRoomManager } from './rooms/ActivityRoomManager.js';

const TokenRequestSchema = z.object({
  code: z.string().min(1).max(512),
});

const DevTokenRequestSchema = z.object({
  userId: z.string().min(1).max(64).optional(),
  username: z.string().min(1).max(32),
});

export interface ActivityServerInstance {
  app: FastifyInstance;
  wss: WebSocketServer;
  roomManager: ActivityRoomManager;
  config: ServerConfig;
  start: () => Promise<{ address: string; port: number }>;
  close: () => Promise<void>;
}

function sendJson(socket: WebSocket, message: S2CMessage): void {
  if (socket.readyState === socket.OPEN) {
    socket.send(JSON.stringify(message));
  }
}

function sendError(socket: WebSocket, code: ErrorCode, message: string): void {
  sendJson(socket, { type: 'error', code, message });
}

export async function createActivityServer(options: {
  config?: Partial<ServerConfig>;
  fetchFn?: FetchLike;
  logger?: boolean;
} = {}): Promise<ActivityServerInstance> {
  const config = loadServerConfig(options.config);
  const fetchFn = options.fetchFn ?? fetch;
  const startedAt = Date.now();
  const roomManager = new ActivityRoomManager(config.disconnectGraceMs);

  const app = Fastify({
    logger: options.logger ?? false,
  });

  await app.register(cors, {
    origin: true,
    methods: ['GET', 'POST', 'OPTIONS'],
  });

  const handleHealth = async () => {
    const stats = roomManager.getStats();
    return {
      ok: true,
      app: 'TOGETHER?',
      phase: 1,
      platform: 'discord-activity',
      discordConfigured: Boolean(config.discordClientId && config.discordClientSecret),
      devAuthEnabled: config.allowDevAuth,
      activeInstances: stats.activeInstances,
      activePlayers: stats.activePlayers,
      uptimeSec: Math.floor((Date.now() - startedAt) / 1000),
    };
  };

  app.get('/api/health', handleHealth);
  app.get('/.proxy/api/health', handleHealth);

  const handleDiscordToken = async (
    request: { body: unknown },
    reply: { code: (status: number) => { send: (payload: unknown) => unknown } },
  ) => {
    const parsed = TokenRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: 'INVALID_REQUEST',
        message: 'Missing or invalid OAuth2 authorization code.',
      });
    }

    try {
      const result = await exchangeDiscordAuthorizationCode({
        code: parsed.data.code,
        clientId: config.discordClientId,
        clientSecret: config.discordClientSecret,
        fetchFn,
      });

      const sessionToken = createSessionToken(
        {
          sub: result.user.id,
          username: result.user.username,
          globalName: result.user.globalName,
          avatarUrl: result.user.avatarUrl,
          source: 'discord',
        },
        config.sessionSecret,
      );

      return {
        access_token: result.accessToken,
        user: result.user,
        sessionToken,
      };
    } catch (error) {
      if (error instanceof DiscordOAuthError) {
        return reply.code(error.statusCode).send({
          error: error.code,
          message: error.message,
        });
      }
      return reply.code(500).send({
        error: 'INTERNAL_ERROR',
        message: 'Failed to complete Discord authentication.',
      });
    }
  };

  app.post('/api/token', handleDiscordToken);
  app.post('/.proxy/api/token', handleDiscordToken);

  const handleDevToken = async (
    request: { body: unknown },
    reply: { code: (status: number) => { send: (payload: unknown) => unknown } },
  ) => {
    if (!config.allowDevAuth) {
      return reply.code(403).send({
        error: 'DEV_AUTH_DISABLED',
        message: 'Local development auth is disabled on this server.',
      });
    }

    const parsed = DevTokenRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: 'INVALID_REQUEST',
        message: 'Provide a valid username (1–32 chars).',
      });
    }

    const cleanName = sanitizeDisplayName(null, parsed.data.username);
    const id =
      parsed.data.userId ??
      `dev_${cleanName.toLowerCase().replace(/[^a-z0-9]/g, '')}_${Math.random().toString(36).slice(2, 8)}`;

    const sessionToken = createSessionToken(
      {
        sub: id,
        username: cleanName,
        globalName: cleanName,
        avatarUrl: null,
        source: 'dev',
      },
      config.sessionSecret,
    );

    return {
      user: {
        id,
        username: cleanName,
        globalName: cleanName,
        displayName: cleanName,
        avatarUrl: null,
      },
      sessionToken,
    };
  };

  app.post('/api/dev-token', handleDevToken);
  app.post('/.proxy/api/dev-token', handleDevToken);

  if (config.serveStaticDir && fs.existsSync(config.serveStaticDir)) {
    await app.register(fastifyStatic, {
      root: config.serveStaticDir,
      prefix: '/',
    });
    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith('/api') || request.url.startsWith('/.proxy/api')) {
        return reply.code(404).send({ error: 'NOT_FOUND', message: 'API route not found.' });
      }
      return reply.sendFile('index.html');
    });
  }

  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: 8 * 1024,
  });

  const handleUpgrade = (
    request: import('node:http').IncomingMessage,
    socket: import('node:stream').Duplex,
    head: Buffer,
  ) => {
    const rawUrl = request.url ?? '/';
    const pathname = rawUrl.split('?')[0] ?? '/';
    if (pathname !== '/ws' && pathname !== '/.proxy/ws') {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  };

  app.server.on('upgrade', handleUpgrade);

  wss.on('connection', (socket) => {
    let windowStart = Date.now();
    let msgCount = 0;

    socket.on('message', (raw) => {
      const now = Date.now();
      if (now - windowStart >= 1000) {
        windowStart = now;
        msgCount = 0;
      }
      msgCount += 1;
      if (msgCount > 40) {
        sendError(socket, 'RATE_LIMITED', 'Too many messages sent. Slow down.');
        return;
      }

      let decoded: unknown;
      try {
        decoded = JSON.parse(raw.toString('utf8'));
      } catch {
        sendError(socket, 'INVALID_MESSAGE', 'Malformed JSON payload.');
        return;
      }

      const message = parseC2SMessage(decoded);
      if (!message) {
        sendError(socket, 'INVALID_MESSAGE', 'Message failed schema validation.');
        return;
      }

      switch (message.type) {
        case 'ping': {
          sendJson(socket, {
            type: 'pong',
            clientTime: message.clientTime,
            serverTime: Date.now(),
          });
          return;
        }
        case 'join_instance': {
          const verifiedUser = verifySessionToken(message.sessionToken, config.sessionSecret);
          if (!verifiedUser) {
            sendError(socket, 'UNAUTHORIZED', 'Invalid or expired Activity session token.');
            return;
          }
          if (verifiedUser.source === 'dev' && !config.allowDevAuth) {
            sendError(socket, 'UNAUTHORIZED', 'Development tokens are not allowed.');
            return;
          }

          const result = roomManager.joinInstance({
            instanceId: message.instanceId,
            channelId: message.channelId ?? null,
            guildId: message.guildId ?? null,
            user: verifiedUser,
            socket,
          });

          if (!result.ok) {
            sendError(socket, result.code, result.message);
            return;
          }

          sendJson(socket, {
            type: 'welcome',
            playerId: result.playerId,
            reconnected: result.reconnected,
            room: result.room,
          });
          return;
        }
        case 'set_ready': {
          const updated = roomManager.setReady(socket, message.ready);
          if (!updated) {
            sendError(socket, 'NOT_IN_ROOM', 'Join an Activity instance before updating ready state.');
          }
          return;
        }
      }
    });

    socket.on('close', () => {
      roomManager.handleDisconnect(socket);
    });

    socket.on('error', () => {
      roomManager.handleDisconnect(socket);
    });
  });

  return {
    app,
    wss,
    roomManager,
    config,
    async start() {
      const address = await app.listen({ port: config.port, host: config.host });
      const addrInfo = app.server.address();
      const boundPort = typeof addrInfo === 'object' && addrInfo ? addrInfo.port : config.port;
      return { address, port: boundPort };
    },
    async close() {
      roomManager.dispose();
      for (const client of wss.clients) {
        client.terminate();
      }
      await new Promise<void>((resolve) => wss.close(() => resolve()));
      await app.close();
    },
  };
}
