export type UnitClassId = string;
export type RaceId = string;
export type TroopId = string;
export type UpgradeId = string;
export type AbilityId = string;
export type MutatorId = string;
export type RoleId = 'frontline' | 'pusher' | 'backline';
export type RoleIntentId =
  | 'screen-frontline'
  | 'fallback-backline'
  | 'breach-backline'
  | 'hold-backline'
  | 'retreat-range'
  | 'advance-range';
export type SideId = 'player' | 'enemy';
export type TroopUnlockId = string;
export type TroopStatKey = 'health' | 'damage' | 'rate' | 'move' | 'armor' | 'range' | 'capacity';
export type ExplainedStatKey = TroopStatKey | 'size';
export type AbilityTiming =
  | 'startOfBattle'
  | 'startOfTurn'
  | 'endOfTurn'
  | 'onAttack'
  | 'onKill'
  | 'onDeath'
  | 'onDamaged'
  | 'onFallen'
  | 'onEffectApplied'
  | 'passive';
export type AbilityAllegiance = 'ally' | 'enemy' | 'all';
export type AbilityMagnitudeMode = 'flat' | 'percent';
export type CampaignPhase = 'opening_unlock' | 'race_unlock' | 'troop_class_unlock' | 'planning' | 'game_over';
export type RiftState = 'discovered' | 'resolved_victory' | 'resolved_defeat' | 'expired';
export type BattleOutcome = 'victory' | 'defeat' | 'draw';
export type EffectDisposition = 'beneficial' | 'harmful' | 'neutral';
export type GameMode = 'campaign' | 'contest' | 'ladder';
export type ContestPlayerId = 'playerOne' | 'playerTwo';
export type ContestRiftController = 'neutral' | ContestPlayerId;
export type LadderCompatibilityStatus = 'valid' | 'incompatible';

export interface HexCoord {
  q: number;
  r: number;
}

export interface UnitStats {
  health: number;
  damage: number;
  rate: number;
  move: number;
  range: number;
  armor: number;
  size: number;
  capacity: number;
}

export interface AbilityTriggerDefinition {
  timing: AbilityTiming;
  chargeEvery?: number;
  maxUses?: number;
  condition?: 'forsaken';
  repeatPerDistinctFriendlyTroopClass?: boolean;
  repeatPerDistinctFriendlyTroop?: boolean;
  repeatPerTouchingFriendlyUnit?: boolean;
  fallen?: {
    allegiance: AbilityAllegiance;
    radius: number;
    radiusSource?: 'selfRange';
  };
  effectApplication?: {
    effectKinds?: string[];
    dispositions?: EffectDisposition[];
  };
}

export interface AbilityTargetFilters {
  notClasses?: string[];
  onlyClasses?: string[];
  prioritizeClasses?: string[];
  unengaged?: boolean;
}

export interface AbilityTargetDefinition {
  mode: 'default' | 'self' | 'random' | 'aoe';
  allegiance?: AbilityAllegiance;
  radius?: number;
  radiusSource?: 'selfRange';
  filters?: AbilityTargetFilters;
}

export type AbilityDurationDefinition =
  | {
      kind: 'instant';
    }
  | {
      kind: 'battle';
    }
  | {
      kind: 'turns';
      turns: number;
    };

type EffectWithDisposition<T> = T & {
  disposition?: EffectDisposition;
};

export type AbilityEffectDefinition =
  | EffectWithDisposition<{
      kind: 'blast';
      amount: number;
    }>
  | EffectWithDisposition<{
      kind: 'bolster' | 'haste' | 'heal' | 'ramp';
      amount: number;
      mode: AbilityMagnitudeMode;
    }>
  | EffectWithDisposition<{
      kind: 'statDelta';
      stat: TroopStatKey;
      amount: number;
      mode: AbilityMagnitudeMode;
    }>
  | EffectWithDisposition<{
      kind: 'rangeset';
      value: number;
    }>
  | EffectWithDisposition<{
      kind: 'roleset';
      role: RoleId;
    }>
  | EffectWithDisposition<{
      kind: 'readinessSet';
      value: number;
    }>
  | EffectWithDisposition<{
      kind: 'readinessDelta';
      amount: number;
    }>
  | EffectWithDisposition<{
      kind: 'grantAbility';
      abilityId: AbilityId;
    }>
  | EffectWithDisposition<{
      kind: 'strike';
      amount: number;
    }>
  | EffectWithDisposition<{
      kind: 'summon';
      unitClassId: UnitClassId;
      count: number;
      consumeFallenUnitCorpse?: boolean;
      grantedAbilityIds?: AbilityId[];
      initialReadiness?: number;
    }>
  | EffectWithDisposition<{
      kind: 'redirect';
      allowAlreadyEngaged?: boolean;
    }>;

