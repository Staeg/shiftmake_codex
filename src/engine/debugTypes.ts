import type { TroopTypeId } from './types';

export type ArmyDebugSelection = Record<TroopTypeId, number>;

export interface BattleDebugInput {
  seed?: number;
  player: ArmyDebugSelection;
  enemy: ArmyDebugSelection;
  playerFactionUpgradeIds?: string[];
  playerTroopTypeUpgradeIds?: string[];
  enemyFactionUpgradeIds?: string[];
  enemyTroopTypeUpgradeIds?: string[];
}
