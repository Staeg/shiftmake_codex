import { describe, expect, it } from 'vitest';
import { resolveBattle } from './battle';
import { getTroopDefinitionOrThrow } from './unitCatalog';
import type { BattleInput, BattleReplay, BattleStep, BattleUnit, ResolvedCombatantDefinition, RoleId, SideId } from './types';

function makeBattleCombatant(
  troopId: string,
  side: SideId,
  overrides: Partial<ResolvedCombatantDefinition> = {},
): ResolvedCombatantDefinition {
  const troop = getTroopDefinitionOrThrow(troopId);
  return {
    combatantId: `test-${side}-${troopId}-${overrides.label ?? troop.label}`,
    troopInstanceId: null,
    factionId: troop.factionId,
    unitTypeId: troop.unitTypeId,
    label: troop.label,
    role: troop.role,
    type: troop.type,
    attributes: troop.attributes,
    stats: troop.stats,
    abilities: troop.abilities,
    quantity: 1,
    cost: troop.cost,
    side,
    ...overrides,
  };
}

function makeBattleInput(
  playerCombatants: ResolvedCombatantDefinition[],
  enemyCombatants: ResolvedCombatantDefinition[],
  seed: number,
): BattleInput {
  return {
    seed,
    riftId: null,
    tier: null,
    mutatorIds: [],
    playerCombatants,
    enemyCombatants,
  };
}

function getUnitAtStart(replay: BattleReplay, label: string, side: SideId): BattleUnit {
  const unit = replay.initial.units.find((entry) => entry.troopLabel === label && entry.side === side);
  expect(unit).toBeDefined();
  return unit!;
}

function getUnitAtStep(step: BattleStep, unitId: string): BattleUnit | undefined {
  return step.snapshot.units.find((unit) => unit.id === unitId);
}

function stepActorLabels(step: BattleStep): string[] {
  return step.actorIds
    .map((actorId) => step.snapshot.units.find((unit) => unit.id === actorId)?.troopLabel)
    .filter((label): label is string => Boolean(label));
}

function stepTargetLabels(step: BattleStep): string[] {
  return step.targetIds
    .map((targetId) => step.snapshot.units.find((unit) => unit.id === targetId)?.troopLabel)
    .filter((label): label is string => Boolean(label));
}

function findFirstRoleStep(replay: BattleReplay, actorLabel: string, roleIntent: string): BattleStep | undefined {
  return replay.steps.find(
    (step) =>
      (step.kind === 'move' || step.kind === 'engage') &&
      stepActorLabels(step).includes(actorLabel) &&
      step.metadata?.roleIntent === roleIntent,
  );
}

function hexDistance(a: { q: number; r: number }, b: { q: number; r: number }): number {
  return Math.max(Math.abs(a.q - b.q), Math.abs(a.r - b.r), Math.abs(a.q + a.r - b.q - b.r));
}

