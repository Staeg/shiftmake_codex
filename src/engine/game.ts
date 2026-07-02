import { buildBattleInputFromResolvedCombatants, resolveBattle } from './battle';
import {
  BATTLE_RECOVERY,
  createTroopInstance,
  getTroopById,
  getTroopsAssignedToRift,
  isRaceUnited,
  isUnitClassUnited,
  resolveTroopCombatant,
  tickRecovery,
} from './army';
import { fixed } from './fixed';
import { createRng } from './rng';
import { deserializeGameState, serializeGameState } from './save';
import { LADDER_FINAL_CYCLE } from './ladder';
import { deriveSeed, generateContestCycleRifts, generateCycleRifts } from './rift';
import {
  RACE_UPGRADES,
  RACES,
  TROOP_CLASS_UPGRADES,
  NATIVE_TROOP_UNLOCK_IDS,
  getRace,
  getRaceNativeTroopUnlockIds,
  getUnitClass,
  isNativeTroopUnlockId,
} from './unitCatalog';
import { getAvailableTroopUnlockIds, getOwnedTroopUnlockIds, upgradeAffectsTroop } from './upgrades';
import type {
  ApplyCycleOutcomeResult,
  CycleResolution,
  RaceId,
  RaceUnlockOffer,
  ContestPlayerId,
  ContestPlayerState,
  BattleSideParticipants,
  GameMode,
  GameState,
  EssenceDraftRerollSide,
  ReplayIndexEntry,
  ResolvedCombatantDefinition,
  RiftResolutionRecord,
  RiftInstance,
  StoredReplayPayload,
  TroopDraftOffer,
  TroopId,
  TroopClassUnlockOffer,
  TroopUnlockId,
  UnitClassId,
  UpgradeDraftOffer,
  UpgradeId,
  ValidationIssue,
  ValidationResult,
} from './types';

const OPENING_RACE_OPTION_COUNT = 4;
export const CAMPAIGN_FINAL_CYCLE = 10;
export const CONTEST_FINAL_CYCLE = 10;
const AI_MIN_ESTIMATED_WIN_MARGIN = -20;

export interface ContestAiPlannerOptions {
  maxCandidateGroupsPerRift: number;
  maxBattleSimulationsPerRift: number;
  maxConfirmedWinningGroupsPerRift: number;
}

export const CONTEST_AI_WORKER_OPTIONS: ContestAiPlannerOptions = {
  maxCandidateGroupsPerRift: 32,
  maxBattleSimulationsPerRift: 12,
  maxConfirmedWinningGroupsPerRift: 6,
};

export const CONTEST_AI_SYNC_FALLBACK_OPTIONS: ContestAiPlannerOptions = {
  maxCandidateGroupsPerRift: 8,
  maxBattleSimulationsPerRift: 3,
  maxConfirmedWinningGroupsPerRift: 2,
};

function buildEmptyContestPlayerState(): ContestPlayerState {
  return {
    victoryPoints: 0,
    essence: 0,
    unlockedRaceIds: [],
    unlockedTroopUnlockIds: [],
    recentTroopUnlockIds: [],
    troops: [],
    raceUpgradeIds: [],
    troopClassUpgradeIds: [],
    activeTroopOffer: null,
    activeUpgradeOffer: null,
    activeRaceUnlockOffer: null,
    activeTroopClassUnlockOffer: null,
    troopOfferRolls: 0,
    upgradeOfferRolls: 0,
    essenceDraftRerollUsed: null,
    seenTroopOfferOptionIds: [],
    seenUpgradeOfferOptionIds: [],
  };
}

function buildInitialState(seed: number, gameMode: GameMode = 'campaign'): GameState {
  return {
    version: 3,
    gameMode,
    campaignSeed: seed,
    cycleNumber: 1,
    phase: 'opening_unlock',
    essence: 0,
    victoryPoints: 0,
    unlockedRaceIds: [],
    unlockedTroopUnlockIds: [],
    recentTroopUnlockIds: [],
    troops: [],
    raceUpgradeIds: [],
    troopClassUpgradeIds: [],
    activeTroopOffer: null,
    activeUpgradeOffer: null,
    activeRaceUnlockOffer: null,
    activeTroopClassUnlockOffer: null,
    troopOfferRolls: 0,
    upgradeOfferRolls: 0,
    essenceDraftRerollUsed: null,
    seenTroopOfferOptionIds: [],
    seenUpgradeOfferOptionIds: [],
    postgameDismissed: false,
    openRifts: [],
    replayIndex: [],
    ...(gameMode === 'contest'
      ? {
          contest: {
            players: {
              playerOne: buildEmptyContestPlayerState(),
              playerTwo: buildEmptyContestPlayerState(),
            },
            opponentInfo: null,
          },
        }
      : {}),
    ...(gameMode === 'ladder' ? { ladder: { currentRiftSetId: null, currentGeneration: null, currentSourceCycleNumber: null } } : {}),
  };
}

function markExistingRiftsInactive(rifts: RiftInstance[]): RiftInstance[] {
  return rifts.map((rift) => (rift.state === 'discovered' ? { ...rift, state: 'expired' } : rift));
}

function buildReplayIndexEntry(
  cycleNumber: number,
  replay: CycleResolution['records'][number]['replay'],
  estimatedBytes: number,
  encounterLabel?: string,
  sideParticipants?: BattleSideParticipants,
  riftLabel?: string,
  outcomeOverride?: ReplayIndexEntry['outcome'],
): ReplayIndexEntry {
  const outcome = outcomeOverride ?? replay.outcome;
  const finalUnits = replay.steps[replay.steps.length - 1]?.snapshot.units ?? replay.initial.units;
  const finalPlayerUnits = finalUnits.filter((unit) => unit.side === 'player');
  const finalEnemyUnits = finalUnits.filter((unit) => unit.side === 'enemy');
  const finalPlayerHp = finalPlayerUnits.reduce((sum, unit) => sum + (unit.alive ? Math.max(0, unit.hp) : 0), 0);
  const finalEnemyHp = finalEnemyUnits.reduce((sum, unit) => sum + (unit.alive ? Math.max(0, unit.hp) : 0), 0);
  const finalPlayerMaxHp = finalPlayerUnits.reduce((sum, unit) => sum + unit.maxHp, 0);
  const finalEnemyMaxHp = finalEnemyUnits.reduce((sum, unit) => sum + unit.maxHp, 0);
  return {
    id: replay.id,
    replayId: replay.id,
    riftId: replay.riftId,
    riftLabel,
    cycleNumber,
    battleSeed: replay.seed,
    outcome,
    encounterLabel,
    sideParticipants,
    playerTroopLabels: replay.summary.playerTroops,
    enemyTroopLabels: replay.summary.enemyTroops,
    mutatorIds: replay.mutatorIds,
    summary: `${outcome.toUpperCase()} ${replay.summary.finalPlayerAlive}-${replay.summary.finalEnemyAlive}`,
    estimatedBytes,
    finalPlayerAlive: replay.summary.finalPlayerAlive,
    finalEnemyAlive: replay.summary.finalEnemyAlive,
    finalPlayerHp,
    finalPlayerMaxHp,
    finalEnemyHp,
    finalEnemyMaxHp,
  };
}

function formatRiftLabel(riftId: string | null): string | undefined {
  if (!riftId) {
    return undefined;
  }
  const match = /^cycle-(\d+)-rift-(\d+)$/i.exec(riftId);
  return match ? `C${match[1]}R${match[2]}` : riftId;
}

function buildStoredReplayPayload(record: CycleResolution['records'][number]): StoredReplayPayload {
  return {
    version: 1,
    input: record.battleInput,
  };
}

function withBattleSideParticipants(
  input: CycleResolution['records'][number]['battleInput'],
  sideParticipants: BattleSideParticipants,
): CycleResolution['records'][number]['battleInput'] {
  return {
    ...input,
    sideParticipants,
  };
}

function getOwnedUnitClassIds(state: Pick<GameState, 'troops'>): UnitClassId[] {
  return [...new Set(state.troops.map((troop) => troop.unitClassId))];
}

type ProgressState = Pick<
  GameState,
  | 'unlockedRaceIds'
  | 'unlockedTroopUnlockIds'
  | 'recentTroopUnlockIds'
  | 'troops'
  | 'raceUpgradeIds'
  | 'troopClassUpgradeIds'
  | 'activeTroopOffer'
  | 'activeUpgradeOffer'
  | 'activeRaceUnlockOffer'
  | 'activeTroopClassUnlockOffer'
  | 'troopOfferRolls'
  | 'upgradeOfferRolls'
  | 'essenceDraftRerollUsed'
  | 'seenTroopOfferOptionIds'
  | 'seenUpgradeOfferOptionIds'
>;

function addTroopToRoster<T extends ProgressState>(state: T, troopUnlockId: TroopUnlockId): T {
  const [raceId, unitClassId] = troopUnlockId.split('/') as [RaceId, UnitClassId];
  if (getOwnedTroopUnlockIds(state).includes(troopUnlockId)) {
    return state;
  }
  return {
    ...state,
    unlockedRaceIds: state.unlockedRaceIds.includes(raceId) ? state.unlockedRaceIds : [...state.unlockedRaceIds, raceId],
    troops: [...state.troops, createTroopInstance(raceId, unitClassId)],
  };
}

function grantTroopUnlock<T extends Pick<ProgressState, 'unlockedTroopUnlockIds' | 'troops'>>(state: T, troopUnlockId: TroopUnlockId): T {
  if (isNativeTroopUnlockId(troopUnlockId) || state.unlockedTroopUnlockIds.includes(troopUnlockId)) {
    return state;
  }

  return {
    ...state,
    unlockedTroopUnlockIds: [...state.unlockedTroopUnlockIds, troopUnlockId],
  };
}

function addUpgradeUnlock<T extends Pick<ProgressState, 'raceUpgradeIds' | 'troopClassUpgradeIds'>>(state: T, upgradeId: UpgradeId): T {
  if (upgradeId in RACE_UPGRADES) {
    if (state.raceUpgradeIds.includes(upgradeId)) {
      return state;
    }
    return {
      ...state,
      raceUpgradeIds: [...state.raceUpgradeIds, upgradeId],
    };
  }

  if (upgradeId in TROOP_CLASS_UPGRADES) {
    if (state.troopClassUpgradeIds.includes(upgradeId)) {
      return state;
    }
    return {
      ...state,
      troopClassUpgradeIds: [...state.troopClassUpgradeIds, upgradeId],
    };
  }

  return state;
}

function chooseRaceUpgradeIds(state: GameState, raceId: RaceId, count: number, seed: number): UpgradeId[] {
  const rng = createRng(seed);
  const available = Object.values(RACE_UPGRADES)
    .filter((upgrade) => upgrade.raceId === raceId)
    .map((upgrade) => upgrade.id)
    .filter((upgradeId) => !state.raceUpgradeIds.includes(upgradeId));
  const selected: UpgradeId[] = [];
  while (selected.length < count && available.length > 0) {
    const picked = rng.pick(available);
    selected.push(picked);
    available.splice(available.indexOf(picked), 1);
  }
  return selected;
}

function chooseTroopUnlockIdsForRace(state: GameState, raceId: RaceId, count: number, seed: number): TroopUnlockId[] {
  const rng = createRng(seed);
  let pseudoState = state;
  const available = getRaceTroopClassUnlockOptions(state, raceId);
  const selected: TroopUnlockId[] = [];
  while (selected.length < count && available.length > 0) {
    const fitting = available.filter((troopUnlockId) => rosterCanFitOpenRifts(pseudoState, troopUnlockId));
    if (fitting.length === 0) {
      break;
    }
    const picked = rng.pick(fitting);
    selected.push(picked);
    const [pickedRaceId, pickedUnitClassId] = splitTroopUnlockId(picked);
    pseudoState = {
      ...pseudoState,
      troops: [...pseudoState.troops, createTroopInstance(pickedRaceId, pickedUnitClassId)],
    };
    available.splice(available.indexOf(picked), 1);
  }
  return selected;
}