export interface AbilityDefinition {
  id: AbilityId;
  label: string;
  trigger: AbilityTriggerDefinition;
  duration: AbilityDurationDefinition;
  target?: AbilityTargetDefinition;
  effects: AbilityEffectDefinition[];
  overworldEffectId?: 'united';
  shortText: string;
}

export interface UnitClassDefinition {
  id: UnitClassId;
  label: string;
  role: RoleId;
  unitClassTag: string;
  attributes: string[];
  stats: UnitStats;
  quantity: number;
  cost: number;
  abilityIds: AbilityId[];
}

export interface RaceDefinition {
  id: RaceId;
  label: string;
  singularLabel: string;
  addedAttributes: string[];
  statAdjustments: Partial<Record<keyof UnitStats | 'cost', { flat?: number; multiplier?: number }>>;
  abilityIds: AbilityId[];
}

export interface RaceUpgradeDefinition {
  id: UpgradeId;
  raceId: RaceId;
  label: string;
  tier: 1 | 2 | 3;
  description: string;
  effects: Array<
    | {
        kind: 'addAbility';
        abilityId: AbilityId;
      }
    | {
        kind: 'addAttribute';
        attribute: string;
      }
    | {
        kind: 'modifyStats';
        statModifiers: Partial<Record<TroopStatKey, { flat?: number; multiplier?: number }>>;
        unitFilter?: 'nonMelee';
      }
  >;
}

export interface TroopClassUpgradeDefinition {
  id: UpgradeId;
  unitClassId: UnitClassId;
  label: string;
  tier: 1 | 2 | 3;
  description: string;
  effects: Array<
    | {
        kind: 'addAbility';
        abilityId: AbilityId;
      }
    | {
        kind: 'replaceAbility';
        removeAbilityId: AbilityId;
        addAbilityId: AbilityId;
      }
    | {
        kind: 'addAttribute';
        attribute: string;
      }
    | {
        kind: 'removeAttribute';
        attribute: string;
      }
    | {
        kind: 'setRole';
        role: RoleId;
      }
    | {
        kind: 'modifyStats';
        statModifiers: Partial<Record<TroopStatKey, { flat?: number; multiplier?: number }>>;
      }
  >;
}

export interface TroopDefinition {
  id: string;
  raceId: RaceId;
  unitClassId: UnitClassId;
  label: string;
  role: RoleId;
  unitClassTag: string;
  attributes: string[];
  stats: UnitStats;
  quantity: number;
  cost: number;
  abilities: AbilityDefinition[];
}

export interface TroopInstance {
  id: TroopId;
  raceId: RaceId;
  unitClassId: UnitClassId;
  recoveryCyclesRemaining: number;
  assignmentRiftId: string | null;
}

export interface ResolvedCombatantDefinition {
  combatantId: string;
  raceId: RaceId;
  unitClassId: UnitClassId;
  troopInstanceId: TroopId | null;
  label: string;
  role: RoleId;
  unitClassTag: string;
  attributes: string[];
  stats: UnitStats;
  abilities: AbilityDefinition[];
  quantity: number;
  cost: number;
  side: SideId;
  statBreakdowns?: Record<ExplainedStatKey, StatBreakdown>;
}

export interface BattleInput {
  seed: number;
  riftId: string | null;
  tier: number | null;
  mutatorIds: MutatorId[];
  sideParticipants?: BattleSideParticipants;
  playerRaceUpgradeIds?: UpgradeId[];
  playerTroopClassUpgradeIds?: UpgradeId[];
  enemyRaceUpgradeIds?: UpgradeId[];
  enemyTroopClassUpgradeIds?: UpgradeId[];
  playerCombatants: ResolvedCombatantDefinition[];
  enemyCombatants: ResolvedCombatantDefinition[];
}