describe('role behavior', () => {
  it('frontline screens allied backline before enemy reaches it', () => {
    const replay = resolveBattle(
      makeBattleInput(
        [
          makeBattleCombatant('human/soldier', 'player', { label: 'Player Frontline' }),
          makeBattleCombatant('elf/archer', 'player', { label: 'Player Backline' }),
        ],
        [
          makeBattleCombatant('human/soldier', 'enemy', { label: 'Enemy Frontline' }),
          makeBattleCombatant('elf/archer', 'enemy', { label: 'Enemy Backline' }),
        ],
        101,
      ),
    );

    const playerFrontline = getUnitAtStart(replay, 'Player Frontline', 'player');
    const playerBackline = getUnitAtStart(replay, 'Player Backline', 'player');
    const screenStep = findFirstRoleStep(replay, 'Player Frontline', 'screen-frontline');
    const firstThreatIndex = replay.steps.findIndex(
      (step) =>
        stepTargetLabels(step).includes('Player Backline') ||
        Boolean(getUnitAtStep(step, playerBackline.id) && getUnitAtStep(step, playerFrontline.id))
          && equalsPosition(getUnitAtStep(step, playerBackline.id)?.position, getUnitAtStep(step, playerFrontline.id)?.position),
    );

    expect(screenStep).toBeDefined();
    expect(screenStep?.metadata?.reasonCode).toBe('block-access');
    expect(screenStep?.metadata?.targetRole).toBe('frontline');
    expect(replay.steps.indexOf(screenStep!)).toBeLessThan(firstThreatIndex === -1 ? Number.MAX_SAFE_INTEGER : firstThreatIndex);
  });

  it('frontline falls back to reachable enemy backline targets', () => {
    const replay = resolveBattle(
      makeBattleInput(
        [makeBattleCombatant('human/soldier', 'player', { label: 'Player Frontline' })],
        [makeBattleCombatant('elf/archer', 'enemy', { label: 'Enemy Backline' })],
        102,
      ),
    );

    const fallbackStep = findFirstRoleStep(replay, 'Player Frontline', 'fallback-backline');

    expect(fallbackStep).toBeDefined();
    expect(fallbackStep?.metadata?.reasonCode).toBe('no-frontline-target');
    expect(fallbackStep?.metadata?.targetRole).toBe('backline');
    expect(stepTargetLabels(fallbackStep!).includes('Enemy Backline') || fallbackStep?.kind === 'move').toBe(true);
  });

  it('frontline fallback spreads across equally good lanes instead of stacking onto one hex', () => {
    const fastFrontline = {
      ...getTroopDefinitionOrThrow('human/soldier').stats,
      speed: 20,
      size: 10,
    };
    const slowBackline = {
      ...getTroopDefinitionOrThrow('elf/archer').stats,
      speed: 1,
    };
    const replay = Array.from({ length: 200 }, (_, offset) => 106 + offset)
      .map((seed) =>
        resolveBattle(
          makeBattleInput(
            [
              makeBattleCombatant('human/soldier', 'player', { label: 'Player Frontline A', stats: fastFrontline }),
              makeBattleCombatant('human/soldier', 'player', { label: 'Player Frontline B', stats: fastFrontline }),
            ],
            [makeBattleCombatant('elf/archer', 'enemy', { label: 'Enemy Backline', stats: slowBackline })],
            seed,
          ),
        ),
      )
      .find((candidateReplay) => {
        const initialA = getUnitAtStart(candidateReplay, 'Player Frontline A', 'player');
        const initialB = getUnitAtStart(candidateReplay, 'Player Frontline B', 'player');
        const candidateFallbackA = findFirstRoleStep(candidateReplay, 'Player Frontline A', 'fallback-backline');
        const candidateFallbackB = findFirstRoleStep(candidateReplay, 'Player Frontline B', 'fallback-backline');
        return Boolean(
          candidateFallbackA
          && candidateFallbackB
          && initialA.position.q === -2
          && initialA.position.r === 0
          && initialB.position.q === -2
          && initialB.position.r === 1
          && candidateFallbackA.metadata?.toQ === -1
          && candidateFallbackA.metadata?.toR === 0
          && candidateReplay.steps.indexOf(candidateFallbackA) < candidateReplay.steps.indexOf(candidateFallbackB),
        );
      });

    expect(replay).toBeDefined();
    const fallbackA = replay && findFirstRoleStep(replay, 'Player Frontline A', 'fallback-backline');
    const fallbackB = replay && findFirstRoleStep(replay, 'Player Frontline B', 'fallback-backline');

    expect(fallbackA).toBeDefined();
    expect(fallbackB).toBeDefined();
    expect(fallbackA?.metadata?.toQ).toBe(-1);
    expect(fallbackA?.metadata?.toR).toBe(0);
    expect(fallbackB?.metadata?.toQ).toBe(-1);
    expect(fallbackB?.metadata?.toR).toBe(1);
  });

  it('chaff breaches enemy backline and stays committed', () => {
    const replay = resolveBattle(
      makeBattleInput(
        [makeBattleCombatant('human/militia', 'player', { label: 'Player Chaff', role: 'chaff', stats: { ...getTroopDefinitionOrThrow('human/militia').stats, speed: 20 } })],
        [
          makeBattleCombatant('human/soldier', 'enemy', { label: 'Enemy Frontline' }),
          makeBattleCombatant('elf/archer', 'enemy', { label: 'Enemy Backline' }),
        ],
        103,
      ),
    );

    const breachStep = findFirstRoleStep(replay, 'Player Chaff', 'breach-backline');
    const holdStep = findFirstRoleStep(replay, 'Player Chaff', 'hold-backline');

    expect(breachStep).toBeDefined();
    expect(breachStep?.metadata?.targetRole).toBe('backline');
    expect(breachStep?.metadata?.reasonCode).toBe('opened-backline-lane');
    expect(holdStep).toBeDefined();
    expect(holdStep?.metadata?.targetRole).toBe('backline');
    expect(holdStep?.metadata?.reasonCode).toBe('maintain-backline-commitment');
    expect(replay.steps.indexOf(holdStep!)).toBeGreaterThan(replay.steps.indexOf(breachStep!));
  });

  it('backline preserves distance when a retreat hex exists', () => {
    const replay = resolveBattle(
      makeBattleInput(
        [makeBattleCombatant('elf/archer', 'player', { label: 'Player Backline' })],
        [makeBattleCombatant('human/knight', 'enemy', { label: 'Enemy Pursuer' })],
        104,
      ),
    );

    const retreatStep = findFirstRoleStep(replay, 'Player Backline', 'retreat-range');
    expect(retreatStep).toBeDefined();
    expect(retreatStep?.metadata?.reasonCode).toBe('increase-threat-distance');

    const retreatIndex = replay.steps.indexOf(retreatStep!);
    const previousSnapshot = retreatIndex === 0 ? replay.initial : replay.steps[retreatIndex - 1]!.snapshot;
    const backlineBefore = previousSnapshot.units.find((unit) => unit.troopLabel === 'Player Backline' && unit.side === 'player');
    const pursuerBefore = previousSnapshot.units.find((unit) => unit.troopLabel === 'Enemy Pursuer' && unit.side === 'enemy');
    const backlineAfter = retreatStep && retreatStep.snapshot.units.find((unit) => unit.troopLabel === 'Player Backline' && unit.side === 'player');
    const pursuerAfter = retreatStep && retreatStep.snapshot.units.find((unit) => unit.troopLabel === 'Enemy Pursuer' && unit.side === 'enemy');

    expect(backlineBefore && pursuerBefore && backlineAfter && pursuerAfter).toBeTruthy();
    expect(hexDistance(backlineAfter!.position, pursuerAfter!.position)).toBeGreaterThanOrEqual(
      hexDistance(backlineBefore!.position, pursuerBefore!.position),
    );
  });

  it('backline movement no longer locks equal retreat choices to one hex', () => {
    const retreatDestinations = new Set(
      Array.from({ length: 120 }, (_, offset) => 500 + offset)
        .map((seed) =>
          resolveBattle(
            makeBattleInput(
              [makeBattleCombatant('elf/archer', 'player', { label: 'Player Backline' })],
              [makeBattleCombatant('human/knight', 'enemy', { label: 'Enemy Pursuer' })],
              seed,
            ),
          ),
        )
        .map((replay) => findFirstRoleStep(replay, 'Player Backline', 'retreat-range'))
        .filter((step): step is BattleStep => Boolean(step))
        .map((step) => `${step.metadata?.toQ},${step.metadata?.toR}`),
    );

    expect(retreatDestinations.size).toBeGreaterThan(1);
  });

  it('replay metadata exposes role intent and reason codes', () => {
    const replay = resolveBattle(
      makeBattleInput(
        [
          makeBattleCombatant('human/soldier', 'player', { label: 'Player Frontline' }),
          makeBattleCombatant('human/militia', 'player', { label: 'Player Chaff', role: 'chaff' }),
          makeBattleCombatant('elf/archer', 'player', { label: 'Player Backline' }),
        ],
        [
          makeBattleCombatant('human/soldier', 'enemy', { label: 'Enemy Frontline' }),
          makeBattleCombatant('elf/archer', 'enemy', { label: 'Enemy Backline' }),
        ],
        105,
      ),
    );

    const intentStep = replay.steps.find((step) => step.kind !== 'beat' && Boolean(step.metadata?.roleIntent));

    expect(intentStep).toBeDefined();
    expect(intentStep?.metadata?.roleIntent).toBeTypeOf('string');
    expect(intentStep?.metadata?.reasonCode).toBeTypeOf('string');
    expect(intentStep?.message).toMatch(/screen|fallback|breach|hold|retreat|advance/i);
  });
});

function equalsPosition(
  left: { q: number; r: number } | undefined,
  right: { q: number; r: number } | undefined,
): boolean {
  return Boolean(left && right && left.q === right.q && left.r === right.r);
}