function buildRaceUnlockOffer(state: GameState, cycleNumber: number, upgradeCount: number, troopUnlockChoiceCount: number): RaceUnlockOffer | null {
  const lockedRaceIds = (Object.keys(RACES) as RaceId[]).filter((raceId) => !state.unlockedRaceIds.includes(raceId));
  if (lockedRaceIds.length === 0) {
    return null;
  }

  const rng = createRng(deriveSeed(state.campaignSeed, cycleNumber * 30_007 + upgradeCount * 101));
  const candidates = [...lockedRaceIds];
  const optionRaceIds: RaceId[] = [];
  while (optionRaceIds.length < 3 && candidates.length > 0) {
    const picked = rng.pick(candidates);
    optionRaceIds.push(picked);
    candidates.splice(candidates.indexOf(picked), 1);
  }

  const upgradeIdsByRaceId = Object.fromEntries(
    optionRaceIds.map((raceId) => [
      raceId,
      chooseRaceUpgradeIds(state, raceId, upgradeCount, deriveSeed(state.campaignSeed, cycleNumber * 31_337 + raceId.length)),
    ]),
  ) as Record<RaceId, UpgradeId[]>;
  const troopUnlockIdsByRaceId = Object.fromEntries(
    optionRaceIds.map((raceId) => [
      raceId,
      chooseTroopUnlockIdsForRace(state, raceId, troopUnlockChoiceCount, deriveSeed(state.campaignSeed, cycleNumber * 37_109 + raceId.length)),
    ]),
  ) as Record<RaceId, TroopUnlockId[]>;

  return {
    kind: 'race_unlock',
    cycleNumber,
    optionRaceIds,
    upgradeIdsByRaceId,
    troopUnlockChoiceCount,
    troopUnlockIdsByRaceId,
  };
}

function getRaceTroopClassUnlockOptions(state: GameState, raceId: RaceId): TroopUnlockId[] {
  const ownedTroopUnlockIds = new Set(getOwnedTroopUnlockIds(state));
  const native = getRaceNativeTroopUnlockIds(raceId) as TroopUnlockId[];
  const defeated = state.unlockedTroopUnlockIds.filter((troopUnlockId) => splitTroopUnlockId(troopUnlockId)[0] === raceId);
  return [...new Set([...native, ...defeated])].filter((troopUnlockId) => !ownedTroopUnlockIds.has(troopUnlockId));
}

function buildTroopClassUnlockOffer(state: GameState, cycleNumber: number, raceId: RaceId, remainingChoices: number): TroopClassUnlockOffer | null {
  if (remainingChoices <= 0) {
    return null;
  }
  const optionTroopUnlockIds = getRaceTroopClassUnlockOptions(state, raceId).filter((troopUnlockId) =>
    rosterCanFitOpenRifts(state, troopUnlockId),
  );
  if (optionTroopUnlockIds.length === 0) {
    return null;
  }
  return {
    kind: 'troop_class_unlock',
    cycleNumber,
    raceId,
    remainingChoices,
    optionTroopUnlockIds,
  };
}

export function applyScheduledCycleUnlock(state: GameState): GameState {
  if (state.phase !== 'planning' || state.activeRaceUnlockOffer || state.activeTroopClassUnlockOffer) {
    return state;
  }
  const scheduled =
    state.cycleNumber === 3
      ? { upgradeCount: 1, troopUnlockChoiceCount: 2 }
      : state.cycleNumber === 7
        ? { upgradeCount: 2, troopUnlockChoiceCount: 3 }
        : null;
  if (!scheduled) {
    return state;
  }
  const offer = buildRaceUnlockOffer(state, state.cycleNumber, scheduled.upgradeCount, scheduled.troopUnlockChoiceCount);
  return offer ? { ...state, phase: 'race_unlock', activeRaceUnlockOffer: offer } : state;
}

function splitTroopUnlockId(troopUnlockId: TroopUnlockId): [RaceId, UnitClassId] {
  return troopUnlockId.split('/') as [RaceId, UnitClassId];
}

function countRosterAssignmentSlots(state: Pick<GameState, 'openRifts'>): number {
  return state.openRifts.filter((rift) => rift.state === 'discovered' || (rift.occupyingTroopIds?.length ?? 0) > 0).length;
}

function rosterCanFitOpenRifts(
  state: Pick<GameState, 'troops' | 'openRifts'>,
  extraTroopUnlockId: TroopUnlockId | null = null,
): boolean {
  const riftCount = countRosterAssignmentSlots(state);
  if (riftCount <= 0) {
    return false;
  }

  const raceCounts = new Map<RaceId, number>();
  const unitClassCounts = new Map<UnitClassId, number>();
  state.troops.forEach((troop) => {
    raceCounts.set(troop.raceId, (raceCounts.get(troop.raceId) ?? 0) + 1);
    unitClassCounts.set(troop.unitClassId, (unitClassCounts.get(troop.unitClassId) ?? 0) + 1);
  });

  if (extraTroopUnlockId) {
    const [raceId, unitClassId] = splitTroopUnlockId(extraTroopUnlockId);
    raceCounts.set(raceId, (raceCounts.get(raceId) ?? 0) + 1);
    unitClassCounts.set(unitClassId, (unitClassCounts.get(unitClassId) ?? 0) + 1);
  }

  return [...raceCounts.values(), ...unitClassCounts.values()].every((count) => count <= riftCount);
}

export function getRootProgress(state: GameState): ContestPlayerState {
  return progressFromPseudoState(state);
}

export function withRootProgress(state: GameState, progress: ContestPlayerState): GameState {
  return {
    ...state,
    victoryPoints: progress.victoryPoints,
    essence: progress.essence,
    unlockedRaceIds: progress.unlockedRaceIds,
    unlockedTroopUnlockIds: progress.unlockedTroopUnlockIds,
    recentTroopUnlockIds: progress.recentTroopUnlockIds,
    troops: progress.troops,
    raceUpgradeIds: progress.raceUpgradeIds,
    troopClassUpgradeIds: progress.troopClassUpgradeIds,
    activeTroopOffer: progress.activeTroopOffer,
    activeUpgradeOffer: progress.activeUpgradeOffer,
    activeRaceUnlockOffer: progress.activeRaceUnlockOffer,
    activeTroopClassUnlockOffer: progress.activeTroopClassUnlockOffer,
    troopOfferRolls: progress.troopOfferRolls,
    upgradeOfferRolls: progress.upgradeOfferRolls,
    essenceDraftRerollUsed: progress.essenceDraftRerollUsed,
    seenTroopOfferOptionIds: progress.seenTroopOfferOptionIds,
    seenUpgradeOfferOptionIds: progress.seenUpgradeOfferOptionIds,
  };
}

function getContestPlayerTwo(state: GameState): ContestPlayerState {
  return state.contest?.players.playerTwo ?? buildEmptyContestPlayerState();
}

function withContestPlayers(state: GameState, players: Partial<Record<ContestPlayerId, ContestPlayerState>>): GameState {
  const playerOne = players.playerOne ?? getRootProgress(state);
  const playerTwo = players.playerTwo ?? state.contest?.players.playerTwo ?? buildEmptyContestPlayerState();
  return {
    ...withRootProgress(state, playerOne),
    contest: {
      ...state.contest,
      players: {
        playerOne,
        playerTwo,
      },
      opponentInfo: state.contest?.opponentInfo ?? null,
    },
  };
}

export function syncContestRootFromPlayer(state: GameState, playerId: ContestPlayerId): GameState {
  return withRootProgress(state, getContestPlayerProgress(state, playerId));
}

function chooseAiOpeningTroops(seed: number): ContestPlayerState {
  const openingRaceIds = getOpeningRaceOptionIds(seed);
  const starterTroopUnlockIds = getOpeningRaceStarterTroopUnlockIds(seed);
  let ai = buildEmptyContestPlayerState();
  openingRaceIds.slice(0, 2).forEach((raceId) => {
    ai = addTroopToRoster(ai, starterTroopUnlockIds[raceId]);
  });

  return { ...ai, essence: 2 };
}

function contestPlayerState(state: GameState, playerId: ContestPlayerId): ProgressState & { essence: number; victoryPoints: number } {
  return playerId === 'playerOne' ? state : getContestPlayerTwo(state);
}

function getContestPlayerTroops(state: GameState, playerId: ContestPlayerId) {
  return contestPlayerState(state, playerId).troops;
}

function getContestReadyTroops(state: GameState, playerId: ContestPlayerId) {
  return getContestPlayerTroops(state, playerId).filter((troop) => troop.recoveryCyclesRemaining === 0 && troop.assignmentRiftId === null);
}

export function getOpeningRaceOptionIds(source?: Pick<GameState, 'campaignSeed'> | number): RaceId[] {
  if (source === undefined) {
    return (Object.keys(RACES) as RaceId[]).slice(0, OPENING_RACE_OPTION_COUNT);
  }
  const seed = typeof source === 'number' ? source : source.campaignSeed;
  return createRng(deriveSeed(seed, 45_041))
    .shuffle(Object.keys(RACES) as RaceId[])
    .slice(0, OPENING_RACE_OPTION_COUNT);
}

export function getOpeningRaceStarterTroopUnlockIds(source?: Pick<GameState, 'campaignSeed'> | number): Record<RaceId, TroopUnlockId> {
  const seed = source === undefined ? 0 : typeof source === 'number' ? source : source.campaignSeed;
  const rng = createRng(deriveSeed(seed, 46_019));
  const raceIds = getOpeningRaceOptionIds(source);
  const optionsByRaceId = Object.fromEntries(
    raceIds.map((raceId) => [raceId, rng.shuffle(getRaceNativeTroopUnlockIds(raceId) as TroopUnlockId[])]),
  ) as Record<RaceId, TroopUnlockId[]>;
  const selectedByRaceId: Partial<Record<RaceId, TroopUnlockId>> = {};

  function assignStarter(index: number, usedUnitClassIds: Set<UnitClassId>): boolean {
    const raceId = raceIds[index];
    if (!raceId) {
      return true;
    }

    for (const troopUnlockId of optionsByRaceId[raceId] ?? []) {
      const [, unitClassId] = splitTroopUnlockId(troopUnlockId);
      if (usedUnitClassIds.has(unitClassId)) {
        continue;
      }
      selectedByRaceId[raceId] = troopUnlockId;
      usedUnitClassIds.add(unitClassId);
      if (assignStarter(index + 1, usedUnitClassIds)) {
        return true;
      }
      usedUnitClassIds.delete(unitClassId);
      delete selectedByRaceId[raceId];
    }

    return false;
  }

  if (!assignStarter(0, new Set())) {
    raceIds.forEach((raceId) => {
      selectedByRaceId[raceId] = optionsByRaceId[raceId]?.[0];
    });
  }

  const entries = raceIds.map((raceId) => [raceId, selectedByRaceId[raceId]!] as const);
  return Object.fromEntries(entries) as Record<RaceId, TroopUnlockId>;
}

export function getOpeningRaceStarterTroopUnlockId(source: Pick<GameState, 'campaignSeed'> | number, raceId: RaceId): TroopUnlockId | null {
  return getOpeningRaceStarterTroopUnlockIds(source)[raceId] ?? null;
}

