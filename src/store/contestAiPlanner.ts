import { prepareContestAiForCycle } from '../engine/game';
import type { ContestPlayerState, GameState } from '../engine/types';

export interface ContestAiWorkerRequest {
  kind: 'plan-contest-ai';
  key: string;
  game: GameState;
}

export interface ContestAiWorkerResponse {
  kind: 'contest-ai-plan';
  key: string;
  playerTwo: ContestPlayerState;
}

export function buildContestAiPlanKey(state: GameState): string | null {
  if (state.gameMode !== 'contest' || state.phase !== 'planning') {
    return null;
  }

  return JSON.stringify({
    campaignSeed: state.campaignSeed,
    cycleNumber: state.cycleNumber,
    playerTwo: state.contest?.players.playerTwo ?? null,
    openRifts: state.openRifts.map((rift) => ({
      id: rift.id,
      seed: rift.seed,
      tier: rift.tier,
      mutatorIds: rift.mutatorIds,
      enemyArmy: rift.enemyArmy.map((guardian) => ({
        combatantId: guardian.combatantId,
        raceId: guardian.raceId,
        unitClassId: guardian.unitClassId,
        troopInstanceId: guardian.troopInstanceId ?? null,
      })),
      enemyRaceUpgradeIds: rift.enemyRaceUpgradeIds ?? [],
      enemyTroopClassUpgradeIds: rift.enemyTroopClassUpgradeIds ?? [],
      victoryPoints: rift.victoryPoints,
      state: rift.state,
      controller: rift.controller ?? 'neutral',
      occupyingPlayerId: rift.occupyingPlayerId ?? null,
      occupyingTroopIds: rift.occupyingTroopIds ?? [],
    })),
  });
}

export function planContestAiForWorker(game: GameState): ContestPlayerState {
  return prepareContestAiForCycle(game);
}
