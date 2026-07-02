import {
  allHexes,
  equalsHex,
  footprintDistance,
  footprintForSize,
  footprintsOverlap as footprintsCollide,
  footprintsTouchOrOverlap,
  hexDistance,
  hexKey,
  leftmostHex,
  neighbors,
  rightmostHex,
  visualVerticalLineKey,
  type FootprintOrientation,
} from './hex';
import { fixed, fixedAdd, fixedClamp, fixedMax, fixedMul, fixedSub, fixedSum, formatFixed } from './fixed';
import { createRng, randomSeed, type Rng } from './rng';
import { normalizeBattleInput, normalizeRoleId, normalizeUnitStats } from './compat';
import { clampStat, composeSummonedTroopDefinition, getAbility, getMutator } from './unitCatalog';
import {
  effectDisposition,
  filterTargetCandidates,
  matchesFallenTrigger,
  prioritizeCandidates,
  resolveAbilityTargetRadius,
  resolveFallenTriggerRadius,
} from './battleAbilityRules';
import type {
  BattleAbilityExplanation,
  BattleDamageExplanation,
  AbilityDefinition,
  AbilityEffectDefinition,
  AbilityTargetDefinition,
  AbilityTiming,
  BattleMovementExplanation,
  BattleInput,
  BattleReplay,
  BattleStepMetadata,
  BattleStepExplanation,
  RoleIntentId,
  ReplayTroopProfile,
  BattleStateSnapshot,
  BattleStep,
  BattleStepKind,
  BattleUnit,
  EffectDisposition,
  HexCoord,
  ResolvedCombatantDefinition,
  RoleId,
  SideId,
  UnitStats,
} from './types';
export { resolveAbilityTargetRadius } from './battleAbilityRules';
export { buildBattleInputFromResolvedCombatants, resolveDebugBattle } from './battleInput';

type RuntimeAbilityState = {
  definition: AbilityDefinition;
  triggerCount: number;
  usesRemaining: number | null;
};

type ActiveTimedEffect =
  | {
      effectKind: 'bolster';
      sourceAbilityId: string;
      sourceUnitId: string;
      remainingTurns: number;
      maxApplied: number;
      hpApplied: number;
    }
  | {
      effectKind: 'haste' | 'ramp';
      sourceAbilityId: string;
      sourceUnitId: string;
      remainingTurns: number;
      amountApplied: number;
    }
  | {
      effectKind: 'statDelta';
      sourceAbilityId: string;
      sourceUnitId: string;
      remainingTurns: number;
      stat: 'damage' | 'rate' | 'move' | 'armor' | 'range' | 'capacity';
      amountApplied: number;
    }
  | {
      effectKind: 'rangeset';
      sourceAbilityId: string;
      sourceUnitId: string;
      remainingTurns: number;
      previousValue: number;
    }
  | {
      effectKind: 'roleset';
      sourceAbilityId: string;
      sourceUnitId: string;
      remainingTurns: number;
      previousRole: RoleId;
    };

type InternalUnit = {
  id: string;
  combatantId: string | null;
  troopInstanceId: string | null;
  troopLabel: string;
  unitClassId: string;
  raceId: string;
  side: SideId;
  summonerUnitId: string | null;
  role: RoleId;
  unitClassTag: string;
  attributes: string[];
  position: HexCoord;
  occupiedHexes: HexCoord[];
  footprintOrientation: FootprintOrientation;
  hp: number;
  maxHp: number;
  readiness: number;
  alive: boolean;
  engagedWith: Set<string>;
  resolvedStats: UnitStats;
  resolvedAbilities: RuntimeAbilityState[];
  activeTimedEffects: ActiveTimedEffect[];
  committedBacklineTargetId: string | null;
  graveVigorBlockedSides: Set<SideId>;
  mercyBeforeDawnUsed: boolean;
  stonebloodUsed: boolean;
  fadeIntoShadowUsed: boolean;
  glamourUsed: boolean;
  brambleSnareStacks: number;
  bonusStrikeCharges: number;
  scavengersHungerKills: number;
  sentinelRunesTriggered: boolean;
  berserkDeathPending: boolean;
  berserkTurnsUntilDeath: number;
  holyConstructsTriggered: boolean;
  hexedStacks: number;
  zealStacks: number;
};

type AbilityTriggerEvent = {
  timing: AbilityTiming;
  attackTarget?: InternalUnit;
  fallenUnit?: InternalUnit;
  appliedEffect?: {
    effect: AbilityEffectDefinition;
    target: InternalUnit;
    disposition: EffectDisposition;
  };
};

type AttackCategory = 'normal' | 'retaliation' | 'strike';

type AttackContext = {
  mode: 'melee' | 'ranged' | 'blast';
  category: AttackCategory;
};

type RecordedBattleStep = Omit<BattleStep, 'snapshot'> & {
  unitDeltas: BattleUnit[];
};

interface InternalState {
  units: Map<string, InternalUnit>;
  aliveUnitIds: Record<SideId, Set<string>>;
  pendingDiggyHoleCombatants: Record<SideId, ResolvedCombatantDefinition[]>;
  copiousAleAppliedTroopKeys: Set<string>;
  corpses: Map<string, HexCoord>;
  summonedProfiles: Map<string, ReplayTroopProfile>;
  steps: RecordedBattleStep[];
  dirtyUnitIds: Set<string>;
  snapshotCache: Map<string, BattleUnit>;
  mapRadius: number;
  mapHexes: Set<string>;
  rng: Rng;
  beatCount: number;
  effects: {
    readinessBonusPerBeat: number;
    rangedDamageMultiplier: number;
    armorCap: number | null;
    randomMoveEveryBeats: number | null;
    hpLossPerBeat: number;
  };
  replayId: string;
  input: BattleInput;
  currentTurnUnitId: string | null;
  changelingTriggeredSides: Set<SideId>;
  pendingGraveVigorBlocks: Array<{ unitId: string; side: SideId }>;
  distinctTypeCache: Map<SideId, string[]>;
  dreamworkTriggeredUnitIdsThisBeat: Set<string>;
  crackExploitsDepth: number;
}

const BASE_MAP_RADIUS = 3;
const MAX_BEATS = 1000;
const MIN_SPAWN_FOOTPRINT_DISTANCE = 2;
const MIN_MELEE_TO_RANGED_SPAWN_DISTANCE = 3;

function chooseFootprintOrientation(rng: Rng): FootprintOrientation {
  return rng.next() < 0.5 ? 'north' : 'south';
}

function recomputeFootprint(unit: InternalUnit): void {
  unit.occupiedHexes = footprintForSize(unit.position, unit.resolvedStats.size, unit.footprintOrientation);
}

function mapHexesForRadius(radius: number): HexCoord[] {
  return allHexes(radius);
}

function mapRadiusForHexes(hexes: HexCoord[]): number {
  return Math.max(0, ...hexes.map((hex) => hexDistance(hex, { q: 0, r: 0 })));
}

function parseHexKey(key: string): HexCoord {
  const [q, r] = key.split(',').map(Number);
  return { q: q ?? 0, r: r ?? 0 };
}

function hexSetToCoords(hexes: Set<string>): HexCoord[] {
  return [...hexes].map(parseHexKey);
}

function translateUnit(unit: InternalUnit, delta: HexCoord): void {
  unit.position = { q: unit.position.q + delta.q, r: unit.position.r + delta.r };
  recomputeFootprint(unit);
}

function footprintForUnitAt(unit: Pick<InternalUnit, 'resolvedStats' | 'footprintOrientation'>, anchor: HexCoord): HexCoord[] {
  return footprintForSize(anchor, unit.resolvedStats.size, unit.footprintOrientation);
}

function footprintFitsMap(footprint: HexCoord[], mapHexes: Set<string>): boolean {
  return footprint.every((hex) => mapHexes.has(hexKey(hex)));
}

