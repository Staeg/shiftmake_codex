import { describe, expect, it } from 'vitest';
import { resolveTroopCombatant } from '../engine/army';
import { resolveAssignedRifts } from '../engine/game';
import type { BattleOutcome, BattleSideParticipants, RiftResolutionRecord } from '../engine/types';
import { draftFixture } from './__fixtures__/essenceDraft';
import { rivalInfoFixture } from './__fixtures__/rivalInfo';
import { buildRecordBattlePhase, getRecordForBattlePhase, getRiftBattleAnimationView,
  getAnimationLeftCombatantGroups, getAnimationRightCombatantGroups,
  getVisibleRiftDefenders, healthToneForAnimationSide, phaseResultSource,
  resultForBattleSource } from './riftBattlePresentation';

const base = draftFixture();
const rift = base.openRifts[0]!;
const assigned = { ...base, openRifts: [rift], troops: base.troops.map(troop => ({ ...troop, assignmentRiftId: rift.id })) };
const resolved = resolveAssignedRifts(assigned).records[0]!;
const localGuardian: BattleSideParticipants = {
  player: { kind: 'player', playerId: 'playerOne', label: 'You' },
  enemy: { kind: 'neutral', label: 'Guardians' },
};

function record(id: string, participants: BattleSideParticipants = localGuardian, outcome: BattleOutcome = 'victory'): RiftResolutionRecord {
  return { ...resolved, replay: { ...resolved.replay, id }, outcome,
    battleInput: { ...resolved.battleInput, sideParticipants: participants } };
}

