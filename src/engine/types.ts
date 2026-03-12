export type UnitTypeId = string;
export type FactionId = string;
export type TroopId = string;
export type TroopTypeId = string;
export type UpgradeId = string;
export type AbilityId = string;
export type MutatorId = string;
export type RoleId = 'frontline' | 'chaff' | 'backline';
export type SideId = 'player' | 'enemy';
export type ResourceId = 'gold' | 'essence';
export type TroopStatKey = 'health' | 'damage' | 'speed' | 'armor' | 'range' | 'capacity';
export type CampaignPhase = 'faction_draft' | 'planning' | 'reward_claims';
export type RiftState = 'discovered' | 'resolved_victory' | 'resolved_defeat' | 'expired';
export type BattleOutcome = 'victory' | 'defeat' | 'draw';

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

export interface ResourceAmounts {
  gold: number;
  essence: number;
}

export interface AbilityDefinition {
  id: AbilityId;
  label: string;
  trigger: 'startOfBattle' | 'endOfTurn' | 'onAttack' | 'onKill' | 'onDeath' | 'onDamaged' | 'passive';
  effect: 'heal' | 'blast' | 'boost' | 'pack' | 'ramp' | 'strike';
  amount: number;
  radius?: number;
  condition?: 'forsaken';
  repeatPerDistinctFriendlyTroopType?: boolean;
  overworldEffectId?: 'united';
  shortText: string;
}

export interface UnitTypeDefinition {
  id: UnitTypeId;
  label: string;
  role: RoleId;
  types: string[];
  stats: UnitStats;
  quantity: number;
  cost: number;
  abilityIds: AbilityId[];
}

export interface FactionDefinition {
  id: FactionId;
  label: string;
  singularLabel: string;
  description: string;
  addedTypes: string[];
  defaultUnitTypeIds: UnitTypeId[];
  statAdjustments: Partial<Record<keyof UnitStats | 'cost', { flat?: number; multiplier?: number }>>;
  abilityIds: AbilityId[];
}

export interface FactionUpgradeDefinition {
  id: UpgradeId;
  factionId: FactionId;
  label: string;
  tier: 1 | 2 | 3;
  cost: number;
  source: 'default' | 'rift';
  description: string;
  effects: Array<
    | {
        kind: 'addAbility';
        abilityId: AbilityId;
      }
    | {
        kind: 'addTag';
        tag: string;
      }
    | {
        kind: 'modifyStats';
        statModifiers: Partial<Record<TroopStatKey, { flat?: number; multiplier?: number }>>;
        unitFilter?: 'nonMelee';
      }
  >;
}

export interface TroopDefinition {
  id: string;
  factionId: FactionId;
  unitTypeId: UnitTypeId;
  label: string;
  role: RoleId;
  types: string[];
  stats: UnitStats;
  quantity: number;
  cost: number;
  abilities: AbilityDefinition[];
}

export interface TroopInstance {
  id: TroopId;
  factionId: FactionId;
  unitTypeId: UnitTypeId;
  quantity: number;
  unlocked: boolean;
  statUpgradeLevels: Record<TroopStatKey, number>;
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
  types: string[];
  stats: UnitStats;
  abilities: AbilityDefinition[];
  quantity: number;
  cost: number;
  side: SideId;
}

export interface BattleInput {
  seed: number;
  riftId: string | null;
  tier: number | null;
  mutatorIds: MutatorId[];
  playerCombatants: ResolvedCombatantDefinition[];
  enemyCombatants: ResolvedCombatantDefinition[];
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
  types: string[];
  position: HexCoord;
  hp: number;
  maxHp: number;
  initiative: number;
  alive: boolean;
  engagedWithIds: string[];
}

export interface BattleStateSnapshot {
  units: BattleUnit[];
}

export type BattleStepKind = 'beat' | 'move' | 'engage' | 'attack' | 'knockout' | 'heal' | 'buff';

export interface BattleStep {
  index: number;
  kind: BattleStepKind;
  actorIds: string[];
  targetIds: string[];
  message: string;
  snapshot: BattleStateSnapshot;
  metadata?: Record<string, number | string | boolean>;
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

export interface ReplayIndexEntry {
  id: string;
  riftId: string | null;
  cycleNumber: number;
  battleSeed: number;
  outcome: BattleOutcome;
  playerTroopLabels: string[];
  mutatorIds: MutatorId[];
  summary: string;
  storageKey: string;
  estimatedBytes: number;
  summaryOnly?: boolean;
}

export interface RewardChoice {
  id: string;
  riftId: string;
  title: string;
  optionUpgradeIds: UpgradeId[];
}

export interface RewardPackage {
  resources: ResourceAmounts;
  upgradeChoiceBatches: number;
  summaryParts: string[];
}

export interface RiftInstance {
  id: string;
  cycleNumber: number;
  seed: number;
  tier: number;
  mutatorIds: MutatorId[];
  enemyArmy: ResolvedCombatantDefinition[];
  rewardPackage: RewardPackage;
  expiresInCycles: number;
  state: RiftState;
}

export interface GameState {
  version: 1;
  campaignSeed: number;
  cycleNumber: number;
  phase: CampaignPhase;
  resources: ResourceAmounts;
  unlockedFactionIds: FactionId[];
  availableFactionDraft: FactionId[];
  troops: TroopInstance[];
  factionUpgradeIds: UpgradeId[];
  openRifts: RiftInstance[];
  pendingRewardChoices: RewardChoice[];
  replayIndex: ReplayIndexEntry[];
}

export interface ValidationIssue {
  kind: 'troop_recovering' | 'duplicate_assignment' | 'same_faction_conflict' | 'no_assignments';
  message: string;
  troopId?: TroopId;
  riftId?: string;
}

export interface ValidationResult {
  ok: boolean;
  issues: ValidationIssue[];
}

export interface RiftResolutionRecord {
  riftId: string;
  assignedTroopIds: TroopId[];
  replay: BattleReplay;
  outcome: BattleOutcome;
  rewardPackage: RewardPackage;
  recoveryMap: Record<TroopId, number>;
}

export interface CycleResolution {
  records: RiftResolutionRecord[];
}

export interface ReplayPayloadWrite {
  key: string;
  replay: BattleReplay;
  estimatedBytes: number;
}

export interface ReplayPayloadDelete {
  key: string;
}

export interface ApplyCycleOutcomeResult {
  nextState: GameState;
  replayPayloadWrites: ReplayPayloadWrite[];
  replayPayloadDeletes: ReplayPayloadDelete[];
}

export interface LoadGameResult {
  ok: boolean;
  state?: GameState;
  error?: 'unsupported_version' | 'invalid_json' | 'invalid_shape';
}

export interface MutatorDefinition {
  id: MutatorId;
  label: string;
  description: string;
  enemyBudgetMultiplier: number;
  rewardMultiplier: number;
  initiativeBonusPerBeat?: number;
  rangedDamageMultiplier?: number;
  recoveryMultiplier?: number;
}
