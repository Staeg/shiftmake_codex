import type {
  CampaignPhase,
  ContestPlayerState,
  ContestState,
  RaceUnlockOffer,
  GameMode,
  GameState,
  LadderState,
  LoadGameResult,
  LoadGameRepairReport,
  ReplayIndexEntry,
  ResolvedCombatantDefinition,
  RiftInstance,
  TroopDraftOffer,
  TroopInstance,
  TroopClassUnlockOffer,
  UpgradeDraftOffer,
} from './types';
import { ALL_TROOP_UNLOCK_IDS, RACE_UPGRADES, RACES, TROOP_CLASS_UPGRADES, UNIT_CLASSES, getTroopClassUpgrade } from './unitCatalog';

export function serializeGameState(state: GameState): string {
  return JSON.stringify(state);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function arrayOrEmpty<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function makeRepairReport(): LoadGameRepairReport {
  return {
    missingRaceIds: [],
    missingTroopUnlockIds: [],
    missingTroopInstanceIds: [],
    missingUpgradeIds: [],
    missingRiftEnemyIds: [],
    missingDraftOptionIds: [],
  };
}

function addRepair(repairs: LoadGameRepairReport, category: keyof LoadGameRepairReport, id: unknown): void {
  const label = typeof id === 'string' && id.trim() ? id : 'unknown';
  if (!repairs[category].includes(label)) {
    repairs[category].push(label);
  }
}

function hasRepairs(repairs: LoadGameRepairReport): boolean {
  return Object.values(repairs).some((entries) => entries.length > 0);
}

function isKnownRaceId(value: unknown): value is string {
  return typeof value === 'string' && value in RACES;
}

function isKnownUnitClassId(value: unknown): value is string {
  return typeof value === 'string' && value in UNIT_CLASSES;
}

function isKnownTroopUnlockId(value: unknown): value is string {
  return typeof value === 'string' && ALL_TROOP_UNLOCK_IDS.includes(value);
}

function isKnownRaceUpgradeId(value: unknown): value is string {
  return typeof value === 'string' && value in RACE_UPGRADES;
}

function isKnownTroopClassUpgradeId(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }
  if (value in TROOP_CLASS_UPGRADES) {
    return true;
  }
  try {
    getTroopClassUpgrade(value);
    return true;
  } catch {
    return false;
  }
}

function isKnownUpgradeId(value: unknown): value is string {
  return isKnownRaceUpgradeId(value) || isKnownTroopClassUpgradeId(value);
}

function gameModeOr(value: unknown): GameMode {
  return value === 'contest' || value === 'ladder' ? value : 'campaign';
}

function phaseOr(value: unknown): CampaignPhase {
  return value === 'opening_unlock' ||
    value === 'race_unlock' ||
    value === 'troop_class_unlock' ||
    value === 'planning' ||
    value === 'game_over'
    ? value
    : 'planning';
}

function normalizeTroop(troop: TroopInstance): TroopInstance {
  return {
    ...troop,
    id: troop.id ?? `${troop.raceId}/${troop.unitClassId}`,
    recoveryCyclesRemaining: numberOr(troop.recoveryCyclesRemaining, 0),
    assignmentRiftId: troop.assignmentRiftId ?? null,
  };
}

function isKnownTroop(troop: TroopInstance): boolean {
  return isKnownRaceId(troop.raceId) && isKnownUnitClassId(troop.unitClassId) && isKnownTroopUnlockId(`${troop.raceId}/${troop.unitClassId}`);
}

function isKnownCombatant(combatant: ResolvedCombatantDefinition): boolean {
  return isKnownRaceId(combatant.raceId) && isKnownUnitClassId(combatant.unitClassId);
}

function filterKnownRaces(values: unknown[], repairs: LoadGameRepairReport): string[] {
  return values.filter((value): value is string => {
    const known = isKnownRaceId(value);
    if (!known) {
      addRepair(repairs, 'missingRaceIds', value);
    }
    return known;
  });
}

function filterKnownTroopUnlocks(values: unknown[], repairs: LoadGameRepairReport, category: keyof LoadGameRepairReport = 'missingTroopUnlockIds'): string[] {
  return values.filter((value): value is string => {
    const known = isKnownTroopUnlockId(value);
    if (!known) {
      addRepair(repairs, category, value);
    }
    return known;
  });
}