describe('Rift board presentation contract', () => {
  it('uses authoritative static guardians, assigned troops and resolved rival holders', () => {
    expect(getVisibleRiftDefenders(base, rift)).toBe(rift.enemyArmy);
    expect(getAnimationLeftCombatantGroups(base, [], rift, null)[0]!.combatants).toBe(rift.enemyArmy);
    const right = getAnimationRightCombatantGroups(assigned, [], rift, null)[0]!;
    expect(right.phaseClass).toBe('phase-static');
    expect(right.participant).toBeNull();
    expect(right.combatants.map(troop => troop.troopInstanceId)).toEqual(assigned.troops.map(troop => troop.id));
    const game = rivalInfoFixture();
    const held = game.openRifts[0]!;
    const rival = game.contest!.players.playerTwo;
    expect(getVisibleRiftDefenders(game, held)).toEqual([
      resolveTroopCombatant(rival, rival.troops[0]!, 'enemy', null, `player-two-held-${rival.troops[0]!.id}`),
    ]);
    expect(getVisibleRiftDefenders(game, { ...held, controller: 'playerOne' })).toEqual([]);
    expect(getVisibleRiftDefenders(game, { ...held, controller: 'neutral' })).toBe(held.enemyArmy);
  });

  it('places local forces on the right and resolves result perspective from participants', () => {
    const phase = buildRecordBattlePhase(record('local'), 'phase-now', 'phase');
    expect(phase.leftSource).toBe('enemy');
    expect(phase.rightSource).toBe('player');
    expect(phase.left.loses).toBe(true);
    expect(phase.right.loses).toBe(false);
    expect(healthToneForAnimationSide(phase.left)).toBe('neutral');
    expect(healthToneForAnimationSide(phase.right)).toBe('player');
    expect(phaseResultSource(phase)).toEqual({ source: 'player', opponentOutcome: false });
    const reverse = buildRecordBattlePhase(record('reverse', {
      player: { kind: 'opponent', playerId: 'playerTwo', label: 'Rival' },
      enemy: localGuardian.player,
    }), 'phase-now', 'reverse');
    expect(reverse.leftSource).toBe('player');
    expect(reverse.rightSource).toBe('enemy');
    expect(phaseResultSource(reverse)).toEqual({ source: 'enemy', opponentOutcome: false });
    expect(resultForBattleSource('victory', 'enemy')).toBe('defeat');
    expect(resultForBattleSource('defeat', 'enemy')).toBe('victory');
    expect(resultForBattleSource('draw', 'enemy')).toBe('draw');
  });

  it('preserves opponent-vs-guardian outcomes and marks both sides lost on a draw', () => {
    const phase = buildRecordBattlePhase(record('opponent', {
      player: { kind: 'opponent', playerId: 'playerTwo', label: 'Rival' },
      enemy: localGuardian.enemy,
    }, 'draw'), 'phase-now', 'opponent');
    expect(phaseResultSource(phase)).toEqual({ source: 'player', opponentOutcome: true });
    expect(healthToneForAnimationSide(phase.right)).toBe('opponent');
    expect([phase.left.loses, phase.right.loses]).toEqual([true, true]);
    const { sideParticipants: _participants, ...fallbackInput } = resolved.battleInput;
    const fallback = buildRecordBattlePhase({ ...resolved, battleInput: fallbackInput }, 'phase-now', 'fallback');
    expect(fallback.left.label).toBe('Neutral Guardians');
    expect(fallback.right.label).toBe('Player');
  });

  it('retains legacy human/ai identity handling', () => {
    const participants = {
      player: { kind: 'opponent', playerId: 'ai', label: 'AI' },
      enemy: { kind: 'player', playerId: 'human', label: 'Human' },
    } as unknown as BattleSideParticipants;
    const phase = buildRecordBattlePhase(record('legacy', participants), 'phase-now', 'legacy');
    expect(phaseResultSource(phase)).toEqual({ source: 'enemy', opponentOutcome: false });
    expect(healthToneForAnimationSide(phase.right)).toBe('player');
  });

  it('filters records by Rift and sequences local guardian before late PvP', () => {
    const guardian = { ...record('guardian'), contest: { kind: 'guardian' as const, attackerId: 'playerOne' as const } };
    const pvp = { ...record('pvp', { player: localGuardian.player,
      enemy: { kind: 'opponent' as const, playerId: 'playerTwo' as const, label: 'Rival' } }), contest: { kind: 'pvp' as const } };
    const unrelated = { ...record('unrelated'), riftId: 'other-rift' };
    const animation = getRiftBattleAnimationView([pvp, unrelated, guardian], rift)!;
    expect(animation.phases.map(phase => [phase.replayId, phase.delayClass])).toEqual([
      ['guardian', 'phase-now'], ['pvp', 'phase-late'],
    ]);
    expect(getRiftBattleAnimationView([unrelated], rift)).toBeNull();
    expect(getRecordForBattlePhase([guardian], animation.phases[1]!)).toBeNull();
    expect(getRecordForBattlePhase([pvp], animation.phases[1]!)).toBe(pvp);
    // Preserve the existing no-guardian presentation sequence until separately redesigned.
    expect(getRiftBattleAnimationView([pvp], rift)!.phases.map(phase => phase.replayId)).toEqual(['pvp', 'pvp']);
  });

  it('coalesces participant forces across phases and applies the late loss class without mutating sources', () => {
    const guardian = { ...record('guardian'), contest: { kind: 'guardian' as const, attackerId: 'playerOne' as const } };
    const pvp = { ...record('pvp', { player: localGuardian.player,
      enemy: { kind: 'opponent' as const, playerId: 'playerTwo' as const, label: 'Rival' } }, 'defeat'), contest: { kind: 'pvp' as const } };
    const records = [guardian, pvp];
    const original = JSON.stringify({ assigned, records });
    const animation = getRiftBattleAnimationView(records, rift)!;
    const right = getAnimationRightCombatantGroups(assigned, records, rift, animation);
    expect(right).toHaveLength(1);
    expect(right[0]!.combatants).toBe(guardian.battleInput.playerCombatants);
    expect(right[0]!.phaseClass).toBe('phase-now');
    expect(right[0]!.lossClass).toBe('force-loses-late');
    const left = getAnimationLeftCombatantGroups(assigned, records, rift, animation);
    expect(left.map(group => [group.participant!.kind, group.phaseClass, group.lossClass])).toEqual([
      ['neutral', 'phase-now', 'force-loses-now'], ['opponent', 'phase-late', null],
    ]);
    expect(JSON.stringify({ assigned, records })).toBe(original);
    expect(getAnimationRightCombatantGroups(assigned, [], rift, animation)[0]!.phaseClass).toBe('phase-static');
  });
});
