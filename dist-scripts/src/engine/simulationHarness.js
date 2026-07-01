import { resolveBattle } from "./battle";
import { fixed, fixedAdd } from "./fixed";
import { footprintsTouchOrOverlap } from "./hex";
import { clampStat, getAbility, getTroopDefinitionOrThrow, getUnitClass } from "./unitCatalog";
function cloneStats(stats) {
  return {
    health: clampStat("health", stats.health),
    damage: clampStat("damage", stats.damage),
    rate: clampStat("rate", stats.rate),
    move: clampStat("move", stats.move),
    range: clampStat("range", stats.range),
    armor: clampStat("armor", stats.armor),
    size: clampStat("size", stats.size),
    capacity: clampStat("capacity", stats.capacity)
  };
}
function emptyImpact() {
  return {
    damageDealt: 0,
    hpHealed: 0,
    unitsSummoned: 0,
    buffsApplied: 0,
    redirects: 0
  };
}
function percentile(sortedValues, value) {
  const exactIndex = (sortedValues.length - 1) * value;
  const lower = Math.floor(exactIndex);
  const upper = Math.ceil(exactIndex);
  if (lower === upper) {
    return sortedValues[lower] ?? 0;
  }
  const lowerValue = sortedValues[lower] ?? 0;
  const upperValue = sortedValues[upper] ?? 0;
  const weight = exactIndex - lower;
  return fixed(lowerValue + (upperValue - lowerValue) * weight);
}
function buildPercentiles(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    p10: percentile(sorted, 0.1),
    median: percentile(sorted, 0.5),
    p90: percentile(sorted, 0.9)
  };
}
function average(values) {
  if (values.length === 0) {
    return 0;
  }
  return fixed(values.reduce((sum, value) => sum + value, 0) / values.length);
}
function averageNullable(values) {
  const present = values.filter((value) => value !== null);
  if (present.length === 0) {
    return null;
  }
  return average(present);
}
function buildNullablePercentiles(values) {
  const present = values.filter((value) => value !== null);
  if (present.length === 0) {
    return null;
  }
  return buildPercentiles(present);
}
function getSnapshotUnit(snapshot, unitId) {
  return snapshot.units.find((unit) => unit.id === unitId);
}
function isRoleIntentStep(step) {
  return (step.kind === "move" || step.kind === "engage") && typeof step.metadata?.roleIntent === "string";
}
function matchesRoleIntentFilter(replay, step, filter) {
  if (!isRoleIntentStep(step)) {
    return false;
  }
  const actor = step.actorIds.map((actorId) => getSnapshotUnit(step.snapshot, actorId)).find((unit) => Boolean(unit));
  if (!actor) {
    return false;
  }
  if (filter.actorSide && actor.side !== filter.actorSide) {
    return false;
  }
  if (filter.actorRole && actor.role !== filter.actorRole) {
    return false;
  }
  const intents = filter.roleIntent ? Array.isArray(filter.roleIntent) ? filter.roleIntent : [filter.roleIntent] : null;
  if (intents && !intents.includes(step.metadata.roleIntent)) {
    return false;
  }
  if (filter.targetRole && step.metadata?.targetRole !== filter.targetRole) {
    return false;
  }
  return true;
}
function stepBeat(step, fallbackBeat) {
  if (step.kind === "beat" && typeof step.metadata?.beat === "number") {
    return step.metadata.beat;
  }
  return fallbackBeat;
}
function countFutureTurns(clusterStartsByActor, actorId, stepIndex) {
  const starts = clusterStartsByActor.get(actorId) ?? [];
  let count = 0;
  starts.forEach((start) => {
    if (start > stepIndex) {
      count += 1;
    }
  });
  return count;
}
function isSummonStep(step) {
  return step.kind === "buff" && step.metadata?.effect === "summon";
}
function createSyntheticCombatant(options) {
  return {
    combatantId: options.combatantId,
    raceId: options.raceId ?? "simulation",
    unitClassId: options.unitClassId ?? options.unitClassTag,
    troopInstanceId: options.troopInstanceId ?? null,
    label: options.label,
    role: options.role,
    unitClassTag: options.unitClassTag,
    attributes: [...options.attributes ?? []],
    stats: cloneStats(options.stats),
    abilities: [...options.abilities ?? []],
    quantity: options.quantity ?? 1,
    cost: options.cost ?? 0,
    side: options.side
  };
}
function createCatalogTroopCombatant(troopId, options) {
  const troop = getTroopDefinitionOrThrow(troopId);
  return {
    combatantId: options.combatantId ?? `${options.side}-${troopId}`,
    raceId: troop.raceId,
    unitClassId: troop.unitClassId,
    troopInstanceId: null,
    label: troop.label,
    role: troop.role,
    unitClassTag: troop.unitClassTag,
    attributes: [...troop.attributes],
    stats: cloneStats(troop.stats),
    abilities: [...troop.abilities],
    quantity: options.quantity ?? troop.quantity,
    cost: troop.cost,
    side: options.side
  };
}
function createUnitClassCombatant(unitClassId, options) {
  const unitClass = getUnitClass(unitClassId);
  const abilities = options.abilities ?? (options.includeBaseAbilities === false ? [] : unitClass.abilityIds.map((abilityId) => getAbility(abilityId)));
  return createSyntheticCombatant({
    combatantId: options.combatantId ?? `${options.side}-${unitClassId}`,
    raceId: options.raceId ?? "simulation",
    unitClassId,
    label: options.label ?? unitClass.label,
    side: options.side,
    role: unitClass.role,
    unitClassTag: unitClass.unitClassTag,
    attributes: options.attributes ?? [...unitClass.attributes],
    stats: { ...unitClass.stats, ...options.stats },
    abilities,
    quantity: options.quantity ?? unitClass.quantity,
    cost: unitClass.cost
  });
}
function buildSimulationBattleInput(seed, playerCombatants, enemyCombatants, mutatorIds = []) {
  return {
    seed,
    riftId: null,
    tier: null,
    mutatorIds,
    playerCombatants,
    enemyCombatants
  };
}
function buildEqualCostBundle(leftCost, rightCost) {
  const MAX_EXACT_INSTANCES = 12;
  const MAX_APPROX_INSTANCES = 12;
  const scaledLeft = Math.round(leftCost * 100);
  const scaledRight = Math.round(rightCost * 100);
  const gcd = (a, b) => b === 0 ? a : gcd(b, a % b);
  const divisor = gcd(scaledLeft, scaledRight);
  const scaledTotalCost = scaledLeft * scaledRight / divisor;
  const exactLeftInstances = scaledTotalCost / scaledLeft;
  const exactRightInstances = scaledTotalCost / scaledRight;
  if (exactLeftInstances <= MAX_EXACT_INSTANCES && exactRightInstances <= MAX_EXACT_INSTANCES) {
    return {
      leftInstances: exactLeftInstances,
      rightInstances: exactRightInstances,
      totalCost: fixed(scaledTotalCost / 100)
    };
  }
  let best;
  for (let leftInstances = 1; leftInstances <= MAX_APPROX_INSTANCES; leftInstances += 1) {
    for (let rightInstances = 1; rightInstances <= MAX_APPROX_INSTANCES; rightInstances += 1) {
      const leftTotal = fixed(leftInstances * leftCost);
      const rightTotal = fixed(rightInstances * rightCost);
      const gap = Math.abs(leftTotal - rightTotal);
      const totalCost = Math.max(leftTotal, rightTotal);
      if (!best || gap < best.gap || gap === best.gap && totalCost < best.totalCost || gap === best.gap && totalCost === best.totalCost && leftInstances + rightInstances < best.leftInstances + best.rightInstances) {
        best = {
          leftInstances,
          rightInstances,
          gap,
          totalCost
        };
      }
    }
  }
  if (!best) {
    return {
      leftInstances: 1,
      rightInstances: 1,
      totalCost: fixed(Math.max(leftCost, rightCost))
    };
  }
  return {
    leftInstances: best.leftInstances,
    rightInstances: best.rightInstances,
    totalCost: best.totalCost
  };
}
function createSeedRange(count, start = 0) {
  return Array.from({ length: count }, (_, index) => start + index);
}
function buildRoleScenarioBattleInput(scenarioId, seed) {
  switch (scenarioId) {
    case "frontline-screen":
      return buildSimulationBattleInput(
        seed,
        [
          createCatalogTroopCombatant("human/soldier", {
            combatantId: "player-frontline",
            side: "player",
            quantity: 1
          }),
          createCatalogTroopCombatant("elf/archer", {
            combatantId: "player-backline",
            side: "player",
            quantity: 1
          })
        ],
        [
          createCatalogTroopCombatant("human/soldier", {
            combatantId: "enemy-frontline",
            side: "enemy",
            quantity: 1
          }),
          createCatalogTroopCombatant("elf/archer", {
            combatantId: "enemy-backline",
            side: "enemy",
            quantity: 1
          })
        ]
      );
    case "pusher-breach":
      return buildSimulationBattleInput(
        seed,
        [
          createUnitClassCombatant("militia", {
            combatantId: "player-pusher",
            label: "Benchmark Pusher",
            side: "player",
            stats: { rate: 20 },
            quantity: 1
          })
        ],
        [
          createCatalogTroopCombatant("human/soldier", {
            combatantId: "enemy-screen",
            side: "enemy",
            quantity: 1
          }),
          createCatalogTroopCombatant("elf/archer", {
            combatantId: "enemy-backline",
            side: "enemy",
            quantity: 1
          })
        ]
      );
    case "backline-spacing":
      return buildSimulationBattleInput(
        seed,
        [
          createCatalogTroopCombatant("elf/archer", {
            combatantId: "player-backline",
            side: "player",
            quantity: 1
          })
        ],
        [
          createCatalogTroopCombatant("human/knight", {
            combatantId: "enemy-pursuer",
            side: "enemy",
            quantity: 1
          })
        ]
      );
  }
}
function countRoleIntentSteps(replay, filter) {
  return replay.steps.filter((step) => matchesRoleIntentFilter(replay, step, filter)).length;
}
function findFirstRoleIntentBeat(replay, filter) {
  let currentBeat = 0;
  for (const step of replay.steps) {
    currentBeat = stepBeat(step, currentBeat);
    if (matchesRoleIntentFilter(replay, step, filter)) {
      return currentBeat;
    }
  }
  return null;
}
function extractSimulationMetrics(replay) {
  const unitSide = /* @__PURE__ */ new Map();
  const unitRole = /* @__PURE__ */ new Map();
  const initialUnitIds = new Set(replay.initial.units.map((unit) => unit.id));
  const clusterStartsByActor = /* @__PURE__ */ new Map();
  const summonSpawnBeat = /* @__PURE__ */ new Map();
  const summonDeathBeat = /* @__PURE__ */ new Map();
  const summonedUnitIds = /* @__PURE__ */ new Set();
  const abilitySuccessfulApplications = {};
  const abilityNetImpact = {};
  let currentBeat = 0;
  let firstContactBeat = null;
  let firstBacklineThreatBeat = null;
  let preventedByArmor = 0;
  let totalDamage = 0;
  let summonDamageDealt = 0;
  let summonDamageAbsorbed = 0;
  let summonEngagementsCreated = 0;
  let scalingValueRealized = 0;
  const rememberSnapshot = (snapshot) => {
    snapshot.units.forEach((unit) => {
      unitSide.set(unit.id, unit.side);
      unitRole.set(unit.id, unit.role);
    });
  };
  rememberSnapshot(replay.initial);
  let lastClusterActor = null;
  replay.steps.forEach((step, index) => {
    currentBeat = stepBeat(step, currentBeat);
    rememberSnapshot(step.snapshot);
    const actorId = step.actorIds[0] ?? null;
    if (step.kind === "beat" || !actorId) {
      lastClusterActor = null;
    } else if (actorId !== lastClusterActor) {
      const starts = clusterStartsByActor.get(actorId) ?? [];
      starts.push(index);
      clusterStartsByActor.set(actorId, starts);
      lastClusterActor = actorId;
    }
  });
  currentBeat = 0;
  replay.steps.forEach((step, index) => {
    currentBeat = stepBeat(step, currentBeat);
    const actorId = step.actorIds[0] ?? null;
    if (firstBacklineThreatBeat === null) {
      const aliveBackline = step.snapshot.units.filter((unit) => unit.alive && unit.role === "backline");
      const breached = aliveBackline.some(
        (backline) => step.snapshot.units.some(
          (other) => other.alive && other.side !== backline.side && footprintsTouchOrOverlap(other.occupiedHexes, backline.occupiedHexes)
        )
      );
      if (breached) {
        firstBacklineThreatBeat = currentBeat;
      }
    }
    const sourceAbilityId = typeof step.metadata?.sourceAbilityId === "string" ? step.metadata.sourceAbilityId : null;
    if (sourceAbilityId) {
      const applicationCount = typeof step.metadata?.batchCount === "number" ? step.metadata.batchCount : 1;
      abilitySuccessfulApplications[sourceAbilityId] = (abilitySuccessfulApplications[sourceAbilityId] ?? 0) + applicationCount;
      if (!abilityNetImpact[sourceAbilityId]) {
        abilityNetImpact[sourceAbilityId] = emptyImpact();
      }
    }
    if (isSummonStep(step)) {
      step.targetIds.forEach((unitId) => {
        summonedUnitIds.add(unitId);
        summonSpawnBeat.set(unitId, currentBeat);
      });
      if (sourceAbilityId) {
        abilityNetImpact[sourceAbilityId].unitsSummoned += step.targetIds.length;
      }
    }
    if (step.kind === "death") {
      step.targetIds.forEach((unitId) => {
        if (summonedUnitIds.has(unitId)) {
          summonDeathBeat.set(unitId, currentBeat);
        }
      });
    }
    if (step.kind === "engage") {
      if (actorId && summonedUnitIds.has(actorId)) {
        summonEngagementsCreated += step.targetIds.length;
      }
      if (sourceAbilityId && step.metadata?.effect === "redirect") {
        abilityNetImpact[sourceAbilityId].redirects += step.targetIds.length;
      }
    }
    if (step.kind === "heal") {
      const amount = typeof step.metadata?.amount === "number" ? step.metadata.amount : 0;
      if (sourceAbilityId) {
        abilityNetImpact[sourceAbilityId].hpHealed = fixedAdd(abilityNetImpact[sourceAbilityId].hpHealed, amount);
      }
      return;
    }
    if (step.kind === "buff") {
      const amount = typeof step.metadata?.amount === "number" ? step.metadata.amount : 0;
      const effect = typeof step.metadata?.effect === "string" ? step.metadata.effect : null;
      if (sourceAbilityId && effect && !step.metadata?.expired) {
        abilityNetImpact[sourceAbilityId].buffsApplied += 1;
      }
      if (sourceAbilityId && amount > 0 && effect && (effect === "ramp" || effect === "haste" || effect === "bolster")) {
        const targetId2 = step.targetIds[0];
        if (targetId2) {
          scalingValueRealized = fixedAdd(
            scalingValueRealized,
            fixed(amount * countFutureTurns(clusterStartsByActor, targetId2, index))
          );
        }
      }
      return;
    }
    if (step.kind !== "attack") {
      return;
    }
    const damage = typeof step.metadata?.damage === "number" ? step.metadata.damage : 0;
    const mode = typeof step.metadata?.mode === "string" ? step.metadata.mode : "melee";
    totalDamage = fixedAdd(totalDamage, damage);
    const targetId = step.targetIds[0];
    const actorUnit = actorId ? getSnapshotUnit(step.snapshot, actorId) : void 0;
    const targetUnit = targetId ? getSnapshotUnit(step.snapshot, targetId) : void 0;
    if (mode === "melee" && damage > 0 && firstContactBeat === null) {
      firstContactBeat = currentBeat;
    }
    if (actorId && summonedUnitIds.has(actorId)) {
      summonDamageDealt = fixedAdd(summonDamageDealt, damage);
    }
    if (targetId && summonedUnitIds.has(targetId)) {
      summonDamageAbsorbed = fixedAdd(summonDamageAbsorbed, damage);
    }
    if (sourceAbilityId) {
      abilityNetImpact[sourceAbilityId].damageDealt = fixedAdd(abilityNetImpact[sourceAbilityId].damageDealt, damage);
    }
    if ((mode === "melee" || mode === "ranged") && actorUnit && targetUnit) {
      const mitigated = Math.max(Math.min(actorUnit.stats.damage, targetUnit.stats.armor), 0);
      preventedByArmor = fixedAdd(preventedByArmor, mitigated);
    }
  });
  const summonUptimes = [...summonedUnitIds].map((unitId) => {
    const spawnBeat = summonSpawnBeat.get(unitId) ?? replay.steps.length;
    const deathBeat = summonDeathBeat.get(unitId) ?? currentBeat;
    return Math.max(0, deathBeat - spawnBeat);
  });
  const summonRealizedValue = fixed(summonDamageDealt + summonDamageAbsorbed + summonEngagementsCreated);
  const beatsToEnd = replay.steps.filter((step) => step.kind === "beat").length;
  const initialUnitCount = Math.max(replay.initial.units.length, 1);
  const totalTurnsTaken = [...clusterStartsByActor.values()].reduce((sum, starts) => sum + starts.length, 0);
  const finalAlive = replay.aliveCounts[replay.aliveCounts.length - 1] ?? { player: 0, enemy: 0 };
  return {
    outcome: replay.outcome,
    beatsToEnd,
    firstContactBeat,
    firstBacklineThreatBeat,
    backlineBreachRate: firstBacklineThreatBeat === null ? 0 : 1,
    ownTurnsTakenPerUnit: fixed(totalTurnsTaken / initialUnitCount),
    playerSurvivors: finalAlive.player,
    enemySurvivors: finalAlive.enemy,
    damagePer100Beats: beatsToEnd === 0 ? 0 : fixed(totalDamage * 100 / beatsToEnd),
    effectiveHpPreserved: preventedByArmor,
    summonUptimeBeats: average(summonUptimes),
    summonRealizedValue,
    scalingValueRealized,
    drawRate: replay.outcome === "draw" ? 1 : 0,
    abilitySuccessfulApplications,
    abilityNetImpact
  };
}
function runBattleWithMetrics(input) {
  const replay = resolveBattle(input);
  return {
    replay,
    metrics: extractSimulationMetrics(replay)
  };
}
function sweepBattleSeeds(makeInput, seeds) {
  const entries = seeds.map((seed) => {
    const { replay, metrics } = runBattleWithMetrics(makeInput(seed));
    return {
      seed,
      replayId: replay.id,
      metrics
    };
  });
  const wins = entries.filter((entry) => entry.metrics.outcome === "victory").length;
  const losses = entries.filter((entry) => entry.metrics.outcome === "defeat").length;
  const draws = entries.filter((entry) => entry.metrics.outcome === "draw").length;
  return {
    entries,
    summary: {
      battles: entries.length,
      wins,
      losses,
      draws,
      winRate: entries.length === 0 ? 0 : fixed(wins / entries.length),
      drawRate: entries.length === 0 ? 0 : fixed(draws / entries.length),
      average: {
        beatsToEnd: average(entries.map((entry) => entry.metrics.beatsToEnd)),
        firstContactBeat: averageNullable(entries.map((entry) => entry.metrics.firstContactBeat)),
        firstBacklineThreatBeat: averageNullable(entries.map((entry) => entry.metrics.firstBacklineThreatBeat)),
        ownTurnsTakenPerUnit: average(entries.map((entry) => entry.metrics.ownTurnsTakenPerUnit)),
        summonUptimeBeats: average(entries.map((entry) => entry.metrics.summonUptimeBeats)),
        summonRealizedValue: average(entries.map((entry) => entry.metrics.summonRealizedValue)),
        scalingValueRealized: average(entries.map((entry) => entry.metrics.scalingValueRealized)),
        damagePer100Beats: average(entries.map((entry) => entry.metrics.damagePer100Beats)),
        effectiveHpPreserved: average(entries.map((entry) => entry.metrics.effectiveHpPreserved))
      },
      percentiles: {
        beatsToEnd: buildPercentiles(entries.map((entry) => entry.metrics.beatsToEnd)),
        firstContactBeat: buildNullablePercentiles(entries.map((entry) => entry.metrics.firstContactBeat)),
        firstBacklineThreatBeat: buildNullablePercentiles(entries.map((entry) => entry.metrics.firstBacklineThreatBeat))
      }
    }
  };
}
export {
  buildEqualCostBundle,
  buildRoleScenarioBattleInput,
  buildSimulationBattleInput,
  countRoleIntentSteps,
  createCatalogTroopCombatant,
  createSeedRange,
  createSyntheticCombatant,
  createUnitClassCombatant,
  extractSimulationMetrics,
  findFirstRoleIntentBeat,
  runBattleWithMetrics,
  sweepBattleSeeds
};
//# sourceMappingURL=simulationHarness.js.map
