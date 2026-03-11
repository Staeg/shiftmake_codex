export type UnitTypeId = 'swordsman' | 'peasant' | 'archer';
export type RoleId = 'frontline' | 'chaff' | 'backline';
export type SideId = 'player' | 'enemy';
export type HexCoord = { q: number; r: number };

export interface UnitStats {
  health: number;
  damage: number;
  speed: number;
  range: number;
  armor: number;
  size: number;
  capacity: number;
}

export interface UnitArchetype {
  id: UnitTypeId;
  label: string;
  role: RoleId;
  types: string[];
  stats: UnitStats;
}

export interface BattleUnit {
  id: string;
  typeId: UnitTypeId;
  side: SideId;
  role: RoleId;
  position: HexCoord;
  hp: number;
  initiative: number;
  alive: boolean;
  engagedWithIds: string[];
}

export interface BattleStateSnapshot {
  units: BattleUnit[];
}

export type BattleStepKind = 'beat' | 'move' | 'engage' | 'attack' | 'knockout';

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

export interface ArmyDebugSelection {
  swordsman: number;
  peasant: number;
  archer: number;
}

export interface BattleDebugInput {
  seed?: number;
  player: ArmyDebugSelection;
  enemy: ArmyDebugSelection;
}

