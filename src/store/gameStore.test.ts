import { beforeEach, describe, expect, it, vi } from 'vitest';
import { decodeBattleReport } from '../engine/battleReport';
import { decodeCampaignReport } from '../engine/campaignReport';
import { claimOpeningTroop, getOpeningRaceOptionIds, getOpeningRaceStarterTroopUnlockIds, serializeGameState, startNewGame, startOpeningCampaign } from '../engine/game';
import { generateBaselineLadderPayload } from '../engine/ladder';
import type { CampaignReportUiContext, GameState, ReplayIndexEntry, ReplayPayloadWrite, StoredReplayPayload, TroopUnlockId, UpgradeId } from '../engine/types';
import { gameStore, persistReplayPayloadWrites, readLastMultiplayerPlayerName, readLastMultiplayerServerUrl } from './gameStore';

class MemoryStorage implements Storage {
  private values = new Map<string, string>();

  get length(): number {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

class QuotaStorage {
  private values = new Map<string, string>();

  constructor(private readonly maxChars: number) {}

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    const previous = this.values.get(key);
    const nextTotal = this.totalChars() - (previous?.length ?? 0) + value.length;
    if (nextTotal > this.maxChars) {
      const error = new Error('Quota exceeded');
      error.name = 'QuotaExceededError';
      throw error;
    }
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  private totalChars(): number {
    return [...this.values.values()].reduce((total, value) => total + value.length, 0);
  }
}

class FakeWebSocket {
  static readonly OPEN = 1;
  static instances: FakeWebSocket[] = [];

  readonly OPEN = 1;
  readyState = FakeWebSocket.OPEN;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  sent: string[] = [];

  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this);
  }

  send(message: string): void {
    this.sent.push(message);
  }

  close(): void {
    this.readyState = 3;
    this.onclose?.();
  }

  open(): void {
    this.onopen?.();
  }

  receive(message: unknown): void {
    this.onmessage?.({ data: JSON.stringify(message) });
  }
}

function makeReplayPayload(seed: number): StoredReplayPayload {
  return {
    version: 1,
    input: {
      seed,
      riftId: `rift-${seed}`,
      tier: 1,
      mutatorIds: [],
      playerCombatants: [],
      enemyCombatants: [],
    },
  };
}

function makeReplayIndexEntry(replayId: string, summaryOnly = false): ReplayIndexEntry {
  return {
    id: replayId,
    riftId: 'rift',
    cycleNumber: 1,
    battleSeed: 1,
    outcome: 'victory',
    playerTroopLabels: ['Test Troop'],
    mutatorIds: [],
    summary: 'VICTORY 1-0',
    replayId,
    estimatedBytes: 100,
    summaryOnly,
  };
}

function makeReplayWrite(replayId: string, seed: number): ReplayPayloadWrite {
  return {
    replayId,
    replay: makeReplayPayload(seed),
    estimatedBytes: JSON.stringify(makeReplayPayload(seed)).length,
  };
}

function latestPayloadSlack(write: ReplayPayloadWrite): number {
  return JSON.stringify(write.replay).length;
}

function currentStoreState<T>(): T {
  let value: T | undefined;
  const unsubscribe = gameStore.subscribe((state) => {
    value = state as T;
  });
  unsubscribe();
  return value as T;
}

function getOpeningPair(state: GameState): [TroopUnlockId, TroopUnlockId] {
  const startersByRaceId = getOpeningRaceStarterTroopUnlockIds(state);
  const candidates = getOpeningRaceOptionIds(state).map((raceId) => startersByRaceId[raceId]);
  const firstTroopUnlockId = candidates[0]!;
  const [firstRaceId, firstUnitClassId] = firstTroopUnlockId.split('/');
  const secondTroopUnlockId = candidates.find((troopUnlockId) => {
    const [raceId, unitClassId] = troopUnlockId.split('/');
    return raceId !== firstRaceId && unitClassId !== firstUnitClassId;
  })!;
  return [firstTroopUnlockId, secondTroopUnlockId];
}

function claimDefaultOpeningTroops(): void {
  const state = currentStoreState<{ game: GameState }>();
  const [firstTroopUnlockId, secondTroopUnlockId] = getOpeningPair(state.game);
  gameStore.claimOpeningTroop(firstTroopUnlockId);
  gameStore.claimOpeningTroop(secondTroopUnlockId);
  gameStore.startOpeningCampaign();
}

