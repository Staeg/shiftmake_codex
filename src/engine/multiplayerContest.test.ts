import { describe, expect, it } from 'vitest';
import { assignTroopToRift, claimOpeningTroop, getOpeningFactionStarterTroopUnlockIds, revealEssenceDraft, startNewGame } from './game';
import {
  advanceContestMultiplayerRoom,
  buildStoredReplayPayloadMap,
  projectContestRoomStateForPlayer,
  projectReplayIndexForPlayer,
  projectStoredReplayPayloadMapForPlayer,
  projectContestStateForPlayer,
} from './multiplayerContest';
import type { GameState, TroopUnlockId } from './types';

function chooseFirstTwoOpeningTroops(state: GameState): GameState {
  const starters = Object.values(getOpeningFactionStarterTroopUnlockIds(state)) as TroopUnlockId[];
  return starters.slice(0, 2).reduce((next, troopUnlockId) => claimOpeningTroop(next, troopUnlockId), state);
}

describe('multiplayer Contest rooms', () => {
  it('starts Contest only after both projected players submit opening choices', () => {
    const room = startNewGame(123, 'contest');
    const humanSubmission = chooseFirstTwoOpeningTroops(projectContestStateForPlayer(room, 'human'));
    const aiSubmission = chooseFirstTwoOpeningTroops(projectContestStateForPlayer(room, 'ai'));

    const result = advanceContestMultiplayerRoom(room, {
      human: humanSubmission,
      ai: aiSubmission,
    });

    expect(result.state.phase).toBe('planning');
    expect(result.state.openRifts.length).toBeGreaterThan(0);
    expect(result.state.troops).toHaveLength(2);
    expect(result.state.contest?.players.ai.troops).toHaveLength(2);
    expect(result.state.essence).toBe(2);
    expect(result.state.contest?.players.ai.essence).toBe(2);
  });

  it('uses different private seeds for each player opening and draft rolls', () => {
    const room = startNewGame(123, 'contest');
    const humanProjection = projectContestStateForPlayer(room, 'human');
    const aiProjection = projectContestStateForPlayer(room, 'ai');

    expect(humanProjection.campaignSeed).not.toBe(aiProjection.campaignSeed);
    expect(getOpeningFactionStarterTroopUnlockIds(humanProjection)).not.toEqual(getOpeningFactionStarterTroopUnlockIds(aiProjection));

    const opened = advanceContestMultiplayerRoom(room, {
      human: chooseFirstTwoOpeningTroops(humanProjection),
      ai: chooseFirstTwoOpeningTroops(aiProjection),
    }).state;
    const humanDraft = revealEssenceDraft(projectContestStateForPlayer(opened, 'human'));
    const aiDraft = revealEssenceDraft(projectContestStateForPlayer(opened, 'ai'));

    expect(humanDraft.activeTroopOffer?.optionTroopUnlockIds).not.toEqual(aiDraft.activeTroopOffer?.optionTroopUnlockIds);
    expect(humanDraft.activeUpgradeOffer?.optionUpgradeIds).not.toEqual(aiDraft.activeUpgradeOffer?.optionUpgradeIds);
  });

  it('keeps a submitted player projection stable while waiting for the other player', () => {
    const room = startNewGame(123, 'contest');
    const humanProjection = chooseFirstTwoOpeningTroops(projectContestStateForPlayer(room, 'human'));

    expect(projectContestRoomStateForPlayer(room, 'human', { human: humanProjection }).troops).toEqual(humanProjection.troops);
    expect(projectContestRoomStateForPlayer(room, 'ai', { human: humanProjection }).troops).toHaveLength(0);
  });

  it('projects controlled Rifts from each player perspective', () => {
    const room = startNewGame(123, 'contest');
    const opened = advanceContestMultiplayerRoom(room, {
      human: chooseFirstTwoOpeningTroops(projectContestStateForPlayer(room, 'human')),
      ai: chooseFirstTwoOpeningTroops(projectContestStateForPlayer(room, 'ai')),
    }).state;
    const heldByHuman = {
      ...opened,
      openRifts: [{ ...opened.openRifts[0]!, controller: 'human' as const, occupyingPlayerId: 'human' as const, occupyingTroopIds: [] }],
    };

    expect(projectContestStateForPlayer(heldByHuman, 'human').openRifts[0]?.controller).toBe('human');
    expect(projectContestStateForPlayer(heldByHuman, 'ai').openRifts[0]?.controller).toBe('ai');
  });

  it('resolves a submitted planning handshake without AI auto-planning', () => {
    const room = startNewGame(456, 'contest');
    const opened = advanceContestMultiplayerRoom(room, {
      human: chooseFirstTwoOpeningTroops(projectContestStateForPlayer(room, 'human')),
      ai: chooseFirstTwoOpeningTroops(projectContestStateForPlayer(room, 'ai')),
    }).state;

    const result = advanceContestMultiplayerRoom(opened, {
      human: projectContestStateForPlayer(opened, 'human'),
      ai: projectContestStateForPlayer(opened, 'ai'),
    });

    expect(result.resolvedCycle).toBe(true);
    expect(result.state.cycleNumber).toBe(2);
    expect(result.state.contest?.opponentInfo?.cycleNumber).toBe(1);
  });

  it('projects player-two guardian archives with player two on the local player side', () => {
    const room = startNewGame(456, 'contest');
    const opened = advanceContestMultiplayerRoom(room, {
      human: chooseFirstTwoOpeningTroops(projectContestStateForPlayer(room, 'human')),
      ai: chooseFirstTwoOpeningTroops(projectContestStateForPlayer(room, 'ai')),
    }).state;
    const aiProjection = projectContestStateForPlayer(opened, 'ai');
    const aiTroopId = aiProjection.troops[0]!.id;
    const riftId = aiProjection.openRifts[0]!.id;
    const result = advanceContestMultiplayerRoom(opened, {
      human: projectContestStateForPlayer(opened, 'human'),
      ai: assignTroopToRift(aiProjection, aiTroopId, riftId),
    });
    const payloads = buildStoredReplayPayloadMap(result.replayPayloadWrites);
    const projectedPayloads = projectStoredReplayPayloadMapForPlayer(payloads, 'ai', { human: 'Ada', ai: 'Byron' });
    const projectedIndex = projectReplayIndexForPlayer(projectContestStateForPlayer(result.state, 'ai').replayIndex, projectedPayloads);
    const aiGuardianEntry = projectedIndex.find((entry) => entry.riftId === riftId);
    const aiGuardianPayload = aiGuardianEntry ? projectedPayloads[aiGuardianEntry.replayId] : null;

    expect(aiGuardianPayload?.input.sideParticipants?.player.kind).toBe('player');
    expect(aiGuardianPayload?.input.sideParticipants?.player.label).toBe('Byron');
    expect(aiGuardianPayload?.input.sideParticipants?.enemy.kind).toBe('neutral');
    expect(aiGuardianPayload?.input.playerCombatants.some((combatant) => combatant.troopInstanceId === aiTroopId)).toBe(true);
    expect(aiGuardianPayload?.input.enemyCombatants.some((combatant) => combatant.troopInstanceId === aiTroopId)).toBe(false);
    expect(aiGuardianEntry?.playerTroopLabels).toEqual(aiGuardianPayload?.input.playerCombatants.map((combatant) => combatant.label));
    expect(aiGuardianEntry?.encounterLabel).toBe('Neutral Guardians');
  });

  it('generates different scheduled faction unlock offers for both players', () => {
    const room = startNewGame(789, 'contest');
    let state = advanceContestMultiplayerRoom(room, {
      human: chooseFirstTwoOpeningTroops(projectContestStateForPlayer(room, 'human')),
      ai: chooseFirstTwoOpeningTroops(projectContestStateForPlayer(room, 'ai')),
    }).state;

    state = { ...state, cycleNumber: 2 };
    const cycleThree = advanceContestMultiplayerRoom(state, {
      human: projectContestStateForPlayer(state, 'human'),
      ai: projectContestStateForPlayer(state, 'ai'),
    }).state;

    expect(cycleThree.phase).toBe('faction_unlock');
    expect(projectContestStateForPlayer(cycleThree, 'human').activeFactionUnlockOffer?.optionFactionIds).not.toEqual(
      projectContestStateForPlayer(cycleThree, 'ai').activeFactionUnlockOffer?.optionFactionIds,
    );
  });
});