function filterKnownRaceUpgrades(values: unknown[], repairs: LoadGameRepairReport, category: keyof LoadGameRepairReport = 'missingUpgradeIds'): string[] {
  return values.filter((value): value is string => {
    const known = isKnownRaceUpgradeId(value);
    if (!known) {
      addRepair(repairs, category, value);
    }
    return known;
  });
}

function filterKnownTroopClassUpgrades(values: unknown[], repairs: LoadGameRepairReport, category: keyof LoadGameRepairReport = 'missingUpgradeIds'): string[] {
  return values.filter((value): value is string => {
    const known = isKnownTroopClassUpgradeId(value);
    if (!known) {
      addRepair(repairs, category, value);
    }
    return known;
  });
}

function filterKnownUpgrades(values: unknown[], repairs: LoadGameRepairReport, category: keyof LoadGameRepairReport = 'missingUpgradeIds'): string[] {
  return values.filter((value): value is string => {
    const known = isKnownUpgradeId(value);
    if (!known) {
      addRepair(repairs, category, value);
    }
    return known;
  });
}

function normalizeTroops(value: unknown, repairs: LoadGameRepairReport): TroopInstance[] {
  return arrayOrEmpty<TroopInstance>(value)
    .map(normalizeTroop)
    .filter((troop) => {
      const known = isKnownTroop(troop);
      if (!known) {
        addRepair(repairs, 'missingTroopInstanceIds', troop.id);
      }
      return known;
    });
}

function normalizeRift(rift: RiftInstance, repairs: LoadGameRepairReport): RiftInstance {
  return {
    ...rift,
    mutatorIds: arrayOrEmpty(rift.mutatorIds),
    enemyArmy: arrayOrEmpty<ResolvedCombatantDefinition>(rift.enemyArmy).filter((combatant) => {
      const known = isKnownCombatant(combatant);
      if (!known) {
        addRepair(repairs, 'missingRiftEnemyIds', combatant.label || combatant.combatantId || `${combatant.raceId}/${combatant.unitClassId}`);
      }
      return known;
    }),
    victoryPoints: numberOr(rift.victoryPoints, numberOr(rift.tier, 1)),
    saturation: numberOr(rift.saturation, 3),
    occupyingPlayerId: rift.occupyingPlayerId ?? null,
    occupyingTroopIds: arrayOrEmpty(rift.occupyingTroopIds),
  };
}

function normalizeTroopOffer(value: unknown, repairs: LoadGameRepairReport): TroopDraftOffer | null {
  if (!isObject(value)) {
    return null;
  }
  const optionTroopUnlockIds = filterKnownTroopUnlocks(arrayOrEmpty(value.optionTroopUnlockIds), repairs, 'missingDraftOptionIds');
  return optionTroopUnlockIds.length > 0 ? { kind: 'troop', optionTroopUnlockIds } : null;
}

function normalizeUpgradeOffer(value: unknown, repairs: LoadGameRepairReport): UpgradeDraftOffer | null {
  if (!isObject(value)) {
    return null;
  }
  const optionUpgradeIds = filterKnownUpgrades(arrayOrEmpty(value.optionUpgradeIds), repairs, 'missingDraftOptionIds');
  return optionUpgradeIds.length > 0 ? { kind: 'upgrade', optionUpgradeIds } : null;
}

function normalizeRaceUnlockOffer(value: unknown, repairs: LoadGameRepairReport): RaceUnlockOffer | null {
  if (!isObject(value)) {
    return null;
  }
  const optionRaceIds = filterKnownRaces(arrayOrEmpty(value.optionRaceIds), repairs);
  if (optionRaceIds.length === 0) {
    return null;
  }
  const upgradeIdsByRaceId: RaceUnlockOffer['upgradeIdsByRaceId'] = {};
  const rawUpgradeIdsByRaceId = isObject(value.upgradeIdsByRaceId) ? value.upgradeIdsByRaceId : {};
  optionRaceIds.forEach((raceId) => {
    upgradeIdsByRaceId[raceId] = filterKnownUpgrades(arrayOrEmpty(rawUpgradeIdsByRaceId[raceId]), repairs, 'missingDraftOptionIds');
  });

  const troopUnlockIdsByRaceId: RaceUnlockOffer['troopUnlockIdsByRaceId'] = {};
  const rawTroopUnlockIdsByRaceId = isObject(value.troopUnlockIdsByRaceId) ? value.troopUnlockIdsByRaceId : {};
  optionRaceIds.forEach((raceId) => {
    troopUnlockIdsByRaceId[raceId] = filterKnownTroopUnlocks(arrayOrEmpty(rawTroopUnlockIdsByRaceId[raceId]), repairs, 'missingDraftOptionIds');
  });

  return {
    kind: 'race_unlock',
    cycleNumber: numberOr(value.cycleNumber, 1),
    optionRaceIds,
    upgradeIdsByRaceId,
    troopUnlockChoiceCount: numberOr(value.troopUnlockChoiceCount, 1),
    troopUnlockIdsByRaceId,
  };
}

