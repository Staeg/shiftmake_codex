import { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import WebSocket, { WebSocketServer } from 'ws';
import { assignTroopToRift, claimOpeningTroop, claimTroopOffer, claimUpgradeOffer, getOpeningRaceStarterTroopUnlockIds, revealEssenceDraft } from '../engine/game';
import { buildContestMultiplayerSubmission } from '../engine/multiplayerContest';
import type { ContestPlayerId, GameState, StoredReplayPayload, TroopUnlockId } from '../engine/types';
import { contestMultiplayerServerInternals, startContestMultiplayerServer } from './contestMultiplayerServer';

type SnapshotMessage = {
  kind: 'room-snapshot';
  roomId: string;
  playerId: ContestPlayerId;
  playerToken: string;
  game: GameState;
  readiness: Record<ContestPlayerId, boolean>;
  playerNames: Record<ContestPlayerId, string>;
  replayPayloads: Record<string, StoredReplayPayload>;
  message: string | null;
};

type ErrorMessage = {
  kind: 'room-error';
  message: string;
};

type ServerMessage = SnapshotMessage | ErrorMessage;

class TestClient {
  readonly messages: ServerMessage[] = [];
  private readonly waiters: Array<{
    predicate: (message: ServerMessage) => boolean;
    resolve: (message: ServerMessage) => void;
    reject: (error: Error) => void;
    timeout: ReturnType<typeof setTimeout>;
  }> = [];

  constructor(readonly socket: WebSocket) {
    socket.on('message', (raw) => {
      const message = JSON.parse(raw.toString()) as ServerMessage;
      this.messages.push(message);
      this.flushWaiters();
    });
    socket.on('close', () => {
      this.rejectWaiters(new Error('WebSocket closed before the expected multiplayer message arrived.'));
    });
    socket.on('error', (error) => {
      this.rejectWaiters(error instanceof Error ? error : new Error('WebSocket error.'));
    });
  }

  send(message: unknown): void {
    this.socket.send(JSON.stringify(message));
  }

  waitForSnapshot(predicate: (message: SnapshotMessage) => boolean): Promise<SnapshotMessage> {
    return this.waitFor((message): message is SnapshotMessage => message.kind === 'room-snapshot' && predicate(message));
  }

  close(): void {
    this.socket.close();
    this.rejectWaiters(new Error('Test client closed.'));
  }

  private waitFor<T extends ServerMessage>(predicate: (message: ServerMessage) => message is T, timeoutMs = 5_000): Promise<T> {
    const existing = this.messages.find(predicate);
    if (existing) {
      return Promise.resolve(existing);
    }

    return new Promise((resolve, reject) => {
      const waiter = {
        predicate,
        resolve: resolve as (message: ServerMessage) => void,
        reject,
        timeout: setTimeout(() => {
          this.waiters.splice(this.waiters.indexOf(waiter), 1);
          reject(new Error('Timed out waiting for multiplayer server message.'));
        }, timeoutMs),
      };
      this.waiters.push(waiter);
    }) as Promise<T>;
  }

  private flushWaiters(): void {
    for (const waiter of [...this.waiters]) {
      const message = this.messages.find(waiter.predicate);
      if (!message) {
        continue;
      }
      clearTimeout(waiter.timeout);
      this.waiters.splice(this.waiters.indexOf(waiter), 1);
      waiter.resolve(message);
    }
  }

  private rejectWaiters(error: Error): void {
    for (const waiter of this.waiters.splice(0)) {
      clearTimeout(waiter.timeout);
      waiter.reject(error);
    }
  }
}

function waitForServerListening(server: WebSocketServer): Promise<void> {
  if (server.address()) {
    return Promise.resolve();
  }
  return new Promise((resolve) => server.once('listening', resolve));
}

async function closeServer(server: WebSocketServer | null): Promise<void> {
  if (!server) {
    return;
  }
  for (const socket of server.clients) {
    socket.close();
  }
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
}

async function connectClient(url: string): Promise<TestClient> {
  const socket = new WebSocket(url);
  await new Promise<void>((resolve, reject) => {
    socket.once('open', resolve);
    socket.once('error', reject);
  });
  return new TestClient(socket);
}

function chooseFirstTwoOpeningTroops(state: GameState): GameState {
  const starters = Object.values(getOpeningRaceStarterTroopUnlockIds(state)) as TroopUnlockId[];
  return starters.slice(0, 2).reduce((next, troopUnlockId) => claimOpeningTroop(next, troopUnlockId), state);
}

function assignFirstTroopToFirstRift(state: GameState): GameState {
  const troop = state.troops[0];
  const rift = state.openRifts[0];
  if (!troop || !rift) {
    throw new Error('Expected a troop and a Rift for the multiplayer smoke assignment.');
  }
  const next = assignTroopToRift(state, troop.id, rift.id);
  if (next === state) {
    throw new Error(`Expected ${troop.id} to be assignable to ${rift.id}.`);
  }
  return next;
}

function spendEssenceDraft(state: GameState): GameState {
  let next = revealEssenceDraft(state);
  const troopUnlockId = next.activeTroopOffer?.optionTroopUnlockIds[0];
  const upgradeId = next.activeUpgradeOffer?.optionUpgradeIds[0];
  if (troopUnlockId) {
    next = claimTroopOffer(next, troopUnlockId);
  }
  if (upgradeId) {
    next = claimUpgradeOffer(next, upgradeId);
  }
  return next;
}

function findLocalPlayerReplayPayload(snapshot: SnapshotMessage, expectedLabel: string): StoredReplayPayload | undefined {
  return Object.values(snapshot.replayPayloads).find(
    (payload) => payload.input.sideParticipants?.player.kind === 'player' && payload.input.sideParticipants.player.label === expectedLabel,
  );
}

describe('Contest multiplayer two-client smoke suite', () => {
  let server: WebSocketServer | null = null;
  const clients: TestClient[] = [];

  beforeEach(async () => {
    contestMultiplayerServerInternals.rooms.clear();
    contestMultiplayerServerInternals.socketRooms.clear();
    server = startContestMultiplayerServer({ port: 0, host: '127.0.0.1', allowedOrigins: [] });
    await waitForServerListening(server);
  });

  afterEach(async () => {
    clients.splice(0).forEach((client) => client.close());
    await closeServer(server);
    server = null;
    contestMultiplayerServerInternals.rooms.clear();
    contestMultiplayerServerInternals.socketRooms.clear();
  });

  function serverUrl(): string {
    const address = server?.address() as AddressInfo | null;
    if (!address) {
      throw new Error('Expected multiplayer smoke server to be listening.');
    }
    return `ws://127.0.0.1:${address.port}`;
  }

  it('opens a room, reaches planning, resolves a cycle, and projects replay payloads per player', async () => {
    const host = await connectClient(serverUrl());
    const guest = await connectClient(serverUrl());
    clients.push(host, guest);

    host.send({ kind: 'create-room', roomId: 'E2E1', seed: 42, playerName: 'Ada' });
    const created = await host.waitForSnapshot((message) => message.roomId === 'E2E1' && message.playerId === 'human');

    guest.send({ kind: 'join-room', roomId: created.roomId.toLowerCase(), playerName: 'Byron' });
    const hostJoined = await host.waitForSnapshot((message) => message.playerNames.ai === 'Byron');
    const guestJoined = await guest.waitForSnapshot((message) => message.roomId === 'E2E1' && message.playerId === 'ai');

    expect(hostJoined.playerNames).toEqual({ human: 'Ada', ai: 'Byron' });
    expect(guestJoined.playerNames).toEqual({ human: 'Ada', ai: 'Byron' });

    host.send({ kind: 'submit-ready', submission: buildContestMultiplayerSubmission(chooseFirstTwoOpeningTroops(hostJoined.game)) });
    guest.send({ kind: 'submit-ready', submission: buildContestMultiplayerSubmission(chooseFirstTwoOpeningTroops(guestJoined.game)) });

    const hostPlanning = await host.waitForSnapshot((message) => message.game.phase === 'planning' && message.game.cycleNumber === 1);
    const guestPlanning = await guest.waitForSnapshot((message) => message.game.phase === 'planning' && message.game.cycleNumber === 1);

    expect(hostPlanning.game.troops).toHaveLength(2);
    expect(guestPlanning.game.troops).toHaveLength(2);
    expect(hostPlanning.playerId).toBe('human');
    expect(guestPlanning.playerId).toBe('ai');

    host.send({ kind: 'submit-ready', submission: buildContestMultiplayerSubmission(assignFirstTroopToFirstRift(spendEssenceDraft(hostPlanning.game))) });
    guest.send({ kind: 'submit-ready', submission: buildContestMultiplayerSubmission(assignFirstTroopToFirstRift(spendEssenceDraft(guestPlanning.game))) });

    const hostResolved = await host.waitForSnapshot((message) => message.game.cycleNumber === 2 && Object.keys(message.replayPayloads).length > 0);
    const guestResolved = await guest.waitForSnapshot((message) => message.game.cycleNumber === 2 && Object.keys(message.replayPayloads).length > 0);
    const hostLocalReplay = findLocalPlayerReplayPayload(hostResolved, 'Ada');
    const guestLocalReplay = findLocalPlayerReplayPayload(guestResolved, 'Byron');

    expect(hostResolved.game.phase).toBe('planning');
    expect(guestResolved.game.phase).toBe('planning');
    expect(hostResolved.game.replayIndex.length).toBeGreaterThan(0);
    expect(guestResolved.game.replayIndex.length).toBeGreaterThan(0);
    expect(hostLocalReplay?.input.sideParticipants?.enemy.kind).toBe('neutral');
    expect(guestLocalReplay?.input.sideParticipants?.enemy.kind).toBe('neutral');
  });

  it('frees a pre-start disconnected ready player for a normal join', async () => {
    const host = await connectClient(serverUrl());
    clients.push(host);

    host.send({ kind: 'create-room', roomId: 'E2E2', seed: 84, playerName: 'Ada' });
    const created = await host.waitForSnapshot((message) => message.roomId === 'E2E2' && message.playerId === 'human');

    host.send({ kind: 'submit-ready', submission: buildContestMultiplayerSubmission(chooseFirstTwoOpeningTroops(created.game)) });
    const waiting = await host.waitForSnapshot((message) => message.readiness.human && !message.readiness.ai);
    host.close();

    const replacement = await connectClient(serverUrl());
    clients.push(replacement);
    replacement.send({ kind: 'join-room', roomId: waiting.roomId, playerName: 'Cleo' });

    const joined = await replacement.waitForSnapshot((message) => message.playerId === 'human' && message.playerNames.human === 'Cleo');
    expect(joined.roomId).toBe('E2E2');
    expect(joined.playerToken).not.toBe(waiting.playerToken);
    expect(joined.readiness.human).toBe(false);
  });
});
