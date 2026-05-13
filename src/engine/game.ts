import { buildBattleInputFromResolvedCombatants, resolveBattle } from './battle';
import {
  createTroopInstance,
  DEFEAT_RECOVERY,
  getTroopById,
  getTroopsAssignedToRift,
  isFactionUnited,
  resolveTroopCombatant,
  tickRecovery,
  VICTORY_RECOVERY,
} from './army';
import { fixed } from './fixed';
import { createRng } from './rng';
import { deserializeGameState, serializeGameState } from './save';
import { deriveSeed, generateContestCycleRifts, generateCycleRifts } from './rift';
import {
  FACTION_UPGRADES,
  FACTIONS,
  TROOP_TYPE_UPGRADES,
  NATIVE_TROOP_UNLOCK_IDS,
  getFaction,
  getFactionNativeTroopUnlockIds,
  getUnitType,
  isNativeTroopUnlockId,
} from './unitCatalog';
import { getAvailableTroopUnlockIds, getOwnedTroopUnlockIds } from './upgrades';
import type {
  ApplyCycleOutcomeResult,
  CycleResolution,
  FactionId,
  FactionUnlockOffer,
  ContestPlayerId,
  ContestPlayerState,
  ContestOpponentInfoSnapshot,
  BattleSideParticipants,
  GameMode,
  GameState,
  ReplayIndexEntry,
  ResolvedCombatantDefinition,
  RiftResolutionRecord,
  RiftInstance,
  StoredReplayPayload,
  TroopDraftOffer,
  TroopId,
  TroopTypeUnlockOffer,
  TroopUnlockId,
  UnitTypeId,
  UpgradeDraftOffer,
  UpgradeId,
  ValidationIssue,
  ValidationResult,
} from './types';