function normalizeTroopClassUnlockOffer(value: unknown, repairs: LoadGameRepairReport): TroopClassUnlockOffer | null {
  if (!isObject(value) || !isKnownRaceId(value.raceId)) {
    if (isObject(value)) {
      addRepair(repairs, 'missingDraftOptionIds', value.raceId);
    }
    return null;
  }
  const optionTroopUnlockIds = filterKnownTroopUnlocks(arrayOrEmpty(value.optionTroopUnlockIds), repairs, 'missingDraftOptionIds');
  return optionTroopUnlockIds.length > 0
    ? {
        kind: 'troop_class_unlock',
        cycleNumber: numberOr(value.cycleNumber, 1),
        raceId: value.raceId,
        remainingChoices: numberOr(value.remainingChoices, 1),
        optionTroopUnlockIds,
      }
    : null;
}

function normalizeReplayIndexEntry(entry: ReplayIndexEntry): ReplayIndexEntry {
  return {
    ...entry,
    playerTroopLabels: arrayOrEmpty(entry.playerTroopLabels),
    enemyTroopLabels: arrayOrEmpty(entry.enemyTroopLabels),
    mutatorIds: arrayOrEmpty(entry.mutatorIds),
    estimatedBytes: numberOr(entry.estimatedBytes, 0),
    replayId: entry.replayId ?? entry.id,
    summary: entry.summary ?? String(entry.outcome ?? 'battle').toUpperCase(),
  };
}

function normalizeContestPlayerState(value: unknown, repairs: LoadGameRepairReport): ContestPlayerState {
  const player = isObject(value) ? value : {};
  return {
    victoryPoints: numberOr(player.victoryPoints, 0),
    essence: numberOr(player.essence, 0),
    unlockedRaceIds: filterKnownRaces(arrayOrEmpty(player.unlockedRaceIds), repairs),
    unlockedTroopUnlockIds: filterKnownTroopUnlocks(arrayOrEmpty(player.unlockedTroopUnlockIds), repairs),
    recentTroopUnlockIds: filterKnownTroopUnlocks(arrayOrEmpty(player.recentTroopUnlockIds), repairs),
    troops: normalizeTroops(player.troops, repairs),
    raceUpgradeIds: filterKnownRaceUpgrades(arrayOrEmpty(player.raceUpgradeIds), repairs),
    troopClassUpgradeIds: filterKnownTroopClassUpgrades(arrayOrEmpty(player.troopClassUpgradeIds), repairs),
    activeTroopOffer: normalizeTroopOffer(player.activeTroopOffer, repairs),
    activeUpgradeOffer: normalizeUpgradeOffer(player.activeUpgradeOffer, repairs),
    activeRaceUnlockOffer: normalizeRaceUnlockOffer(player.activeRaceUnlockOffer, repairs),
    activeTroopClassUnlockOffer: normalizeTroopClassUnlockOffer(player.activeTroopClassUnlockOffer, repairs),
    troopOfferRolls: numberOr(player.troopOfferRolls, 0),
    upgradeOfferRolls: numberOr(player.upgradeOfferRolls, 0),
  };
}

function normalizeContestState(value: unknown, repairs: LoadGameRepairReport): ContestState {
  const contest = isObject(value) ? value : {};
  const players = isObject(contest.players) ? contest.players : {};
  const opponentInfo = isObject(contest.opponentInfo) ? contest.opponentInfo : null;
  return {
    players: {
      ai: normalizeContestPlayerState(players.ai, repairs),
    },
    opponentInfo: opponentInfo
      ? {
          ...opponentInfo,
          cycleNumber: numberOr(opponentInfo.cycleNumber, 0),
          ai: normalizeContestPlayerState(opponentInfo.ai, repairs),
        }
      : null,
  };
}