function getAvailableUpgradeIds(state: GameState): UpgradeId[] {
  return [
    ...Object.values(RACE_UPGRADES).map((upgrade) => upgrade.id),
    ...Object.values(TROOP_CLASS_UPGRADES).map((upgrade) => upgrade.id),
  ].filter(
    (upgradeId) =>
      !state.raceUpgradeIds.includes(upgradeId) &&
      !state.troopClassUpgradeIds.includes(upgradeId) &&
      state.troops.some((troop) => upgradeAffectsTroop(upgradeId, troop)),
  );
}

function candidatePoolWithSeenFallback(bucket: string[], selected: Set<string>, seenOptionIds: Set<string>, allOptions: string[]): string[] {
  const unselected = bucket.filter((optionId) => !selected.has(optionId));
  if (allOptions.some((optionId) => !selected.has(optionId) && !seenOptionIds.has(optionId))) {
    return unselected.filter((optionId) => !seenOptionIds.has(optionId));
  }
  return unselected;
}

function pickOfferOptions(seed: number, bucketOptions: string[][][], allOptions: string[], seenOptionIds: string[] = []): string[] {
  const rng = createRng(seed);
  const selected = new Set<string>();
  const seen = new Set(seenOptionIds);

  bucketOptions.forEach((buckets) => {
    const prioritizedSources = [...buckets, allOptions];
    const source = prioritizedSources.map((bucket) => candidatePoolWithSeenFallback(bucket, selected, seen, allOptions)).find((bucket) => bucket.length > 0) ?? [];
    if (source.length === 0) {
      return;
    }
    selected.add(rng.pick(source));
  });

  return [...selected];
}

function pickUnselectedOption(
  rng: ReturnType<typeof createRng>,
  bucket: string[],
  selected: Set<string>,
  seenOptionIds: Set<string> = new Set(),
  allOptions: string[] = bucket,
): string | null {
  const candidates = candidatePoolWithSeenFallback(bucket, selected, seenOptionIds, allOptions);
  return candidates.length > 0 ? rng.pick(candidates) : null;
}

function buildTroopOffer(state: GameState, seenOptionIds: TroopUnlockId[] = []): TroopDraftOffer | null {
  const availableTroopUnlockIds = getAvailableTroopUnlockIds(state).filter((troopUnlockId) =>
    rosterCanFitOpenRifts(state, troopUnlockId),
  );
  if (availableTroopUnlockIds.length === 0) {
    return null;
  }

  const ownedUnitClassIds = new Set(getOwnedUnitClassIds(state));
  const ownedRaceIds = new Set(state.unlockedRaceIds);
  const recentTroopUnlockIds = (state.recentTroopUnlockIds ?? []).filter((troopUnlockId) => availableTroopUnlockIds.includes(troopUnlockId));
  const ownedRaceTroopUnlockIds = availableTroopUnlockIds.filter((troopUnlockId) => ownedRaceIds.has(splitTroopUnlockId(troopUnlockId)[0]));
  const options = pickOfferOptions(
    deriveSeed(state.campaignSeed, state.cycleNumber * 10_001 + state.troopOfferRolls + 1),
    [
      [ownedRaceTroopUnlockIds],
      [availableTroopUnlockIds.filter((troopUnlockId) => ownedUnitClassIds.has(splitTroopUnlockId(troopUnlockId)[1]))],
      [recentTroopUnlockIds, ownedRaceTroopUnlockIds],
    ],
    availableTroopUnlockIds,
    seenOptionIds,
  );

  return options.length > 0 ? { kind: 'troop', optionTroopUnlockIds: options } : null;
}

function countExistingUpgradesAffectingTroop(state: GameState, troop: GameState['troops'][number]): number {
  return [...state.raceUpgradeIds, ...state.troopClassUpgradeIds].filter((upgradeId) => upgradeAffectsTroop(upgradeId, troop)).length;
}

function buildLeastUpgradedTroopUpgradeBucket(
  state: GameState,
  availableUpgradeIds: UpgradeId[],
  selected: Set<string>,
  rng: ReturnType<typeof createRng>,
  excludedUnitClassId: UnitClassId | null,
  excludedRaceId: RaceId | null,
): UpgradeId[] {
  if (state.troops.length === 0) {
    return [];
  }

  const bucketByTroop = state.troops
    .map((troop) => ({
      troop,
      bucket: availableUpgradeIds.filter(
        (upgradeId) =>
          !selected.has(upgradeId) &&
          TROOP_CLASS_UPGRADES[upgradeId]?.unitClassId !== excludedUnitClassId &&
          RACE_UPGRADES[upgradeId]?.raceId !== excludedRaceId &&
          upgradeAffectsTroop(upgradeId, troop),
      ),
    }))
    .filter(({ bucket }) => bucket.length > 0);
  if (bucketByTroop.length === 0) {
    return [];
  }

  const leastUpgradeCount = Math.min(...bucketByTroop.map(({ troop }) => countExistingUpgradesAffectingTroop(state, troop)));
  const targetTroops = bucketByTroop.filter(({ troop }) => countExistingUpgradesAffectingTroop(state, troop) === leastUpgradeCount);
  const shuffledTargetTroops = rng.shuffle(targetTroops);

  return shuffledTargetTroops[0]?.bucket ?? [];
}

function buildUpgradeOffer(state: GameState, seenOptionIds: UpgradeId[] = []): UpgradeDraftOffer | null {
  const ownedUnitClassIds = new Set(getOwnedUnitClassIds(state));
  const availableUpgradeIds = getAvailableUpgradeIds(state);

  if (availableUpgradeIds.length === 0) {
    return null;
  }

  const troopUpgradeBucket = availableUpgradeIds.filter(
    (upgradeId) => upgradeId in TROOP_CLASS_UPGRADES && ownedUnitClassIds.has(TROOP_CLASS_UPGRADES[upgradeId]!.unitClassId),
  );
  const raceUpgradeBucket = availableUpgradeIds.filter(
    (upgradeId) => upgradeId in RACE_UPGRADES && state.troops.some((troop) => upgradeAffectsTroop(upgradeId, troop)),
  );
  const rng = createRng(deriveSeed(state.campaignSeed, state.cycleNumber * 20_003 + state.upgradeOfferRolls + 1));
  const selected = new Set<string>();
  const seen = new Set(seenOptionIds);

  const pickedTroopClassUpgrade =
    pickUnselectedOption(rng, troopUpgradeBucket, selected, seen, availableUpgradeIds) ??
    pickUnselectedOption(rng, availableUpgradeIds, selected, seen, availableUpgradeIds);
  if (pickedTroopClassUpgrade) {
    selected.add(pickedTroopClassUpgrade);
  }

  const pickedRaceUpgrade =
    pickUnselectedOption(rng, raceUpgradeBucket, selected, seen, availableUpgradeIds) ??
    pickUnselectedOption(rng, availableUpgradeIds, selected, seen, availableUpgradeIds);
  if (pickedRaceUpgrade) {
    selected.add(pickedRaceUpgrade);
  }

  const excludedUnitClassId = TROOP_CLASS_UPGRADES[pickedTroopClassUpgrade ?? '']?.unitClassId ?? null;
  const excludedRaceId = RACE_UPGRADES[pickedRaceUpgrade ?? '']?.raceId ?? null;

  const leastUpgradedTroopBucket = buildLeastUpgradedTroopUpgradeBucket(
    state,
    availableUpgradeIds,
    selected,
    rng,
    excludedUnitClassId,
    excludedRaceId,
  );
  const pickedTargetedUpgrade =
    pickUnselectedOption(rng, leastUpgradedTroopBucket, selected, seen, availableUpgradeIds) ??
    pickUnselectedOption(rng, availableUpgradeIds, selected, seen, availableUpgradeIds);
  if (pickedTargetedUpgrade) {
    selected.add(pickedTargetedUpgrade);
  }

  const options = [...selected];

  return options.length > 0 ? { kind: 'upgrade', optionUpgradeIds: options } : null;
}

export function getEssenceDraftCost(state: GameState): number | null {
  if (state.phase !== 'planning' || state.activeTroopOffer || state.activeUpgradeOffer) {
    return null;
  }

  const hasTroopOptions = getAvailableTroopUnlockIds(state).some((troopUnlockId) => rosterCanFitOpenRifts(state, troopUnlockId));
  const hasUpgradeOptions = getAvailableUpgradeIds(state).length > 0;
  if (hasTroopOptions && hasUpgradeOptions) {
    return 2;
  }
  if (hasTroopOptions || hasUpgradeOptions) {
    return 1;
  }
  return null;
}

export function startNewGame(seed = Date.now() >>> 0, gameMode: GameMode = 'campaign'): GameState {
  return buildInitialState(seed, gameMode);
}

export function claimOpeningTroop(state: GameState, troopUnlockId: TroopUnlockId): GameState {
  if (state.phase !== 'opening_unlock' || !NATIVE_TROOP_UNLOCK_IDS.includes(troopUnlockId)) {
    return state;
  }

  const [raceId, unitClassId] = splitTroopUnlockId(troopUnlockId);
  const starterTroopUnlockId = getOpeningRaceStarterTroopUnlockId(state, raceId);
  if (
    state.troops.length >= 2 ||
    !getOpeningRaceOptionIds(state).includes(raceId) ||
    starterTroopUnlockId !== troopUnlockId ||
    state.troops.some((troop) => troop.raceId === raceId || troop.unitClassId === unitClassId)
  ) {
    return state;
  }

  return addTroopToRoster(state, troopUnlockId);
}

export function unclaimOpeningTroop(state: GameState, troopUnlockId: TroopUnlockId): GameState {
  if (state.phase !== 'opening_unlock' || !NATIVE_TROOP_UNLOCK_IDS.includes(troopUnlockId)) {
    return state;
  }

  const [raceId, unitClassId] = splitTroopUnlockId(troopUnlockId);
  const nextTroops = state.troops.filter((troop) => troop.raceId !== raceId || troop.unitClassId !== unitClassId);
  if (nextTroops.length === state.troops.length) {
    return state;
  }

  return {
    ...state,
    unlockedRaceIds: [...new Set(nextTroops.map((troop) => troop.raceId))],
    troops: nextTroops,
  };
}

export function startOpeningCampaign(state: GameState): GameState {
  if (state.phase !== 'opening_unlock' || state.troops.length !== 2) {
    return state;
  }

  if (state.gameMode === 'contest') {
    const playerOne = {
      ...getRootProgress(state),
      essence: 2,
    };
    return withContestPlayers(
      {
        ...state,
        phase: 'planning',
        essence: 2,
        openRifts: generateContestCycleRifts(state),
      },
      {
        playerOne,
        playerTwo: chooseAiOpeningTroops(state.campaignSeed),
      },
    );
  }

  if (state.gameMode === 'ladder') {
    return {
      ...state,
      phase: 'planning',
      essence: 2,
    };
  }

  return {
    ...state,
    phase: 'planning',
    essence: 2,
    openRifts: generateCycleRifts(state),
  };
}

export function claimRaceUnlockOffer(state: GameState, raceId: RaceId): GameState {
  const offer = state.activeRaceUnlockOffer;
  if (state.phase !== 'race_unlock' || !offer || !offer.optionRaceIds.includes(raceId)) {
    return state;
  }

  let nextState: GameState = {
    ...state,
    unlockedRaceIds: state.unlockedRaceIds.includes(raceId) ? state.unlockedRaceIds : [...state.unlockedRaceIds, raceId],
    activeRaceUnlockOffer: null,
  };
  (offer.upgradeIdsByRaceId[raceId] ?? []).forEach((upgradeId) => {
    nextState = addUpgradeUnlock(nextState, upgradeId);
  });
  (offer.troopUnlockIdsByRaceId?.[raceId] ?? []).forEach((troopUnlockId) => {
    nextState = addTroopToRoster(grantTroopUnlock(nextState, troopUnlockId), troopUnlockId);
  });

  return { ...nextState, phase: 'planning', activeTroopClassUnlockOffer: null };
}

