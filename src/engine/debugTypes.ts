import type { UnitClassId } from './types';

export type ArmyDebugSelection = Record<UnitClassId, number>;

export interface BattleDebugInput {
  seed?: number;
  player: ArmyDebugSelection;
  enemy: ArmyDebugSelection;
  playerRaceUpgradeIds?: string[];
  playerTroopClassUpgradeIds?: string[];
  enemyRaceUpgradeIds?: string[];
  enemyTroopClassUpgradeIds?: string[];
}