const OPENING_FACTION_OPTION_COUNT = 4;
const CONTEST_FINAL_CYCLE = 8;
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
    unlockedFactionIds: [],
    unlockedTroopUnlockIds: [],
    recentTroopUnlockIds: [],
    troops: [],
    factionUpgradeIds: [],
    troopTypeUpgradeIds: [],
    activeTroopOffer: null,
    activeUpgradeOffer: null,
    activeFactionUnlockOffer: null,
    activeTroopTypeUnlockOffer: null,
    troopOfferRolls: 0,
    upgradeOfferRolls: 0,
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
    unlockedFactionIds: [],
    unlockedTroopUnlockIds: [],
    recentTroopUnlockIds: [],
    troops: [],
    factionUpgradeIds: [],
    troopTypeUpgradeIds: [],
    activeTroopOffer: null,
    activeUpgradeOffer: null,
    activeFactionUnlockOffer: null,
    activeTroopTypeUnlockOffer: null,
    troopOfferRolls: 0,
    upgradeOfferRolls: 0,
    postgameDismissed: false,
    openRifts: [],
    replayIndex: [],
    ...(gameMode === 'contest' ? { contest: { players: { ai: buildEmptyContestPlayerState() }, opponentInfo: null } } : {}),
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
): ReplayIndexEntry {
  return {
    id: replay.id,
    replayId: replay.id,
    riftId: replay.riftId,
    cycleNumber,
    battleSeed: replay.seed,
    outcome: replay.outcome,
    encounterLabel,
    sideParticipants,
    playerTroopLabels: replay.summary.playerTroops,
    enemyTroopLabels: replay.summary.enemyTroops,
    mutatorIds: replay.mutatorIds,
    summary: `${replay.outcome.toUpperCase()} ${replay.summary.finalPlayerAlive}-${replay.summary.finalEnemyAlive}`,
    estimatedBytes,
    finalPlayerAlive: replay.summary.finalPlayerAlive,
    finalEnemyAlive: replay.summary.finalEnemyAlive,
  };
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

function getOwnedUnitTypeIds(state: Pick<GameState, 'troops'>): UnitTypeId[] {
  return [...new Set(state.troops.map((troop) => troop.unitTypeId))];
}

type ProgressState = Pick<
  GameState,
  | 'unlockedFactionIds'
  | 'unlockedTroopUnlockIds'
  | 'recentTroopUnlockIds'
  | 'troops'
  | 'factionUpgradeIds'
  | 'troopTypeUpgradeIds'
  | 'activeTroopOffer'
  | 'activeUpgradeOffer'
  | 'activeFactionUnlockOffer'
  | 'activeTroopTypeUnlockOffer'
  | 'troopOfferRolls'
  | 'upgradeOfferRolls'
>;

function addTroopToRoster<T extends ProgressState>(state: T, troopUnlockId: TroopUnlockId): T {
  const [factionId, unitTypeId] = troopUnlockId.split('/') as [FactionId, UnitTypeId];
  if (getOwnedTroopUnlockIds(state).includes(troopUnlockId)) {
    return state;
  }
  return {
    ...state,
    unlockedFactionIds: state.unlockedFactionIds.includes(factionId) ? state.unlockedFactionIds : [...state.unlockedFactionIds, factionId],
    troops: [...state.troops, createTroopInstance(factionId, unitTypeId)],
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

function addUpgradeUnlock<T extends Pick<ProgressState, 'factionUpgradeIds' | 'troopTypeUpgradeIds'>>(state: T, upgradeId: UpgradeId): T {
  if (upgradeId in FACTION_UPGRADES) {
    if (state.factionUpgradeIds.includes(upgradeId)) {
      return state;
    }
    return {
      ...state,
      factionUpgradeIds: [...state.factionUpgradeIds, upgradeId],
    };
  }

  if (upgradeId in TROOP_TYPE_UPGRADES) {
    if (state.troopTypeUpgradeIds.includes(upgradeId)) {
      return state;
    }
    return {
      ...state,
      troopTypeUpgradeIds: [...state.troopTypeUpgradeIds, upgradeId],
    };
  }

  return state;
}

function chooseFactionUpgradeIds(state: GameState, factionId: FactionId, count: number, seed: number): UpgradeId[] {
  const rng = createRng(seed);
  const available = Object.values(FACTION_UPGRADES)
    .filter((upgrade) => upgrade.factionId === factionId)
    .map((upgrade) => upgrade.id)
    .filter((upgradeId) => !state.factionUpgradeIds.includes(upgradeId));
  const selected: UpgradeId[] = [];
  while (selected.length < count && available.length > 0) {
    const picked = rng.pick(available);
    selected.push(picked);
    available.splice(available.indexOf(picked), 1);
  }
  return selected;
}

function chooseTroopUnlockIdsForFaction(state: GameState, factionId: FactionId, count: number, seed: number): TroopUnlockId[] {
  const rng = createRng(seed);
  const available = getFactionTroopTypeUnlockOptions(state, factionId);
  const selected: TroopUnlockId[] = [];
  while (selected.length < count && available.length > 0) {
    const picked = rng.pick(available);
    selected.push(picked);
    available.splice(available.indexOf(picked), 1);
  }
  return selected;
}

function buildFactionUnlockOffer(state: GameState, cycleNumber: number, upgradeCount: number, troopUnlockChoiceCount: number): FactionUnlockOffer | null {
  const lockedFactionIds = (Object.keys(FACTIONS) as FactionId[]).filter((factionId) => !state.unlockedFactionIds.includes(factionId));
  if (lockedFactionIds.length === 0) {
    return null;
  }

  const rng = createRng(deriveSeed(state.campaignSeed, cycleNumber * 30_007 + upgradeCount * 101));
  const candidates = [...lockedFactionIds];
  const optionFactionIds: FactionId[] = [];
  while (optionFactionIds.length < 3 && candidates.length > 0) {
    const picked = rng.pick(candidates);
    optionFactionIds.push(picked);
    candidates.splice(candidates.indexOf(picked), 1);
  }

  const upgradeIdsByFactionId = Object.fromEntries(
    optionFactionIds.map((factionId) => [
      factionId,
      chooseFactionUpgradeIds(state, factionId, upgradeCount, deriveSeed(state.campaignSeed, cycleNumber * 31_337 + factionId.length)),
    ]),
  ) as Record<FactionId, UpgradeId[]>;
  const troopUnlockIdsByFactionId = Object.fromEntries(
    optionFactionIds.map((factionId) => [
      factionId,
      chooseTroopUnlockIdsForFaction(state, factionId, troopUnlockChoiceCount, deriveSeed(state.campaignSeed, cycleNumber * 37_109 + factionId.length)),
    ]),
  ) as Record<FactionId, TroopUnlockId[]>;

  return {
    kind: 'faction_unlock',
    cycleNumber,
    optionFactionIds,
    upgradeIdsByFactionId,
    troopUnlockChoiceCount,
    troopUnlockIdsByFactionId,
  };
}

function getFactionTroopTypeUnlockOptions(state: GameState, factionId: FactionId): TroopUnlockId[] {
  const ownedTroopUnlockIds = new Set(getOwnedTroopUnlockIds(state));
  const native = getFactionNativeTroopUnlockIds(factionId) as TroopUnlockId[];
  const defeated = state.unlockedTroopUnlockIds.filter((troopUnlockId) => splitTroopUnlockId(troopUnlockId)[0] === factionId);
  return [...new Set([...native, ...defeated])].filter((troopUnlockId) => !ownedTroopUnlockIds.has(troopUnlockId));
}

function buildTroopTypeUnlockOffer(state: GameState, cycleNumber: number, factionId: FactionId, remainingChoices: number): TroopTypeUnlockOffer | null {
  if (remainingChoices <= 0) {
    return null;
  }
  const optionTroopUnlockIds = getFactionTroopTypeUnlockOptions(state, factionId);
  if (optionTroopUnlockIds.length === 0) {
    return null;
  }
  return {
    kind: 'troop_type_unlock',
    cycleNumber,
    factionId,
    remainingChoices,
    optionTroopUnlockIds,
  };
}

function applyScheduledCycleUnlock(state: GameState): GameState {
  if (state.phase !== 'planning' || state.activeFactionUnlockOffer || state.activeTroopTypeUnlockOffer) {
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
  const offer = buildFactionUnlockOffer(state, state.cycleNumber, scheduled.upgradeCount, scheduled.troopUnlockChoiceCount);
  return offer ? { ...state, phase: 'faction_unlock', activeFactionUnlockOffer: offer } : state;
}

function splitTroopUnlockId(troopUnlockId: TroopUnlockId): [FactionId, UnitTypeId] {
  return troopUnlockId.split('/') as [FactionId, UnitTypeId];
}

function getContestAi(state: GameState): ContestPlayerState {
  return state.contest?.players.ai ?? buildEmptyContestPlayerState();
}

function withContestAi(state: GameState, ai: ContestPlayerState): GameState {
  return {
    ...state,
    contest: {
      ...state.contest,
      players: {
        ai,
      },
      opponentInfo: state.contest?.opponentInfo ?? null,
    },
  };
}

function buildContestOpponentInfoSnapshot(state: GameState): ContestOpponentInfoSnapshot {
  return {
    cycleNumber: state.cycleNumber,
    ai: getContestAi(state),
  };
}

function chooseAiOpeningTroops(seed: number): ContestPlayerState {
  const openingFactionIds = getOpeningFactionOptionIds(seed);
  const starterTroopUnlockIds = getOpeningFactionStarterTroopUnlockIds(seed);
  let ai = buildEmptyContestPlayerState();
  openingFactionIds.slice(0, 2).forEach((factionId) => {
    ai = addTroopToRoster(ai, starterTroopUnlockIds[factionId]);
  });

  return { ...ai, essence: 2 };
}

function contestPlayerState(state: GameState, playerId: ContestPlayerId): ProgressState & { essence: number; victoryPoints: number } {
  return playerId === 'human' ? state : getContestAi(state);
}

function getContestPlayerTroops(state: GameState, playerId: ContestPlayerId) {
  return contestPlayerState(state, playerId).troops;
}

function getContestReadyTroops(state: GameState, playerId: ContestPlayerId) {
  return getContestPlayerTroops(state, playerId).filter((troop) => troop.recoveryCyclesRemaining === 0 && troop.assignmentRiftId === null);
}

export function getOpeningFactionOptionIds(source?: Pick<GameState, 'campaignSeed'> | number): FactionId[] {
  if (source === undefined) {
    return (Object.keys(FACTIONS) as FactionId[]).slice(0, OPENING_FACTION_OPTION_COUNT);
  }
  const seed = typeof source === 'number' ? source : source.campaignSeed;
  return createRng(deriveSeed(seed, 45_041))
    .shuffle(Object.keys(FACTIONS) as FactionId[])
    .slice(0, OPENING_FACTION_OPTION_COUNT);
}

export function getOpeningFactionStarterTroopUnlockIds(source?: Pick<GameState, 'campaignSeed'> | number): Record<FactionId, TroopUnlockId> {
  const seed = source === undefined ? 0 : typeof source === 'number' ? source : source.campaignSeed;
  const rng = createRng(deriveSeed(seed, 46_019));
  const factionIds = getOpeningFactionOptionIds(source);
  const optionsByFactionId = Object.fromEntries(
    factionIds.map((factionId) => [factionId, rng.shuffle(getFactionNativeTroopUnlockIds(factionId) as TroopUnlockId[])]),
  ) as Record<FactionId, TroopUnlockId[]>;
  const selectedByFactionId: Partial<Record<FactionId, TroopUnlockId>> = {};

  function assignStarter(index: number, usedUnitTypeIds: Set<UnitTypeId>): boolean {
    const factionId = factionIds[index];
    if (!factionId) {
      return true;
    }

    for (const troopUnlockId of optionsByFactionId[factionId] ?? []) {
      const [, unitTypeId] = splitTroopUnlockId(troopUnlockId);
      if (usedUnitTypeIds.has(unitTypeId)) {
        continue;
      }
      selectedByFactionId[factionId] = troopUnlockId;
      usedUnitTypeIds.add(unitTypeId);
      if (assignStarter(index + 1, usedUnitTypeIds)) {
        return true;
      }
      usedUnitTypeIds.delete(unitTypeId);
      delete selectedByFactionId[factionId];
    }

    return false;
  }

  if (!assignStarter(0, new Set())) {
    factionIds.forEach((factionId) => {
      selectedByFactionId[factionId] = optionsByFactionId[factionId]?.[0];
    });
  }

  const entries = factionIds.map((factionId) => [factionId, selectedByFactionId[factionId]!] as const);
  return Object.fromEntries(entries) as Record<FactionId, TroopUnlockId>;
}

export function getOpeningFactionStarterTroopUnlockId(source: Pick<GameState, 'campaignSeed'> | number, factionId: FactionId): TroopUnlockId | null {
  return getOpeningFactionStarterTroopUnlockIds(source)[factionId] ?? null;
}

function getAvailableUpgradeIds(state: GameState): UpgradeId[] {
  return [
    ...Object.values(FACTION_UPGRADES).map((upgrade) => upgrade.id),
    ...Object.values(TROOP_TYPE_UPGRADES).map((upgrade) => upgrade.id),
  ].filter((upgradeId) => !state.factionUpgradeIds.includes(upgradeId) && !state.troopTypeUpgradeIds.includes(upgradeId));
}

function pickOfferOptions(seed: number, bucketOptions: string[][][], allOptions: string[]): string[] {
  const rng = createRng(seed);
  const selected = new Set<string>();

  bucketOptions.forEach((buckets) => {
    const prioritizedSources = [...buckets, allOptions];
    const source = prioritizedSources.map((bucket) => bucket.filter((optionId) => !selected.has(optionId))).find((bucket) => bucket.length > 0) ?? [];
    if (source.length === 0) {
      return;
    }
    selected.add(rng.pick(source));
  });

  return [...selected];
}

function pickUnselectedOption(rng: ReturnType<typeof createRng>, bucket: string[], selected: Set<string>): string | null {
  const candidates = bucket.filter((optionId) => !selected.has(optionId));
  return candidates.length > 0 ? rng.pick(candidates) : null;
}

function buildTroopOffer(state: GameState): TroopDraftOffer | null {
  const availableTroopUnlockIds = getAvailableTroopUnlockIds(state);
  if (availableTroopUnlockIds.length === 0) {
    return null;
  }

  const ownedUnitTypeIds = new Set(getOwnedUnitTypeIds(state));
  const ownedFactionIds = new Set(state.unlockedFactionIds);
  const recentTroopUnlockIds = (state.recentTroopUnlockIds ?? []).filter((troopUnlockId) => availableTroopUnlockIds.includes(troopUnlockId));
  const ownedFactionTroopUnlockIds = availableTroopUnlockIds.filter((troopUnlockId) => ownedFactionIds.has(splitTroopUnlockId(troopUnlockId)[0]));
  const options = pickOfferOptions(
    deriveSeed(state.campaignSeed, state.cycleNumber * 10_001 + state.troopOfferRolls + 1),
    [
      [ownedFactionTroopUnlockIds],
      [availableTroopUnlockIds.filter((troopUnlockId) => ownedUnitTypeIds.has(splitTroopUnlockId(troopUnlockId)[1]))],
      [recentTroopUnlockIds, ownedFactionTroopUnlockIds],
    ],
    availableTroopUnlockIds,
  );

  return options.length > 0 ? { kind: 'troop', optionTroopUnlockIds: options } : null;
}

function countExistingUpgradesAffectingTroop(state: GameState, troop: GameState['troops'][number]): number {
  const factionUpgradeCount = state.factionUpgradeIds.filter((upgradeId) => FACTION_UPGRADES[upgradeId]?.factionId === troop.factionId).length;
  const troopTypeUpgradeCount = state.troopTypeUpgradeIds.filter((upgradeId) => TROOP_TYPE_UPGRADES[upgradeId]?.unitTypeId === troop.unitTypeId).length;
  return factionUpgradeCount + troopTypeUpgradeCount;
}

function buildLeastUpgradedTroopUpgradeBucket(
  state: GameState,
  availableUpgradeIds: UpgradeId[],
  selected: Set<string>,
  rng: ReturnType<typeof createRng>,
): UpgradeId[] {
  if (state.troops.length === 0) {
    return [];
  }

  const leastUpgradeCount = Math.min(...state.troops.map((troop) => countExistingUpgradesAffectingTroop(state, troop)));
  const targetTroops = state.troops.filter((troop) => countExistingUpgradesAffectingTroop(state, troop) === leastUpgradeCount);
  const shuffledTargetTroops = rng.shuffle(targetTroops);

  for (const troop of shuffledTargetTroops) {
    const bucket = availableUpgradeIds.filter(
      (upgradeId) =>
        !selected.has(upgradeId) &&
        ((upgradeId in FACTION_UPGRADES && FACTION_UPGRADES[upgradeId]!.factionId === troop.factionId) ||
          (upgradeId in TROOP_TYPE_UPGRADES && TROOP_TYPE_UPGRADES[upgradeId]!.unitTypeId === troop.unitTypeId)),
    );
    if (bucket.length > 0) {
      return bucket;
    }
  }

  return [];
}

function buildUpgradeOffer(state: GameState): UpgradeDraftOffer | null {
  const ownedFactionIds = new Set(state.unlockedFactionIds);
  const ownedUnitTypeIds = new Set(getOwnedUnitTypeIds(state));
  const availableUpgradeIds = getAvailableUpgradeIds(state);

  if (availableUpgradeIds.length === 0) {
    return null;
  }

  const troopUpgradeBucket = availableUpgradeIds.filter(
    (upgradeId) => upgradeId in TROOP_TYPE_UPGRADES && ownedUnitTypeIds.has(TROOP_TYPE_UPGRADES[upgradeId]!.unitTypeId),
  );
  const factionUpgradeBucket = availableUpgradeIds.filter(
    (upgradeId) => upgradeId in FACTION_UPGRADES && ownedFactionIds.has(FACTION_UPGRADES[upgradeId]!.factionId),
  );
  const rng = createRng(deriveSeed(state.campaignSeed, state.cycleNumber * 20_003 + state.upgradeOfferRolls + 1));
  const selected = new Set<string>();

  [troopUpgradeBucket, factionUpgradeBucket].forEach((bucket) => {
    const picked = pickUnselectedOption(rng, bucket, selected) ?? pickUnselectedOption(rng, availableUpgradeIds, selected);
    if (picked) {
      selected.add(picked);
    }
  });

  const leastUpgradedTroopBucket = buildLeastUpgradedTroopUpgradeBucket(state, availableUpgradeIds, selected, rng);
  const pickedTargetedUpgrade =
    pickUnselectedOption(rng, leastUpgradedTroopBucket, selected) ?? pickUnselectedOption(rng, availableUpgradeIds, selected);
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

  const hasTroopOptions = getAvailableTroopUnlockIds(state).length > 0;
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

  const [factionId, unitTypeId] = splitTroopUnlockId(troopUnlockId);
  const starterTroopUnlockId = getOpeningFactionStarterTroopUnlockId(state, factionId);
  if (
    state.troops.length >= 2 ||
    !getOpeningFactionOptionIds(state).includes(factionId) ||
    starterTroopUnlockId !== troopUnlockId ||
    state.troops.some((troop) => troop.factionId === factionId || troop.unitTypeId === unitTypeId)
  ) {
    return state;
  }

  return addTroopToRoster(state, troopUnlockId);
}

export function unclaimOpeningTroop(state: GameState, troopUnlockId: TroopUnlockId): GameState {
  if (state.phase !== 'opening_unlock' || !NATIVE_TROOP_UNLOCK_IDS.includes(troopUnlockId)) {
    return state;
  }

  const [factionId, unitTypeId] = splitTroopUnlockId(troopUnlockId);
  const nextTroops = state.troops.filter((troop) => troop.factionId !== factionId || troop.unitTypeId !== unitTypeId);
  if (nextTroops.length === state.troops.length) {
    return state;
  }

  return {
    ...state,
    unlockedFactionIds: [...new Set(nextTroops.map((troop) => troop.factionId))],
    troops: nextTroops,
  };
}

export function startOpeningCampaign(state: GameState): GameState {
  if (state.phase !== 'opening_unlock' || state.troops.length !== 2) {
    return state;
  }

  if (state.gameMode === 'contest') {
    return withContestAi(
      {
        ...state,
        phase: 'planning',
        essence: 2,
        openRifts: generateContestCycleRifts(state),
      },
      chooseAiOpeningTroops(state.campaignSeed),
    );
  }

  return {
    ...state,
    phase: 'planning',
    essence: 2,
    openRifts: generateCycleRifts(state),
  };
}

export function claimFactionUnlockOffer(state: GameState, factionId: FactionId): GameState {
  const offer = state.activeFactionUnlockOffer;
  if (state.phase !== 'faction_unlock' || !offer || !offer.optionFactionIds.includes(factionId)) {
    return state;
  }

  let nextState: GameState = {
    ...state,
    unlockedFactionIds: state.unlockedFactionIds.includes(factionId) ? state.unlockedFactionIds : [...state.unlockedFactionIds, factionId],
    activeFactionUnlockOffer: null,
  };
  (offer.upgradeIdsByFactionId[factionId] ?? []).forEach((upgradeId) => {
    nextState = addUpgradeUnlock(nextState, upgradeId);
  });
  (offer.troopUnlockIdsByFactionId?.[factionId] ?? []).forEach((troopUnlockId) => {
    nextState = addTroopToRoster(grantTroopUnlock(nextState, troopUnlockId), troopUnlockId);
  });

  return { ...nextState, phase: 'planning', activeTroopTypeUnlockOffer: null };
}

export function claimTroopTypeUnlockOffer(state: GameState, troopUnlockId: TroopUnlockId): GameState {
  const offer = state.activeTroopTypeUnlockOffer;
  if (state.phase !== 'troop_type_unlock' || !offer || !offer.optionTroopUnlockIds.includes(troopUnlockId)) {
    return state;
  }

  const [factionId] = splitTroopUnlockId(troopUnlockId);
  if (factionId !== offer.factionId) {
    return state;
  }

  const nextState = addTroopToRoster(grantTroopUnlock(state, troopUnlockId), troopUnlockId);
  const nextRemainingChoices = offer.remainingChoices - 1;
  const nextOffer = buildTroopTypeUnlockOffer(
    {
      ...nextState,
      activeTroopTypeUnlockOffer: null,
    },
    offer.cycleNumber,
    offer.factionId,
    nextRemainingChoices,
  );

  return nextOffer
    ? { ...nextState, activeTroopTypeUnlockOffer: nextOffer }
    : { ...nextState, phase: 'planning', activeTroopTypeUnlockOffer: null };
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
  };
}

export function claimTroopOffer(state: GameState, troopUnlockId: TroopUnlockId): GameState {
  if (
    !state.activeTroopOffer ||
    !state.activeTroopOffer.optionTroopUnlockIds.includes(troopUnlockId) ||
    !getAvailableTroopUnlockIds(state).includes(troopUnlockId)
  ) {
    return state;
  }

  const unlocked = addTroopToRoster(grantTroopUnlock(state, troopUnlockId), troopUnlockId);
  return {
    ...unlocked,
    activeTroopOffer: null,
  };
}

export function claimUpgradeOffer(state: GameState, upgradeId: UpgradeId): GameState {
  if (!state.activeUpgradeOffer || !state.activeUpgradeOffer.optionUpgradeIds.includes(upgradeId)) {
    return state;
  }

  const unlocked = addUpgradeUnlock(state, upgradeId);
  return {
    ...unlocked,
    activeUpgradeOffer: null,
  };
}

export function validateAssignments(state: GameState): ValidationResult {
  const issues: ValidationIssue[] = [];
  const occupiedHumanTroopIds = new Set(
    state.gameMode === 'contest'
      ? state.openRifts.filter((rift) => rift.controller === 'human').flatMap((rift) => rift.occupyingTroopIds ?? [])
      : [],
  );
  const assignedTroops = state.troops.filter((troop) => troop.assignmentRiftId !== null && !occupiedHumanTroopIds.has(troop.id));

  if (assignedTroops.length === 0) {
    issues.push({ kind: 'no_assignments', message: 'Assign at least one troop before ending the cycle.' });
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
        message: `${getFaction(troop.factionId).singularLabel} ${troop.unitTypeId} is still recovering.`,
      });
    }
  });

  state.openRifts
    .filter((rift) => rift.state === 'discovered')
    .forEach((rift) => {
      const troops = getTroopsAssignedToRift(state, rift.id);
      const grouped = new Map<FactionId, number>();
      const groupedTypes = new Map<UnitTypeId, number>();
      troops.forEach((troop) => grouped.set(troop.factionId, (grouped.get(troop.factionId) ?? 0) + 1));
      troops.forEach((troop) => groupedTypes.set(troop.unitTypeId, (groupedTypes.get(troop.unitTypeId) ?? 0) + 1));
      grouped.forEach((count, factionId) => {
        if (count > 1 && !isFactionUnited(state, factionId)) {
          issues.push({
            kind: 'same_faction_conflict',
            riftId: rift.id,
            message: `${getFaction(factionId).label} cannot send multiple troops into the same Rift yet.`,
          });
        }
      });
      groupedTypes.forEach((count, unitTypeId) => {
        if (count > 1) {
          issues.push({
            kind: 'same_type_conflict',
            riftId: rift.id,
            message: `Only one ${getUnitType(unitTypeId).label} troop can enter the same Rift.`,
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
      message: `${getFaction(troop.factionId).singularLabel} ${troop.unitTypeId} is still recovering.`,
    };
  }

  const rift = state.openRifts.find((entry) => entry.id === riftId);
  if (!rift || rift.state !== 'discovered') {
    return { kind: 'unknown_rift', riftId, message: `Rift ${riftId} is not available for assignment.` };
  }

  if (state.gameMode === 'contest' && rift.controller === 'human') {
    return { kind: 'own_rift', riftId, message: 'You already control this Rift.' };
  }

  const sameFactionTroop = getTroopsAssignedToRift(state, riftId).find(
    (assignedTroop) => assignedTroop.id !== troopId && assignedTroop.factionId === troop.factionId,
  );
  if (sameFactionTroop && !isFactionUnited(state, troop.factionId)) {
    return {
      kind: 'same_faction_conflict',
      riftId,
      message: `${getFaction(troop.factionId).label} cannot send multiple troops into the same Rift yet.`,
    };
  }

  const sameTypeTroop = getTroopsAssignedToRift(state, riftId).find(
    (assignedTroop) => assignedTroop.id !== troopId && assignedTroop.unitTypeId === troop.unitTypeId,
  );
  if (sameTypeTroop) {
    return {
      kind: 'same_type_conflict',
      riftId,
      message: `Only one ${getUnitType(troop.unitTypeId).label} troop can enter the same Rift.`,
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
    unlockedFactionIds: progress.unlockedFactionIds,
    unlockedTroopUnlockIds: progress.unlockedTroopUnlockIds,
    recentTroopUnlockIds: progress.recentTroopUnlockIds,
    troops: progress.troops,
    factionUpgradeIds: progress.factionUpgradeIds,
    troopTypeUpgradeIds: progress.troopTypeUpgradeIds,
    activeTroopOffer: progress.activeTroopOffer,
    activeUpgradeOffer: progress.activeUpgradeOffer,
    activeFactionUnlockOffer: progress.activeFactionUnlockOffer,
    activeTroopTypeUnlockOffer: progress.activeTroopTypeUnlockOffer,
    troopOfferRolls: progress.troopOfferRolls,
    upgradeOfferRolls: progress.upgradeOfferRolls,
    openRifts: [],
    replayIndex: [],
    contest: undefined,
  };
}

function progressFromPseudoState(state: GameState): ContestPlayerState {
  return {
    victoryPoints: state.victoryPoints,
    essence: state.essence,
    unlockedFactionIds: state.unlockedFactionIds,
    unlockedTroopUnlockIds: state.unlockedTroopUnlockIds,
    recentTroopUnlockIds: state.recentTroopUnlockIds,
    troops: state.troops,
    factionUpgradeIds: state.factionUpgradeIds,
    troopTypeUpgradeIds: state.troopTypeUpgradeIds,
    activeTroopOffer: state.activeTroopOffer,
    activeUpgradeOffer: state.activeUpgradeOffer,
    activeFactionUnlockOffer: state.activeFactionUnlockOffer,
    activeTroopTypeUnlockOffer: state.activeTroopTypeUnlockOffer,
    troopOfferRolls: state.troopOfferRolls,
    upgradeOfferRolls: state.upgradeOfferRolls,
  };
}

function randomlyAdvanceAiUnlocks(state: GameState): GameState {
  if (state.gameMode !== 'contest') {
    return state;
  }

  const rng = createRng(deriveSeed(state.campaignSeed, state.cycleNumber * 44_441 + 19));
  let pseudo = applyScheduledCycleUnlock(buildProgressPseudoState(state, getContestAi(state)));

  if (pseudo.activeFactionUnlockOffer) {
    const pickedFaction = rng.pick(pseudo.activeFactionUnlockOffer.optionFactionIds);
    pseudo = claimFactionUnlockOffer(pseudo, pickedFaction);
  }

  while (pseudo.activeTroopTypeUnlockOffer) {
    const pickedTroop = rng.pick(pseudo.activeTroopTypeUnlockOffer.optionTroopUnlockIds);
    pseudo = claimTroopTypeUnlockOffer(pseudo, pickedTroop);
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

  return withContestAi(state, progressFromPseudoState(pseudo));
}

export function extractContestPlayerProgress(state: GameState): ContestPlayerState {
  return progressFromPseudoState(state);
}

export function applyContestPlayerProgress(state: GameState, playerId: ContestPlayerId, progress: ContestPlayerState): GameState {
  if (playerId === 'human') {
    return {
      ...state,
      victoryPoints: progress.victoryPoints,
      essence: progress.essence,
      unlockedFactionIds: progress.unlockedFactionIds,
      unlockedTroopUnlockIds: progress.unlockedTroopUnlockIds,
      recentTroopUnlockIds: progress.recentTroopUnlockIds,
      troops: progress.troops,
      factionUpgradeIds: progress.factionUpgradeIds,
      troopTypeUpgradeIds: progress.troopTypeUpgradeIds,
      activeTroopOffer: progress.activeTroopOffer,
      activeUpgradeOffer: progress.activeUpgradeOffer,
      activeFactionUnlockOffer: progress.activeFactionUnlockOffer,
      activeTroopTypeUnlockOffer: progress.activeTroopTypeUnlockOffer,
      troopOfferRolls: progress.troopOfferRolls,
      upgradeOfferRolls: progress.upgradeOfferRolls,
    };
  }

  return withContestAi(state, progress);
}

export function getContestPlayerProgress(state: GameState, playerId: ContestPlayerId): ContestPlayerState {
  return playerId === 'human' ? extractContestPlayerProgress(state) : getContestAi(state);
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
      factionUpgradeIds: [] as UpgradeId[],
      troopTypeUpgradeIds: [] as UpgradeId[],
      combatants: rift.enemyArmy,
    };
  }

  const defenderId = rift.occupyingPlayerId;
  const defenderProgress = contestPlayerState(state, defenderId);
  const occupyingIds = new Set(rift.occupyingTroopIds ?? []);
  const troops = defenderProgress.troops.filter((troop) => occupyingIds.has(troop.id));
  return {
    defenderId,
    factionUpgradeIds: defenderProgress.factionUpgradeIds,
    troopTypeUpgradeIds: defenderProgress.troopTypeUpgradeIds,
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
    rift.saturation,
    attackerProgress.factionUpgradeIds,
    attackerProgress.troopTypeUpgradeIds,
    defender.factionUpgradeIds,
    defender.troopTypeUpgradeIds,
    getContestCombatantsForTroops(state, attackerId, attackingTroops, 'player'),
    defender.combatants,
  ), {
    player: {
      kind: attackerId === 'human' ? 'player' : 'opponent',
      label: attackerId === 'human' ? 'Player' : 'Rival',
      playerId: attackerId,
    },
    enemy:
      defender.defenderId === 'neutral'
        ? { kind: 'neutral', label: 'Neutral Guardians' }
        : {
            kind: defender.defenderId === 'human' ? 'player' : 'opponent',
            label: defender.defenderId === 'human' ? 'Player' : 'Rival',
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
    recoveryMap: Object.fromEntries(attackingTroops.map((troop) => [troop.id, fixed(VICTORY_RECOVERY)])),
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
  const human = contestPlayerState(state, 'human');
  const ai = contestPlayerState(state, 'ai');
  const battleInput = withBattleSideParticipants(buildBattleInputFromResolvedCombatants(
    battleSeed,
    rift.id,
    rift.tier,
    rift.mutatorIds,
    rift.saturation,
    human.factionUpgradeIds,
    human.troopTypeUpgradeIds,
    ai.factionUpgradeIds,
    ai.troopTypeUpgradeIds,
    getContestCombatantsForTroops(state, 'human', humanTroops, 'player'),
    getContestCombatantsForTroops(state, 'ai', aiTroops, 'enemy'),
  ), {
    player: { kind: 'player', label: 'Player', playerId: 'human' },
    enemy: { kind: 'opponent', label: 'Rival', playerId: 'ai' },
  });
  const replay = resolveBattle(battleInput);
  return {
    riftId: rift.id,
    assignedTroopIds,
    battleInput,
    replay,
    outcome: replay.outcome,
    victoryPoints: rift.victoryPoints,
    recoveryMap: Object.fromEntries(assignedTroopIds.map((troopId) => [troopId, fixed(VICTORY_RECOVERY)])),
    contest: {
      kind: 'pvp',
      defenderId: 'neutral',
      winnerId: replay.outcome === 'victory' ? 'human' : replay.outcome === 'defeat' ? 'ai' : null,
    },
  };
}

function isValidAiTroopGroupAddition(state: GameState, target: typeof state.troops, troop: (typeof state.troops)[number]): boolean {
  if (target.some((entry) => entry.id === troop.id || entry.unitTypeId === troop.unitTypeId)) {
    return false;
  }
  if (target.some((entry) => entry.factionId === troop.factionId) && !isFactionUnited(contestPlayerState(state, 'ai'), troop.factionId)) {
    return false;
  }
  return true;
}

function getAiRiftValue(rift: RiftInstance): number {
  const controllerMultiplier = rift.controller === 'human' ? 2 : rift.controller === 'neutral' || !rift.controller ? 1 : 0;
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
  const tempoPower = combatant.quantity * combatant.stats.speed * 8;
  const reachPower = combatant.stats.range * combatant.quantity * 20;
  const capacityPower = combatant.stats.capacity * combatant.quantity * 12;
  return offensePower + durabilityPower + tempoPower + reachPower + capacityPower;
}

function scoreAiTroopForDeployment(state: GameState, troop: (typeof state.troops)[number]): number {
  return scoreResolvedCombatantPower(resolveTroopCombatant(contestPlayerState(state, 'ai'), troop, 'player'));
}

function scoreAiCombatantGroupPower(combatants: ResolvedCombatantDefinition[]): number {
  return combatants.reduce((sum, combatant) => sum + scoreResolvedCombatantPower(combatant), 0);
}

function scoreAiRoleMix(combatants: ResolvedCombatantDefinition[]): number {
  const hasFrontline = combatants.some((combatant) => combatant.role === 'frontline');
  const hasBackline = combatants.some((combatant) => combatant.role === 'backline');
  const hasChaff = combatants.some((combatant) => combatant.role === 'chaff');
  const hasSupport = combatants.some((combatant) => combatant.attributes.includes('support') || combatant.attributes.includes('healer'));
  const onlyBacklinePenalty = hasBackline && !hasFrontline && !hasChaff ? -35 : 0;
  return (hasFrontline ? 30 : -25) + (hasBackline ? 15 : 0) + (hasSupport ? 10 : 0) + (hasChaff ? 8 : 0) + onlyBacklinePenalty;
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
      const combatants = getContestCombatantsForTroops(state, 'ai', group, 'player');
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
      won = resolveContestBattle(state, rift, 'ai', candidate.troops, 91_003).outcome === 'victory';
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
  const readyTroops = [...getContestReadyTroops(state, 'ai')].sort(
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
    const humanHeldCount = selected.filter((choice) => choice.rift.controller === 'human').length;
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

function assignAiContestTroops(state: GameState, options: ContestAiPlannerOptions): GameState {
  const allocation = firstWinningAiAllocation(state, options);
  if (allocation.size === 0) {
    return state;
  }
  const ai = getContestAi(state);
  const assignedTroopIds = new Map<TroopId, string>();
  allocation.forEach((troopIds, riftId) => {
    troopIds.forEach((troopId) => assignedTroopIds.set(troopId, riftId));
  });
  return withContestAi(state, {
    ...ai,
    troops: ai.troops.map((troop) => (assignedTroopIds.has(troop.id) ? { ...troop, assignmentRiftId: assignedTroopIds.get(troop.id)! } : troop)),
  });
}

function prepareContestCycle(state: GameState, options: ContestAiPlannerOptions = CONTEST_AI_WORKER_OPTIONS): GameState {
  return assignAiContestTroops(randomlyAdvanceAiUnlocks(state), options);
}

export function prepareContestAiForCycle(state: GameState, options: ContestAiPlannerOptions = CONTEST_AI_WORKER_OPTIONS): ContestPlayerState {
  return getContestAi(prepareContestCycle(state, options));
}

function resolveContestAssignedRifts(state: GameState): CycleResolution {
  const records: RiftResolutionRecord[] = [];

  state.openRifts
    .filter((rift) => rift.state === 'discovered')
    .forEach((rift, index) => {
      const humanOccupants = new Set(rift.controller === 'human' ? rift.occupyingTroopIds ?? [] : []);
      const aiOccupants = new Set(rift.controller === 'ai' ? rift.occupyingTroopIds ?? [] : []);
      const humanTroops = state.troops.filter((troop) => troop.assignmentRiftId === rift.id && !humanOccupants.has(troop.id));
      const aiTroops = getContestAi(state).troops.filter((troop) => troop.assignmentRiftId === rift.id && !aiOccupants.has(troop.id));

      if (humanTroops.length === 0 && aiTroops.length === 0) {
        return;
      }

      if (rift.controller === 'neutral' || !rift.controller) {
        const humanGuardianRecord =
          humanTroops.length > 0 ? resolveContestBattle(state, rift, 'human', humanTroops, 10_000 + index * 101) : null;
        const aiGuardianRecord = aiTroops.length > 0 ? resolveContestBattle(state, rift, 'ai', aiTroops, 20_000 + index * 101) : null;
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

      if (rift.controller === 'human' && aiTroops.length > 0) {
        records.push(resolveContestBattle(state, rift, 'ai', aiTroops, 40_000 + index * 101));
        return;
      }

      if (rift.controller === 'ai' && humanTroops.length > 0) {
        records.push(resolveContestBattle(state, rift, 'human', humanTroops, 50_000 + index * 101));
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
    .map((combatant) => `${combatant.factionId}/${combatant.unitTypeId}` as TroopUnlockId)
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
    record.contest.attackerId === 'human' ||
    record.contest.defenderId === 'human'
  );
}

function getContestEncounterLabel(record: RiftResolutionRecord): string {
  if (record.contest?.kind === 'guardian' && record.contest.attackerId === 'ai') {
    return 'Rival vs Neutral Guardians';
  }
  return record.contest?.kind === 'guardian' ? 'Neutral Guardians' : 'Rival';
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
          recoveryCyclesRemaining: remainsOccupied ? 0 : fixed(VICTORY_RECOVERY),
        };
      }),
    ),
    activeTroopOffer: null,
    activeUpgradeOffer: null,
    activeFactionUnlockOffer: null,
    activeTroopTypeUnlockOffer: null,
  };
}

function applyContestCycleOutcomes(state: GameState, resolution: CycleResolution): ApplyCycleOutcomeResult {
  const humanUnlocks = [
    ...new Set(resolution.records.filter((record) => record.contest?.attackerId === 'human').flatMap((record) => getGuardianUnlocksForRecord(state, record))),
  ];
  const aiUnlocks = [
    ...new Set(resolution.records.filter((record) => record.contest?.attackerId === 'ai').flatMap((record) => getGuardianUnlocksForRecord(state, record))),
  ];

  let nextHumanProgress: ContestPlayerState = applyContestUnlocksToProgress(
    {
      victoryPoints: state.victoryPoints,
      essence: state.essence,
      unlockedFactionIds: state.unlockedFactionIds,
      unlockedTroopUnlockIds: state.unlockedTroopUnlockIds,
      recentTroopUnlockIds: state.recentTroopUnlockIds,
      troops: state.troops,
      factionUpgradeIds: state.factionUpgradeIds,
      troopTypeUpgradeIds: state.troopTypeUpgradeIds,
      activeTroopOffer: state.activeTroopOffer,
      activeUpgradeOffer: state.activeUpgradeOffer,
      activeFactionUnlockOffer: state.activeFactionUnlockOffer,
      activeTroopTypeUnlockOffer: state.activeTroopTypeUnlockOffer,
      troopOfferRolls: state.troopOfferRolls,
      upgradeOfferRolls: state.upgradeOfferRolls,
    },
    humanUnlocks,
  );
  let nextAiProgress = applyContestUnlocksToProgress(getContestAi(state), aiUnlocks);

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
        winnerId === 'human'
          ? state.troops.filter((troop) => troop.assignmentRiftId === rift.id).map((troop) => troop.id)
          : winnerId === 'ai'
            ? getContestAi(state).troops.filter((troop) => troop.assignmentRiftId === rift.id).map((troop) => troop.id)
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
    if (rift.occupyingPlayerId === 'human') {
      occupiedByHuman.set(rift.id, new Set(rift.occupyingTroopIds ?? []));
    }
    if (rift.occupyingPlayerId === 'ai') {
      occupiedByAi.set(rift.id, new Set(rift.occupyingTroopIds ?? []));
    }
  });

  nextHumanProgress = clearContestTroopAssignments(nextHumanProgress, occupiedByHuman);
  nextAiProgress = clearContestTroopAssignments(nextAiProgress, occupiedByAi);

  nextRifts.forEach((rift) => {
    if (rift.state !== 'discovered') {
      return;
    }
    if (rift.controller === 'human') {
      nextHumanProgress = { ...nextHumanProgress, victoryPoints: nextHumanProgress.victoryPoints + rift.tier };
    }
    if (rift.controller === 'ai') {
      nextAiProgress = { ...nextAiProgress, victoryPoints: nextAiProgress.victoryPoints + rift.tier };
    }
  });

  const cycleNumber = state.cycleNumber + 1;
  let nextState: GameState = withContestAi(
    {
      ...state,
      cycleNumber,
      phase: state.cycleNumber === CONTEST_FINAL_CYCLE && !state.postgameDismissed ? 'game_over' : 'planning',
      victoryPoints: nextHumanProgress.victoryPoints,
      essence: nextHumanProgress.essence + 2,
      unlockedFactionIds: nextHumanProgress.unlockedFactionIds,
      unlockedTroopUnlockIds: nextHumanProgress.unlockedTroopUnlockIds,
      recentTroopUnlockIds: humanUnlocks,
      troops: nextHumanProgress.troops,
      factionUpgradeIds: nextHumanProgress.factionUpgradeIds,
      troopTypeUpgradeIds: nextHumanProgress.troopTypeUpgradeIds,
      activeTroopOffer: null,
      activeUpgradeOffer: null,
      activeFactionUnlockOffer: null,
      activeTroopTypeUnlockOffer: null,
      openRifts: [...nextRifts, ...generateContestCycleRifts({ ...state, cycleNumber })],
      replayIndex: [...state.replayIndex],
    },
    {
      ...nextAiProgress,
      essence: nextAiProgress.essence + 2,
      recentTroopUnlockIds: aiUnlocks,
    },
  );
  nextState = applyScheduledCycleUnlock(nextState);
  nextState = {
    ...nextState,
    contest: nextState.contest
      ? {
          ...nextState.contest,
          opponentInfo: resolution.contestOpponentInfoSnapshot ?? buildContestOpponentInfoSnapshot(state),
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
      buildReplayIndexEntry(state.cycleNumber, record.replay, payload?.estimatedBytes ?? 0, getContestEncounterLabel(record), record.battleInput.sideParticipants),
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
    const preparedState = preparedContestAi ? withContestAi(state, preparedContestAi) : prepareContestCycle(state, CONTEST_AI_SYNC_FALLBACK_OPTIONS);
    return {
      ...resolveContestAssignedRifts(preparedState),
      preparedState,
      contestOpponentInfoSnapshot: buildContestOpponentInfoSnapshot(state),
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
        rift.saturation,
        state.factionUpgradeIds,
        state.troopTypeUpgradeIds,
        [],
        [],
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
          fixed(replay.outcome === 'victory' ? VICTORY_RECOVERY : DEFEAT_RECOVERY),
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
        .flatMap((record) => record.battleInput.enemyCombatants.map((combatant) => `${combatant.factionId}/${combatant.unitTypeId}` as TroopUnlockId))
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
    activeFactionUnlockOffer: null,
    activeTroopTypeUnlockOffer: null,
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
      buildReplayIndexEntry(unlockedState.cycleNumber, record.replay, payload?.estimatedBytes ?? 0, undefined, record.battleInput.sideParticipants),
      ...nextState.replayIndex,
    ];
    if (record.outcome === 'victory') {
      nextState.victoryPoints += record.victoryPoints;
    }
  });

  nextState.phase = unlockedState.cycleNumber === 10 && !unlockedState.postgameDismissed ? 'game_over' : 'planning';
  nextState.openRifts = [...nextState.openRifts, ...generateCycleRifts(nextState)];
  nextState = applyScheduledCycleUnlock(nextState);

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