export type BattleParticipantKind = 'player' | 'opponent' | 'neutral';

export interface BattleSideParticipant {
  kind: BattleParticipantKind;
  label: string;
  playerId?: ContestPlayerId;
}

export interface BattleSideParticipants {
  player: BattleSideParticipant;
  enemy: BattleSideParticipant;
}

export interface BattleUnit {
  id: string;
  troopInstanceId: TroopId | null;
  troopId: string;
  troopLabel: string;
  unitClassId: UnitClassId;
  raceId: RaceId;
  side: SideId;
  role: RoleId;
  unitClassTag: string;
  attributes: string[];
  position: HexCoord;
  occupiedHexes: HexCoord[];
  footprintOrientation: 'north' | 'south';
  stats: UnitStats;
  hp: number;
  maxHp: number;
  readiness: number;
  alive: boolean;
  engagedWithIds: string[];
}

export interface BattleStateSnapshot {
  units: BattleUnit[];
}

export type BattleStepKind = 'beat' | 'move' | 'engage' | 'attack' | 'death' | 'heal' | 'buff';

export interface BattleBeatExplanation {
  beat: number;
  readinessBonus: number;
  readinessPurposeHint?: string;
}

export interface BattleMovementExplanation {
  stepKind: 'move' | 'engage';
  movementKind: 'objective' | 'retreat' | 'ability' | 'generic';
  movementPhase?: 'approach' | 'commit' | 'withdraw' | 'ability' | 'generic';
  unitRole?: RoleId;
  roleIntent?: RoleIntentId;
  reasonCode?: string;
  targetRole?: RoleId;
  targetHex?: HexCoord;
  destination?: HexCoord;
  routedAroundBlockedHex?: HexCoord;
  keepEnemyInRange?: boolean;
}

export interface BattleAbilityExplanation {
  abilityId: string;
  abilityLabel?: string;
  effect?: string;
}

export interface BattleDamageExplanation {
  mode: 'melee' | 'ranged' | 'blast';
  category: 'normal' | 'retaliation' | 'strike';
  baseDamage: number;
  attackDamageBeforeArmor: number;
  finalDamage: number;
  heartseekerMultiplier?: number;
  distanceBonus?: number;
  armorBefore?: number;
  armorReduction?: number;
  armorApplied?: number;
  armorInteraction: 'normal' | 'ignored';
  rangedMultiplier?: number;
}

export interface BattleHpLossExplanation {
  amount: number;
  reason: string;
  bypassesArmor: boolean;
  triggersOnDamaged: boolean;
}

export interface BattleStepExplanation {
  beat?: BattleBeatExplanation;
  movement?: BattleMovementExplanation;
  ability?: BattleAbilityExplanation;
  damage?: BattleDamageExplanation;
  hpLoss?: BattleHpLossExplanation;
}

export interface BattleStepMetadata {
  activeUnitId?: string;
  secondaryUnitIds?: string[];
  roleIntent?: RoleIntentId;
  reasonCode?: string;
  targetRole?: RoleId;
  targetHexQ?: number;
  targetHexR?: number;
  damage?: number;
  hpLoss?: number;
  mode?: 'melee' | 'ranged' | 'blast';
  category?: 'normal' | 'retaliation' | 'strike';
  beat?: number;
  readinessBonus?: number;
  effect?: string;
  sourceAbilityId?: string;
  sourceAbilityLabel?: string;
  sourceKind?: 'ability' | 'mutator' | 'battle';
  value?: number;
  amount?: number;
  baseDamage?: number;
  attackDamageBeforeArmor?: number;
  armorIgnored?: boolean;
  armorBefore?: number;
  armorReduction?: number;
  armorApplied?: number;
  heartseekerMultiplier?: number;
  distanceBonus?: number;
  rangedMultiplier?: number;
  damageMultiplier?: number;
  throwingAxesDamage?: number;
  hexingShotsDamage?: number;
  stat?: string;
  temporary?: boolean;
  expired?: boolean;
  abilityId?: string;
  role?: RoleId;
  unitClassId?: UnitClassId;
  batchCount?: number;
  toQ?: number;
  toR?: number;
  routedAroundBlockedQ?: number;
  routedAroundBlockedR?: number;
  explanation?: BattleStepExplanation;
  extra?: Record<string, unknown>;
}

