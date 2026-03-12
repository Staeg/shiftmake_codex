export type UnitTypeId = string;
export type FactionId = string;
export type TroopTypeId = string;
export type AbilityId = string;
export type RoleId = 'frontline' | 'chaff' | 'backline';
export type SideId = 'player' | 'enemy';
export type HexCoord = { q: number; r: number };
export type AbilityTriggerId = 'endOfTurn' | 'onAttack' | 'onKill';
export type AbilityTargetKind = 'friendlyInRangeMostDamaged' | 'attackedEnemyHex' | 'self' | 'area';
export type BaselineAbilityId = 'heal' | 'blast';
export type AbilityModifierId = 'onKill' | 'self' | 'aoe';

export interface UnitStats {
  health: number;
  damage: number;
  speed: number;
  range: number;
  armor: number;
  size: number;
  capacity: number;
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

export interface StatAdjustment {
  flat?: number;
  multiplier?: number;
}

export interface FactionDefinition {
  id: FactionId;
  label: string;
  description: string;
  addedTypes: string[];
  defaultUnitTypeIds: UnitTypeId[];
  statAdjustments: Partial<Record<keyof UnitStats | 'cost', StatAdjustment>>;
  abilityIds: AbilityId[];
}

export interface AbilityBaselineDefinition {
  id: BaselineAbilityId;
  label: string;
  defaultTrigger: AbilityTriggerId;
  defaultTarget: AbilityTargetKind;
  descriptionTemplate: string;
}

export interface AbilityModifier {
  id: AbilityModifierId;
  value?: number;
}

export interface NamedAbilityDefinition {
  id: AbilityId;
  label: string;
  baselineId: BaselineAbilityId;
  amount: number;
  modifiers: AbilityModifier[];
}

export interface ResolvedAbility {
  id: AbilityId;
  label: string;
  baselineId: BaselineAbilityId;
  amount: number;
  trigger: AbilityTriggerId;
  target: {
    kind: AbilityTargetKind;
    radius?: number;
  };
  modifiers: AbilityModifier[];
  shortText: string;
}

export interface TroopDefinition {
  id: TroopTypeId;
  factionId: FactionId;
  unitTypeId: UnitTypeId;
  label: string;
  role: RoleId;
  types: string[];
  stats: UnitStats;
  quantity: number;
  cost: number;
  abilityIds: AbilityId[];
  abilities: ResolvedAbility[];
}

export interface BattleUnit {
  id: string;
  troopId: TroopTypeId;
  unitTypeId: UnitTypeId;
  factionId: FactionId;
  side: SideId;
  role: RoleId;
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

export type BattleStepKind = 'beat' | 'move' | 'engage' | 'attack' | 'knockout' | 'heal';

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
  seed: number;
  mapRadius: number;
  saturation: number;
  initial: BattleStateSnapshot;
  steps: BattleStep[];
  outcome: 'victory' | 'defeat' | 'draw';
}
