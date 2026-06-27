import {
  allHexes,
  equalsHex,
  footprintDistance,
  footprintForSize,
  footprintsTouchOrOverlap,
  hexDistance,
  hexKey,
  leftmostHex,
  neighbors,
  rightmostHex,
  visualVerticalLineKey
} from "./hex";
import { fixed, fixedAdd, fixedClamp, fixedMax, fixedMul, fixedSub, fixedSum, formatFixed } from "./fixed";
import { createRng, randomSeed } from "./rng";
import { normalizeBattleInput, normalizeRoleId, normalizeUnitStats } from "./compat";
import { clampStat, composeSummonedTroopDefinition, getAbility, getMutator } from "./unitCatalog";
import {
  effectDisposition,
  filterTargetCandidates,
  matchesFallenTrigger,
  prioritizeCandidates,
  resolveAbilityTargetRadius,
  resolveFallenTriggerRadius
} from "./battleAbilityRules";
import { resolveAbilityTargetRadius as resolveAbilityTargetRadius2 } from "./battleAbilityRules";
import { buildBattleInputFromResolvedCombatants, resolveDebugBattle } from "./battleInput";
const BASE_MAP_RADIUS = 3;
const MAX_BEATS = 1e3;
const MIN_SPAWN_FOOTPRINT_DISTANCE = 2;
const MIN_MELEE_TO_RANGED_SPAWN_DISTANCE = 3;
function chooseFootprintOrientation(rng) {
  return rng.next() < 0.5 ? "north" : "south";
}
function recomputeFootprint(unit) {
  unit.occupiedHexes = footprintForSize(unit.position, unit.resolvedStats.size, unit.footprintOrientation);
}
function mapHexesForRadius(radius) {
  return allHexes(radius);
}
function mapRadiusForHexes(hexes) {
  return Math.max(0, ...hexes.map((hex) => hexDistance(hex, { q: 0, r: 0 })));
}
function parseHexKey(key) {
  const [q, r] = key.split(",").map(Number);
  return { q: q ?? 0, r: r ?? 0 };
}
function hexSetToCoords(hexes) {
  return [...hexes].map(parseHexKey);
}
function translateUnit(unit, delta) {
  unit.position = { q: unit.position.q + delta.q, r: unit.position.r + delta.r };
  recomputeFootprint(unit);
}
function footprintForUnitAt(unit, anchor) {
  return footprintForSize(anchor, unit.resolvedStats.size, unit.footprintOrientation);
}
function footprintFitsMap(footprint, mapHexes) {
  return footprint.every((hex) => mapHexes.has(hexKey(hex)));
}
function footprintsCollide(left, right) {
  const rightKeys = new Set(right.map(hexKey));
  return left.some((hex) => rightKeys.has(hexKey(hex)));
}
function isFootprintPlacementLegal(state, footprint, movingUnitId) {
  if (!footprintFitsMap(footprint, state.mapHexes)) {
    return false;
  }
  return ![...state.units.values()].some((unit) => {
    if (!unit.alive || unit.id === movingUnitId) {
      return false;
    }
    return footprintsCollide(footprint, unit.occupiedHexes);
  });
}
function isUnitAnchorLegal(state, unit, anchor) {
  return isFootprintPlacementLegal(state, footprintForUnitAt(unit, anchor), unit.id);
}
function unitsTouchOrOverlap(left, right) {
  return footprintsTouchOrOverlap(left.occupiedHexes, right.occupiedHexes);
}
function unitFootprintDistance(left, right) {
  return footprintDistance(left.occupiedHexes, right.occupiedHexes);
}
function unitDistanceFromHex(unit, hex) {
  return footprintDistance(unit.occupiedHexes, [hex]);
}
function unitDistanceFromAnchor(unit, anchor, target) {
  return footprintDistance(footprintForUnitAt(unit, anchor), target.occupiedHexes);
}
function unitAtAnchorTouchesUnit(unit, anchor, target) {
  return footprintsTouchOrOverlap(footprintForUnitAt(unit, anchor), target.occupiedHexes);
}
function unitOverlapsHex(unit, hex) {
  return unit.occupiedHexes.some((occupied) => equalsHex(occupied, hex));
}
function unitOverlapsAnyHex(unit, hexes) {
  return footprintsCollide(unit.occupiedHexes, hexes);
}
function unitTouchesHex(unit, hex) {
  return unitDistanceFromHex(unit, hex) <= 1;
}
function unitTouchesAnyHex(unit, hexes) {
  return footprintDistance(unit.occupiedHexes, hexes) <= 1;
}
function unitsInRange(actor, target, range = actor.resolvedStats.range) {
  return unitFootprintDistance(actor, target) <= range;
}
function mirrorHexLeftRight(hex) {
  return { q: -hex.q - hex.r, r: hex.r };
}
function sideVisualDirection(side) {
  return side === "player" ? 1 : -1;
}
function sortedMapAnchors(mapHexes, side) {
  const direction = sideVisualDirection(side);
  return hexSetToCoords(mapHexes).sort(
    (left, right) => direction * (visualVerticalLineKey(left) - visualVerticalLineKey(right)) || Math.abs(left.r) - Math.abs(right.r) || left.r - right.r || left.q - right.q
  );
}
function orientationForAnchor(units, mapHexes, stats, anchor, rng) {
  const legalOrientations = ["north", "south"].filter(
    (orientation) => isFootprintPlacementLegal({ units, mapHexes }, footprintForSize(anchor, stats.size, orientation))
  );
  if (legalOrientations.length === 0) {
    return null;
  }
  return legalOrientations.length === 1 ? legalOrientations[0] : rng.pick(legalOrientations);
}
function createPlacedUnit(side, combatant, index, anchor, orientation, rng) {
  const unitId = `${side}_${combatant.combatantId}_${index}`;
  return {
    id: unitId,
    troopInstanceId: combatant.troopInstanceId,
    troopLabel: combatant.label,
    unitClassId: combatant.unitClassId,
    raceId: combatant.raceId,
    side,
    summonerUnitId: null,
    role: combatant.role,
    unitClassTag: combatant.unitClassTag,
    attributes: [...combatant.attributes],
    position: { ...anchor },
    occupiedHexes: footprintForSize(anchor, combatant.stats.size, orientation),
    footprintOrientation: orientation,
    hp: combatant.stats.health,
    maxHp: combatant.stats.health,
    initiative: fixed(rng.int(11)),
    alive: true,
    engagedWith: /* @__PURE__ */ new Set(),
    resolvedStats: { ...combatant.stats },
    resolvedAbilities: combatant.abilities.map(createRuntimeAbilityState),
    activeTimedEffects: [],
    committedBacklineTargetId: null,
    graveVigorBlockedSides: /* @__PURE__ */ new Set(),
    mercyBeforeDawnUsed: false,
    stonebloodUsed: false,
    fadeIntoShadowUsed: false,
    glamourUsed: false,
    brambleSnareStacks: 0,
    bonusStrikeCharges: 0,
    scavengersHungerKills: 0,
    sentinelRunesTriggered: false,
    berserkDeathPending: false,
    berserkTurnsUntilDeath: 0
  };
}
function minimumDistanceToUnits(footprint, units) {
  if (units.length === 0) {
    return Number.POSITIVE_INFINITY;
  }
  return Math.min(...units.map((unit) => footprintDistance(footprint, unit.occupiedHexes)));
}
function sharesVisualVerticalLine(footprint, reference) {
  const referenceKey = visualVerticalLineKey(reference);
  return footprint.some((hex) => visualVerticalLineKey(hex) === referenceKey);
}
function placeCombatantCategory(side, placementSide, category, combatants, units, mapHexes, rng, indexOffset, rangedUnits) {
  if (combatants.length === 0) {
    return [];
  }
  const placed = [];
  const shuffled = rng.shuffle(combatants);
  const anchors = sortedMapAnchors(mapHexes, placementSide);
  let referenceLineHex = null;
  let meleeReferenceHex = null;
  if (category === "melee" && rangedUnits.length > 0) {
    const closestRanged = [...rangedUnits].sort(
      (left, right) => hexDistance({ q: 0, r: 0 }, left.position) - hexDistance({ q: 0, r: 0 }, right.position) || left.id.localeCompare(right.id)
    )[0];
    meleeReferenceHex = side === "player" ? rightmostHex(closestRanged.occupiedHexes) : leftmostHex(closestRanged.occupiedHexes);
  }
  for (const [offset, combatant] of shuffled.entries()) {
    const buildCandidatePlacements = (strict) => anchors.flatMap((anchor) => ["north", "south"].map((orientation) => {
      const footprint = footprintForSize(anchor, combatant.stats.size, orientation);
      if (!isFootprintPlacementLegal({ units, mapHexes }, footprint)) {
        return null;
      }
      const friendlyUnits = [...units.values()].filter((unit2) => unit2.side === side);
      const friendlyRanged = friendlyUnits.filter((unit2) => unit2.resolvedStats.range > 0);
      if (minimumDistanceToUnits(footprint, friendlyUnits) < MIN_SPAWN_FOOTPRINT_DISTANCE) {
        return null;
      }
      if (strict && category === "ranged" && placed.length > 0) {
        if (referenceLineHex && !sharesVisualVerticalLine(footprint, referenceLineHex)) {
          return null;
        }
      }
      if (strict && category === "melee") {
        if (meleeReferenceHex && placed.length === 0 && footprintDistance(footprint, [meleeReferenceHex]) < 5) {
          return null;
        }
        if (referenceLineHex && placed.length > 0 && !sharesVisualVerticalLine(footprint, referenceLineHex)) {
          return null;
        }
      }
      if (category === "melee" && minimumDistanceToUnits(footprint, friendlyRanged) < MIN_MELEE_TO_RANGED_SPAWN_DISTANCE) {
        return null;
      }
      return {
        anchor,
        orientation,
        footprint,
        centerDistance: hexDistance(anchor, { q: 0, r: 0 }),
        edgeScore: sideVisualDirection(placementSide) * visualVerticalLineKey(anchor)
      };
    })).filter((entry) => entry !== null).sort((left, right) => {
      if (category === "melee" && meleeReferenceHex && placed.length === 0) {
        const leftGap = Math.abs(footprintDistance(left.footprint, [meleeReferenceHex]) - 5);
        const rightGap = Math.abs(footprintDistance(right.footprint, [meleeReferenceHex]) - 5);
        if (leftGap !== rightGap) return leftGap - rightGap;
      }
      return left.edgeScore - right.edgeScore || left.centerDistance - right.centerDistance || left.anchor.r - right.anchor.r || left.anchor.q - right.anchor.q;
    });
    const candidatePlacements = buildCandidatePlacements(true);
    const relaxedCandidatePlacements = candidatePlacements.length > 0 ? candidatePlacements : buildCandidatePlacements(false);
    if (relaxedCandidatePlacements.length === 0) {
      return null;
    }
    const selected = relaxedCandidatePlacements[0];
    const unit = createPlacedUnit(side, combatant, indexOffset + offset, selected.anchor, selected.orientation, rng);
    units.set(unit.id, unit);
    placed.push(unit);
    if (!referenceLineHex) {
      referenceLineHex = placementSide === "player" ? leftmostHex(unit.occupiedHexes) : rightmostHex(unit.occupiedHexes);
    }
  }
  return placed;
}
function placeUnitsForSide(side, combatants, units, mapHexes, rng, placementSide = side) {
  const existingUnitIds = new Set(units.keys());
  const rollback = () => {
    [...units.keys()].forEach((unitId) => {
      if (!existingUnitIds.has(unitId)) {
        units.delete(unitId);
      }
    });
  };
  const ranged = combatants.filter((combatant) => combatant.stats.range > 0);
  const melee = combatants.filter((combatant) => combatant.stats.range === 0);
  const rangedPlaced = placeCombatantCategory(side, placementSide, "ranged", ranged, units, mapHexes, rng, 0, []);
  if (!rangedPlaced) {
    rollback();
    return false;
  }
  const meleePlaced = placeCombatantCategory(side, placementSide, "melee", melee, units, mapHexes, rng, ranged.length, rangedPlaced);
  if (!meleePlaced) {
    rollback();
    return false;
  }
  return true;
}
function expandedMapHexes(mapHexes, placementSide, margin) {
  const current = hexSetToCoords(mapHexes);
  if (current.length === 0) {
    return new Set(mapHexesForRadius(BASE_MAP_RADIUS + margin).map(hexKey));
  }
  const qValues = current.map((hex) => hex.q);
  const rValues = current.map((hex) => hex.r);
  const minQ = Math.min(...qValues) - (placementSide === "player" ? margin : 0);
  const maxQ = Math.max(...qValues) + (placementSide === "enemy" ? margin : 0);
  const minR = Math.min(...rValues) - margin;
  const maxR = Math.max(...rValues) + margin;
  const next = /* @__PURE__ */ new Set();
  for (let q = minQ; q <= maxQ; q += 1) {
    for (let r = minR; r <= maxR; r += 1) {
      next.add(hexKey({ q, r }));
    }
  }
  return next;
}
function placeUnitsForSideWithMapExpansion(side, combatants, units, mapHexes, rng, placementSide) {
  for (let margin = 0; margin <= 100; margin += 1) {
    const candidateMapHexes = margin === 0 ? mapHexes : expandedMapHexes(mapHexes, placementSide, margin);
    if (placeUnitsForSide(side, combatants, units, candidateMapHexes, rng, placementSide)) {
      return candidateMapHexes;
    }
  }
  throw new Error(`Failed to place ${side} units after expanding the explicit battlefield.`);
}
function closestOpposingFootprintDistance(units) {
  const players = [...units.values()].filter((unit) => unit.side === "player");
  const enemies = [...units.values()].filter((unit) => unit.side === "enemy");
  if (players.length === 0 || enemies.length === 0) {
    return 7;
  }
  let closest = Number.POSITIVE_INFINITY;
  players.forEach((player) => {
    enemies.forEach((enemy) => {
      closest = Math.min(closest, footprintDistance(player.occupiedHexes, enemy.occupiedHexes));
    });
  });
  return closest;
}
function translateSide(units, side, delta) {
  units.forEach((unit) => {
    if (unit.side === side) {
      translateUnit(unit, delta);
    }
  });
}
function filledMapFromUnitBounds(units) {
  const occupied = [...units.values()].flatMap((unit) => unit.occupiedHexes);
  if (occupied.length === 0) {
    return mapHexesForRadius(BASE_MAP_RADIUS);
  }
  const visualLineValues = occupied.map(visualVerticalLineKey);
  const rValues = occupied.map((hex) => hex.r);
  const minVisualLine = Math.min(...visualLineValues) - 2;
  const maxVisualLine = Math.max(...visualLineValues) + 2;
  const minR = Math.min(...rValues);
  const maxR = Math.max(...rValues);
  const lineForRowAtOrBelow = (line, r) => line - Math.abs(line - r) % 2;
  const lineForRowAtOrAbove = (line, r) => line + Math.abs(line - r) % 2;
  const hexes = [];
  for (let r = minR; r <= maxR; r += 1) {
    const rowMinLine = lineForRowAtOrBelow(minVisualLine, r);
    const rowMaxLine = lineForRowAtOrAbove(maxVisualLine, r);
    const rowMinQ = (rowMinLine - r) / 2;
    const rowMaxQ = (rowMaxLine - r) / 2;
    for (let q = rowMinQ; q <= rowMaxQ; q += 1) {
      hexes.push({ q, r });
    }
  }
  return hexes;
}
function finalizeInitialMap(units) {
  let distance = closestOpposingFootprintDistance(units);
  let guard = 0;
  while (distance !== 7 && guard < 100) {
    translateSide(units, "enemy", { q: distance < 7 ? 1 : -1, r: 0 });
    distance = closestOpposingFootprintDistance(units);
    guard += 1;
  }
  if (distance !== 7) {
    throw new Error(`Failed to finalize battlefield gap: closest opposing footprint distance is ${distance}`);
  }
  const mapHexes = filledMapFromUnitBounds(units);
  return { mapHexes, mapRadius: mapRadiusForHexes(mapHexes) };
}
function makeReplayId(seed, riftId) {
  return `${riftId ?? "debug"}-${seed}`;
}
function buildEffects(mutatorIds) {
  return mutatorIds.reduce(
    (effects, mutatorId) => {
      const definition = getMutator(mutatorId);
      return {
        initiativeBonusPerBeat: effects.initiativeBonusPerBeat + (definition.initiativeBonusPerBeat ?? 0),
        rangedDamageMultiplier: effects.rangedDamageMultiplier * (definition.rangedDamageMultiplier ?? 1),
        removeFading: effects.removeFading || Boolean(definition.removeFading),
        armorCap: typeof definition.armorCap === "number" ? effects.armorCap === null ? definition.armorCap : Math.min(effects.armorCap, definition.armorCap) : effects.armorCap,
        randomMoveEveryBeats: typeof definition.randomMoveEveryBeats === "number" ? effects.randomMoveEveryBeats === null ? definition.randomMoveEveryBeats : Math.min(effects.randomMoveEveryBeats, definition.randomMoveEveryBeats) : effects.randomMoveEveryBeats,
        decayDamagePerBeat: effects.decayDamagePerBeat + (definition.decayDamagePerBeat ?? 0)
      };
    },
    { initiativeBonusPerBeat: 0, rangedDamageMultiplier: 1, removeFading: false, armorCap: null, randomMoveEveryBeats: null, decayDamagePerBeat: 0 }
  );
}
function filterMutatorBlockedAbilities(abilities, effects) {
  if (!effects.removeFading) {
    return abilities;
  }
  return abilities.filter((entry) => ("definition" in entry ? entry.definition.id : entry.id) !== "fading");
}
function applyArmorCap(value, effects) {
  if (effects.armorCap === null) {
    return value;
  }
  return Math.min(value, effects.armorCap);
}
function applyMutatorAdjustmentsToUnit(unit, effects) {
  unit.resolvedAbilities = filterMutatorBlockedAbilities(unit.resolvedAbilities, effects);
  unit.resolvedStats.armor = applyArmorCap(unit.resolvedStats.armor, effects);
}
function getSideRaceUpgradeIds(state, side) {
  return side === "player" ? state.input.playerRaceUpgradeIds ?? [] : state.input.enemyRaceUpgradeIds ?? [];
}
function getSideTroopClassUpgradeIds(state, side) {
  return side === "player" ? state.input.playerTroopClassUpgradeIds ?? [] : state.input.enemyTroopClassUpgradeIds ?? [];
}
function sideHasRaceUpgrade(state, side, upgradeId) {
  return getSideRaceUpgradeIds(state, side).includes(upgradeId);
}
function inputSideHasRaceUpgrade(input, side, upgradeId) {
  return (side === "player" ? input.playerRaceUpgradeIds ?? [] : input.enemyRaceUpgradeIds ?? []).includes(upgradeId);
}
function sideHasTroopClassUpgrade(state, side, upgradeId) {
  return getSideTroopClassUpgradeIds(state, side).includes(upgradeId);
}
function cloneSnapshot(units) {
  return {
    units: [...units.values()].map((unit) => ({
      id: unit.id,
      troopInstanceId: unit.troopInstanceId,
      troopId: `${unit.raceId}/${unit.unitClassId}`,
      troopLabel: unit.troopLabel,
      unitClassId: unit.unitClassId,
      raceId: unit.raceId,
      side: unit.side,
      role: unit.role,
      unitClassTag: unit.unitClassTag,
      attributes: [...unit.attributes],
      position: { ...unit.position },
      occupiedHexes: unit.occupiedHexes.map((hex) => ({ ...hex })),
      footprintOrientation: unit.footprintOrientation,
      stats: { ...unit.resolvedStats },
      hp: fixed(unit.hp),
      maxHp: fixed(unit.maxHp),
      initiative: fixed(unit.initiative),
      alive: unit.alive,
      engagedWithIds: [...unit.engagedWith]
    }))
  };
}
function createAliveCount(snapshot) {
  const byTroopLabel = {};
  let player = 0;
  let enemy = 0;
  snapshot.units.forEach((unit) => {
    if (!unit.alive) {
      return;
    }
    if (unit.side === "player") {
      player += 1;
    } else {
      enemy += 1;
    }
    byTroopLabel[unit.troopLabel] = (byTroopLabel[unit.troopLabel] ?? 0) + 1;
  });
  return { player, enemy, byTroopLabel };
}
function cloneAbilityDefinition(ability) {
  return {
    ...ability,
    trigger: { ...ability.trigger, fallen: ability.trigger.fallen ? { ...ability.trigger.fallen } : void 0 },
    duration: { ...ability.duration },
    target: ability.target ? {
      ...ability.target,
      filters: ability.target.filters ? {
        notClasses: ability.target.filters.notClasses ? [...ability.target.filters.notClasses] : void 0,
        onlyClasses: ability.target.filters.onlyClasses ? [...ability.target.filters.onlyClasses] : void 0,
        prioritizeClasses: ability.target.filters.prioritizeClasses ? [...ability.target.filters.prioritizeClasses] : void 0,
        unengaged: ability.target.filters.unengaged
      } : void 0
    } : void 0,
    effects: ability.effects.map((effect) => ({ ...effect }))
  };
}
function createRuntimeAbilityState(ability) {
  return {
    definition: cloneAbilityDefinition(ability),
    triggerCount: 0,
    usesRemaining: ability.trigger.maxUses ?? null
  };
}
function buildTroopProfiles(input, summonedProfiles, effects) {
  const seen = /* @__PURE__ */ new Set();
  const profiles = [];
  [...input.playerCombatants, ...input.enemyCombatants].forEach((combatant) => {
    const key = `${combatant.side}:${combatant.label}`;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    const stats = { ...combatant.stats, armor: applyArmorCap(combatant.stats.armor, effects) };
    const abilities = filterMutatorBlockedAbilities(combatant.abilities, effects).map(cloneAbilityDefinition);
    const statBreakdowns = combatant.statBreakdowns ? {
      ...combatant.statBreakdowns,
      armor: stats.armor === combatant.stats.armor ? combatant.statBreakdowns.armor : {
        ...combatant.statBreakdowns.armor,
        finalValue: stats.armor,
        lines: [
          ...combatant.statBreakdowns.armor.lines,
          { label: "Corrosion", value: fixedSub(stats.armor, combatant.stats.armor), kind: "delta" }
        ]
      }
    } : void 0;
    profiles.push({
      side: combatant.side,
      troopLabel: combatant.label,
      unitClassId: combatant.unitClassId,
      raceId: combatant.raceId,
      role: combatant.role,
      unitClassTag: combatant.unitClassTag,
      attributes: [...combatant.attributes],
      stats,
      abilities,
      statBreakdowns: statBreakdowns ?? {
        health: { stat: "health", finalValue: stats.health, lines: [{ label: "Resolved", value: stats.health, kind: "base" }] },
        damage: { stat: "damage", finalValue: stats.damage, lines: [{ label: "Resolved", value: stats.damage, kind: "base" }] },
        speed: { stat: "speed", finalValue: stats.speed, lines: [{ label: "Resolved", value: stats.speed, kind: "base" }] },
        ...combatant.role === "frontline" ? { move: { stat: "move", finalValue: stats.move, lines: [{ label: "Resolved", value: stats.move, kind: "base" }] } } : {},
        armor: { stat: "armor", finalValue: stats.armor, lines: [{ label: "Resolved", value: stats.armor, kind: "base" }] },
        range: { stat: "range", finalValue: stats.range, lines: [{ label: "Resolved", value: stats.range, kind: "base" }] },
        capacity: { stat: "capacity", finalValue: stats.capacity, lines: [{ label: "Resolved", value: stats.capacity, kind: "base" }] },
        size: { stat: "size", finalValue: stats.size, lines: [{ label: "Resolved", value: stats.size, kind: "base" }] }
      }
    });
  });
  summonedProfiles.forEach((profile, key) => {
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    profiles.push(profile);
  });
  return profiles;
}
function buildStep(state, kind, actorIds, targetIds, message, metadata) {
  const enrichedMetadata = enrichStepMetadata(state, kind, actorIds, targetIds, metadata);
  const formattedMessage = appendSourceContext(state, actorIds, message, enrichedMetadata);
  const previous = state.steps[state.steps.length - 1];
  if (previous && tryMergeStep(state, previous, kind, actorIds, targetIds, formattedMessage, enrichedMetadata)) {
    return;
  }
  state.steps.push({
    index: state.steps.length,
    kind,
    actorIds,
    targetIds,
    message: formattedMessage,
    metadata: enrichedMetadata,
    snapshot: cloneSnapshot(state.units)
  });
}
function sameIds(left, right) {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}
function mergeUniqueIds(left, right) {
  const seen = new Set(left);
  const merged = [...left];
  right.forEach((id) => {
    if (!seen.has(id)) {
      seen.add(id);
      merged.push(id);
    }
  });
  return merged;
}
function canMergeStep(previous, kind, actorIds, metadata) {
  const previousMetadata = previous.metadata;
  if (!previousMetadata || !metadata || previous.kind !== kind || !sameIds(previous.actorIds, actorIds)) {
    return false;
  }
  if (!metadata.sourceAbilityId || previousMetadata.sourceAbilityId !== metadata.sourceAbilityId) {
    return false;
  }
  if (previousMetadata.effect !== metadata.effect) {
    return false;
  }
  return previousMetadata.stat === metadata.stat && previousMetadata.temporary === metadata.temporary && previousMetadata.expired === metadata.expired && previousMetadata.abilityId === metadata.abilityId && previousMetadata.role === metadata.role && previousMetadata.unitClassId === metadata.unitClassId;
}
function mergedNumericValue(left, right) {
  return typeof left === "number" && typeof right === "number" ? fixedAdd(left, right) : void 0;
}
function unitLabelsForIds(state, targetIds) {
  return targetIds.map((id) => state.units.get(id)?.troopLabel).filter((label) => Boolean(label));
}
function formatTargetSubject(state, targetIds) {
  const labels = [...new Set(unitLabelsForIds(state, targetIds))];
  if (labels.length === 0) {
    return "Targets";
  }
  if (labels.length === 1) {
    return labels[0];
  }
  if (labels.length === 2) {
    return `${labels[0]} and ${labels[1]}`;
  }
  return `${labels[0]} and ${labels.length - 1} others`;
}
function subjectVerb(subject, singularVerb, pluralVerb) {
  return subject.includes(" and ") ? pluralVerb : singularVerb;
}
function rebuildBatchedMessage(state, step) {
  const metadata = step.metadata;
  if (!metadata) {
    return step.message;
  }
  const targetSubject = formatTargetSubject(state, step.targetIds);
  const amount = typeof metadata.amount === "number" ? metadata.amount : void 0;
  const sourceSuffix = sourceLabelForStep(state, step.actorIds, metadata);
  const finish = (base) => sourceSuffix ? `${base} from the ${sourceSuffix}.` : `${base}.`;
  const untilEndOfTurn = metadata.temporary === true && metadata.expired !== true ? " until end of turn" : "";
  const verb = metadata.expired === true || typeof amount === "number" && amount < 0 ? "loses" : "gains";
  const signedAmount = typeof amount === "number" ? verb === "gains" ? formatSigned(amount) : formatSigned(Math.abs(amount)) : null;
  if ((metadata.effect === "ramp" || metadata.effect === "statDelta" && metadata.stat === "damage") && signedAmount) {
    return finish(`${targetSubject} ${subjectVerb(targetSubject, verb, verb === "gains" ? "gain" : "lose")} ${signedAmount} damage${untilEndOfTurn}`);
  }
  if ((metadata.effect === "haste" || metadata.effect === "statDelta" && metadata.stat === "speed") && signedAmount) {
    return finish(`${targetSubject} ${subjectVerb(targetSubject, verb, verb === "gains" ? "gain" : "lose")} ${signedAmount} speed${untilEndOfTurn}`);
  }
  if (metadata.effect === "bolster" && signedAmount) {
    return finish(`${targetSubject} ${subjectVerb(targetSubject, verb, verb === "gains" ? "gain" : "lose")} ${signedAmount} health${untilEndOfTurn}`);
  }
  if (metadata.effect === "initiativeDelta" && signedAmount) {
    return finish(`${targetSubject} ${subjectVerb(targetSubject, verb, verb === "gains" ? "gain" : "lose")} ${signedAmount} initiative`);
  }
  if (metadata.effect === "summon") {
    const actor = step.actorIds.length === 1 ? state.units.get(step.actorIds[0]) ?? null : null;
    const summonedLabels = [...new Set(unitLabelsForIds(state, step.targetIds))];
    const summonedLabel = summonedLabels.length === 1 ? summonedLabels[0] : `${step.targetIds.length} units`;
    const countSuffix = step.targetIds.length > 1 && summonedLabels.length === 1 ? ` x${step.targetIds.length}` : "";
    return finish(`${actor?.troopLabel ?? "A unit"} summons ${summonedLabel}${countSuffix}`);
  }
  if (metadata.effect === "heal" && typeof metadata.amount === "number") {
    const actor = step.actorIds.length === 1 ? state.units.get(step.actorIds[0]) ?? null : null;
    return finish(`${actor?.troopLabel ?? "A unit"} heals ${targetSubject} for ${formatFixed(metadata.amount)}`);
  }
  if (kindIsAttackStep(step) && typeof metadata.damage === "number") {
    const actor = step.actorIds.length === 1 ? state.units.get(step.actorIds[0]) ?? null : null;
    const mode = metadata.mode === "blast" ? "blast damage to" : "damage to";
    return finish(`${actor?.troopLabel ?? "A unit"} deals ${formatFixed(metadata.damage)} ${mode} ${targetSubject}`);
  }
  return step.message;
}
function kindIsAttackStep(step) {
  return step.kind === "attack";
}
function tryMergeStep(state, previous, kind, actorIds, targetIds, _message, metadata) {
  if (!canMergeStep(previous, kind, actorIds, metadata)) {
    return false;
  }
  const repeatsExistingTargets = targetIds.length > 0 && targetIds.every((id) => previous.targetIds.includes(id));
  previous.targetIds = mergeUniqueIds(previous.targetIds, targetIds);
  const previousMetadata = previous.metadata;
  if (repeatsExistingTargets || targetIds.length === 0) {
    const amount = mergedNumericValue(previousMetadata.amount, metadata.amount);
    if (typeof amount === "number") {
      previousMetadata.amount = amount;
    }
    const damage = mergedNumericValue(previousMetadata.damage, metadata.damage);
    if (typeof damage === "number") {
      previousMetadata.damage = damage;
      previousMetadata.finalDamage = damage;
    }
  }
  previousMetadata.batchCount = (typeof previousMetadata.batchCount === "number" ? previousMetadata.batchCount : 1) + 1;
  previous.snapshot = cloneSnapshot(state.units);
  previous.metadata = enrichStepMetadata(state, previous.kind, previous.actorIds, previous.targetIds, previousMetadata);
  previous.message = rebuildBatchedMessage(state, previous);
  return true;
}
function buildAbilityExplanation(metadata) {
  if (!metadata.sourceAbilityId && !metadata.sourceAbilityLabel) {
    return void 0;
  }
  return {
    abilityId: metadata.sourceAbilityId ?? "battle-resolution",
    abilityLabel: metadata.sourceAbilityLabel,
    effect: typeof metadata.effect === "string" ? metadata.effect : void 0
  };
}
function buildMovementExplanation(kind, actor, metadata) {
  const hasDestination = typeof metadata.toQ === "number" && typeof metadata.toR === "number";
  const hasRoleDecision = typeof metadata.roleIntent === "string" && typeof metadata.reasonCode === "string";
  const effect = typeof metadata.effect === "string" ? metadata.effect : void 0;
  if (!hasDestination && !hasRoleDecision && !effect && kind !== "engage") {
    return void 0;
  }
  const movementKind = hasRoleDecision ? "objective" : effect === "fadeIntoShadow" || effect === "skirmishersStep" ? "ability" : effect ? "retreat" : "generic";
  const movementPhase = effect === "fadeIntoShadow" || effect === "skirmishersStep" ? "ability" : effect ? "withdraw" : kind === "engage" ? "commit" : hasDestination || hasRoleDecision ? "approach" : "generic";
  return {
    stepKind: kind,
    movementKind,
    movementPhase,
    unitRole: actor?.role,
    roleIntent: metadata.roleIntent,
    reasonCode: metadata.reasonCode,
    targetRole: metadata.targetRole,
    targetHex: typeof metadata.targetHexQ === "number" && typeof metadata.targetHexR === "number" ? { q: metadata.targetHexQ, r: metadata.targetHexR } : void 0,
    destination: hasDestination ? { q: metadata.toQ, r: metadata.toR } : void 0,
    routedAroundBlockedHex: typeof metadata.routedAroundBlockedQ === "number" && typeof metadata.routedAroundBlockedR === "number" ? { q: metadata.routedAroundBlockedQ, r: metadata.routedAroundBlockedR } : void 0,
    keepEnemyInRange: effect === "skirmishersStep" ? true : void 0
  };
}
function buildDamageExplanation(metadata) {
  if (typeof metadata.damage !== "number" || typeof metadata.mode !== "string" || typeof metadata.category !== "string") {
    return void 0;
  }
  return {
    mode: metadata.mode,
    category: metadata.category,
    baseDamage: typeof metadata.baseDamage === "number" ? metadata.baseDamage : metadata.damage,
    attackDamageBeforeArmor: typeof metadata.attackDamageBeforeArmor === "number" ? metadata.attackDamageBeforeArmor : metadata.damage,
    finalDamage: metadata.damage,
    heartseekerMultiplier: typeof metadata.heartseekerMultiplier === "number" ? metadata.heartseekerMultiplier : void 0,
    distanceBonus: typeof metadata.distanceBonus === "number" ? metadata.distanceBonus : void 0,
    armorBefore: typeof metadata.armorBefore === "number" ? metadata.armorBefore : void 0,
    armorReduction: typeof metadata.armorReduction === "number" ? metadata.armorReduction : void 0,
    armorApplied: typeof metadata.armorApplied === "number" ? metadata.armorApplied : void 0,
    armorInteraction: metadata.armorIgnored ? "ignored" : "normal",
    rangedMultiplier: typeof metadata.rangedMultiplier === "number" ? metadata.rangedMultiplier : void 0
  };
}
function enrichStepMetadata(state, kind, actorIds, targetIds, metadata) {
  if (!metadata) {
    return void 0;
  }
  const activeUnitId = metadata.activeUnitId ?? actorIds[0] ?? targetIds[0];
  const secondaryUnitIds = metadata.secondaryUnitIds ?? [...new Set([...actorIds, ...targetIds].filter((id) => id !== activeUnitId))];
  const participationMetadata = {
    ...metadata,
    activeUnitId,
    secondaryUnitIds
  };
  if (metadata.explanation) {
    return participationMetadata;
  }
  const actor = actorIds.length === 1 ? state.units.get(actorIds[0]) ?? null : null;
  const explanation = {};
  if (kind === "beat" && typeof metadata.beat === "number") {
    explanation.beat = {
      beat: metadata.beat,
      initiativeBonus: typeof metadata.initiativeBonus === "number" ? metadata.initiativeBonus : 0,
      initiativePurposeHint: "Initiative fills until a unit reaches 100 and takes a turn."
    };
  }
  if (kind === "move" || kind === "engage") {
    const movement = buildMovementExplanation(kind, actor, metadata);
    if (movement) {
      explanation.movement = movement;
    }
  }
  if (kind === "attack") {
    const damage = buildDamageExplanation(metadata);
    if (damage) {
      explanation.damage = damage;
    }
  }
  if (kind === "buff" || kind === "heal" || kind === "death" || kind === "engage" || kind === "move" || kind === "attack") {
    const ability = buildAbilityExplanation(metadata);
    if (ability) {
      explanation.ability = ability;
    }
  }
  return Object.keys(explanation).length > 0 ? { ...participationMetadata, explanation } : participationMetadata;
}
function emitRoleIntentStep(state, kind, actor, targets, message, metadata) {
  buildStep(state, kind, [actor.id], targets.map((target) => target.id), message, metadata);
}
function expandCombatants(combatants) {
  return combatants.flatMap(
    (combatant) => Array.from({ length: combatant.quantity }, (_, index) => ({
      ...combatant,
      quantity: 1,
      combatantId: `${combatant.combatantId}-${index + 1}`
    }))
  );
}
function shouldDelayForDiggyHole(input, combatant) {
  return combatant.raceId === "dwarf" && inputSideHasRaceUpgrade(input, combatant.side, "dwarf-diggy-hole");
}
function initializeUnits(input, rng) {
  let radius = BASE_MAP_RADIUS;
  const playerExpanded = expandCombatants(input.playerCombatants);
  const enemyExpanded = expandCombatants(input.enemyCombatants);
  const pendingDiggyHoleCombatants = {
    player: playerExpanded.filter((combatant) => shouldDelayForDiggyHole(input, combatant)),
    enemy: enemyExpanded.filter((combatant) => shouldDelayForDiggyHole(input, combatant))
  };
  const playerUnits = playerExpanded.filter((combatant) => !shouldDelayForDiggyHole(input, combatant));
  const enemyUnits = enemyExpanded.filter((combatant) => !shouldDelayForDiggyHole(input, combatant));
  for (let attempts = 0; attempts <= 100; attempts += 1) {
    const units = /* @__PURE__ */ new Map();
    const mapHexes = new Set(mapHexesForRadius(radius).map(hexKey));
    const playerOk = placeUnitsForSide("player", playerUnits, units, mapHexes, rng);
    const enemyOk = playerOk && placeUnitsForSide("enemy", enemyUnits, units, mapHexes, rng);
    if (playerOk && enemyOk) {
      const finalized = finalizeInitialMap(units);
      return { units, mapRadius: finalized.mapRadius, mapHexes: finalized.mapHexes, pendingDiggyHoleCombatants };
    }
    radius += 1;
  }
  throw new Error("Failed to place initial battle units after expanding the explicit battlefield.");
}
function getAliveUnits(state, side) {
  return [...state.units.values()].filter((unit) => unit.alive && (!side || unit.side === side));
}
function assertUnitLive(unit, context) {
  if (import.meta.env.DEV && !unit.alive) {
    throw new Error(`[battle] Mutation attempted on dead unit "${unit.id}" (${unit.troopLabel}) in ${context}`);
  }
}
function hasPendingDiggyHoleUnits(state, side) {
  return state.pendingDiggyHoleCombatants[side].length > 0;
}
function resolveBattleOutcome(state) {
  const playerAlive = getAliveUnits(state, "player").length > 0;
  const enemyAlive = getAliveUnits(state, "enemy").length > 0;
  if (playerAlive && !enemyAlive) return "victory";
  if (!playerAlive && enemyAlive) return "defeat";
  return "draw";
}
function clearStaleEngagements(state) {
  state.units.forEach((unit) => {
    unit.engagedWith.forEach((enemyId) => {
      const enemy = state.units.get(enemyId);
      if (!enemy?.alive || enemy.side === unit.side || !unitsTouchOrOverlap(enemy, unit)) {
        unit.engagedWith.delete(enemyId);
        enemy?.engagedWith.delete(unit.id);
      }
    });
  });
}
function clearBacklineCommitmentsTo(state, targetId) {
  state.units.forEach((unit) => {
    if (unit.committedBacklineTargetId === targetId) {
      unit.committedBacklineTargetId = null;
    }
  });
}
function clearInvalidBacklineCommitments(state) {
  state.units.forEach((unit) => {
    if (!unit.committedBacklineTargetId) {
      return;
    }
    const target = state.units.get(unit.committedBacklineTargetId);
    if (!target?.alive || target.side === unit.side || target.role !== "backline") {
      unit.committedBacklineTargetId = null;
    }
  });
}
function availableCapacity(state, unit) {
  const used = fixedSum(
    [...unit.engagedWith].map((enemyId) => state.units.get(enemyId)).filter((enemy) => Boolean(enemy)).map((enemy) => enemy.resolvedStats.size)
  );
  return fixedMax(fixedSub(unit.resolvedStats.capacity, used), 0);
}
function touchingEnemies(state, unit) {
  return getAliveUnits(state).filter((other) => other.side !== unit.side && unitsTouchOrOverlap(other, unit));
}
function touchingUnengagedEnemies(state, unit) {
  return touchingEnemies(state, unit).filter((enemy) => enemy.engagedWith.size === 0);
}
function removeAllEngagements(state, unit) {
  [...unit.engagedWith].forEach((enemyId) => {
    const enemy = state.units.get(enemyId);
    if (enemy) {
      enemy.engagedWith.delete(unit.id);
    }
    unit.engagedWith.delete(enemyId);
  });
}
function createEngagement(state, actor, target) {
  actor.engagedWith.add(target.id);
  target.engagedWith.add(actor.id);
  if (!target.fadeIntoShadowUsed && hasAbility(target, "fade-into-shadow") && target.role === "backline" && target.attributes.includes("elf")) {
    target.fadeIntoShadowUsed = true;
    retreatFromEngagement(state, target, actor, `${target.troopLabel} fades into shadow.`, "fadeIntoShadow");
  }
  if (actor.alive && target.alive && actor.engagedWith.has(target.id) && hasAbility(actor, "first-blood")) {
    attack(state, actor, target, actor.resolvedStats.range > 0 ? "ranged" : "melee", true, 0, "normal");
  }
}
function engageTouchingEnemies(state, actor, roles = [], includeAlreadyEngaged = false) {
  let remainingCapacity = availableCapacity(state, actor);
  const engagedTargets = [];
  const candidates = touchingEnemies(state, actor).filter((enemy) => matchesRoleFilter(enemy, roles)).filter((enemy) => !actor.engagedWith.has(enemy.id)).filter((enemy) => includeAlreadyEngaged || enemy.engagedWith.size === 0);
  const candidatesByPriority = [
    ...state.rng.shuffle(candidates.filter((enemy) => enemy.engagedWith.size === 0)),
    ...state.rng.shuffle(candidates.filter((enemy) => enemy.engagedWith.size > 0))
  ];
  if (remainingCapacity <= 0 || candidatesByPriority.length === 0) {
    return engagedTargets;
  }
  candidatesByPriority.forEach((enemy) => {
    if (enemy.resolvedStats.size <= remainingCapacity && enemy.alive && !actor.engagedWith.has(enemy.id)) {
      createEngagement(state, actor, enemy);
      if (enemy.alive && actor.engagedWith.has(enemy.id)) {
        remainingCapacity = fixedSub(remainingCapacity, enemy.resolvedStats.size);
        engagedTargets.push(enemy);
      }
    }
  });
  return engagedTargets;
}
function matchesRoleFilter(unit, roles) {
  return roles.length === 0 || roles.includes(unit.role);
}
function getDistinctFriendlyTroopClasses(state, unit) {
  const cached = state.distinctTypeCache.get(unit.side);
  if (cached !== void 0) {
    return cached;
  }
  const result = [...new Set(getAliveUnits(state, unit.side).map((entry) => entry.unitClassTag))];
  state.distinctTypeCache.set(unit.side, result);
  return result;
}
function formatSigned(value) {
  return value >= 0 ? `+${formatFixed(value)}` : formatFixed(value);
}
function formatPossessive(label) {
  return `${label}'s`;
}
function sourceLabelForStep(state, actorIds, metadata) {
  const sourceAbilityId = metadata?.sourceAbilityId;
  if (!sourceAbilityId) {
    return null;
  }
  if (sourceAbilityId === "battle-resolution") {
    return metadata?.sourceAbilityLabel ?? "Battle resolution";
  }
  const actor = actorIds.length === 1 ? state.units.get(actorIds[0]) ?? null : null;
  let abilityLabel = metadata?.sourceAbilityLabel ?? sourceAbilityId;
  if (!metadata?.sourceAbilityLabel) {
    try {
      abilityLabel = getAbility(sourceAbilityId).label;
    } catch {
      try {
        abilityLabel = getMutator(sourceAbilityId).label;
      } catch {
        abilityLabel = sourceAbilityId;
      }
    }
  }
  return actor ? `${formatPossessive(actor.troopLabel)} ${abilityLabel} ability` : `${abilityLabel} ability`;
}
function appendSourceContext(state, actorIds, message, metadata) {
  const sourceLabel = sourceLabelForStep(state, actorIds, metadata);
  if (!sourceLabel) {
    return message;
  }
  const trimmed = message.trim();
  const withoutPeriod = trimmed.endsWith(".") ? trimmed.slice(0, -1) : trimmed;
  return `${withoutPeriod} from the ${sourceLabel}.`;
}
function hasAbility(unit, abilityId) {
  return unit.resolvedAbilities.some((runtime) => runtime.definition.id === abilityId);
}
function isDwarf(unit) {
  return unit.raceId === "dwarf" || unit.attributes.includes("dwarf");
}
function isFae(unit) {
  return unit.raceId === "fae" || unit.attributes.includes("fae");
}
function canTakeDamage(unit) {
  return !unit.berserkDeathPending;
}
function isRangedOrCaster(unit) {
  return unit.attributes.includes("ranged") || unit.attributes.includes("caster");
}
function shouldTubthump(target, stat, amount) {
  return amount < 0 && hasAbility(target, "tubthumping") && (stat === "speed" || stat === "damage");
}
function findProtectingPriest(state, target) {
  const priests = getAliveUnits(state, target.side).filter(
    (ally) => hasAbility(ally, "mercy-before-dawn") && unitsInRange(ally, target)
  );
  return pickNearestUnit(state, target, priests);
}
function saveUnitFromDeath(state, source, target, hp, effect, message, sourceAbilityId) {
  target.hp = hp;
  buildStep(state, "buff", [source.id], [target.id], message, {
    effect,
    amount: hp,
    sourceAbilityId,
    sourceAbilityLabel: getAbility(sourceAbilityId).label
  });
  return true;
}
function healUnitToHp(state, actor, target, runtime, targetHp, message, effectId) {
  if (!target.alive || target.hp >= targetHp) {
    return false;
  }
  const nextHp = fixedClamp(targetHp, 0, target.maxHp);
  const actual = fixedSub(nextHp, target.hp);
  target.hp = nextHp;
  buildStep(state, "heal", [actor.id], [target.id], message, {
    amount: actual,
    effect: effectId,
    sourceAbilityId: runtime.definition.id,
    sourceAbilityLabel: runtime.definition.label
  });
  if (actual > 0) {
    maybeApplyRowdyRegrowth(state, target);
  }
  maybeApplyBolsteringLight(state, actor, target, actual);
  maybeApplyOverflowingGrace(state, actor, target, actual);
  triggerUnitAbilities(state, actor, {
    timing: "onEffectApplied",
    appliedEffect: {
      effect: { kind: "heal", amount: actual, mode: "flat", disposition: "beneficial" },
      target,
      disposition: "beneficial"
    }
  });
  return true;
}
function preventDeath(state, actor, target) {
  const protectingPriest = !target.mercyBeforeDawnUsed ? findProtectingPriest(state, target) : null;
  if (protectingPriest) {
    target.mercyBeforeDawnUsed = true;
    return healUnitToHp(
      state,
      protectingPriest,
      target,
      createRuntimeAbilityState(getAbility("mercy-before-dawn")),
      1,
      `${protectingPriest.troopLabel} preserves ${target.troopLabel} at 1 HP.`,
      "mercyBeforeDawn"
    );
  }
  if (!target.stonebloodUsed && hasAbility(target, "stoneblood")) {
    target.stonebloodUsed = true;
    target.resolvedAbilities = target.resolvedAbilities.filter((runtime) => runtime.definition.id !== "regen-5");
    return saveUnitFromDeath(state, target, target, 25, "stoneblood", `${target.troopLabel} refuses to fall and stays at 25 HP.`, "stoneblood");
  }
  if (!target.berserkDeathPending && hasAbility(target, "berserk")) {
    target.berserkDeathPending = true;
    target.berserkTurnsUntilDeath = state.currentTurnUnitId === target.id ? 2 : 1;
    target.initiative = 0;
    return saveUnitFromDeath(state, target, target, 1, "berserk", `${target.troopLabel} goes berserk and refuses damage until its next turn ends.`, "berserk");
  }
  return false;
}
function getDistanceDamageBonus(actor, target, context) {
  if (context.mode !== "ranged" || !hasAbility(actor, "long-shot-doctrine") || !isRangedOrCaster(actor)) {
    return { damage: 0, initiative: 0 };
  }
  const distance = unitFootprintDistance(actor, target);
  return { damage: distance, initiative: distance * 2 };
}
function hasMatchingIdentityTag(unit, tags) {
  return tags.some((tag) => unit.unitClassTag === tag || unit.attributes.includes(tag));
}
function evaluateScaledAmount(base, amount, mode) {
  return mode === "percent" ? fixedMul(base, amount / 100) : amount;
}
function amplifyPositiveAmount(target, amount) {
  if (amount <= 0 || !hasAbility(target, "anointed")) {
    return amount;
  }
  return fixedMul(amount, 2);
}
function maybeApplyRowdyRegrowth(state, target) {
  if (!hasAbility(target, "rowdy-regrowth")) {
    return;
  }
  target.initiative = fixedAdd(target.initiative, 20);
  buildStep(state, "buff", [target.id], [target.id], `${target.troopLabel} gains 20 initiative from Rowdy Regrowth.`, {
    effect: "rowdyRegrowth",
    amount: 20,
    value: target.initiative,
    sourceAbilityId: "rowdy-regrowth",
    sourceAbilityLabel: getAbility("rowdy-regrowth").label
  });
}
function maybeApplyOverflowingGrace(state, actor, target, actualHeal) {
  if (!hasAbility(actor, "overflowing-grace") || actualHeal <= 0 || target.hp < target.maxHp) {
    return;
  }
  target.initiative = fixedAdd(target.initiative, 40);
  buildStep(state, "buff", [actor.id], [target.id], `${target.troopLabel} gains 40 initiative from Overflowing Grace.`, {
    effect: "overflowingGrace",
    amount: 40,
    value: target.initiative,
    sourceAbilityId: "overflowing-grace",
    sourceAbilityLabel: getAbility("overflowing-grace").label
  });
}
function maybeApplyBolsteringLight(state, actor, target, actualHeal) {
  if (!hasAbility(actor, "bolstering-light") || actualHeal <= 0) {
    return;
  }
  const runtime = createRuntimeAbilityState(getAbility("bolstering-light"));
  if (target.hp >= target.maxHp) {
    applyHaste(state, actor, target, runtime, { kind: "haste", amount: 1, mode: "flat", disposition: "beneficial" });
    applyRamp(state, actor, target, runtime, { kind: "ramp", amount: 1, mode: "flat", disposition: "beneficial" });
    return;
  }
  applyInitiativeDelta(state, actor, target, runtime, {
    kind: "initiativeDelta",
    amount: 40,
    disposition: "beneficial"
  });
}
function maybeGrantStaticCharge(state, actor, runtime, target, effect) {
  if (!hasAbility(actor, "static-charge") || effect.kind !== "haste" || runtime.definition.id !== "enhance-1" && runtime.definition.id !== "war-drums") {
    return;
  }
  target.bonusStrikeCharges += 1;
  buildStep(state, "buff", [actor.id], [target.id], `${target.troopLabel} is charged for 1 extra strike on its next normal attack.`, {
    effect: "staticCharge",
    amount: 1,
    sourceAbilityId: "static-charge",
    sourceAbilityLabel: getAbility("static-charge").label
  });
}
function isGraveVigorBeneficialEffect(actor, target, effect) {
  return hasAbility(actor, "grave-vigor") && actor.side === target.side && effectDisposition(effect) === "beneficial";
}
function isBlockedByGraveVigor(actor, target, effect) {
  return isGraveVigorBeneficialEffect(actor, target, effect) && target.graveVigorBlockedSides.has(actor.side);
}
function markGraveVigorRecipient(state, actor, target, effect) {
  if (isGraveVigorBeneficialEffect(actor, target, effect)) {
    state.pendingGraveVigorBlocks.push({ unitId: target.id, side: actor.side });
  }
}
function flushPendingGraveVigorBlocks(state) {
  state.pendingGraveVigorBlocks.splice(0).forEach((entry) => {
    state.units.get(entry.unitId)?.graveVigorBlockedSides.add(entry.side);
  });
}
function applyPostEffectReactions(state, actor, runtime, target, effect) {
  maybeGrantStaticCharge(state, actor, runtime, target, effect);
  markGraveVigorRecipient(state, actor, target, effect);
  triggerUnitAbilities(state, actor, {
    timing: "onEffectApplied",
    appliedEffect: {
      effect,
      target,
      disposition: effectDisposition(effect)
    }
  });
}
function applyBolster(state, actor, target, runtime, effect) {
  const maxIncrease = amplifyPositiveAmount(target, evaluateScaledAmount(target.maxHp, effect.amount, effect.mode));
  const currentIncrease = amplifyPositiveAmount(target, evaluateScaledAmount(target.hp, effect.amount, effect.mode));
  if (maxIncrease <= 0 && currentIncrease <= 0) {
    return false;
  }
  target.maxHp = fixedAdd(target.maxHp, maxIncrease);
  target.hp = fixedClamp(fixedAdd(target.hp, currentIncrease), 0, target.maxHp);
  target.resolvedStats.health = target.maxHp;
  buildStep(state, "buff", [actor.id], [target.id], `${target.troopLabel} gains ${formatSigned(maxIncrease)} health.`, {
    amount: maxIncrease,
    effect: "bolster",
    sourceAbilityId: runtime.definition.id,
    sourceAbilityLabel: runtime.definition.label
  });
  return true;
}
function applyRamp(state, actor, target, runtime, effect) {
  let increase = evaluateScaledAmount(target.resolvedStats.damage, effect.amount, effect.mode);
  if (shouldTubthump(target, "damage", increase)) {
    increase = 1;
  }
  increase = amplifyPositiveAmount(target, increase);
  if (increase === 0) {
    return false;
  }
  target.resolvedStats.damage = fixedMax(fixedAdd(target.resolvedStats.damage, increase), 0);
  buildStep(state, "buff", [actor.id], [target.id], `${target.troopLabel} ${increase >= 0 ? "gains" : "loses"} ${increase >= 0 ? formatSigned(increase) : formatFixed(Math.abs(increase))} damage.`, {
    amount: increase,
    effect: "ramp",
    sourceAbilityId: runtime.definition.id,
    sourceAbilityLabel: runtime.definition.label
  });
  return true;
}
function applyHaste(state, actor, target, runtime, effect) {
  let increase = evaluateScaledAmount(target.resolvedStats.speed, effect.amount, effect.mode);
  if (shouldTubthump(target, "speed", increase)) {
    increase = 1;
  }
  increase = amplifyPositiveAmount(target, increase);
  if (increase === 0) {
    return false;
  }
  target.resolvedStats.speed = fixedClamp(fixedAdd(target.resolvedStats.speed, increase), 1, 100);
  buildStep(state, "buff", [actor.id], [target.id], `${target.troopLabel} ${increase >= 0 ? "gains" : "loses"} ${increase >= 0 ? formatSigned(increase) : formatFixed(Math.abs(increase))} speed.`, {
    amount: increase,
    effect: "haste",
    sourceAbilityId: runtime.definition.id,
    sourceAbilityLabel: runtime.definition.label
  });
  return true;
}
function healUnit(state, actor, target, runtime, effect) {
  if (!target.alive) {
    return false;
  }
  const missing = fixedSub(target.maxHp, target.hp);
  const amount = amplifyPositiveAmount(target, effect.mode === "percent" ? fixedMul(missing, effect.amount / 100) : effect.amount);
  const nextHp = fixedClamp(fixedAdd(target.hp, amount), 0, target.maxHp);
  const actual = fixedSub(nextHp, target.hp);
  target.hp = nextHp;
  buildStep(state, "heal", [actor.id], [target.id], `${actor.troopLabel} heals ${target.troopLabel} for ${formatFixed(actual)}.`, {
    amount: actual,
    effect: "heal",
    sourceAbilityId: runtime.definition.id,
    sourceAbilityLabel: runtime.definition.label
  });
  if (actual > 0) {
    maybeApplyRowdyRegrowth(state, target);
  }
  maybeApplyBolsteringLight(state, actor, target, actual);
  maybeApplyOverflowingGrace(state, actor, target, actual);
  return true;
}
function applyStatDelta(state, actor, target, runtime, effect) {
  if (!target.alive) {
    return false;
  }
  if (effect.stat === "health") {
    const delta2 = amplifyPositiveAmount(target, evaluateScaledAmount(target.maxHp, effect.amount, effect.mode));
    if (delta2 === 0) {
      return false;
    }
    target.maxHp = fixedAdd(target.maxHp, delta2);
    target.hp = fixedClamp(fixedAdd(target.hp, delta2), 0, target.maxHp);
    target.resolvedStats.health = target.maxHp;
    buildStep(state, "buff", [actor.id], [target.id], `${target.troopLabel} ${delta2 >= 0 ? "gains" : "loses"} ${formatFixed(Math.abs(delta2))} health.`, {
      amount: delta2,
      effect: "statDelta",
      stat: effect.stat,
      sourceAbilityId: runtime.definition.id,
      sourceAbilityLabel: runtime.definition.label
    });
    return true;
  }
  const currentValue = target.resolvedStats[effect.stat];
  let delta = evaluateScaledAmount(currentValue, effect.amount, effect.mode);
  if ((effect.stat === "speed" || effect.stat === "damage") && shouldTubthump(target, effect.stat, delta)) {
    delta = 1;
  }
  delta = amplifyPositiveAmount(target, delta);
  if (delta === 0) {
    return false;
  }
  const nextValue = effect.stat === "armor" ? applyArmorCap(clampStat(effect.stat, fixedAdd(currentValue, delta)), state.effects) : clampStat(effect.stat, fixedAdd(currentValue, delta));
  const actual = fixedSub(nextValue, currentValue);
  if (actual === 0) {
    return false;
  }
  target.resolvedStats[effect.stat] = nextValue;
  buildStep(state, "buff", [actor.id], [target.id], `${target.troopLabel} ${actual >= 0 ? "gains" : "loses"} ${actual >= 0 ? formatSigned(actual) : formatFixed(Math.abs(actual))} ${effect.stat}.`, {
    amount: actual,
    effect: "statDelta",
    stat: effect.stat,
    sourceAbilityId: runtime.definition.id,
    sourceAbilityLabel: runtime.definition.label
  });
  return true;
}
function applyInitiativeDelta(state, actor, target, runtime, effect) {
  if (!target.alive || effect.amount === 0) {
    return false;
  }
  target.initiative = fixedMax(fixedAdd(target.initiative, effect.amount), 0);
  buildStep(state, "buff", [actor.id], [target.id], `${target.troopLabel} ${effect.amount >= 0 ? "gains" : "loses"} ${formatFixed(Math.abs(effect.amount))} initiative.`, {
    effect: "initiativeDelta",
    value: target.initiative,
    amount: effect.amount,
    sourceAbilityId: runtime.definition.id,
    sourceAbilityLabel: runtime.definition.label
  });
  return true;
}
function applyInitiativeSet(state, actor, target, runtime, effect) {
  if (!target.alive || target.initiative === effect.value) {
    return false;
  }
  target.initiative = fixed(effect.value);
  buildStep(state, "buff", [actor.id], [target.id], `${target.troopLabel} sets initiative to ${formatFixed(target.initiative)}.`, {
    effect: "initiativeSet",
    value: target.initiative,
    sourceAbilityId: runtime.definition.id,
    sourceAbilityLabel: runtime.definition.label
  });
  return true;
}
function applyGrantAbility(state, actor, target, runtime, effect) {
  if (state.effects.removeFading && effect.abilityId === "fading") {
    return false;
  }
  if (target.resolvedAbilities.some((entry) => entry.definition.id === effect.abilityId)) {
    return false;
  }
  target.resolvedAbilities.push(createRuntimeAbilityState(getAbility(effect.abilityId)));
  buildStep(state, "buff", [actor.id], [target.id], `${target.troopLabel} gains ${getAbility(effect.abilityId).label}.`, {
    effect: "grantAbility",
    abilityId: effect.abilityId,
    sourceAbilityId: runtime.definition.id,
    sourceAbilityLabel: runtime.definition.label
  });
  return true;
}
function applyRangeSet(state, actor, target, runtime, effect) {
  if (target.resolvedStats.range === effect.value) {
    return false;
  }
  target.resolvedStats.range = fixedMax(effect.value, 0);
  buildStep(state, "buff", [actor.id], [target.id], `${target.troopLabel} sets range to ${formatFixed(target.resolvedStats.range)}.`, {
    value: target.resolvedStats.range,
    effect: "rangeset",
    sourceAbilityId: runtime.definition.id,
    sourceAbilityLabel: runtime.definition.label
  });
  return true;
}
function applyRoleSet(state, actor, target, runtime, effect) {
  if (target.role === effect.role) {
    return false;
  }
  target.role = effect.role;
  buildStep(state, "buff", [actor.id], [target.id], `${target.troopLabel} becomes ${effect.role}.`, {
    effect: "roleset",
    role: effect.role,
    sourceAbilityId: runtime.definition.id,
    sourceAbilityLabel: runtime.definition.label
  });
  return true;
}
function applyTemporaryEffect(state, actor, target, runtime, effect) {
  const turns = runtime.definition.duration.kind === "turns" ? runtime.definition.duration.turns : 0;
  if (turns <= 0) {
    return false;
  }
  if (effect.kind === "bolster") {
    const maxApplied = amplifyPositiveAmount(target, evaluateScaledAmount(target.maxHp, effect.amount, effect.mode));
    const hpApplied = amplifyPositiveAmount(target, evaluateScaledAmount(target.hp, effect.amount, effect.mode));
    if (maxApplied <= 0 && hpApplied <= 0) {
      return false;
    }
    target.maxHp = fixedAdd(target.maxHp, maxApplied);
    target.hp = fixedClamp(fixedAdd(target.hp, hpApplied), 0, target.maxHp);
    target.resolvedStats.health = target.maxHp;
    target.activeTimedEffects.push({
      effectKind: "bolster",
      sourceAbilityId: runtime.definition.id,
      sourceUnitId: actor.id,
      remainingTurns: turns,
      maxApplied,
      hpApplied
    });
    buildStep(state, "buff", [actor.id], [target.id], `${target.troopLabel} gains ${formatSigned(maxApplied)} health until end of turn.`, {
      amount: maxApplied,
      effect: "bolster",
      sourceAbilityId: runtime.definition.id,
      sourceAbilityLabel: runtime.definition.label,
      temporary: true
    });
    return true;
  }
  if (effect.kind === "haste") {
    const amountApplied = amplifyPositiveAmount(target, evaluateScaledAmount(target.resolvedStats.speed, effect.amount, effect.mode));
    if (amountApplied <= 0) {
      return false;
    }
    target.resolvedStats.speed = fixedClamp(fixedAdd(target.resolvedStats.speed, amountApplied), 1, 100);
    target.activeTimedEffects.push({
      effectKind: "haste",
      sourceAbilityId: runtime.definition.id,
      sourceUnitId: actor.id,
      remainingTurns: turns,
      amountApplied
    });
    buildStep(state, "buff", [actor.id], [target.id], `${target.troopLabel} gains ${formatSigned(amountApplied)} speed until end of turn.`, {
      amount: amountApplied,
      effect: "haste",
      sourceAbilityId: runtime.definition.id,
      sourceAbilityLabel: runtime.definition.label,
      temporary: true
    });
    return true;
  }
  if (effect.kind === "ramp") {
    const amountApplied = amplifyPositiveAmount(target, evaluateScaledAmount(target.resolvedStats.damage, effect.amount, effect.mode));
    if (amountApplied <= 0) {
      return false;
    }
    target.resolvedStats.damage = fixedAdd(target.resolvedStats.damage, amountApplied);
    target.activeTimedEffects.push({
      effectKind: "ramp",
      sourceAbilityId: runtime.definition.id,
      sourceUnitId: actor.id,
      remainingTurns: turns,
      amountApplied
    });
    buildStep(state, "buff", [actor.id], [target.id], `${target.troopLabel} gains ${formatSigned(amountApplied)} damage until end of turn.`, {
      amount: amountApplied,
      effect: "ramp",
      sourceAbilityId: runtime.definition.id,
      sourceAbilityLabel: runtime.definition.label,
      temporary: true
    });
    return true;
  }
  if (effect.kind === "statDelta") {
    if (effect.stat === "health" || effect.stat === "size") {
      return false;
    }
    const currentValue = target.resolvedStats[effect.stat];
    const amountApplied = amplifyPositiveAmount(target, evaluateScaledAmount(currentValue, effect.amount, effect.mode));
    if (amountApplied === 0) {
      return false;
    }
    const nextValue = effect.stat === "armor" ? applyArmorCap(clampStat(effect.stat, fixedAdd(currentValue, amountApplied)), state.effects) : clampStat(effect.stat, fixedAdd(currentValue, amountApplied));
    const actual = fixedSub(nextValue, currentValue);
    if (actual === 0) {
      return false;
    }
    target.resolvedStats[effect.stat] = nextValue;
    target.activeTimedEffects.push({
      effectKind: "statDelta",
      sourceAbilityId: runtime.definition.id,
      sourceUnitId: actor.id,
      remainingTurns: turns,
      stat: effect.stat,
      amountApplied: actual
    });
    buildStep(state, "buff", [actor.id], [target.id], `${target.troopLabel} gains ${formatSigned(actual)} ${effect.stat} until end of turn.`, {
      amount: actual,
      effect: "statDelta",
      stat: effect.stat,
      sourceAbilityId: runtime.definition.id,
      sourceAbilityLabel: runtime.definition.label,
      temporary: true
    });
    return true;
  }
  if (effect.kind === "rangeset") {
    if (target.resolvedStats.range === effect.value) {
      return false;
    }
    const previousValue = target.resolvedStats.range;
    target.resolvedStats.range = fixedMax(effect.value, 0);
    target.activeTimedEffects.push({
      effectKind: "rangeset",
      sourceAbilityId: runtime.definition.id,
      sourceUnitId: actor.id,
      remainingTurns: turns,
      previousValue
    });
    buildStep(state, "buff", [actor.id], [target.id], `${target.troopLabel} sets range to ${formatFixed(target.resolvedStats.range)} until end of turn.`, {
      value: target.resolvedStats.range,
      effect: "rangeset",
      sourceAbilityId: runtime.definition.id,
      sourceAbilityLabel: runtime.definition.label,
      temporary: true
    });
    return true;
  }
  if (target.role === effect.role) {
    return false;
  }
  const previousRole = target.role;
  target.role = effect.role;
  target.activeTimedEffects.push({
    effectKind: "roleset",
    sourceAbilityId: runtime.definition.id,
    sourceUnitId: actor.id,
    remainingTurns: turns,
    previousRole
  });
  buildStep(state, "buff", [actor.id], [target.id], `${target.troopLabel} becomes ${effect.role} until end of turn.`, {
    effect: "roleset",
    role: effect.role,
    sourceAbilityId: runtime.definition.id,
    sourceAbilityLabel: runtime.definition.label,
    temporary: true
  });
  return true;
}
function expireTimedEffects(state, unit) {
  const remaining = [];
  unit.activeTimedEffects.forEach((effect) => {
    const nextTurns = effect.remainingTurns - 1;
    if (nextTurns > 0) {
      remaining.push({ ...effect, remainingTurns: nextTurns });
      return;
    }
    if (effect.effectKind === "bolster") {
      unit.maxHp = fixedMax(fixedSub(unit.maxHp, effect.maxApplied), 1);
      unit.hp = fixedClamp(fixedSub(unit.hp, effect.hpApplied), 0, unit.maxHp);
      unit.resolvedStats.health = unit.maxHp;
      buildStep(state, "buff", [effect.sourceUnitId], [unit.id], `${unit.troopLabel} loses ${formatSigned(effect.maxApplied)} health.`, {
        amount: effect.maxApplied,
        effect: "bolster",
        sourceAbilityId: effect.sourceAbilityId,
        expired: true
      });
      return;
    }
    if (effect.effectKind === "haste") {
      unit.resolvedStats.speed = fixedClamp(fixedSub(unit.resolvedStats.speed, effect.amountApplied), 1, 100);
      buildStep(state, "buff", [effect.sourceUnitId], [unit.id], `${unit.troopLabel} loses ${formatSigned(effect.amountApplied)} speed.`, {
        amount: effect.amountApplied,
        effect: "haste",
        sourceAbilityId: effect.sourceAbilityId,
        expired: true
      });
      return;
    }
    if (effect.effectKind === "ramp") {
      unit.resolvedStats.damage = fixedMax(fixedSub(unit.resolvedStats.damage, effect.amountApplied), 0);
      buildStep(state, "buff", [effect.sourceUnitId], [unit.id], `${unit.troopLabel} loses ${formatSigned(effect.amountApplied)} damage.`, {
        amount: effect.amountApplied,
        effect: "ramp",
        sourceAbilityId: effect.sourceAbilityId,
        expired: true
      });
      return;
    }
    if (effect.effectKind === "statDelta") {
      unit.resolvedStats[effect.stat] = clampStat(effect.stat, fixedSub(unit.resolvedStats[effect.stat], effect.amountApplied));
      buildStep(state, "buff", [effect.sourceUnitId], [unit.id], `${unit.troopLabel} loses ${formatSigned(effect.amountApplied)} ${effect.stat}.`, {
        amount: effect.amountApplied,
        effect: "statDelta",
        stat: effect.stat,
        sourceAbilityId: effect.sourceAbilityId,
        expired: true
      });
      return;
    }
    if (effect.effectKind === "rangeset") {
      unit.resolvedStats.range = fixedMax(effect.previousValue, 0);
      buildStep(state, "buff", [effect.sourceUnitId], [unit.id], `${unit.troopLabel} resets range to ${formatFixed(unit.resolvedStats.range)}.`, {
        value: unit.resolvedStats.range,
        effect: "rangeset",
        sourceAbilityId: effect.sourceAbilityId,
        expired: true
      });
      return;
    }
    unit.role = effect.previousRole;
    buildStep(state, "buff", [effect.sourceUnitId], [unit.id], `${unit.troopLabel} returns to ${effect.previousRole}.`, {
      role: effect.previousRole,
      effect: "roleset",
      sourceAbilityId: effect.sourceAbilityId,
      expired: true
    });
  });
  unit.activeTimedEffects = remaining;
}
function getBlastDefaultTargets(state, actor, event) {
  if (!event.attackTarget) {
    return [];
  }
  return getAliveUnits(state).filter((unit) => unit.side !== actor.side && unitsTouchOrOverlap(unit, event.attackTarget));
}
function blastTargetsOnHex(state, actor, coord) {
  return getAliveUnits(state).filter((unit) => unit.side !== actor.side && unitOverlapsHex(unit, coord));
}
function chooseAdjacentBlastHex(state, actor, origin, visited) {
  const options = neighbors(origin).filter((coord) => state.mapHexes.has(hexKey(coord))).filter((coord) => !visited.has(hexKey(coord))).filter((coord) => blastTargetsOnHex(state, actor, coord).length > 0);
  return options.length > 0 ? pickRandomHex(state, options) : null;
}
function getStrikeDefaultTarget(event) {
  return event.attackTarget?.alive ? [event.attackTarget] : [];
}
function getHealDefaultTargets(state, actor, target) {
  const candidates = getAliveUnits(state, actor.side).filter((unit) => unitsInRange(actor, unit)).filter((unit) => unit.hp < unit.maxHp);
  const filtered = prioritizeCandidates(filterTargetCandidates(candidates, target?.filters), target?.filters);
  if (filtered.length === 0) {
    return [];
  }
  const mostMissing = Math.max(...filtered.map((unit) => fixedSub(unit.maxHp, unit.hp)));
  return filtered.filter((unit) => fixedSub(unit.maxHp, unit.hp) === mostMissing);
}
function getAppliedEffectDefaultTarget(event) {
  return event.appliedEffect?.target ? [event.appliedEffect.target] : [];
}
function getAttackDefaultTarget(event) {
  return event.attackTarget?.alive ? [event.attackTarget] : [];
}
function getTargetCandidates(state, actor, ability, effect, event) {
  const target = ability.target;
  if (target?.mode === "self") {
    return [actor];
  }
  if (target?.mode === "default") {
    if (event.timing === "onAttack") {
      return getAttackDefaultTarget(event);
    }
    if (event.timing === "onEffectApplied") {
      return getAppliedEffectDefaultTarget(event);
    }
  }
  if (target?.mode === "random" || target?.mode === "aoe") {
    const radius = resolveAbilityTargetRadius(actor, target);
    const allegiance = target.allegiance ?? "ally";
    const candidates = getAliveUnits(state).filter((unit) => {
      if (allegiance === "ally" && unit.side !== actor.side) return false;
      if (allegiance === "enemy" && unit.side === actor.side) return false;
      return unitFootprintDistance(actor, unit) <= radius;
    });
    return prioritizeCandidates(filterTargetCandidates(candidates, target.filters), target.filters);
  }
  if (effect.kind === "blast") return getBlastDefaultTargets(state, actor, event);
  if (effect.kind === "strike") return getStrikeDefaultTarget(event);
  if (effect.kind === "heal") return getHealDefaultTargets(state, actor, target);
  return [actor];
}
function resolveTargets(state, actor, ability, effect, event) {
  const candidates = getTargetCandidates(state, actor, ability, effect, event).filter(
    (candidate) => (candidate.alive || candidate.id === actor.id && event.timing === "onDeath" && effect.kind === "summon") && !isBlockedByGraveVigor(actor, candidate, effect)
  );
  if (candidates.length === 0) {
    return [];
  }
  if (ability.target?.mode === "random") {
    return [state.rng.pick(candidates)];
  }
  if (effect.kind === "heal" && ability.target?.mode !== "aoe") {
    return [state.rng.pick(candidates)];
  }
  return candidates;
}
function canTriggerAbility(state, actor, runtime, event) {
  const trigger = runtime.definition.trigger;
  if (trigger.timing !== event.timing) {
    return false;
  }
  if (runtime.usesRemaining !== null && runtime.usesRemaining <= 0) {
    return false;
  }
  if (trigger.condition === "forsaken" && getDistinctFriendlyTroopClasses(state, actor).length > 1) {
    return false;
  }
  if (trigger.fallen && event.fallenUnit) {
    if (!matchesFallenTrigger(actor, event.fallenUnit, trigger.fallen.allegiance)) {
      return false;
    }
    if (unitDistanceFromHex(actor, event.fallenUnit.position) > resolveFallenTriggerRadius(actor, trigger)) {
      return false;
    }
  }
  if (trigger.effectApplication) {
    if (!event.appliedEffect) {
      return false;
    }
    if (trigger.effectApplication.effectKinds?.length && !trigger.effectApplication.effectKinds.includes(event.appliedEffect.effect.kind)) {
      return false;
    }
    if (trigger.effectApplication.dispositions?.length && !trigger.effectApplication.dispositions.includes(event.appliedEffect.disposition)) {
      return false;
    }
  }
  return true;
}
function getAbilityRepeatCount(state, actor, runtime) {
  if (runtime.definition.trigger.repeatPerDistinctFriendlyTroopClass) {
    return Math.max(0, getDistinctFriendlyTroopClasses(state, actor).filter((classTag) => classTag !== actor.unitClassTag).length);
  }
  if (runtime.definition.trigger.repeatPerTouchingFriendlyUnit) {
    return getAliveUnits(state, actor.side).filter((ally) => ally.id !== actor.id && unitsTouchOrOverlap(ally, actor)).length;
  }
  return 1;
}
function recordSummonedProfile(state, unit) {
  const key = `${unit.side}:${unit.troopLabel}`;
  if (state.summonedProfiles.has(key)) {
    return;
  }
  state.summonedProfiles.set(key, {
    side: unit.side,
    troopLabel: unit.troopLabel,
    unitClassId: unit.unitClassId,
    raceId: unit.raceId,
    role: unit.role,
    unitClassTag: unit.unitClassTag,
    attributes: [...unit.attributes],
    stats: { ...unit.resolvedStats },
    abilities: unit.resolvedAbilities.map((runtime) => cloneAbilityDefinition(runtime.definition)),
    statBreakdowns: {
      health: { stat: "health", finalValue: unit.resolvedStats.health, lines: [{ label: "Summoned", value: unit.resolvedStats.health, kind: "base" }] },
      damage: { stat: "damage", finalValue: unit.resolvedStats.damage, lines: [{ label: "Summoned", value: unit.resolvedStats.damage, kind: "base" }] },
      speed: { stat: "speed", finalValue: unit.resolvedStats.speed, lines: [{ label: "Summoned", value: unit.resolvedStats.speed, kind: "base" }] },
      ...unit.role === "frontline" ? { move: { stat: "move", finalValue: unit.resolvedStats.move, lines: [{ label: "Summoned", value: unit.resolvedStats.move, kind: "base" }] } } : {},
      armor: { stat: "armor", finalValue: unit.resolvedStats.armor, lines: [{ label: "Summoned", value: unit.resolvedStats.armor, kind: "base" }] },
      range: { stat: "range", finalValue: unit.resolvedStats.range, lines: [{ label: "Summoned", value: unit.resolvedStats.range, kind: "base" }] },
      capacity: { stat: "capacity", finalValue: unit.resolvedStats.capacity, lines: [{ label: "Summoned", value: unit.resolvedStats.capacity, kind: "base" }] },
      size: { stat: "size", finalValue: unit.resolvedStats.size, lines: [{ label: "Summoned", value: unit.resolvedStats.size, kind: "base" }] }
    }
  });
}
function tryFindSummonPlacement(state, origin, size) {
  const originKey = hexKey(origin);
  const mapCandidates = hexSetToCoords(state.mapHexes).filter((coord) => hexKey(coord) !== originKey).map((coord) => ({ coord, distance: hexDistance(origin, coord), tie: state.rng.next() })).sort((left, right) => left.distance - right.distance || left.tie - right.tie).map((entry) => entry.coord);
  const candidatePool = state.mapHexes.has(originKey) ? [origin, ...mapCandidates] : mapCandidates;
  for (const coord of candidatePool) {
    const orientations = state.rng.shuffle(["north", "south"]);
    const orientation = orientations.find(
      (candidateOrientation) => isFootprintPlacementLegal(state, footprintForSize(coord, size, candidateOrientation))
    );
    if (orientation) {
      return { hex: coord, orientation };
    }
  }
  return null;
}
function applyCarrionChoir(state, actor, corpsePosition) {
  if (!hasAbility(actor, "carrion-choir")) {
    return;
  }
  getAliveUnits(state).filter((unit) => unit.side !== actor.side && unitDistanceFromHex(unit, corpsePosition) <= 1).forEach((unit) => {
    unit.resolvedStats.armor = clampStat("armor", fixedSub(unit.resolvedStats.armor, 1));
    unit.resolvedStats.damage = fixedMax(fixedSub(unit.resolvedStats.damage, 1), 0);
    buildStep(state, "buff", [actor.id], [unit.id], `${unit.troopLabel} loses 1 armor and 1 damage.`, {
      effect: "carrionChoir",
      amount: -1,
      sourceAbilityId: "carrion-choir",
      sourceAbilityLabel: getAbility("carrion-choir").label
    });
  });
}
function summonUnit(state, actor, runtime, effect, origin) {
  const troop = composeSummonedTroopDefinition(actor.raceId, effect.unitClassId);
  const summonPlacement = tryFindSummonPlacement(state, origin, troop.stats.size);
  if (!summonPlacement) {
    return false;
  }
  const summonIndex = [...state.units.values()].filter((unit) => unit.side === actor.side && unit.troopLabel === troop.label).length + 1;
  const unitId = `${actor.id}-summon-${effect.unitClassId}-${summonIndex}`;
  const grantedAbilities = (effect.grantedAbilityIds ?? []).map(getAbility);
  const mergedAbilities = [...troop.abilities];
  grantedAbilities.forEach((ability) => {
    if (!mergedAbilities.some((entry) => entry.id === ability.id)) {
      mergedAbilities.push(ability);
    }
  });
  const summonedUnit = {
    id: unitId,
    troopInstanceId: null,
    troopLabel: troop.label,
    unitClassId: troop.unitClassId,
    raceId: troop.raceId,
    side: actor.side,
    summonerUnitId: actor.id,
    role: troop.role,
    unitClassTag: troop.unitClassTag,
    attributes: [...troop.attributes],
    position: { ...summonPlacement.hex },
    occupiedHexes: footprintForSize(summonPlacement.hex, troop.stats.size, summonPlacement.orientation),
    footprintOrientation: summonPlacement.orientation,
    hp: troop.stats.health,
    maxHp: troop.stats.health,
    initiative: fixedMax(effect.initialInitiative ?? (hasAbility(actor, "early-riser") && effect.unitClassId === "skeleton" ? 100 : 0), 0),
    alive: true,
    engagedWith: /* @__PURE__ */ new Set(),
    resolvedStats: { ...troop.stats },
    resolvedAbilities: mergedAbilities.map(createRuntimeAbilityState),
    activeTimedEffects: [],
    committedBacklineTargetId: null,
    graveVigorBlockedSides: /* @__PURE__ */ new Set(),
    mercyBeforeDawnUsed: false,
    stonebloodUsed: false,
    fadeIntoShadowUsed: false,
    glamourUsed: false,
    brambleSnareStacks: 0,
    bonusStrikeCharges: 0,
    scavengersHungerKills: 0,
    sentinelRunesTriggered: false,
    berserkDeathPending: false,
    berserkTurnsUntilDeath: 0
  };
  applyMutatorAdjustmentsToUnit(summonedUnit, state.effects);
  state.units.set(unitId, summonedUnit);
  state.distinctTypeCache.delete(summonedUnit.side);
  recordSummonedProfile(state, summonedUnit);
  buildStep(state, "buff", [actor.id], [unitId], `${actor.troopLabel} summons ${troop.label}.`, {
    effect: "summon",
    unitClassId: troop.unitClassId,
    sourceAbilityId: runtime.definition.id,
    sourceAbilityLabel: runtime.definition.label
  });
  return true;
}
function summonUnitsAtHex(state, actor, sourceAbilityId, unitClassId, count, origin, grantedAbilityIds = [], initialInitiative) {
  const runtime = createRuntimeAbilityState(getAbility(sourceAbilityId));
  const effect = {
    kind: "summon",
    unitClassId,
    count: 1,
    grantedAbilityIds,
    initialInitiative
  };
  let summonedAny = false;
  for (let index = 0; index < count; index += 1) {
    summonedAny = summonUnit(state, actor, runtime, effect, origin) || summonedAny;
  }
  return summonedAny;
}
function triggerSentinelRunes(state, knight, origin, message) {
  if (knight.sentinelRunesTriggered || !hasAbility(knight, "sentinel-runes")) {
    return;
  }
  if (summonUnitsAtHex(state, knight, "sentinel-runes", "elemental", 2, origin)) {
    knight.sentinelRunesTriggered = true;
    buildStep(state, "buff", [knight.id], [], message, {
      effect: "sentinelRunes",
      sourceAbilityId: "sentinel-runes",
      sourceAbilityLabel: getAbility("sentinel-runes").label
    });
  }
}
function handleMoveOffKnightHex(state, mover, previousFootprint, to) {
  getAliveUnits(state).filter((unit) => unit.side !== mover.side && footprintsTouchOrOverlap(unit.occupiedHexes, previousFootprint) && hasAbility(unit, "sentinel-runes")).forEach((knight) => {
    triggerSentinelRunes(state, knight, to, `${knight.troopLabel} triggers Sentinel Runes.`);
  });
}
function relocateUnit(state, actor, destination) {
  const previousPosition = { ...actor.position };
  const previousFootprint = actor.occupiedHexes.map((hex) => ({ ...hex }));
  removeAllEngagements(state, actor);
  actor.position = { ...destination };
  recomputeFootprint(actor);
  if (!equalsHex(previousPosition, destination)) {
    handleMoveOffKnightHex(state, actor, previousFootprint, destination);
  }
}
function applyBlastSequence(state, actor, runtime, amount, origin, visited) {
  const key = hexKey(origin);
  if (visited.has(key)) {
    return false;
  }
  visited.add(key);
  const targets = blastTargetsOnHex(state, actor, origin);
  if (targets.length === 0) {
    return false;
  }
  const totalAmount = hasAbility(actor, "lightning-rods") ? fixedAdd(
    amount,
    getAliveUnits(state).filter((unit) => unit.unitClassTag === "elemental" && unitOverlapsHex(unit, origin)).length
  ) : amount;
  let applied = false;
  targets.forEach((target) => {
    const damage = fixedMax(totalAmount, 0);
    const inflictedDamage = canTakeDamage(target) ? damage : 0;
    if (inflictedDamage > 0) {
      target.hp = fixedSub(target.hp, inflictedDamage);
    }
    buildStep(state, "attack", [actor.id], [target.id], `${actor.troopLabel} splashes ${formatFixed(inflictedDamage)} blast damage.`, {
      damage: inflictedDamage,
      mode: "blast",
      category: "strike",
      baseDamage: totalAmount,
      attackDamageBeforeArmor: totalAmount,
      armorIgnored: true,
      sourceAbilityId: runtime.definition.id,
      sourceAbilityLabel: runtime.definition.label
    });
    applied = true;
    if (target.hp <= 0 && target.alive) {
      handleDeath(state, actor, target, { mode: "blast", category: "strike" });
    } else if (target.alive && canTakeDamage(target)) {
      triggerUnitAbilities(state, target, { timing: "onDamaged" });
      if (inflictedDamage > 0) {
        applyWhimsy(state, target);
      }
    }
  });
  if (applied && hasAbility(actor, "spell-echo")) {
    const nextHex = chooseAdjacentBlastHex(state, actor, origin, visited);
    if (nextHex) {
      applyBlastSequence(state, actor, runtime, amount, nextHex, visited);
    }
  }
  return applied;
}
const PER_TARGET_EFFECT_HANDLERS = {
  bolster: (state, actor, runtime, target, effect) => applyBolster(state, actor, target, runtime, effect),
  haste: (state, actor, runtime, target, effect) => applyHaste(state, actor, target, runtime, effect),
  heal: (state, actor, runtime, target, effect) => healUnit(state, actor, target, runtime, effect),
  ramp: (state, actor, runtime, target, effect) => applyRamp(state, actor, target, runtime, effect),
  statDelta: (state, actor, runtime, target, effect) => applyStatDelta(state, actor, target, runtime, effect),
  rangeset: (state, actor, runtime, target, effect) => applyRangeSet(state, actor, target, runtime, effect),
  roleset: (state, actor, runtime, target, effect) => applyRoleSet(state, actor, target, runtime, effect),
  initiativeSet: (state, actor, runtime, target, effect) => applyInitiativeSet(state, actor, target, runtime, effect),
  initiativeDelta: (state, actor, runtime, target, effect) => applyInitiativeDelta(state, actor, target, runtime, effect),
  grantAbility: (state, actor, runtime, target, effect) => applyGrantAbility(state, actor, target, runtime, effect),
  summon: (state, actor, runtime, _target, effect, event) => {
    const summon = effect;
    const origin = summon.consumeFallenUnitCorpse ? event.fallenUnit?.position : actor.position;
    if (!origin) {
      return false;
    }
    if (summon.consumeFallenUnitCorpse && event.fallenUnit) {
      if (!state.corpses.has(event.fallenUnit.id)) {
        if (!hasAbility(actor, "alternate-fuel-10") || actor.hp <= 10) {
          return false;
        }
        actor.hp = fixedSub(actor.hp, 10);
        buildStep(state, "buff", [actor.id], [], `${actor.troopLabel} spends 10 health instead of a corpse.`, {
          effect: "alternateFuel",
          sourceAbilityId: runtime.definition.id,
          sourceAbilityLabel: runtime.definition.label
        });
      }
    }
    let summonedAny = false;
    for (let index = 0; index < summon.count; index += 1) {
      summonedAny = summonUnit(state, actor, runtime, summon, origin) || summonedAny;
    }
    if (summonedAny && summon.consumeFallenUnitCorpse && event.fallenUnit) {
      applyCarrionChoir(state, actor, event.fallenUnit.position);
      state.corpses.delete(event.fallenUnit.id);
    }
    return summonedAny;
  },
  strike: (state, actor, _runtime, target, effect) => {
    const e = effect;
    const strikeCount = Math.max(0, Math.floor(e.amount));
    if (strikeCount > 0 && target.alive) {
      for (let i = 0; i < strikeCount; i += 1) {
        attack(state, actor, target, actor.resolvedStats.range > 0 ? "ranged" : "melee", false, 0, "strike");
        if (!target.alive) {
          break;
        }
      }
      return true;
    }
    return false;
  },
  redirect: (state, actor, runtime, target, effect) => {
    const redirectEffect = effect;
    if (!target.alive || !redirectEffect.allowAlreadyEngaged && target.engagedWith.size > 0 || actor.engagedWith.has(target.id)) {
      return false;
    }
    if (target.resolvedStats.size > availableCapacity(state, actor)) {
      return false;
    }
    createEngagement(state, actor, target);
    buildStep(state, "engage", [actor.id], [target.id], `${actor.troopLabel} redirects ${target.troopLabel}.`, {
      effect: "redirect",
      sourceAbilityId: runtime.definition.id,
      sourceAbilityLabel: runtime.definition.label
    });
    return true;
  }
};
function executeAbilityEffect(state, actor, runtime, effect, event) {
  const handler = PER_TARGET_EFFECT_HANDLERS[effect.kind];
  if (effect.kind === "blast") {
    const targets2 = resolveTargets(state, actor, runtime.definition, effect, event);
    const firstTarget = targets2[0];
    if (!firstTarget) {
      return false;
    }
    return applyBlastSequence(state, actor, runtime, effect.amount, firstTarget.position, /* @__PURE__ */ new Set());
  }
  if (!handler) {
    return false;
  }
  const targets = resolveTargets(state, actor, runtime.definition, effect, event);
  if (targets.length === 0) {
    return false;
  }
  let applied = false;
  targets.forEach((target) => {
    if (!target.alive && !(target.id === actor.id && event.timing === "onDeath" && effect.kind === "summon") && effect.kind !== "strike") {
      return;
    }
    if (isBlockedByGraveVigor(actor, target, effect)) {
      return;
    }
    let appliedToTarget = false;
    if (runtime.definition.duration.kind === "turns" && (effect.kind === "bolster" || effect.kind === "haste" || effect.kind === "ramp" || effect.kind === "statDelta" || effect.kind === "rangeset" || effect.kind === "roleset")) {
      appliedToTarget = applyTemporaryEffect(state, actor, target, runtime, effect);
      applied = appliedToTarget || applied;
      if (appliedToTarget) {
        applyPostEffectReactions(state, actor, runtime, target, effect);
      }
      return;
    }
    appliedToTarget = handler(state, actor, runtime, target, effect, event);
    applied = appliedToTarget || applied;
    if (appliedToTarget) {
      applyPostEffectReactions(state, actor, runtime, target, effect);
    }
  });
  return applied;
}
function triggerUnitAbilities(state, actor, event, filter) {
  actor.resolvedAbilities.forEach((runtime) => {
    if (filter && !filter(runtime)) {
      return;
    }
    if (!canTriggerAbility(state, actor, runtime, event)) {
      return;
    }
    runtime.triggerCount += 1;
    if (runtime.definition.trigger.chargeEvery && runtime.triggerCount % runtime.definition.trigger.chargeEvery !== 0) {
      return;
    }
    const repeats = getAbilityRepeatCount(state, actor, runtime);
    if (repeats <= 0) {
      return;
    }
    let applied = false;
    for (let repeat = 0; repeat < repeats; repeat += 1) {
      runtime.definition.effects.forEach((effect) => {
        applied = executeAbilityEffect(state, actor, runtime, effect, event) || applied;
      });
      flushPendingGraveVigorBlocks(state);
    }
    if (applied && runtime.usesRemaining !== null) {
      runtime.usesRemaining -= 1;
    }
    if (applied) {
      handleShapeshiftTriggers(state, actor, runtime);
    }
  });
}
function isArmyCompositionAbility(runtime) {
  return !!(runtime.definition.trigger.condition || runtime.definition.trigger.repeatPerDistinctFriendlyTroopClass);
}
function executeStartOfBattleAbilities(state) {
  const initialUnits = getAliveUnits(state);
  initialUnits.forEach((unit) => {
    triggerUnitAbilities(state, unit, { timing: "startOfBattle" }, isArmyCompositionAbility);
  });
  initialUnits.forEach((unit) => {
    triggerUnitAbilities(state, unit, { timing: "startOfBattle" }, (r) => !isArmyCompositionAbility(r));
  });
}
function applyCopiousAle(state) {
  ["player", "enemy"].forEach((side) => {
    if (!sideHasRaceUpgrade(state, side, "dwarf-ale-and-hearty")) {
      return;
    }
    const byTroop = /* @__PURE__ */ new Map();
    getAliveUnits(state, side).filter((unit) => isDwarf(unit) && hasAbility(unit, "ale-and-hearty")).forEach((unit) => {
      const key = `${side}:${unit.troopLabel}`;
      if (state.copiousAleAppliedTroopKeys.has(key)) {
        return;
      }
      byTroop.set(key, [...byTroop.get(key) ?? [], unit]);
    });
    byTroop.forEach((units, key) => {
      const target = state.rng.pick(units);
      state.copiousAleAppliedTroopKeys.add(key);
      const previousSpeed = target.resolvedStats.speed;
      target.resolvedStats.speed = 1;
      buildStep(state, "buff", [target.id], [target.id], `${target.troopLabel} has too much ale and slows to 1 speed.`, {
        effect: "copiousAle",
        stat: "speed",
        amount: fixedSub(1, previousSpeed),
        sourceAbilityId: "ale-and-hearty",
        sourceAbilityLabel: getAbility("ale-and-hearty").label
      });
    });
  });
}
function performBrace(state, actor) {
  if (!hasAbility(actor, "brace") || actor.engagedWith.size === 0 || availableCapacity(state, actor) !== 0) {
    return;
  }
  applyTemporaryEffect(state, actor, actor, createRuntimeAbilityState(getAbility("brace")), {
    kind: "statDelta",
    stat: "armor",
    amount: 5,
    mode: "flat",
    disposition: "beneficial"
  });
}
function performLivingCircuit(state, actor) {
  if (!hasAbility(actor, "living-circuit")) {
    return;
  }
  const elementals = getAliveUnits(state, actor.side).filter(
    (unit) => unit.unitClassTag === "elemental" && unitsInRange(actor, unit)
  );
  if (elementals.length === 0) {
    return;
  }
  applyInitiativeDelta(state, actor, actor, createRuntimeAbilityState(getAbility("living-circuit")), {
    kind: "initiativeDelta",
    amount: 15,
    disposition: "beneficial"
  });
  elementals.forEach((elemental) => {
    applyInitiativeDelta(state, actor, elemental, createRuntimeAbilityState(getAbility("living-circuit")), {
      kind: "initiativeDelta",
      amount: 15,
      disposition: "beneficial"
    });
  });
}
function performThrillOfTheHunt(state, actor) {
  if (!hasAbility(actor, "thrill-of-the-hunt")) {
    return;
  }
  getAliveUnits(state, actor.side).filter((unit) => unit.unitClassTag === "wolf" && unitsTouchOrOverlap(unit, actor)).forEach((wolf) => {
    applyInitiativeDelta(state, actor, wolf, createRuntimeAbilityState(getAbility("thrill-of-the-hunt")), {
      kind: "initiativeDelta",
      amount: 10,
      disposition: "beneficial"
    });
  });
}
function handleShapeshiftTriggers(state, actor, runtime) {
  if (runtime.definition.id !== "shapeshift-bear" && runtime.definition.id !== "shapeshift-bear-2") {
    return;
  }
  if (hasAbility(actor, "bramble-snare")) {
    actor.brambleSnareStacks += 1;
    buildStep(state, "buff", [actor.id], [actor.id], `${actor.troopLabel} empowers Bramble Snare.`, {
      effect: "brambleSnare",
      amount: actor.brambleSnareStacks,
      sourceAbilityId: "bramble-snare",
      sourceAbilityLabel: getAbility("bramble-snare").label
    });
  }
  if (hasAbility(actor, "wild-call") || hasAbility(actor, "forest-friends")) {
    summonUnitsAtHex(state, actor, hasAbility(actor, "forest-friends") ? "forest-friends" : "wild-call", "wolf", 2, actor.position);
  }
}
function performPackmastersWhistle(state, actor) {
  if (!hasAbility(actor, "packmasters-whistle") || actor.engagedWith.size === 0) {
    return;
  }
  const wolf = getAliveUnits(state, actor.side).find((ally) => ally.unitClassTag === "wolf" && unitsTouchOrOverlap(ally, actor));
  const engagedTarget = [...actor.engagedWith].map((unitId) => state.units.get(unitId)).find((unit) => Boolean(unit?.alive));
  if (!wolf || !engagedTarget || wolf.engagedWith.has(engagedTarget.id) || engagedTarget.resolvedStats.size > availableCapacity(state, wolf)) {
    return;
  }
  createEngagement(state, wolf, engagedTarget);
  wolf.hp = fixedClamp(fixedAdd(wolf.hp, 10), 0, wolf.maxHp);
  buildStep(state, "engage", [wolf.id], [engagedTarget.id], `${wolf.troopLabel} answers ${actor.troopLabel}'s whistle.`, {
    effect: "packmastersWhistle",
    amount: 10,
    sourceAbilityId: "packmasters-whistle",
    sourceAbilityLabel: getAbility("packmasters-whistle").label
  });
}
function performForestFriends(state, actor) {
  if (!hasAbility(actor, "forest-friends")) {
    return;
  }
  const runtime = createRuntimeAbilityState(getAbility("forest-friends"));
  const targets = [actor, ...getAliveUnits(state, actor.side).filter((unit) => unit.summonerUnitId === actor.id && hasAbility(unit, "bonded"))];
  targets.forEach((target) => {
    healUnit(state, actor, target, runtime, { kind: "heal", amount: 20, mode: "flat", disposition: "beneficial" });
  });
}
function performWarDrums(state, actor) {
  if (!hasAbility(actor, "war-drums")) {
    return;
  }
  const hasteEffect = { kind: "haste", amount: 1, mode: "flat", disposition: "beneficial" };
  const rampEffect = { kind: "ramp", amount: 1, mode: "flat", disposition: "beneficial" };
  const eligible = prioritizeCandidates(
    getAliveUnits(state, actor.side).filter(
      (unit) => unitsInRange(actor, unit) && !hasMatchingIdentityTag(unit, ["caster"]) && (!isBlockedByGraveVigor(actor, unit, hasteEffect) || !isBlockedByGraveVigor(actor, unit, rampEffect))
    )
  );
  if (eligible.length === 0) {
    return;
  }
  const target = state.rng.pick(eligible);
  getAliveUnits(state, actor.side).filter((unit) => unitsTouchOrOverlap(unit, target)).forEach((unit) => {
    const runtime = createRuntimeAbilityState(getAbility("war-drums"));
    if (!isBlockedByGraveVigor(actor, unit, hasteEffect) && applyHaste(state, actor, unit, runtime, hasteEffect)) {
      applyPostEffectReactions(state, actor, runtime, unit, hasteEffect);
    }
    if (!isBlockedByGraveVigor(actor, unit, rampEffect) && applyRamp(state, actor, unit, runtime, rampEffect)) {
      applyPostEffectReactions(state, actor, runtime, unit, rampEffect);
    }
  });
  flushPendingGraveVigorBlocks(state);
}
function executeEndOfTurnAbilities(state, actor) {
  performPackmastersWhistle(state, actor);
  performForestFriends(state, actor);
  performWarDrums(state, actor);
  performLivingCircuit(state, actor);
  performThrillOfTheHunt(state, actor);
  triggerUnitAbilities(state, actor, { timing: "endOfTurn" });
}
function executeStartOfTurnAbilities(state, actor) {
  performBrace(state, actor);
  triggerUnitAbilities(state, actor, { timing: "startOfTurn" });
}
function performHoldTheStandard(state, fallen) {
  if (hasAbility(fallen, "fading")) {
    return;
  }
  getAliveUnits(state, fallen.side).filter((unit) => hasAbility(unit, "hold-the-standard") && unitsTouchOrOverlap(unit, fallen)).forEach((unit) => {
    healUnit(state, unit, unit, createRuntimeAbilityState(getAbility("hold-the-standard")), {
      kind: "heal",
      amount: 15,
      mode: "flat",
      disposition: "beneficial"
    });
  });
}
function performLootFrenzy(state, actor, fallenFootprint) {
  getAliveUnits(state, actor.side).filter((unit) => unitOverlapsAnyHex(unit, fallenFootprint)).forEach((unit) => {
    healUnit(state, actor, unit, createRuntimeAbilityState(getAbility("loot-frenzy")), {
      kind: "heal",
      amount: 10,
      mode: "flat",
      disposition: "beneficial"
    });
    applyInitiativeDelta(state, actor, unit, createRuntimeAbilityState(getAbility("loot-frenzy")), {
      kind: "initiativeDelta",
      amount: 30,
      disposition: "beneficial"
    });
  });
}
function performThrillKillBuff(state, actor, fallenFootprint) {
  getAliveUnits(state, actor.side).filter((unit) => unitTouchesAnyHex(unit, fallenFootprint)).forEach((unit) => {
    applyRamp(state, actor, unit, createRuntimeAbilityState(getAbility("thrill-of-the-hunt")), {
      kind: "ramp",
      amount: 2,
      mode: "flat",
      disposition: "beneficial"
    });
  });
}
function performLastWitness(state, killer, fallen) {
  getAliveUnits(state, fallen.side).filter((unit) => unit.id !== fallen.id && hasAbility(unit, "last-witness") && unitsTouchOrOverlap(unit, fallen)).forEach((unit) => {
    if (!killer.alive || !unitsTouchOrOverlap(killer, fallen)) {
      return;
    }
    attack(state, unit, killer, "melee", false, 1, "strike");
  });
}
function getScavengersHungerLimit(actor) {
  if (hasAbility(actor, "scavengers-hunger-2")) {
    return 2;
  }
  return hasAbility(actor, "scavengers-hunger") ? 3 : 0;
}
function performScavengersHunger(state, actor, target) {
  const summonLimit = getScavengersHungerLimit(actor);
  if (summonLimit <= 0 || hasAbility(target, "fading") || actor.scavengersHungerKills >= summonLimit) {
    return;
  }
  actor.scavengersHungerKills += 1;
  state.corpses.delete(target.id);
  summonUnitsAtHex(state, actor, hasAbility(actor, "scavengers-hunger-2") ? "scavengers-hunger-2" : "scavengers-hunger", "wolf", 1, target.position);
}
function handleDeath(state, actor, target, context = { mode: "melee", category: "normal" }) {
  if (!target.alive) {
    return;
  }
  if (preventDeath(state, actor, target)) {
    return;
  }
  target.alive = false;
  target.hp = 0;
  state.distinctTypeCache.delete(target.side);
  removeAllEngagements(state, target);
  clearBacklineCommitmentsTo(state, target.id);
  if (!hasAbility(target, "fading")) {
    state.corpses.set(target.id, { ...target.position });
  }
  buildStep(state, "death", [actor.id], [target.id], `${target.troopLabel} is killed.`, {
    effect: "death",
    sourceAbilityId: "battle-resolution",
    sourceAbilityLabel: "Battle resolution"
  });
  if (hasAbility(target, "sentinel-runes") && !target.sentinelRunesTriggered) {
    triggerSentinelRunes(state, target, target.position, `${target.troopLabel} releases Sentinel Runes in death.`);
  }
  const bondedDependents = getAliveUnits(state, target.side).filter(
    (unit) => unit.summonerUnitId === target.id && hasAbility(unit, "bonded")
  );
  triggerUnitAbilities(state, actor, { timing: "onKill", fallenUnit: target });
  performScavengersHunger(state, actor, target);
  if (hasAbility(actor, "snatch-the-moment")) {
    getAliveUnits(state).filter((unit) => unit.side !== actor.side && unitsTouchOrOverlap(unit, target)).forEach((unit) => {
      unit.initiative = fixedMax(fixedSub(unit.initiative, 20), 0);
      buildStep(state, "buff", [actor.id], [unit.id], `${unit.troopLabel} loses 20 initiative.`, {
        effect: "snatchTheMoment",
        amount: -20,
        sourceAbilityId: "snatch-the-moment",
        sourceAbilityLabel: getAbility("snatch-the-moment").label
      });
    });
  }
  if (hasAbility(actor, "loot-frenzy")) {
    performLootFrenzy(state, actor, target.occupiedHexes);
  }
  if (actor.unitClassTag === "wolf" && sideHasTroopClassUpgrade(state, actor.side, "beastmaster-thrill-of-the-hunt")) {
    performThrillKillBuff(state, actor, target.occupiedHexes);
  }
  if (hasAbility(actor, "crushing-sweep") && context.mode === "melee") {
    const splash = actor.resolvedStats.size * 5;
    getAliveUnits(state).filter((unit) => unit.side !== actor.side && unitsTouchOrOverlap(unit, target)).forEach((unit) => {
      const inflictedSplash = canTakeDamage(unit) ? splash : 0;
      if (inflictedSplash > 0) {
        unit.hp = fixedSub(unit.hp, inflictedSplash);
      }
      buildStep(state, "attack", [actor.id], [unit.id], `${actor.troopLabel} crushes nearby enemies for ${formatFixed(inflictedSplash)}.`, {
        damage: inflictedSplash,
        mode: "melee",
        category: context.category,
        baseDamage: splash,
        attackDamageBeforeArmor: splash,
        armorIgnored: true,
        sourceAbilityId: "crushing-sweep",
        sourceAbilityLabel: getAbility("crushing-sweep").label
      });
      if (unit.hp <= 0 && unit.alive) {
        handleDeath(state, actor, unit, context);
      } else if (unit.alive && canTakeDamage(unit)) {
        triggerUnitAbilities(state, unit, { timing: "onDamaged" });
        if (inflictedSplash > 0) {
          applyWhimsy(state, unit);
        }
      }
    });
  }
  performLastWitness(state, actor, target);
  performHoldTheStandard(state, target);
  triggerUnitAbilities(state, target, { timing: "onDeath", fallenUnit: target });
  getAliveUnits(state).forEach((unit) => {
    if (unit.id !== target.id) {
      triggerUnitAbilities(state, unit, { timing: "onFallen", fallenUnit: target });
      if (target.unitClassTag === "elemental" && hasAbility(unit, "arc-conductor") && unit.side === actor.side) {
        applyBlastSequence(state, unit, createRuntimeAbilityState(getAbility("arc-conductor-blast-8")), 8, target.position, /* @__PURE__ */ new Set());
      }
    }
  });
  bondedDependents.forEach(
    (unit) => handleEnvironmentalDeath(state, unit, "bonded", getAbility("bonded").label, `${unit.troopLabel} is destroyed when its summoner falls.`, true)
  );
}
function handleEnvironmentalDeath(state, target, effectId, effectLabel, message, bypassPrevention = false) {
  if (!target.alive) {
    return;
  }
  if (!bypassPrevention && preventDeath(state, target, target)) {
    return;
  }
  target.alive = false;
  target.hp = 0;
  state.distinctTypeCache.delete(target.side);
  removeAllEngagements(state, target);
  clearBacklineCommitmentsTo(state, target.id);
  if (!hasAbility(target, "fading")) {
    state.corpses.set(target.id, { ...target.position });
  }
  buildStep(state, "death", [], [target.id], message, {
    effect: effectId,
    sourceAbilityId: effectId,
    sourceAbilityLabel: effectLabel
  });
  if (hasAbility(target, "sentinel-runes") && !target.sentinelRunesTriggered) {
    triggerSentinelRunes(state, target, target.position, `${target.troopLabel} releases Sentinel Runes in death.`);
  }
  const bondedDependents = getAliveUnits(state, target.side).filter(
    (unit) => unit.summonerUnitId === target.id && hasAbility(unit, "bonded")
  );
  performHoldTheStandard(state, target);
  triggerUnitAbilities(state, target, { timing: "onDeath", fallenUnit: target });
  getAliveUnits(state).forEach((unit) => {
    if (unit.id !== target.id) {
      triggerUnitAbilities(state, unit, { timing: "onFallen", fallenUnit: target });
      if (target.unitClassTag === "elemental" && hasAbility(unit, "arc-conductor") && unit.side === target.side) {
        applyBlastSequence(state, unit, createRuntimeAbilityState(getAbility("arc-conductor-blast-8")), 8, target.position, /* @__PURE__ */ new Set());
      }
    }
  });
  bondedDependents.forEach(
    (unit) => handleEnvironmentalDeath(state, unit, "bonded", getAbility("bonded").label, `${unit.troopLabel} is destroyed when its summoner falls.`, true)
  );
}
function chooseAttackTarget(state, actor, candidates) {
  if (hasAbility(actor, "executioner")) {
    const lowestHp = Math.min(...candidates.map((enemy) => enemy.hp));
    const lowest = candidates.filter((enemy) => enemy.hp === lowestHp);
    return state.rng.pick(lowest);
  }
  return state.rng.pick(candidates);
}
function tryApplyGlamour(state, actor, target, mode, category) {
  if (category !== "normal" || target.glamourUsed || !hasAbility(target, "glamour") || !isFae(target)) {
    return false;
  }
  const candidates = getAliveUnits(state).filter((unit) => unit.side !== target.side && unit.id !== target.id).filter((unit) => unitsInRange(target, unit));
  if (candidates.length === 0) {
    return false;
  }
  target.glamourUsed = true;
  const redirectedTarget = state.rng.pick(candidates);
  buildStep(state, "buff", [target.id], [redirectedTarget.id], `${target.troopLabel} glamours the attack toward ${redirectedTarget.troopLabel}.`, {
    effect: "glamour",
    sourceAbilityId: "glamour",
    sourceAbilityLabel: getAbility("glamour").label
  });
  attack(state, target, redirectedTarget, target.resolvedStats.range > 0 ? "ranged" : mode, true, 0, "normal");
  return true;
}
function applyStallWarts(state, unit) {
  if (!unit.alive || !hasAbility(unit, "stall-warts")) {
    return;
  }
  const runtime = createRuntimeAbilityState(getAbility("stall-warts"));
  applyStatDelta(state, unit, unit, runtime, {
    kind: "statDelta",
    stat: "armor",
    amount: 1,
    mode: "flat",
    disposition: "beneficial"
  });
  applyStatDelta(state, unit, unit, runtime, {
    kind: "statDelta",
    stat: "speed",
    amount: -1,
    mode: "flat",
    disposition: "harmful"
  });
}
function attack(state, actor, target, mode, allowOnAttackAbilities = true, strikeCount = 0, category = "normal") {
  assertUnitLive(actor, "attack/actor");
  assertUnitLive(target, "attack/target");
  if (tryApplyGlamour(state, actor, target, mode, category)) {
    return;
  }
  const attackContext = { mode, category };
  let attackDamage = actor.resolvedStats.damage;
  const distanceToTarget = unitFootprintDistance(actor, target);
  const heartseekerActive = hasAbility(actor, "heartseeker") && target.engagedWith.size === 0;
  if (heartseekerActive) {
    attackDamage = fixedMul(attackDamage, 2);
  }
  const distanceBonus = getDistanceDamageBonus(actor, target, attackContext);
  attackDamage = fixedAdd(attackDamage, distanceBonus.damage);
  const armorReduction = 0;
  const armorAfterMods = fixedSub(target.resolvedStats.armor, armorReduction);
  const baseDamage = fixedSub(attackDamage, armorAfterMods);
  const modifiedDamage = mode === "ranged" ? fixedMul(baseDamage, state.effects.rangedDamageMultiplier) : baseDamage;
  const shieldDrillDamageCap = mode === "ranged" && hasAbility(target, "shield-drill") ? 1 : null;
  const damage = fixedMax(shieldDrillDamageCap === null ? modifiedDamage : Math.min(modifiedDamage, shieldDrillDamageCap), 0);
  const damageRecipients = [target];
  const damagePerRecipient = damage;
  const inflictedDamage = fixedSum(damageRecipients.map((recipient) => canTakeDamage(recipient) ? damagePerRecipient : 0));
  damageRecipients.forEach((recipient) => {
    if (canTakeDamage(recipient)) {
      recipient.hp = fixedSub(recipient.hp, damagePerRecipient);
    }
  });
  if (distanceBonus.initiative > 0) {
    actor.initiative = fixedAdd(actor.initiative, distanceBonus.initiative);
  }
  buildStep(
    state,
    "attack",
    [actor.id],
    damageRecipients.map((recipient) => recipient.id),
    `${actor.troopLabel} hits ${target.troopLabel} for ${formatFixed(inflictedDamage)}.`,
    {
      damage: inflictedDamage,
      mode,
      category,
      baseDamage: actor.resolvedStats.damage,
      attackDamageBeforeArmor: attackDamage,
      heartseekerMultiplier: heartseekerActive ? 2 : void 0,
      distanceBonus: distanceBonus.damage || void 0,
      armorBefore: target.resolvedStats.armor,
      armorReduction: armorReduction || void 0,
      armorApplied: armorAfterMods,
      rangedMultiplier: mode === "ranged" ? state.effects.rangedDamageMultiplier : void 0
    }
  );
  if (allowOnAttackAbilities) {
    triggerUnitAbilities(state, actor, { timing: "onAttack", attackTarget: target });
  }
  if (mode === "melee" && hasAbility(actor, "bramble-snare") && actor.brambleSnareStacks > 0 && target.alive) {
    applyStatDelta(state, actor, target, createRuntimeAbilityState(getAbility("bramble-snare")), {
      kind: "statDelta",
      stat: "speed",
      amount: actor.brambleSnareStacks * -2,
      mode: "flat",
      disposition: "harmful"
    });
  }
  if (mode === "ranged" && hasAbility(actor, "silver-distance") && distanceToTarget === actor.resolvedStats.range && target.alive) {
    applyInitiativeDelta(state, actor, target, createRuntimeAbilityState(getAbility("silver-distance")), {
      kind: "initiativeDelta",
      amount: -30,
      disposition: "harmful"
    });
  }
  damageRecipients.forEach((recipient) => {
    if (category === "normal") {
      applyStallWarts(state, recipient);
    }
  });
  const deadRecipients = damageRecipients.filter((recipient) => recipient.hp <= 0 && recipient.alive);
  deadRecipients.forEach((recipient) => handleDeath(state, actor, recipient, attackContext));
  damageRecipients.forEach((recipient) => {
    if (recipient.alive && canTakeDamage(recipient)) {
      triggerUnitAbilities(state, recipient, { timing: "onDamaged" });
      if (damagePerRecipient > 0) {
        applyWhimsy(state, recipient);
      }
    }
  });
  if (target.alive) {
    if (category === "normal" && hasAbility(target, "thornhide") && target.role === "frontline" && target.resolvedStats.range === 0 && target.alive) {
      const thornDamage = canTakeDamage(actor) ? 6 : 0;
      if (thornDamage > 0) {
        actor.hp = fixedSub(actor.hp, thornDamage);
      }
      buildStep(state, "attack", [target.id], [actor.id], `${target.troopLabel} thorns ${actor.troopLabel} for ${formatFixed(thornDamage)}.`, {
        damage: thornDamage,
        mode: "blast",
        category: "strike",
        baseDamage: 6,
        attackDamageBeforeArmor: 6,
        armorIgnored: true,
        sourceAbilityId: "thornhide",
        sourceAbilityLabel: getAbility("thornhide").label
      });
      if (actor.hp <= 0 && actor.alive) {
        handleDeath(state, target, actor, { mode: "blast", category: "strike" });
      }
    }
    if (category === "normal" && hasAbility(target, "retaliate") && target.alive && target.engagedWith.size > 0 && availableCapacity(state, target) === 0) {
      attack(state, target, actor, target.resolvedStats.range > 0 ? "ranged" : "melee", true, 0, "retaliation");
    }
  }
  if (mode === "ranged" && allowOnAttackAbilities && actor.alive && hasAbility(actor, "skirmishers-step") && actor.engagedWith.size === 0) {
    skirmisherRetreat(state, actor);
  }
  const bonusStrikeCount = (category === "normal" && actor.bonusStrikeCharges > 0 ? 1 : 0) + (category === "normal" && mode === "melee" && hasAbility(actor, "dogpile") && target.engagedWith.size >= 3 ? 1 : 0);
  if (category === "normal" && actor.bonusStrikeCharges > 0) {
    actor.bonusStrikeCharges -= 1;
  }
  if (bonusStrikeCount > 0 && target.alive) {
    strikeCount += bonusStrikeCount;
  }
  if (strikeCount > 0 && target.alive) {
    for (let i = 0; i < strikeCount; i += 1) {
      attack(state, actor, target, mode, false, 0, "strike");
      if (!target.alive) {
        break;
      }
    }
  }
}
function pileOn(state, actor) {
  const candidates = touchingEnemies(state, actor);
  if (candidates.length === 0) {
    return false;
  }
  const prioritized = candidates.filter(
    (enemy) => getAliveUnits(state, actor.side).filter((ally) => ally.id !== actor.id && unitsTouchOrOverlap(ally, actor)).some((ally) => ally.engagedWith.has(enemy.id))
  );
  attack(state, actor, chooseAttackTarget(state, actor, prioritized.length > 0 ? prioritized : candidates), "melee");
  return true;
}
function fight(state, actor) {
  const engagedEnemies = [...actor.engagedWith].map((enemyId) => state.units.get(enemyId)).filter((enemy) => Boolean(enemy?.alive));
  if (engagedEnemies.length > 0) {
    attack(state, actor, chooseAttackTarget(state, actor, engagedEnemies), "melee");
    return true;
  }
  return pileOn(state, actor);
}
function drawAttention(state, actor, roles = []) {
  const engagedTargets = engageTouchingEnemies(state, actor, roles);
  if (engagedTargets.length > 0) {
    buildStep(state, "engage", [actor.id], engagedTargets.map((target) => target.id), `${actor.troopLabel} engages enemies.`, {
      targetRole: engagedTargets[0]?.role,
      targetHexQ: engagedTargets[0]?.position.q,
      targetHexR: engagedTargets[0]?.position.r
    });
  }
  return fight(state, actor) || engagedTargets.length > 0;
}
function validAdjacentMovementHexes(state, actor) {
  return neighbors(actor.position).filter((coord) => state.mapHexes.has(hexKey(coord))).filter((coord) => isUnitAnchorLegal(state, actor, coord));
}
function validMovementHexes(state, actor) {
  const maxSteps = Math.max(0, Math.floor(actor.resolvedStats.move));
  if (maxSteps <= 0) {
    return [];
  }
  return reachableAnchorsWithinMove(state, actor, maxSteps).map((entry) => entry.coord);
}
function moveUnitPreservingEngagements(unit, destination) {
  unit.position = { ...destination };
  recomputeFootprint(unit);
}
function isBlockedForMovement(state, actor, coord) {
  return !isUnitAnchorLegal(state, actor, coord);
}
function getEnemyUnits(state, actor, roles = []) {
  return getAliveUnits(state).filter((unit) => unit.side !== actor.side).filter((unit) => matchesRoleFilter(unit, roles));
}
function getAlliedBackline(state, actor) {
  return getAliveUnits(state, actor.side).filter((unit) => unit.id !== actor.id && unit.role === "backline");
}
function pickNearestUnit(state, actor, candidates) {
  if (candidates.length === 0) {
    return null;
  }
  const nearestDistance = Math.min(...candidates.map((candidate) => unitFootprintDistance(actor, candidate)));
  return state.rng.pick(candidates.filter((candidate) => unitFootprintDistance(actor, candidate) === nearestDistance));
}
function countTouchingFriendlyFrontline(state, actor, coord) {
  return getAliveUnits(state, actor.side).filter((unit) => unit.id !== actor.id && unit.role === "frontline" && unitAtAnchorTouchesUnit(actor, coord, unit)).length;
}
function countTouchingFriendlies(state, actor, coord) {
  return getAliveUnits(state, actor.side).filter((unit) => unit.id !== actor.id && unitAtAnchorTouchesUnit(actor, coord, unit)).length;
}
function pickRandomHex(state, candidates) {
  return candidates.length === 1 ? candidates[0] : state.rng.pick(candidates);
}
function pickBestMovementHex(state, actor, candidates, scoreHex) {
  if (candidates.length === 0) {
    return null;
  }
  const scored = candidates.map((coord) => ({
    coord,
    score: scoreHex(coord),
    friendlyOccupancy: countTouchingFriendlies(state, actor, coord)
  }));
  const bestScore = Math.max(...scored.map((entry) => entry.score));
  const bestScoreCandidates = scored.filter((entry) => entry.score === bestScore);
  const lowestOccupancy = Math.min(...bestScoreCandidates.map((entry) => entry.friendlyOccupancy));
  const finalists = bestScoreCandidates.filter((entry) => entry.friendlyOccupancy === lowestOccupancy).map((entry) => entry.coord);
  return pickRandomHex(state, finalists);
}
function reachableAnchorsWithinMove(state, actor, maxSteps, includeBlockedDestinations = false) {
  const startKey = hexKey(actor.position);
  const visited = /* @__PURE__ */ new Set([startKey]);
  const reachable = [];
  const queue = [{ coord: actor.position, steps: 0 }];
  while (queue.length > 0) {
    const current = queue.shift();
    if (current.steps >= maxSteps) {
      continue;
    }
    neighbors(current.coord).forEach((coord) => {
      const key = hexKey(coord);
      if (visited.has(key) || !footprintFitsMap(footprintForUnitAt(actor, coord), state.mapHexes)) {
        return;
      }
      visited.add(key);
      const entry = { coord, steps: current.steps + 1 };
      if (isUnitAnchorLegal(state, actor, coord)) {
        reachable.push(entry);
        queue.push(entry);
      } else if (includeBlockedDestinations) {
        reachable.push(entry);
      }
    });
  }
  return reachable;
}
function footprintCollidesAny(footprint, footprints) {
  return footprints.some((other) => footprintsCollide(footprint, other));
}
function findPushedEnemyDestination(state, enemy, actorFootprint, occupiedFootprints, maxSteps) {
  const visited = /* @__PURE__ */ new Set([hexKey(enemy.position)]);
  const queue = [{ coord: enemy.position, steps: 0 }];
  const candidates = [];
  while (queue.length > 0) {
    const current = queue.shift();
    if (current.steps >= maxSteps) {
      continue;
    }
    neighbors(current.coord).forEach((coord) => {
      const key = hexKey(coord);
      if (visited.has(key)) {
        return;
      }
      visited.add(key);
      const steps = current.steps + 1;
      const footprint = footprintForUnitAt(enemy, coord);
      if (footprintFitsMap(footprint, state.mapHexes)) {
        const contactDistance = footprintDistance(footprint, actorFootprint);
        if (contactDistance <= 1 && !footprintsCollide(footprint, actorFootprint) && !footprintCollidesAny(footprint, occupiedFootprints)) {
          candidates.push({ destination: coord, footprint, steps, contactDistance });
        }
      }
      queue.push({ coord, steps });
    });
  }
  if (candidates.length === 0) {
    return null;
  }
  candidates.sort((left, right) => left.steps - right.steps || right.contactDistance - left.contactDistance || left.destination.r - right.destination.r || left.destination.q - right.destination.q);
  const selected = candidates[0];
  return { destination: selected.destination, footprint: selected.footprint, steps: selected.steps };
}
function buildFrontlinePushCandidate(state, actor, anchor, steps, preEngaged) {
  const actorFootprint = footprintForUnitAt(actor, anchor);
  const preEngagedIds = new Set(preEngaged.map((enemy) => enemy.id));
  const blockingEnemies = getAliveUnits(state).filter((unit) => unit.side !== actor.side).filter((unit) => footprintsCollide(actorFootprint, unit.occupiedHexes));
  if (blockingEnemies.some((enemy) => !preEngagedIds.has(enemy.id) || enemy.resolvedStats.size >= actor.resolvedStats.size)) {
    return null;
  }
  const pushedIds = new Set(blockingEnemies.map((enemy) => enemy.id));
  const fixedFootprints = getAliveUnits(state).filter((unit) => unit.id !== actor.id && !pushedIds.has(unit.id)).map((unit) => unit.occupiedHexes);
  if (footprintCollidesAny(actorFootprint, fixedFootprints)) {
    return null;
  }
  const pushed = [];
  const occupiedForPushes = [...fixedFootprints, actorFootprint];
  for (const enemy of blockingEnemies) {
    const maxPushSteps = actor.resolvedStats.move - steps;
    if (maxPushSteps <= 0) {
      return null;
    }
    const placement = findPushedEnemyDestination(state, enemy, actorFootprint, occupiedForPushes, maxPushSteps);
    if (!placement) {
      return null;
    }
    pushed.push({ unit: enemy, ...placement });
    occupiedForPushes.push(placement.footprint);
  }
  const footprintForEnemy = (enemy) => pushed.find((entry) => entry.unit.id === enemy.id)?.footprint ?? enemy.occupiedHexes;
  if (!preEngaged.every((enemy) => footprintsTouchOrOverlap(actorFootprint, footprintForEnemy(enemy)))) {
    return null;
  }
  const touchingEnemies2 = getAliveUnits(state).filter((unit) => unit.side !== actor.side).filter((enemy) => footprintsTouchOrOverlap(actorFootprint, footprintForEnemy(enemy)));
  const engagedSize = Math.min(actor.resolvedStats.capacity, fixedSum(touchingEnemies2.map((enemy) => enemy.resolvedStats.size)));
  const newlyEngagedCount = touchingEnemies2.filter((enemy) => !preEngagedIds.has(enemy.id)).length;
  const currentEngagedSize = Math.min(actor.resolvedStats.capacity, fixedSum(preEngaged.map((enemy) => enemy.resolvedStats.size)));
  if (engagedSize <= currentEngagedSize && newlyEngagedCount === 0) {
    return null;
  }
  return {
    anchor,
    steps,
    pushed,
    engagedSize,
    newlyEngagedCount,
    reasonCode: pushed.length > 0 ? "frontline-push-through" : "frontline-reposition-capacity"
  };
}
function tryFrontlinePushThrough(state, actor) {
  if (actor.role !== "frontline" || actor.engagedWith.size === 0 || availableCapacity(state, actor) <= 0 || actor.resolvedStats.move <= 0) {
    return false;
  }
  const preEngaged = [...actor.engagedWith].map((enemyId) => state.units.get(enemyId)).filter((enemy) => Boolean(enemy?.alive));
  if (preEngaged.length === 0) {
    return false;
  }
  const candidates = reachableAnchorsWithinMove(state, actor, actor.resolvedStats.move, true).map((entry) => buildFrontlinePushCandidate(state, actor, entry.coord, entry.steps, preEngaged)).filter((candidate) => Boolean(candidate));
  if (candidates.length === 0) {
    return false;
  }
  candidates.sort(
    (left, right) => right.engagedSize - left.engagedSize || right.newlyEngagedCount - left.newlyEngagedCount || left.steps - right.steps || left.pushed.length - right.pushed.length || left.anchor.r - right.anchor.r || left.anchor.q - right.anchor.q
  );
  const selected = candidates[0];
  selected.pushed.forEach((push) => moveUnitPreservingEngagements(push.unit, push.destination));
  moveUnitPreservingEngagements(actor, selected.anchor);
  clearStaleEngagements(state);
  getAliveUnits(state).filter((unit) => unit.side !== actor.side && !actor.engagedWith.has(unit.id) && unitsTouchOrOverlap(actor, unit)).sort((left, right) => left.resolvedStats.size - right.resolvedStats.size || left.id.localeCompare(right.id)).forEach((enemy) => {
    if (enemy.resolvedStats.size <= availableCapacity(state, actor)) {
      createEngagement(state, actor, enemy);
    }
  });
  buildStep(
    state,
    "move",
    [actor.id],
    selected.pushed.map((push) => push.unit.id),
    selected.pushed.length > 0 ? `${actor.troopLabel} pushes through the melee.` : `${actor.troopLabel} repositions to hold more enemies.`,
    {
      reasonCode: selected.reasonCode,
      toQ: actor.position.q,
      toR: actor.position.r,
      pushedUnitIds: selected.pushed.map((push) => push.unit.id),
      engagedSize: selected.engagedSize,
      newlyEngagedCount: selected.newlyEngagedCount
    }
  );
  return true;
}
function tryPusherBreakthrough(state, actor) {
  if (actor.role !== "pusher" || actor.engagedWith.size === 0) {
    return false;
  }
  const candidates = [...actor.engagedWith].map((enemyId) => state.units.get(enemyId)).filter((enemy) => Boolean(enemy?.alive)).filter((enemy) => enemy.resolvedStats.size < actor.resolvedStats.size).filter(
    (enemy) => getAliveUnits(state, actor.side).some((ally) => ally.id !== actor.id && ally.engagedWith.has(enemy.id))
  );
  if (candidates.length === 0) {
    return false;
  }
  const target = chooseAttackTarget(state, actor, candidates);
  actor.engagedWith.delete(target.id);
  target.engagedWith.delete(actor.id);
  actor.committedBacklineTargetId = null;
  buildStep(state, "move", [actor.id], [target.id], `${actor.troopLabel} breaks through ${target.troopLabel}.`, {
    reasonCode: "pusher-breakthrough",
    targetRole: target.role,
    targetHexQ: target.position.q,
    targetHexR: target.position.r
  });
  return true;
}
function allStateMapHexes(state) {
  return hexSetToCoords(state.mapHexes);
}
function randomLegalRelocationHex(state, actor) {
  const candidates = allStateMapHexes(state).filter((coord) => !equalsHex(coord, actor.position) && isUnitAnchorLegal(state, actor, coord));
  if (candidates.length === 0) {
    return null;
  }
  return pickRandomHex(state, candidates);
}
function applyWhimsy(state, actor) {
  if (!actor.alive || !hasAbility(actor, "whimsy") || !isFae(actor)) {
    return;
  }
  const destination = randomLegalRelocationHex(state, actor);
  if (!destination) {
    return;
  }
  relocateUnit(state, actor, destination);
  buildStep(state, "move", [actor.id], [], `${actor.troopLabel} is carried away by Whimsy.`, {
    effect: "whimsy",
    sourceAbilityId: "whimsy",
    sourceAbilityLabel: getAbility("whimsy").label,
    toQ: actor.position.q,
    toR: actor.position.r
  });
}
function getScreenPriority(state, actor, candidate) {
  const alliedBackline = getAlliedBackline(state, actor);
  if (alliedBackline.length === 0) {
    return unitFootprintDistance(actor, candidate);
  }
  const backlineDistance = Math.min(...alliedBackline.map((unit) => unitFootprintDistance(unit, candidate)));
  const actorDistance = unitFootprintDistance(actor, candidate);
  return backlineDistance * 100 + actorDistance;
}
function formatRoleIntentMessage(roleIntent) {
  return {
    "screen-frontline": "screens the front",
    "fallback-backline": "falls through to the backline",
    "breach-backline": "breaches toward the backline",
    "hold-backline": "holds pressure on the backline",
    "retreat-range": "retreats to preserve range",
    "advance-range": "advances to keep range"
  }[roleIntent];
}
function pickFrontlineObjective(state, actor) {
  const screeningTargets = getEnemyUnits(state, actor, ["frontline", "pusher"]);
  if (screeningTargets.length > 0) {
    const bestPriority = Math.min(...screeningTargets.map((target2) => getScreenPriority(state, actor, target2)));
    const priorityTiedTargets = screeningTargets.filter((target2) => getScreenPriority(state, actor, target2) === bestPriority);
    const target = pickNearestUnit(state, actor, priorityTiedTargets);
    return {
      target,
      roleIntent: "screen-frontline",
      reasonCode: "block-access",
      targetRole: target.role
    };
  }
  const backlineTarget = pickNearestUnit(state, actor, getEnemyUnits(state, actor, ["backline"]));
  if (!backlineTarget) {
    return null;
  }
  return {
    target: backlineTarget,
    roleIntent: "fallback-backline",
    reasonCode: "no-frontline-target",
    targetRole: backlineTarget.role
  };
}
function pickPusherObjective(state, actor) {
  const committedTarget = actor.committedBacklineTargetId ? state.units.get(actor.committedBacklineTargetId) : null;
  if (committedTarget?.alive && committedTarget.side !== actor.side && committedTarget.role === "backline") {
    return {
      target: committedTarget,
      roleIntent: "hold-backline",
      reasonCode: "maintain-backline-commitment",
      targetRole: committedTarget.role
    };
  }
  const backlineTarget = pickNearestUnit(state, actor, getEnemyUnits(state, actor, ["backline"]));
  if (backlineTarget) {
    actor.committedBacklineTargetId = backlineTarget.id;
    return {
      target: backlineTarget,
      roleIntent: "breach-backline",
      reasonCode: "opened-backline-lane",
      targetRole: backlineTarget.role
    };
  }
  actor.committedBacklineTargetId = null;
  const fallbackTarget = pickNearestUnit(state, actor, getEnemyUnits(state, actor));
  if (!fallbackTarget) {
    return null;
  }
  return {
    target: fallbackTarget,
    roleIntent: "screen-frontline",
    reasonCode: "no-backline-target",
    targetRole: fallbackTarget.role
  };
}
function findClosestEnemy(state, actor, preferredRoles, nonEngagedOnly) {
  const enemies = getAliveUnits(state).filter(
    (unit) => unit.side !== actor.side && (preferredRoles.length === 0 || preferredRoles.includes(unit.role)) && (!nonEngagedOnly || unit.engagedWith.size === 0)
  );
  if (enemies.length === 0) {
    return null;
  }
  return pickNearestUnit(state, actor, enemies);
}
function moveToward(state, actor, target, roleIntent, reasonCode, targetRole) {
  const options = validMovementHexes(state, actor);
  if (options.length === 0) {
    return false;
  }
  const currentDistance = unitFootprintDistance(actor, target);
  const scored = options.map((coord) => {
    const enemiesHere = getAliveUnits(state).filter((unit) => unit.side !== actor.side && unitAtAnchorTouchesUnit(actor, coord, unit));
    return {
      coord,
      distance: unitDistanceFromAnchor(actor, coord, target),
      nonEngagedEnemies: enemiesHere.filter((unit) => unit.engagedWith.size === 0).length
    };
  });
  const progressMoves = scored.filter((entry) => entry.distance < currentDistance);
  const pool = progressMoves.length > 0 ? progressMoves : scored;
  const minDistance = Math.min(...pool.map((entry) => entry.distance));
  const byDistance = pool.filter((entry) => entry.distance === minDistance);
  const minEnemies = Math.min(...byDistance.map((entry) => entry.nonEngagedEnemies));
  let finalists = byDistance.filter((entry) => entry.nonEngagedEnemies === minEnemies);
  if (actor.role === "frontline" && roleIntent === "fallback-backline" && finalists.length > 1) {
    const minFrontlineSupport = Math.min(...finalists.map((entry) => countTouchingFriendlyFrontline(state, actor, entry.coord)));
    finalists = finalists.filter((entry) => countTouchingFriendlyFrontline(state, actor, entry.coord) === minFrontlineSupport);
  }
  const selected = state.rng.pick(finalists);
  if (equalsHex(selected.coord, actor.position)) {
    return false;
  }
  const blockedPreference = neighbors(actor.position).filter((coord) => state.mapHexes.has(hexKey(coord))).filter((coord) => isBlockedForMovement(state, actor, coord)).map((coord) => {
    const enemiesHere = getAliveUnits(state).filter((unit) => unit.side !== actor.side && unitAtAnchorTouchesUnit(actor, coord, unit));
    return {
      coord,
      distance: unitDistanceFromAnchor(actor, coord, target),
      nonEngagedEnemies: enemiesHere.filter((unit) => unit.engagedWith.size === 0).length
    };
  }).filter((entry) => entry.distance < currentDistance).filter((entry) => entry.distance < selected.distance || entry.distance === selected.distance && entry.nonEngagedEnemies < selected.nonEngagedEnemies).filter((entry) => hexDistance(entry.coord, selected.coord) === 1).sort((a, b) => a.distance - b.distance || a.nonEngagedEnemies - b.nonEngagedEnemies)[0]?.coord;
  relocateUnit(state, actor, selected.coord);
  const routeMetadata = blockedPreference && hexDistance(blockedPreference, actor.position) === 1 ? {
    routedAroundBlockedQ: blockedPreference.q,
    routedAroundBlockedR: blockedPreference.r
  } : {};
  if (roleIntent && reasonCode && targetRole) {
    emitRoleIntentStep(state, "move", actor, [target], `${actor.troopLabel} ${formatRoleIntentMessage(roleIntent)}.`, {
      roleIntent,
      reasonCode,
      targetRole,
      targetHexQ: target.position.q,
      targetHexR: target.position.r,
      toQ: actor.position.q,
      toR: actor.position.r,
      ...routeMetadata
    });
  } else {
    buildStep(state, "move", [actor.id], [], `${actor.troopLabel} moves.`, { toQ: actor.position.q, toR: actor.position.r, ...routeMetadata });
  }
  return true;
}
function enemiesInRange(state, actor) {
  return getAliveUnits(state).filter((enemy) => enemy.side !== actor.side && unitsInRange(actor, enemy));
}
function nearestEnemyDistance(state, actor) {
  const enemies = getEnemyUnits(state, actor);
  if (enemies.length === 0) {
    return null;
  }
  return Math.min(...enemies.map((enemy) => unitFootprintDistance(actor, enemy)));
}
function engageObjective(state, actor, objective) {
  const preferredRoles = objective.targetRole === "backline" ? ["backline"] : ["frontline", "pusher"];
  if (touchingEnemies(state, actor).some((enemy) => matchesRoleFilter(enemy, preferredRoles))) {
    const engagedTargets = engageTouchingEnemies(state, actor, preferredRoles, actor.role === "pusher");
    if (engagedTargets.length > 0) {
      emitRoleIntentStep(state, "engage", actor, engagedTargets, `${actor.troopLabel} ${formatRoleIntentMessage(objective.roleIntent)}.`, {
        roleIntent: objective.roleIntent,
        reasonCode: objective.reasonCode,
        targetRole: objective.targetRole,
        targetHexQ: objective.target.position.q,
        targetHexR: objective.target.position.r
      });
      if (actor.role === "pusher" && tryPusherBreakthrough(state, actor)) {
        return true;
      }
    }
    return fight(state, actor) || engagedTargets.length > 0;
  }
  const moved = moveToward(state, actor, objective.target, objective.roleIntent, objective.reasonCode, objective.targetRole);
  const enemiesOnCell = touchingEnemies(state, actor);
  if (enemiesOnCell.length === 0) {
    return moved;
  }
  if (enemiesOnCell.some((enemy) => matchesRoleFilter(enemy, preferredRoles))) {
    const engagedTargets = engageTouchingEnemies(state, actor, preferredRoles, actor.role === "pusher");
    if (engagedTargets.length > 0) {
      emitRoleIntentStep(state, "engage", actor, engagedTargets, `${actor.troopLabel} ${formatRoleIntentMessage(objective.roleIntent)}.`, {
        roleIntent: objective.roleIntent,
        reasonCode: objective.reasonCode,
        targetRole: objective.targetRole,
        targetHexQ: objective.target.position.q,
        targetHexR: objective.target.position.r
      });
      if (actor.role === "pusher" && tryPusherBreakthrough(state, actor)) {
        return true;
      }
    }
    return fight(state, actor) || engagedTargets.length > 0 || moved;
  }
  return drawAttention(state, actor) || moved;
}
function scoreRetreatHex(state, actor, coord) {
  const enemies = getEnemyUnits(state, actor);
  if (enemies.length === 0) {
    return 0;
  }
  const nearestEnemy = Math.min(...enemies.map((enemy) => unitDistanceFromAnchor(actor, coord, enemy)));
  const totalEnemyDistance = enemies.reduce((sum, enemy) => sum + unitDistanceFromAnchor(actor, coord, enemy), 0);
  return nearestEnemy * 100 + totalEnemyDistance;
}
function retreatFromEngagement(state, actor, threat, message, effect, requireEnemyInRange = false) {
  const options = validMovementHexes(state, actor).filter(
    (coord) => getAliveUnits(state).filter((unit) => unit.side !== actor.side && unitAtAnchorTouchesUnit(actor, coord, unit)).length === 0 && (!requireEnemyInRange || getEnemyUnits(state, actor).some((enemy) => unitDistanceFromAnchor(actor, coord, enemy) <= actor.resolvedStats.range))
  );
  if (options.length === 0) {
    return false;
  }
  const selected = pickBestMovementHex(state, actor, options, (coord) => scoreRetreatHex(state, actor, coord));
  if (!selected) {
    return false;
  }
  relocateUnit(state, actor, selected);
  buildStep(state, "move", [actor.id], threat ? [threat.id] : [], message, {
    effect,
    toQ: actor.position.q,
    toR: actor.position.r,
    sourceAbilityId: effect === "skirmishersStep" ? "skirmishers-step" : effect === "fadeIntoShadow" ? "fade-into-shadow" : void 0,
    sourceAbilityLabel: effect === "skirmishersStep" ? getAbility("skirmishers-step").label : effect === "fadeIntoShadow" ? getAbility("fade-into-shadow").label : void 0
  });
  return true;
}
function skirmisherRetreat(state, actor) {
  const nearestThreat = pickNearestUnit(state, actor, getEnemyUnits(state, actor));
  return retreatFromEngagement(
    state,
    actor,
    nearestThreat,
    `${actor.troopLabel} steps back to keep a firing lane.`,
    "skirmishersStep",
    true
  );
}
function retreat(state, actor) {
  const target = pickNearestUnit(state, actor, getEnemyUnits(state, actor));
  const options = validMovementHexes(state, actor).filter(
    (coord) => getAliveUnits(state).filter((unit) => unit.side !== actor.side && unitAtAnchorTouchesUnit(actor, coord, unit)).length === 0
  );
  if (options.length > 0) {
    const selected = pickBestMovementHex(state, actor, options, (coord) => scoreRetreatHex(state, actor, coord));
    if (!selected) {
      return false;
    }
    relocateUnit(state, actor, selected);
    if (target) {
      emitRoleIntentStep(state, "move", actor, [target], `${actor.troopLabel} retreats to preserve range.`, {
        roleIntent: "retreat-range",
        reasonCode: "increase-threat-distance",
        targetRole: target.role,
        targetHexQ: target.position.q,
        targetHexR: target.position.r,
        toQ: actor.position.q,
        toR: actor.position.r
      });
    } else {
      buildStep(state, "move", [actor.id], [], `${actor.troopLabel} retreats.`, { toQ: actor.position.q, toR: actor.position.r });
    }
    return true;
  }
  const sameHexEnemies = touchingEnemies(state, actor);
  if (sameHexEnemies.length > 0) {
    attack(state, actor, chooseAttackTarget(state, actor, sameHexEnemies), "melee");
    return true;
  }
  return false;
}
function carefulAdvance(state, actor) {
  const target = findClosestEnemy(state, actor, [], false);
  if (!target) {
    return false;
  }
  const options = validMovementHexes(state, actor).filter((coord) => {
    const becomesCloser = unitDistanceFromAnchor(actor, coord, target) < unitFootprintDistance(actor, target);
    if (!becomesCloser) {
      return false;
    }
    const alliesOnTarget = getAliveUnits(state, actor.side).filter((ally) => unitAtAnchorTouchesUnit(actor, coord, ally));
    return alliesOnTarget.every((ally) => ally.resolvedStats.range >= actor.resolvedStats.range);
  });
  if (options.length === 0) {
    return false;
  }
  const currentDistance = unitFootprintDistance(actor, target);
  const selected = pickBestMovementHex(
    state,
    actor,
    options,
    (coord) => currentDistance - unitDistanceFromAnchor(actor, coord, target)
  );
  if (!selected) {
    return false;
  }
  relocateUnit(state, actor, selected);
  emitRoleIntentStep(state, "move", actor, [target], `${actor.troopLabel} advances to keep range.`, {
    roleIntent: "advance-range",
    reasonCode: "maintain-firing-lane",
    targetRole: target.role,
    targetHexQ: target.position.q,
    targetHexR: target.position.r,
    toQ: actor.position.q,
    toR: actor.position.r
  });
  return true;
}
function applyQuakes(state) {
  if (!state.effects.randomMoveEveryBeats || state.effects.randomMoveEveryBeats <= 0) {
    return;
  }
  if (state.beatCount % state.effects.randomMoveEveryBeats !== 0) {
    return;
  }
  state.rng.shuffle(getAliveUnits(state)).forEach((unit) => {
    const options = validAdjacentMovementHexes(state, unit);
    if (options.length === 0) {
      return;
    }
    const destination = pickRandomHex(state, options);
    relocateUnit(state, unit, destination);
    buildStep(state, "move", [unit.id], [], `${unit.troopLabel} is displaced by quakes.`, {
      effect: "quakes",
      sourceAbilityId: "quakes",
      sourceAbilityLabel: getMutator("quakes").label,
      toQ: unit.position.q,
      toR: unit.position.r
    });
  });
}
function applyDecay(state) {
  if (state.effects.decayDamagePerBeat <= 0) {
    return;
  }
  getAliveUnits(state).forEach((unit) => {
    const damage = canTakeDamage(unit) ? state.effects.decayDamagePerBeat : 0;
    if (damage > 0) {
      unit.hp = fixedSub(unit.hp, damage);
    }
    buildStep(state, "attack", [], [unit.id], `${unit.troopLabel} loses ${formatFixed(damage)} HP to Decay.`, {
      damage,
      mode: "blast",
      category: "strike",
      baseDamage: state.effects.decayDamagePerBeat,
      attackDamageBeforeArmor: state.effects.decayDamagePerBeat,
      armorIgnored: true,
      effect: "decay",
      sourceAbilityId: "decay",
      sourceAbilityLabel: getMutator("decay").label
    });
    if (unit.hp <= 0 && unit.alive) {
      handleEnvironmentalDeath(state, unit, "decay", getMutator("decay").label, `${unit.troopLabel} is consumed by Decay.`);
    } else if (unit.alive && canTakeDamage(unit)) {
      triggerUnitAbilities(state, unit, { timing: "onDamaged" });
      if (damage > 0) {
        applyWhimsy(state, unit);
      }
    }
  });
}
function spawnPendingDiggyHoleUnits(state) {
  if (state.beatCount !== 10) {
    return;
  }
  ["player", "enemy"].forEach((side) => {
    const pending = state.pendingDiggyHoleCombatants[side];
    if (pending.length === 0) {
      return;
    }
    const before = new Set(state.units.keys());
    const placementSide = side === "player" ? "enemy" : "player";
    state.mapHexes = placeUnitsForSideWithMapExpansion(side, pending, state.units, state.mapHexes, state.rng, placementSide);
    state.pendingDiggyHoleCombatants[side] = [];
    const spawned = [...state.units.values()].filter((unit) => !before.has(unit.id));
    spawned.forEach((unit) => applyMutatorAdjustmentsToUnit(unit, state.effects));
    buildStep(
      state,
      "move",
      spawned.map((unit) => unit.id),
      [],
      `Diggy Hole opens beneath enemy lines for ${side === "player" ? "player" : "enemy"} Dwarves.`,
      {
        effect: "diggyHole",
        sourceAbilityId: "diggy-hole",
        sourceAbilityLabel: getAbility("diggy-hole").label
      }
    );
  });
  applyCopiousAle(state);
}
function combatantWasBrought(input, side, raceId) {
  const combatants = side === "player" ? input.playerCombatants : input.enemyCombatants;
  return combatants.some((combatant) => combatant.raceId === raceId);
}
function applyChangeling(state) {
  if (state.beatCount !== 12) {
    return;
  }
  ["player", "enemy"].forEach((side) => {
    if (state.changelingTriggeredSides.has(side) || !sideHasRaceUpgrade(state, side, "fae-changeling") || !combatantWasBrought(state.input, side, "fae")) {
      return;
    }
    const enemySide = side === "player" ? "enemy" : "player";
    const byTroop = /* @__PURE__ */ new Map();
    getAliveUnits(state, enemySide).forEach((unit) => {
      const key = unit.troopInstanceId ?? unit.troopLabel;
      byTroop.set(key, [...byTroop.get(key) ?? [], unit]);
    });
    const changed = [];
    byTroop.forEach((units) => {
      const unit = state.rng.pick(units);
      removeAllEngagements(state, unit);
      unit.side = side;
      unit.committedBacklineTargetId = null;
      unit.initiative = 0;
      changed.push(unit);
    });
    state.changelingTriggeredSides.add(side);
    if (changed.length > 0) {
      clearStaleEngagements(state);
      clearInvalidBacklineCommitments(state);
      changed.forEach((unit) => state.distinctTypeCache.delete(unit.side));
      state.distinctTypeCache.delete(enemySide);
      buildStep(
        state,
        "buff",
        [],
        changed.map((unit) => unit.id),
        `Changeling turns ${changed.length} enemy ${changed.length === 1 ? "unit" : "units"}.`,
        {
          effect: "changeling",
          sourceAbilityId: "changeling",
          sourceAbilityLabel: getAbility("changeling").label
        }
      );
    }
  });
}
function applyBeatMutators(state) {
  spawnPendingDiggyHoleUnits(state);
  applyChangeling(state);
  applyQuakes(state);
  applyDecay(state);
}
function executeTurnActions(state, actor) {
  clearStaleEngagements(state);
  if (actor.committedBacklineTargetId) {
    const committedTarget = state.units.get(actor.committedBacklineTargetId);
    if (!committedTarget?.alive || committedTarget.side === actor.side || committedTarget.role !== "backline") {
      actor.committedBacklineTargetId = null;
    }
  }
  const engagedEnemies = [...actor.engagedWith].map((enemyId) => state.units.get(enemyId)).filter((enemy) => Boolean(enemy?.alive));
  if (engagedEnemies.length > 0) {
    if (actor.role === "frontline" && tryFrontlinePushThrough(state, actor)) {
      return;
    }
    if (actor.role === "pusher" && tryPusherBreakthrough(state, actor)) {
      const remainingEngagedEnemies = [...actor.engagedWith].map((enemyId) => state.units.get(enemyId)).filter((enemy) => Boolean(enemy?.alive));
      if (remainingEngagedEnemies.length > 0) {
        attack(state, actor, chooseAttackTarget(state, actor, remainingEngagedEnemies), "melee");
        return;
      }
    } else {
      attack(state, actor, chooseAttackTarget(state, actor, engagedEnemies), "melee");
      return;
    }
  }
  if (actor.role === "pusher") {
    const sameHexEnemies = touchingEnemies(state, actor);
    if (sameHexEnemies.length > 0) {
      const engagedTargets = engageTouchingEnemies(state, actor, [], true);
      if (engagedTargets.length > 0) {
        buildStep(state, "engage", [actor.id], engagedTargets.map((target) => target.id), `${actor.troopLabel} engages enemies.`, {
          reasonCode: "pusher-contact-engage",
          targetRole: engagedTargets[0]?.role,
          targetHexQ: engagedTargets[0]?.position.q,
          targetHexR: engagedTargets[0]?.position.r
        });
      }
      const preferredTargets = sameHexEnemies.filter((enemy) => enemy.role === "backline");
      attack(state, actor, chooseAttackTarget(state, actor, preferredTargets.length > 0 ? preferredTargets : sameHexEnemies), "melee");
      return;
    }
    const objective = pickPusherObjective(state, actor);
    if (objective) {
      engageObjective(state, actor, objective);
    }
    return;
  }
  if (engagedEnemies.length > 0) {
    attack(state, actor, chooseAttackTarget(state, actor, engagedEnemies), "melee");
    return;
  }
  if (actor.role === "frontline") {
    const objective = pickFrontlineObjective(state, actor);
    if (objective) {
      engageObjective(state, actor, objective);
    }
    return;
  }
  const nearestThreatDistance = nearestEnemyDistance(state, actor);
  if ((nearestThreatDistance ?? Number.MAX_SAFE_INTEGER) <= 1) {
    retreat(state, actor);
    return;
  }
  const inRange = enemiesInRange(state, actor);
  if (inRange.length > 0) {
    attack(state, actor, chooseAttackTarget(state, actor, inRange), "ranged");
    return;
  }
  carefulAdvance(state, actor);
}
function executeTurn(state, actor) {
  if (!actor.alive) {
    return;
  }
  state.currentTurnUnitId = actor.id;
  executeStartOfTurnAbilities(state, actor);
  if (!actor.alive) {
    state.currentTurnUnitId = null;
    return;
  }
  executeTurnActions(state, actor);
  executeEndOfTurnAbilities(state, actor);
  expireTimedEffects(state, actor);
  if (actor.alive && actor.berserkDeathPending) {
    actor.berserkTurnsUntilDeath = Math.max(0, actor.berserkTurnsUntilDeath - 1);
    if (actor.berserkTurnsUntilDeath === 0) {
      handleEnvironmentalDeath(state, actor, "berserk", getAbility("berserk").label, `${actor.troopLabel} burns out after going berserk.`, true);
    }
  }
  state.currentTurnUnitId = null;
}
function isBattleOver(state) {
  const playerPresent = getAliveUnits(state, "player").length > 0 || hasPendingDiggyHoleUnits(state, "player");
  const enemyPresent = getAliveUnits(state, "enemy").length > 0 || hasPendingDiggyHoleUnits(state, "enemy");
  return !playerPresent || !enemyPresent;
}
function resolveBattle(rawInput) {
  const input = normalizeBattleInput(rawInput);
  const seed = input.seed ?? randomSeed();
  const rng = createRng(seed);
  const init = initializeUnits(input, rng);
  const state = {
    units: init.units,
    pendingDiggyHoleCombatants: init.pendingDiggyHoleCombatants,
    copiousAleAppliedTroopKeys: /* @__PURE__ */ new Set(),
    corpses: /* @__PURE__ */ new Map(),
    summonedProfiles: /* @__PURE__ */ new Map(),
    steps: [],
    mapRadius: init.mapRadius,
    mapHexes: new Set(init.mapHexes.map(hexKey)),
    rng,
    beatCount: 0,
    effects: buildEffects(input.mutatorIds),
    replayId: makeReplayId(seed, input.riftId),
    input,
    currentTurnUnitId: null,
    changelingTriggeredSides: /* @__PURE__ */ new Set(),
    pendingGraveVigorBlocks: [],
    distinctTypeCache: /* @__PURE__ */ new Map()
  };
  state.units.forEach((unit) => applyMutatorAdjustmentsToUnit(unit, state.effects));
  const troopLabels = Object.fromEntries(
    [...input.playerCombatants, ...input.enemyCombatants].map((combatant) => [combatant.combatantId, combatant.label])
  );
  const initial = cloneSnapshot(state.units);
  executeStartOfBattleAbilities(state);
  applyCopiousAle(state);
  while (!isBattleOver(state) && state.beatCount < MAX_BEATS) {
    state.beatCount += 1;
    getAliveUnits(state).forEach((unit) => {
      unit.initiative = fixedAdd(unit.initiative, fixedAdd(unit.resolvedStats.speed, state.effects.initiativeBonusPerBeat));
    });
    buildStep(state, "beat", [], [], `Beat ${state.beatCount}: initiative increases for all units.`, {
      beat: state.beatCount,
      initiativeBonus: state.effects.initiativeBonusPerBeat
    });
    applyBeatMutators(state);
    const ready = getAliveUnits(state).filter((unit) => unit.initiative >= 100).map((unit) => unit.id);
    state.rng.shuffle(ready).forEach((unitId) => {
      const unit = state.units.get(unitId);
      if (!unit?.alive) {
        return;
      }
      unit.initiative = fixedSub(unit.initiative, 100);
      executeTurn(state, unit);
    });
  }
  const snapshots = [initial, ...state.steps.map((step) => step.snapshot)];
  const finalCounts = createAliveCount(snapshots[snapshots.length - 1] ?? initial);
  return {
    id: state.replayId,
    seed,
    riftId: input.riftId,
    tier: input.tier,
    mutatorIds: [...input.mutatorIds],
    mapRadius: state.mapRadius,
    mapHexes: hexSetToCoords(state.mapHexes),
    initial,
    steps: state.steps,
    outcome: resolveBattleOutcome(state),
    troopLabels,
    troopProfiles: buildTroopProfiles(input, state.summonedProfiles, state.effects),
    aliveCounts: snapshots.map(createAliveCount),
    summary: {
      playerTroops: input.playerCombatants.map((combatant) => combatant.label),
      enemyTroops: input.enemyCombatants.map((combatant) => combatant.label),
      finalPlayerAlive: finalCounts.player,
      finalEnemyAlive: finalCounts.enemy
    }
  };
}
export {
  buildBattleInputFromResolvedCombatants,
  resolveAbilityTargetRadius2 as resolveAbilityTargetRadius,
  resolveBattle,
  resolveDebugBattle
};
//# sourceMappingURL=battle.js.map
