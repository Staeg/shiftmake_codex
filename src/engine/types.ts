export type UnitTypeId = string;
export type FactionId = string;
export type TroopId = string;
export type TroopTypeId = string;
export type UpgradeId = string;
export type AbilityId = string;
export type MutatorId = string;
export type RoleId = 'frontline' | 'chaff' | 'backline';
export type RoleIntentId =
  | 'screen-frontline'
  | 'fallback-backline'
  | 'breach-backline'
  | 'hold-backline'
  | 'retreat-range'
  | 'advance-range';
export type SideId = 'player' | 'enemy';
export type TroopUnlockId = string;
export type TroopStatKey = 'health' | 'damage' | 'speed' | 'armor' | 'range' | 'capacity';
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
export type CampaignPhase = 'opening_unlock' | 'faction_unlock' | 'troop_type_unlock' | 'planning' | 'game_over';
export type RiftState = 'discovered' | 'resolved_victory' | 'resolved_defeat' | 'expired';
export type BattleOutcome = 'victory' | 'defeat' | 'draw';
export type EffectDisposition = 'beneficial' | 'harmful' | 'neutral';
export type GameMode = 'campaign' | 'contest' | 'ladder';
export type ContestPlayerId = 'human' | 'ai';
export type ContestRiftController = 'neutral' | ContestPlayerId;
export type LadderCompatibilityStatus = 'valid' | 'incompatible';

export interface HexCoord {
  q: number;
  r: number;
}