function isFootprintPlacementLegal(state: Pick<InternalState, 'units' | 'mapHexes'>, footprint: HexCoord[], movingUnitId?: string): boolean {
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

function isUnitAnchorLegal(state: Pick<InternalState, 'units' | 'mapHexes'>, unit: InternalUnit, anchor: HexCoord): boolean {
  return isFootprintPlacementLegal(state, footprintForUnitAt(unit, anchor), unit.id);
}

function unitsTouchOrOverlap(left: InternalUnit, right: InternalUnit): boolean {
  return footprintsTouchOrOverlap(left.occupiedHexes, right.occupiedHexes);
}

function unitFootprintDistance(left: InternalUnit, right: InternalUnit): number {
  return footprintDistance(left.occupiedHexes, right.occupiedHexes);
}

function unitDistanceFromHex(unit: InternalUnit, hex: HexCoord): number {
  return footprintDistance(unit.occupiedHexes, [hex]);
}

function unitDistanceFromAnchor(unit: InternalUnit, anchor: HexCoord, target: InternalUnit): number {
  return footprintDistance(footprintForUnitAt(unit, anchor), target.occupiedHexes);
}

function unitAtAnchorTouchesUnit(unit: InternalUnit, anchor: HexCoord, target: InternalUnit): boolean {
  return footprintsTouchOrOverlap(footprintForUnitAt(unit, anchor), target.occupiedHexes);
}

function unitOverlapsHex(unit: InternalUnit, hex: HexCoord): boolean {
  return unit.occupiedHexes.some((occupied) => equalsHex(occupied, hex));
}

function unitOverlapsAnyHex(unit: InternalUnit, hexes: HexCoord[]): boolean {
  return footprintsCollide(unit.occupiedHexes, hexes);
}

function unitTouchesHex(unit: InternalUnit, hex: HexCoord): boolean {
  return unitDistanceFromHex(unit, hex) <= 1;
}

function unitTouchesAnyHex(unit: InternalUnit, hexes: HexCoord[]): boolean {
  return footprintDistance(unit.occupiedHexes, hexes) <= 1;
}

function unitsInRange(actor: InternalUnit, target: InternalUnit, range = actor.resolvedStats.range): boolean {
  return unitFootprintDistance(actor, target) <= range;
}

function mirrorHexLeftRight(hex: HexCoord): HexCoord {
  return { q: -hex.q - hex.r, r: hex.r };
}

function sideVisualDirection(side: SideId): number {
  return side === 'player' ? 1 : -1;
}

function sortedMapAnchors(mapHexes: Set<string>, side: SideId): HexCoord[] {
  const direction = sideVisualDirection(side);
  return hexSetToCoords(mapHexes)
    .sort((left, right) =>
      direction * (visualVerticalLineKey(left) - visualVerticalLineKey(right)) ||
      Math.abs(left.r) - Math.abs(right.r) ||
      left.r - right.r ||
      left.q - right.q,
    );
}

function orientationForAnchor(
  units: Map<string, InternalUnit>,
  mapHexes: Set<string>,
  stats: UnitStats,
  anchor: HexCoord,
  rng: Rng,
): FootprintOrientation | null {
  const legalOrientations = (['north', 'south'] as FootprintOrientation[]).filter((orientation) =>
    isFootprintPlacementLegal({ units, mapHexes }, footprintForSize(anchor, stats.size, orientation)),
  );
  if (legalOrientations.length === 0) {
    return null;
  }
  return legalOrientations.length === 1 ? legalOrientations[0]! : rng.pick(legalOrientations);
}

function createPlacedUnit(
  side: SideId,
  combatant: ResolvedCombatantDefinition,
  index: number,
  anchor: HexCoord,
  orientation: FootprintOrientation,
  rng: Rng,
): InternalUnit {
  const unitId = `${side}_${combatant.combatantId}_${index}`;
  return {
    id: unitId,
    combatantId: combatant.combatantId,
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
    readiness: fixed(rng.int(11)),
    alive: true,
    engagedWith: new Set<string>(),
    resolvedStats: { ...combatant.stats },
    resolvedAbilities: combatant.abilities.map(createRuntimeAbilityState),
    activeTimedEffects: [],
    committedBacklineTargetId: null,
    graveVigorBlockedSides: new Set<SideId>(),
    mercyBeforeDawnUsed: false,
    stonebloodUsed: false,
    fadeIntoShadowUsed: false,
    glamourUsed: false,
    brambleSnareStacks: 0,
    bonusStrikeCharges: 0,
    scavengersHungerKills: 0,
    sentinelRunesTriggered: false,
    berserkDeathPending: false,
    berserkTurnsUntilDeath: 0,
    holyConstructsTriggered: false,
    hexedStacks: 0,
    zealStacks: 0,
  };
}

function minimumDistanceToUnits(footprint: HexCoord[], units: InternalUnit[]): number {
  if (units.length === 0) {
    return Number.POSITIVE_INFINITY;
  }
  return Math.min(...units.map((unit) => footprintDistance(footprint, unit.occupiedHexes)));
}

function sharesVisualVerticalLine(footprint: HexCoord[], reference: HexCoord): boolean {
  const referenceKey = visualVerticalLineKey(reference);
  return footprint.some((hex) => visualVerticalLineKey(hex) === referenceKey);
}

type PlacementCategory = 'ranged' | 'melee';

function placeCombatantCategory(
  side: SideId,
  placementSide: SideId,
  category: PlacementCategory,
  combatants: ResolvedCombatantDefinition[],
  units: Map<string, InternalUnit>,
  mapHexes: Set<string>,
  anchors: HexCoord[],
  rng: Rng,
  indexOffset: number,
  rangedUnits: InternalUnit[],
): InternalUnit[] | null {
  if (combatants.length === 0) {
    return [];
  }

  const placed: InternalUnit[] = [];
  const shuffled = rng.shuffle(combatants);
  let referenceLineHex: HexCoord | null = null;
  let meleeReferenceHex: HexCoord | null = null;

  if (category === 'melee' && rangedUnits.length > 0) {
    const closestRanged = [...rangedUnits].sort((left, right) =>
      hexDistance({ q: 0, r: 0 }, left.position) - hexDistance({ q: 0, r: 0 }, right.position) ||
      left.id.localeCompare(right.id),
    )[0]!;
    meleeReferenceHex = side === 'player' ? rightmostHex(closestRanged.occupiedHexes) : leftmostHex(closestRanged.occupiedHexes);
  }

  for (const [offset, combatant] of shuffled.entries()) {
    const buildCandidatePlacements = (strict: boolean) => anchors
      .flatMap((anchor) => (['north', 'south'] as FootprintOrientation[]).map((orientation) => {
        const footprint = footprintForSize(anchor, combatant.stats.size, orientation);
        if (!isFootprintPlacementLegal({ units, mapHexes }, footprint)) {
          return null;
        }
        const friendlyUnits = [...units.values()].filter((unit) => unit.side === side);
        const friendlyRanged = friendlyUnits.filter((unit) => unit.resolvedStats.range > 0);
        if (minimumDistanceToUnits(footprint, friendlyUnits) < MIN_SPAWN_FOOTPRINT_DISTANCE) {
          return null;
        }
        if (strict && category === 'ranged' && placed.length > 0) {
          if (referenceLineHex && !sharesVisualVerticalLine(footprint, referenceLineHex)) {
            return null;
          }
        }
        if (strict && category === 'melee') {
          if (meleeReferenceHex && placed.length === 0 && footprintDistance(footprint, [meleeReferenceHex]) < 5) {
            return null;
          }
          if (referenceLineHex && placed.length > 0 && !sharesVisualVerticalLine(footprint, referenceLineHex)) {
            return null;
          }
        }
        if (category === 'melee' && minimumDistanceToUnits(footprint, friendlyRanged) < MIN_MELEE_TO_RANGED_SPAWN_DISTANCE) {
          return null;
        }
        return {
          anchor,
          orientation,
          footprint,
          centerDistance: hexDistance(anchor, { q: 0, r: 0 }),
          edgeScore: sideVisualDirection(placementSide) * visualVerticalLineKey(anchor),
        };
      }))
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
      .sort((left, right) => {
        if (category === 'melee' && meleeReferenceHex && placed.length === 0) {
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

    const selected = relaxedCandidatePlacements[0]!;
    const unit = createPlacedUnit(side, combatant, indexOffset + offset, selected.anchor, selected.orientation, rng);
    units.set(unit.id, unit);
    placed.push(unit);
    if (!referenceLineHex) {
      referenceLineHex = placementSide === 'player' ? leftmostHex(unit.occupiedHexes) : rightmostHex(unit.occupiedHexes);
    }
  }

  return placed;
}

function placeUnitsForSide(
  side: SideId,
  combatants: ResolvedCombatantDefinition[],
  units: Map<string, InternalUnit>,
  mapHexes: Set<string>,
  rng: Rng,
  placementSide: SideId = side,
): boolean {
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
  const anchors = sortedMapAnchors(mapHexes, placementSide);
  const rangedPlaced = placeCombatantCategory(side, placementSide, 'ranged', ranged, units, mapHexes, anchors, rng, 0, []);
  if (!rangedPlaced) {
    rollback();
    return false;
  }
  const meleePlaced = placeCombatantCategory(side, placementSide, 'melee', melee, units, mapHexes, anchors, rng, ranged.length, rangedPlaced);
  if (!meleePlaced) {
    rollback();
    return false;
  }
  return true;
}

function expandedMapHexes(mapHexes: Set<string>, placementSide: SideId, margin: number): Set<string> {
  const current = hexSetToCoords(mapHexes);
  if (current.length === 0) {
    return new Set(mapHexesForRadius(BASE_MAP_RADIUS + margin).map(hexKey));
  }
  // Emergency placement overflow deliberately uses a rectangular axial bound.
  // It preserves the visible map's row-contiguous shape better than a radial
  // hex expansion when very large footprints need extra staging room.
  const qValues = current.map((hex) => hex.q);
  const rValues = current.map((hex) => hex.r);
  const minQ = Math.min(...qValues) - (placementSide === 'player' ? margin : 0);
  const maxQ = Math.max(...qValues) + (placementSide === 'enemy' ? margin : 0);
  const minR = Math.min(...rValues) - margin;
  const maxR = Math.max(...rValues) + margin;
  const next = new Set<string>();
  for (let q = minQ; q <= maxQ; q += 1) {
    for (let r = minR; r <= maxR; r += 1) {
      next.add(hexKey({ q, r }));
    }
  }
  return next;
}

function placeUnitsForSideWithMapExpansion(
  side: SideId,
  combatants: ResolvedCombatantDefinition[],
  units: Map<string, InternalUnit>,
  mapHexes: Set<string>,
  rng: Rng,
  placementSide: SideId,
): Set<string> {
  for (let margin = 0; margin <= 100; margin += 1) {
    const candidateMapHexes = margin === 0 ? mapHexes : expandedMapHexes(mapHexes, placementSide, margin);
    if (placeUnitsForSide(side, combatants, units, candidateMapHexes, rng, placementSide)) {
      return candidateMapHexes;
    }
  }
  throw new Error(`Failed to place ${side} units after expanding the explicit battlefield.`);
}

function closestOpposingFootprintDistance(units: Map<string, InternalUnit>): number {
  const players = [...units.values()].filter((unit) => unit.side === 'player');
  const enemies = [...units.values()].filter((unit) => unit.side === 'enemy');
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

function translateSide(units: Map<string, InternalUnit>, side: SideId, delta: HexCoord): void {
  units.forEach((unit) => {
    if (unit.side === side) {
      translateUnit(unit, delta);
    }
  });
}

function filledMapFromUnitBounds(units: Map<string, InternalUnit>): HexCoord[] {
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
  const lineForRowAtOrBelow = (line: number, r: number) => line - Math.abs(line - r) % 2;
  const lineForRowAtOrAbove = (line: number, r: number) => line + Math.abs(line - r) % 2;
  const hexes: HexCoord[] = [];
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

function finalizeInitialMap(units: Map<string, InternalUnit>): { mapHexes: HexCoord[]; mapRadius: number } {
  let distance = closestOpposingFootprintDistance(units);
  let guard = 0;
  while (distance !== 7 && guard < 100) {
    translateSide(units, 'enemy', { q: distance < 7 ? 1 : -1, r: 0 });
    distance = closestOpposingFootprintDistance(units);
    guard += 1;
  }
  if (distance !== 7) {
    throw new Error(`Failed to finalize battlefield gap: closest opposing footprint distance is ${distance}`);
  }
  const mapHexes = filledMapFromUnitBounds(units);
  return { mapHexes, mapRadius: mapRadiusForHexes(mapHexes) };
}

function makeReplayId(seed: number, riftId: string | null): string {
  return `${riftId ?? 'debug'}-${seed}`;
}

function buildEffects(mutatorIds: string[]): InternalState['effects'] {
  return mutatorIds.reduce(
    (effects, mutatorId) => {
      const definition = getMutator(mutatorId);
      return {
        readinessBonusPerBeat: effects.readinessBonusPerBeat + (definition.readinessBonusPerBeat ?? 0),
        rangedDamageMultiplier: effects.rangedDamageMultiplier * (definition.rangedDamageMultiplier ?? 1),
        armorCap:
          typeof definition.armorCap === 'number'
            ? effects.armorCap === null
              ? definition.armorCap
              : Math.min(effects.armorCap, definition.armorCap)
            : effects.armorCap,
        randomMoveEveryBeats:
          typeof definition.randomMoveEveryBeats === 'number'
            ? effects.randomMoveEveryBeats === null
              ? definition.randomMoveEveryBeats
              : Math.min(effects.randomMoveEveryBeats, definition.randomMoveEveryBeats)
            : effects.randomMoveEveryBeats,
        hpLossPerBeat: effects.hpLossPerBeat + (definition.hpLossPerBeat ?? 0),
      };
    },
    { readinessBonusPerBeat: 0, rangedDamageMultiplier: 1, armorCap: null, randomMoveEveryBeats: null, hpLossPerBeat: 0 },
  );
}

function applyArmorCap(value: number, effects: InternalState['effects']): number {
  if (effects.armorCap === null) {
    return value;
  }
  return Math.min(value, effects.armorCap);
}

function applyMutatorAdjustmentsToUnit(unit: InternalUnit, effects: InternalState['effects']): void {
  unit.resolvedStats.armor = applyArmorCap(unit.resolvedStats.armor, effects);
}

function getSideRaceUpgradeIds(state: InternalState, side: SideId): string[] {
  return side === 'player' ? (state.input.playerRaceUpgradeIds ?? []) : (state.input.enemyRaceUpgradeIds ?? []);
}

function getSideTroopClassUpgradeIds(state: InternalState, side: SideId): string[] {
  return side === 'player' ? (state.input.playerTroopClassUpgradeIds ?? []) : (state.input.enemyTroopClassUpgradeIds ?? []);
}

function sideHasRaceUpgrade(state: InternalState, side: SideId, upgradeId: string): boolean {
  return getSideRaceUpgradeIds(state, side).includes(upgradeId);
}

function inputSideHasRaceUpgrade(input: BattleInput, side: SideId, upgradeId: string): boolean {
  return (side === 'player' ? (input.playerRaceUpgradeIds ?? []) : (input.enemyRaceUpgradeIds ?? [])).includes(upgradeId);
}

function sideHasTroopClassUpgrade(state: InternalState, side: SideId, upgradeId: string): boolean {
  return getSideTroopClassUpgradeIds(state, side).includes(upgradeId);
}

function snapshotUnit(unit: InternalUnit): BattleUnit {
  return {
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
    readiness: fixed(unit.readiness),
    alive: unit.alive,
    engagedWithIds: [...unit.engagedWith],
  };
}

function cloneBattleUnit(unit: BattleUnit): BattleUnit {
  return {
    ...unit,
    attributes: [...unit.attributes],
    position: { ...unit.position },
    occupiedHexes: unit.occupiedHexes.map((hex) => ({ ...hex })),
    stats: { ...unit.stats },
    engagedWithIds: [...unit.engagedWithIds],
  };
}

function cloneSnapshot(units: Map<string, InternalUnit>): BattleStateSnapshot {
  return {
    units: [...units.values()].map(snapshotUnit),
  };
}

function battleUnitChanged(left: BattleUnit | undefined, right: BattleUnit): boolean {
  return !left || JSON.stringify(left) !== JSON.stringify(right);
}

function recordStepDeltas(state: InternalState): BattleUnit[] {
  const deltas: BattleUnit[] = [];
  state.dirtyUnitIds.clear();
  state.units.forEach((unit) => {
    const next = snapshotUnit(unit);
    if (!battleUnitChanged(state.snapshotCache.get(unit.id), next)) {
      return;
    }
    state.snapshotCache.set(unit.id, cloneBattleUnit(next));
    state.dirtyUnitIds.add(unit.id);
    deltas.push(next);
  });
  return deltas;
}

function materializeRecordedSteps(initial: BattleStateSnapshot, recordedSteps: RecordedBattleStep[]): BattleStep[] {
  const cache = new Map(initial.units.map((unit) => [unit.id, cloneBattleUnit(unit)]));
  return recordedSteps.map(({ unitDeltas, ...step }) => {
    unitDeltas.forEach((unit) => {
      cache.set(unit.id, cloneBattleUnit(unit));
    });
    return {
      ...step,
      actorIds: [...step.actorIds],
      targetIds: [...step.targetIds],
      metadata: step.metadata ? { ...step.metadata } : undefined,
      snapshot: { units: [...cache.values()].map(cloneBattleUnit) },
    };
  });
}

function createAliveCount(snapshot: BattleStateSnapshot): BattleReplay['aliveCounts'][number] {
  const byTroopLabel: Record<string, number> = {};
  let player = 0;
  let enemy = 0;

  snapshot.units.forEach((unit) => {
    if (!unit.alive) {
      return;
    }
    if (unit.side === 'player') {
      player += 1;
    } else {
      enemy += 1;
    }
    byTroopLabel[unit.troopLabel] = (byTroopLabel[unit.troopLabel] ?? 0) + 1;
  });

  return { player, enemy, byTroopLabel };
}

function cloneAbilityDefinition(ability: AbilityDefinition): AbilityDefinition {
  return {
    ...ability,
    trigger: { ...ability.trigger, fallen: ability.trigger.fallen ? { ...ability.trigger.fallen } : undefined },
    duration: { ...ability.duration },
    target: ability.target
      ? {
          ...ability.target,
          filters: ability.target.filters
            ? {
                notClasses: ability.target.filters.notClasses ? [...ability.target.filters.notClasses] : undefined,
                onlyClasses: ability.target.filters.onlyClasses ? [...ability.target.filters.onlyClasses] : undefined,
                prioritizeClasses: ability.target.filters.prioritizeClasses ? [...ability.target.filters.prioritizeClasses] : undefined,
                unengaged: ability.target.filters.unengaged,
              }
            : undefined,
        }
      : undefined,
    effects: ability.effects.map((effect) => ({ ...effect })),
  };
}

function createRuntimeAbilityState(ability: AbilityDefinition): RuntimeAbilityState {
  return {
    definition: cloneAbilityDefinition(ability),
    triggerCount: 0,
    usesRemaining: ability.trigger.maxUses ?? null,
  };
}

function buildTroopProfiles(
  input: BattleInput,
  summonedProfiles: Map<string, ReplayTroopProfile>,
  effects: InternalState['effects'],
): ReplayTroopProfile[] {
  const seen = new Set<string>();
  const profiles: ReplayTroopProfile[] = [];

  [...input.playerCombatants, ...input.enemyCombatants].forEach((combatant) => {
    const key = `${combatant.side}:${combatant.label}`;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    const stats = { ...combatant.stats, armor: applyArmorCap(combatant.stats.armor, effects) };
    const abilities = combatant.abilities.map(cloneAbilityDefinition);
    const statBreakdowns =
      combatant.statBreakdowns
        ? {
            ...combatant.statBreakdowns,
            armor:
              stats.armor === combatant.stats.armor
                ? combatant.statBreakdowns.armor
                : {
                    ...combatant.statBreakdowns.armor,
                    finalValue: stats.armor,
                    lines: [
                      ...combatant.statBreakdowns.armor.lines,
                      { label: 'Corrosion', value: fixedSub(stats.armor, combatant.stats.armor), kind: 'delta' as const },
                    ],
                  },
          }
        : undefined;
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
      statBreakdowns:
        statBreakdowns ??
        {
          health: { stat: 'health', finalValue: stats.health, lines: [{ label: 'Resolved', value: stats.health, kind: 'base' }] },
          damage: { stat: 'damage', finalValue: stats.damage, lines: [{ label: 'Resolved', value: stats.damage, kind: 'base' }] },
          rate: { stat: 'rate', finalValue: stats.rate, lines: [{ label: 'Resolved', value: stats.rate, kind: 'base' }] },
          ...(combatant.role === 'frontline' ? { move: { stat: 'move' as const, finalValue: stats.move, lines: [{ label: 'Resolved', value: stats.move, kind: 'base' as const }] } } : {}),
          armor: { stat: 'armor', finalValue: stats.armor, lines: [{ label: 'Resolved', value: stats.armor, kind: 'base' }] },
          range: { stat: 'range', finalValue: stats.range, lines: [{ label: 'Resolved', value: stats.range, kind: 'base' }] },
          capacity: { stat: 'capacity', finalValue: stats.capacity, lines: [{ label: 'Resolved', value: stats.capacity, kind: 'base' }] },
          size: { stat: 'size', finalValue: stats.size, lines: [{ label: 'Resolved', value: stats.size, kind: 'base' }] },
        },
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

function buildStep(
  state: InternalState,
  kind: BattleStepKind,
  actorIds: string[],
  targetIds: string[],
  message: string,
  metadata?: BattleStepMetadata,
): void {
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
    unitDeltas: recordStepDeltas(state),
  });
}

function sameIds(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

function mergeUniqueIds(left: string[], right: string[]): string[] {
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

function canMergeStep(previous: BattleStep, kind: BattleStepKind, actorIds: string[], metadata?: BattleStepMetadata): boolean {
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
  return (
    previousMetadata.stat === metadata.stat &&
    previousMetadata.temporary === metadata.temporary &&
    previousMetadata.expired === metadata.expired &&
    previousMetadata.abilityId === metadata.abilityId &&
    previousMetadata.role === metadata.role &&
    previousMetadata.unitClassId === metadata.unitClassId
  );
}

function mergedNumericValue(left: unknown, right: unknown): number | undefined {
  return typeof left === 'number' && typeof right === 'number' ? fixedAdd(left, right) : undefined;
}

function unitLabelsForIds(state: InternalState, targetIds: string[]): string[] {
  return targetIds.map((id) => state.units.get(id)?.troopLabel).filter((label): label is string => Boolean(label));
}

function formatTargetSubject(state: InternalState, targetIds: string[]): string {
  const labels = [...new Set(unitLabelsForIds(state, targetIds))];
  if (labels.length === 0) {
    return 'Targets';
  }
  if (labels.length === 1) {
    return labels[0]!;
  }
  if (labels.length === 2) {
    return `${labels[0]} and ${labels[1]}`;
  }
  return `${labels[0]} and ${labels.length - 1} others`;
}

function subjectVerb(subject: string, singularVerb: string, pluralVerb: string): string {
  return subject.includes(' and ') ? pluralVerb : singularVerb;
}

function rebuildBatchedMessage(state: InternalState, step: Pick<BattleStep, 'actorIds' | 'kind' | 'message' | 'metadata' | 'targetIds'>): string {
  const metadata = step.metadata;
  if (!metadata) {
    return step.message;
  }
  const targetSubject = formatTargetSubject(state, step.targetIds);
  const amount = typeof metadata.amount === 'number' ? metadata.amount : undefined;
  const sourceSuffix = sourceLabelForStep(state, step.actorIds, metadata);
  const finish = (base: string) => (sourceSuffix ? `${base} from the ${sourceSuffix}.` : `${base}.`);
  const untilEndOfTurn = metadata.temporary === true && metadata.expired !== true ? ' until end of turn' : '';
  const verb = metadata.expired === true || (typeof amount === 'number' && amount < 0) ? 'loses' : 'gains';
  const signedAmount = typeof amount === 'number' ? (verb === 'gains' ? formatSigned(amount) : formatSigned(Math.abs(amount))) : null;

  if ((metadata.effect === 'ramp' || (metadata.effect === 'statDelta' && metadata.stat === 'damage')) && signedAmount) {
    return finish(`${targetSubject} ${subjectVerb(targetSubject, verb, verb === 'gains' ? 'gain' : 'lose')} ${signedAmount} damage${untilEndOfTurn}`);
  }
  if ((metadata.effect === 'haste' || (metadata.effect === 'statDelta' && metadata.stat === 'rate')) && signedAmount) {
    return finish(`${targetSubject} ${subjectVerb(targetSubject, verb, verb === 'gains' ? 'gain' : 'lose')} ${signedAmount} rate${untilEndOfTurn}`);
  }
  if (metadata.effect === 'bolster' && signedAmount) {
    return finish(`${targetSubject} ${subjectVerb(targetSubject, verb, verb === 'gains' ? 'gain' : 'lose')} ${signedAmount} health${untilEndOfTurn}`);
  }
  if (metadata.effect === 'readinessDelta' && signedAmount) {
    return finish(`${targetSubject} ${subjectVerb(targetSubject, verb, verb === 'gains' ? 'gain' : 'lose')} ${signedAmount} readiness`);
  }
  if (metadata.effect === 'summon') {
    const actor = step.actorIds.length === 1 ? state.units.get(step.actorIds[0]!) ?? null : null;
    const summonedLabels = [...new Set(unitLabelsForIds(state, step.targetIds))];
    const summonedLabel = summonedLabels.length === 1 ? summonedLabels[0]! : `${step.targetIds.length} units`;
    const countSuffix = step.targetIds.length > 1 && summonedLabels.length === 1 ? ` x${step.targetIds.length}` : '';
    return finish(`${actor?.troopLabel ?? 'A unit'} summons ${summonedLabel}${countSuffix}`);
  }
  if (metadata.effect === 'heal' && typeof metadata.amount === 'number') {
    const actor = step.actorIds.length === 1 ? state.units.get(step.actorIds[0]!) ?? null : null;
    return finish(`${actor?.troopLabel ?? 'A unit'} heals ${targetSubject} for ${formatFixed(metadata.amount)}`);
  }
  if (kindIsAttackStep(step) && metadata.effect === 'hpLoss' && typeof metadata.hpLoss === 'number') {
    return finish(`${targetSubject} ${subjectVerb(targetSubject, 'loses', 'lose')} ${formatFixed(metadata.hpLoss)} HP`);
  }
  if (kindIsAttackStep(step) && typeof metadata.damage === 'number') {
    const actor = step.actorIds.length === 1 ? state.units.get(step.actorIds[0]!) ?? null : null;
    const mode = metadata.mode === 'blast' ? 'blast damage to' : 'damage to';
    return finish(`${actor?.troopLabel ?? 'A unit'} deals ${formatFixed(metadata.damage)} ${mode} ${targetSubject}`);
  }
  return step.message;
}

function kindIsAttackStep(step: Pick<BattleStep, 'kind'>): boolean {
  return step.kind === 'attack';
}

function tryMergeStep(
  state: InternalState,
  previous: RecordedBattleStep,
  kind: BattleStepKind,
  actorIds: string[],
  targetIds: string[],
  _message: string,
  metadata?: BattleStepMetadata,
): boolean {
  if (!canMergeStep(previous, kind, actorIds, metadata)) {
    return false;
  }
  const repeatsExistingTargets = targetIds.length > 0 && targetIds.every((id) => previous.targetIds.includes(id));
  previous.targetIds = mergeUniqueIds(previous.targetIds, targetIds);
  const previousMetadata = previous.metadata!;
  if (repeatsExistingTargets || targetIds.length === 0) {
    const amount = mergedNumericValue(previousMetadata.amount, metadata!.amount);
    if (typeof amount === 'number') {
      previousMetadata.amount = amount;
    }
    const damage = mergedNumericValue(previousMetadata.damage, metadata!.damage);
    if (typeof damage === 'number') {
      previousMetadata.damage = damage;
      previousMetadata.finalDamage = damage;
    }
  }
  previousMetadata.batchCount = ((typeof previousMetadata.batchCount === 'number' ? previousMetadata.batchCount : 1) + 1);
  previous.unitDeltas = recordStepDeltas(state);
  previous.metadata = enrichStepMetadata(state, previous.kind, previous.actorIds, previous.targetIds, previousMetadata);
  previous.message = rebuildBatchedMessage(state, previous);
  return true;
}

function buildAbilityExplanation(metadata: BattleStepMetadata): BattleAbilityExplanation | undefined {
  if (!metadata.sourceAbilityId && !metadata.sourceAbilityLabel) {
    return undefined;
  }

  return {
    abilityId: metadata.sourceAbilityId ?? 'battle-resolution',
    abilityLabel: metadata.sourceAbilityLabel,
    effect: typeof metadata.effect === 'string' ? metadata.effect : undefined,
  };
}

function buildMovementExplanation(kind: 'move' | 'engage', actor: InternalUnit | null, metadata: BattleStepMetadata): BattleMovementExplanation | undefined {
  const hasDestination = typeof metadata.toQ === 'number' && typeof metadata.toR === 'number';
  const hasRoleDecision = typeof metadata.roleIntent === 'string' && typeof metadata.reasonCode === 'string';
  const effect = typeof metadata.effect === 'string' ? metadata.effect : undefined;

  if (!hasDestination && !hasRoleDecision && !effect && kind !== 'engage') {
    return undefined;
  }

  const movementKind =
    hasRoleDecision ? 'objective' : effect === 'fadeIntoShadow' || effect === 'skirmishersStep' ? 'ability' : effect ? 'retreat' : 'generic';
  const movementPhase =
    effect === 'fadeIntoShadow' || effect === 'skirmishersStep'
      ? 'ability'
      : effect
        ? 'withdraw'
        : kind === 'engage'
          ? 'commit'
          : hasDestination || hasRoleDecision
            ? 'approach'
            : 'generic';

  return {
    stepKind: kind,
    movementKind,
    movementPhase,
    unitRole: actor?.role,
    roleIntent: metadata.roleIntent,
    reasonCode: metadata.reasonCode,
    targetRole: metadata.targetRole,
    targetHex:
      typeof metadata.targetHexQ === 'number' && typeof metadata.targetHexR === 'number'
        ? { q: metadata.targetHexQ, r: metadata.targetHexR }
        : undefined,
    destination: hasDestination ? { q: metadata.toQ as number, r: metadata.toR as number } : undefined,
    routedAroundBlockedHex:
      typeof metadata.routedAroundBlockedQ === 'number' && typeof metadata.routedAroundBlockedR === 'number'
        ? { q: metadata.routedAroundBlockedQ, r: metadata.routedAroundBlockedR }
        : undefined,
    keepEnemyInRange: effect === 'skirmishersStep' ? true : undefined,
  };
}

function buildDamageExplanation(metadata: BattleStepMetadata): BattleDamageExplanation | undefined {
  if (typeof metadata.damage !== 'number' || typeof metadata.mode !== 'string' || typeof metadata.category !== 'string') {
    return undefined;
  }

  return {
    mode: metadata.mode,
    category: metadata.category,
    baseDamage: typeof metadata.baseDamage === 'number' ? metadata.baseDamage : metadata.damage,
    attackDamageBeforeArmor: typeof metadata.attackDamageBeforeArmor === 'number' ? metadata.attackDamageBeforeArmor : metadata.damage,
    finalDamage: metadata.damage,
    heartseekerMultiplier: typeof metadata.heartseekerMultiplier === 'number' ? metadata.heartseekerMultiplier : undefined,
    distanceBonus: typeof metadata.distanceBonus === 'number' ? metadata.distanceBonus : undefined,
    armorBefore: typeof metadata.armorBefore === 'number' ? metadata.armorBefore : undefined,
    armorReduction: typeof metadata.armorReduction === 'number' ? metadata.armorReduction : undefined,
    armorApplied: typeof metadata.armorApplied === 'number' ? metadata.armorApplied : undefined,
    armorInteraction: metadata.armorIgnored ? 'ignored' : 'normal',
    rangedMultiplier: typeof metadata.rangedMultiplier === 'number' ? metadata.rangedMultiplier : undefined,
  };
}

function buildHpLossExplanation(metadata: BattleStepMetadata): BattleStepExplanation['hpLoss'] {
  if (typeof metadata.hpLoss !== 'number') {
    return undefined;
  }

  return {
    amount: metadata.hpLoss,
    reason: metadata.sourceAbilityLabel ?? metadata.sourceAbilityId ?? 'HP loss',
    bypassesArmor: true,
    triggersOnDamaged: false,
  };
}

function enrichStepMetadata(
  state: InternalState,
  kind: BattleStepKind,
  actorIds: string[],
  targetIds: string[],
  metadata?: BattleStepMetadata,
): BattleStepMetadata | undefined {
  if (!metadata) {
    return undefined;
  }

  const activeUnitId = metadata.activeUnitId ?? actorIds[0] ?? targetIds[0];
  const secondaryUnitIds = metadata.secondaryUnitIds ?? [...new Set([...actorIds, ...targetIds].filter((id) => id !== activeUnitId))];
  const participationMetadata = {
    ...metadata,
    activeUnitId,
    secondaryUnitIds,
  };

  if (metadata.explanation) {
    return participationMetadata;
  }

  const actor = actorIds.length === 1 ? state.units.get(actorIds[0]!) ?? null : null;
  const explanation: BattleStepExplanation = {};

  if (kind === 'beat' && typeof metadata.beat === 'number') {
    explanation.beat = {
      beat: metadata.beat,
      readinessBonus: typeof metadata.readinessBonus === 'number' ? metadata.readinessBonus : 0,
      readinessPurposeHint: 'Readiness fills until a unit reaches 100 and takes a turn.',
    };
  }

  if (kind === 'move' || kind === 'engage') {
    const movement = buildMovementExplanation(kind, actor, metadata);
    if (movement) {
      explanation.movement = movement;
    }
  }

  if (kind === 'attack') {
    const damage = buildDamageExplanation(metadata);
    if (damage) {
      explanation.damage = damage;
    }
    const hpLoss = buildHpLossExplanation(metadata);
    if (hpLoss) {
      explanation.hpLoss = hpLoss;
    }
  }

  if (kind === 'buff' || kind === 'heal' || kind === 'death' || kind === 'engage' || kind === 'move' || kind === 'attack') {
    const ability = buildAbilityExplanation(metadata);
    if (ability) {
      explanation.ability = ability;
    }
  }

  return Object.keys(explanation).length > 0 ? { ...participationMetadata, explanation } : participationMetadata;
}

function emitRoleIntentStep(
  state: InternalState,
  kind: 'move' | 'engage',
  actor: InternalUnit,
  targets: InternalUnit[],
  message: string,
  metadata: BattleStepMetadata,
): void {
  buildStep(state, kind, [actor.id], targets.map((target) => target.id), message, metadata);
}

function expandCombatants(combatants: ResolvedCombatantDefinition[]): ResolvedCombatantDefinition[] {
  return combatants.flatMap((combatant) =>
    Array.from({ length: combatant.quantity }, (_, index) => ({
      ...combatant,
      quantity: 1,
      combatantId: `${combatant.combatantId}-${index + 1}`,
    })),
  );
}

function shouldDelayForDiggyHole(input: BattleInput, combatant: ResolvedCombatantDefinition): boolean {
  return combatant.raceId === 'dwarf' && inputSideHasRaceUpgrade(input, combatant.side, 'dwarf-diggy-hole');
}

type InitialPlacementFailedSide = SideId | 'both' | 'unknown';

interface InitialPlacementDiagnostics {
  baseRadius: number;
  finalRadius: number;
  attempts: number;
  playerUnitCount: number;
  enemyUnitCount: number;
  playerFailures: number;
  enemyFailures: number;
  lastFailedRadius: number;
  lastFailedSide: InitialPlacementFailedSide;
}

function formatInitialPlacementFailure(diagnostics: InitialPlacementDiagnostics): string {
  return [
    `Failed to place initial battle units after ${diagnostics.attempts} radius attempts.`,
    `baseRadius=${diagnostics.baseRadius}`,
    `finalRadius=${diagnostics.finalRadius}`,
    `playerUnits=${diagnostics.playerUnitCount}`,
    `enemyUnits=${diagnostics.enemyUnitCount}`,
    `playerFailures=${diagnostics.playerFailures}`,
    `enemyFailures=${diagnostics.enemyFailures}`,
    `lastFailedRadius=${diagnostics.lastFailedRadius}`,
    `lastFailedSide=${diagnostics.lastFailedSide}`,
  ].join(' ');
}

function initializeUnits(input: BattleInput, rng: Rng): { units: Map<string, InternalUnit>; mapRadius: number; mapHexes: HexCoord[]; pendingDiggyHoleCombatants: Record<SideId, ResolvedCombatantDefinition[]> } {
  let radius = BASE_MAP_RADIUS;
  const baseRadius = radius;
  const maxAttempts = 100;
  let playerFailures = 0;
  let enemyFailures = 0;
  let lastFailedRadius = radius;
  let lastFailedSide: InitialPlacementFailedSide = 'unknown';
  const playerExpanded = expandCombatants(input.playerCombatants);
  const enemyExpanded = expandCombatants(input.enemyCombatants);
  const pendingDiggyHoleCombatants = {
    player: playerExpanded.filter((combatant) => shouldDelayForDiggyHole(input, combatant)),
    enemy: enemyExpanded.filter((combatant) => shouldDelayForDiggyHole(input, combatant)),
  };
  const playerUnits = playerExpanded.filter((combatant) => !shouldDelayForDiggyHole(input, combatant));
  const enemyUnits = enemyExpanded.filter((combatant) => !shouldDelayForDiggyHole(input, combatant));
  for (let attempts = 0; attempts <= maxAttempts; attempts += 1) {
    const units = new Map<string, InternalUnit>();
    const mapHexes = new Set(mapHexesForRadius(radius).map(hexKey));
    const playerOk = placeUnitsForSide('player', playerUnits, units, mapHexes, rng);
    const enemyOk = playerOk && placeUnitsForSide('enemy', enemyUnits, units, mapHexes, rng);
    if (playerOk && enemyOk) {
      const finalized = finalizeInitialMap(units);
      return { units, mapRadius: finalized.mapRadius, mapHexes: finalized.mapHexes, pendingDiggyHoleCombatants };
    }

    lastFailedRadius = radius;
    if (!playerOk) {
      playerFailures += 1;
    }
    if (playerOk && !enemyOk) {
      enemyFailures += 1;
    }
    lastFailedSide = !playerOk ? 'player' : 'enemy';
    radius += 1;
  }

  throw new Error(formatInitialPlacementFailure({
    baseRadius,
    finalRadius: radius - 1,
    attempts: maxAttempts + 1,
    playerUnitCount: playerUnits.length,
    enemyUnitCount: enemyUnits.length,
    playerFailures,
    enemyFailures,
    lastFailedRadius,
    lastFailedSide,
  }));
}

function createAliveIndex(units: Map<string, InternalUnit>): Record<SideId, Set<string>> {
  const aliveUnitIds: Record<SideId, Set<string>> = { player: new Set<string>(), enemy: new Set<string>() };
  units.forEach((unit) => {
    if (unit.alive) {
      aliveUnitIds[unit.side].add(unit.id);
    }
  });
  return aliveUnitIds;
}

function assertAliveIndexValid(state: InternalState): void {
  if (!import.meta.env?.DEV) {
    return;
  }
  (['player', 'enemy'] as SideId[]).forEach((side) => {
    const actual = [...state.units.values()].filter((unit) => unit.alive && unit.side === side).map((unit) => unit.id).sort();
    const indexed = [...state.aliveUnitIds[side]].sort();
    if (actual.length !== indexed.length || actual.some((id, index) => id !== indexed[index])) {
      throw new Error(`[battle] Alive index mismatch for ${side}. actual=${actual.join(',')} indexed=${indexed.join(',')}`);
    }
  });
}

function registerAliveUnit(state: InternalState, unit: InternalUnit): void {
  state.aliveUnitIds[unit.side].add(unit.id);
}

function markUnitDead(state: InternalState, unit: InternalUnit): void {
  unit.alive = false;
  unit.hp = 0;
  state.aliveUnitIds[unit.side].delete(unit.id);
}

function transferAliveUnitSide(state: InternalState, unit: InternalUnit, side: SideId): void {
  if (unit.side === side) {
    return;
  }
  if (unit.alive) {
    state.aliveUnitIds[unit.side].delete(unit.id);
    state.aliveUnitIds[side].add(unit.id);
  }
  unit.side = side;
}

function getAliveUnits(state: InternalState, side?: SideId): InternalUnit[] {
  const ids = side ? [...state.aliveUnitIds[side]] : [...state.aliveUnitIds.player, ...state.aliveUnitIds.enemy];
  return ids.map((id) => state.units.get(id)).filter((unit): unit is InternalUnit => Boolean(unit?.alive));
}

function assertUnitLive(unit: InternalUnit, context: string): void {
  if (import.meta.env?.DEV && !unit.alive) {
    throw new Error(`[battle] Mutation attempted on dead unit "${unit.id}" (${unit.troopLabel}) in ${context}`);
  }
}

function hasPendingDiggyHoleUnits(state: InternalState, side: SideId): boolean {
  return state.pendingDiggyHoleCombatants[side].length > 0;
}

function resolveBattleOutcome(state: InternalState): 'victory' | 'defeat' | 'draw' {
  const playerAlive = getAliveUnits(state, 'player').length > 0;
  const enemyAlive = getAliveUnits(state, 'enemy').length > 0;
  if (playerAlive && !enemyAlive) return 'victory';
  if (!playerAlive && enemyAlive) return 'defeat';
  return 'draw';
}

function clearStaleEngagements(state: InternalState): void {
  const removals: Array<{ unitId: string; enemyId: string }> = [];
  state.units.forEach((unit) => {
    unit.engagedWith.forEach((enemyId) => {
      const enemy = state.units.get(enemyId);
      if (!enemy?.alive || enemy.side === unit.side || !unitsTouchOrOverlap(enemy, unit)) {
        removals.push({ unitId: unit.id, enemyId });
      }
    });
  });
  removals.forEach(({ unitId, enemyId }) => {
    const unit = state.units.get(unitId);
    const enemy = state.units.get(enemyId);
    unit?.engagedWith.delete(enemyId);
    enemy?.engagedWith.delete(unitId);
  });
}

function clearBacklineCommitmentsTo(state: InternalState, targetId: string): void {
  state.units.forEach((unit) => {
    if (unit.committedBacklineTargetId === targetId) {
      unit.committedBacklineTargetId = null;
    }
  });
}

function clearInvalidBacklineCommitments(state: InternalState): void {
  state.units.forEach((unit) => {
    if (!unit.committedBacklineTargetId) {
      return;
    }
    const target = state.units.get(unit.committedBacklineTargetId);
    if (!target?.alive || target.side === unit.side || target.role !== 'backline') {
      unit.committedBacklineTargetId = null;
    }
  });
}

function availableCapacity(state: InternalState, unit: InternalUnit): number {
  const used = fixedSum(
    [...unit.engagedWith]
      .map((enemyId) => state.units.get(enemyId))
      .filter((enemy): enemy is InternalUnit => Boolean(enemy))
      .map((enemy) => enemy.resolvedStats.size),
  );
  return fixedMax(fixedSub(unit.resolvedStats.capacity, used), 0);
}

function touchingEnemies(state: InternalState, unit: InternalUnit): InternalUnit[] {
  return getAliveUnits(state).filter((other) => other.side !== unit.side && unitsTouchOrOverlap(other, unit));
}

function touchingUnengagedEnemies(state: InternalState, unit: InternalUnit): InternalUnit[] {
  return touchingEnemies(state, unit).filter((enemy) => enemy.engagedWith.size === 0);
}

function removeAllEngagements(state: InternalState, unit: InternalUnit): void {
  [...unit.engagedWith].forEach((enemyId) => {
    const enemy = state.units.get(enemyId);
    if (enemy) {
      enemy.engagedWith.delete(unit.id);
    }
    unit.engagedWith.delete(enemyId);
  });
}

function createEngagement(state: InternalState, actor: InternalUnit, target: InternalUnit): void {
  actor.engagedWith.add(target.id);
  target.engagedWith.add(actor.id);
  if (
    !target.fadeIntoShadowUsed &&
    hasAbility(target, 'fade-into-shadow') &&
    target.role === 'backline' &&
    target.attributes.includes('elf')
  ) {
    target.fadeIntoShadowUsed = true;
    retreatFromEngagement(state, target, actor, `${target.troopLabel} fades into shadow.`, 'fadeIntoShadow');
  }
  if (actor.alive && target.alive && actor.engagedWith.has(target.id) && hasAbility(actor, 'first-blood')) {
    attack(state, actor, target, actor.resolvedStats.range > 0 ? 'ranged' : 'melee', true, 0, 'normal');
  }
}

function engageTouchingEnemies(
  state: InternalState,
  actor: InternalUnit,
  roles: RoleId[] = [],
  includeAlreadyEngaged = false,
): InternalUnit[] {
  let remainingCapacity = availableCapacity(state, actor);
  const engagedTargets: InternalUnit[] = [];
  const candidates = touchingEnemies(state, actor)
    .filter((enemy) => matchesRoleFilter(enemy, roles))
    .filter((enemy) => !actor.engagedWith.has(enemy.id))
    .filter((enemy) => includeAlreadyEngaged || enemy.engagedWith.size === 0);
  const candidatesByPriority = [
    ...state.rng.shuffle(candidates.filter((enemy) => enemy.engagedWith.size === 0)),
    ...state.rng.shuffle(candidates.filter((enemy) => enemy.engagedWith.size > 0)),
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

function matchesRoleFilter(unit: InternalUnit, roles: RoleId[]): boolean {
  return roles.length === 0 || roles.includes(unit.role);
}

function getDistinctFriendlyTroopClasses(state: InternalState, unit: InternalUnit): string[] {
  const cached = state.distinctTypeCache.get(unit.side);
  if (cached !== undefined) {
    return cached;
  }
  const result = [...new Set(getAliveUnits(state, unit.side).map((entry) => entry.unitClassTag))];
  state.distinctTypeCache.set(unit.side, result);
  return result;
}

function getFriendlyTroopKey(unit: InternalUnit): string {
  return unit.troopInstanceId ?? unit.combatantId ?? unit.id;
}

function getDistinctFriendlyTroops(state: InternalState, unit: InternalUnit): string[] {
  return [...new Set(getAliveUnits(state, unit.side).map(getFriendlyTroopKey))];
}

function formatSigned(value: number): string {
  return value >= 0 ? `+${formatFixed(value)}` : formatFixed(value);
}

function formatPossessive(label: string): string {
  return label.endsWith('s') ? `${label}'` : `${label}'s`;
}

function sourceLabelForStep(state: InternalState, actorIds: string[], metadata?: BattleStepMetadata): string | null {
  const sourceAbilityId = metadata?.sourceAbilityId;
  if (!sourceAbilityId) {
    return null;
  }
  if (metadata?.sourceKind === 'mutator') {
    return `${metadata.sourceAbilityLabel ?? getMutator(sourceAbilityId).label} mutator`;
  }
  if (metadata?.sourceKind === 'battle') {
    return metadata.sourceAbilityLabel ?? 'Battle resolution';
  }
  if (sourceAbilityId === 'battle-resolution') {
    return metadata?.sourceAbilityLabel ?? 'Battle resolution';
  }
  const actor = actorIds.length === 1 ? state.units.get(actorIds[0]!) ?? null : null;
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

function appendSourceContext(state: InternalState, actorIds: string[], message: string, metadata?: BattleStepMetadata): string {
  const sourceLabel = sourceLabelForStep(state, actorIds, metadata);
  if (!sourceLabel) {
    return message;
  }
  const trimmed = message.trim();
  const withoutPeriod = trimmed.endsWith('.') ? trimmed.slice(0, -1) : trimmed;
  return `${withoutPeriod} from the ${sourceLabel}.`;
}

function hasAbility(unit: InternalUnit, abilityId: string): boolean {
  return unit.resolvedAbilities.some((runtime) => runtime.definition.id === abilityId);
}

function opposingSide(side: SideId): SideId {
  return side === 'player' ? 'enemy' : 'player';
}

function isDwarf(unit: InternalUnit): boolean {
  return unit.raceId === 'dwarf' || unit.attributes.includes('dwarf');
}

function isFae(unit: InternalUnit): boolean {
  return unit.raceId === 'fae' || unit.attributes.includes('fae');
}

function canTakeDamage(unit: InternalUnit): boolean {
  return !unit.berserkDeathPending;
}

function isRangedOrCaster(unit: InternalUnit): boolean {
  return unit.attributes.includes('ranged') || unit.attributes.includes('caster');
}

function shouldTubthump(target: InternalUnit, stat: 'rate' | 'damage', amount: number): boolean {
  return amount < 0 && hasAbility(target, 'tubthumping') && (stat === 'rate' || stat === 'damage');
}

function findProtectingPriest(state: InternalState, target: InternalUnit): InternalUnit | null {
  const priests = getAliveUnits(state, target.side).filter(
    (ally) => hasAbility(ally, 'mercy-before-dawn') && unitsInRange(ally, target),
  );
  return pickNearestUnit(state, target, priests);
}

function saveUnitFromDeath(
  state: InternalState,
  source: InternalUnit,
  target: InternalUnit,
  hp: number,
  effect: string,
  message: string,
  sourceAbilityId: string,
): boolean {
  target.hp = hp;
  buildStep(state, 'buff', [source.id], [target.id], message, {
    effect,
    amount: hp,
    sourceAbilityId,
    sourceAbilityLabel: getAbility(sourceAbilityId).label,
  });
  return true;
}

function healUnitToHp(
  state: InternalState,
  actor: InternalUnit,
  target: InternalUnit,
  runtime: RuntimeAbilityState,
  targetHp: number,
  message: string,
  effectId: string,
): boolean {
  if (!target.alive || target.hp >= targetHp) {
    return false;
  }
  const nextHp = fixedClamp(targetHp, 0, target.maxHp);
  const actual = fixedSub(nextHp, target.hp);
  target.hp = nextHp;
  buildStep(state, 'heal', [actor.id], [target.id], message, {
    amount: actual,
    effect: effectId,
    sourceAbilityId: runtime.definition.id,
    sourceAbilityLabel: runtime.definition.label,
  });
  if (actual > 0) {
    maybeApplyRowdyRegrowth(state, target);
    applyWagesOfVirtueHeal(state, actor, target, actual);
    maybeApplyHolyConstructs(state, target, actual);
    maybeApplySaintbane(state, target);
  }
  maybeApplyBolsteringLight(state, actor, target, actual);
  maybeApplyOverflowingGrace(state, actor, target, actual);
  triggerUnitAbilities(state, actor, {
    timing: 'onEffectApplied',
    appliedEffect: {
      effect: { kind: 'heal', amount: actual, mode: 'flat', disposition: 'beneficial' },
      target,
      disposition: 'beneficial',
    },
  });
  return true;
}

function preventDeath(state: InternalState, actor: InternalUnit, target: InternalUnit): boolean {
  const protectingPriest = !target.mercyBeforeDawnUsed ? findProtectingPriest(state, target) : null;
  if (protectingPriest) {
    const runtime = protectingPriest.resolvedAbilities.find((entry) => entry.definition.id === 'mercy-before-dawn');
    if (!runtime || (runtime.usesRemaining !== null && runtime.usesRemaining <= 0)) {
      return false;
    }
    target.mercyBeforeDawnUsed = true;
    const applied = healUnitToHp(
      state,
      protectingPriest,
      target,
      runtime,
      1,
      `${protectingPriest.troopLabel} preserves ${target.troopLabel} at 1 HP.`,
      'mercyBeforeDawn',
    );
    if (applied) {
      runtime.triggerCount += 1;
      if (runtime.usesRemaining !== null) {
        runtime.usesRemaining -= 1;
      }
    }
    return applied;
  }

  if (!target.stonebloodUsed && hasAbility(target, 'stoneblood')) {
    target.stonebloodUsed = true;
    target.resolvedAbilities = target.resolvedAbilities.filter((runtime) => runtime.definition.id !== 'regen-5');
    return saveUnitFromDeath(state, target, target, 25, 'stoneblood', `${target.troopLabel} refuses to fall and stays at 25 HP.`, 'stoneblood');
  }

  if (!target.berserkDeathPending && hasAbility(target, 'berserk')) {
    target.berserkDeathPending = true;
    target.berserkTurnsUntilDeath = state.currentTurnUnitId === target.id ? 2 : 1;
    target.readiness = 0;
    return saveUnitFromDeath(state, target, target, 1, 'berserk', `${target.troopLabel} goes berserk and refuses damage until its next turn ends.`, 'berserk');
  }

  return false;
}

function getDistanceDamageBonus(actor: InternalUnit, target: InternalUnit, context: AttackContext): { damage: number; readiness: number } {
  if (context.mode !== 'ranged' || !hasAbility(actor, 'long-shot-doctrine') || !isRangedOrCaster(actor)) {
    return { damage: 0, readiness: 0 };
  }
  const distance = unitFootprintDistance(actor, target);
  return { damage: distance, readiness: distance * 2 };
}

function hasMatchingIdentityTag(unit: InternalUnit, tags: string[]): boolean {
  return tags.some((tag) => unit.unitClassTag === tag || unit.attributes.includes(tag));
}

function evaluateScaledAmount(base: number, amount: number, mode: 'flat' | 'percent'): number {
  return mode === 'percent' ? fixedMul(base, amount / 100) : amount;
}

function amplifyPositiveAmount(target: InternalUnit, amount: number): number {
  if (amount <= 0 || !hasAbility(target, 'anointed')) {
    return amount;
  }
  return fixedMul(amount, 2);
}

function maybeApplyRowdyRegrowth(state: InternalState, target: InternalUnit): void {
  if (!hasAbility(target, 'rowdy-regrowth')) {
    return;
  }
  target.readiness = fixedAdd(target.readiness, 20);
  buildStep(state, 'buff', [target.id], [target.id], `${target.troopLabel} gains 20 readiness from Rowdy Regrowth.`, {
    effect: 'rowdyRegrowth',
    amount: 20,
    value: target.readiness,
    sourceAbilityId: 'rowdy-regrowth',
    sourceAbilityLabel: getAbility('rowdy-regrowth').label,
  });
  applyRamp(state, target, target, createRuntimeAbilityState(getAbility('rowdy-regrowth')), {
    kind: 'ramp',
    amount: 1,
    mode: 'flat',
    disposition: 'beneficial',
  });
}

function findHolyConstructsPriest(state: InternalState, side: SideId): InternalUnit | null {
  if (!sideHasTroopClassUpgrade(state, side, 'priest-holy-constructs')) {
    return null;
  }
  const priests = getAliveUnits(state, side).filter((unit) => unit.unitClassTag === 'priest');
  return priests[0] ?? null;
}

function applyWagesOfVirtueHeal(state: InternalState, actor: InternalUnit, target: InternalUnit, amount: number): void {
  if (amount <= 0) {
    return;
  }
  getAliveUnits(state, target.side)
    .filter((unit) => unit.id !== target.id && hasAbility(unit, 'wages-of-virtue') && unitsTouchOrOverlap(unit, target))
    .forEach((avenger) => {
      const missing = fixedSub(avenger.maxHp, avenger.hp);
      const actual = fixedClamp(amount, 0, missing);
      if (actual <= 0) {
        return;
      }
      avenger.hp = fixedAdd(avenger.hp, actual);
      buildStep(state, 'heal', [actor.id], [avenger.id], `${avenger.troopLabel} shares ${target.troopLabel}'s healing for ${formatFixed(actual)}.`, {
        amount: actual,
        effect: 'wagesOfVirtueHeal',
        sourceAbilityId: 'wages-of-virtue',
        sourceAbilityLabel: getAbility('wages-of-virtue').label,
      });
      maybeApplyRowdyRegrowth(state, avenger);
    });
}

function maybeApplyHolyConstructs(state: InternalState, target: InternalUnit, actualHeal: number): void {
  if (actualHeal <= 0 || target.holyConstructsTriggered || hasAbility(target, 'fading')) {
    return;
  }
  const priest = findHolyConstructsPriest(state, target.side);
  if (!priest) {
    return;
  }
  const summoned = summonUnitsAtHex(state, priest, 'holy-constructs', 'elemental', 1, target.position);
  if (summoned.length > 0) {
    target.holyConstructsTriggered = true;
  }
}

function findSaintbaneSummoner(state: InternalState, side: SideId): InternalUnit | null {
  return getAliveUnits(state, side).find((unit) => unit.unitClassTag === 'necromancer') ?? getAliveUnits(state, side)[0] ?? null;
}

function maybeApplySaintbane(state: InternalState, target: InternalUnit): void {
  const punishingSide = opposingSide(target.side);
  if (!sideHasTroopClassUpgrade(state, punishingSide, 'necromancer-saintbane')) {
    return;
  }
  const summoner = findSaintbaneSummoner(state, punishingSide);
  if (!summoner) {
    return;
  }
  const adjacentCorpses = [...state.corpses.entries()].filter(([, corpsePosition]) => unitDistanceFromHex(target, corpsePosition) <= 1);
  adjacentCorpses.forEach(([corpseUnitId, corpsePosition]) => {
    const summoned = summonUnitsAtHex(state, summoner, 'saintbane', 'skeleton', 1, corpsePosition);
    if (summoned.length > 0) {
      state.corpses.delete(corpseUnitId);
    }
  });
}

function maybeApplyOverflowingGrace(state: InternalState, actor: InternalUnit, target: InternalUnit, actualHeal: number): void {
  if (!hasAbility(actor, 'overflowing-grace') || actualHeal <= 0 || target.hp < target.maxHp) {
    return;
  }
  target.readiness = fixedAdd(target.readiness, 40);
  buildStep(state, 'buff', [actor.id], [target.id], `${target.troopLabel} gains 40 readiness from Overflowing Grace.`, {
    effect: 'overflowingGrace',
    amount: 40,
    value: target.readiness,
    sourceAbilityId: 'overflowing-grace',
    sourceAbilityLabel: getAbility('overflowing-grace').label,
  });
}

function maybeApplyBolsteringLight(state: InternalState, actor: InternalUnit, target: InternalUnit, actualHeal: number): void {
  if (!hasAbility(actor, 'bolstering-light') || actualHeal <= 0) {
    return;
  }
  const runtime = createRuntimeAbilityState(getAbility('bolstering-light'));
  const recipients = target.id === actor.id ? [target] : [target, actor];
  if (target.hp >= target.maxHp) {
    recipients.forEach((recipient) => {
      applyHaste(state, actor, recipient, runtime, { kind: 'haste', amount: 1, mode: 'flat', disposition: 'beneficial' });
      applyRamp(state, actor, recipient, runtime, { kind: 'ramp', amount: 1, mode: 'flat', disposition: 'beneficial' });
    });
    return;
  }
  recipients.forEach((recipient) => {
    applyReadinessDelta(state, actor, recipient, runtime, {
      kind: 'readinessDelta',
      amount: 40,
      disposition: 'beneficial',
    });
  });
}

function getMercyBeforeDawnRepeatTargets(state: InternalState, actor: InternalUnit): InternalUnit[] {
  if (actor.unitClassTag !== 'priest' || !hasAbility(actor, 'mercy-before-dawn')) {
    return [];
  }
  return getAliveUnits(state, actor.side).filter((unit) => unitsInRange(actor, unit) && unit.hp < fixedMul(unit.maxHp, 0.1));
}

function maybeGrantStaticCharge(state: InternalState, actor: InternalUnit, runtime: RuntimeAbilityState, target: InternalUnit, effect: AbilityEffectDefinition): void {
  if (!hasAbility(actor, 'static-charge') || effect.kind !== 'haste' || (runtime.definition.id !== 'enhance-1' && runtime.definition.id !== 'war-drums')) {
    return;
  }
  target.bonusStrikeCharges += 1;
  buildStep(state, 'buff', [actor.id], [target.id], `${target.troopLabel} is charged for 1 extra strike on its next normal attack.`, {
    effect: 'staticCharge',
    amount: 1,
    sourceAbilityId: 'static-charge',
    sourceAbilityLabel: getAbility('static-charge').label,
  });
}

function isGraveVigorBeneficialEffect(actor: InternalUnit, target: InternalUnit, effect: AbilityEffectDefinition): boolean {
  return hasAbility(actor, 'grave-vigor') && actor.side === target.side && effectDisposition(effect) === 'beneficial';
}

function isBlockedByGraveVigor(actor: InternalUnit, target: InternalUnit, effect: AbilityEffectDefinition): boolean {
  return isGraveVigorBeneficialEffect(actor, target, effect) && target.graveVigorBlockedSides.has(actor.side);
}

function markGraveVigorRecipient(state: InternalState, actor: InternalUnit, target: InternalUnit, effect: AbilityEffectDefinition): void {
  if (isGraveVigorBeneficialEffect(actor, target, effect)) {
    state.pendingGraveVigorBlocks.push({ unitId: target.id, side: actor.side });
  }
}

function flushPendingGraveVigorBlocks(state: InternalState): void {
  state.pendingGraveVigorBlocks.splice(0).forEach((entry) => {
    state.units.get(entry.unitId)?.graveVigorBlockedSides.add(entry.side);
  });
}

function applyPostEffectReactions(
  state: InternalState,
  actor: InternalUnit,
  runtime: RuntimeAbilityState,
  target: InternalUnit,
  effect: AbilityEffectDefinition,
): void {
  maybeGrantStaticCharge(state, actor, runtime, target, effect);
  markGraveVigorRecipient(state, actor, target, effect);
  triggerUnitAbilities(state, actor, {
    timing: 'onEffectApplied',
    appliedEffect: {
      effect,
      target,
      disposition: effectDisposition(effect),
    },
  });
}

function applyBolster(
  state: InternalState,
  actor: InternalUnit,
  target: InternalUnit,
  runtime: RuntimeAbilityState,
  effect: Extract<AbilityEffectDefinition, { kind: 'bolster' }>,
): boolean {
  const maxIncrease = amplifyPositiveAmount(target, evaluateScaledAmount(target.maxHp, effect.amount, effect.mode));
  const currentIncrease = amplifyPositiveAmount(target, evaluateScaledAmount(target.hp, effect.amount, effect.mode));
  if (maxIncrease <= 0 && currentIncrease <= 0) {
    return false;
  }
  target.maxHp = fixedAdd(target.maxHp, maxIncrease);
  target.hp = fixedClamp(fixedAdd(target.hp, currentIncrease), 0, target.maxHp);
  target.resolvedStats.health = target.maxHp;
  buildStep(state, 'buff', [actor.id], [target.id], `${target.troopLabel} gains ${formatSigned(maxIncrease)} health.`, {
    amount: maxIncrease,
    effect: 'bolster',
    sourceAbilityId: runtime.definition.id,
    sourceAbilityLabel: runtime.definition.label,
  });
  if (maxIncrease > 0 || currentIncrease > 0) {
    maybeApplySaintbane(state, target);
  }
  return true;
}

function applyRamp(
  state: InternalState,
  actor: InternalUnit,
  target: InternalUnit,
  runtime: RuntimeAbilityState,
  effect: Extract<AbilityEffectDefinition, { kind: 'ramp' }>,
): boolean {
  let increase = evaluateScaledAmount(target.resolvedStats.damage, effect.amount, effect.mode);
  if (shouldTubthump(target, 'damage', increase)) {
    increase = 1;
  }
  increase = amplifyPositiveAmount(target, increase);
  if (increase === 0) {
    return false;
  }
  target.resolvedStats.damage = fixedMax(fixedAdd(target.resolvedStats.damage, increase), 0);
  buildStep(state, 'buff', [actor.id], [target.id], `${target.troopLabel} ${increase >= 0 ? 'gains' : 'loses'} ${increase >= 0 ? formatSigned(increase) : formatFixed(Math.abs(increase))} damage.`, {
    amount: increase,
    effect: 'ramp',
    sourceAbilityId: runtime.definition.id,
    sourceAbilityLabel: runtime.definition.label,
  });
  if (increase > 0) {
    maybeApplySaintbane(state, target);
  }
  return true;
}

function applyHaste(
  state: InternalState,
  actor: InternalUnit,
  target: InternalUnit,
  runtime: RuntimeAbilityState,
  effect: Extract<AbilityEffectDefinition, { kind: 'haste' }>,
): boolean {
  let increase = evaluateScaledAmount(target.resolvedStats.rate, effect.amount, effect.mode);
  if (shouldTubthump(target, 'rate', increase)) {
    increase = 1;
  }
  increase = amplifyPositiveAmount(target, increase);
  if (increase === 0) {
    return false;
  }
  target.resolvedStats.rate = fixedClamp(fixedAdd(target.resolvedStats.rate, increase), 1, 100);
  buildStep(state, 'buff', [actor.id], [target.id], `${target.troopLabel} ${increase >= 0 ? 'gains' : 'loses'} ${increase >= 0 ? formatSigned(increase) : formatFixed(Math.abs(increase))} rate.`, {
    amount: increase,
    effect: 'haste',
    sourceAbilityId: runtime.definition.id,
    sourceAbilityLabel: runtime.definition.label,
  });
  if (increase > 0) {
    maybeApplySaintbane(state, target);
  }
  return true;
}

function healUnit(
  state: InternalState,
  actor: InternalUnit,
  target: InternalUnit,
  runtime: RuntimeAbilityState,
  effect: Extract<AbilityEffectDefinition, { kind: 'heal' }>,
  allowMercyBeforeDawnRepeat = true,
): boolean {
  if (!target.alive) {
    return false;
  }
  const mercyRepeatTargets = allowMercyBeforeDawnRepeat ? getMercyBeforeDawnRepeatTargets(state, actor) : [];
  const missing = fixedSub(target.maxHp, target.hp);
  const amount = amplifyPositiveAmount(target, effect.mode === 'percent' ? fixedMul(missing, effect.amount / 100) : effect.amount);
  const nextHp = fixedClamp(fixedAdd(target.hp, amount), 0, target.maxHp);
  const actual = fixedSub(nextHp, target.hp);
  target.hp = nextHp;
  buildStep(state, 'heal', [actor.id], [target.id], `${actor.troopLabel} heals ${target.troopLabel} for ${formatFixed(actual)}.`, {
    amount: actual,
    effect: 'heal',
    sourceAbilityId: runtime.definition.id,
    sourceAbilityLabel: runtime.definition.label,
  });
  if (actual > 0) {
    maybeApplyRowdyRegrowth(state, target);
    applyWagesOfVirtueHeal(state, actor, target, actual);
    maybeApplyHolyConstructs(state, target, actual);
    maybeApplySaintbane(state, target);
  }
  maybeApplyBolsteringLight(state, actor, target, actual);
  maybeApplyOverflowingGrace(state, actor, target, actual);
  mercyRepeatTargets.forEach((repeatTarget) => {
    healUnit(state, actor, repeatTarget, runtime, effect, false);
  });
  return true;
}

function applyStatDelta(
  state: InternalState,
  actor: InternalUnit,
  target: InternalUnit,
  runtime: RuntimeAbilityState,
  effect: Extract<AbilityEffectDefinition, { kind: 'statDelta' }>,
): boolean {
  if (!target.alive) {
    return false;
  }

  if (effect.stat === 'health') {
    const delta = amplifyPositiveAmount(target, evaluateScaledAmount(target.maxHp, effect.amount, effect.mode));
    if (delta === 0) {
      return false;
    }
    target.maxHp = fixedAdd(target.maxHp, delta);
    target.hp = fixedClamp(fixedAdd(target.hp, delta), 0, target.maxHp);
    target.resolvedStats.health = target.maxHp;
    buildStep(state, 'buff', [actor.id], [target.id], `${target.troopLabel} ${delta >= 0 ? 'gains' : 'loses'} ${formatFixed(Math.abs(delta))} health.`, {
      amount: delta,
      effect: 'statDelta',
      stat: effect.stat,
      sourceAbilityId: runtime.definition.id,
      sourceAbilityLabel: runtime.definition.label,
    });
    if (delta > 0) {
      maybeApplySaintbane(state, target);
    }
    return true;
  }

  const currentValue = target.resolvedStats[effect.stat];
  let delta = evaluateScaledAmount(currentValue, effect.amount, effect.mode);
  if ((effect.stat === 'rate' || effect.stat === 'damage') && shouldTubthump(target, effect.stat, delta)) {
    delta = 1;
  }
  delta = amplifyPositiveAmount(target, delta);
  if (delta === 0) {
    return false;
  }
  const nextValue =
    effect.stat === 'armor'
      ? applyArmorCap(clampStat(effect.stat, fixedAdd(currentValue, delta)), state.effects)
      : clampStat(effect.stat, fixedAdd(currentValue, delta));
  const actual = fixedSub(nextValue, currentValue);
  if (actual === 0) {
    return false;
  }
  target.resolvedStats[effect.stat] = nextValue;
  buildStep(state, 'buff', [actor.id], [target.id], `${target.troopLabel} ${actual >= 0 ? 'gains' : 'loses'} ${actual >= 0 ? formatSigned(actual) : formatFixed(Math.abs(actual))} ${effect.stat}.`, {
    amount: actual,
    effect: 'statDelta',
    stat: effect.stat,
    sourceAbilityId: runtime.definition.id,
    sourceAbilityLabel: runtime.definition.label,
  });
  if (actual > 0) {
    maybeApplySaintbane(state, target);
  }
  if (effect.stat === 'armor' && actual < 0) {
    triggerCrackExploits(state, actor, target);
  }
  return true;
}

function applyReadinessDelta(
  state: InternalState,
  actor: InternalUnit,
  target: InternalUnit,
  runtime: RuntimeAbilityState,
  effect: Extract<AbilityEffectDefinition, { kind: 'readinessDelta' }>,
): boolean {
  if (!target.alive || effect.amount === 0) {
    return false;
  }
  target.readiness = fixedMax(fixedAdd(target.readiness, effect.amount), 0);
  buildStep(state, 'buff', [actor.id], [target.id], `${target.troopLabel} ${effect.amount >= 0 ? 'gains' : 'loses'} ${formatFixed(Math.abs(effect.amount))} readiness.`, {
    effect: 'readinessDelta',
    value: target.readiness,
    amount: effect.amount,
    sourceAbilityId: runtime.definition.id,
    sourceAbilityLabel: runtime.definition.label,
  });
  return true;
}

function applyReadinessSet(
  state: InternalState,
  actor: InternalUnit,
  target: InternalUnit,
  runtime: RuntimeAbilityState,
  effect: Extract<AbilityEffectDefinition, { kind: 'readinessSet' }>,
): boolean {
  if (!target.alive || target.readiness === effect.value) {
    return false;
  }
  target.readiness = fixed(effect.value);
  buildStep(state, 'buff', [actor.id], [target.id], `${target.troopLabel} sets readiness to ${formatFixed(target.readiness)}.`, {
    effect: 'readinessSet',
    value: target.readiness,
    sourceAbilityId: runtime.definition.id,
    sourceAbilityLabel: runtime.definition.label,
  });
  return true;
}

function applyGrantAbility(
  state: InternalState,
  actor: InternalUnit,
  target: InternalUnit,
  runtime: RuntimeAbilityState,
  effect: Extract<AbilityEffectDefinition, { kind: 'grantAbility' }>,
): boolean {
  if (target.resolvedAbilities.some((entry) => entry.definition.id === effect.abilityId)) {
    return false;
  }
  target.resolvedAbilities.push(createRuntimeAbilityState(getAbility(effect.abilityId)));
  buildStep(state, 'buff', [actor.id], [target.id], `${target.troopLabel} gains ${getAbility(effect.abilityId).label}.`, {
    effect: 'grantAbility',
    abilityId: effect.abilityId,
    sourceAbilityId: runtime.definition.id,
    sourceAbilityLabel: runtime.definition.label,
  });
  return true;
}

function applyRangeSet(
  state: InternalState,
  actor: InternalUnit,
  target: InternalUnit,
  runtime: RuntimeAbilityState,
  effect: Extract<AbilityEffectDefinition, { kind: 'rangeset' }>,
): boolean {
  if (target.resolvedStats.range === effect.value) {
    return false;
  }
  target.resolvedStats.range = fixedMax(effect.value, 0);
  buildStep(state, 'buff', [actor.id], [target.id], `${target.troopLabel} sets range to ${formatFixed(target.resolvedStats.range)}.`, {
    value: target.resolvedStats.range,
    effect: 'rangeset',
    sourceAbilityId: runtime.definition.id,
    sourceAbilityLabel: runtime.definition.label,
  });
  return true;
}

function applyRoleSet(
  state: InternalState,
  actor: InternalUnit,
  target: InternalUnit,
  runtime: RuntimeAbilityState,
  effect: Extract<AbilityEffectDefinition, { kind: 'roleset' }>,
): boolean {
  if (target.role === effect.role) {
    return false;
  }
  target.role = effect.role;
  buildStep(state, 'buff', [actor.id], [target.id], `${target.troopLabel} becomes ${effect.role}.`, {
    effect: 'roleset',
    role: effect.role,
    sourceAbilityId: runtime.definition.id,
    sourceAbilityLabel: runtime.definition.label,
  });
  return true;
}

function applyTemporaryEffect(
  state: InternalState,
  actor: InternalUnit,
  target: InternalUnit,
  runtime: RuntimeAbilityState,
  effect: Extract<AbilityEffectDefinition, { kind: 'bolster' | 'haste' | 'ramp' | 'statDelta' | 'rangeset' | 'roleset' }>,
): boolean {
  const turns = runtime.definition.duration.kind === 'turns' ? runtime.definition.duration.turns : 0;
  if (turns <= 0) {
    return false;
  }

  if (effect.kind === 'bolster') {
    const maxApplied = amplifyPositiveAmount(target, evaluateScaledAmount(target.maxHp, effect.amount, effect.mode));
    const hpApplied = amplifyPositiveAmount(target, evaluateScaledAmount(target.hp, effect.amount, effect.mode));
    if (maxApplied <= 0 && hpApplied <= 0) {
      return false;
    }
    target.maxHp = fixedAdd(target.maxHp, maxApplied);
    target.hp = fixedClamp(fixedAdd(target.hp, hpApplied), 0, target.maxHp);
    target.resolvedStats.health = target.maxHp;
    target.activeTimedEffects.push({
      effectKind: 'bolster',
      sourceAbilityId: runtime.definition.id,
      sourceUnitId: actor.id,
      remainingTurns: turns,
      maxApplied,
      hpApplied,
    });
    buildStep(state, 'buff', [actor.id], [target.id], `${target.troopLabel} gains ${formatSigned(maxApplied)} health until end of turn.`, {
      amount: maxApplied,
      effect: 'bolster',
      sourceAbilityId: runtime.definition.id,
      sourceAbilityLabel: runtime.definition.label,
      temporary: true,
    });
    return true;
  }

  if (effect.kind === 'haste') {
    const amountApplied = amplifyPositiveAmount(target, evaluateScaledAmount(target.resolvedStats.rate, effect.amount, effect.mode));
    if (amountApplied <= 0) {
      return false;
    }
    target.resolvedStats.rate = fixedClamp(fixedAdd(target.resolvedStats.rate, amountApplied), 1, 100);
    target.activeTimedEffects.push({
      effectKind: 'haste',
      sourceAbilityId: runtime.definition.id,
      sourceUnitId: actor.id,
      remainingTurns: turns,
      amountApplied,
    });
    buildStep(state, 'buff', [actor.id], [target.id], `${target.troopLabel} gains ${formatSigned(amountApplied)} rate until end of turn.`, {
      amount: amountApplied,
      effect: 'haste',
      sourceAbilityId: runtime.definition.id,
      sourceAbilityLabel: runtime.definition.label,
      temporary: true,
    });
    return true;
  }

  if (effect.kind === 'ramp') {
    const amountApplied = amplifyPositiveAmount(target, evaluateScaledAmount(target.resolvedStats.damage, effect.amount, effect.mode));
    if (amountApplied <= 0) {
      return false;
    }
    target.resolvedStats.damage = fixedAdd(target.resolvedStats.damage, amountApplied);
    target.activeTimedEffects.push({
      effectKind: 'ramp',
      sourceAbilityId: runtime.definition.id,
      sourceUnitId: actor.id,
      remainingTurns: turns,
      amountApplied,
    });
    buildStep(state, 'buff', [actor.id], [target.id], `${target.troopLabel} gains ${formatSigned(amountApplied)} damage until end of turn.`, {
      amount: amountApplied,
      effect: 'ramp',
      sourceAbilityId: runtime.definition.id,
      sourceAbilityLabel: runtime.definition.label,
      temporary: true,
    });
    return true;
  }

  if (effect.kind === 'statDelta') {
    if (effect.stat === 'health' || effect.stat === 'size') {
      return false;
    }
    const currentValue = target.resolvedStats[effect.stat];
    const amountApplied = amplifyPositiveAmount(target, evaluateScaledAmount(currentValue, effect.amount, effect.mode));
    if (amountApplied === 0) {
      return false;
    }
    const nextValue =
      effect.stat === 'armor'
        ? applyArmorCap(clampStat(effect.stat, fixedAdd(currentValue, amountApplied)), state.effects)
        : clampStat(effect.stat, fixedAdd(currentValue, amountApplied));
    const actual = fixedSub(nextValue, currentValue);
    if (actual === 0) {
      return false;
    }
    target.resolvedStats[effect.stat] = nextValue;
    target.activeTimedEffects.push({
      effectKind: 'statDelta',
      sourceAbilityId: runtime.definition.id,
      sourceUnitId: actor.id,
      remainingTurns: turns,
      stat: effect.stat,
      amountApplied: actual,
    });
    buildStep(state, 'buff', [actor.id], [target.id], `${target.troopLabel} gains ${formatSigned(actual)} ${effect.stat} until end of turn.`, {
      amount: actual,
      effect: 'statDelta',
      stat: effect.stat,
      sourceAbilityId: runtime.definition.id,
      sourceAbilityLabel: runtime.definition.label,
      temporary: true,
    });
    return true;
  }

  if (effect.kind === 'rangeset') {
    if (target.resolvedStats.range === effect.value) {
      return false;
    }
    const previousValue = target.resolvedStats.range;
    target.resolvedStats.range = fixedMax(effect.value, 0);
    target.activeTimedEffects.push({
      effectKind: 'rangeset',
      sourceAbilityId: runtime.definition.id,
      sourceUnitId: actor.id,
      remainingTurns: turns,
      previousValue,
    });
    buildStep(state, 'buff', [actor.id], [target.id], `${target.troopLabel} sets range to ${formatFixed(target.resolvedStats.range)} until end of turn.`, {
      value: target.resolvedStats.range,
      effect: 'rangeset',
      sourceAbilityId: runtime.definition.id,
      sourceAbilityLabel: runtime.definition.label,
      temporary: true,
    });
    return true;
  }

  if (target.role === effect.role) {
    return false;
  }
  const previousRole = target.role;
  target.role = effect.role;
  target.activeTimedEffects.push({
    effectKind: 'roleset',
    sourceAbilityId: runtime.definition.id,
    sourceUnitId: actor.id,
    remainingTurns: turns,
    previousRole,
  });
  buildStep(state, 'buff', [actor.id], [target.id], `${target.troopLabel} becomes ${effect.role} until end of turn.`, {
    effect: 'roleset',
    role: effect.role,
    sourceAbilityId: runtime.definition.id,
    sourceAbilityLabel: runtime.definition.label,
    temporary: true,
  });
  return true;
}

function expireTimedEffects(state: InternalState, unit: InternalUnit): void {
  const remaining: ActiveTimedEffect[] = [];
  unit.activeTimedEffects.forEach((effect) => {
    const nextTurns = effect.remainingTurns - 1;
    if (nextTurns > 0) {
      remaining.push({ ...effect, remainingTurns: nextTurns } as ActiveTimedEffect);
      return;
    }

    if (effect.effectKind === 'bolster') {
      unit.maxHp = fixedMax(fixedSub(unit.maxHp, effect.maxApplied), 1);
      unit.hp = fixedClamp(fixedSub(unit.hp, effect.hpApplied), 0, unit.maxHp);
      unit.resolvedStats.health = unit.maxHp;
      buildStep(state, 'buff', [effect.sourceUnitId], [unit.id], `${unit.troopLabel} loses ${formatSigned(effect.maxApplied)} health.`, {
        amount: effect.maxApplied,
        effect: 'bolster',
        sourceAbilityId: effect.sourceAbilityId,
        expired: true,
      });
      return;
    }

    if (effect.effectKind === 'haste') {
      unit.resolvedStats.rate = fixedClamp(fixedSub(unit.resolvedStats.rate, effect.amountApplied), 1, 100);
      buildStep(state, 'buff', [effect.sourceUnitId], [unit.id], `${unit.troopLabel} loses ${formatSigned(effect.amountApplied)} rate.`, {
        amount: effect.amountApplied,
        effect: 'haste',
        sourceAbilityId: effect.sourceAbilityId,
        expired: true,
      });
      return;
    }

    if (effect.effectKind === 'ramp') {
      unit.resolvedStats.damage = fixedMax(fixedSub(unit.resolvedStats.damage, effect.amountApplied), 0);
      buildStep(state, 'buff', [effect.sourceUnitId], [unit.id], `${unit.troopLabel} loses ${formatSigned(effect.amountApplied)} damage.`, {
        amount: effect.amountApplied,
        effect: 'ramp',
        sourceAbilityId: effect.sourceAbilityId,
        expired: true,
      });
      return;
    }

    if (effect.effectKind === 'statDelta') {
      unit.resolvedStats[effect.stat] = clampStat(effect.stat, fixedSub(unit.resolvedStats[effect.stat], effect.amountApplied));
      buildStep(state, 'buff', [effect.sourceUnitId], [unit.id], `${unit.troopLabel} loses ${formatSigned(effect.amountApplied)} ${effect.stat}.`, {
        amount: effect.amountApplied,
        effect: 'statDelta',
        stat: effect.stat,
        sourceAbilityId: effect.sourceAbilityId,
        expired: true,
      });
      return;
    }

    if (effect.effectKind === 'rangeset') {
      unit.resolvedStats.range = fixedMax(effect.previousValue, 0);
      buildStep(state, 'buff', [effect.sourceUnitId], [unit.id], `${unit.troopLabel} resets range to ${formatFixed(unit.resolvedStats.range)}.`, {
        value: unit.resolvedStats.range,
        effect: 'rangeset',
        sourceAbilityId: effect.sourceAbilityId,
        expired: true,
      });
      return;
    }

    unit.role = effect.previousRole;
    buildStep(state, 'buff', [effect.sourceUnitId], [unit.id], `${unit.troopLabel} returns to ${effect.previousRole}.`, {
      role: effect.previousRole,
      effect: 'roleset',
      sourceAbilityId: effect.sourceAbilityId,
      expired: true,
    });
  });
  unit.activeTimedEffects = remaining;
}

// Default target resolution for effects that don't have an explicit target definition.
// Each effect kind that needs context from the trigger event gets its own named helper,
// keeping that semantic knowledge co-located with the effect rather than buried in a
// generic dispatch function.

function getBlastDefaultTargets(state: InternalState, actor: InternalUnit, event: AbilityTriggerEvent): InternalUnit[] {
  if (!event.attackTarget) {
    return [];
  }
  return blastTargetsFromFootprint(state, actor, event.attackTarget.occupiedHexes);
}

function unitDistanceFromAnyHex(unit: InternalUnit, origins: HexCoord[]): number {
  return Math.min(...origins.map((origin) => unitDistanceFromHex(unit, origin)));
}

function blastTargetsFromFootprint(state: InternalState, actor: InternalUnit, origins: HexCoord[]): InternalUnit[] {
  return getAliveUnits(state).filter((unit) => unit.side !== actor.side && unitDistanceFromAnyHex(unit, origins) <= 2);
}

function getStrikeDefaultTarget(event: AbilityTriggerEvent): InternalUnit[] {
  return event.attackTarget?.alive ? [event.attackTarget] : [];
}

function getHealDefaultTargets(
  state: InternalState,
  actor: InternalUnit,
  target: AbilityTargetDefinition | undefined,
): InternalUnit[] {
  const candidates = getAliveUnits(state, actor.side)
    .filter((unit) => unitsInRange(actor, unit))
    .filter((unit) => unit.hp < unit.maxHp);
  const filtered = prioritizeCandidates(filterTargetCandidates(candidates, target?.filters), target?.filters);
  if (filtered.length === 0) {
    return [];
  }
  const mostMissing = Math.max(...filtered.map((unit) => fixedSub(unit.maxHp, unit.hp)));
  return filtered.filter((unit) => fixedSub(unit.maxHp, unit.hp) === mostMissing);
}

function getAppliedEffectDefaultTarget(event: AbilityTriggerEvent): InternalUnit[] {
  return event.appliedEffect?.target ? [event.appliedEffect.target] : [];
}

function getAttackDefaultTarget(event: AbilityTriggerEvent): InternalUnit[] {
  return event.attackTarget?.alive ? [event.attackTarget] : [];
}

function getTargetCandidates(
  state: InternalState,
  actor: InternalUnit,
  ability: AbilityDefinition,
  effect: AbilityEffectDefinition,
  event: AbilityTriggerEvent,
): InternalUnit[] {
  const target = ability.target;
  if (target?.mode === 'self') {
    return [actor];
  }

  if (target?.mode === 'default') {
    if (event.timing === 'onAttack') {
      return getAttackDefaultTarget(event);
    }
    if (event.timing === 'onEffectApplied') {
      return getAppliedEffectDefaultTarget(event);
    }
  }

  if (target?.mode === 'random' || target?.mode === 'aoe') {
    const radius = resolveAbilityTargetRadius(actor, target);
    const allegiance = target.allegiance ?? 'ally';
    const candidates = getAliveUnits(state).filter((unit) => {
      if (allegiance === 'ally' && unit.side !== actor.side) return false;
      if (allegiance === 'enemy' && unit.side === actor.side) return false;
      return unitFootprintDistance(actor, unit) <= radius;
    });
    return prioritizeCandidates(filterTargetCandidates(candidates, target.filters), target.filters);
  }

  if (effect.kind === 'blast') return getBlastDefaultTargets(state, actor, event);
  if (effect.kind === 'strike') return getStrikeDefaultTarget(event);
  if (effect.kind === 'heal') return getHealDefaultTargets(state, actor, target);
  return [actor];
}

function resolveTargets(
  state: InternalState,
  actor: InternalUnit,
  ability: AbilityDefinition,
  effect: AbilityEffectDefinition,
  event: AbilityTriggerEvent,
): InternalUnit[] {
  const candidates = getTargetCandidates(state, actor, ability, effect, event).filter(
    (candidate) =>
      (candidate.alive || (candidate.id === actor.id && event.timing === 'onDeath' && effect.kind === 'summon')) &&
      !isBlockedByGraveVigor(actor, candidate, effect),
  );
  if (candidates.length === 0) {
    return [];
  }
  if (ability.target?.mode === 'random') {
    return [state.rng.pick(candidates)];
  }
  if (effect.kind === 'heal' && ability.target?.mode !== 'aoe') {
    return [state.rng.pick(candidates)];
  }
  return candidates;
}

function canTriggerAbility(state: InternalState, actor: InternalUnit, runtime: RuntimeAbilityState, event: AbilityTriggerEvent): boolean {
  const trigger = runtime.definition.trigger;
  if (trigger.timing !== event.timing) {
    return false;
  }
  if (runtime.usesRemaining !== null && runtime.usesRemaining <= 0) {
    return false;
  }
  if (trigger.condition === 'forsaken' && getDistinctFriendlyTroops(state, actor).length > 1) {
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
    if (
      trigger.effectApplication.effectKinds?.length &&
      !trigger.effectApplication.effectKinds.includes(event.appliedEffect.effect.kind)
    ) {
      return false;
    }
    if (
      trigger.effectApplication.dispositions?.length &&
      !trigger.effectApplication.dispositions.includes(event.appliedEffect.disposition)
    ) {
      return false;
    }
  }
  return true;
}

function getAbilityRepeatCount(state: InternalState, actor: InternalUnit, runtime: RuntimeAbilityState): number {
  if (runtime.definition.trigger.repeatPerDistinctFriendlyTroopClass) {
    return Math.max(0, getDistinctFriendlyTroopClasses(state, actor).filter((classTag) => classTag !== actor.unitClassTag).length);
  }
  if (runtime.definition.trigger.repeatPerDistinctFriendlyTroop) {
    const actorTroopKey = getFriendlyTroopKey(actor);
    return Math.max(0, getDistinctFriendlyTroops(state, actor).filter((troopKey) => troopKey !== actorTroopKey).length);
  }
  if (runtime.definition.trigger.repeatPerTouchingFriendlyUnit) {
    return getAliveUnits(state, actor.side).filter((ally) => ally.id !== actor.id && unitsTouchOrOverlap(ally, actor)).length;
  }
  return 1;
}

function recordSummonedProfile(state: InternalState, unit: InternalUnit): void {
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
      health: { stat: 'health', finalValue: unit.resolvedStats.health, lines: [{ label: 'Summoned', value: unit.resolvedStats.health, kind: 'base' }] },
      damage: { stat: 'damage', finalValue: unit.resolvedStats.damage, lines: [{ label: 'Summoned', value: unit.resolvedStats.damage, kind: 'base' }] },
      rate: { stat: 'rate', finalValue: unit.resolvedStats.rate, lines: [{ label: 'Summoned', value: unit.resolvedStats.rate, kind: 'base' }] },
      ...(unit.role === 'frontline' ? { move: { stat: 'move' as const, finalValue: unit.resolvedStats.move, lines: [{ label: 'Summoned', value: unit.resolvedStats.move, kind: 'base' as const }] } } : {}),
      armor: { stat: 'armor', finalValue: unit.resolvedStats.armor, lines: [{ label: 'Summoned', value: unit.resolvedStats.armor, kind: 'base' }] },
      range: { stat: 'range', finalValue: unit.resolvedStats.range, lines: [{ label: 'Summoned', value: unit.resolvedStats.range, kind: 'base' }] },
      capacity: { stat: 'capacity', finalValue: unit.resolvedStats.capacity, lines: [{ label: 'Summoned', value: unit.resolvedStats.capacity, kind: 'base' }] },
      size: { stat: 'size', finalValue: unit.resolvedStats.size, lines: [{ label: 'Summoned', value: unit.resolvedStats.size, kind: 'base' }] },
    },
  });
}

function tryFindSummonPlacement(state: InternalState, origin: HexCoord, size: number): { hex: HexCoord; orientation: FootprintOrientation } | null {
  const originKey = hexKey(origin);
  const mapCandidates = hexSetToCoords(state.mapHexes)
    .filter((coord) => hexKey(coord) !== originKey)
    .map((coord) => ({ coord, distance: hexDistance(origin, coord), tie: state.rng.next() }))
    .sort((left, right) => left.distance - right.distance || left.tie - right.tie)
    .map((entry) => entry.coord);
  const candidatePool = state.mapHexes.has(originKey) ? [origin, ...mapCandidates] : mapCandidates;
  for (const coord of candidatePool) {
    const orientations = state.rng.shuffle<FootprintOrientation>(['north', 'south']);
    const orientation = orientations.find((candidateOrientation) =>
      isFootprintPlacementLegal(state, footprintForSize(coord, size, candidateOrientation)),
    );
    if (orientation) {
      return { hex: coord, orientation };
    }
  }
  return null;
}

function applyCarrionChoir(state: InternalState, actor: InternalUnit, corpsePosition: HexCoord): void {
  if (!hasAbility(actor, 'carrion-choir')) {
    return;
  }
  getAliveUnits(state)
    .filter((unit) => unit.side !== actor.side && unitDistanceFromHex(unit, corpsePosition) <= 1)
    .forEach((unit) => {
      unit.resolvedStats.armor = clampStat('armor', fixedSub(unit.resolvedStats.armor, 1));
      unit.resolvedStats.damage = fixedMax(fixedSub(unit.resolvedStats.damage, 1), 0);
      buildStep(state, 'buff', [actor.id], [unit.id], `${unit.troopLabel} loses 1 armor and 1 damage.`, {
        effect: 'carrionChoir',
        amount: -1,
        sourceAbilityId: 'carrion-choir',
        sourceAbilityLabel: getAbility('carrion-choir').label,
      });
    });
}

function summonUnit(
  state: InternalState,
  actor: InternalUnit,
  runtime: RuntimeAbilityState,
  effect: Extract<AbilityEffectDefinition, { kind: 'summon' }>,
  origin: HexCoord,
): InternalUnit | null {
  const troop = composeSummonedTroopDefinition(actor.raceId, effect.unitClassId);
  const summonPlacement = tryFindSummonPlacement(state, origin, troop.stats.size);
  if (!summonPlacement) {
    return null;
  }
  const summonIndex = [...state.units.values()].filter((unit) => unit.side === actor.side && unit.troopLabel === troop.label).length + 1;
  const unitId = `${actor.id}-summon-${effect.unitClassId}-${summonIndex}`;
  const grantedAbilities = (effect.grantedAbilityIds ?? []).map(getAbility);
  if (effect.unitClassId === 'skeleton' && sideHasTroopClassUpgrade(state, actor.side, 'necromancer-hemomancy')) {
    grantedAbilities.push(getAbility('heal-ally-0-7'));
  }
  const mergedAbilities = [...troop.abilities];
  grantedAbilities.forEach((ability) => {
    if (!mergedAbilities.some((entry) => entry.id === ability.id)) {
      mergedAbilities.push(ability);
    }
  });
  const summonedUnit: InternalUnit = {
    id: unitId,
    combatantId: null,
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
    readiness: fixedMax(effect.initialReadiness ?? (hasAbility(actor, 'early-riser') && effect.unitClassId === 'skeleton' ? 100 : 0), 0),
    alive: true,
    engagedWith: new Set<string>(),
    resolvedStats: { ...troop.stats },
    resolvedAbilities: mergedAbilities.map(createRuntimeAbilityState),
    activeTimedEffects: [],
    committedBacklineTargetId: null,
    graveVigorBlockedSides: new Set<SideId>(),
    mercyBeforeDawnUsed: false,
    stonebloodUsed: false,
    fadeIntoShadowUsed: false,
    glamourUsed: false,
    brambleSnareStacks: 0,
    bonusStrikeCharges: 0,
    scavengersHungerKills: 0,
    sentinelRunesTriggered: false,
    berserkDeathPending: false,
    berserkTurnsUntilDeath: 0,
    holyConstructsTriggered: false,
    hexedStacks: 0,
    zealStacks: 0,
  };
  applyMutatorAdjustmentsToUnit(summonedUnit, state.effects);
  state.units.set(unitId, summonedUnit);
  registerAliveUnit(state, summonedUnit);
  state.distinctTypeCache.delete(summonedUnit.side);
  recordSummonedProfile(state, summonedUnit);
  buildStep(state, 'buff', [actor.id], [unitId], `${actor.troopLabel} summons ${troop.label}.`, {
    effect: 'summon',
    unitClassId: troop.unitClassId,
    sourceAbilityId: runtime.definition.id,
    sourceAbilityLabel: runtime.definition.label,
  });
  return summonedUnit;
}

function summonUnitsAtHex(
  state: InternalState,
  actor: InternalUnit,
  sourceAbilityId: string,
  unitClassId: string,
  count: number,
  origin: HexCoord,
  grantedAbilityIds: string[] = [],
  initialReadiness?: number,
): InternalUnit[] {
  const runtime = createRuntimeAbilityState(getAbility(sourceAbilityId));
  const effect: Extract<AbilityEffectDefinition, { kind: 'summon' }> = {
    kind: 'summon',
    unitClassId,
    count: 1,
    grantedAbilityIds,
    initialReadiness,
  };
  const summonedUnits: InternalUnit[] = [];
  for (let index = 0; index < count; index += 1) {
    const summonedUnit = summonUnit(state, actor, runtime, effect, origin);
    if (summonedUnit) {
      summonedUnits.push(summonedUnit);
    }
  }
  return summonedUnits;
}

function triggerSentinelRunes(state: InternalState, knight: InternalUnit, origin: HexCoord, triggerUnit: InternalUnit | null, message: string): void {
  if (knight.sentinelRunesTriggered || !hasAbility(knight, 'sentinel-runes')) {
    return;
  }
  const summonedUnits = summonUnitsAtHex(state, knight, 'sentinel-runes', 'elemental', 2, origin);
  if (summonedUnits.length > 0) {
    knight.sentinelRunesTriggered = true;
    buildStep(state, 'buff', [knight.id], [], message, {
      effect: 'sentinelRunes',
      sourceAbilityId: 'sentinel-runes',
      sourceAbilityLabel: getAbility('sentinel-runes').label,
    });
    if (triggerUnit?.alive) {
      summonedUnits.forEach((elemental) => {
        if (!triggerUnit.alive || elemental.engagedWith.has(triggerUnit.id) || triggerUnit.resolvedStats.size > availableCapacity(state, elemental)) {
          return;
        }
        createEngagement(state, elemental, triggerUnit);
        buildStep(state, 'engage', [elemental.id], [triggerUnit.id], `${elemental.troopLabel} answers Sentinel Runes.`, {
          effect: 'sentinelRunesEngage',
          sourceAbilityId: 'sentinel-runes',
          sourceAbilityLabel: getAbility('sentinel-runes').label,
        });
        attack(state, elemental, triggerUnit, 'melee', true, 0, 'strike');
      });
    }
  }
}

function handleMoveOffKnightHex(state: InternalState, mover: InternalUnit, previousFootprint: HexCoord[], to: HexCoord): void {
  getAliveUnits(state)
    .filter((unit) => unit.side !== mover.side && footprintsTouchOrOverlap(unit.occupiedHexes, previousFootprint) && hasAbility(unit, 'sentinel-runes'))
    .forEach((knight) => {
      triggerSentinelRunes(state, knight, to, mover, `${knight.troopLabel} triggers Sentinel Runes.`);
    });
}

function relocateUnit(state: InternalState, actor: InternalUnit, destination: HexCoord): void {
  const previousPosition = { ...actor.position };
  const previousFootprint = actor.occupiedHexes.map((hex) => ({ ...hex }));
  removeAllEngagements(state, actor);
  actor.position = { ...destination };
  recomputeFootprint(actor);
  if (!equalsHex(previousPosition, destination)) {
    handleMoveOffKnightHex(state, actor, previousFootprint, destination);
  }
}

function applyBlastSequence(
  state: InternalState,
  actor: InternalUnit,
  runtime: RuntimeAbilityState,
  amount: number,
  originFootprint: HexCoord[],
  damagedTargetIds: Set<string>,
  echoedOriginIds = new Set<string>(),
): boolean {
  const targets = blastTargetsFromFootprint(state, actor, originFootprint)
    .filter((target) => !damagedTargetIds.has(target.id));
  if (targets.length === 0) {
    return false;
  }

  const baseBlastAmount =
    hasAbility(actor, 'lightning-rods') ?
      fixedAdd(
        amount,
        getAliveUnits(state, actor.side).filter((unit) => unit.unitClassTag === 'elemental').length,
      )
    : amount;
  const vulnerabilityHexActive =
    sideHasTroopClassUpgrade(state, actor.side, 'wizard-vulnerability-hex') && sideHasAliveUnitClass(state, actor.side, 'wizard');

  let applied = false;
  const echoQueue: InternalUnit[] = [];
  targets.forEach((target) => {
    damagedTargetIds.add(target.id);
    const totalAmount = vulnerabilityHexActive ? fixedMul(baseBlastAmount, 1 + target.hexedStacks) : baseBlastAmount;
    const damage = fixedMax(totalAmount, 0);
    const inflictedDamage = canTakeDamage(target) ? damage : 0;
    if (inflictedDamage > 0) {
      target.hp = fixedSub(target.hp, inflictedDamage);
    }
    buildStep(state, 'attack', [actor.id], [target.id], `${actor.troopLabel} splashes ${formatFixed(inflictedDamage)} blast damage.`, {
      damage: inflictedDamage,
      mode: 'blast',
      category: 'strike',
      baseDamage: totalAmount,
      attackDamageBeforeArmor: totalAmount,
      armorIgnored: true,
      sourceAbilityId: runtime.definition.id,
      sourceAbilityLabel: runtime.definition.label,
    });
    applied = true;
    echoQueue.push(target);
    if (target.hp <= 0 && target.alive) {
      handleDeath(state, actor, target, { mode: 'blast', category: 'strike' });
    } else if (target.alive && canTakeDamage(target)) {
      if (vulnerabilityHexActive && inflictedDamage > 0 && state.rng.next() < 0.2) {
        addHexStack(state, actor, target, 'vulnerability-hex');
      }
      triggerUnitAbilities(state, target, { timing: 'onDamaged' });
      if (inflictedDamage > 0) {
        applyWhimsy(state, target);
      }
    }
  });

  if (applied && hasAbility(actor, 'spell-echo')) {
    echoQueue.forEach((target) => {
      if (echoedOriginIds.has(target.id)) {
        return;
      }
      echoedOriginIds.add(target.id);
      applyBlastSequence(state, actor, runtime, amount, target.occupiedHexes, damagedTargetIds, echoedOriginIds);
    });
  }

  return applied;
}

type PerTargetEffectHandler = (
  state: InternalState,
  actor: InternalUnit,
  runtime: RuntimeAbilityState,
  target: InternalUnit,
  effect: AbilityEffectDefinition,
  event: AbilityTriggerEvent,
) => boolean;

// Registry of handlers for effects that operate on resolved targets.
// Adding a new effect kind only requires adding an entry here — the dispatch in
// executeAbilityEffect does not need to change.
// 'taunt' is absent: it bypasses target resolution and uses engageTouchingEnemies directly.
// 'pack' is absent: it is a passive bonus computed in getPackBonus, not a triggered effect.
const PER_TARGET_EFFECT_HANDLERS: Partial<Record<AbilityEffectDefinition['kind'], PerTargetEffectHandler>> = {
  bolster: (state, actor, runtime, target, effect) => applyBolster(state, actor, target, runtime, effect as Extract<AbilityEffectDefinition, { kind: 'bolster' }>),
  haste: (state, actor, runtime, target, effect) => applyHaste(state, actor, target, runtime, effect as Extract<AbilityEffectDefinition, { kind: 'haste' }>),
  heal: (state, actor, runtime, target, effect) => healUnit(state, actor, target, runtime, effect as Extract<AbilityEffectDefinition, { kind: 'heal' }>),
  ramp: (state, actor, runtime, target, effect) => applyRamp(state, actor, target, runtime, effect as Extract<AbilityEffectDefinition, { kind: 'ramp' }>),
  statDelta: (state, actor, runtime, target, effect) =>
    applyStatDelta(state, actor, target, runtime, effect as Extract<AbilityEffectDefinition, { kind: 'statDelta' }>),
  rangeset: (state, actor, runtime, target, effect) => applyRangeSet(state, actor, target, runtime, effect as Extract<AbilityEffectDefinition, { kind: 'rangeset' }>),
  roleset: (state, actor, runtime, target, effect) => applyRoleSet(state, actor, target, runtime, effect as Extract<AbilityEffectDefinition, { kind: 'roleset' }>),
  readinessSet: (state, actor, runtime, target, effect) =>
    applyReadinessSet(state, actor, target, runtime, effect as Extract<AbilityEffectDefinition, { kind: 'readinessSet' }>),
  readinessDelta: (state, actor, runtime, target, effect) =>
    applyReadinessDelta(state, actor, target, runtime, effect as Extract<AbilityEffectDefinition, { kind: 'readinessDelta' }>),
  grantAbility: (state, actor, runtime, target, effect) =>
    applyGrantAbility(state, actor, target, runtime, effect as Extract<AbilityEffectDefinition, { kind: 'grantAbility' }>),
  summon: (state, actor, runtime, _target, effect, event) => {
    const summon = effect as Extract<AbilityEffectDefinition, { kind: 'summon' }>;
    const origin = summon.consumeFallenUnitCorpse ? event.fallenUnit?.position : actor.position;
    if (!origin) {
      return false;
    }
  if (summon.consumeFallenUnitCorpse && event.fallenUnit) {
      if (!state.corpses.has(event.fallenUnit.id)) {
        if (!hasAbility(actor, 'alternate-fuel-10') || actor.hp <= 10) {
          return false;
        }
        actor.hp = fixedSub(actor.hp, 10);
        buildStep(state, 'buff', [actor.id], [], `${actor.troopLabel} spends 10 health instead of a corpse.`, {
          effect: 'alternateFuel',
          sourceAbilityId: runtime.definition.id,
          sourceAbilityLabel: runtime.definition.label,
        });
      }
    }
    let summonedAny = false;
    for (let index = 0; index < summon.count; index += 1) {
      summonedAny = Boolean(summonUnit(state, actor, runtime, summon, origin)) || summonedAny;
    }
    if (summonedAny && summon.consumeFallenUnitCorpse && event.fallenUnit) {
      applyCarrionChoir(state, actor, event.fallenUnit.position);
      state.corpses.delete(event.fallenUnit.id);
    }
    return summonedAny;
  },
  strike: (state, actor, _runtime, target, effect) => {
    const e = effect as Extract<AbilityEffectDefinition, { kind: 'strike' }>;
    const strikeCount = Math.max(0, Math.floor(e.amount));
    if (strikeCount > 0 && target.alive) {
      for (let i = 0; i < strikeCount; i += 1) {
        attack(
          state,
          actor,
          target,
          actor.resolvedStats.range > 0 ? 'ranged' : 'melee',
          _runtime.definition.id === 'charge-4-random-enemy-r-strike-4',
          0,
          'strike',
        );
        if (!target.alive) {
          break;
        }
      }
      return true;
    }
    return false;
  },
  redirect: (state, actor, runtime, target, effect) => {
    const redirectEffect = effect as Extract<AbilityEffectDefinition, { kind: 'redirect' }>;
    if (!target.alive || (!redirectEffect.allowAlreadyEngaged && target.engagedWith.size > 0) || actor.engagedWith.has(target.id)) {
      return false;
    }
    if (target.resolvedStats.size > availableCapacity(state, actor)) {
      return false;
    }
    createEngagement(state, actor, target);
    buildStep(state, 'engage', [actor.id], [target.id], `${actor.troopLabel} redirects ${target.troopLabel}.`, {
      effect: 'redirect',
      sourceAbilityId: runtime.definition.id,
      sourceAbilityLabel: runtime.definition.label,
    });
    return true;
  },
};

function executeAbilityEffect(
  state: InternalState,
  actor: InternalUnit,
  runtime: RuntimeAbilityState,
  effect: AbilityEffectDefinition,
  event: AbilityTriggerEvent,
): boolean {
  const handler = PER_TARGET_EFFECT_HANDLERS[effect.kind];
  if (effect.kind === 'blast') {
    const targets = resolveTargets(state, actor, runtime.definition, effect, event);
    const firstTarget = targets[0];
    if (!firstTarget) {
      return false;
    }
    return applyBlastSequence(state, actor, runtime, (effect as Extract<AbilityEffectDefinition, { kind: 'blast' }>).amount, firstTarget.occupiedHexes, new Set<string>());
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
    if (!target.alive && !(target.id === actor.id && event.timing === 'onDeath' && effect.kind === 'summon') && effect.kind !== 'strike') {
      return;
    }
    if (isBlockedByGraveVigor(actor, target, effect)) {
      return;
    }
    let appliedToTarget = false;
    if (
      runtime.definition.duration.kind === 'turns' &&
      (effect.kind === 'bolster' ||
        effect.kind === 'haste' ||
        effect.kind === 'ramp' ||
        effect.kind === 'statDelta' ||
        effect.kind === 'rangeset' ||
        effect.kind === 'roleset')
    ) {
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

function triggerUnitAbilities(
  state: InternalState,
  actor: InternalUnit,
  event: AbilityTriggerEvent,
  filter?: (runtime: RuntimeAbilityState) => boolean,
): void {
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

function isArmyCompositionAbility(runtime: RuntimeAbilityState): boolean {
  return !!(
    runtime.definition.trigger.condition ||
    runtime.definition.trigger.repeatPerDistinctFriendlyTroopClass ||
    runtime.definition.trigger.repeatPerDistinctFriendlyTroop
  );
}

function executeStartOfBattleAbilities(state: InternalState): void {
  const initialUnits = getAliveUnits(state);
  // Phase 1: abilities that check army composition (forsaken, combined-arms) must fire before
  // any startOfBattle summons alter the unit roster.
  initialUnits.forEach((unit) => {
    triggerUnitAbilities(state, unit, { timing: 'startOfBattle' }, isArmyCompositionAbility);
  });
  // Phase 2: all other startOfBattle abilities (e.g. summons).
  initialUnits.forEach((unit) => {
    triggerUnitAbilities(state, unit, { timing: 'startOfBattle' }, (r) => !isArmyCompositionAbility(r));
  });
}

function applyCopiousAle(state: InternalState): void {
  (['player', 'enemy'] as SideId[]).forEach((side) => {
    if (!sideHasRaceUpgrade(state, side, 'dwarf-ale-and-hearty')) {
      return;
    }
    const byTroop = new Map<string, InternalUnit[]>();
    getAliveUnits(state, side)
      .filter((unit) => isDwarf(unit) && hasAbility(unit, 'ale-and-hearty'))
      .forEach((unit) => {
        const key = `${side}:${unit.troopLabel}`;
        if (state.copiousAleAppliedTroopKeys.has(key)) {
          return;
        }
        byTroop.set(key, [...(byTroop.get(key) ?? []), unit]);
      });

    byTroop.forEach((units, key) => {
      const target = state.rng.pick(units);
      state.copiousAleAppliedTroopKeys.add(key);
      const previousRate = target.resolvedStats.rate;
      target.resolvedStats.rate = 1;
      buildStep(state, 'buff', [target.id], [target.id], `${target.troopLabel} has too much ale and slows to 1 rate.`, {
        effect: 'copiousAle',
        stat: 'rate',
        amount: fixedSub(1, previousRate),
        sourceAbilityId: 'ale-and-hearty',
        sourceAbilityLabel: getAbility('ale-and-hearty').label,
      });
    });
  });
}

function performBrace(state: InternalState, actor: InternalUnit): void {
  if (!hasAbility(actor, 'brace') || actor.engagedWith.size === 0 || availableCapacity(state, actor) !== 0) {
    return;
  }
  applyTemporaryEffect(state, actor, actor, createRuntimeAbilityState(getAbility('brace')), {
    kind: 'statDelta',
    stat: 'armor',
    amount: 10,
    mode: 'flat',
    disposition: 'beneficial',
  });
}

function performLivingCircuit(state: InternalState, actor: InternalUnit): void {
  if (!hasAbility(actor, 'living-circuit')) {
    return;
  }
  const elementals = getAliveUnits(state, actor.side).filter(
    (unit) => unit.unitClassTag === 'elemental' && unitsInRange(actor, unit),
  );
  if (elementals.length === 0) {
    return;
  }
  applyReadinessDelta(state, actor, actor, createRuntimeAbilityState(getAbility('living-circuit')), {
    kind: 'readinessDelta',
    amount: 15,
    disposition: 'beneficial',
  });
  elementals.forEach((elemental) => {
    applyReadinessDelta(state, actor, elemental, createRuntimeAbilityState(getAbility('living-circuit')), {
      kind: 'readinessDelta',
      amount: 15,
      disposition: 'beneficial',
    });
  });
}

function handleShapeshiftTriggers(state: InternalState, actor: InternalUnit, runtime: RuntimeAbilityState): void {
  if (runtime.definition.id !== 'shapeshift-bear' && runtime.definition.id !== 'shapeshift-bear-2') {
    return;
  }
  if (hasAbility(actor, 'bramble-snare')) {
    actor.brambleSnareStacks += 1;
    buildStep(state, 'buff', [actor.id], [actor.id], `${actor.troopLabel} empowers Bramble Snare.`, {
      effect: 'brambleSnare',
      amount: actor.brambleSnareStacks,
      sourceAbilityId: 'bramble-snare',
      sourceAbilityLabel: getAbility('bramble-snare').label,
    });
  }
  if (hasAbility(actor, 'wild-call') || hasAbility(actor, 'forest-friends')) {
    summonUnitsAtHex(state, actor, hasAbility(actor, 'forest-friends') ? 'forest-friends' : 'wild-call', 'wolf', 2, actor.position);
  }
}

function performForestFriends(state: InternalState, actor: InternalUnit): void {
  if (!hasAbility(actor, 'forest-friends')) {
    return;
  }
  const runtime = createRuntimeAbilityState(getAbility('forest-friends'));
  const targets = [actor, ...getAliveUnits(state, actor.side).filter((unit) => unit.summonerUnitId === actor.id && hasAbility(unit, 'bonded'))];
  targets.forEach((target) => {
    healUnit(state, actor, target, runtime, { kind: 'heal', amount: 20, mode: 'flat', disposition: 'beneficial' });
  });
}

function performWarDrums(state: InternalState, actor: InternalUnit): void {
  if (!hasAbility(actor, 'war-drums')) {
    return;
  }
  const hasteEffect: Extract<AbilityEffectDefinition, { kind: 'haste' }> = { kind: 'haste', amount: 1, mode: 'flat', disposition: 'beneficial' };
  const rampEffect: Extract<AbilityEffectDefinition, { kind: 'ramp' }> = { kind: 'ramp', amount: 1, mode: 'flat', disposition: 'beneficial' };
  const eligible = prioritizeCandidates(
    getAliveUnits(state, actor.side).filter(
      (unit) =>
        unitsInRange(actor, unit) &&
        !hasMatchingIdentityTag(unit, ['caster']) &&
        (!isBlockedByGraveVigor(actor, unit, hasteEffect) || !isBlockedByGraveVigor(actor, unit, rampEffect)),
    ),
  );
  if (eligible.length === 0) {
    return;
  }
  const target = state.rng.pick(eligible);
  getAliveUnits(state, actor.side)
    .filter((unit) => unitsTouchOrOverlap(unit, target))
    .forEach((unit) => {
      const runtime = createRuntimeAbilityState(getAbility('war-drums'));
      if (!isBlockedByGraveVigor(actor, unit, hasteEffect) && applyHaste(state, actor, unit, runtime, hasteEffect)) {
        applyPostEffectReactions(state, actor, runtime, unit, hasteEffect);
      }
      if (!isBlockedByGraveVigor(actor, unit, rampEffect) && applyRamp(state, actor, unit, runtime, rampEffect)) {
        applyPostEffectReactions(state, actor, runtime, unit, rampEffect);
      }
    });
  flushPendingGraveVigorBlocks(state);
}

function executeEndOfTurnAbilities(state: InternalState, actor: InternalUnit): void {
  performForestFriends(state, actor);
  performWarDrums(state, actor);
  performLivingCircuit(state, actor);
  triggerUnitAbilities(state, actor, { timing: 'endOfTurn' });
  performZealEndOfTurn(state, actor);
  if (actor.alive) {
    performOverwhelmHexEndOfTurn(state, actor);
  }
}

function executeStartOfTurnAbilities(state: InternalState, actor: InternalUnit): void {
  performBrace(state, actor);
  triggerUnitAbilities(state, actor, { timing: 'startOfTurn' });
}

function performHoldTheStandard(state: InternalState, fallen: InternalUnit): void {
  if (hasAbility(fallen, 'fading')) {
    return;
  }
  getAliveUnits(state, fallen.side)
    .filter((unit) => hasAbility(unit, 'hold-the-standard'))
    .forEach((unit) => {
      healUnit(state, unit, unit, createRuntimeAbilityState(getAbility('hold-the-standard')), {
        kind: 'heal',
        amount: 15,
        mode: 'flat',
        disposition: 'beneficial',
      });
    });
}

function performLootFrenzy(state: InternalState, actor: InternalUnit, fallenFootprint: HexCoord[]): void {
  getAliveUnits(state, actor.side)
    .filter((unit) => unitOverlapsAnyHex(unit, fallenFootprint))
    .forEach((unit) => {
      healUnit(state, actor, unit, createRuntimeAbilityState(getAbility('loot-frenzy')), {
        kind: 'heal',
        amount: 10,
        mode: 'flat',
        disposition: 'beneficial',
      });
      applyReadinessDelta(state, actor, unit, createRuntimeAbilityState(getAbility('loot-frenzy')), {
        kind: 'readinessDelta',
        amount: 30,
        disposition: 'beneficial',
      });
    });
}

function performThrillKillBuff(state: InternalState, actor: InternalUnit): void {
  getAliveUnits(state, actor.side)
    .forEach((unit) => {
      applyRamp(state, actor, unit, createRuntimeAbilityState(getAbility('thrill-of-the-hunt')), {
        kind: 'ramp',
        amount: 1,
        mode: 'flat',
        disposition: 'beneficial',
      });
    });
}

function performThrillWolfSummon(state: InternalState, actor: InternalUnit): void {
  if (actor.unitClassTag !== 'wolf' || !sideHasTroopClassUpgrade(state, actor.side, 'beastmaster-thrill-of-the-hunt')) {
    return;
  }
  summonUnitsAtHex(state, actor, 'thrill-of-the-hunt', 'wolf', 1, actor.position);
  performThrillKillBuff(state, actor);
}

function sideHasAliveUnitClass(state: InternalState, side: SideId, unitClassTag: string): boolean {
  return getAliveUnits(state, side).some((unit) => unit.unitClassTag === unitClassTag);
}

function sideHasAliveRace(state: InternalState, side: SideId, raceId: string): boolean {
  return getAliveUnits(state, side).some((unit) => unit.raceId === raceId);
}

function addZealStack(state: InternalState, source: InternalUnit, target: InternalUnit, sourceAbilityId: string): void {
  if (!target.alive) {
    return;
  }
  target.zealStacks += 1;
  const ability = getAbility(sourceAbilityId);
  buildStep(state, 'buff', [source.id], [target.id], `${target.troopLabel} gains 1 Zeal stack.`, {
    effect: 'zeal',
    amount: 1,
    value: target.zealStacks,
    sourceAbilityId,
    sourceAbilityLabel: ability.label,
  });
  const runtime = createRuntimeAbilityState(ability);
  if (sideHasTroopClassUpgrade(state, target.side, 'champion-triumph')) {
    applyRamp(state, source, target, runtime, { kind: 'ramp', amount: 10, mode: 'percent', disposition: 'beneficial' });
    applyHaste(state, source, target, runtime, { kind: 'haste', amount: 10, mode: 'percent', disposition: 'beneficial' });
    applyBolster(state, source, target, runtime, { kind: 'bolster', amount: 10, mode: 'percent', disposition: 'beneficial' });
  }
  if (sideHasRaceUpgrade(state, target.side, 'troll-gargantuan-zeal')) {
    applyRamp(state, source, target, runtime, {
      kind: 'ramp',
      amount: fixedMul(target.resolvedStats.size, 5),
      mode: 'flat',
      disposition: 'beneficial',
    });
  }
}

function addHexStack(state: InternalState, source: InternalUnit, target: InternalUnit, sourceAbilityId: string): void {
  if (!target.alive) {
    return;
  }
  target.hexedStacks += 1;
  const ability = getAbility(sourceAbilityId);
  buildStep(state, 'buff', [source.id], [target.id], `${target.troopLabel} gains 1 Hex stack.`, {
    effect: 'hexed',
    amount: 1,
    value: target.hexedStacks,
    sourceAbilityId,
    sourceAbilityLabel: ability.label,
  });
  if (sideHasTroopClassUpgrade(state, opposingSide(target.side), 'militia-crippling-hex')) {
    applyHaste(state, source, target, createRuntimeAbilityState(ability), {
      kind: 'haste',
      amount: -30,
      mode: 'percent',
      disposition: 'harmful',
    });
  }
}

function applyStartOfBattleStackSeeds(state: InternalState): void {
  (['player', 'enemy'] as SideId[]).forEach((side) => {
    if (sideHasRaceUpgrade(state, side, 'troll-gargantuan-zeal') && sideHasAliveRace(state, side, 'troll')) {
      const source = getAliveUnits(state, side).find((unit) => unit.raceId === 'troll') ?? getAliveUnits(state, side)[0];
      const byTroop = new Map<string, InternalUnit[]>();
      getAliveUnits(state, side).forEach((unit) => {
        const key = unit.troopInstanceId ?? unit.combatantId ?? unit.troopLabel;
        byTroop.set(key, [...(byTroop.get(key) ?? []), unit]);
      });
      byTroop.forEach((units) => {
        addZealStack(state, source, state.rng.pick(units), 'gargantuan-zeal');
      });
    }

    if (sideHasRaceUpgrade(state, side, 'goblin-overwhelm-hex') && sideHasAliveRace(state, side, 'goblin')) {
      const source = getAliveUnits(state, side).find((unit) => unit.raceId === 'goblin') ?? getAliveUnits(state, side)[0];
      const enemySide = opposingSide(side);
      const byTroop = new Map<string, InternalUnit[]>();
      getAliveUnits(state, enemySide).forEach((unit) => {
        const key = unit.troopInstanceId ?? unit.combatantId ?? unit.troopLabel;
        byTroop.set(key, [...(byTroop.get(key) ?? []), unit]);
      });
      byTroop.forEach((units) => {
        addHexStack(state, source, state.rng.pick(units), 'overwhelm-hex');
      });
    }
  });
}

function performZealEndOfTurn(state: InternalState, actor: InternalUnit): void {
  if (actor.zealStacks <= 0) {
    return;
  }
  if (sideHasTroopClassUpgrade(state, actor.side, 'ranger-hunters-zeal')) {
    applyReadinessDelta(state, actor, actor, createRuntimeAbilityState(getAbility('hunters-zeal')), {
      kind: 'readinessDelta',
      amount: fixedMul(actor.zealStacks, 5),
      disposition: 'beneficial',
    });
  }
  if (sideHasTroopClassUpgrade(state, actor.side, 'soldier-martyrs-zeal')) {
    healUnit(state, actor, actor, createRuntimeAbilityState(getAbility('martyrs-zeal')), {
      kind: 'heal',
      amount: fixedMul(actor.zealStacks, 5),
      mode: 'flat',
      disposition: 'beneficial',
    });
  }
}

function performOverwhelmHexEndOfTurn(state: InternalState, actor: InternalUnit): void {
  if (actor.hexedStacks <= 0) {
    return;
  }
  const goblinSide = opposingSide(actor.side);
  if (!sideHasRaceUpgrade(state, goblinSide, 'goblin-overwhelm-hex')) {
    return;
  }
  const livingGoblins = getAliveUnits(state, goblinSide).filter((unit) => unit.raceId === 'goblin').length;
  const damage = fixedMul(livingGoblins, actor.hexedStacks);
  if (damage <= 0) {
    return;
  }
  if (canTakeDamage(actor)) {
    actor.hp = fixedSub(actor.hp, damage);
  }
  buildStep(state, 'attack', [], [actor.id], `${actor.troopLabel} loses ${formatFixed(damage)} health to Overwhelm Hex.`, {
    damage,
    mode: 'blast',
    category: 'strike',
    baseDamage: damage,
    attackDamageBeforeArmor: damage,
    armorIgnored: true,
    sourceAbilityId: 'overwhelm-hex',
    sourceAbilityLabel: getAbility('overwhelm-hex').label,
  });
  if (actor.hp <= 0 && actor.alive) {
    handleEnvironmentalDeath(state, actor, 'overwhelm-hex', getAbility('overwhelm-hex').label, `${actor.troopLabel} is overwhelmed by Hex.`);
  } else if (actor.alive && canTakeDamage(actor)) {
    triggerUnitAbilities(state, actor, { timing: 'onDamaged' });
    applyWhimsy(state, actor);
  }
}

function triggerCrackExploits(state: InternalState, source: InternalUnit, target: InternalUnit): void {
  if (!target.alive || state.crackExploitsDepth > 4) {
    return;
  }
  const elementalists = getAliveUnits(state, source.side)
    .filter((unit) => unit.side !== target.side && unit.unitClassTag === 'elementalist' && hasAbility(unit, 'crack-exploits'));
  if (elementalists.length === 0) {
    return;
  }
  state.crackExploitsDepth += 1;
  state.rng.shuffle(elementalists).forEach((elementalist) => {
    if (elementalist.alive && target.alive && canTargetWithNormalAttack(elementalist, target)) {
      attack(state, elementalist, target, elementalist.resolvedStats.range > 0 ? 'ranged' : 'melee', true, 0, 'normal');
    }
  });
  state.crackExploitsDepth -= 1;
}

function performTriumph(state: InternalState, actor: InternalUnit): void {
  if (actor.unitClassTag !== 'champion' || !hasAbility(actor, 'triumph')) {
    return;
  }
  getAliveUnits(state, actor.side)
    .filter((unit) => unit.id === actor.id || unitsTouchOrOverlap(unit, actor))
    .forEach((unit) => {
      addZealStack(state, actor, unit, 'triumph');
    });
}

function performHuntersZeal(state: InternalState, actor: InternalUnit, fallen: InternalUnit): void {
  if (actor.unitClassTag !== 'ranger' || !hasAbility(actor, 'hunters-zeal')) {
    return;
  }
  getAliveUnits(state, actor.side)
    .filter((unit) => unit.id === actor.id || unitsTouchOrOverlap(unit, fallen))
    .forEach((unit) => addZealStack(state, actor, unit, 'hunters-zeal'));
}

function performMartyrsZeal(state: InternalState, fallen: InternalUnit): void {
  if (fallen.unitClassTag !== 'soldier' || !hasAbility(fallen, 'martyrs-zeal')) {
    return;
  }
  getAliveUnits(state, fallen.side).forEach((unit) => addZealStack(state, fallen, unit, 'martyrs-zeal'));
}

function performHolyConstructsElementalDeath(state: InternalState, elemental: InternalUnit): void {
  if (elemental.unitClassTag !== 'elemental' || !sideHasTroopClassUpgrade(state, elemental.side, 'priest-holy-constructs')) {
    return;
  }
  const runtime = createRuntimeAbilityState(getAbility('holy-constructs'));
  getAliveUnits(state, elemental.side)
    .filter((ally) => unitsTouchOrOverlap(ally, elemental))
    .forEach((ally) => {
      healUnit(state, elemental, ally, runtime, { kind: 'heal', amount: 20, mode: 'flat', disposition: 'beneficial' });
    });
}

function directKill(state: InternalState, actor: InternalUnit, target: InternalUnit, sourceAbilityId: string): void {
  if (!target.alive) {
    return;
  }
  markUnitDead(state, target);
  state.distinctTypeCache.delete(target.side);
  removeAllEngagements(state, target);
  clearBacklineCommitmentsTo(state, target.id);
  if (!hasAbility(target, 'fading')) {
    state.corpses.set(target.id, { ...target.position });
  }
  buildStep(state, 'death', [actor.id], [target.id], `${target.troopLabel} is killed by ${getAbility(sourceAbilityId).label}.`, {
    effect: sourceAbilityId,
    sourceAbilityId,
    sourceAbilityLabel: getAbility(sourceAbilityId).label,
  });

  if (hasAbility(target, 'sentinel-runes') && !target.sentinelRunesTriggered) {
    triggerSentinelRunes(state, target, target.position, actor, `${target.troopLabel} releases Sentinel Runes in death.`);
  }

  const bondedDependents = getAliveUnits(state, target.side).filter(
    (unit) => unit.summonerUnitId === target.id && hasAbility(unit, 'bonded'),
  );

  triggerUnitAbilities(state, actor, { timing: 'onKill', fallenUnit: target });
  performScavengersHunger(state, actor, target);
  if (target.unitClassTag === 'militia' && hasAbility(target, 'crippling-hex')) {
    addHexStack(state, target, actor, 'crippling-hex');
  }
  performThrillWolfSummon(state, actor);
  performHuntersZeal(state, actor, target);
  performTriumph(state, actor);
  performLastWitness(state, actor, target);
  performHolyConstructsElementalDeath(state, target);
  performHoldTheStandard(state, target);
  performMartyrsZeal(state, target);
  triggerUnitAbilities(state, target, { timing: 'onDeath', fallenUnit: target });
  getAliveUnits(state).forEach((unit) => {
    if (unit.id !== target.id) {
      triggerUnitAbilities(state, unit, { timing: 'onFallen', fallenUnit: target });
      if (target.unitClassTag === 'elemental' && hasAbility(unit, 'arc-conductor') && unit.side === actor.side) {
        applyBlastSequence(state, unit, createRuntimeAbilityState(getAbility('arc-conductor-blast-8')), 8, target.occupiedHexes, new Set<string>());
      }
    }
  });
  bondedDependents.forEach((unit) =>
    handleEnvironmentalDeath(state, unit, 'bonded', getAbility('bonded').label, `${unit.troopLabel} is destroyed when its summoner falls.`, true),
  );
}

function performLastWitness(state: InternalState, killer: InternalUnit, fallen: InternalUnit): void {
  getAliveUnits(state, fallen.side)
    .filter((unit) => unit.id !== fallen.id && hasAbility(unit, 'last-witness') && unitsTouchOrOverlap(unit, fallen))
    .forEach((unit) => {
      if (!killer.alive || !unitsTouchOrOverlap(killer, fallen)) {
        return;
      }
      attack(state, unit, killer, 'melee', false, 1, 'strike');
    });
}

function getScavengersHungerLimit(actor: InternalUnit): number {
  if (hasAbility(actor, 'scavengers-hunger-2')) {
    return 2;
  }
  return hasAbility(actor, 'scavengers-hunger') ? 3 : 0;
}

function performScavengersHunger(state: InternalState, actor: InternalUnit, target: InternalUnit): void {
  const summonLimit = getScavengersHungerLimit(actor);
  if (summonLimit <= 0 || hasAbility(target, 'fading') || actor.scavengersHungerKills >= summonLimit) {
    return;
  }
  actor.scavengersHungerKills += 1;
  state.corpses.delete(target.id);
  summonUnitsAtHex(state, actor, hasAbility(actor, 'scavengers-hunger-2') ? 'scavengers-hunger-2' : 'scavengers-hunger', 'wolf', 1, target.position);
}

function handleDeath(state: InternalState, actor: InternalUnit, target: InternalUnit, context: AttackContext = { mode: 'melee', category: 'normal' }): void {
  if (!target.alive) {
    return;
  }
  if (preventDeath(state, actor, target)) {
    return;
  }
  markUnitDead(state, target);
  state.distinctTypeCache.delete(target.side);
  removeAllEngagements(state, target);
  clearBacklineCommitmentsTo(state, target.id);
  if (!hasAbility(target, 'fading')) {
    state.corpses.set(target.id, { ...target.position });
  }
  buildStep(state, 'death', [actor.id], [target.id], `${target.troopLabel} is killed.`, {
    effect: 'death',
    sourceAbilityId: 'battle-resolution',
    sourceAbilityLabel: 'Battle resolution',
  });

  if (hasAbility(target, 'sentinel-runes') && !target.sentinelRunesTriggered) {
    triggerSentinelRunes(state, target, target.position, actor, `${target.troopLabel} releases Sentinel Runes in death.`);
  }

  const bondedDependents = getAliveUnits(state, target.side).filter(
    (unit) => unit.summonerUnitId === target.id && hasAbility(unit, 'bonded'),
  );

  triggerUnitAbilities(state, actor, { timing: 'onKill', fallenUnit: target });
  performScavengersHunger(state, actor, target);
  if (target.unitClassTag === 'militia' && hasAbility(target, 'crippling-hex')) {
    addHexStack(state, target, actor, 'crippling-hex');
  }
  if (hasAbility(actor, 'snatch-the-moment')) {
    getAliveUnits(state)
      .filter((unit) => unit.side !== actor.side)
      .forEach((unit) => {
        unit.readiness = fixedMax(fixedSub(unit.readiness, 10), 0);
        buildStep(state, 'buff', [actor.id], [unit.id], `${unit.troopLabel} loses 10 readiness.`, {
          effect: 'snatchTheMoment',
          amount: -10,
          sourceAbilityId: 'snatch-the-moment',
          sourceAbilityLabel: getAbility('snatch-the-moment').label,
        });
      });
  }
  if (hasAbility(actor, 'loot-frenzy')) {
    performLootFrenzy(state, actor, target.occupiedHexes);
  }
  performThrillWolfSummon(state, actor);
  performHuntersZeal(state, actor, target);
  performTriumph(state, actor);
  if (hasAbility(actor, 'crushing-sweep') && context.mode === 'melee') {
    const splash = actor.resolvedStats.size * 10;
    getAliveUnits(state)
      .filter((unit) => unit.side !== actor.side && unitsTouchOrOverlap(unit, target))
      .forEach((unit) => {
        const inflictedSplash = canTakeDamage(unit) ? splash : 0;
        if (inflictedSplash > 0) {
          unit.hp = fixedSub(unit.hp, inflictedSplash);
        }
        buildStep(state, 'attack', [actor.id], [unit.id], `${actor.troopLabel} crushes nearby enemies for ${formatFixed(inflictedSplash)}.`, {
          damage: inflictedSplash,
          mode: 'melee',
          category: context.category,
          baseDamage: splash,
          attackDamageBeforeArmor: splash,
          armorIgnored: true,
          sourceAbilityId: 'crushing-sweep',
          sourceAbilityLabel: getAbility('crushing-sweep').label,
        });
        if (unit.hp <= 0 && unit.alive) {
          handleDeath(state, actor, unit, context);
        } else if (unit.alive && canTakeDamage(unit)) {
          triggerUnitAbilities(state, unit, { timing: 'onDamaged' });
          if (inflictedSplash > 0) {
            applyWhimsy(state, unit);
          }
        }
      });
  }
  performLastWitness(state, actor, target);
  performHolyConstructsElementalDeath(state, target);
  performHoldTheStandard(state, target);
  performMartyrsZeal(state, target);
  triggerUnitAbilities(state, target, { timing: 'onDeath', fallenUnit: target });
  getAliveUnits(state).forEach((unit) => {
    if (unit.id !== target.id) {
      triggerUnitAbilities(state, unit, { timing: 'onFallen', fallenUnit: target });
      if (target.unitClassTag === 'elemental' && hasAbility(unit, 'arc-conductor') && unit.side === actor.side) {
        applyBlastSequence(state, unit, createRuntimeAbilityState(getAbility('arc-conductor-blast-8')), 8, target.occupiedHexes, new Set<string>());
      }
    }
  });
  bondedDependents.forEach((unit) =>
    handleEnvironmentalDeath(state, unit, 'bonded', getAbility('bonded').label, `${unit.troopLabel} is destroyed when its summoner falls.`, true),
  );
}

function handleEnvironmentalDeath(
  state: InternalState,
  target: InternalUnit,
  effectId: string,
  effectLabel: string,
  message: string,
  bypassPrevention = false,
  sourceKind: BattleStepMetadata['sourceKind'] = 'ability',
): void {
  if (!target.alive) {
    return;
  }
  if (!bypassPrevention && preventDeath(state, target, target)) {
    return;
  }
  markUnitDead(state, target);
  state.distinctTypeCache.delete(target.side);
  removeAllEngagements(state, target);
  clearBacklineCommitmentsTo(state, target.id);
  if (!hasAbility(target, 'fading')) {
    state.corpses.set(target.id, { ...target.position });
  }
  buildStep(state, 'death', [], [target.id], message, {
    effect: effectId,
    sourceAbilityId: effectId,
    sourceAbilityLabel: effectLabel,
    sourceKind,
  });

  if (hasAbility(target, 'sentinel-runes') && !target.sentinelRunesTriggered) {
    triggerSentinelRunes(state, target, target.position, null, `${target.troopLabel} releases Sentinel Runes in death.`);
  }

  const bondedDependents = getAliveUnits(state, target.side).filter(
    (unit) => unit.summonerUnitId === target.id && hasAbility(unit, 'bonded'),
  );

  performHolyConstructsElementalDeath(state, target);
  performHoldTheStandard(state, target);
  performMartyrsZeal(state, target);
  triggerUnitAbilities(state, target, { timing: 'onDeath', fallenUnit: target });
  getAliveUnits(state).forEach((unit) => {
    if (unit.id !== target.id) {
      triggerUnitAbilities(state, unit, { timing: 'onFallen', fallenUnit: target });
      if (target.unitClassTag === 'elemental' && hasAbility(unit, 'arc-conductor') && unit.side === target.side) {
        applyBlastSequence(state, unit, createRuntimeAbilityState(getAbility('arc-conductor-blast-8')), 8, target.occupiedHexes, new Set<string>());
      }
    }
  });
  bondedDependents.forEach((unit) =>
    handleEnvironmentalDeath(state, unit, 'bonded', getAbility('bonded').label, `${unit.troopLabel} is destroyed when its summoner falls.`, true),
  );
}

function loseHp(
  state: InternalState,
  target: InternalUnit,
  amount: number,
  effectId: string,
  effectLabel: string,
  sourceKind: BattleStepMetadata['sourceKind'],
  message: string,
): number {
  const hpLoss = fixedMax(amount, 0);
  if (hpLoss > 0) {
    target.hp = fixedSub(target.hp, hpLoss);
  }
  buildStep(state, 'attack', [], [target.id], message, {
    hpLoss,
    effect: 'hpLoss',
    sourceAbilityId: effectId,
    sourceAbilityLabel: effectLabel,
    sourceKind,
  });
  return hpLoss;
}

function chooseAttackTarget(state: InternalState, actor: InternalUnit, candidates: InternalUnit[]): InternalUnit {
  const legalCandidates = filterLegalNormalAttackTargets(actor, candidates);
  const targetCandidates = legalCandidates.length > 0 ? legalCandidates : candidates;
  if (hasAbility(actor, 'executioner')) {
    const lowestHp = Math.min(...targetCandidates.map((enemy) => enemy.hp));
    const lowest = targetCandidates.filter((enemy) => enemy.hp === lowestHp);
    return state.rng.pick(lowest);
  }
  return state.rng.pick(targetCandidates);
}

function canTargetWithNormalAttack(actor: InternalUnit, target: InternalUnit): boolean {
  return !hasAbility(target, 'honorable-duel') || target.engagedWith.has(actor.id);
}

function filterLegalNormalAttackTargets(actor: InternalUnit, candidates: InternalUnit[]): InternalUnit[] {
  return candidates.filter((target) => canTargetWithNormalAttack(actor, target));
}

function tryApplyGlamour(state: InternalState, actor: InternalUnit, target: InternalUnit, mode: 'melee' | 'ranged', category: AttackCategory): boolean {
  if (category !== 'normal' || target.glamourUsed || !hasAbility(target, 'glamour') || !isFae(target)) {
    return false;
  }
  const candidates = getAliveUnits(state)
    .filter((unit) => unit.side !== target.side && unit.id !== target.id)
    .filter((unit) => unitsInRange(target, unit));
  if (candidates.length === 0) {
    return false;
  }
  target.glamourUsed = true;
  const redirectedTarget = state.rng.pick(candidates);
  buildStep(state, 'buff', [target.id], [redirectedTarget.id], `${target.troopLabel} glamours the attack toward ${redirectedTarget.troopLabel}.`, {
    effect: 'glamour',
    sourceAbilityId: 'glamour',
    sourceAbilityLabel: getAbility('glamour').label,
  });
  attack(state, target, redirectedTarget, target.resolvedStats.range > 0 ? 'ranged' : mode, true, 0, 'normal');
  return true;
}

function resolveWagesOfVirtueRecipient(
  state: InternalState,
  target: InternalUnit,
  visitedUnitIds = new Set<string>(),
): InternalUnit {
  if (!hasAbility(target, 'wages-of-virtue') || visitedUnitIds.has(target.id)) {
    return target;
  }
  visitedUnitIds.add(target.id);
  const candidates = getAliveUnits(state, target.side)
    .filter((unit) => unit.id !== target.id && !visitedUnitIds.has(unit.id))
    .filter((unit) => unitsTouchOrOverlap(unit, target));
  if (candidates.length === 0) {
    return target;
  }
  const redirected = state.rng.pick(candidates);
  buildStep(state, 'buff', [target.id], [redirected.id], `${target.troopLabel} redirects damage to ${redirected.troopLabel}.`, {
    effect: 'wagesOfVirtueRedirect',
    sourceAbilityId: 'wages-of-virtue',
    sourceAbilityLabel: getAbility('wages-of-virtue').label,
  });
  return resolveWagesOfVirtueRecipient(state, redirected, visitedUnitIds);
}

function applyElementalSunder(state: InternalState, actor: InternalUnit, target: InternalUnit): void {
  if (actor.unitClassTag !== 'elemental' || !sideHasTroopClassUpgrade(state, actor.side, 'elementalist-crack-exploits') || !target.alive) {
    return;
  }
  applyStatDelta(state, actor, target, createRuntimeAbilityState(getAbility('elemental-sunder-1')), {
    kind: 'statDelta',
    stat: 'armor',
    amount: -1,
    mode: 'flat',
    disposition: 'harmful',
  });
}

function applyFinalHexStack(state: InternalState, actor: InternalUnit, target: InternalUnit): void {
  if (actor.unitClassTag !== 'shaman' || !hasAbility(actor, 'final-hex') || !target.alive) {
    return;
  }
  addHexStack(state, actor, target, 'final-hex');
}

function triggerOpening(
  state: InternalState,
  actor: InternalUnit,
  target: InternalUnit,
  openingChain: Set<string>,
): void {
  if (!hasAbility(actor, 'opening') || !target.alive) {
    return;
  }
  const pairKey = `${actor.id}->${target.id}`;
  if (openingChain.has(pairKey)) {
    return;
  }
  openingChain.add(pairKey);
  const allies = getAliveUnits(state, actor.side)
    .filter((unit) => unit.id !== actor.id && unitsTouchOrOverlap(unit, target))
    .filter((unit) => canTargetWithNormalAttack(unit, target));
  state.rng.shuffle(allies).forEach((ally) => {
    if (ally.alive && target.alive) {
      attack(state, ally, target, ally.resolvedStats.range > 0 ? 'ranged' : 'melee', true, 0, 'normal', 1, openingChain);
    }
  });
}

function applyStallWarts(state: InternalState, unit: InternalUnit): void {
  if (!unit.alive || !hasAbility(unit, 'stall-warts')) {
    return;
  }
  const runtime = createRuntimeAbilityState(getAbility('stall-warts'));
  applyStatDelta(state, unit, unit, runtime, {
    kind: 'statDelta',
    stat: 'armor',
    amount: 1,
    mode: 'flat',
    disposition: 'beneficial',
  });
  applyStatDelta(state, unit, unit, runtime, {
    kind: 'statDelta',
    stat: 'rate',
    amount: -1,
    mode: 'flat',
    disposition: 'harmful',
  });
}

function applyDiggyHoleEmergenceSlow(state: InternalState, dwarves: InternalUnit[]): void {
  const runtime = createRuntimeAbilityState(getAbility('diggy-hole'));
  dwarves.forEach((dwarf) => {
    const enemySide: SideId = dwarf.side === 'player' ? 'enemy' : 'player';
    getAliveUnits(state, enemySide).forEach((enemy) => {
      applyStatDelta(state, dwarf, enemy, runtime, {
        kind: 'statDelta',
        stat: 'rate',
        amount: -1,
        mode: 'flat',
        disposition: 'harmful',
      });
    });
  });
}

function attack(
  state: InternalState,
  actor: InternalUnit,
  target: InternalUnit,
  mode: 'melee' | 'ranged',
  allowOnAttackAbilities = true,
  strikeCount = 0,
  category: AttackCategory = 'normal',
  damageMultiplier = 1,
  openingChain = new Set<string>(),
): void {
  assertUnitLive(actor, 'attack/actor');
  assertUnitLive(target, 'attack/target');
  if (category === 'normal' && !canTargetWithNormalAttack(actor, target)) {
    return;
  }
  if (category === 'normal' && actor.unitClassTag === 'shaman' && hasAbility(actor, 'final-hex') && target.hexedStacks >= 5) {
    directKill(state, actor, target, 'final-hex');
    return;
  }
  if (tryApplyGlamour(state, actor, target, mode, category)) {
    return;
  }
  const attackContext: AttackContext = { mode, category };
  let attackDamage = fixedMul(actor.resolvedStats.damage, damageMultiplier);
  const throwingAxesDamage = hasAbility(actor, 'throwing-axes') ? fixedMul(target.hp, 0.1) : 0;
  attackDamage = fixedAdd(attackDamage, throwingAxesDamage);
  const hexingShotsDamage = hasAbility(actor, 'hexing-shots') ? target.hexedStacks : 0;
  attackDamage = fixedAdd(attackDamage, hexingShotsDamage);
  const distanceToTarget = unitFootprintDistance(actor, target);
  const heartseekerActive = hasAbility(actor, 'heartseeker') && target.engagedWith.size === 0;
  if (heartseekerActive) {
    attackDamage = fixedMul(attackDamage, 2);
  }
  const distanceBonus = getDistanceDamageBonus(actor, target, attackContext);
  attackDamage = fixedAdd(attackDamage, distanceBonus.damage);
  const armorReduction = 0;
  const armorAfterMods = fixedSub(target.resolvedStats.armor, armorReduction);
  const baseDamage = fixedSub(attackDamage, armorAfterMods);
  const modifiedDamage = mode === 'ranged' ? fixedMul(baseDamage, state.effects.rangedDamageMultiplier) : baseDamage;
  const shieldDrillDamageCap = mode === 'ranged' && hasAbility(target, 'shield-drill') ? 1 : null;
  const damage = fixedMax(shieldDrillDamageCap === null ? modifiedDamage : Math.min(modifiedDamage, shieldDrillDamageCap), 0);
  const damageRecipient = category === 'normal' && damage > 0 ? resolveWagesOfVirtueRecipient(state, target) : target;
  const damageRecipients = [damageRecipient];
  const damagePerRecipient = damage;
  const inflictedDamage = fixedSum(damageRecipients.map((recipient) => (canTakeDamage(recipient) ? damagePerRecipient : 0)));
  damageRecipients.forEach((recipient) => {
    if (canTakeDamage(recipient)) {
      recipient.hp = fixedSub(recipient.hp, damagePerRecipient);
    }
  });
  if (distanceBonus.readiness > 0) {
    actor.readiness = fixedAdd(actor.readiness, distanceBonus.readiness);
  }

  buildStep(
    state,
    'attack',
    [actor.id],
    damageRecipients.map((recipient) => recipient.id),
    `${actor.troopLabel} hits ${target.troopLabel} for ${formatFixed(inflictedDamage)}.`,
    {
    damage: inflictedDamage,
    mode,
    category,
    baseDamage: actor.resolvedStats.damage,
    attackDamageBeforeArmor: attackDamage,
    throwingAxesDamage: throwingAxesDamage || undefined,
    hexingShotsDamage: hexingShotsDamage || undefined,
    heartseekerMultiplier: heartseekerActive ? 2 : undefined,
    distanceBonus: distanceBonus.damage || undefined,
    armorBefore: target.resolvedStats.armor,
    armorReduction: armorReduction || undefined,
    armorApplied: armorAfterMods,
    rangedMultiplier: mode === 'ranged' ? state.effects.rangedDamageMultiplier : undefined,
    damageMultiplier: damageMultiplier !== 1 ? damageMultiplier : undefined,
    },
  );

  if (allowOnAttackAbilities) {
    triggerUnitAbilities(state, actor, { timing: 'onAttack', attackTarget: target });
  }

  if (category === 'normal') {
    applyElementalSunder(state, actor, target);
  }

  if (mode === 'melee' && hasAbility(actor, 'bramble-snare') && actor.brambleSnareStacks > 0 && target.alive) {
    applyStatDelta(state, actor, target, createRuntimeAbilityState(getAbility('bramble-snare')), {
      kind: 'statDelta',
      stat: 'rate',
      amount: actor.brambleSnareStacks * -2,
      mode: 'flat',
      disposition: 'harmful',
    });
  }

  if (mode === 'ranged' && hasAbility(actor, 'silver-distance') && distanceToTarget === actor.resolvedStats.range && target.alive) {
    applyReadinessDelta(state, actor, target, createRuntimeAbilityState(getAbility('silver-distance')), {
      kind: 'readinessDelta',
      amount: -30,
      disposition: 'harmful',
    });
  }

  damageRecipients.forEach((recipient) => {
    if (category === 'normal') {
      applyStallWarts(state, recipient);
    }
  });

  const deadRecipients = damageRecipients.filter((recipient) => recipient.hp <= 0 && recipient.alive);
  deadRecipients.forEach((recipient) => handleDeath(state, actor, recipient, attackContext));
  damageRecipients.forEach((recipient) => {
    if (recipient.alive && canTakeDamage(recipient)) {
      triggerUnitAbilities(state, recipient, { timing: 'onDamaged' });
      if (damagePerRecipient > 0) {
        applyWhimsy(state, recipient);
      }
    }
  });
  if (category === 'normal') {
    damageRecipients.forEach((recipient) => triggerDreamwork(state, actor, recipient));
  }
  if (category === 'normal' && inflictedDamage > 0 && target.alive) {
    applyFinalHexStack(state, actor, target);
    triggerOpening(state, actor, target, openingChain);
  }
  if (target.alive) {
    if (category === 'normal' && hasAbility(target, 'thornhide') && target.role === 'frontline' && target.resolvedStats.range === 0 && target.alive) {
      const thornDamage = canTakeDamage(actor) ? 6 : 0;
      if (thornDamage > 0) {
        actor.hp = fixedSub(actor.hp, thornDamage);
      }
      buildStep(state, 'attack', [target.id], [actor.id], `${target.troopLabel} thorns ${actor.troopLabel} for ${formatFixed(thornDamage)}.`, {
        damage: thornDamage,
        mode: 'blast',
        category: 'strike',
        baseDamage: 6,
        attackDamageBeforeArmor: 6,
        armorIgnored: true,
        sourceAbilityId: 'thornhide',
        sourceAbilityLabel: getAbility('thornhide').label,
      });
      if (actor.hp <= 0 && actor.alive) {
        handleDeath(state, target, actor, { mode: 'blast', category: 'strike' });
      }
    }
    if (category === 'normal' && hasAbility(target, 'retaliate') && target.alive && target.engagedWith.size > 0 && availableCapacity(state, target) === 0) {
      attack(state, target, actor, target.resolvedStats.range > 0 ? 'ranged' : 'melee', true, 0, 'retaliation');
    }
  }

  if (mode === 'ranged' && allowOnAttackAbilities && actor.alive && hasAbility(actor, 'skirmishers-step') && actor.engagedWith.size === 0) {
    skirmisherRetreat(state, actor);
  }

  const bonusStrikeCount =
    (category === 'normal' && actor.bonusStrikeCharges > 0 ? 1 : 0) +
    (category === 'normal' && mode === 'melee' && hasAbility(actor, 'dogpile') && target.engagedWith.size >= 3 ? 1 : 0);
  if (category === 'normal' && actor.bonusStrikeCharges > 0) {
    actor.bonusStrikeCharges -= 1;
  }
  if (bonusStrikeCount > 0 && target.alive) {
    strikeCount += bonusStrikeCount;
  }

  if (strikeCount > 0 && target.alive) {
    for (let i = 0; i < strikeCount; i += 1) {
      attack(state, actor, target, mode, false, 0, 'strike');
      if (!target.alive) {
        break;
      }
    }
  }
}

function triggerDreamwork(state: InternalState, actor: InternalUnit, target: InternalUnit): void {
  if (!actor.alive || !target.alive) {
    return;
  }
  const soldiers = getAliveUnits(state, actor.side)
    .filter((unit) => unit.id !== actor.id)
    .filter((unit) => hasAbility(unit, 'dreamwork'))
    .filter((unit) => !state.dreamworkTriggeredUnitIdsThisBeat.has(unit.id))
    .filter((unit) => unitsTouchOrOverlap(unit, target))
    .filter((unit) => canTargetWithNormalAttack(unit, target));
  state.rng.shuffle(soldiers).forEach((soldier) => {
    if (!soldier.alive || !target.alive || state.dreamworkTriggeredUnitIdsThisBeat.has(soldier.id)) {
      return;
    }
    state.dreamworkTriggeredUnitIdsThisBeat.add(soldier.id);
    attack(state, soldier, target, 'melee', true, 0, 'normal');
  });
}

function barrage(state: InternalState, actor: InternalUnit, targets: InternalUnit[]): boolean {
  const legalTargets = filterLegalNormalAttackTargets(actor, targets);
  if (!hasAbility(actor, 'barrage') || actor.engagedWith.size > 0 || legalTargets.length === 0) {
    return false;
  }
  state.rng.shuffle(legalTargets).forEach((target) => {
    if (actor.alive && target.alive && unitsInRange(actor, target)) {
      attack(state, actor, target, 'ranged', true, 0, 'normal', 0.6);
    }
  });
  return true;
}

function pileOn(state: InternalState, actor: InternalUnit): boolean {
  const candidates = touchingEnemies(state, actor);
  if (candidates.length === 0) {
    return false;
  }
  const prioritized = candidates.filter((enemy) =>
    getAliveUnits(state, actor.side)
      .filter((ally) => ally.id !== actor.id && unitsTouchOrOverlap(ally, actor))
      .some((ally) => ally.engagedWith.has(enemy.id)),
  );
  attack(state, actor, chooseAttackTarget(state, actor, prioritized.length > 0 ? prioritized : candidates), 'melee');
  return true;
}

function fight(state: InternalState, actor: InternalUnit): boolean {
  const engagedEnemies = [...actor.engagedWith]
    .map((enemyId) => state.units.get(enemyId))
    .filter((enemy): enemy is InternalUnit => Boolean(enemy?.alive));
  if (engagedEnemies.length > 0) {
    attack(state, actor, chooseAttackTarget(state, actor, engagedEnemies), 'melee');
    return true;
  }
  return pileOn(state, actor);
}

function drawAttention(state: InternalState, actor: InternalUnit, roles: RoleId[] = []): boolean {
  const engagedTargets = engageTouchingEnemies(state, actor, roles);

  if (engagedTargets.length > 0) {
    buildStep(state, 'engage', [actor.id], engagedTargets.map((target) => target.id), `${actor.troopLabel} engages enemies.`, {
      targetRole: engagedTargets[0]?.role,
      targetHexQ: engagedTargets[0]?.position.q,
      targetHexR: engagedTargets[0]?.position.r,
    });
  }

  return fight(state, actor) || engagedTargets.length > 0;
}

function validAdjacentMovementHexes(state: InternalState, actor: InternalUnit): HexCoord[] {
  return neighbors(actor.position)
    .filter((coord) => state.mapHexes.has(hexKey(coord)))
    .filter((coord) => isUnitAnchorLegal(state, actor, coord));
}

function validMovementHexes(state: InternalState, actor: InternalUnit): HexCoord[] {
  const maxSteps = Math.max(0, Math.floor(actor.resolvedStats.move));
  if (maxSteps <= 0) {
    return [];
  }
  return reachableAnchorsWithinMove(state, actor, maxSteps).map((entry) => entry.coord);
}

function moveUnitPreservingEngagements(unit: InternalUnit, destination: HexCoord): void {
  unit.position = { ...destination };
  recomputeFootprint(unit);
}

function isBlockedForMovement(state: InternalState, actor: InternalUnit, coord: HexCoord): boolean {
  return !isUnitAnchorLegal(state, actor, coord);
}

function getEnemyUnits(state: InternalState, actor: InternalUnit, roles: RoleId[] = []): InternalUnit[] {
  return getAliveUnits(state)
    .filter((unit) => unit.side !== actor.side)
    .filter((unit) => matchesRoleFilter(unit, roles));
}

function getAlliedBackline(state: InternalState, actor: InternalUnit): InternalUnit[] {
  return getAliveUnits(state, actor.side).filter((unit) => unit.id !== actor.id && unit.role === 'backline');
}

function pickNearestUnit(state: InternalState, actor: InternalUnit, candidates: InternalUnit[]): InternalUnit | null {
  if (candidates.length === 0) {
    return null;
  }
  const nearestDistance = Math.min(...candidates.map((candidate) => unitFootprintDistance(actor, candidate)));
  return state.rng.pick(candidates.filter((candidate) => unitFootprintDistance(actor, candidate) === nearestDistance));
}

function countTouchingFriendlyFrontline(state: InternalState, actor: InternalUnit, coord: HexCoord): number {
  return getAliveUnits(state, actor.side).filter((unit) => unit.id !== actor.id && unit.role === 'frontline' && unitAtAnchorTouchesUnit(actor, coord, unit)).length;
}

function countTouchingFriendlies(state: InternalState, actor: InternalUnit, coord: HexCoord): number {
  return getAliveUnits(state, actor.side).filter((unit) => unit.id !== actor.id && unitAtAnchorTouchesUnit(actor, coord, unit)).length;
}

function pickRandomHex(state: InternalState, candidates: HexCoord[]): HexCoord {
  return candidates.length === 1 ? candidates[0]! : state.rng.pick(candidates);
}

function pickBestMovementHex(
  state: InternalState,
  actor: InternalUnit,
  candidates: HexCoord[],
  scoreHex: (coord: HexCoord) => number,
): HexCoord | null {
  if (candidates.length === 0) {
    return null;
  }

  const scored = candidates.map((coord) => ({
    coord,
    score: scoreHex(coord),
    friendlyOccupancy: countTouchingFriendlies(state, actor, coord),
  }));
  const bestScore = Math.max(...scored.map((entry) => entry.score));
  const bestScoreCandidates = scored.filter((entry) => entry.score === bestScore);
  const lowestOccupancy = Math.min(...bestScoreCandidates.map((entry) => entry.friendlyOccupancy));
  const finalists = bestScoreCandidates
    .filter((entry) => entry.friendlyOccupancy === lowestOccupancy)
    .map((entry) => entry.coord);
  return pickRandomHex(state, finalists);
}

function reachableAnchorsWithinMove(
  state: InternalState,
  actor: InternalUnit,
  maxSteps: number,
  includeBlockedDestinations = false,
): Array<{ coord: HexCoord; steps: number }> {
  const startKey = hexKey(actor.position);
  const visited = new Set<string>([startKey]);
  const reachable: Array<{ coord: HexCoord; steps: number }> = [];
  const queue: Array<{ coord: HexCoord; steps: number }> = [{ coord: actor.position, steps: 0 }];
  while (queue.length > 0) {
    const current = queue.shift()!;
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

function footprintCollidesAny(footprint: HexCoord[], footprints: HexCoord[][]): boolean {
  return footprints.some((other) => footprintsCollide(footprint, other));
}

type FrontlinePushCandidate = {
  anchor: HexCoord;
  steps: number;
  pushed: Array<{ unit: InternalUnit; destination: HexCoord; footprint: HexCoord[]; steps: number }>;
  engagedSize: number;
  newlyEngagedCount: number;
  reasonCode: string;
};

function findPushedEnemyDestination(
  state: InternalState,
  enemy: InternalUnit,
  actorFootprint: HexCoord[],
  occupiedFootprints: HexCoord[][],
  maxSteps: number,
): { destination: HexCoord; footprint: HexCoord[]; steps: number } | null {
  const visited = new Set<string>([hexKey(enemy.position)]);
  const queue: Array<{ coord: HexCoord; steps: number }> = [{ coord: enemy.position, steps: 0 }];
  const candidates: Array<{ destination: HexCoord; footprint: HexCoord[]; steps: number; contactDistance: number }> = [];

  while (queue.length > 0) {
    const current = queue.shift()!;
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
  const selected = candidates[0]!;
  return { destination: selected.destination, footprint: selected.footprint, steps: selected.steps };
}

function buildFrontlinePushCandidate(
  state: InternalState,
  actor: InternalUnit,
  anchor: HexCoord,
  steps: number,
  preEngaged: InternalUnit[],
): FrontlinePushCandidate | null {
  const actorFootprint = footprintForUnitAt(actor, anchor);
  const preEngagedIds = new Set(preEngaged.map((enemy) => enemy.id));
  const blockingEnemies = getAliveUnits(state)
    .filter((unit) => unit.side !== actor.side)
    .filter((unit) => footprintsCollide(actorFootprint, unit.occupiedHexes));
  if (blockingEnemies.some((enemy) => !preEngagedIds.has(enemy.id) || enemy.resolvedStats.size >= actor.resolvedStats.size)) {
    return null;
  }

  const pushedIds = new Set(blockingEnemies.map((enemy) => enemy.id));
  const fixedFootprints = getAliveUnits(state)
    .filter((unit) => unit.id !== actor.id && !pushedIds.has(unit.id))
    .map((unit) => unit.occupiedHexes);
  if (footprintCollidesAny(actorFootprint, fixedFootprints)) {
    return null;
  }

  const pushed: FrontlinePushCandidate['pushed'] = [];
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

  const footprintForEnemy = (enemy: InternalUnit) => pushed.find((entry) => entry.unit.id === enemy.id)?.footprint ?? enemy.occupiedHexes;
  if (!preEngaged.every((enemy) => footprintsTouchOrOverlap(actorFootprint, footprintForEnemy(enemy)))) {
    return null;
  }

  const touchingEnemies = getAliveUnits(state)
    .filter((unit) => unit.side !== actor.side)
    .filter((enemy) => footprintsTouchOrOverlap(actorFootprint, footprintForEnemy(enemy)));
  const engagedSize = Math.min(actor.resolvedStats.capacity, fixedSum(touchingEnemies.map((enemy) => enemy.resolvedStats.size)));
  const newlyEngagedCount = touchingEnemies.filter((enemy) => !preEngagedIds.has(enemy.id)).length;
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
    reasonCode: pushed.length > 0 ? 'frontline-push-through' : 'frontline-reposition-capacity',
  };
}

function tryFrontlinePushThrough(state: InternalState, actor: InternalUnit): boolean {
  if (actor.role !== 'frontline' || actor.engagedWith.size === 0 || availableCapacity(state, actor) <= 0 || actor.resolvedStats.move <= 0) {
    return false;
  }
  const preEngaged = [...actor.engagedWith]
    .map((enemyId) => state.units.get(enemyId))
    .filter((enemy): enemy is InternalUnit => Boolean(enemy?.alive));
  if (preEngaged.length === 0) {
    return false;
  }

  const candidates = reachableAnchorsWithinMove(state, actor, actor.resolvedStats.move, true)
    .map((entry) => buildFrontlinePushCandidate(state, actor, entry.coord, entry.steps, preEngaged))
    .filter((candidate): candidate is FrontlinePushCandidate => Boolean(candidate));
  if (candidates.length === 0) {
    return false;
  }

  candidates.sort(
    (left, right) =>
      right.engagedSize - left.engagedSize ||
      right.newlyEngagedCount - left.newlyEngagedCount ||
      left.steps - right.steps ||
      left.pushed.length - right.pushed.length ||
      left.anchor.r - right.anchor.r ||
      left.anchor.q - right.anchor.q,
  );
  const selected = candidates[0]!;
  selected.pushed.forEach((push) => moveUnitPreservingEngagements(push.unit, push.destination));
  moveUnitPreservingEngagements(actor, selected.anchor);
  clearStaleEngagements(state);
  getAliveUnits(state)
    .filter((unit) => unit.side !== actor.side && !actor.engagedWith.has(unit.id) && unitsTouchOrOverlap(actor, unit))
    .sort((left, right) => left.resolvedStats.size - right.resolvedStats.size || left.id.localeCompare(right.id))
    .forEach((enemy) => {
      if (enemy.resolvedStats.size <= availableCapacity(state, actor)) {
        createEngagement(state, actor, enemy);
      }
    });
  buildStep(
    state,
    'move',
    [actor.id],
    selected.pushed.map((push) => push.unit.id),
    selected.pushed.length > 0 ? `${actor.troopLabel} pushes through the melee.` : `${actor.troopLabel} repositions to hold more enemies.`,
    {
      reasonCode: selected.reasonCode,
      toQ: actor.position.q,
      toR: actor.position.r,
      pushedUnitIds: selected.pushed.map((push) => push.unit.id),
      engagedSize: selected.engagedSize,
      newlyEngagedCount: selected.newlyEngagedCount,
    },
  );
  return true;
}

function tryPusherBreakthrough(state: InternalState, actor: InternalUnit): boolean {
  if (actor.role !== 'pusher' || actor.engagedWith.size === 0) {
    return false;
  }
  const candidates = [...actor.engagedWith]
    .map((enemyId) => state.units.get(enemyId))
    .filter((enemy): enemy is InternalUnit => Boolean(enemy?.alive))
    .filter((enemy) => enemy.resolvedStats.size < actor.resolvedStats.size)
    .filter((enemy) =>
      getAliveUnits(state, actor.side).some((ally) => ally.id !== actor.id && ally.engagedWith.has(enemy.id)),
    );
  if (candidates.length === 0) {
    return false;
  }
  const target = chooseAttackTarget(state, actor, candidates);
  actor.engagedWith.delete(target.id);
  target.engagedWith.delete(actor.id);
  actor.committedBacklineTargetId = null;
  buildStep(state, 'move', [actor.id], [target.id], `${actor.troopLabel} breaks through ${target.troopLabel}.`, {
    reasonCode: 'pusher-breakthrough',
    targetRole: target.role,
    targetHexQ: target.position.q,
    targetHexR: target.position.r,
  });
  return true;
}

function allStateMapHexes(state: InternalState): HexCoord[] {
  return hexSetToCoords(state.mapHexes);
}

function randomLegalRelocationHex(state: InternalState, actor: InternalUnit): HexCoord | null {
  const candidates = allStateMapHexes(state).filter((coord) => !equalsHex(coord, actor.position) && isUnitAnchorLegal(state, actor, coord));
  if (candidates.length === 0) {
    return null;
  }
  return pickRandomHex(state, candidates);
}

function applyWhimsy(state: InternalState, actor: InternalUnit): void {
  if (!actor.alive || !hasAbility(actor, 'whimsy') || !isFae(actor)) {
    return;
  }
  const destination = randomLegalRelocationHex(state, actor);
  if (!destination) {
    return;
  }
  relocateUnit(state, actor, destination);
  buildStep(state, 'move', [actor.id], [], `${actor.troopLabel} is carried away by Whimsy.`, {
    effect: 'whimsy',
    sourceAbilityId: 'whimsy',
    sourceAbilityLabel: getAbility('whimsy').label,
    toQ: actor.position.q,
    toR: actor.position.r,
  });
}

function getScreenPriority(state: InternalState, actor: InternalUnit, candidate: InternalUnit): number {
  const alliedBackline = getAlliedBackline(state, actor);
  if (alliedBackline.length === 0) {
    return unitFootprintDistance(actor, candidate);
  }
  const backlineDistance = Math.min(...alliedBackline.map((unit) => unitFootprintDistance(unit, candidate)));
  const actorDistance = unitFootprintDistance(actor, candidate);
  return backlineDistance * 100 + actorDistance;
}

function formatRoleIntentMessage(roleIntent: RoleIntentId): string {
  return {
    'screen-frontline': 'screens the front',
    'fallback-backline': 'falls through to the backline',
    'breach-backline': 'breaches toward the backline',
    'hold-backline': 'holds pressure on the backline',
    'retreat-range': 'retreats to preserve range',
    'advance-range': 'advances to keep range',
  }[roleIntent];
}

type RoleObjective = {
  target: InternalUnit;
  roleIntent: RoleIntentId;
  reasonCode: string;
  targetRole: RoleId;
};

function pickFrontlineObjective(state: InternalState, actor: InternalUnit): RoleObjective | null {
  const screeningTargets = getEnemyUnits(state, actor, ['frontline', 'pusher']);
  if (screeningTargets.length > 0) {
    const bestPriority = Math.min(...screeningTargets.map((target) => getScreenPriority(state, actor, target)));
    const priorityTiedTargets = screeningTargets.filter((target) => getScreenPriority(state, actor, target) === bestPriority);
    const target = pickNearestUnit(state, actor, priorityTiedTargets)!;
    return {
      target,
      roleIntent: 'screen-frontline',
      reasonCode: 'block-access',
      targetRole: target.role,
    };
  }
  const backlineTarget = pickNearestUnit(state, actor, getEnemyUnits(state, actor, ['backline']));
  if (!backlineTarget) {
    return null;
  }
  return {
    target: backlineTarget,
    roleIntent: 'fallback-backline',
    reasonCode: 'no-frontline-target',
    targetRole: backlineTarget.role,
  };
}

function pickPusherObjective(state: InternalState, actor: InternalUnit): RoleObjective | null {
  const committedTarget = actor.committedBacklineTargetId ? state.units.get(actor.committedBacklineTargetId) : null;
  if (committedTarget?.alive && committedTarget.side !== actor.side && committedTarget.role === 'backline') {
    return {
      target: committedTarget,
      roleIntent: 'hold-backline',
      reasonCode: 'maintain-backline-commitment',
      targetRole: committedTarget.role,
    };
  }
  const backlineTarget = pickNearestUnit(state, actor, getEnemyUnits(state, actor, ['backline']));
  if (backlineTarget) {
    actor.committedBacklineTargetId = backlineTarget.id;
    return {
      target: backlineTarget,
      roleIntent: 'breach-backline',
      reasonCode: 'opened-backline-lane',
      targetRole: backlineTarget.role,
    };
  }
  actor.committedBacklineTargetId = null;
  const fallbackTarget = pickNearestUnit(state, actor, getEnemyUnits(state, actor));
  if (!fallbackTarget) {
    return null;
  }
  return {
    target: fallbackTarget,
    roleIntent: 'screen-frontline',
    reasonCode: 'no-backline-target',
    targetRole: fallbackTarget.role,
  };
}

function findClosestEnemy(state: InternalState, actor: InternalUnit, preferredRoles: RoleId[], nonEngagedOnly: boolean): InternalUnit | null {
  const enemies = getAliveUnits(state).filter(
    (unit) =>
      unit.side !== actor.side &&
      (preferredRoles.length === 0 || preferredRoles.includes(unit.role)) &&
      (!nonEngagedOnly || unit.engagedWith.size === 0),
  );
  if (enemies.length === 0) {
    return null;
  }
  return pickNearestUnit(state, actor, enemies);
}

function moveToward(
  state: InternalState,
  actor: InternalUnit,
  target: InternalUnit,
  roleIntent?: RoleIntentId,
  reasonCode?: string,
  targetRole?: RoleId,
): boolean {
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
      nonEngagedEnemies: enemiesHere.filter((unit) => unit.engagedWith.size === 0).length,
    };
  });
  const progressMoves = scored.filter((entry) => entry.distance < currentDistance);
  const pool = progressMoves.length > 0 ? progressMoves : scored;
  const minDistance = Math.min(...pool.map((entry) => entry.distance));
  const byDistance = pool.filter((entry) => entry.distance === minDistance);
  const minEnemies = Math.min(...byDistance.map((entry) => entry.nonEngagedEnemies));
  let finalists = byDistance.filter((entry) => entry.nonEngagedEnemies === minEnemies);
  if (actor.role === 'frontline' && roleIntent === 'fallback-backline' && finalists.length > 1) {
    const minFrontlineSupport = Math.min(...finalists.map((entry) => countTouchingFriendlyFrontline(state, actor, entry.coord)));
    finalists = finalists.filter((entry) => countTouchingFriendlyFrontline(state, actor, entry.coord) === minFrontlineSupport);
  }
  const selected = state.rng.pick(finalists);
  if (equalsHex(selected.coord, actor.position)) {
    return false;
  }
  const blockedPreference = neighbors(actor.position)
    .filter((coord) => state.mapHexes.has(hexKey(coord)))
    .filter((coord) => isBlockedForMovement(state, actor, coord))
    .map((coord) => {
      const enemiesHere = getAliveUnits(state).filter((unit) => unit.side !== actor.side && unitAtAnchorTouchesUnit(actor, coord, unit));
      return {
        coord,
        distance: unitDistanceFromAnchor(actor, coord, target),
        nonEngagedEnemies: enemiesHere.filter((unit) => unit.engagedWith.size === 0).length,
      };
    })
    .filter((entry) => entry.distance < currentDistance)
    .filter((entry) => entry.distance < selected.distance || (entry.distance === selected.distance && entry.nonEngagedEnemies < selected.nonEngagedEnemies))
    .filter((entry) => hexDistance(entry.coord, selected.coord) === 1)
    .sort((a, b) => a.distance - b.distance || a.nonEngagedEnemies - b.nonEngagedEnemies)[0]?.coord;
  relocateUnit(state, actor, selected.coord);
  const routeMetadata =
    blockedPreference && hexDistance(blockedPreference, actor.position) === 1
      ? {
          routedAroundBlockedQ: blockedPreference.q,
          routedAroundBlockedR: blockedPreference.r,
        }
      : {};
  if (roleIntent && reasonCode && targetRole) {
    emitRoleIntentStep(state, 'move', actor, [target], `${actor.troopLabel} ${formatRoleIntentMessage(roleIntent)}.`, {
      roleIntent,
      reasonCode,
      targetRole,
      targetHexQ: target.position.q,
      targetHexR: target.position.r,
      toQ: actor.position.q,
      toR: actor.position.r,
      ...routeMetadata,
    });
  } else {
    buildStep(state, 'move', [actor.id], [], `${actor.troopLabel} moves.`, { toQ: actor.position.q, toR: actor.position.r, ...routeMetadata });
  }
  return true;
}

function enemiesInRange(state: InternalState, actor: InternalUnit): InternalUnit[] {
  return filterLegalNormalAttackTargets(
    actor,
    getAliveUnits(state).filter((enemy) => enemy.side !== actor.side && unitsInRange(actor, enemy)),
  );
}

function nearestEnemyDistance(state: InternalState, actor: InternalUnit): number | null {
  const enemies = getEnemyUnits(state, actor);
  if (enemies.length === 0) {
    return null;
  }
  return Math.min(...enemies.map((enemy) => unitFootprintDistance(actor, enemy)));
}

function engageObjective(state: InternalState, actor: InternalUnit, objective: RoleObjective): boolean {
  const preferredRoles = objective.targetRole === 'backline' ? ['backline'] : ['frontline', 'pusher'];
  if (touchingEnemies(state, actor).some((enemy) => matchesRoleFilter(enemy, preferredRoles))) {
    const engagedTargets = engageTouchingEnemies(state, actor, preferredRoles, actor.role === 'pusher');
    if (engagedTargets.length > 0) {
      emitRoleIntentStep(state, 'engage', actor, engagedTargets, `${actor.troopLabel} ${formatRoleIntentMessage(objective.roleIntent)}.`, {
        roleIntent: objective.roleIntent,
        reasonCode: objective.reasonCode,
        targetRole: objective.targetRole,
        targetHexQ: objective.target.position.q,
        targetHexR: objective.target.position.r,
      });
      if (actor.role === 'pusher' && tryPusherBreakthrough(state, actor)) {
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
    const engagedTargets = engageTouchingEnemies(state, actor, preferredRoles, actor.role === 'pusher');
    if (engagedTargets.length > 0) {
      emitRoleIntentStep(state, 'engage', actor, engagedTargets, `${actor.troopLabel} ${formatRoleIntentMessage(objective.roleIntent)}.`, {
        roleIntent: objective.roleIntent,
        reasonCode: objective.reasonCode,
        targetRole: objective.targetRole,
        targetHexQ: objective.target.position.q,
        targetHexR: objective.target.position.r,
      });
      if (actor.role === 'pusher' && tryPusherBreakthrough(state, actor)) {
        return true;
      }
    }
    return fight(state, actor) || engagedTargets.length > 0 || moved;
  }
  return drawAttention(state, actor) || moved;
}

function scoreRetreatHex(state: InternalState, actor: InternalUnit, coord: HexCoord): number {
  const enemies = getEnemyUnits(state, actor);
  if (enemies.length === 0) {
    return 0;
  }
  const nearestEnemy = Math.min(...enemies.map((enemy) => unitDistanceFromAnchor(actor, coord, enemy)));
  const totalEnemyDistance = enemies.reduce((sum, enemy) => sum + unitDistanceFromAnchor(actor, coord, enemy), 0);
  return nearestEnemy * 100 + totalEnemyDistance;
}

function retreatFromEngagement(
  state: InternalState,
  actor: InternalUnit,
  threat: InternalUnit | null,
  message: string,
  effect: string,
  requireEnemyInRange = false,
): boolean {
  const options = validMovementHexes(state, actor).filter(
    (coord) =>
      getAliveUnits(state).filter((unit) => unit.side !== actor.side && unitAtAnchorTouchesUnit(actor, coord, unit)).length === 0 &&
      (!requireEnemyInRange || getEnemyUnits(state, actor).some((enemy) => unitDistanceFromAnchor(actor, coord, enemy) <= actor.resolvedStats.range)),
  );
  if (options.length === 0) {
    return false;
  }
  const selected = pickBestMovementHex(state, actor, options, (coord) => scoreRetreatHex(state, actor, coord));
  if (!selected) {
    return false;
  }
  relocateUnit(state, actor, selected);
  buildStep(state, 'move', [actor.id], threat ? [threat.id] : [], message, {
    effect,
    toQ: actor.position.q,
    toR: actor.position.r,
    sourceAbilityId:
      effect === 'skirmishersStep' ? 'skirmishers-step' : effect === 'fadeIntoShadow' ? 'fade-into-shadow' : undefined,
    sourceAbilityLabel:
      effect === 'skirmishersStep'
        ? getAbility('skirmishers-step').label
        : effect === 'fadeIntoShadow'
          ? getAbility('fade-into-shadow').label
          : undefined,
  });
  return true;
}

function skirmisherRetreat(state: InternalState, actor: InternalUnit): boolean {
  const nearestThreat = pickNearestUnit(state, actor, getEnemyUnits(state, actor));
  return retreatFromEngagement(
    state,
    actor,
    nearestThreat,
    `${actor.troopLabel} steps back to keep a firing lane.`,
    'skirmishersStep',
    true,
  );
}

function retreat(state: InternalState, actor: InternalUnit): boolean {
  const target = pickNearestUnit(state, actor, getEnemyUnits(state, actor));
  const options = validMovementHexes(state, actor).filter(
    (coord) => getAliveUnits(state).filter((unit) => unit.side !== actor.side && unitAtAnchorTouchesUnit(actor, coord, unit)).length === 0,
  );
  if (options.length > 0) {
    const selected = pickBestMovementHex(state, actor, options, (coord) => scoreRetreatHex(state, actor, coord));
    if (!selected) {
      return false;
    }
    relocateUnit(state, actor, selected);
    if (target) {
      emitRoleIntentStep(state, 'move', actor, [target], `${actor.troopLabel} retreats to preserve range.`, {
        roleIntent: 'retreat-range',
        reasonCode: 'increase-threat-distance',
        targetRole: target.role,
        targetHexQ: target.position.q,
        targetHexR: target.position.r,
        toQ: actor.position.q,
        toR: actor.position.r,
      });
    } else {
      buildStep(state, 'move', [actor.id], [], `${actor.troopLabel} retreats.`, { toQ: actor.position.q, toR: actor.position.r });
    }
    return true;
  }
  const sameHexEnemies = touchingEnemies(state, actor);
  if (sameHexEnemies.length > 0) {
    attack(state, actor, chooseAttackTarget(state, actor, sameHexEnemies), 'melee');
    return true;
  }
  return false;
}

function carefulAdvance(state: InternalState, actor: InternalUnit): boolean {
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
    (coord) => currentDistance - unitDistanceFromAnchor(actor, coord, target),
  );
  if (!selected) {
    return false;
  }
  relocateUnit(state, actor, selected);
  emitRoleIntentStep(state, 'move', actor, [target], `${actor.troopLabel} advances to keep range.`, {
    roleIntent: 'advance-range',
    reasonCode: 'maintain-firing-lane',
    targetRole: target.role,
    targetHexQ: target.position.q,
    targetHexR: target.position.r,
    toQ: actor.position.q,
    toR: actor.position.r,
  });
  return true;
}

function applyQuakes(state: InternalState): void {
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
    buildStep(state, 'move', [unit.id], [], `${unit.troopLabel} is displaced by quakes.`, {
      effect: 'quakes',
      sourceAbilityId: 'quakes',
      sourceAbilityLabel: getMutator('quakes').label,
      sourceKind: 'mutator',
      toQ: unit.position.q,
      toR: unit.position.r,
    });
  });
}

function applyDecay(state: InternalState): void {
  if (state.effects.hpLossPerBeat <= 0) {
    return;
  }

  getAliveUnits(state).forEach((unit) => {
    loseHp(
      state,
      unit,
      state.effects.hpLossPerBeat,
      'decay',
      getMutator('decay').label,
      'mutator',
      `${unit.troopLabel} loses ${formatFixed(state.effects.hpLossPerBeat)} HP to Decay.`,
    );
    if (unit.hp <= 0 && unit.alive) {
      handleEnvironmentalDeath(state, unit, 'decay', getMutator('decay').label, `${unit.troopLabel} is consumed by Decay.`, true, 'mutator');
    }
  });
}

function spawnPendingDiggyHoleUnits(state: InternalState): void {
  if (state.beatCount !== 10) {
    return;
  }

  (['player', 'enemy'] as SideId[]).forEach((side) => {
    const pending = state.pendingDiggyHoleCombatants[side];
    if (pending.length === 0) {
      return;
    }

    const before = new Set(state.units.keys());
    const placementSide: SideId = side === 'player' ? 'enemy' : 'player';
    state.mapHexes = placeUnitsForSideWithMapExpansion(side, pending, state.units, state.mapHexes, state.rng, placementSide);
    state.pendingDiggyHoleCombatants[side] = [];
    const spawned = [...state.units.values()].filter((unit) => !before.has(unit.id));
    spawned.forEach((unit) => {
      applyMutatorAdjustmentsToUnit(unit, state.effects);
      unit.readiness = fixedMax(unit.readiness, 100);
      registerAliveUnit(state, unit);
    });
    buildStep(
      state,
      'move',
      spawned.map((unit) => unit.id),
      [],
      `Diggy Hole opens beneath enemy lines for ${side === 'player' ? 'player' : 'enemy'} Dwarves.`,
      {
        effect: 'diggyHole',
        sourceAbilityId: 'diggy-hole',
        sourceAbilityLabel: getAbility('diggy-hole').label,
      },
    );
    applyDiggyHoleEmergenceSlow(state, spawned);
  });

  applyCopiousAle(state);
}

function combatantWasBrought(input: BattleInput, side: SideId, raceId: string): boolean {
  const combatants = side === 'player' ? input.playerCombatants : input.enemyCombatants;
  return combatants.some((combatant) => combatant.raceId === raceId);
}

function applyChangeling(state: InternalState): void {
  if (state.beatCount !== 12) {
    return;
  }
  (['player', 'enemy'] as SideId[]).forEach((side) => {
    if (state.changelingTriggeredSides.has(side) || !sideHasRaceUpgrade(state, side, 'fae-changeling') || !combatantWasBrought(state.input, side, 'fae')) {
      return;
    }
    const enemySide: SideId = side === 'player' ? 'enemy' : 'player';
    const byTroop = new Map<string, InternalUnit[]>();
    getAliveUnits(state, enemySide).forEach((unit) => {
      const key = unit.troopInstanceId ?? unit.troopLabel;
      byTroop.set(key, [...(byTroop.get(key) ?? []), unit]);
    });
    const changed: InternalUnit[] = [];
    byTroop.forEach((units) => {
      const unit = state.rng.pick(units);
      removeAllEngagements(state, unit);
      transferAliveUnitSide(state, unit, side);
      unit.committedBacklineTargetId = null;
      unit.readiness = 0;
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
        'buff',
        [],
        changed.map((unit) => unit.id),
        `Changeling turns ${changed.length} enemy ${changed.length === 1 ? 'unit' : 'units'}.`,
        {
          effect: 'changeling',
          sourceAbilityId: 'changeling',
          sourceAbilityLabel: getAbility('changeling').label,
        },
      );
    }
  });
}

function applyBeatMutators(state: InternalState): void {
  spawnPendingDiggyHoleUnits(state);
  applyChangeling(state);
  applyQuakes(state);
  applyDecay(state);
}

function executeTurnActions(state: InternalState, actor: InternalUnit): void {
  clearStaleEngagements(state);
  if (actor.committedBacklineTargetId) {
    const committedTarget = state.units.get(actor.committedBacklineTargetId);
    if (!committedTarget?.alive || committedTarget.side === actor.side || committedTarget.role !== 'backline') {
      actor.committedBacklineTargetId = null;
    }
  }
  const engagedEnemies = [...actor.engagedWith]
    .map((enemyId) => state.units.get(enemyId))
    .filter((enemy): enemy is InternalUnit => Boolean(enemy?.alive));
  if (engagedEnemies.length > 0) {
    if (actor.role === 'frontline' && tryFrontlinePushThrough(state, actor)) {
      return;
    }
    if (actor.role === 'pusher' && tryPusherBreakthrough(state, actor)) {
      const remainingEngagedEnemies = [...actor.engagedWith]
        .map((enemyId) => state.units.get(enemyId))
        .filter((enemy): enemy is InternalUnit => Boolean(enemy?.alive));
      if (remainingEngagedEnemies.length > 0) {
        attack(state, actor, chooseAttackTarget(state, actor, remainingEngagedEnemies), 'melee');
        return;
      }
    } else {
      attack(state, actor, chooseAttackTarget(state, actor, engagedEnemies), 'melee');
      return;
    }
  }

  if (actor.role === 'pusher') {
    const sameHexEnemies = touchingEnemies(state, actor);
    if (sameHexEnemies.length > 0) {
      const engagedTargets = engageTouchingEnemies(state, actor, [], true);
      if (engagedTargets.length > 0) {
        buildStep(state, 'engage', [actor.id], engagedTargets.map((target) => target.id), `${actor.troopLabel} engages enemies.`, {
          reasonCode: 'pusher-contact-engage',
          targetRole: engagedTargets[0]?.role,
          targetHexQ: engagedTargets[0]?.position.q,
          targetHexR: engagedTargets[0]?.position.r,
        });
      }
      const preferredTargets = sameHexEnemies.filter((enemy) => enemy.role === 'backline');
      attack(state, actor, chooseAttackTarget(state, actor, preferredTargets.length > 0 ? preferredTargets : sameHexEnemies), 'melee');
      return;
    }
    const objective = pickPusherObjective(state, actor);
    if (objective) {
      engageObjective(state, actor, objective);
    }
    return;
  }

  if (engagedEnemies.length > 0) {
    attack(state, actor, chooseAttackTarget(state, actor, engagedEnemies), 'melee');
    return;
  }

  if (actor.role === 'frontline') {
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
    if (barrage(state, actor, inRange)) {
      return;
    }
    attack(state, actor, chooseAttackTarget(state, actor, inRange), 'ranged');
    return;
  }
  carefulAdvance(state, actor);
}

function executeTurn(state: InternalState, actor: InternalUnit): void {
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
      handleEnvironmentalDeath(state, actor, 'berserk', getAbility('berserk').label, `${actor.troopLabel} burns out after going berserk.`, true);
    }
  }
  state.currentTurnUnitId = null;
}

function isBattleOver(state: InternalState): boolean {
  const playerPresent = getAliveUnits(state, 'player').length > 0 || hasPendingDiggyHoleUnits(state, 'player');
  const enemyPresent = getAliveUnits(state, 'enemy').length > 0 || hasPendingDiggyHoleUnits(state, 'enemy');
  return !playerPresent || !enemyPresent;
}

export function resolveBattle(rawInput: BattleInput): BattleReplay {
  const input = normalizeBattleInput(rawInput);
  const seed = input.seed ?? randomSeed();
  const rng = createRng(seed);
  const init = initializeUnits(input, rng);
  const state: InternalState = {
    units: init.units,
    aliveUnitIds: createAliveIndex(init.units),
    pendingDiggyHoleCombatants: init.pendingDiggyHoleCombatants,
    copiousAleAppliedTroopKeys: new Set<string>(),
    corpses: new Map<string, HexCoord>(),
    summonedProfiles: new Map<string, ReplayTroopProfile>(),
    steps: [],
    dirtyUnitIds: new Set<string>(),
    snapshotCache: new Map<string, BattleUnit>(),
    mapRadius: init.mapRadius,
    mapHexes: new Set(init.mapHexes.map(hexKey)),
    rng,
    beatCount: 0,
    effects: buildEffects(input.mutatorIds),
    replayId: makeReplayId(seed, input.riftId),
    input,
    currentTurnUnitId: null,
    changelingTriggeredSides: new Set<SideId>(),
    pendingGraveVigorBlocks: [],
    distinctTypeCache: new Map<SideId, string[]>(),
    dreamworkTriggeredUnitIdsThisBeat: new Set<string>(),
    crackExploitsDepth: 0,
  };
  state.units.forEach((unit) => applyMutatorAdjustmentsToUnit(unit, state.effects));
  assertAliveIndexValid(state);

  const troopLabels = Object.fromEntries(
    [...input.playerCombatants, ...input.enemyCombatants].map((combatant) => [combatant.combatantId, combatant.label]),
  );
  const initial = cloneSnapshot(state.units);
  state.snapshotCache = new Map(initial.units.map((unit) => [unit.id, cloneBattleUnit(unit)]));
  executeStartOfBattleAbilities(state);
  applyCopiousAle(state);
  applyStartOfBattleStackSeeds(state);

  while (!isBattleOver(state) && state.beatCount < MAX_BEATS) {
    state.beatCount += 1;
    state.dreamworkTriggeredUnitIdsThisBeat.clear();
    getAliveUnits(state).forEach((unit) => {
      unit.readiness = fixedAdd(unit.readiness, fixedAdd(unit.resolvedStats.rate, state.effects.readinessBonusPerBeat));
    });
    buildStep(state, 'beat', [], [], `Beat ${state.beatCount}: readiness increases for all units.`, {
      beat: state.beatCount,
      readinessBonus: state.effects.readinessBonusPerBeat,
    });
    applyBeatMutators(state);
    const ready = getAliveUnits(state).filter((unit) => unit.readiness >= 100).map((unit) => unit.id);
    state.rng.shuffle(ready).forEach((unitId) => {
      const unit = state.units.get(unitId);
      if (!unit?.alive) {
        return;
      }
      unit.readiness = fixedSub(unit.readiness, 100);
      executeTurn(state, unit);
    });
  }
  assertAliveIndexValid(state);

  const steps = materializeRecordedSteps(initial, state.steps);
  const snapshots = [initial, ...steps.map((step) => step.snapshot)];
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
    steps,
    outcome: resolveBattleOutcome(state),
    troopLabels,
    troopProfiles: buildTroopProfiles(input, state.summonedProfiles, state.effects),
    aliveCounts: snapshots.map(createAliveCount),
    summary: {
      playerTroops: input.playerCombatants.map((combatant) => combatant.label),
      enemyTroops: input.enemyCombatants.map((combatant) => combatant.label),
      finalPlayerAlive: finalCounts.player,
      finalEnemyAlive: finalCounts.enemy,
    },
  };
}