export function claimTroopClassUnlockOffer(state: GameState, troopUnlockId: TroopUnlockId): GameState {
  const offer = state.activeTroopClassUnlockOffer;
  if (state.phase !== 'troop_class_unlock' || !offer || !offer.optionTroopUnlockIds.includes(troopUnlockId)) {
    return state;
  }

  const [raceId] = splitTroopUnlockId(troopUnlockId);
  if (raceId !== offer.raceId) {
    return state;
  }

  const nextState = addTroopToRoster(grantTroopUnlock(state, troopUnlockId), troopUnlockId);
  const nextRemainingChoices = offer.remainingChoices - 1;
  const nextOffer = buildTroopClassUnlockOffer(
    {
      ...nextState,
      activeTroopClassUnlockOffer: null,
    },
    offer.cycleNumber,
    offer.raceId,
    nextRemainingChoices,
  );

  return nextOffer
    ? { ...nextState, activeTroopClassUnlockOffer: nextOffer }
    : { ...nextState, phase: 'planning', activeTroopClassUnlockOffer: null };
}

export function revealTroopOffer(state: GameState): GameState {
  if (state.phase !== 'planning' || state.essence < 1 || state.activeTroopOffer || state.activeUpgradeOffer) {
    return state;
  }

  const offer = buildTroopOffer(state);
  if (!offer) {
    return state;
  }

  return {
    ...state,
    essence: state.essence - 1,
    activeTroopOffer: offer,
    troopOfferRolls: state.troopOfferRolls + 1,
    essenceDraftRerollUsed: null,
    seenTroopOfferOptionIds: offer.optionTroopUnlockIds,
    seenUpgradeOfferOptionIds: [],
  };
}

export function revealUpgradeOffer(state: GameState): GameState {
  if (state.phase !== 'planning' || state.essence < 1 || state.activeTroopOffer || state.activeUpgradeOffer) {
    return state;
  }

  const offer = buildUpgradeOffer(state);
  if (!offer) {
    return state;
  }

  return {
    ...state,
    essence: state.essence - 1,
    activeUpgradeOffer: offer,
    upgradeOfferRolls: state.upgradeOfferRolls + 1,
    essenceDraftRerollUsed: null,
    seenTroopOfferOptionIds: [],
    seenUpgradeOfferOptionIds: offer.optionUpgradeIds,
  };
}

export function revealEssenceDraft(state: GameState): GameState {
  const cost = getEssenceDraftCost(state);
  if (cost === null || state.essence < cost) {
    return state;
  }

  const troopOffer = buildTroopOffer(state);
  const upgradeOffer = buildUpgradeOffer(state);
  if (!troopOffer && !upgradeOffer) {
    return state;
  }

  return {
    ...state,
    essence: state.essence - cost,
    activeTroopOffer: troopOffer,
    activeUpgradeOffer: upgradeOffer,
    troopOfferRolls: troopOffer ? state.troopOfferRolls + 1 : state.troopOfferRolls,
    upgradeOfferRolls: upgradeOffer ? state.upgradeOfferRolls + 1 : state.upgradeOfferRolls,
    essenceDraftRerollUsed: null,
    seenTroopOfferOptionIds: troopOffer?.optionTroopUnlockIds ?? [],
    seenUpgradeOfferOptionIds: upgradeOffer?.optionUpgradeIds ?? [],
  };
}

export function rerollEssenceDraftSide(state: GameState, side: EssenceDraftRerollSide): GameState {
  if (state.phase !== 'planning' || state.essenceDraftRerollUsed) {
    return state;
  }

  if (side === 'troop') {
    if (!state.activeTroopOffer) {
      return state;
    }
    const nextRollState = { ...state, troopOfferRolls: state.troopOfferRolls + 1 };
    const offer = buildTroopOffer(nextRollState, state.seenTroopOfferOptionIds);
    if (!offer) {
      return state;
    }
    return {
      ...nextRollState,
      activeTroopOffer: offer,
      essenceDraftRerollUsed: 'troop',
      seenTroopOfferOptionIds: [...new Set([...state.seenTroopOfferOptionIds, ...offer.optionTroopUnlockIds])],
    };
  }

  if (!state.activeUpgradeOffer) {
    return state;
  }
  const nextRollState = { ...state, upgradeOfferRolls: state.upgradeOfferRolls + 1 };
  const offer = buildUpgradeOffer(nextRollState, state.seenUpgradeOfferOptionIds);
  if (!offer) {
    return state;
  }
  return {
    ...nextRollState,
    activeUpgradeOffer: offer,
    essenceDraftRerollUsed: 'upgrade',
    seenUpgradeOfferOptionIds: [...new Set([...state.seenUpgradeOfferOptionIds, ...offer.optionUpgradeIds])],
  };
}

export function rerollTroopOffer(state: GameState): GameState {
  return rerollEssenceDraftSide(state, 'troop');
}

export function rerollUpgradeOffer(state: GameState): GameState {
  return rerollEssenceDraftSide(state, 'upgrade');
}

function clearEssenceDraftTrackingIfComplete(state: GameState): GameState {
  return state.activeTroopOffer || state.activeUpgradeOffer
    ? state
    : {
        ...state,
        essenceDraftRerollUsed: null,
        seenTroopOfferOptionIds: [],
        seenUpgradeOfferOptionIds: [],
      };
}

export function claimTroopOffer(state: GameState, troopUnlockId: TroopUnlockId): GameState {
  if (
    !state.activeTroopOffer ||
    !state.activeTroopOffer.optionTroopUnlockIds.includes(troopUnlockId) ||
    !getAvailableTroopUnlockIds(state).includes(troopUnlockId) ||
    !rosterCanFitOpenRifts(state, troopUnlockId)
  ) {
    return state;
  }

  const unlocked = addTroopToRoster(grantTroopUnlock(state, troopUnlockId), troopUnlockId);
  return clearEssenceDraftTrackingIfComplete({
    ...unlocked,
    activeTroopOffer: null,
  });
}

export function claimUpgradeOffer(state: GameState, upgradeId: UpgradeId): GameState {
  if (!state.activeUpgradeOffer || !state.activeUpgradeOffer.optionUpgradeIds.includes(upgradeId)) {
    return state;
  }

  const unlocked = addUpgradeUnlock(state, upgradeId);
  return clearEssenceDraftTrackingIfComplete({
    ...unlocked,
    activeUpgradeOffer: null,
  });
}

export function validateAssignments(state: GameState): ValidationResult {
  const issues: ValidationIssue[] = [];
  const occupiedHumanTroopIds = new Set(
    state.gameMode === 'contest'
      ? state.openRifts.filter((rift) => rift.controller === 'playerOne').flatMap((rift) => rift.occupyingTroopIds ?? [])
      : [],
  );
  const assignedTroops = state.troops.filter((troop) => troop.assignmentRiftId !== null && !occupiedHumanTroopIds.has(troop.id));
  const readyTroops = state.troops.filter((troop) => troop.recoveryCyclesRemaining === 0 && troop.assignmentRiftId === null);

  if (assignedTroops.length === 0 && readyTroops.length > 0 && occupiedHumanTroopIds.size === 0) {
    issues.push({
      kind: 'no_troops_assigned',
      message: 'Assign every available troop before ending the cycle.',
    });
  } else if (readyTroops.length > 0) {
    issues.push({
      kind: 'idle_troops_remaining',
      message: `${readyTroops.length} available ${readyTroops.length === 1 ? 'troop is' : 'troops are'} still idle. Assign every available troop before ending the cycle.`,
    });
  }

  const seenTroops = new Set<string>();
  assignedTroops.forEach((troop) => {
    if (seenTroops.has(troop.id)) {
      issues.push({ kind: 'duplicate_assignment', troopId: troop.id, message: 'A troop cannot be assigned twice.' });
    }
    seenTroops.add(troop.id);

    if (troop.recoveryCyclesRemaining > 0) {
      issues.push({
        kind: 'troop_recovering',
        troopId: troop.id,
        message: `${getRace(troop.raceId).singularLabel} ${troop.unitClassId} is still recovering.`,
      });
    }
  });

  state.openRifts
    .filter((rift) => rift.state === 'discovered')
    .forEach((rift) => {
      const troops = getTroopsAssignedToRift(state, rift.id);
      const grouped = new Map<RaceId, number>();
      const groupedUnitClasses = new Map<UnitClassId, number>();
      troops.forEach((troop) => grouped.set(troop.raceId, (grouped.get(troop.raceId) ?? 0) + 1));
      troops.forEach((troop) => groupedUnitClasses.set(troop.unitClassId, (groupedUnitClasses.get(troop.unitClassId) ?? 0) + 1));
      grouped.forEach((count, raceId) => {
        if (count > 1 && !isRaceUnited(state, raceId)) {
          const conflictingTroops = troops.filter((troop) => troop.raceId === raceId);
          issues.push({
            kind: 'same_race_conflict',
            riftId: rift.id,
            troopId: conflictingTroops[0]?.id,
            conflictTroopId: conflictingTroops[1]?.id,
            message: `${getRace(raceId).label} cannot send multiple troops into the same Rift yet.`,
          });
        }
      });
      groupedUnitClasses.forEach((count, unitClassId) => {
        if (count > 1 && !isUnitClassUnited(state, unitClassId)) {
          const conflictingTroops = troops.filter((troop) => troop.unitClassId === unitClassId);
          issues.push({
            kind: 'same_class_conflict',
            riftId: rift.id,
            troopId: conflictingTroops[0]?.id,
            conflictTroopId: conflictingTroops[1]?.id,
            message: `Only one ${getUnitClass(unitClassId).label} troop can enter the same Rift.`,
          });
        }
      });
    });

  return { ok: issues.length === 0, issues };
}

function getAssignmentIssue(state: GameState, troopId: TroopId, riftId: string): ValidationIssue | null {
  if (state.phase !== 'planning') {
    return { kind: 'invalid_phase', message: 'Troops can only be assigned during planning.' };
  }

  const troop = state.troops.find((entry) => entry.id === troopId);
  if (!troop) {
    return { kind: 'unknown_troop', troopId, message: `Unknown troop instance ${troopId}.` };
  }

  if (troop.recoveryCyclesRemaining > 0) {
    return {
      kind: 'troop_recovering',
      troopId,
      message: `${getRace(troop.raceId).singularLabel} ${troop.unitClassId} is still recovering.`,
    };
  }

  const heldRift = state.gameMode === 'contest'
    ? state.openRifts.find((rift) => rift.controller === 'playerOne' && (rift.occupyingTroopIds ?? []).includes(troop.id))
    : null;
  if (heldRift) {
    return {
      kind: 'holding_troop_locked',
      troopId,
      riftId: heldRift.id,
      message: `${getRace(troop.raceId).singularLabel} ${getUnitClass(troop.unitClassId).label} is holding ${formatRiftLabel(heldRift.id)} and cannot be reassigned.`,
    };
  }

  const rift = state.openRifts.find((entry) => entry.id === riftId);
  if (!rift || rift.state !== 'discovered') {
    return { kind: 'unknown_rift', riftId, message: `Rift ${riftId} is not available for assignment.` };
  }

  if (state.gameMode === 'contest' && rift.controller === 'playerOne') {
    return { kind: 'own_rift', riftId, message: 'You already control this Rift.' };
  }

  const sameRaceTroop = getTroopsAssignedToRift(state, riftId).find(
    (assignedTroop) => assignedTroop.id !== troopId && assignedTroop.raceId === troop.raceId,
  );
  if (sameRaceTroop && !isRaceUnited(state, troop.raceId)) {
    return {
      kind: 'same_race_conflict',
      troopId,
      conflictTroopId: sameRaceTroop.id,
      riftId,
      message: `${getRace(troop.raceId).label} cannot send multiple troops into the same Rift yet.`,
    };
  }

  const sameTypeTroop = getTroopsAssignedToRift(state, riftId).find(
    (assignedTroop) => assignedTroop.id !== troopId && assignedTroop.unitClassId === troop.unitClassId,
  );
  if (sameTypeTroop && !isUnitClassUnited(state, troop.unitClassId)) {
    return {
      kind: 'same_class_conflict',
      troopId,
      conflictTroopId: sameTypeTroop.id,
      riftId,
      message: `Only one ${getUnitClass(troop.unitClassId).label} troop can enter the same Rift.`,
    };
  }

  return null;
}

