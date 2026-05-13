import { WebSocketServer, type WebSocket } from 'ws';
import { startNewGame } from '../engine/game';
import {
  advanceContestMultiplayerRoom,
  buildStoredReplayPayloadMap,
  DEFAULT_CONTEST_PLAYER_NAMES,
  projectContestRoomStateForPlayer,
  projectReplayIndexForPlayer,
  projectStoredReplayPayloadMapForPlayer,
  type ContestPlayerNames,
} from '../engine/multiplayerContest';
import type { ContestPlayerId, GameState, StoredReplayPayload } from '../engine/types';

type ClientMessage =
  | { kind: 'create-room'; roomId?: string; seed?: number; playerName?: string }
  | { kind: 'join-room'; roomId: string; playerName?: string }
  | { kind: 'submit-ready'; game: GameState }
  | { kind: 'unsubmit-ready' };

type ServerMessage =
  | {
      kind: 'room-snapshot';
      roomId: string;
      playerId: ContestPlayerId;
      game: GameState;
      readiness: Record<ContestPlayerId, boolean>;
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
  submissions: Partial<Record<ContestPlayerId, GameState>>;
  replayPayloads: Record<string, StoredReplayPayload>;
  playerNames: ContestPlayerNames;
}

type RoomMessage = string | null | Partial<Record<ContestPlayerId, string | null>>;

const port = Number(process.env.SHIFTMAKE_MULTIPLAYER_PORT ?? 8787);
const rooms = new Map<string, ContestRoom>();
const socketRooms = new Map<WebSocket, { roomId: string; playerId: ContestPlayerId }>();

function makeRoomId(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function send(socket: WebSocket, message: ServerMessage): void {
  if (socket.readyState === socket.OPEN) {
    socket.send(JSON.stringify(message));
  }
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
      game: { ...game, replayIndex: projectReplayIndexForPlayer(game.replayIndex, replayPayloads) },
      readiness: readiness(room),
      playerNames: room.playerNames,
      replayPayloads,
      message: messageForPlayer(message, playerId),
    });
  });
}

function createRoom(seed = Date.now() >>> 0, requestedRoomId?: string): ContestRoom {
  let roomId = requestedRoomId?.trim() || makeRoomId();
  while (rooms.has(roomId)) {
    roomId = makeRoomId();
  }
  const room: ContestRoom = {
    id: roomId,
    game: startNewGame(seed, 'contest'),
    clients: {},
    submissions: {},
    replayPayloads: {},
    playerNames: { ...DEFAULT_CONTEST_PLAYER_NAMES },
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
  room.playerNames[playerId] = sanitizePlayerName(playerName, DEFAULT_CONTEST_PLAYER_NAMES[playerId]);
  room.clients[playerId] = { socket, playerId };
  socketRooms.set(socket, { roomId: room.id, playerId });
  broadcast(room, playerId === 'human' ? `Room ${room.id} created. Share this code with ${room.playerNames.ai}.` : `${room.playerNames[playerId]} joined room ${room.id}.`);
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
  broadcast(room, result.resolvedCycle ? 'Both players submitted. Cycle resolved.' : 'Both players submitted. Contest updated.');
}

function handleMessage(socket: WebSocket, raw: WebSocket.RawData): void {
  let message: ClientMessage;
  try {
    message = JSON.parse(raw.toString()) as ClientMessage;
  } catch {
    send(socket, { kind: 'room-error', message: 'Invalid multiplayer message.' });
    return;
  }

  if (message.kind === 'create-room') {
    attachClient(socket, createRoom(message.seed, message.roomId), 'human', message.playerName);
    return;
  }

  if (message.kind === 'join-room') {
    const room = rooms.get(message.roomId.trim());
    if (!room) {
      send(socket, { kind: 'room-error', message: `No room named ${message.roomId}.` });
      return;
    }
    attachClient(socket, room, undefined, message.playerName);
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
    room.submissions[membership.playerId] = message.game;
    maybeAdvanceRoom(room);
    return;
  }

  if (message.kind === 'unsubmit-ready') {
    delete room.submissions[membership.playerId];
    broadcast(room, 'Ready canceled.');
  }
}

const server = new WebSocketServer({ port });

server.on('connection', (socket) => {
  socket.on('message', (message) => handleMessage(socket, message));
  socket.on('close', () => {
    const membership = socketRooms.get(socket);
    if (!membership) {
      return;
    }
    socketRooms.delete(socket);
    const room = rooms.get(membership.roomId);
    if (!room) {
      return;
    }
    delete room.clients[membership.playerId];
    delete room.submissions[membership.playerId];
    broadcast(room, 'A player disconnected.');
  });
});

console.log(`Shiftmake Contest multiplayer server listening on ws://localhost:${port}`);