export interface BattleStep {
  index: number;
  kind: BattleStepKind;
  actorIds: string[];
  targetIds: string[];
  message: string;
  snapshot: BattleStateSnapshot;
  metadata?: BattleStepMetadata;
}

export interface BattleReplay {
  id: string;
  seed: number;
  riftId: string | null;
  tier: number | null;
  mutatorIds: MutatorId[];
  mapRadius: number;
  mapHexes: HexCoord[];
  initial: BattleStateSnapshot;
  steps: BattleStep[];
  outcome: BattleOutcome;
  troopLabels: Record<string, string>;
  troopProfiles: ReplayTroopProfile[];
  aliveCounts: Array<{
    player: number;
    enemy: number;
    byTroopLabel: Record<string, number>;
  }>;
  summary: {
    playerTroops: string[];
    enemyTroops: string[];
    finalPlayerAlive: number;
    finalEnemyAlive: number;
  };
}

export interface StatBreakdownLine {
  label: string;
  value: number;
  kind: 'base' | 'delta' | 'set';
}

export interface StatBreakdown {
  stat: ExplainedStatKey | 'quantity';
  finalValue: number;
  lines: StatBreakdownLine[];
}

export interface ReplayTroopProfile {
  side: SideId;
  troopLabel: string;
  unitClassId: UnitClassId;
  raceId: RaceId;
  role: RoleId;
  unitClassTag: string;
  attributes: string[];
  stats: UnitStats;
  abilities: AbilityDefinition[];
  statBreakdowns: Partial<Record<ExplainedStatKey, StatBreakdown>>;
}

export interface StoredReplayPayload {
  version: 1;
  input: BattleInput;
}

export type BattleReportDiagnosticSeverity = 'info' | 'warning' | 'error';

export type BattleReportDiagnosticSource = 'renderer' | 'assets' | 'ui';

export interface BattleReportDiagnostic {
  source: BattleReportDiagnosticSource;
  severity: BattleReportDiagnosticSeverity;
  code: string;
  message: string;
  replayId?: string | null;
  step?: number | null;
  textureKey?: string;
  assetUrl?: string;
  details?: Record<string, string | number | boolean | null>;
}

export interface BattleReportPayload {
  version: 1;
  reportId: string;
  createdAt: string;
  app: {
    name: 'shiftmake';
    version: string;
    buildMode?: string;
  };
  replay: StoredReplayPayload;
  summary: {
    replayId: string;
    riftId: string | null;
    seed: number;
    tier: number | null;
    cycleNumber: number | null;
    outcome: BattleOutcome;
    playerTroopLabels: string[];
    enemyTroopLabels: string[];
    mutatorIds: MutatorId[];
    stepCount: number;
    currentStep?: number;
  };
  diagnostics: BattleReportDiagnostic[];
}

export interface CampaignReportUiContext {
  screen: 'main_menu' | 'overworld' | 'replay';
  centerMode: 'rifts' | 'troops' | 'contest';
  selectedRiftId: string | null;
  selectedTroopId: TroopId | null;
  selectedReplayId: string | null;
  currentReplayStep: number | null;
  systemMessage: string | null;
  validationMessages: string[];
}

export interface CampaignReportPayload {
  version: 1;
  reportId: string;
  createdAt: string;
  app: {
    name: 'shiftmake';
    version: string;
    buildMode?: string;
  };
  game: GameState;
  replayPayloads: Record<string, StoredReplayPayload>;
  missingReplayIds: string[];
  uiContext: CampaignReportUiContext;
  summary: {
    campaignSeed: number;
    cycleNumber: number;
    phase: CampaignPhase;
    victoryPoints: number;
    troopCount: number;
    riftCount: number;
    replayIndexCount: number;
    replayPayloadCount: number;
    missingReplayCount: number;
  };
}