export function canAssignTroopToRift(state: GameState, troopId: TroopId, riftId: string): ValidationResult {
  const issue = getAssignmentIssue(state, troopId, riftId);
  return issue ? { ok: false, issues: [issue] } : { ok: true, issues: [] };
}

export function assignTroopToRift(state: GameState, troopId: TroopId, riftId: string): GameState {
  const troop = state.troops.find((entry) => entry.id === troopId);
  if (!troop) {
    return state;
  }

  if (troop.assignmentRiftId === riftId) {
    return clearTroopAssignment(state, troopId);
  }

  if (!canAssignTroopToRift(state, troopId, riftId).ok) {
    return state;
  }

  return {
    ...state,
    troops: state.troops.map((troop) =>
      troop.id === troopId ? { ...troop, assignmentRiftId: riftId } : troop,
    ),
  };
}

export function clearTroopAssignment(state: GameState, troopId: TroopId): GameState {
  if (state.phase !== 'planning' || !state.troops.some((troop) => troop.id === troopId)) {
    return state;
  }

  if (
    state.gameMode === 'contest' &&
    state.openRifts.some((rift) => rift.controller === 'playerOne' && (rift.occupyingTroopIds ?? []).includes(troopId))
  ) {
    return state;
  }

  return {
    ...state,
    troops: state.troops.map((troop) => (troop.id === troopId ? { ...troop, assignmentRiftId: null } : troop)),
  };
}

function buildProgressPseudoState(state: GameState, progress: ContestPlayerState): GameState {
  return {
    ...state,
    gameMode: 'campaign',
    victoryPoints: progress.victoryPoints,
    essence: progress.essence,
    unlockedRaceIds: progress.unlockedRaceIds,
    unlockedTroopUnlockIds: progress.unlockedTroopUnlockIds,
    recentTroopUnlockIds: progress.recentTroopUnlockIds,
    troops: progress.troops,
    raceUpgradeIds: progress.raceUpgradeIds,
    troopClassUpgradeIds: progress.troopClassUpgradeIds,
    activeTroopOffer: progress.activeTroopOffer,
    activeUpgradeOffer: progress.activeUpgradeOffer,
    activeRaceUnlockOffer: progress.activeRaceUnlockOffer,
    activeTroopClassUnlockOffer: progress.activeTroopClassUnlockOffer,
    troopOfferRolls: progress.troopOfferRolls,
    upgradeOfferRolls: progress.upgradeOfferRolls,
    essenceDraftRerollUsed: progress.essenceDraftRerollUsed,
    seenTroopOfferOptionIds: progress.seenTroopOfferOptionIds,
    seenUpgradeOfferOptionIds: progress.seenUpgradeOfferOptionIds,
    openRifts: state.openRifts,
    replayIndex: [],
    contest: undefined,
  };
}

function progressFromPseudoState(state: GameState): ContestPlayerState {
  return {
    victoryPoints: state.victoryPoints,
    essence: state.essence,
    unlockedRaceIds: state.unlockedRaceIds,
    unlockedTroopUnlockIds: state.unlockedTroopUnlockIds,
    recentTroopUnlockIds: state.recentTroopUnlockIds,
    troops: state.troops,
    raceUpgradeIds: state.raceUpgradeIds,
    troopClassUpgradeIds: state.troopClassUpgradeIds,
    activeTroopOffer: state.activeTroopOffer,
    activeUpgradeOffer: state.activeUpgradeOffer,
    activeRaceUnlockOffer: state.activeRaceUnlockOffer,
    activeTroopClassUnlockOffer: state.activeTroopClassUnlockOffer,
    troopOfferRolls: state.troopOfferRolls,
    upgradeOfferRolls: state.upgradeOfferRolls,
    essenceDraftRerollUsed: state.essenceDraftRerollUsed,
    seenTroopOfferOptionIds: state.seenTroopOfferOptionIds,
    seenUpgradeOfferOptionIds: state.seenUpgradeOfferOptionIds,
  };
}

function randomlyAdvanceAiUnlocks(state: GameState): GameState {
  if (state.gameMode !== 'contest') {
    return state;
  }

  const rng = createRng(deriveSeed(state.campaignSeed, state.cycleNumber * 44_441 + 19));
  let pseudo = applyScheduledCycleUnlock(buildProgressPseudoState(state, getContestPlayerTwo(state)));

  if (pseudo.activeRaceUnlockOffer) {
    const pickedRace = rng.pick(pseudo.activeRaceUnlockOffer.optionRaceIds);
    pseudo = claimRaceUnlockOffer(pseudo, pickedRace);
  }

  while (pseudo.activeTroopClassUnlockOffer) {
    const pickedTroop = rng.pick(pseudo.activeTroopClassUnlockOffer.optionTroopUnlockIds);
    pseudo = claimTroopClassUnlockOffer(pseudo, pickedTroop);
  }

  let guard = 0;
  while (guard < 8) {
    guard += 1;
    const cost = getEssenceDraftCost(pseudo);
    if (cost === null || pseudo.essence < cost) {
      break;
    }
    const offered = revealEssenceDraft(pseudo);
    if (offered === pseudo) {
      break;
    }
    pseudo = offered;
    if (pseudo.activeTroopOffer) {
      pseudo = claimTroopOffer(pseudo, rng.pick(pseudo.activeTroopOffer.optionTroopUnlockIds));
    }
    if (pseudo.activeUpgradeOffer) {
      pseudo = claimUpgradeOffer(pseudo, rng.pick(pseudo.activeUpgradeOffer.optionUpgradeIds));
    }
  }

  return withContestPlayers(state, { playerTwo: progressFromPseudoState(pseudo) });
}

export function extractContestPlayerProgress(state: GameState): ContestPlayerState {
  return progressFromPseudoState(state);
}

export function applyContestPlayerProgress(state: GameState, playerId: ContestPlayerId, progress: ContestPlayerState): GameState {
  if (playerId === 'playerOne') {
    return withContestPlayers(state, { playerOne: progress });
  }

  return withContestPlayers(state, { playerTwo: progress });
}

export function getContestPlayerProgress(state: GameState, playerId: ContestPlayerId): ContestPlayerState {
  return playerId === 'playerOne' ? extractContestPlayerProgress(state) : getContestPlayerTwo(state);
}

export function applyScheduledUnlockToContestProgress(state: GameState, progress: ContestPlayerState): ContestPlayerState {
  return progressFromPseudoState(applyScheduledCycleUnlock(buildProgressPseudoState(state, progress)));
}

function getContestCombatantsForTroops(
  state: GameState,
  playerId: ContestPlayerId,
  troops: typeof state.troops,
  side: 'player' | 'enemy',
) {
  const progress = contestPlayerState(state, playerId);
  return troops.map((troop) =>
    resolveTroopCombatant(progress, troop, side, null, `${playerId}-${troop.id}`),
  );
}

function getContestRiftDefenderCombatants(state: GameState, rift: RiftInstance) {
  if (rift.controller === 'neutral' || !rift.occupyingPlayerId) {
    return {
      defenderId: 'neutral' as const,
      raceUpgradeIds: [] as UpgradeId[],
      troopClassUpgradeIds: [] as UpgradeId[],
      combatants: rift.enemyArmy,
    };
  }

  const defenderId = rift.occupyingPlayerId;
  const defenderProgress = contestPlayerState(state, defenderId);
  const occupyingIds = new Set(rift.occupyingTroopIds ?? []);
  const troops = defenderProgress.troops.filter((troop) => occupyingIds.has(troop.id));
  return {
    defenderId,
    raceUpgradeIds: defenderProgress.raceUpgradeIds,
    troopClassUpgradeIds: defenderProgress.troopClassUpgradeIds,
    combatants: getContestCombatantsForTroops(state, defenderId, troops, 'enemy'),
  };
}

function resolveContestBattle(
  state: GameState,
  rift: RiftInstance,
  attackerId: ContestPlayerId,
  attackingTroops: typeof state.troops,
  salt: number,
): RiftResolutionRecord {
  const attackerProgress = contestPlayerState(state, attackerId);
  const defender = getContestRiftDefenderCombatants(state, rift);
  const assignedTroopIds = attackingTroops.map((troop) => troop.id).sort((a, b) => a.localeCompare(b));
  const battleSeed = deriveSeed(
    rift.seed,
    salt + assignedTroopIds.join('|').split('').reduce((sum, char) => sum + char.charCodeAt(0), 0),
  );
  const battleInput = withBattleSideParticipants(buildBattleInputFromResolvedCombatants(
    battleSeed,
    rift.id,
    rift.tier,
    rift.mutatorIds,
    attackerProgress.raceUpgradeIds,
    attackerProgress.troopClassUpgradeIds,
    defender.raceUpgradeIds,
    defender.troopClassUpgradeIds,
    getContestCombatantsForTroops(state, attackerId, attackingTroops, 'player'),
    defender.combatants,
  ), {
    player: {
      kind: attackerId === 'playerOne' ? 'player' : 'opponent',
      label: attackerId === 'playerOne' ? 'Player' : 'Rival',
      playerId: attackerId,
    },
    enemy:
      defender.defenderId === 'neutral'
        ? { kind: 'neutral', label: 'Neutral Guardians' }
        : {
            kind: defender.defenderId === 'playerOne' ? 'player' : 'opponent',
            label: defender.defenderId === 'playerOne' ? 'Player' : 'Rival',
            playerId: defender.defenderId,
          },
  });
  const replay = resolveBattle(battleInput);
  const attackerWon = replay.outcome === 'victory';

  return {
    riftId: rift.id,
    assignedTroopIds,
    battleInput,
    replay,
    outcome: attackerWon ? 'victory' : 'defeat',
    victoryPoints: rift.victoryPoints,
    recoveryMap: Object.fromEntries(attackingTroops.map((troop) => [troop.id, fixed(BATTLE_RECOVERY)])),
    contest: {
      kind: defender.defenderId === 'neutral' ? 'guardian' : 'occupation',
      attackerId,
      defenderId: defender.defenderId,
      winnerId: attackerWon ? attackerId : defender.defenderId === 'neutral' ? null : defender.defenderId,
    },
  };
}