function normalizeLadderState(value: unknown): LadderState {
  const ladder = isObject(value) ? value : {};
  return {
    currentRiftSetId: typeof ladder.currentRiftSetId === 'string' ? ladder.currentRiftSetId : null,
    currentGeneration: typeof ladder.currentGeneration === 'number' && Number.isFinite(ladder.currentGeneration) ? ladder.currentGeneration : null,
    currentSourceCycleNumber:
      typeof ladder.currentSourceCycleNumber === 'number' && Number.isFinite(ladder.currentSourceCycleNumber)
        ? ladder.currentSourceCycleNumber
        : null,
  };
}

function normalizeGameState(parsed: Partial<GameState>, repairs: LoadGameRepairReport): GameState {
  const activeRaceUnlockOffer = normalizeRaceUnlockOffer(parsed.activeRaceUnlockOffer, repairs);
  const activeTroopClassUnlockOffer = normalizeTroopClassUnlockOffer(parsed.activeTroopClassUnlockOffer, repairs);
  const phase = phaseOr(parsed.phase);
  const repairedPhase =
    (phase === 'race_unlock' && !activeRaceUnlockOffer) || (phase === 'troop_class_unlock' && !activeTroopClassUnlockOffer)
      ? 'planning'
      : phase;
  const gameMode = gameModeOr(parsed.gameMode);

  return {
    ...parsed,
    version: 3,
    gameMode,
    campaignSeed: numberOr(parsed.campaignSeed, 1),
    cycleNumber: numberOr(parsed.cycleNumber, 1),
    phase: repairedPhase,
    essence: numberOr(parsed.essence, 0),
    victoryPoints: numberOr(parsed.victoryPoints, 0),
    unlockedRaceIds: filterKnownRaces(arrayOrEmpty(parsed.unlockedRaceIds), repairs),
    unlockedTroopUnlockIds: filterKnownTroopUnlocks(arrayOrEmpty(parsed.unlockedTroopUnlockIds), repairs),
    recentTroopUnlockIds: filterKnownTroopUnlocks(arrayOrEmpty(parsed.recentTroopUnlockIds), repairs),
    troops: normalizeTroops(parsed.troops, repairs),
    raceUpgradeIds: filterKnownRaceUpgrades(arrayOrEmpty(parsed.raceUpgradeIds), repairs),
    troopClassUpgradeIds: filterKnownTroopClassUpgrades(arrayOrEmpty(parsed.troopClassUpgradeIds), repairs),
    activeTroopOffer: normalizeTroopOffer(parsed.activeTroopOffer, repairs),
    activeUpgradeOffer: normalizeUpgradeOffer(parsed.activeUpgradeOffer, repairs),
    activeRaceUnlockOffer,
    activeTroopClassUnlockOffer,
    troopOfferRolls: numberOr(parsed.troopOfferRolls, 0),
    upgradeOfferRolls: numberOr(parsed.upgradeOfferRolls, 0),
    postgameDismissed: parsed.postgameDismissed === true,
    openRifts: arrayOrEmpty<RiftInstance>(parsed.openRifts).map((rift) => normalizeRift(rift, repairs)),
    replayIndex: arrayOrEmpty<ReplayIndexEntry>(parsed.replayIndex).map(normalizeReplayIndexEntry),
    ...(gameMode === 'contest' ? { contest: normalizeContestState(parsed.contest, repairs) } : {}),
    ...(gameMode === 'ladder' ? { ladder: normalizeLadderState(parsed.ladder) } : {}),
  };
}

export function deserializeGameState(json: string): LoadGameResult {
  try {
    const parsed = JSON.parse(json) as Partial<GameState>;
    if (!parsed || parsed.version !== 3) {
      return { ok: false, error: 'unsupported_version' };
    }
    if (
      !Array.isArray(parsed.troops) ||
      !Array.isArray(parsed.openRifts) ||
      !Array.isArray(parsed.replayIndex) ||
      !Array.isArray(parsed.unlockedRaceIds) ||
      !Array.isArray(parsed.unlockedTroopUnlockIds)
    ) {
      return { ok: false, error: 'invalid_shape' };
    }
    const repairs = makeRepairReport();
    const state = normalizeGameState(parsed, repairs);
    return {
      ok: true,
      state,
      ...(hasRepairs(repairs) ? { repairs } : {}),
    };
  } catch {
    return { ok: false, error: 'invalid_json' };
  }
}