export interface ReplayIndexEntry {
  id: string;
  riftId: string | null;
  riftLabel?: string;
  cycleNumber: number;
  battleSeed: number;
  outcome: BattleOutcome;
  encounterLabel?: string;
  sideParticipants?: BattleSideParticipants;
  playerTroopLabels: string[];
  enemyTroopLabels?: string[];
  mutatorIds: MutatorId[];
  summary: string;
  replayId: string;
  estimatedBytes: number;
  finalPlayerAlive?: number;
  finalEnemyAlive?: number;
  finalPlayerHp?: number;
  finalPlayerMaxHp?: number;
  finalEnemyHp?: number;
  finalEnemyMaxHp?: number;
  summaryOnly?: boolean;
  resultDrift?: {
    checkedAt: string;
    originalSummary: string;
    currentSummary: string;
    currentOutcome: BattleOutcome;
    currentFinalPlayerAlive: number;
    currentFinalEnemyAlive: number;
  };
}

export interface TroopDraftOffer {
  kind: 'troop';
  optionTroopUnlockIds: TroopUnlockId[];
}

export interface UpgradeDraftOffer {
  kind: 'upgrade';
  optionUpgradeIds: UpgradeId[];
}

export interface RaceUnlockOffer {
  kind: 'race_unlock';
  cycleNumber: number;
  optionRaceIds: RaceId[];
  upgradeIdsByRaceId: Record<RaceId, UpgradeId[]>;
  troopUnlockChoiceCount: number;
  troopUnlockIdsByRaceId: Record<RaceId, TroopUnlockId[]>;
}

export interface TroopClassUnlockOffer {
  kind: 'troop_class_unlock';
  cycleNumber: number;
  raceId: RaceId;
  remainingChoices: number;
  optionTroopUnlockIds: TroopUnlockId[];
}

export interface RiftInstance {
  id: string;
  cycleNumber: number;
  seed: number;
  tier: number;
  mutatorIds: MutatorId[];
  enemyArmy: ResolvedCombatantDefinition[];
  enemyRaceUpgradeIds?: UpgradeId[];
  enemyTroopClassUpgradeIds?: UpgradeId[];
  victoryPoints: number;
  state: RiftState;
  controller?: ContestRiftController;
  occupyingPlayerId?: ContestPlayerId | null;
  occupyingTroopIds?: TroopId[];
}

export interface LadderGuardianSnapshot {
  raceId: RaceId;
  unitClassId: UnitClassId;
  raceUpgradeIds: UpgradeId[];
  troopClassUpgradeIds: UpgradeId[];
}

export interface LadderRiftPayload {
  id: string;
  cycleNumber: number;
  seed: number;
  tier: number;
  mutatorIds: MutatorId[];
  victoryPoints: number;
  guardians: LadderGuardianSnapshot[];
}

export interface LadderRiftSetPayload {
  version: 1;
  rifts: LadderRiftPayload[];
}

export interface LadderCompatibilityIssue {
  code:
    | 'invalid_payload'
    | 'invalid_cycle'
    | 'invalid_rift'
    | 'invalid_tier'
    | 'invalid_victory_points'
    | 'unknown_race'
    | 'unknown_unit_class'
    | 'unknown_race_upgrade'
    | 'unknown_troop_class_upgrade'
    | 'unknown_mutator'
    | 'missing_guardians';
  message: string;
  path: string;
  value?: string | number | boolean | null;
}

export interface LadderDrawResult {
  id: string;
  cycleNumber: number;
  generation: number;
  sourceSetId: string | null;
  payload: LadderRiftSetPayload;
}

export interface LadderHarvestResult {
  parentId: string;
  childId: string;
  parentSpent: boolean;
  payload: LadderRiftSetPayload;
}

export interface LadderState {
  currentRiftSetId: string | null;
  currentGeneration: number | null;
  currentSourceCycleNumber: number | null;
}

export interface ContestPlayerState {
  victoryPoints: number;
  essence: number;
  unlockedRaceIds: RaceId[];
  unlockedTroopUnlockIds: TroopUnlockId[];
  recentTroopUnlockIds: TroopUnlockId[];
  troops: TroopInstance[];
  raceUpgradeIds: UpgradeId[];
  troopClassUpgradeIds: UpgradeId[];
  activeTroopOffer: TroopDraftOffer | null;
  activeUpgradeOffer: UpgradeDraftOffer | null;
  activeRaceUnlockOffer: RaceUnlockOffer | null;
  activeTroopClassUnlockOffer: TroopClassUnlockOffer | null;
  troopOfferRolls: number;
  upgradeOfferRolls: number;
}