function resolveContestPvpBattle(
  state: GameState,
  rift: RiftInstance,
  humanTroops: typeof state.troops,
  aiTroops: typeof state.troops,
  salt: number,
): RiftResolutionRecord {
  const assignedTroopIds = [...humanTroops, ...aiTroops].map((troop) => troop.id).sort((a, b) => a.localeCompare(b));
  const battleSeed = deriveSeed(rift.seed, salt + assignedTroopIds.join('|').split('').reduce((sum, char) => sum + char.charCodeAt(0), 0));
  const human = contestPlayerState(state, 'playerOne');
  const ai = contestPlayerState(state, 'playerTwo');
  const battleInput = withBattleSideParticipants(buildBattleInputFromResolvedCombatants(
    battleSeed,
    rift.id,
    rift.tier,
    rift.mutatorIds,
    human.raceUpgradeIds,
    human.troopClassUpgradeIds,
    ai.raceUpgradeIds,
    ai.troopClassUpgradeIds,
    getContestCombatantsForTroops(state, 'playerOne', humanTroops, 'player'),
    getContestCombatantsForTroops(state, 'playerTwo', aiTroops, 'enemy'),
  ), {
    player: { kind: 'player', label: 'Player', playerId: 'playerOne' },
    enemy: { kind: 'opponent', label: 'Rival', playerId: 'playerTwo' },
  });
  const replay = resolveBattle(battleInput);
  return {
    riftId: rift.id,
    assignedTroopIds,
    battleInput,
    replay,
    outcome: replay.outcome,
    victoryPoints: rift.victoryPoints,
    recoveryMap: Object.fromEntries(assignedTroopIds.map((troopId) => [troopId, fixed(BATTLE_RECOVERY)])),
    contest: {
      kind: 'pvp',
      defenderId: 'neutral',
      winnerId: replay.outcome === 'victory' ? 'playerOne' : replay.outcome === 'defeat' ? 'playerTwo' : null,
    },
  };
}

function isValidAiTroopGroupAddition(state: GameState, target: typeof state.troops, troop: (typeof state.troops)[number]): boolean {
  if (target.some((entry) => entry.id === troop.id || (entry.unitClassId === troop.unitClassId && !isUnitClassUnited(contestPlayerState(state, 'playerTwo'), troop.unitClassId)))) {
    return false;
  }
  if (target.some((entry) => entry.raceId === troop.raceId) && !isRaceUnited(contestPlayerState(state, 'playerTwo'), troop.raceId)) {
    return false;
  }
  return true;
}

function getAiRiftValue(rift: RiftInstance): number {
  const controllerMultiplier = rift.controller === 'playerOne' ? 2 : rift.controller === 'neutral' || !rift.controller ? 1 : 0;
  return rift.victoryPoints * 100 * controllerMultiplier;
}

function sortAiRiftsForDeployment(rifts: RiftInstance[]): RiftInstance[] {
  return [...rifts].sort((left, right) => {
    const valueDelta = getAiRiftValue(right) - getAiRiftValue(left);
    if (valueDelta !== 0) {
      return valueDelta;
    }
    return left.id.localeCompare(right.id);
  });
}

function scoreResolvedCombatantPower(combatant: ResolvedCombatantDefinition): number {
  const offensePower = combatant.quantity * combatant.stats.health * combatant.stats.damage;
  const durabilityPower = combatant.quantity * combatant.stats.health * (1 + combatant.stats.armor / 10);
  const tempoPower = combatant.quantity * combatant.stats.rate * 8;
  const reachPower = combatant.stats.range * combatant.quantity * 20;
  const capacityPower = combatant.stats.capacity * combatant.quantity * 12;
  return offensePower + durabilityPower + tempoPower + reachPower + capacityPower;
}

function scoreAiTroopForDeployment(state: GameState, troop: (typeof state.troops)[number]): number {
  return scoreResolvedCombatantPower(resolveTroopCombatant(contestPlayerState(state, 'playerTwo'), troop, 'player'));
}

function scoreAiCombatantGroupPower(combatants: ResolvedCombatantDefinition[]): number {
  return combatants.reduce((sum, combatant) => sum + scoreResolvedCombatantPower(combatant), 0);
}

function scoreAiRoleMix(combatants: ResolvedCombatantDefinition[]): number {
  const hasFrontline = combatants.some((combatant) => combatant.role === 'frontline');
  const hasBackline = combatants.some((combatant) => combatant.role === 'backline');
  const hasPusher = combatants.some((combatant) => combatant.role === 'pusher');
  const hasSupport = combatants.some((combatant) => combatant.attributes.includes('support') || combatant.attributes.includes('healer'));
  const onlyBacklinePenalty = hasBackline && !hasFrontline && !hasPusher ? -35 : 0;
  return (hasFrontline ? 30 : -25) + (hasBackline ? 15 : 0) + (hasSupport ? 10 : 0) + (hasPusher ? 8 : 0) + onlyBacklinePenalty;
}

type StateTroopArray = GameState['troops'];

function compareDeterministicTroopGroups(left: StateTroopArray, right: StateTroopArray): number {
  return left.map((troop) => troop.id).sort().join('|').localeCompare(right.map((troop) => troop.id).sort().join('|'));
}

interface AiCandidateGroup {
  troops: StateTroopArray;
  groupPower: number;
  roleMixScore: number;
  estimatedWinMargin: number;
  commitmentCost: number;
  candidateScore: number;
}

interface AiWinningGroup extends AiCandidateGroup {
  winningGroupScore: number;
}

function compareAiCandidateGroups(left: AiCandidateGroup, right: AiCandidateGroup): number {
  return (
    right.candidateScore - left.candidateScore ||
    left.groupPower - right.groupPower ||
    left.troops.length - right.troops.length ||
    compareDeterministicTroopGroups(left.troops, right.troops)
  );
}

function compareAiWinningGroups(left: AiWinningGroup, right: AiWinningGroup): number {
  return (
    right.winningGroupScore - left.winningGroupScore ||
    left.groupPower - right.groupPower ||
    left.troops.length - right.troops.length ||
    compareDeterministicTroopGroups(left.troops, right.troops)
  );
}

function buildAiCandidateGroupsForRift(
  state: GameState,
  rift: RiftInstance,
  readyTroops: StateTroopArray,
  options: ContestAiPlannerOptions,
): AiCandidateGroup[] {
  const defenderPower = scoreAiCombatantGroupPower(getContestRiftDefenderCombatants(state, rift).combatants);
  const candidates: AiCandidateGroup[] = [];
  const visit = (startIndex: number, group: typeof state.troops): void => {
    if (group.length > 0) {
      const combatants = getContestCombatantsForTroops(state, 'playerTwo', group, 'player');
      const groupPower = scoreAiCombatantGroupPower(combatants);
      const roleMixScore = scoreAiRoleMix(combatants);
      const estimatedWinMargin = ((groupPower + roleMixScore - defenderPower) / Math.max(defenderPower, 1)) * 100;
      if (estimatedWinMargin >= AI_MIN_ESTIMATED_WIN_MARGIN) {
        const commitmentCost = groupPower / 25;
        candidates.push({
          troops: [...group],
          groupPower,
          roleMixScore,
          estimatedWinMargin,
          commitmentCost,
          candidateScore: estimatedWinMargin - commitmentCost,
        });
      }
    }
    for (let index = startIndex; index < readyTroops.length; index += 1) {
      const troop = readyTroops[index]!;
      if (!isValidAiTroopGroupAddition(state, group, troop)) {
        continue;
      }
      group.push(troop);
      visit(index + 1, group);
      group.pop();
    }
  };

  visit(0, []);
  return candidates.sort(compareAiCandidateGroups).slice(0, options.maxCandidateGroupsPerRift);
}

function buildAiWinningGroupsForRift(
  state: GameState,
  rift: RiftInstance,
  readyTroops: StateTroopArray,
  options: ContestAiPlannerOptions,
): AiWinningGroup[] {
  const riftValue = getAiRiftValue(rift);
  const battleCache = new Map<string, boolean>();
  const winningGroups: AiWinningGroup[] = [];

  for (const candidate of buildAiCandidateGroupsForRift(state, rift, readyTroops, options).slice(0, options.maxBattleSimulationsPerRift)) {
    const key = `${rift.id}:${rift.controller}:${(rift.occupyingTroopIds ?? []).join(',')}:${candidate.troops.map((troop) => troop.id).sort().join(',')}`;
    let won = battleCache.get(key);
    if (won === undefined) {
      won = resolveContestBattle(state, rift, 'playerTwo', candidate.troops, 91_003).outcome === 'victory';
      battleCache.set(key, won);
    }
    if (!won) {
      continue;
    }
    const overkillPenalty = candidate.estimatedWinMargin > 75 ? (candidate.estimatedWinMargin - 75) * 0.5 : 0;
    winningGroups.push({
      ...candidate,
      winningGroupScore: riftValue * 10 - candidate.commitmentCost - overkillPenalty,
    });
  }

  return winningGroups.sort(compareAiWinningGroups).slice(0, options.maxConfirmedWinningGroupsPerRift);
}

function firstWinningAiAllocation(state: GameState, options: ContestAiPlannerOptions): Map<string, TroopId[]> {
  const availableRifts = sortAiRiftsForDeployment(state.openRifts.filter((rift) => rift.state === 'discovered' && getAiRiftValue(rift) > 0));
  const readyTroops = [...getContestReadyTroops(state, 'playerTwo')].sort(
    (left, right) => scoreAiTroopForDeployment(state, right) - scoreAiTroopForDeployment(state, left) || left.id.localeCompare(right.id),
  );
  const empty = new Map<string, TroopId[]>();
  if (availableRifts.length === 0 || readyTroops.length === 0) {
    return empty;
  }

  const winningGroupsByRift = availableRifts.map((rift) => ({
    rift,
    groups: buildAiWinningGroupsForRift(state, rift, readyTroops, options),
  }));

  interface AllocationChoice {
    rift: RiftInstance;
    group: AiWinningGroup;
  }

  interface AllocationScore {
    choices: AllocationChoice[];
    score: number;
    humanHeldCount: number;
    victoryPoints: number;
    committedPower: number;
    key: string;
  }

  let best: AllocationScore | null = null;
  const selected: AllocationChoice[] = [];
  const usedTroopIds = new Set<TroopId>();

  const scoreSelected = (): AllocationScore => {
    const riftValueSum = selected.reduce((sum, choice) => sum + getAiRiftValue(choice.rift), 0);
    const totalCommittedPower = selected.reduce((sum, choice) => sum + choice.group.groupPower, 0);
    const totalTroopCount = selected.reduce((sum, choice) => sum + choice.group.troops.length, 0);
    const humanHeldCount = selected.filter((choice) => choice.rift.controller === 'playerOne').length;
    const victoryPoints = selected.reduce((sum, choice) => sum + choice.rift.victoryPoints, 0);
    const key = selected
      .map((choice) => `${choice.rift.id}:${choice.group.troops.map((troop) => troop.id).sort().join(',')}`)
      .sort()
      .join('|');
    return {
      choices: [...selected],
      score: riftValueSum * 100 - totalCommittedPower / 10 - totalTroopCount * 5,
      humanHeldCount,
      victoryPoints,
      committedPower: totalCommittedPower,
      key,
    };
  };

  const isBetterAllocation = (left: AllocationScore, right: AllocationScore | null): boolean => {
    if (!right) {
      return true;
    }
    return (
      left.score > right.score ||
      (left.score === right.score &&
        (left.humanHeldCount > right.humanHeldCount ||
          (left.humanHeldCount === right.humanHeldCount &&
            (left.victoryPoints > right.victoryPoints ||
              (left.victoryPoints === right.victoryPoints &&
                (left.committedPower < right.committedPower ||
                  (left.committedPower === right.committedPower && left.key.localeCompare(right.key) < 0)))))))
    );
  };

  const visit = (riftIndex: number): void => {
    if (riftIndex >= winningGroupsByRift.length) {
      if (selected.length === 0) {
        return;
      }
      const score = scoreSelected();
      if (isBetterAllocation(score, best)) {
        best = score;
      }
      return;
    }

    visit(riftIndex + 1);

    const entry = winningGroupsByRift[riftIndex]!;
    for (const group of entry.groups) {
      if (group.troops.some((troop) => usedTroopIds.has(troop.id))) {
        continue;
      }
      group.troops.forEach((troop) => usedTroopIds.add(troop.id));
      selected.push({ rift: entry.rift, group });
      visit(riftIndex + 1);
      selected.pop();
      group.troops.forEach((troop) => usedTroopIds.delete(troop.id));
    }
  };

  visit(0);

  return best
    ? new Map(best.choices.map((choice) => [choice.rift.id, choice.group.troops.map((troop) => troop.id)]))
    : empty;
}