export interface UnitStats {
  health: number;
  damage: number;
  speed: number;
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
  repeatPerDistinctFriendlyTroopType?: boolean;
  repeatPerOtherFriendlyUnitOnHex?: boolean;
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
  notTypes?: string[];
  onlyTypes?: string[];
  prioritizeTypes?: string[];
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
      kind: 'initiativeSet';
      value: number;
    }>
  | EffectWithDisposition<{
      kind: 'initiativeDelta';
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
      unitTypeId: UnitTypeId;
      count: number;
      consumeFallenUnitCorpse?: boolean;
      grantedAbilityIds?: AbilityId[];
      initialInitiative?: number;
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

export interface UnitTypeDefinition {
  id: UnitTypeId;
  label: string;
  role: RoleId;
  type: string;
  attributes: string[];
  stats: UnitStats;
  quantity: number;
  cost: number;
  abilityIds: AbilityId[];
}

export interface FactionDefinition {
  id: FactionId;
  label: string;
  singularLabel: string;
  addedAttributes: string[];
  statAdjustments: Partial<Record<keyof UnitStats | 'cost', { flat?: number; multiplier?: number }>>;
  abilityIds: AbilityId[];
}

export interface FactionUpgradeDefinition {
  id: UpgradeId;
  factionId: FactionId;
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

export interface TroopTypeUpgradeDefinition {
  id: UpgradeId;
  unitTypeId: UnitTypeId;
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
        kind: 'modifyStats';
        statModifiers: Partial<Record<TroopStatKey, { flat?: number; multiplier?: number }>>;
      }
  >;
}

export interface TroopDefinition {
  id: string;
  factionId: FactionId;
  unitTypeId: UnitTypeId;
  label: string;
  role: RoleId;
  type: string;
  attributes: string[];
  stats: UnitStats;
  quantity: number;
  cost: number;
  abilities: AbilityDefinition[];
}

export interface TroopInstance {
  id: TroopId;
  factionId: FactionId;
  unitTypeId: UnitTypeId;
  recoveryCyclesRemaining: number;
  assignmentRiftId: string | null;
}

export interface ResolvedCombatantDefinition {
  combatantId: string;
  factionId: FactionId;
  unitTypeId: UnitTypeId;
  troopInstanceId: TroopId | null;
  label: string;
  role: RoleId;
  type: string;
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
  saturation?: number;
  sideParticipants?: BattleSideParticipants;
  playerFactionUpgradeIds?: UpgradeId[];
  playerTroopTypeUpgradeIds?: UpgradeId[];
  enemyFactionUpgradeIds?: UpgradeId[];
  enemyTroopTypeUpgradeIds?: UpgradeId[];
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
  unitTypeId: UnitTypeId;
  factionId: FactionId;
  side: SideId;
  role: RoleId;
  type: string;
  attributes: string[];
  position: HexCoord;
  stats: UnitStats;
  hp: number;
  maxHp: number;
  initiative: number;
  alive: boolean;
  engagedWithIds: string[];
}

export interface BattleStateSnapshot {
  units: BattleUnit[];
}

export type BattleStepKind = 'beat' | 'move' | 'engage' | 'attack' | 'death' | 'heal' | 'buff';

export interface BattleBeatExplanation {
  beat: number;
  initiativeBonus: number;
  initiativePurposeHint?: string;
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

export interface BattleStepExplanation {
  beat?: BattleBeatExplanation;
  movement?: BattleMovementExplanation;
  ability?: BattleAbilityExplanation;
  damage?: BattleDamageExplanation;
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
  mode?: 'melee' | 'ranged' | 'blast';
  category?: 'normal' | 'retaliation' | 'strike';
  beat?: number;
  initiativeBonus?: number;
  effect?: string;
  sourceAbilityId?: string;
  sourceAbilityLabel?: string;
  value?: number;
  toQ?: number;
  toR?: number;
  explanation?: BattleStepExplanation;
  [key: string]: number | string | string[] | boolean | BattleStepExplanation | undefined;
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
  saturation: number;
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
  unitTypeId: UnitTypeId;
  factionId: FactionId;
  role: RoleId;
  type: string;
  attributes: string[];
  stats: UnitStats;
  abilities: AbilityDefinition[];
  statBreakdowns: Record<ExplainedStatKey, StatBreakdown>;
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

export interface FactionUnlockOffer {
  kind: 'faction_unlock';
  cycleNumber: number;
  optionFactionIds: FactionId[];
  upgradeIdsByFactionId: Record<FactionId, UpgradeId[]>;
  troopUnlockChoiceCount: number;
  troopUnlockIdsByFactionId: Record<FactionId, TroopUnlockId[]>;
}

export interface TroopTypeUnlockOffer {
  kind: 'troop_type_unlock';
  cycleNumber: number;
  factionId: FactionId;
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
  enemyFactionUpgradeIds?: UpgradeId[];
  enemyTroopTypeUpgradeIds?: UpgradeId[];
  victoryPoints: number;
  saturation: number;
  state: RiftState;
  controller?: ContestRiftController;
  occupyingPlayerId?: ContestPlayerId | null;
  occupyingTroopIds?: TroopId[];
}

export interface LadderGuardianSnapshot {
  factionId: FactionId;
  unitTypeId: UnitTypeId;
  factionUpgradeIds: UpgradeId[];
  troopTypeUpgradeIds: UpgradeId[];
}

export interface LadderRiftPayload {
  id: string;
  cycleNumber: number;
  seed: number;
  tier: number;
  mutatorIds: MutatorId[];
  saturation: number;
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
    | 'invalid_saturation'
    | 'invalid_victory_points'
    | 'unknown_faction'
    | 'unknown_unit_type'
    | 'unknown_faction_upgrade'
    | 'unknown_troop_type_upgrade'
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
  unlockedFactionIds: FactionId[];
  unlockedTroopUnlockIds: TroopUnlockId[];
  recentTroopUnlockIds: TroopUnlockId[];
  troops: TroopInstance[];
  factionUpgradeIds: UpgradeId[];
  troopTypeUpgradeIds: UpgradeId[];
  activeTroopOffer: TroopDraftOffer | null;
  activeUpgradeOffer: UpgradeDraftOffer | null;
  activeFactionUnlockOffer: FactionUnlockOffer | null;
  activeTroopTypeUnlockOffer: TroopTypeUnlockOffer | null;
  troopOfferRolls: number;
  upgradeOfferRolls: number;
}

export interface ContestState {
  players: {
    ai: ContestPlayerState;
  };
  opponentInfo: ContestOpponentInfoSnapshot | null;
}

export interface ContestOpponentInfoSnapshot {
  cycleNumber: number;
  ai: ContestPlayerState;
}

export interface GameState {
  version: 3;
  gameMode: GameMode;
  campaignSeed: number;
  cycleNumber: number;
  phase: CampaignPhase;
  essence: number;
  victoryPoints: number;
  unlockedFactionIds: FactionId[];
  unlockedTroopUnlockIds: TroopUnlockId[];
  recentTroopUnlockIds: TroopUnlockId[];
  troops: TroopInstance[];
  factionUpgradeIds: UpgradeId[];
  troopTypeUpgradeIds: UpgradeId[];
  activeTroopOffer: TroopDraftOffer | null;
  activeUpgradeOffer: UpgradeDraftOffer | null;
  activeFactionUnlockOffer: FactionUnlockOffer | null;
  activeTroopTypeUnlockOffer: TroopTypeUnlockOffer | null;
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
    | 'same_faction_conflict'
    | 'same_type_conflict'
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
  missingFactionIds: string[];
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
  initiativeBonusPerBeat?: number;
  rangedDamageMultiplier?: number;
  removeFading?: boolean;
  armorCap?: number;
  randomMoveEveryBeats?: number;
  decayDamagePerBeat?: number;
}
