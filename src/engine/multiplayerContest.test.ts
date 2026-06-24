import { describe, expect, it } from 'vitest';
import { assignTroopToRift, claimOpeningTroop, claimTroopOffer, claimUpgradeOffer, getOpeningRaceStarterTroopUnlockIds, revealEssenceDraft, startNewGame } from './game';
import {
  advanceContestMultiplayerRoom,
  buildStoredReplayPayloadMap,
  buildContestMultiplayerSubmission,
  projectContestRoomStateForPlayer,
  projectReplayIndexForPlayer,
  projectStoredReplayPayloadMapForPlayer,
  projectContestStateForPlayer,
  validateAndApplyContestSubmission,
} from './multiplayerContest';
import type { GameState, TroopUnlockId } from './types';

function chooseFirstTwoOpeningTroops(state: GameState): GameState {
  const starters = Object.values(getOpeningRaceStarterTroopUnlockIds(state)) as TroopUnlockId[];
  return starters.slice(0, 2).reduce((next, troopUnlockId) => claimOpeningTroop(next, troopUnlockId), state);
}

function spendProjectedEssence(state: GameState): GameState {
  let next = revealEssenceDraft(state);
  const troopUnlockId = next.activeTroopOffer?.optionTroopUnlockIds[0];
  const upgradeId = next.activeUpgradeOffer?.optionUpgradeIds[0];
  if (troopUnlockId) {
    next = claimTroopOffer(next, troopUnlockId);
  }
  if (upgradeId) {
    next = claimUpgradeOffer(next, upgradeId);
  }
  return next;
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
    expect(getOpeningRaceStarterTroopUnlockIds(humanProjection)).not.toEqual(getOpeningRaceStarterTroopUnlockIds(aiProjection));

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

  it('derives projected archive outcomes from the localized player-side final counts', () => {
    const projectedIndex = projectReplayIndexForPlayer(
      [
        {
          id: 'replay-1',
          replayId: 'replay-1',
          riftId: 'cycle-1-rift-1',
          cycleNumber: 1,
          battleSeed: 1,
          outcome: 'defeat',
          playerTroopLabels: ['Guest Wizards'],
          enemyTroopLabels: ['Neutral Guardians'],
          mutatorIds: [],
          summary: 'DEFEAT 5-0',
          estimatedBytes: 1,
          finalPlayerAlive: 5,
          finalEnemyAlive: 0,
        },
      ],
      {
        'replay-1': {
          version: 1,
          input: {
            seed: 1,
            riftId: 'cycle-1-rift-1',
            tier: 1,
            mutatorIds: [],
            playerCombatants: [{ label: 'Guest Wizards' } as never],
            enemyCombatants: [{ label: 'Neutral Guardians' } as never],
            sideParticipants: {
              player: { kind: 'player', label: 'Guest', playerId: 'ai' },
              enemy: { kind: 'neutral', label: 'Neutral Guardians' },
            },
          },
        },
      },
    );

    expect(projectedIndex[0]?.outcome).toBe('victory');
    expect(projectedIndex[0]?.summary).toBe('VICTORY 5-0');
    expect(projectedIndex[0]?.encounterLabel).toBe('Neutral Guardians');
  });

  it('generates different scheduled race unlock offers for both players', () => {
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

    expect(cycleThree.phase).toBe('race_unlock');
    expect(projectContestStateForPlayer(cycleThree, 'human').activeRaceUnlockOffer?.optionRaceIds).not.toEqual(
      projectContestStateForPlayer(cycleThree, 'ai').activeRaceUnlockOffer?.optionRaceIds,
    );
  });

  it('validates legal opening submissions into projected player progress', () => {
    const room = startNewGame(123, 'contest');
    const projected = chooseFirstTwoOpeningTroops(projectContestStateForPlayer(room, 'human'));

    const result = validateAndApplyContestSubmission(room, 'human', buildContestMultiplayerSubmission(projected));

    expect(result.ok).toBe(true);
    expect(result.projectedState?.troops).toHaveLength(2);
  });

  it('rejects forged opening troops', () => {
    const room = startNewGame(123, 'contest');
    const legal = buildContestMultiplayerSubmission(chooseFirstTwoOpeningTroops(projectContestStateForPlayer(room, 'human')));

    const result = validateAndApplyContestSubmission(room, 'human', {
      ...legal,
      selectedStartingTroopUnlockIds: ['human/soldier' as TroopUnlockId, 'human/archer' as TroopUnlockId],
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain('Opening troop');
  });

  it('rejects forged planning upgrades', () => {
    const room = startNewGame(456, 'contest');
    const opened = advanceContestMultiplayerRoom(room, {
      human: chooseFirstTwoOpeningTroops(projectContestStateForPlayer(room, 'human')),
      ai: chooseFirstTwoOpeningTroops(projectContestStateForPlayer(room, 'ai')),
    }).state;
    const projected = projectContestStateForPlayer(opened, 'human');
    const submission = buildContestMultiplayerSubmission(projected);

    const result = validateAndApplyContestSubmission(opened, 'human', {
      ...submission,
      selectedUpgradeIds: [...submission.selectedUpgradeIds, 'fake-upgrade' as never],
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain('draft choices');
  });

  it('rejects planning submissions until Essence is spent and active drafts are finished', () => {
    const room = startNewGame(456, 'contest');
    const opened = advanceContestMultiplayerRoom(room, {
      human: chooseFirstTwoOpeningTroops(projectContestStateForPlayer(room, 'human')),
      ai: chooseFirstTwoOpeningTroops(projectContestStateForPlayer(room, 'ai')),
    }).state;

    const result = validateAndApplyContestSubmission(opened, 'human', buildContestMultiplayerSubmission(projectContestStateForPlayer(opened, 'human')));

    expect(result.ok).toBe(false);
    expect(result.error).toContain('Spend all Essence');
  });

  it('accepts a held controlled Rift troop as an existing occupation, not a new assignment', () => {
    const room = startNewGame(456, 'contest');
    const opened = advanceContestMultiplayerRoom(room, {
      human: chooseFirstTwoOpeningTroops(projectContestStateForPlayer(room, 'human')),
      ai: chooseFirstTwoOpeningTroops(projectContestStateForPlayer(room, 'ai')),
    }).state;
    const heldRiftId = opened.openRifts[0]!.id;
    const heldTroopId = opened.troops[0]!.id;
    const controlled: GameState = {
      ...opened,
      openRifts: [
        {
          ...opened.openRifts[0]!,
          controller: 'human',
          occupyingPlayerId: 'human',
          occupyingTroopIds: [heldTroopId],
        },
        ...opened.openRifts.slice(1),
      ],
      troops: opened.troops.map((troop, index) => (index === 0 ? { ...troop, assignmentRiftId: heldRiftId } : troop)),
    };
    const projected = spendProjectedEssence(projectContestStateForPlayer(controlled, 'human'));

    const result = validateAndApplyContestSubmission(controlled, 'human', buildContestMultiplayerSubmission(projected));

    expect(result.ok).toBe(true);
    expect(result.projectedState?.troops.find((troop) => troop.id === heldTroopId)?.assignmentRiftId).toBe(heldRiftId);
  });

  it('rejects illegal assignments to already controlled Rifts', () => {
    const room = startNewGame(456, 'contest');
    const opened = advanceContestMultiplayerRoom(room, {
      human: chooseFirstTwoOpeningTroops(projectContestStateForPlayer(room, 'human')),
      ai: chooseFirstTwoOpeningTroops(projectContestStateForPlayer(room, 'ai')),
    }).state;
    const controlled: GameState = {
      ...opened,
      openRifts: [
        {
          ...opened.openRifts[0]!,
          controller: 'human',
          occupyingPlayerId: 'human',
          occupyingTroopIds: [opened.troops[0]!.id],
        },
        ...opened.openRifts.slice(1),
      ],
    };
    const projected = spendProjectedEssence(projectContestStateForPlayer(controlled, 'human'));
    const submission = buildContestMultiplayerSubmission({
      ...projected,
      troops: projected.troops.map((troop, index) => (index === 1 ? { ...troop, assignmentRiftId: projected.openRifts[0]!.id } : troop)),
    });

    const result = validateAndApplyContestSubmission(controlled, 'human', submission);

    expect(result.ok).toBe(false);
    expect(result.error).toContain('Assignment');
  });

  it('rejects stale cycle submissions', () => {
    const room = startNewGame(789, 'contest');
    const opened = advanceContestMultiplayerRoom(room, {
      human: chooseFirstTwoOpeningTroops(projectContestStateForPlayer(room, 'human')),
      ai: chooseFirstTwoOpeningTroops(projectContestStateForPlayer(room, 'ai')),
    }).state;
    const submission = buildContestMultiplayerSubmission(projectContestStateForPlayer(opened, 'human'));

    const result = validateAndApplyContestSubmission({ ...opened, cycleNumber: opened.cycleNumber + 1 }, 'human', submission);

    expect(result.ok).toBe(false);
    expect(result.error).toContain('old cycle');
  });
});