function fallbackAiAllocationByLowestTier(state: GameState): Map<string, TroopId[]> {
  const availableRifts = state.openRifts
    .filter((rift) => rift.state === 'discovered' && getAiRiftValue(rift) > 0)
    .sort((left, right) => left.tier - right.tier || left.id.localeCompare(right.id));
  const readyTroops = [...getContestReadyTroops(state, 'playerTwo')].sort((left, right) => left.id.localeCompare(right.id));
  const allocation = new Map<string, TroopId[]>();
  const unusedTroops = [...readyTroops];

  for (const rift of availableRifts) {
    const group: StateTroopArray = [];
    for (let index = 0; index < unusedTroops.length;) {
      const troop = unusedTroops[index]!;
      if (!isValidAiTroopGroupAddition(state, group, troop)) {
        index += 1;
        continue;
      }
      group.push(troop);
      unusedTroops.splice(index, 1);
    }
    if (group.length > 0) {
      allocation.set(rift.id, group.map((troop) => troop.id));
    }
    if (unusedTroops.length === 0) {
      break;
    }
  }

  return allocation;
}

function assignAiContestTroops(state: GameState, options: ContestAiPlannerOptions): GameState {
  const winningAllocation = firstWinningAiAllocation(state, options);
  const allocation = winningAllocation.size > 0 ? winningAllocation : fallbackAiAllocationByLowestTier(state);
  if (allocation.size === 0) {
    return state;
  }
  const ai = getContestPlayerTwo(state);
  const assignedTroopIds = new Map<TroopId, string>();
  allocation.forEach((troopIds, riftId) => {
    troopIds.forEach((troopId) => assignedTroopIds.set(troopId, riftId));
  });
  return withContestPlayers(state, {
    playerTwo: {
      ...ai,
      troops: ai.troops.map((troop) => (assignedTroopIds.has(troop.id) ? { ...troop, assignmentRiftId: assignedTroopIds.get(troop.id)! } : troop)),
    },
  });
}

function prepareContestCycle(state: GameState, options: ContestAiPlannerOptions = CONTEST_AI_WORKER_OPTIONS): GameState {
  return assignAiContestTroops(randomlyAdvanceAiUnlocks(state), options);
}

export function prepareContestAiForCycle(state: GameState, options: ContestAiPlannerOptions = CONTEST_AI_WORKER_OPTIONS): ContestPlayerState {
  return getContestPlayerTwo(prepareContestCycle(state, options));
}

function resolveContestAssignedRifts(state: GameState): CycleResolution {
  const records: RiftResolutionRecord[] = [];

  state.openRifts
    .filter((rift) => rift.state === 'discovered')
    .forEach((rift, index) => {
      const humanOccupants = new Set(rift.controller === 'playerOne' ? rift.occupyingTroopIds ?? [] : []);
      const aiOccupants = new Set(rift.controller === 'playerTwo' ? rift.occupyingTroopIds ?? [] : []);
      const humanTroops = state.troops.filter((troop) => troop.assignmentRiftId === rift.id && !humanOccupants.has(troop.id));
      const aiTroops = getContestPlayerTwo(state).troops.filter((troop) => troop.assignmentRiftId === rift.id && !aiOccupants.has(troop.id));

      if (humanTroops.length === 0 && aiTroops.length === 0) {
        return;
      }

      if (rift.controller === 'neutral' || !rift.controller) {
        const humanGuardianRecord =
          humanTroops.length > 0 ? resolveContestBattle(state, rift, 'playerOne', humanTroops, 10_000 + index * 101) : null;
        const aiGuardianRecord = aiTroops.length > 0 ? resolveContestBattle(state, rift, 'playerTwo', aiTroops, 20_000 + index * 101) : null;
        if (humanGuardianRecord) {
          records.push(humanGuardianRecord);
        }
        if (aiGuardianRecord) {
          records.push(aiGuardianRecord);
        }
        if (humanGuardianRecord?.outcome === 'victory' && aiGuardianRecord?.outcome === 'victory') {
          records.push(resolveContestPvpBattle(state, rift, humanTroops, aiTroops, 30_000 + index * 101));
        }
        return;
      }

      if (rift.controller === 'playerOne' && aiTroops.length > 0) {
        records.push(resolveContestBattle(state, rift, 'playerTwo', aiTroops, 40_000 + index * 101));
        return;
      }

      if (rift.controller === 'playerTwo' && humanTroops.length > 0) {
        records.push(resolveContestBattle(state, rift, 'playerOne', humanTroops, 50_000 + index * 101));
      }
    });

  return { records, preparedState: state };
}

function getGuardianUnlocksForRecord(state: GameState, record: RiftResolutionRecord): TroopUnlockId[] {
  const playerId = record.contest?.attackerId;
  if (!playerId || record.contest?.kind !== 'guardian' || record.outcome !== 'victory') {
    return [];
  }
  const progress = contestPlayerState(state, playerId);
  const guardianCombatants = record.battleInput.enemyCombatants;
  return guardianCombatants
    .map((combatant) => `${combatant.raceId}/${combatant.unitClassId}` as TroopUnlockId)
    .filter((troopUnlockId) => !isNativeTroopUnlockId(troopUnlockId))
    .filter((troopUnlockId) => !progress.unlockedTroopUnlockIds.includes(troopUnlockId))
    .filter((troopUnlockId) => !getOwnedTroopUnlockIds(progress).includes(troopUnlockId));
}

function applyContestUnlocksToProgress(progress: ContestPlayerState, unlockIds: TroopUnlockId[]): ContestPlayerState {
  let next = progress;
  unlockIds.forEach((troopUnlockId) => {
    next = grantTroopUnlock(next, troopUnlockId);
  });
  return { ...next, recentTroopUnlockIds: unlockIds };
}

function isContestRecordVisibleToHuman(record: RiftResolutionRecord): boolean {
  if (!record.contest) {
    return true;
  }
  return (
    record.contest.kind === 'guardian' ||
    record.contest.kind === 'pvp' ||
    record.contest.attackerId === 'playerOne' ||
    record.contest.defenderId === 'playerOne'
  );
}

function getContestEncounterLabel(record: RiftResolutionRecord): string {
  if (record.contest?.kind === 'guardian' && record.contest.attackerId === 'playerTwo') {
    return 'Rival vs Neutral Guardians';
  }
  return record.contest?.kind === 'guardian' ? 'Neutral Guardians' : 'Rival';
}

function getHumanVisibleContestOutcome(record: RiftResolutionRecord): ReplayIndexEntry['outcome'] {
  if (record.contest?.kind === 'guardian') {
    return record.outcome;
  }
  const winnerId = record.contest?.winnerId;
  if (winnerId === 'playerOne') {
    return 'victory';
  }
  if (winnerId === 'playerTwo') {
    return 'defeat';
  }
  return record.replay.outcome;
}

function clearContestTroopAssignments(progress: ContestPlayerState, occupiedByRift: Map<string, Set<TroopId>>): ContestPlayerState {
  return {
    ...progress,
    troops: tickRecovery(
      progress.troops.map((troop) => {
        if (!troop.assignmentRiftId) {
          return troop;
        }
        const remainsOccupied = occupiedByRift.get(troop.assignmentRiftId)?.has(troop.id) ?? false;
        return {
          ...troop,
          assignmentRiftId: remainsOccupied ? troop.assignmentRiftId : null,
          recoveryCyclesRemaining: remainsOccupied ? 0 : fixed(BATTLE_RECOVERY),
        };
      }),
    ),
    activeTroopOffer: null,
    activeUpgradeOffer: null,
    activeRaceUnlockOffer: null,
    activeTroopClassUnlockOffer: null,
    essenceDraftRerollUsed: null,
    seenTroopOfferOptionIds: [],
    seenUpgradeOfferOptionIds: [],
  };
}

