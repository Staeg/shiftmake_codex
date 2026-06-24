import { WebSocketServer, type WebSocket } from 'ws';
import { randomBytes, randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage as HttpIncomingMessage, type ServerResponse } from 'node:http';
import type { IncomingMessage } from 'node:http';
import { startNewGame } from '../engine/game';
import { generateBaselineLadderPayload } from '../engine/ladder';
import { describeMultiplayerListenAddress, getMultiplayerServerConfig, type MultiplayerServerConfig } from './multiplayerServerConfig';
import { getLadderRepository } from './ladderRepository';
import {
  advanceContestMultiplayerRoom,
  buildStoredReplayPayloadMap,
  DEFAULT_CONTEST_PLAYER_NAMES,
  projectContestRoomStateForPlayer,
  projectReplayIndexForPlayer,
  projectStoredReplayPayloadMapForPlayer,
  validateAndApplyContestSubmission,
  type ContestMultiplayerSubmission,
  type ContestPlayerNames,
} from '../engine/multiplayerContest';
import type { ContestPlayerId, GameState, StoredReplayPayload } from '../engine/types';

type ClientMessage =
  | { kind: 'create-room'; roomId?: string; seed?: number; playerName?: string }
  | { kind: 'join-room'; roomId: string; playerName?: string }
  | { kind: 'reconnect-room'; roomId: string; playerId: ContestPlayerId; token: string; playerName?: string }
  | { kind: 'submit-ready'; submission: ContestMultiplayerSubmission; game?: GameState }
  | { kind: 'unsubmit-ready' }
  | { kind: 'leave-room' };

type ServerMessage =
  | {
      kind: 'room-snapshot';
      roomId: string;
      playerId: ContestPlayerId;
      playerToken: string;
      game: GameState;
      readiness: Record<ContestPlayerId, boolean>;
      connectedPlayers: Record<ContestPlayerId, boolean>;
      playerNames: ContestPlayerNames;
      replayPayloads: Record<string, StoredReplayPayload>;
      message: string | null;
    }
  | { kind: 'room-error'; message: string };

interface RoomClient {
  socket: WebSocket;
  playerId: ContestPlayerId;
}

interface ContestRoom {
  id: string;
  game: GameState;
  clients: Partial<Record<ContestPlayerId, RoomClient>>;
  playerTokens: Partial<Record<ContestPlayerId, string>>;
  submissions: Partial<Record<ContestPlayerId, GameState>>;
  replayPayloads: Record<string, StoredReplayPayload>;
  playerNames: ContestPlayerNames;
  createdAt: number;
  updatedAt: number;
  lastEmptyAt: number | null;
}

type RoomMessage = string | null | Partial<Record<ContestPlayerId, string | null>>;

const serverConfig = getMultiplayerServerConfig();
const rooms = new Map<string, ContestRoom>();
const socketRooms = new Map<WebSocket, { roomId: string; playerId: ContestPlayerId }>();
const socketRateLimits = new WeakMap<WebSocket, { windowStartedAt: number; count: number }>();
const socketHeartbeatAlive = new WeakMap<WebSocket, boolean>();
const socketRemoteAddresses = new WeakMap<WebSocket, string>();
const ipRateLimits = new Map<string, { windowStartedAt: number; count: number }>();
const EMPTY_ROOM_TTL_MS = 30 * 60 * 1000;
const ROOM_CLEANUP_INTERVAL_MS = 60 * 1000;
const MAX_MESSAGE_BYTES = 32 * 1024;
const RATE_LIMIT_WINDOW_MS = 10 * 1000;
const MAX_MESSAGES_PER_WINDOW = 40;
const HEARTBEAT_INTERVAL_MS = 30 * 1000;
const MAX_HTTP_BODY_BYTES = 256 * 1024;
const ladderRepository = getLadderRepository();
let ladderReadyPromise: Promise<void> | null = null;

function ensureLadderReady(): Promise<void> {
  ladderReadyPromise ??= ladderRepository.init().then(() => ladderRepository.seedBaseline());
  return ladderReadyPromise;
}

function makeRoomId(): string {
  return randomBytes(4).toString('hex').toUpperCase();
}

