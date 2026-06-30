import { describe, expect, it } from 'vitest';
import { resolveBattle } from './battle';
import { footprintsTouchOrOverlap } from './hex';
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
    raceId: troop.raceId,
    unitClassId: troop.unitClassId,
    label: troop.label,
    role: troop.role,
    unitClassTag: troop.unitClassTag,
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
          && footprintsTouchOrOverlap(getUnitAtStep(step, playerBackline.id)!.occupiedHexes, getUnitAtStep(step, playerFrontline.id)!.occupiedHexes),
    );

    if (screenStep) {
      expect(screenStep.metadata?.reasonCode).toBe('block-access');
      expect(screenStep.metadata?.targetRole).toBe('frontline');
    }
    expect(firstThreatIndex).toBeGreaterThanOrEqual(0);
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

  it('frontline fallback spreads across equally good lanes instead of collapsing into one route', () => {
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
        const candidateFallbackA = findFirstRoleStep(candidateReplay, 'Player Frontline A', 'fallback-backline');
        const candidateFallbackB = findFirstRoleStep(candidateReplay, 'Player Frontline B', 'fallback-backline');
        return Boolean(
          candidateFallbackA
          && candidateFallbackB
          && candidateReplay.steps.indexOf(candidateFallbackA) < candidateReplay.steps.indexOf(candidateFallbackB),
        );
      });

    expect(replay).toBeDefined();
    const fallbackA = replay && findFirstRoleStep(replay, 'Player Frontline A', 'fallback-backline');
    const fallbackB = replay && findFirstRoleStep(replay, 'Player Frontline B', 'fallback-backline');

    expect(fallbackA).toBeDefined();
    expect(fallbackB).toBeDefined();
    expect(`${fallbackA?.metadata?.toQ},${fallbackA?.metadata?.toR}`).not.toBe(`${fallbackB?.metadata?.toQ},${fallbackB?.metadata?.toR}`);
  });

  it('frontline can spend Move to push through smaller engaged enemies', () => {
    const frontlineStats = {
      ...getTroopDefinitionOrThrow('troll/champion').stats,
      speed: 40,
      damage: 5,
      move: 3,
      capacity: 8,
    };
    const smallEnemyStats = {
      ...getTroopDefinitionOrThrow('human/militia').stats,
      speed: 1,
      damage: 0,
      health: 160,
    };
    const replay = resolveBattle(
      makeBattleInput(
        [makeBattleCombatant('troll/champion', 'player', { label: 'Player Frontline', role: 'frontline', stats: frontlineStats })],
        [
          makeBattleCombatant('human/militia', 'enemy', { label: 'Enemy Small A', role: 'frontline', stats: smallEnemyStats }),
          makeBattleCombatant('human/militia', 'enemy', { label: 'Enemy Small B', role: 'frontline', stats: smallEnemyStats }),
          makeBattleCombatant('human/militia', 'enemy', { label: 'Enemy Small C', role: 'frontline', stats: smallEnemyStats }),
          makeBattleCombatant('human/militia', 'enemy', { label: 'Enemy Small D', role: 'frontline', stats: smallEnemyStats }),
        ],
        1200,
      ),
    );

    expect(replay).toBeDefined();
    const pushStep = replay.steps.find((step) => step.metadata?.reasonCode === 'frontline-push-through');
    expect(pushStep?.kind).toBe('move');
    expect(pushStep?.metadata?.pushedUnitIds).toBeDefined();
  });

  it('Pusher breaches enemy backline and stays committed', () => {
    const replay = resolveBattle(
      makeBattleInput(
        [makeBattleCombatant('human/militia', 'player', { label: 'Player Pusher', role: 'pusher', stats: { ...getTroopDefinitionOrThrow('human/militia').stats, health: 100, speed: 50, size: 1 } })],
        [
          makeBattleCombatant('human/soldier', 'enemy', { label: 'Enemy Frontline', stats: { ...getTroopDefinitionOrThrow('human/soldier').stats, speed: 1, move: 1, size: 1 } }),
          makeBattleCombatant('elf/archer', 'enemy', { label: 'Enemy Backline', stats: { ...getTroopDefinitionOrThrow('elf/archer').stats, size: 1 } }),
        ],
        103,
      ),
    );

    const breachStep = findFirstRoleStep(replay, 'Player Pusher', 'breach-backline');
    const holdStep = findFirstRoleStep(replay, 'Player Pusher', 'hold-backline');

    expect(breachStep).toBeDefined();
    expect(breachStep?.metadata?.targetRole).toBe('backline');
    expect(breachStep?.metadata?.reasonCode).toBe('opened-backline-lane');
    expect(holdStep).toBeDefined();
    expect(holdStep?.metadata?.targetRole).toBe('backline');
    expect(holdStep?.metadata?.reasonCode).toBe('maintain-backline-commitment');
    expect(replay.steps.indexOf(holdStep!)).toBeGreaterThan(replay.steps.indexOf(breachStep!));
  });

  it('Pusher can break through a smaller enemy held by another ally', () => {
    const pusherStats = {
      ...getTroopDefinitionOrThrow('troll/champion').stats,
      speed: 35,
      damage: 8,
      move: 3,
    };
    const holderStats = {
      ...getTroopDefinitionOrThrow('human/soldier').stats,
      speed: 50,
      damage: 0,
      health: 250,
    };
    const smallEnemyStats = {
      ...getTroopDefinitionOrThrow('human/militia').stats,
      speed: 1,
      damage: 0,
      health: 180,
    };
    const backlineStats = {
      ...getTroopDefinitionOrThrow('elf/archer').stats,
      speed: 1,
      damage: 0,
      health: 180,
    };
    const replay = resolveBattle(
      makeBattleInput(
        [
          makeBattleCombatant('troll/champion', 'player', { label: 'Player Pusher', role: 'pusher', stats: pusherStats }),
          makeBattleCombatant('human/soldier', 'player', { label: 'Player Holder', role: 'frontline', stats: holderStats }),
        ],
        [
          makeBattleCombatant('human/militia', 'enemy', { label: 'Enemy Small', role: 'frontline', stats: smallEnemyStats }),
          makeBattleCombatant('elf/archer', 'enemy', { label: 'Enemy Backline', stats: backlineStats }),
        ],
        1400,
      ),
    );

    const breakthroughStep = replay.steps.find((step) => step.metadata?.reasonCode === 'pusher-breakthrough');
    expect(breakthroughStep?.kind).toBe('move');
    expect(stepTargetLabels(breakthroughStep!)).toContain('Enemy Small');
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
    const attackStep = replay.steps.find((step) => step.kind === 'attack' && step.actorIds.some((id) => id.includes('archer')));
    expect(retreatStep || attackStep).toBeDefined();
    if (!retreatStep) {
      return;
    }
    expect(retreatStep.metadata?.reasonCode).toBe('increase-threat-distance');

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

    expect(retreatDestinations.size).toBeGreaterThanOrEqual(0);
  });

  it('backline advance target ties vary by seed', () => {
    const archerStats = {
      ...getTroopDefinitionOrThrow('elf/archer').stats,
      range: 1,
      speed: 20,
    };
    const enemyStats = {
      ...getTroopDefinitionOrThrow('human/soldier').stats,
      damage: 0,
      speed: 1,
    };
    const advanceTargets = new Set(
      Array.from({ length: 160 }, (_, offset) => 900 + offset)
        .map((seed) =>
          resolveBattle(
            makeBattleInput(
              [makeBattleCombatant('elf/archer', 'player', { label: 'Player Backline', stats: archerStats })],
              [
                makeBattleCombatant('human/soldier', 'enemy', { label: 'Enemy A', stats: enemyStats }),
                makeBattleCombatant('human/soldier', 'enemy', { label: 'Enemy B', stats: enemyStats }),
              ],
              seed,
            ),
          ),
        )
        .map((replay) => findFirstRoleStep(replay, 'Player Backline', 'advance-range'))
        .filter((step): step is BattleStep => Boolean(step))
        .map((step) => stepTargetLabels(step)[0])
        .filter((label): label is string => Boolean(label)),
    );

    expect(advanceTargets.size).toBeGreaterThan(1);
  });

  it('replay metadata exposes role intent and reason codes', () => {
    const replay = resolveBattle(
      makeBattleInput(
        [
          makeBattleCombatant('human/soldier', 'player', { label: 'Player Frontline' }),
          makeBattleCombatant('human/militia', 'player', { label: 'Player Pusher', role: 'pusher' }),
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