function applyContestCycleOutcomes(state: GameState, resolution: CycleResolution): ApplyCycleOutcomeResult {
  const humanUnlocks = [
    ...new Set(resolution.records.filter((record) => record.contest?.attackerId === 'playerOne').flatMap((record) => getGuardianUnlocksForRecord(state, record))),
  ];
  const aiUnlocks = [
    ...new Set(resolution.records.filter((record) => record.contest?.attackerId === 'playerTwo').flatMap((record) => getGuardianUnlocksForRecord(state, record))),
  ];

  let nextHumanProgress: ContestPlayerState = applyContestUnlocksToProgress(
    {
      victoryPoints: state.victoryPoints,
      essence: state.essence,
      unlockedRaceIds: state.unlockedRaceIds,
      unlockedTroopUnlockIds: state.unlockedTroopUnlockIds,
      recentTroopUnlockIds: state.recentTroopUnlockIds,
      troops: state.troops,
      raceUpgradeIds: state.raceUpgradeIds,
      troopClassUpgradeIds: state.troopClassUpgradeIds,
      activeTroopOffer: state.activeTroopOffer,
      activeUpgradeOffer: state.activeUpgradeOffer,
      activeRaceUnlockOffer: state.activeRaceUnlockOffer,
      activeTroopClassUnlockOffer: state.activeTroopClassUnlockOffer,
      troopOfferRolls: state.troopOfferRolls,
      upgradeOfferRolls: state.upgradeOfferRolls,
      essenceDraftRerollUsed: state.essenceDraftRerollUsed,
      seenTroopOfferOptionIds: state.seenTroopOfferOptionIds,
      seenUpgradeOfferOptionIds: state.seenUpgradeOfferOptionIds,
    },
    humanUnlocks,
  );
  let nextAiProgress = applyContestUnlocksToProgress(getContestPlayerTwo(state), aiUnlocks);

  const nextRifts = state.openRifts.map((rift) => {
    if (rift.state !== 'discovered') {
      return rift;
    }
    const records = resolution.records.filter((record) => record.riftId === rift.id);
    if (records.length === 0) {
      return rift;
    }

    const pvp = records.find((record) => record.contest?.kind === 'pvp');
    if (pvp) {
      const winnerId = pvp.contest?.winnerId ?? null;
      const occupyingTroopIds =
        winnerId === 'playerOne'
          ? state.troops.filter((troop) => troop.assignmentRiftId === rift.id).map((troop) => troop.id)
          : winnerId === 'playerTwo'
            ? getContestPlayerTwo(state).troops.filter((troop) => troop.assignmentRiftId === rift.id).map((troop) => troop.id)
            : [];
      return {
        ...rift,
        controller: winnerId ?? 'neutral',
        occupyingPlayerId: winnerId,
        occupyingTroopIds,
      };
    }

    const occupation = records.find((record) => record.contest?.kind === 'occupation');
    if (occupation) {
      const winnerId = occupation.contest?.winnerId ?? null;
      if (winnerId === occupation.contest?.attackerId) {
        return {
          ...rift,
          controller: winnerId,
          occupyingPlayerId: winnerId,
          occupyingTroopIds: occupation.assignedTroopIds,
        };
      }
      return rift;
    }

    const guardianVictories = records.filter((record) => record.contest?.kind === 'guardian' && record.outcome === 'victory');
    if (guardianVictories.length === 1) {
      const winnerId = guardianVictories[0]!.contest?.attackerId ?? null;
      return {
        ...rift,
        controller: winnerId ?? 'neutral',
        occupyingPlayerId: winnerId,
        occupyingTroopIds: guardianVictories[0]!.assignedTroopIds,
      };
    }

    return rift;
  });

  const occupiedByHuman = new Map<string, Set<TroopId>>();
  const occupiedByAi = new Map<string, Set<TroopId>>();
  nextRifts.forEach((rift) => {
    if (rift.occupyingPlayerId === 'playerOne') {
      occupiedByHuman.set(rift.id, new Set(rift.occupyingTroopIds ?? []));
    }
    if (rift.occupyingPlayerId === 'playerTwo') {
      occupiedByAi.set(rift.id, new Set(rift.occupyingTroopIds ?? []));
    }
  });

  nextHumanProgress = clearContestTroopAssignments(nextHumanProgress, occupiedByHuman);
  nextAiProgress = clearContestTroopAssignments(nextAiProgress, occupiedByAi);

  nextRifts.forEach((rift) => {
    if (rift.state !== 'discovered') {
      return;
    }
    if (rift.controller === 'playerOne') {
      nextHumanProgress = { ...nextHumanProgress, victoryPoints: nextHumanProgress.victoryPoints + rift.tier };
    }
    if (rift.controller === 'playerTwo') {
      nextAiProgress = { ...nextAiProgress, victoryPoints: nextAiProgress.victoryPoints + rift.tier };
    }
  });

  const cycleNumber = state.cycleNumber + 1;
  let nextState: GameState = withContestPlayers(
    {
      ...state,
      cycleNumber,
      phase: state.cycleNumber === CONTEST_FINAL_CYCLE && !state.postgameDismissed ? 'game_over' : 'planning',
      victoryPoints: nextHumanProgress.victoryPoints,
      essence: nextHumanProgress.essence + 2,
      unlockedRaceIds: nextHumanProgress.unlockedRaceIds,
      unlockedTroopUnlockIds: nextHumanProgress.unlockedTroopUnlockIds,
      recentTroopUnlockIds: humanUnlocks,
      troops: nextHumanProgress.troops,
      raceUpgradeIds: nextHumanProgress.raceUpgradeIds,
      troopClassUpgradeIds: nextHumanProgress.troopClassUpgradeIds,
      activeTroopOffer: null,
      activeUpgradeOffer: null,
      activeRaceUnlockOffer: null,
      activeTroopClassUnlockOffer: null,
      essenceDraftRerollUsed: null,
      seenTroopOfferOptionIds: [],
      seenUpgradeOfferOptionIds: [],
      openRifts: [...nextRifts, ...generateContestCycleRifts({ ...state, cycleNumber })],
      replayIndex: [...state.replayIndex],
    },
    {
      playerOne: {
        ...nextHumanProgress,
        essence: nextHumanProgress.essence + 2,
        recentTroopUnlockIds: humanUnlocks,
        activeTroopOffer: null,
        activeUpgradeOffer: null,
        activeRaceUnlockOffer: null,
        activeTroopClassUnlockOffer: null,
        essenceDraftRerollUsed: null,
        seenTroopOfferOptionIds: [],
        seenUpgradeOfferOptionIds: [],
      },
      playerTwo: {
        ...nextAiProgress,
        essence: nextAiProgress.essence + 2,
        recentTroopUnlockIds: aiUnlocks,
        activeTroopOffer: null,
        activeUpgradeOffer: null,
        activeRaceUnlockOffer: null,
        activeTroopClassUnlockOffer: null,
        essenceDraftRerollUsed: null,
        seenTroopOfferOptionIds: [],
        seenUpgradeOfferOptionIds: [],
      },
    },
  );
  nextState = applyScheduledCycleUnlock(nextState);
  nextState = {
    ...nextState,
    contest: nextState.contest
      ? {
          ...nextState.contest,
          opponentInfo: {
            cycleNumber: state.cycleNumber,
            playerTwo: nextState.contest.players.playerTwo,
          },
        }
      : nextState.contest,
  };

  const visibleRecords = resolution.records.filter(isContestRecordVisibleToHuman);
  const writes = visibleRecords.map((record) => {
    const replay = buildStoredReplayPayload(record);
    return {
      replayId: record.replay.id,
      replay,
      estimatedBytes: JSON.stringify(replay).length,
    };
  });

  visibleRecords.forEach((record) => {
    const payload = writes.find((entry) => entry.replayId === record.replay.id);
    nextState.replayIndex = [
      buildReplayIndexEntry(
        state.cycleNumber,
        record.replay,
        payload?.estimatedBytes ?? 0,
        getContestEncounterLabel(record),
        record.battleInput.sideParticipants,
        formatRiftLabel(record.riftId),
        getHumanVisibleContestOutcome(record),
      ),
      ...nextState.replayIndex,
    ];
  });

  const deletes: { replayId: string }[] = [];
  const kept: ReplayIndexEntry[] = [];
  let totalBytes = 0;
  nextState.replayIndex.forEach((entry) => {
    if (kept.length >= 40 || totalBytes + entry.estimatedBytes > 4_000_000) {
      deletes.push({ replayId: entry.replayId });
      return;
    }
    kept.push(entry);
    totalBytes += entry.estimatedBytes;
  });
  nextState = { ...nextState, replayIndex: kept };

  return {
    nextState,
    replayPayloadWrites: writes,
    replayPayloadDeletes: deletes,
    newlyUnlockedTroopUnlockIds: humanUnlocks,
  };
}

export function resolveAssignedRifts(state: GameState, preparedContestAi?: ContestPlayerState): CycleResolution {
  if (state.gameMode === 'contest') {
    const preparedState = preparedContestAi ? withContestPlayers(state, { playerTwo: preparedContestAi }) : prepareContestCycle(state, CONTEST_AI_SYNC_FALLBACK_OPTIONS);
    return {
      ...resolveContestAssignedRifts(preparedState),
      preparedState,
    };
  }

  const records = state.openRifts
    .filter((rift) => rift.state === 'discovered')
    .flatMap((rift) => {
      const troops = getTroopsAssignedToRift(state, rift.id);
      if (troops.length === 0) {
        return [];
      }

      const assignedTroopIds = troops.map((troop) => troop.id).sort((a, b) => a.localeCompare(b));
      const battleSeed = deriveSeed(rift.seed, assignedTroopIds.join('|').split('').reduce((sum, char) => sum + char.charCodeAt(0), 0));
      const battleInput = withBattleSideParticipants(buildBattleInputFromResolvedCombatants(
        battleSeed,
        rift.id,
        rift.tier,
        rift.mutatorIds,
        state.raceUpgradeIds,
        state.troopClassUpgradeIds,
        rift.enemyRaceUpgradeIds ?? [],
        rift.enemyTroopClassUpgradeIds ?? [],
        troops.map((troop) => resolveTroopCombatant(state, troop, 'player')),
        rift.enemyArmy,
      ), {
        player: { kind: 'player', label: 'Player' },
        enemy: { kind: 'neutral', label: 'Neutral Guardians' },
      });
      const replay = resolveBattle(battleInput);

      const recoveryMap = Object.fromEntries(
        troops.map((troop) => [
          troop.id,
          fixed(BATTLE_RECOVERY),
        ]),
      );

      return [
        {
          riftId: rift.id,
          assignedTroopIds,
          battleInput,
          replay,
          outcome: replay.outcome,
          victoryPoints: rift.victoryPoints,
          recoveryMap,
        },
      ];
    });

  return { records };
}

export function applyCycleOutcomes(state: GameState, resolution: CycleResolution): ApplyCycleOutcomeResult {
  if (state.gameMode === 'contest') {
    return applyContestCycleOutcomes(resolution.preparedState ?? state, resolution);
  }

  const newlyUnlockedTroopUnlockIds = [
    ...new Set(
      resolution.records
        .filter((record) => record.outcome === 'victory')
        .flatMap((record) => record.battleInput.enemyCombatants.map((combatant) => `${combatant.raceId}/${combatant.unitClassId}` as TroopUnlockId))
        .filter((troopUnlockId) => !isNativeTroopUnlockId(troopUnlockId))
        .filter((troopUnlockId) => !state.unlockedTroopUnlockIds.includes(troopUnlockId))
        .filter((troopUnlockId) => !getOwnedTroopUnlockIds(state).includes(troopUnlockId)),
    ),
  ];

  let unlockedState = state;
  newlyUnlockedTroopUnlockIds.forEach((troopUnlockId) => {
    unlockedState = grantTroopUnlock(unlockedState, troopUnlockId);
  });

  let nextState: GameState = {
    ...unlockedState,
    cycleNumber: unlockedState.cycleNumber + 1,
    essence: unlockedState.essence + 2,
    recentTroopUnlockIds: newlyUnlockedTroopUnlockIds,
    troops: tickRecovery(
      unlockedState.troops.map((troop) => {
        const record = resolution.records.find((entry) => entry.assignedTroopIds.includes(troop.id));
        if (!record) {
          return troop;
        }
        return {
          ...troop,
          assignmentRiftId: null,
          recoveryCyclesRemaining: record.recoveryMap[troop.id] ?? troop.recoveryCyclesRemaining,
        };
      }),
    ),
    openRifts: markExistingRiftsInactive(
      unlockedState.openRifts.map((rift) => {
        const record = resolution.records.find((entry) => entry.riftId === rift.id);
        if (!record) {
          return rift;
        }
        return { ...rift, state: record.outcome === 'victory' ? 'resolved_victory' : 'resolved_defeat' as const };
      }),
    ),
    replayIndex: [...unlockedState.replayIndex],
    activeTroopOffer: null,
    activeUpgradeOffer: null,
    activeRaceUnlockOffer: null,
    activeTroopClassUnlockOffer: null,
    essenceDraftRerollUsed: null,
    seenTroopOfferOptionIds: [],
    seenUpgradeOfferOptionIds: [],
  };

  const writes = resolution.records.map((record) => {
    const replay = buildStoredReplayPayload(record);
    return {
      replayId: record.replay.id,
      replay,
      estimatedBytes: JSON.stringify(replay).length,
    };
  });

  resolution.records.forEach((record) => {
    const payload = writes.find((entry) => entry.replayId === record.replay.id);
    nextState.replayIndex = [
      buildReplayIndexEntry(
        unlockedState.cycleNumber,
        record.replay,
        payload?.estimatedBytes ?? 0,
        undefined,
        record.battleInput.sideParticipants,
        formatRiftLabel(record.riftId),
      ),
      ...nextState.replayIndex,
    ];
    if (record.outcome === 'victory') {
      nextState.victoryPoints += record.victoryPoints;
    }
  });

  const finalCycle = unlockedState.gameMode === 'ladder' ? LADDER_FINAL_CYCLE : CAMPAIGN_FINAL_CYCLE;
  nextState.phase = unlockedState.cycleNumber === finalCycle && !unlockedState.postgameDismissed ? 'game_over' : 'planning';
  nextState.openRifts = unlockedState.gameMode === 'ladder' ? nextState.openRifts : [...nextState.openRifts, ...generateCycleRifts(nextState)];
  nextState = unlockedState.gameMode === 'ladder' ? nextState : applyScheduledCycleUnlock(nextState);

  const deletes: { replayId: string }[] = [];
  const kept: ReplayIndexEntry[] = [];
  let totalBytes = 0;
  nextState.replayIndex.forEach((entry) => {
    if (kept.length >= 40 || totalBytes + entry.estimatedBytes > 4_000_000) {
      deletes.push({ replayId: entry.replayId });
      return;
    }
    kept.push(entry);
    totalBytes += entry.estimatedBytes;
  });
  nextState = { ...nextState, replayIndex: kept };

  return {
    nextState,
    replayPayloadWrites: writes,
    replayPayloadDeletes: deletes,
    newlyUnlockedTroopUnlockIds,
  };
}

export function continuePlaying(state: GameState): GameState {
  if (state.phase !== 'game_over') {
    return state;
  }

  return {
    ...state,
    phase: 'planning',
    postgameDismissed: true,
  };
}

export { serializeGameState, deserializeGameState };