function spendAllEssence(): void {
  gameStore.revealEssenceDraft();
  const state = currentStoreState<{
    game: {
      activeTroopOffer: { optionTroopUnlockIds: TroopUnlockId[] } | null;
      activeUpgradeOffer: { optionUpgradeIds: string[] } | null;
    };
  }>();
  const troopUnlockId = state.game.activeTroopOffer?.optionTroopUnlockIds[0];
  const upgradeId = state.game.activeUpgradeOffer?.optionUpgradeIds[0];
  if (troopUnlockId) {
    gameStore.claimTroopOffer(troopUnlockId);
  }
  if (upgradeId) {
    gameStore.claimUpgradeOffer(upgradeId as UpgradeId);
  }
}

function assignAllReadyTroopsToRifts(): void {
  const state = currentStoreState<{
    game: {
      troops: Array<{ id: string; recoveryCyclesRemaining: number; assignmentRiftId: string | null }>;
      openRifts: Array<{ id: string }>;
    };
  }>();
  const readyTroops = state.game.troops.filter((troop) => troop.recoveryCyclesRemaining === 0 && troop.assignmentRiftId === null);
  readyTroops.forEach((troop, index) => {
    const riftId = state.game.openRifts[index]?.id;
    if (riftId) {
      gameStore.assignTroopToRift(troop.id, riftId);
    }
  });
}

function finishCycleResolutionAnimation(): void {
  gameStore.finishCycleAnimation();
}

describe('persistReplayPayloadWrites', () => {
  it('evicts the oldest replay payload and retries when storage is full', () => {
    const oldestKey = 'shiftmake:replay:oldest';
    const newerKey = 'shiftmake:replay:newer';
    const latestKey = 'shiftmake:replay:latest';
    const oldestPayload = JSON.stringify(makeReplayPayload(1));
    const newerPayload = JSON.stringify(makeReplayPayload(2));
    const latestWrite = makeReplayWrite(latestKey, 3);
    const storage = new QuotaStorage(oldestPayload.length + newerPayload.length + latestPayloadSlack(latestWrite) - 1);

    storage.setItem(oldestKey, oldestPayload);
    storage.setItem(newerKey, newerPayload);

    const result = persistReplayPayloadWrites(
      storage,
      [makeReplayIndexEntry(latestKey), makeReplayIndexEntry(newerKey), makeReplayIndexEntry(oldestKey)],
      [latestWrite],
    );

    expect(storage.getItem(latestKey)).not.toBeNull();
    expect(storage.getItem(oldestKey)).toBeNull();
    expect(result.failedReplayIds.size).toBe(0);
    expect(result.evictedReplayIds).toEqual([oldestKey]);
    expect(result.replayIndex.find((entry) => entry.replayId === oldestKey)?.summaryOnly).toBe(true);
  });

  it('falls back to a summary when nothing older can be evicted', () => {
    const latestKey = 'shiftmake:replay:latest';
    const latestWrite = makeReplayWrite(latestKey, 4);
    const storage = new QuotaStorage(latestPayloadSlack(latestWrite) - 1);

    const result = persistReplayPayloadWrites(storage, [makeReplayIndexEntry(latestKey)], [latestWrite]);

    expect(storage.getItem(latestKey)).toBeNull();
    expect(result.failedReplayIds.has(latestKey)).toBe(true);
    expect(result.replayIndex.find((entry) => entry.replayId === latestKey)?.summaryOnly).toBe(true);
  });
});