export interface ContestState {
  players: {
    playerOne: ContestPlayerState;
    playerTwo: ContestPlayerState;
  };
  opponentInfo: ContestOpponentInfoSnapshot | null;
}

export interface ContestOpponentInfoSnapshot {
  cycleNumber: number;
  playerTwo: ContestPlayerState;
}

export interface GameState {
  version: 3;
  gameMode: GameMode;
  campaignSeed: number;
  cycleNumber: number;
  phase: CampaignPhase;
  essence: number;
  victoryPoints: number;
  unlockedRaceIds: RaceId[];
  unlockedTroopUnlockIds: TroopUnlockId[];
  recentTroopUnlockIds: TroopUnlockId[];
  troops: TroopInstance[];
  raceUpgradeIds: UpgradeId[];
  troopClassUpgradeIds: UpgradeId[];
  activeTroopOffer: TroopDraftOffer | null;
  activeUpgradeOffer: UpgradeDraftOffer | null;
  activeRaceUnlockOffer: RaceUnlockOffer | null;
  activeTroopClassUnlockOffer: TroopClassUnlockOffer | null;
  troopOfferRolls: number;
  upgradeOfferRolls: number;
  postgameDismissed: boolean;
  openRifts: RiftInstance[];
  replayIndex: ReplayIndexEntry[];
  contest?: ContestState;
  ladder?: LadderState;
}

export interface ValidationIssue {
  kind:
    | 'troop_recovering'
    | 'duplicate_assignment'
    | 'same_race_conflict'
    | 'same_class_conflict'
    | 'no_troops_assigned'
    | 'idle_troops_remaining'
    | 'holding_only_no_new_attack'
    | 'invalid_phase'
    | 'unknown_troop'
    | 'unknown_rift'
    | 'own_rift'
    | 'holding_troop_locked';
  message: string;
  troopId?: TroopId;
  conflictTroopId?: TroopId;
  riftId?: string;
}

export interface ValidationResult {
  ok: boolean;
  issues: ValidationIssue[];
}

export interface RiftResolutionRecord {
  riftId: string;
  assignedTroopIds: TroopId[];
  battleInput: BattleInput;
  replay: BattleReplay;
  outcome: BattleOutcome;
  victoryPoints: number;
  recoveryMap: Record<TroopId, number>;
  contest?: {
    kind: 'guardian' | 'pvp' | 'occupation';
    attackerId?: ContestPlayerId;
    winnerId?: ContestPlayerId | null;
    defenderId?: ContestPlayerId | 'neutral';
  };
}

export interface CycleResolution {
  records: RiftResolutionRecord[];
  preparedState?: GameState;
}

export interface ReplayPayloadWrite {
  replayId: string;
  replay: StoredReplayPayload;
  estimatedBytes: number;
}

export interface ReplayPayloadDelete {
  replayId: string;
}

export interface ApplyCycleOutcomeResult {
  nextState: GameState;
  replayPayloadWrites: ReplayPayloadWrite[];
  replayPayloadDeletes: ReplayPayloadDelete[];
  newlyUnlockedTroopUnlockIds: TroopUnlockId[];
}

export interface LoadGameResult {
  ok: boolean;
  state?: GameState;
  repairs?: LoadGameRepairReport;
  error?: 'unsupported_version' | 'invalid_json' | 'invalid_shape';
}

export interface LoadGameRepairReport {
  missingRaceIds: string[];
  missingTroopUnlockIds: string[];
  missingTroopInstanceIds: string[];
  missingUpgradeIds: string[];
  missingRiftEnemyIds: string[];
  missingDraftOptionIds: string[];
}

export interface MutatorDefinition {
  id: MutatorId;
  label: string;
  description: string;
  readinessBonusPerBeat?: number;
  rangedDamageMultiplier?: number;
  armorCap?: number;
  randomMoveEveryBeats?: number;
  hpLossPerBeat?: number;
}