function makePlayerToken(): string {
  return Buffer.from(randomBytes(24)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function send(socket: WebSocket, message: ServerMessage): void {
  if (socket.readyState === socket.OPEN) {
    socket.send(JSON.stringify(message));
  }
}

function sendJson(response: ServerResponse, status: number, payload: unknown): void {
  response.writeHead(status, {
    'content-type': 'application/json',
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'content-type',
  });
  response.end(JSON.stringify(payload));
}

async function readJsonBody(request: HttpIncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buffer.byteLength;
    if (totalBytes > MAX_HTTP_BODY_BYTES) {
      throw new Error('Request body is too large.');
    }
    chunks.push(buffer);
  }
  if (chunks.length === 0) {
    return {};
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function numberFromQuery(value: string | null): number | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : undefined;
}

async function drawLadderSet(cycleNumber: number) {
  let record = await ladderRepository.draw(cycleNumber);
  if (!record) {
    const payload = generateBaselineLadderPayload(Date.now() >>> 0, cycleNumber);
    record = await ladderRepository.insert({
      id: randomUUID(),
      cycleNumber,
      generation: 0,
      sourceSetId: null,
      appearances: 0,
      spent: false,
      compatibilityStatus: 'valid',
      compatibilityIssues: [],
      payload,
    });
  }
  return {
    id: record.id,
    cycleNumber: record.cycleNumber,
    generation: record.generation,
    sourceSetId: record.sourceSetId,
    payload: record.payload,
  };
}

async function handleHttpRequest(request: HttpIncomingMessage, response: ServerResponse): Promise<void> {
  if (request.method === 'OPTIONS') {
    sendJson(response, 204, {});
    return;
  }

  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
  try {
    if (url.pathname.startsWith('/ladder/')) {
      await ensureLadderReady();
    }

    if (request.method === 'POST' && url.pathname === '/ladder/draw') {
      const body = await readJsonBody(request);
      const cycleNumber = typeof body === 'object' && body !== null && Number.isInteger((body as { cycleNumber?: unknown }).cycleNumber)
        ? Number((body as { cycleNumber: number }).cycleNumber)
        : 0;
      if (cycleNumber < 1 || cycleNumber > 10) {
        sendJson(response, 400, { error: 'cycleNumber must be an integer from 1 to 10.' });
        return;
      }
      sendJson(response, 200, await drawLadderSet(cycleNumber));
      return;
    }

    if (request.method === 'POST' && url.pathname === '/ladder/harvest') {
      const body = await readJsonBody(request);
      if (typeof body !== 'object' || body === null || typeof (body as { parentId?: unknown }).parentId !== 'string') {
        sendJson(response, 400, { error: 'parentId is required.' });
        return;
      }
      const parentId = (body as { parentId: string }).parentId;
      const payload = (body as { payload?: unknown }).payload;
      if (typeof payload !== 'object' || payload === null) {
        sendJson(response, 400, { error: 'payload is required.' });
        return;
      }
      await ladderRepository.incrementAppearances(parentId);
      const parentSpent = Math.random() < 0.5;
      if (parentSpent) {
        await ladderRepository.markSpent(parentId, true);
      }
      const child = await ladderRepository.harvestChild(parentId, payload as never);
      sendJson(response, 200, {
        parentId,
        childId: child.id,
        parentSpent,
        payload: child.payload,
      });
      return;
    }

    if (request.method === 'GET' && url.pathname === '/ladder/list') {
      const records = await ladderRepository.list({
        cycleNumber: numberFromQuery(url.searchParams.get('cycleNumber')),
        generation: numberFromQuery(url.searchParams.get('generation')),
        spent: url.searchParams.has('spent') ? url.searchParams.get('spent') === 'true' : undefined,
        compatibilityStatus:
          url.searchParams.get('compatibilityStatus') === 'valid' || url.searchParams.get('compatibilityStatus') === 'incompatible'
            ? (url.searchParams.get('compatibilityStatus') as 'valid' | 'incompatible')
            : undefined,
        limit: numberFromQuery(url.searchParams.get('limit')),
      });
      sendJson(response, 200, { records });
      return;
    }

    if (request.method === 'GET' && url.pathname === '/ladder/stats') {
      sendJson(response, 200, await ladderRepository.storageStats());
      return;
    }
  } catch (error) {
    sendJson(response, 500, { error: error instanceof Error ? error.message : 'Ladder server error.' });
    return;
  }

  sendJson(response, 404, { error: 'Not found.' });
}

function byteLength(raw: WebSocket.RawData): number {
  if (typeof raw === 'string') {
    return Buffer.byteLength(raw);
  }
  if (Array.isArray(raw)) {
    return raw.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  }
  return raw.byteLength;
}

function normalizeRoomId(roomId: string | undefined): string {
  return roomId?.trim().toUpperCase() ?? '';
}

function isContestPlayerId(value: unknown): value is ContestPlayerId {
  return value === 'human' || value === 'ai';
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isClientMessage(value: unknown): value is ClientMessage {
  if (!isObjectRecord(value) || typeof value.kind !== 'string') {
    return false;
  }
  if (value.kind === 'create-room') {
    return (
      (value.roomId === undefined || typeof value.roomId === 'string') &&
      (value.seed === undefined || Number.isSafeInteger(value.seed)) &&
      (value.playerName === undefined || typeof value.playerName === 'string')
    );
  }
  if (value.kind === 'join-room') {
    return typeof value.roomId === 'string' && (value.playerName === undefined || typeof value.playerName === 'string');
  }
  if (value.kind === 'reconnect-room') {
    return (
      typeof value.roomId === 'string' &&
      isContestPlayerId(value.playerId) &&
      typeof value.token === 'string' &&
      (value.playerName === undefined || typeof value.playerName === 'string')
    );
  }
  if (value.kind === 'submit-ready') {
    if (!isObjectRecord(value.submission)) {
      return value.game !== undefined;
    }
    const submission = value.submission;
    return (
      submission.kind === 'contest-submission' &&
      Number.isSafeInteger(submission.cycleNumber) &&
      typeof submission.phase === 'string' &&
      isStringArray(submission.selectedStartingTroopUnlockIds) &&
      isStringArray(submission.selectedRaceIds) &&
      isStringArray(submission.selectedTroopUnlockIds) &&
      isStringArray(submission.selectedUpgradeIds) &&
      Array.isArray(submission.troopAssignments) &&
      submission.troopAssignments.every(
        (assignment) =>
          isObjectRecord(assignment) &&
          typeof assignment.troopId === 'string' &&
          (typeof assignment.riftId === 'string' || assignment.riftId === null || assignment.riftId === undefined),
      ) &&
      typeof submission.endCycleConfirmed === 'boolean'
    );
  }
  return value.kind === 'unsubmit-ready' || value.kind === 'leave-room';
}

function parseClientMessage(raw: WebSocket.RawData): ClientMessage | string {
  if (byteLength(raw) > MAX_MESSAGE_BYTES) {
    return 'Multiplayer message is too large.';
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.toString());
  } catch {
    return 'Malformed JSON in multiplayer message.';
  }
  if (!isClientMessage(parsed)) {
    return isObjectRecord(parsed) && typeof parsed.kind === 'string' ? `Unknown or invalid multiplayer message kind: ${parsed.kind}.` : 'Invalid multiplayer message.';
  }
  return parsed;
}

function checkRateLimitBucket(bucket: { windowStartedAt: number; count: number } | undefined, now: number): { allowed: boolean; bucket: { windowStartedAt: number; count: number } } {
  if (!bucket || now - bucket.windowStartedAt >= RATE_LIMIT_WINDOW_MS) {
    return { allowed: true, bucket: { windowStartedAt: now, count: 1 } };
  }
  const next = { ...bucket, count: bucket.count + 1 };
  return { allowed: next.count <= MAX_MESSAGES_PER_WINDOW, bucket: next };
}

function isRateLimited(socket: WebSocket, now = Date.now()): boolean {
  const socketResult = checkRateLimitBucket(socketRateLimits.get(socket), now);
  socketRateLimits.set(socket, socketResult.bucket);
  const remoteAddress = socketRemoteAddresses.get(socket);
  if (!remoteAddress) {
    return !socketResult.allowed;
  }

  const ipResult = checkRateLimitBucket(ipRateLimits.get(remoteAddress), now);
  ipRateLimits.set(remoteAddress, ipResult.bucket);
  return !socketResult.allowed || !ipResult.allowed;
}

function firstHeaderValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function getRequestClientAddress(request: IncomingMessage): string {
  const forwardedFor = firstHeaderValue(request.headers['x-forwarded-for']);
  const forwardedClient = forwardedFor
    ?.split(',')
    .map((address) => address.trim())
    .find(Boolean);
  return forwardedClient || firstHeaderValue(request.headers['x-real-ip'])?.trim() || request.socket.remoteAddress || 'unknown';
}

function isOriginAllowed(origin: string | undefined, allowedOrigins = serverConfig.allowedOrigins): boolean {
  if (allowedOrigins.length === 0) {
    return true;
  }
  return !!origin && allowedOrigins.includes(origin);
}

function markSocketAlive(socket: WebSocket): void {
  socketHeartbeatAlive.set(socket, true);
}

function checkSocketHeartbeat(socket: WebSocket): boolean {
  if (socketHeartbeatAlive.get(socket) === false) {
    socket.close(1001, 'Multiplayer heartbeat timed out.');
    handleSocketClose(socket);
    return false;
  }
  socketHeartbeatAlive.set(socket, false);
  if (typeof socket.ping === 'function') {
    socket.ping();
  }
  return true;
}

function readiness(room: ContestRoom): Record<ContestPlayerId, boolean> {
  return {
    human: !!room.submissions.human,
    ai: !!room.submissions.ai,
  };
}

function sanitizePlayerName(name: string | undefined, fallback: string): string {
  const trimmed = name?.trim().replace(/\s+/g, ' ') ?? '';
  return trimmed.slice(0, 24) || fallback;
}

function messageForPlayer(message: RoomMessage, playerId: ContestPlayerId): string | null {
  return typeof message === 'object' && message !== null ? (message[playerId] ?? null) : message;
}

function touchRoom(room: ContestRoom, now = Date.now()): void {
  room.updatedAt = now;
}

function hasConnectedClients(room: ContestRoom): boolean {
  return Boolean(room.clients.human || room.clients.ai);
}

function connectedPlayers(room: ContestRoom): Record<ContestPlayerId, boolean> {
  return {
    human: !!room.clients.human,
    ai: !!room.clients.ai,
  };
}

function cleanupEmptyRooms(now = Date.now(), ttlMs = EMPTY_ROOM_TTL_MS): string[] {
  const removedRoomIds: string[] = [];
  rooms.forEach((room, roomId) => {
    if (hasConnectedClients(room) || room.lastEmptyAt === null) {
      return;
    }
    if (now - room.lastEmptyAt >= ttlMs) {
      rooms.delete(roomId);
      removedRoomIds.push(roomId);
    }
  });
  return removedRoomIds;
}

function broadcast(room: ContestRoom, message: RoomMessage = null): void {
  (Object.keys(room.clients) as ContestPlayerId[]).forEach((playerId) => {
    const client = room.clients[playerId];
    if (!client) {
      return;
    }
    const replayPayloads = projectStoredReplayPayloadMapForPlayer(room.replayPayloads, playerId, room.playerNames);
    const game = projectContestRoomStateForPlayer(room.game, playerId, room.submissions);
    send(client.socket, {
      kind: 'room-snapshot',
      roomId: room.id,
      playerId,
      playerToken: room.playerTokens[playerId] ?? '',
      game: { ...game, replayIndex: projectReplayIndexForPlayer(game.replayIndex, replayPayloads) },
      readiness: readiness(room),
      connectedPlayers: connectedPlayers(room),
      playerNames: room.playerNames,
      replayPayloads,
      message: messageForPlayer(message, playerId),
    });
  });
}

function releaseClient(socket: WebSocket, message: RoomMessage): void {
  const membership = socketRooms.get(socket);
  if (!membership) {
    return;
  }
  socketRooms.delete(socket);
  const room = rooms.get(membership.roomId);
  if (!room) {
    return;
  }
  if (room.clients[membership.playerId]?.socket === socket) {
    delete room.clients[membership.playerId];
    delete room.playerTokens[membership.playerId];
    delete room.submissions[membership.playerId];
    room.playerNames[membership.playerId] = DEFAULT_CONTEST_PLAYER_NAMES[membership.playerId];
    if (!hasConnectedClients(room)) {
      room.lastEmptyAt = Date.now();
    }
    touchRoom(room);
    broadcast(room, message);
  }
}

function createRoom(seed = Date.now() >>> 0, requestedRoomId?: string): ContestRoom {
  cleanupEmptyRooms();
  let roomId = normalizeRoomId(requestedRoomId) || makeRoomId();
  while (rooms.has(roomId)) {
    roomId = makeRoomId();
  }
  const now = Date.now();
  const room: ContestRoom = {
    id: roomId,
    game: startNewGame(seed, 'contest'),
    clients: {},
    playerTokens: {},
    submissions: {},
    replayPayloads: {},
    playerNames: { ...DEFAULT_CONTEST_PLAYER_NAMES },
    createdAt: now,
    updatedAt: now,
    lastEmptyAt: now,
  };
  rooms.set(roomId, room);
  return room;
}

function attachClient(socket: WebSocket, room: ContestRoom, preferredPlayerId?: ContestPlayerId, playerName?: string): void {
  const playerId = preferredPlayerId ?? (!room.clients.human ? 'human' : !room.clients.ai ? 'ai' : null);
  if (!playerId) {
    send(socket, { kind: 'room-error', message: 'Room already has two players.' });
    return;
  }

  room.clients[playerId]?.socket.close(1000, 'Replaced by a newer connection.');
  room.playerTokens[playerId] = makePlayerToken();
  delete room.submissions[playerId];
  room.playerNames[playerId] = sanitizePlayerName(playerName, DEFAULT_CONTEST_PLAYER_NAMES[playerId]);
  room.clients[playerId] = { socket, playerId };
  room.lastEmptyAt = null;
  touchRoom(room);
  socketRooms.set(socket, { roomId: room.id, playerId });
  broadcast(room, playerId === 'human' ? `Room ${room.id} created. Share this code with ${room.playerNames.ai}.` : `${room.playerNames[playerId]} joined room ${room.id}.`);
}

function reconnectClient(socket: WebSocket, room: ContestRoom, playerId: ContestPlayerId, token: string, playerName?: string): void {
  if (!token || room.playerTokens[playerId] !== token) {
    send(socket, { kind: 'room-error', message: 'Could not reconnect to that room. Join again or ask for a fresh room code.' });
    return;
  }

  room.clients[playerId]?.socket.close(1000, 'Replaced by a reconnecting client.');
  room.playerNames[playerId] = sanitizePlayerName(playerName, room.playerNames[playerId] ?? DEFAULT_CONTEST_PLAYER_NAMES[playerId]);
  room.clients[playerId] = { socket, playerId };
  room.lastEmptyAt = null;
  touchRoom(room);
  socketRooms.set(socket, { roomId: room.id, playerId });
  broadcast(room, `${room.playerNames[playerId]} reconnected to room ${room.id}.`);
}

function maybeAdvanceRoom(room: ContestRoom): void {
  if (!room.submissions.human || !room.submissions.ai) {
    broadcast(room, {
      human: room.submissions.human ? 'Ready submitted. Waiting for the other player.' : null,
      ai: room.submissions.ai ? 'Ready submitted. Waiting for the other player.' : null,
    });
    return;
  }

  const result = advanceContestMultiplayerRoom(room.game, {
    human: room.submissions.human,
    ai: room.submissions.ai,
  });
  room.game = result.state;
  room.submissions = {};
  room.replayPayloads = {
    ...room.replayPayloads,
    ...buildStoredReplayPayloadMap(result.replayPayloadWrites),
  };
  touchRoom(room);
  broadcast(room, result.resolvedCycle ? 'Both players submitted. Cycle resolved.' : 'Both players submitted. Contest updated.');
}

function handleMessage(socket: WebSocket, raw: WebSocket.RawData): void {
  if (isRateLimited(socket)) {
    send(socket, { kind: 'room-error', message: 'Too many multiplayer messages. Slow down and try again.' });
    socket.close(1008, 'Multiplayer rate limit exceeded.');
    return;
  }

  const message = parseClientMessage(raw);
  if (typeof message === 'string') {
    send(socket, { kind: 'room-error', message });
    if (message.includes('too large')) {
      socket.close(1009, message);
    }
    return;
  }

  if (message.kind === 'create-room') {
    const requestedRoomId = normalizeRoomId(message.roomId);
    if (requestedRoomId && rooms.has(requestedRoomId)) {
      send(socket, { kind: 'room-error', message: `Room ${requestedRoomId} already exists. Choose a different room code or join it instead.` });
      return;
    }
    attachClient(socket, createRoom(message.seed, message.roomId), 'human', message.playerName);
    return;
  }

  if (message.kind === 'join-room') {
    cleanupEmptyRooms();
    const roomId = normalizeRoomId(message.roomId);
    const room = rooms.get(roomId);
    if (!room) {
      send(socket, { kind: 'room-error', message: `Room ${roomId || message.roomId} was not found or has expired. Ask the host for a fresh room code.` });
      return;
    }
    attachClient(socket, room, undefined, message.playerName);
    return;
  }

  if (message.kind === 'reconnect-room') {
    cleanupEmptyRooms();
    const roomId = normalizeRoomId(message.roomId);
    const room = rooms.get(roomId);
    if (!room) {
      send(socket, { kind: 'room-error', message: `Room ${roomId || message.roomId} was not found or has expired. Ask the host for a fresh room code.` });
      return;
    }
    reconnectClient(socket, room, message.playerId, message.token, message.playerName);
    return;
  }

  const membership = socketRooms.get(socket);
  if (!membership) {
    send(socket, { kind: 'room-error', message: 'Join or create a room first.' });
    return;
  }
  const room = rooms.get(membership.roomId);
  if (!room) {
    send(socket, { kind: 'room-error', message: 'Room no longer exists.' });
    return;
  }

  if (message.kind === 'submit-ready') {
    if (!message.submission) {
      send(socket, { kind: 'room-error', message: 'Full-state multiplayer submissions are no longer accepted. Refresh the page and submit again.' });
      return;
    }
    const validation = validateAndApplyContestSubmission(room.game, membership.playerId, message.submission);
    if (!validation.ok || !validation.projectedState) {
      const error = validation.error ?? 'That multiplayer submission is not legal.';
      send(socket, { kind: 'room-error', message: error });
      broadcast(room, { [membership.playerId]: error });
      return;
    }
    room.submissions[membership.playerId] = validation.projectedState;
    touchRoom(room);
    maybeAdvanceRoom(room);
    return;
  }

  if (message.kind === 'unsubmit-ready') {
    delete room.submissions[membership.playerId];
    touchRoom(room);
    broadcast(room, 'Ready canceled.');
    return;
  }

  if (message.kind === 'leave-room') {
    releaseClient(socket, 'A player left the room.');
    socket.close(1000, 'Left multiplayer room.');
  }
}

export function handleSocketClose(socket: WebSocket): void {
  socketHeartbeatAlive.delete(socket);
  const membership = socketRooms.get(socket);
  if (!membership) {
    return;
  }
  socketRooms.delete(socket);
  const room = rooms.get(membership.roomId);
  if (!room) {
    return;
  }
  if (room.clients[membership.playerId]?.socket === socket) {
    delete room.clients[membership.playerId];
    if (!hasConnectedClients(room)) {
      room.lastEmptyAt = Date.now();
    }
    touchRoom(room);
    broadcast(room, 'A player disconnected.');
  }
}

export function startContestMultiplayerServer(config: MultiplayerServerConfig = serverConfig): WebSocketServer {
  const baseOptions = config.host ? { port: config.port, host: config.host } : { port: config.port };
  const httpServer = createServer((request, response) => {
    void handleHttpRequest(request, response);
  });
  const server = new WebSocketServer({
    server: httpServer,
    maxPayload: MAX_MESSAGE_BYTES,
    verifyClient: ({ origin }: { origin?: string }, done: (result: boolean, code?: number, message?: string) => void) => {
      done(isOriginAllowed(origin, config.allowedOrigins), 403, 'Origin is not allowed for this multiplayer server.');
    },
  });

  server.on('connection', (socket, request: IncomingMessage) => {
    markSocketAlive(socket);
    socketRemoteAddresses.set(socket, getRequestClientAddress(request));
    socket.on('pong', () => markSocketAlive(socket));
    socket.on('message', (message) => handleMessage(socket, message));
    socket.on('close', () => handleSocketClose(socket));
  });
  const cleanupInterval = setInterval(() => cleanupEmptyRooms(), ROOM_CLEANUP_INTERVAL_MS);
  const heartbeatInterval = setInterval(() => {
    server.clients.forEach((socket) => checkSocketHeartbeat(socket));
  }, HEARTBEAT_INTERVAL_MS);
  cleanupInterval.unref();
  heartbeatInterval.unref();
  server.on('close', () => {
    clearInterval(cleanupInterval);
    clearInterval(heartbeatInterval);
  });

  void ensureLadderReady();
  httpServer.listen(baseOptions, () => console.log(describeMultiplayerListenAddress(config)));
  return server;
}

if (process.env.NODE_ENV !== 'test') {
  startContestMultiplayerServer();
}

export const contestMultiplayerServerInternals = {
  attachClient,
  cleanupEmptyRooms,
  createRoom,
  EMPTY_ROOM_TTL_MS,
  HEARTBEAT_INTERVAL_MS,
  MAX_MESSAGE_BYTES,
  MAX_MESSAGES_PER_WINDOW,
  handleMessage,
  handleSocketClose,
  isOriginAllowed,
  getRequestClientAddress,
  markSocketAlive,
  checkSocketHeartbeat,
  normalizeRoomId,
  parseClientMessage,
  reconnectClient,
  rooms,
  socketRooms,
  socketRemoteAddresses,
};