describe('gameStore progression flow', () => {
  let storage: MemoryStorage;

  beforeEach(() => {
    storage = new MemoryStorage();
    FakeWebSocket.instances = [];
    vi.unstubAllGlobals();
    Object.defineProperty(globalThis, 'localStorage', {
      value: storage,
      configurable: true,
    });
    Object.defineProperty(globalThis, 'sessionStorage', {
      value: new MemoryStorage(),
      configurable: true,
    });
    gameStore.leaveMultiplayerContest();
    gameStore.initialize();
  });

  it('does not enter tutorial mode from persisted progress on main-menu initialization', () => {
    gameStore.startTutorial();

    gameStore.initialize();

    expect(
      currentStoreState<{
        screen: string;
        activeSlotId: string | null;
        tutorialProgress: unknown;
      }>(),
    ).toMatchObject({
      screen: 'main_menu',
      activeSlotId: null,
      tutorialProgress: null,
    });
  });

  it('shows one system notice grouped by retired save-content category when loading a repaired slot', () => {
    const opening = startNewGame(18);
    const [firstTroopUnlockId, secondTroopUnlockId] = getOpeningPair(opening);
    const opened = startOpeningCampaign(claimOpeningTroop(claimOpeningTroop(opening, firstTroopUnlockId), secondTroopUnlockId));
    storage.setItem(
      'shiftmake:slot:3:save:v3',
      serializeGameState({
        ...opened,
        unlockedRaceIds: [...opened.unlockedRaceIds, 'retired-race'],
        unlockedTroopUnlockIds: ['human/soldier', 'retired-race/soldier'],
        troops: [
          ...opened.troops,
          {
            id: 'retired-race/soldier',
            raceId: 'retired-race',
            unitClassId: 'soldier',
            recoveryCyclesRemaining: 0,
            assignmentRiftId: null,
          },
        ],
        raceUpgradeIds: ['retired-upgrade'],
        activeTroopOffer: { kind: 'troop', optionTroopUnlockIds: ['human/soldier', 'retired-race/soldier'] },
        openRifts: [
          {
            ...opened.openRifts[0]!,
            enemyArmy: [
              ...opened.openRifts[0]!.enemyArmy,
              {
                combatantId: 'retired-enemy',
                raceId: 'retired-race',
                unitClassId: 'soldier',
                troopInstanceId: null,
                label: 'Retired Enemy',
                role: 'frontline',
                unitClassTag: 'soldier',
                attributes: [],
                stats: { health: 1, damage: 1, speed: 1, armor: 0, range: 0, capacity: 1, size: 1 },
                abilities: [],
                quantity: 1,
                cost: 1,
                side: 'enemy',
              },
            ],
          },
          ...opened.openRifts.slice(1),
        ],
      }),
    );

    gameStore.loadSlot(3);

    const state = currentStoreState<{ systemMessage: string | null }>();
    expect(state.systemMessage).toContain('System Notice');
    expect(state.systemMessage).toContain('Missing races: retired-race');
    expect(state.systemMessage).toContain('Missing troop unlocks: retired-race/soldier');
    expect(state.systemMessage).toContain('Missing troop instances: retired-race/soldier');
    expect(state.systemMessage).toContain('Missing upgrades: retired-upgrade');
    expect(state.systemMessage).toContain('Missing Rift enemies: Retired Enemy');
    expect(state.systemMessage).toContain('Missing draft options: retired-race/soldier');
  });

  it('exits tutorial mode and clears persisted tutorial progress', () => {
    gameStore.startTutorial();
    gameStore.recordTutorialAction('watch-battle');

    gameStore.exitTutorial();
    expect(
      currentStoreState<{
        screen: string;
        activeSlotId: string | null;
        tutorialProgress: unknown;
        systemMessage: string | null;
      }>(),
    ).toMatchObject({
      screen: 'main_menu',
      activeSlotId: null,
      tutorialProgress: null,
      systemMessage: 'Tutorial exited.',
    });

    gameStore.resumeTutorial();

    expect(
      currentStoreState<{
        screen: string;
        activeSlotId: string | null;
        tutorialProgress: { step: string; signals: string[] } | null;
        systemMessage: string | null;
      }>(),
    ).toMatchObject({
      screen: 'overworld',
      activeSlotId: 'tutorial',
      tutorialProgress: { step: 'watch-battle', signals: [] },
    });
  });

  it('blocks ending a cycle until Essence is spent', () => {
    gameStore.startNewCampaign(1);
    claimDefaultOpeningTroops();

    gameStore.endCycle();
    let state = currentStoreState<{
      game: { cycleNumber: number };
      centerMode: string;
      cycleEndConfirmationPending: boolean;
      systemMessage: string | null;
    }>();

    expect(state.game.cycleNumber).toBe(1);
    expect(state.centerMode).toBe('troops');
    expect(state.cycleEndConfirmationPending).toBe(false);
    expect(state.systemMessage).toBe('Spend all Essence before ending the cycle.');

    spendAllEssence();
    assignAllReadyTroopsToRifts();
    gameStore.endCycle(true);
    finishCycleResolutionAnimation();
    state = currentStoreState<{
      game: { cycleNumber: number };
      cycleEndConfirmationPending: boolean;
      systemMessage: string | null;
    }>();

    expect(state.game.cycleNumber).toBe(2);
    expect(state.cycleEndConfirmationPending).toBe(false);
  });

  it('automatically reveals the opening Contest Essence draft', async () => {
    gameStore.startNewCampaign(1, 'contest');
    const opening = currentStoreState<{ game: GameState }>().game;
    const [firstTroopUnlockId, secondTroopUnlockId] = getOpeningPair(opening);

    gameStore.claimOpeningTroop(firstTroopUnlockId);
    gameStore.claimOpeningTroop(secondTroopUnlockId);
    await gameStore.startOpeningCampaign();

    const state = currentStoreState<{
      game: {
        gameMode: string;
        phase: string;
        essence: number;
        activeTroopOffer: unknown;
        activeUpgradeOffer: unknown;
      };
    }>();
    expect(state.game.gameMode).toBe('contest');
    expect(state.game.phase).toBe('planning');
    expect(state.game.essence).toBe(0);
    expect(state.game.activeTroopOffer).not.toBeNull();
    expect(state.game.activeUpgradeOffer).not.toBeNull();
  });

  it('keeps active draft offers stable through save and reload', () => {
    gameStore.startNewCampaign(1);
    claimDefaultOpeningTroops();
    gameStore.revealEssenceDraft();

    const beforeReload = currentStoreState<{ game: { activeTroopOffer: unknown; activeUpgradeOffer: unknown } }>().game;

    gameStore.returnToMainMenu();
    expect(gameStore.loadSlot(1)).toBe(true);

    const afterReload = currentStoreState<{ game: { activeTroopOffer: unknown; activeUpgradeOffer: unknown } }>().game;

    expect(afterReload.activeTroopOffer).toEqual(beforeReload.activeTroopOffer);
    expect(afterReload.activeUpgradeOffer).toEqual(beforeReload.activeUpgradeOffer);
  });

  it('draws database-sourced Rifts when a Ladder opening starts', async () => {
    const payload = generateBaselineLadderPayload(4321, 1);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          id: '00000000-0000-4000-8000-000000000111',
          cycleNumber: 1,
          generation: 0,
          sourceSetId: null,
          payload,
        }),
      })),
    );

    gameStore.startNewCampaign(1, 'ladder');
    claimDefaultOpeningTroops();
    await gameStore.startOpeningCampaign();

    const state = currentStoreState<{
      game: GameState;
      systemMessage: string | null;
    }>();
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/ladder/draw'),
      expect.objectContaining({
        body: JSON.stringify({ cycleNumber: 1 }),
      }),
    );
    expect(state.systemMessage).toBeNull();
    expect(state.game.gameMode).toBe('ladder');
    expect(state.game.openRifts.map((rift) => rift.id)).toEqual(payload.rifts.map((rift) => rift.id));
    expect(state.game.ladder).toEqual({
      currentRiftSetId: '00000000-0000-4000-8000-000000000111',
      currentGeneration: 0,
      currentSourceCycleNumber: 1,
    });
    expect(storage.getItem('shiftmake:slot:1:save:v3')).toContain('00000000-0000-4000-8000-000000000111');
  });

  it('does not duplicate Ladder harvests while cycle finalization is still in flight', async () => {
    const cycleOnePayload = generateBaselineLadderPayload(4321, 1);
    const cycleTwoPayload = generateBaselineLadderPayload(5432, 2);
    let releaseHarvest: (() => void) | null = null;
    const harvestGate = new Promise<void>((resolve) => {
      releaseHarvest = resolve;
    });
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/ladder/harvest')) {
        await harvestGate;
        return {
          ok: true,
          json: async () => ({
            parentId: '00000000-0000-4000-8000-000000000111',
            childId: '00000000-0000-4000-8000-000000000333',
            parentSpent: false,
            payload: cycleOnePayload,
          }),
        };
      }
      return {
        ok: true,
        json: async () =>
          fetchMock.mock.calls.filter(([calledInput]) => String(calledInput).includes('/ladder/draw')).length === 1
            ? {
                id: '00000000-0000-4000-8000-000000000111',
                cycleNumber: 1,
                generation: 0,
                sourceSetId: null,
                payload: cycleOnePayload,
              }
            : {
                id: '00000000-0000-4000-8000-000000000222',
                cycleNumber: 2,
                generation: 0,
                sourceSetId: null,
                payload: cycleTwoPayload,
              },
      };
    });
    vi.stubGlobal('fetch', fetchMock);

    gameStore.startNewCampaign(1, 'ladder');
    claimDefaultOpeningTroops();
    await gameStore.startOpeningCampaign();
    spendAllEssence();
    assignAllReadyTroopsToRifts();
    gameStore.endCycle(true);

    const firstFinish = gameStore.finishCycleAnimation();
    const secondFinish = gameStore.finishCycleAnimation();
    await Promise.resolve();

    expect(fetchMock.mock.calls.filter(([input]) => String(input).includes('/ladder/harvest'))).toHaveLength(1);

    releaseHarvest?.();
    await Promise.all([firstFinish, secondFinish]);

    expect(fetchMock.mock.calls.filter(([input]) => String(input).includes('/ladder/harvest'))).toHaveLength(1);
    expect(currentStoreState<{ game: GameState }>().game.cycleNumber).toBe(2);
  });

  it('adds resolved battles to the archive index when a cycle ends', () => {
    gameStore.startNewCampaign(1);
    claimDefaultOpeningTroops();
    spendAllEssence();

    assignAllReadyTroopsToRifts();
    const started = currentStoreState<{
      game: {
        openRifts: Array<{ id: string }>;
      };
    }>();
    const riftId = started.game.openRifts[0]?.id;

    expect(riftId).toBeTruthy();

    gameStore.endCycle(true);
    finishCycleResolutionAnimation();

    const ended = currentStoreState<{
      game: {
        cycleNumber: number;
        replayIndex: ReplayIndexEntry[];
      };
    }>();

    expect(ended.game.cycleNumber).toBe(2);
    expect(ended.game.replayIndex).toHaveLength(3);
    expect(ended.game.replayIndex[0]?.cycleNumber).toBe(1);
    expect(ended.game.replayIndex.some((entry) => entry.riftId === riftId)).toBe(true);
  });

  it('creates and imports exact battle reports for archived replays', () => {
    gameStore.startNewCampaign(1);
    claimDefaultOpeningTroops();
    spendAllEssence();

    assignAllReadyTroopsToRifts();
    const started = currentStoreState<{
      game: {
        openRifts: Array<{ id: string }>;
      };
    }>();
    const riftId = started.game.openRifts[0]?.id;

    gameStore.endCycle(true);
    finishCycleResolutionAnimation();

    const archived = currentStoreState<{ game: { replayIndex: ReplayIndexEntry[] } }>();
    const replayId = archived.game.replayIndex.find((entry) => entry.riftId === riftId)?.replayId;
    expect(replayId).toBeTruthy();

    const report = gameStore.createBattleReport(replayId!, 2, [
      {
        source: 'renderer',
        severity: 'warning',
        code: 'unit_texture_fallback_used',
        message: 'No texture was loaded for human/soldier; using renderer fallback texture.',
        textureKey: 'human/soldier',
      },
    ]);
    expect(report).toBeTruthy();
    const decoded = decodeBattleReport(report!);
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) {
      return;
    }
    expect(decoded.payload.summary.riftId).toBe(riftId);
    expect(decoded.payload.diagnostics[0]?.code).toBe('unit_texture_fallback_used');

    const result = gameStore.importBattleReport(report!);
    expect(result.ok).toBe(true);

    const imported = currentStoreState<{
      screen: string;
      loadedReplay: { id: string; steps: unknown[] } | null;
      loadedReplayPayload: StoredReplayPayload | null;
      loadedBattleReport: { reportId: string } | null;
      currentStep: number;
    }>();
    expect(imported.screen).toBe('replay');
    expect(imported.loadedReplay?.id).toBe(replayId);
    expect(imported.loadedReplayPayload?.input.seed).toBe(decoded.payload.replay.input.seed);
    expect(imported.loadedBattleReport?.reportId).toBe(decoded.payload.reportId);
    expect(imported.currentStep).toBe(2);
  });

  it('exports and imports campaign reports into a chosen save slot', () => {
    gameStore.startNewCampaign(1);
    claimDefaultOpeningTroops();
    spendAllEssence();

    assignAllReadyTroopsToRifts();
    const started = currentStoreState<{
      game: {
        troops: Array<{ id: string }>;
        openRifts: Array<{ id: string }>;
      };
    }>();
    const troopId = started.game.troops[0]?.id;
    const riftId = started.game.openRifts[0]?.id;
    gameStore.endCycle(true);
    finishCycleResolutionAnimation();

    const uiContext: CampaignReportUiContext = {
      screen: 'overworld',
      centerMode: 'rifts',
      selectedRiftId: riftId!,
      selectedTroopId: troopId!,
      selectedReplayId: null,
      currentReplayStep: null,
      systemMessage: 'Investigating campaign state.',
      validationMessages: ['Example warning'],
    };

    const report = gameStore.createCampaignReport(uiContext);
    expect(report).toBeTruthy();
    const decoded = decodeCampaignReport(report!);
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) {
      return;
    }
    expect(decoded.payload.summary.replayPayloadCount).toBe(3);
    expect(decoded.payload.uiContext.selectedRiftId).toBe(riftId);

    gameStore.startNewCampaign(2);
    storage.setItem('shiftmake:slot:2:replay:stale', JSON.stringify(makeReplayPayload(999)));
    const result = gameStore.importCampaignReport(report!, 2);
    expect(result.ok).toBe(true);

    const imported = currentStoreState<{
      activeSlotId: number | null;
      screen: string;
      centerMode: string;
      validationMessages: string[];
      game: {
        campaignSeed: number;
        replayIndex: ReplayIndexEntry[];
      };
    }>();
    expect(imported.activeSlotId).toBe(2);
    expect(imported.screen).toBe('overworld');
    expect(imported.centerMode).toBe('rifts');
    expect(imported.validationMessages).toEqual(['Example warning']);
    expect(imported.game.campaignSeed).toBe(decoded.payload.game.campaignSeed);
    expect(storage.getItem('shiftmake:slot:2:replay:stale')).toBeNull();
    expect(storage.getItem(`shiftmake:slot:2:replay:v3.19:${imported.game.replayIndex[0]?.replayId}`)).not.toBeNull();
    expect(storage.getItem('shiftmake:slot:1:save:v3')).not.toBeNull();
  });

  it('exports campaign reports directly from occupied save slots', () => {
    gameStore.startNewCampaign(1);
    claimDefaultOpeningTroops();
    const uiContext: CampaignReportUiContext = {
      screen: 'main_menu',
      centerMode: 'rifts',
      selectedRiftId: null,
      selectedTroopId: null,
      selectedReplayId: null,
      currentReplayStep: null,
      systemMessage: null,
      validationMessages: [],
    };

    gameStore.returnToMainMenu();

    const report = gameStore.createCampaignReportForSlot(1, uiContext);
    expect(report).toBeTruthy();
    const decoded = decodeCampaignReport(report!);
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) {
      return;
    }
    expect(decoded.payload.summary.phase).toBe('planning');
    expect(decoded.payload.uiContext.screen).toBe('main_menu');
  });

  it('preserves unsubmitted multiplayer edits when the other player submits readiness', () => {
    vi.stubGlobal('WebSocket', FakeWebSocket);
    const room = startNewGame(123, 'contest');

    gameStore.connectMultiplayerContest('ws://test-room', 'ABCD', 'Player 2');
    const socket = FakeWebSocket.instances[0]!;
    socket.open();
    socket.receive({
      kind: 'room-snapshot',
      roomId: 'ABCD',
      playerId: 'ai',
      playerToken: 'ai-token',
      game: room,
      readiness: { human: false, ai: false },
      playerNames: { human: 'Player 1', ai: 'Player 2' },
      replayPayloads: {},
      message: null,
    });

    const base = currentStoreState<{ game: GameState }>().game;
    const [firstTroopUnlockId, secondTroopUnlockId] = getOpeningPair(base);
    gameStore.claimOpeningTroop(firstTroopUnlockId);
    gameStore.claimOpeningTroop(secondTroopUnlockId);
    const selectedTroops = currentStoreState<{ game: GameState }>().game.troops;

    socket.receive({
      kind: 'room-snapshot',
      roomId: 'ABCD',
      playerId: 'ai',
      playerToken: 'ai-token',
      game: room,
      readiness: { human: true, ai: false },
      playerNames: { human: 'Player 1', ai: 'Player 2' },
      replayPayloads: {},
      message: null,
    });

    const afterOpponentReady = currentStoreState<{
      game: GameState;
      multiplayer: { readiness: { human: boolean; ai: boolean }; message: string | null } | null;
      systemMessage: string | null;
    }>();
    expect(afterOpponentReady.game.troops).toEqual(selectedTroops);
    expect(afterOpponentReady.multiplayer?.readiness).toEqual({ human: true, ai: false });
    expect(afterOpponentReady.multiplayer?.message).toBeNull();
    expect(afterOpponentReady.systemMessage).toBeNull();
  });

  it('preserves unsubmitted multiplayer troop assignments when the other player submits readiness', () => {
    vi.stubGlobal('WebSocket', FakeWebSocket);
    const opening = startNewGame(456, 'contest');
    const [firstTroopUnlockId, secondTroopUnlockId] = getOpeningPair(opening);
    const room = startOpeningCampaign(claimOpeningTroop(claimOpeningTroop(opening, firstTroopUnlockId), secondTroopUnlockId));

    gameStore.connectMultiplayerContest('ws://test-room', 'WXYZ', 'Player 2');
    const socket = FakeWebSocket.instances[0]!;
    socket.open();
    socket.receive({
      kind: 'room-snapshot',
      roomId: 'WXYZ',
      playerId: 'ai',
      playerToken: 'ai-token',
      game: room,
      readiness: { human: false, ai: false },
      playerNames: { human: 'Player 1', ai: 'Player 2' },
      replayPayloads: {},
      message: null,
    });

    const current = currentStoreState<{ game: GameState }>().game;
    gameStore.assignTroopToRift(current.troops[0]!.id, current.openRifts[0]!.id);

    socket.receive({
      kind: 'room-snapshot',
      roomId: 'WXYZ',
      playerId: 'ai',
      playerToken: 'ai-token',
      game: room,
      readiness: { human: true, ai: false },
      playerNames: { human: 'Player 1', ai: 'Player 2' },
      replayPayloads: {},
      message: null,
    });

    const afterOpponentReady = currentStoreState<{ game: GameState }>().game;
    expect(afterOpponentReady.troops[0]?.assignmentRiftId).toBe(current.openRifts[0]!.id);
  });

  it('stores multiplayer reconnect tokens from room snapshots', () => {
    vi.stubGlobal('WebSocket', FakeWebSocket);
    const room = startNewGame(789, 'contest');

    gameStore.connectMultiplayerContest('ws://test-room', 'TOKN', 'Player 1');
    const socket = FakeWebSocket.instances[0]!;
    socket.open();
    socket.receive({
      kind: 'room-snapshot',
      roomId: 'TOKN',
      playerId: 'human',
      playerToken: 'human-token',
      game: room,
      readiness: { human: false, ai: false },
      playerNames: { human: 'Player 1', ai: 'Player 2' },
      replayPayloads: {},
      message: null,
    });

    expect(sessionStorage.getItem('shiftmake:multiplayer:contest:identity:ws://test-room|TOKN')).toContain('human-token');
  });

  it('updates multiplayer player names from later room snapshots', () => {
    vi.stubGlobal('WebSocket', FakeWebSocket);
    const room = startNewGame(987, 'contest');

    gameStore.connectMultiplayerContest('ws://test-room', undefined, 'Host');
    const socket = FakeWebSocket.instances[0]!;
    socket.open();
    socket.receive({
      kind: 'room-snapshot',
      roomId: 'NAME',
      playerId: 'human',
      playerToken: 'human-token',
      game: room,
      readiness: { human: false, ai: false },
      connectedPlayers: { human: true, ai: false },
      playerNames: { human: 'Host', ai: 'Player 2' },
      replayPayloads: {},
      message: null,
    });

    socket.receive({
      kind: 'room-snapshot',
      roomId: 'NAME',
      playerId: 'human',
      playerToken: 'human-token',
      game: room,
      readiness: { human: false, ai: false },
      connectedPlayers: { human: true, ai: true },
      playerNames: { human: 'Host', ai: 'Guest' },
      replayPayloads: {},
      message: 'Guest joined room NAME.',
    });

    expect(
      currentStoreState<{ multiplayer: { connectedPlayers: { human: boolean; ai: boolean }; playerNames: { human: string; ai: string } } | null }>().multiplayer,
    ).toMatchObject({
      connectedPlayers: { human: true, ai: true },
      playerNames: { human: 'Host', ai: 'Guest' },
    });
  });

  it('uses a stored multiplayer token to reconnect to the same side', () => {
    vi.stubGlobal('WebSocket', FakeWebSocket);
    sessionStorage.setItem(
      'shiftmake:multiplayer:contest:identity:ws://test-room|RCNT',
      JSON.stringify({ serverUrl: 'ws://test-room', roomId: 'RCNT', playerId: 'ai', playerToken: 'ai-token' }),
    );

    gameStore.connectMultiplayerContest('ws://test-room', 'RCNT', 'Player 2');
    const socket = FakeWebSocket.instances[0]!;
    socket.open();

    expect(JSON.parse(socket.sent[0]!)).toEqual({
      kind: 'reconnect-room',
      roomId: 'RCNT',
      playerId: 'ai',
      token: 'ai-token',
      playerName: 'Player 2',
    });
  });

  it('persists and restores the last multiplayer name and server URL', () => {
    vi.stubGlobal('WebSocket', FakeWebSocket);

    gameStore.connectMultiplayerContest(' ws://lan-room:8787 ', 'LAN1', 'Local Hero');

    expect(readLastMultiplayerServerUrl()).toBe('ws://lan-room:8787');
    expect(readLastMultiplayerPlayerName()).toBe('Local Hero');
  });

  it('cancels ready by sending unsubmit-ready and restoring editable state', () => {
    vi.stubGlobal('WebSocket', FakeWebSocket);
    const room = startNewGame(246, 'contest');

    gameStore.connectMultiplayerContest('ws://test-room', 'CANC', 'Player 1');
    const socket = FakeWebSocket.instances[0]!;
    socket.open();
    socket.receive({
      kind: 'room-snapshot',
      roomId: 'CANC',
      playerId: 'human',
      playerToken: 'human-token',
      game: room,
      readiness: { human: false, ai: false },
      playerNames: { human: 'Player 1', ai: 'Player 2' },
      replayPayloads: {},
      message: null,
    });

    gameStore.submitMultiplayerReady();
    gameStore.cancelMultiplayerReady();

    expect(JSON.parse(socket.sent.at(-1)!)).toEqual({ kind: 'unsubmit-ready' });
    expect(currentStoreState<{ multiplayer: { readiness: { human: boolean; ai: boolean }; message: string | null } | null }>().multiplayer).toMatchObject({
      readiness: { human: false, ai: false },
      message: 'Ready canceled.',
    });
  });

  it('leaves a multiplayer room by notifying the server and clearing local session state', () => {
    vi.stubGlobal('WebSocket', FakeWebSocket);
    const room = startNewGame(864, 'contest');

    gameStore.connectMultiplayerContest('ws://test-room', 'EXIT', 'Player 1');
    const socket = FakeWebSocket.instances[0]!;
    socket.open();
    socket.receive({
      kind: 'room-snapshot',
      roomId: 'EXIT',
      playerId: 'human',
      playerToken: 'human-token',
      game: room,
      readiness: { human: false, ai: false },
      playerNames: { human: 'Player 1', ai: 'Player 2' },
      replayPayloads: {},
      message: null,
    });

    gameStore.leaveMultiplayerContest();

    expect(JSON.parse(socket.sent.at(-1)!)).toEqual({ kind: 'leave-room' });
    expect(socket.readyState).toBe(3);
    expect(currentStoreState<{ multiplayer: unknown; screen: string; systemMessage: string | null }>()).toMatchObject({
      multiplayer: null,
      screen: 'main_menu',
      systemMessage: 'Left multiplayer room.',
    });
  });

  it('restores editing after a rejected multiplayer submission', () => {
    vi.stubGlobal('WebSocket', FakeWebSocket);
    const room = startNewGame(357, 'contest');

    gameStore.connectMultiplayerContest('ws://test-room', 'FAIL', 'Player 1');
    const socket = FakeWebSocket.instances[0]!;
    socket.open();
    socket.receive({
      kind: 'room-snapshot',
      roomId: 'FAIL',
      playerId: 'human',
      playerToken: 'human-token',
      game: room,
      readiness: { human: false, ai: false },
      playerNames: { human: 'Player 1', ai: 'Player 2' },
      replayPayloads: {},
      message: null,
    });

    gameStore.submitMultiplayerReady();
    socket.receive({ kind: 'room-error', message: 'That multiplayer submission is not legal.' });

    expect(currentStoreState<{ multiplayer: { readiness: { human: boolean; ai: boolean }; message: string | null } | null }>().multiplayer).toMatchObject({
      readiness: { human: false, ai: false },
      message: 'That multiplayer submission is not legal.',
    });
  });
});
