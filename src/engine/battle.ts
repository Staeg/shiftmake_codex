import { equalsHex, hexDistance, hexKey, inRadius, neighbors } from './hex';
import { fixed, fixedAdd, fixedClamp, fixedMax, fixedMul, fixedSub, fixedSum, formatFixed } from './fixed';
import { createRng, type Rng } from './rng';
import { getMutator, getTroopDefinitionOrThrow } from './unitCatalog';
import type {
  AbilityDefinition,
  BattleInput,
  BattleReplay,
  ReplayTroopProfile,
  BattleStateSnapshot,
  BattleStep,
  BattleStepKind,
  HexCoord,
  ResolvedCombatantDefinition,
  RoleId,
  SideId,
} from './types';
import type { BattleDebugInput } from './debugTypes';

type InternalUnit = {
  id: string;
  troopInstanceId: string | null;
  troopLabel: string;
  unitTypeId: string;
  factionId: string;
  side: SideId;
  role: RoleId;
  types: string[];
  position: HexCoord;
  hp: number;
  maxHp: number;
  initiative: number;
  alive: boolean;
  engagedWith: Set<string>;
  resolvedStats: {
    health: number;
    damage: number;
    speed: number;
    range: number;
    armor: number;
    size: number;
    capacity: number;
  };
  resolvedAbilities: AbilityDefinition[];
};

interface InternalState {
  units: Map<string, InternalUnit>;
  steps: BattleStep[];
  mapRadius: number;
  saturation: number;
  rng: Rng;
  beatCount: number;
  effects: {
    initiativeBonusPerBeat: number;
    rangedDamageMultiplier: number;
  };
  replayId: string;
  input: BattleInput;
}

interface SpawnContext {
  units: Map<string, InternalUnit>;
  rng: Rng;
  saturation: number;
}

const BASE_MAP_RADIUS = 3;
const SATURATION = 10;
const MAX_BEATS = 1000;

function randomSeed(): number {
  return (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0;
}

function makeReplayId(seed: number, riftId: string | null): string {
  return `${riftId ?? 'debug'}-${seed}`;
}

function buildEffects(mutatorIds: string[]): InternalState['effects'] {
  return mutatorIds.reduce(
    (effects, mutatorId) => {
      const definition = getMutator(mutatorId);
      return {
        initiativeBonusPerBeat: effects.initiativeBonusPerBeat + (definition.initiativeBonusPerBeat ?? 0),
        rangedDamageMultiplier: effects.rangedDamageMultiplier * (definition.rangedDamageMultiplier ?? 1),
      };
    },
    { initiativeBonusPerBeat: 0, rangedDamageMultiplier: 1 },
  );
}

function cloneSnapshot(units: Map<string, InternalUnit>): BattleStateSnapshot {
  return {
    units: [...units.values()].map((unit) => ({
      id: unit.id,
      troopInstanceId: unit.troopInstanceId,
      troopId: `${unit.factionId}/${unit.unitTypeId}`,
      troopLabel: unit.troopLabel,
      unitTypeId: unit.unitTypeId,
      factionId: unit.factionId,
      side: unit.side,
      role: unit.role,
      types: [...unit.types],
      position: { ...unit.position },
      hp: fixed(unit.hp),
      maxHp: fixed(unit.maxHp),
      initiative: fixed(unit.initiative),
      alive: unit.alive,
      engagedWithIds: [...unit.engagedWith],
    })),
  };
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

function buildTroopProfiles(input: BattleInput): ReplayTroopProfile[] {
  const seen = new Set<string>();
  const profiles: ReplayTroopProfile[] = [];

  [...input.playerCombatants, ...input.enemyCombatants].forEach((combatant) => {
    const key = `${combatant.side}:${combatant.label}`;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    profiles.push({
      side: combatant.side,
      troopLabel: combatant.label,
      unitTypeId: combatant.unitTypeId,
      factionId: combatant.factionId,
      role: combatant.role,
      types: [...combatant.types],
      stats: { ...combatant.stats },
      abilities: combatant.abilities.map((ability) => ({ ...ability })),
    });
  });

  return profiles;
}

function buildStep(
  state: InternalState,
  kind: BattleStepKind,
  actorIds: string[],
  targetIds: string[],
  message: string,
  metadata?: Record<string, number | string | boolean>,
): void {
  state.steps.push({
    index: state.steps.length,
    kind,
    actorIds,
    targetIds,
    message,
    metadata,
    snapshot: cloneSnapshot(state.units),
  });
}

function startingCorner(side: SideId, radius: number): HexCoord {
  return side === 'player' ? { q: -radius, r: 0 } : { q: radius, r: 0 };
}

function meleeStart(side: SideId, radius: number): HexCoord {
  return side === 'player' ? { q: -radius + 1, r: 0 } : { q: radius - 1, r: 0 };
}

function expandSpawnCells(
  side: SideId,
  origin: HexCoord,
  radius: number,
  activeCells: HexCoord[],
  forbidden: Set<string>,
): boolean {
  const enemyCorner = startingCorner(side === 'player' ? 'enemy' : 'player', radius);
  const originEnemyDistance = hexDistance(origin, enemyCorner);
  const frontier = new Map<string, HexCoord>();
  const baseCells = activeCells.length > 0 ? activeCells : [origin];

  baseCells.forEach((cell) => {
    neighbors(cell)
      .filter((neighbor) => inRadius(neighbor, radius))
      .forEach((neighbor) => {
        const key = hexKey(neighbor);
        if (forbidden.has(key) || activeCells.some((active) => equalsHex(active, neighbor))) {
          return;
        }
        frontier.set(key, neighbor);
      });
  });

  if (frontier.size === 0) {
    return false;
  }

  const candidates = [...frontier.values()];
  const bestDelta = Math.min(...candidates.map((cell) => Math.abs(hexDistance(cell, enemyCorner) - originEnemyDistance)));
  const nextCells = candidates.filter((cell) => Math.abs(hexDistance(cell, enemyCorner) - originEnemyDistance) === bestDelta);

  nextCells.forEach((cell) => {
    if (!activeCells.some((active) => equalsHex(active, cell))) {
      activeCells.push(cell);
    }
  });

  return nextCells.length > 0;
}

function placeUnitWithExpandableCells(
  combatant: ResolvedCombatantDefinition,
  side: SideId,
  origin: HexCoord,
  radius: number,
  activeCells: HexCoord[],
  context: SpawnContext,
  forbidden: Set<string>,
  occupancy: Map<string, number>,
): HexCoord | null {
  const size = combatant.stats.size;
  if (size > context.saturation) {
    return null;
  }

  while (true) {
    const candidates = activeCells
      .map((cell) => {
        const key = hexKey(cell);
        if (forbidden.has(key)) {
          return null;
        }
        const used = occupancy.get(key) ?? 0;
        if (fixedAdd(used, size) > context.saturation) {
          return null;
        }
        return { cell, used, utilization: fixed(used / context.saturation) };
      })
      .filter((item): item is { cell: HexCoord; used: number; utilization: number } => item !== null);

    if (candidates.length > 0) {
      const minUtilization = Math.min(...candidates.map((item) => item.utilization));
      const finalists = candidates.filter((item) => item.utilization === minUtilization);
      const minUsed = Math.min(...finalists.map((item) => item.used));
      const selected = context.rng.pick(finalists.filter((item) => item.used === minUsed)).cell;
      const key = hexKey(selected);
      occupancy.set(key, fixedAdd(occupancy.get(key) ?? 0, size));
      return selected;
    }

    if (!expandSpawnCells(side, origin, radius, activeCells, forbidden)) {
      return null;
    }
  }
}

function spawnGroup(
  side: SideId,
  combatants: ResolvedCombatantDefinition[],
  origin: HexCoord,
  radius: number,
  context: SpawnContext,
  forbidden: Set<string>,
): Set<string> | null {
  if (combatants.length === 0) {
    return new Set<string>();
  }

  const totalGroupSize = fixedSum(combatants.map((combatant) => combatant.stats.size));
  const targetCellCount = Math.max(1, Math.ceil(totalGroupSize / context.saturation));
  const activeCells: HexCoord[] = forbidden.has(hexKey(origin)) ? [] : [origin];
  const occupancy = new Map<string, number>();
  const usedHexes = new Set<string>();

  while (activeCells.length < targetCellCount) {
    if (!expandSpawnCells(side, origin, radius, activeCells, forbidden)) {
      break;
    }
  }

  combatants.forEach((combatant, index) => {
    const slot = placeUnitWithExpandableCells(combatant, side, origin, radius, activeCells, context, forbidden, occupancy);
    if (!slot) {
      throw new Error('Failed to spawn combatant');
    }

    const unitId = `${side}_${combatant.combatantId}_${index}`;
    usedHexes.add(hexKey(slot));
    context.units.set(unitId, {
      id: unitId,
      troopInstanceId: combatant.troopInstanceId,
      troopLabel: combatant.label,
      unitTypeId: combatant.unitTypeId,
      factionId: combatant.factionId,
      side,
      role: combatant.role,
      types: [...combatant.types],
      position: { ...slot },
      hp: combatant.stats.health,
      maxHp: combatant.stats.health,
      initiative: fixed(context.rng.int(11)),
      alive: true,
      engagedWith: new Set<string>(),
      resolvedStats: { ...combatant.stats },
      resolvedAbilities: combatant.abilities.map((ability) => ({ ...ability })),
    });
  });

  return usedHexes;
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

function spawnUnitsForSide(
  side: SideId,
  combatants: ResolvedCombatantDefinition[],
  radius: number,
  context: SpawnContext,
): boolean {
  const ranged = combatants.filter((combatant) => combatant.stats.range > 0);
  const melee = combatants.filter((combatant) => combatant.stats.range === 0);
  const meleeForbidden = new Set<string>();

  const rangedHexes = spawnGroup(side, ranged, startingCorner(side, radius), radius, context, new Set<string>());
  if (!rangedHexes) {
    return false;
  }
  rangedHexes.forEach((key) => meleeForbidden.add(key));
  const meleeHexes = spawnGroup(side, melee, meleeStart(side, radius), radius, context, meleeForbidden);
  return meleeHexes !== null;
}

function initializeUnits(input: BattleInput, rng: Rng): { units: Map<string, InternalUnit>; mapRadius: number } {
  let radius = BASE_MAP_RADIUS;
  const playerUnits = expandCombatants(input.playerCombatants);
  const enemyUnits = expandCombatants(input.enemyCombatants);

  while (true) {
    const units = new Map<string, InternalUnit>();
    const context: SpawnContext = { units, rng, saturation: SATURATION };
    const playerOk = spawnUnitsForSide('player', playerUnits, radius, context);
    const enemyOk = playerOk && spawnUnitsForSide('enemy', enemyUnits, radius, context);
    if (playerOk && enemyOk) {
      return { units, mapRadius: radius };
    }
    radius += 1;
  }
}

function getAliveUnits(state: InternalState, side?: SideId): InternalUnit[] {
  return [...state.units.values()].filter((unit) => unit.alive && (!side || unit.side === side));
}

function resolveBattleOutcome(state: InternalState): 'victory' | 'defeat' | 'draw' {
  const playerAlive = getAliveUnits(state, 'player').length > 0;
  const enemyAlive = getAliveUnits(state, 'enemy').length > 0;
  if (playerAlive && !enemyAlive) return 'victory';
  if (!playerAlive && enemyAlive) return 'defeat';
  return 'draw';
}

function clearStaleEngagements(state: InternalState): void {
  state.units.forEach((unit) => {
    unit.engagedWith.forEach((enemyId) => {
      const enemy = state.units.get(enemyId);
      if (!enemy?.alive || !equalsHex(enemy.position, unit.position)) {
        unit.engagedWith.delete(enemyId);
      }
    });
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

function enemyUnitsOnHex(state: InternalState, unit: InternalUnit): InternalUnit[] {
  return getAliveUnits(state).filter((other) => other.side !== unit.side && equalsHex(other.position, unit.position));
}

function nonEngagedEnemiesOnHex(state: InternalState, unit: InternalUnit): InternalUnit[] {
  return enemyUnitsOnHex(state, unit).filter((enemy) => enemy.engagedWith.size === 0);
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
}

function matchesRoleFilter(unit: InternalUnit, roles: RoleId[]): boolean {
  return roles.length === 0 || roles.includes(unit.role);
}

function getDistinctFriendlyTroopLabels(state: InternalState, unit: InternalUnit): string[] {
  return [...new Set(getAliveUnits(state, unit.side).map((entry) => entry.troopLabel))];
}

function executeRamp(state: InternalState, actor: InternalUnit, amount: number): void {
  actor.resolvedStats.damage = fixedAdd(actor.resolvedStats.damage, amount);
  buildStep(state, 'buff', [actor.id], [], `${actor.troopLabel} gains +${formatFixed(amount)} damage.`, {
    amount,
    effect: 'ramp',
  });
}

function healUnit(state: InternalState, healer: InternalUnit, target: InternalUnit, amount: number): void {
  if (!target.alive || target.hp >= target.maxHp) {
    return;
  }
  const nextHp = fixedClamp(fixedAdd(target.hp, amount), 0, target.maxHp);
  const actual = fixedSub(nextHp, target.hp);
  if (actual <= 0) {
    return;
  }
  target.hp = nextHp;
  buildStep(state, 'heal', [healer.id], [target.id], `${healer.troopLabel} heals ${target.troopLabel} for ${formatFixed(actual)}.`, {
    amount: actual,
  });
}

function executeStartOfBattleAbilities(state: InternalState): void {
  getAliveUnits(state).forEach((unit) => {
    unit.resolvedAbilities.forEach((ability) => {
      if (ability.trigger !== 'startOfBattle' || ability.effect !== 'boost') {
        return;
      }
      if (ability.condition === 'forsaken') {
        const troopLabels = getDistinctFriendlyTroopLabels(state, unit);
        if (troopLabels.length > 1) {
          return;
        }
      }
      let repeats = 1;
      if (ability.repeatPerDistinctFriendlyTroopType) {
        repeats = Math.max(0, getDistinctFriendlyTroopLabels(state, unit).filter((label) => label !== unit.troopLabel).length);
      }
      if (repeats === 0) {
        return;
      }
      const multiplier = fixed(1 + ability.amount / 100 * repeats);
      unit.maxHp = fixedMul(unit.maxHp, multiplier);
      unit.hp = unit.maxHp;
      unit.resolvedStats.health = unit.maxHp;
      unit.resolvedStats.damage = fixedMul(unit.resolvedStats.damage, multiplier);
      unit.resolvedStats.speed = fixedClamp(fixedMul(unit.resolvedStats.speed, multiplier), 1, 100);
      buildStep(state, 'buff', [unit.id], [], `${unit.troopLabel} gains ${ability.label}.`, {
        effect: 'boost',
        multiplier,
        repeats,
      });
    });
  });
}

function executeEndOfTurnAbilities(state: InternalState, actor: InternalUnit): void {
  actor.resolvedAbilities.forEach((ability) => {
    if (ability.trigger === 'endOfTurn' && ability.effect === 'heal') {
      healUnit(state, actor, actor, ability.amount);
      return;
    }
    if (ability.trigger === 'endOfTurn' && ability.effect === 'ramp') {
      executeRamp(state, actor, ability.amount);
    }
  });
}

function executeOnKillAbilities(state: InternalState, actor: InternalUnit): void {
  actor.resolvedAbilities.forEach((ability) => {
    if (ability.trigger === 'onKill' && ability.effect === 'heal') {
      const radius = ability.radius ?? 0;
      getAliveUnits(state, actor.side)
        .filter((ally) => hexDistance(actor.position, ally.position) <= radius)
        .forEach((ally) => healUnit(state, actor, ally, ability.amount));
    }
  });
}

function executeOnDamagedAbilities(state: InternalState, actor: InternalUnit): void {
  actor.resolvedAbilities.forEach((ability) => {
    if (ability.trigger === 'onDamaged' && ability.effect === 'ramp') {
      executeRamp(state, actor, ability.amount);
    }
  });
}

function executeOnDeathAbilities(state: InternalState, target: InternalUnit): void {
  target.resolvedAbilities.forEach((ability) => {
    if (ability.trigger !== 'onDeath' || ability.effect !== 'strike') {
      return;
    }
    const enemies = getAliveUnits(state).filter((enemy) => enemy.side !== target.side && equalsHex(enemy.position, target.position));
    if (enemies.length === 0) {
      return;
    }
    const chosen = state.rng.pick(enemies);
    attack(state, target, chosen, 'melee', false, ability.amount);
  });
}

function getPackBonus(state: InternalState, actor: InternalUnit): number {
  return actor.resolvedAbilities.reduce((sum, ability) => {
    if (ability.effect !== 'pack') {
      return sum;
    }
    const allies = getAliveUnits(state, actor.side).filter((ally) => equalsHex(ally.position, actor.position));
    return sum + ability.amount * allies.length;
  }, 0);
}

function applyBlast(state: InternalState, actor: InternalUnit, target: InternalUnit): void {
  actor.resolvedAbilities.forEach((ability) => {
    if (ability.trigger !== 'onAttack' || ability.effect !== 'blast') {
      return;
    }
    getAliveUnits(state)
      .filter((enemy) => enemy.side !== actor.side && equalsHex(enemy.position, target.position))
      .forEach((enemy) => {
        const damage = fixedMax(ability.amount, 0);
        enemy.hp = fixedSub(enemy.hp, damage);
        buildStep(state, 'attack', [actor.id], [enemy.id], `${actor.troopLabel} splashes ${formatFixed(damage)} blast damage.`, {
          damage,
          mode: 'blast',
        });
        if (enemy.hp <= 0 && enemy.alive) {
          enemy.alive = false;
          enemy.hp = 0;
          removeAllEngagements(state, enemy);
          buildStep(state, 'knockout', [actor.id], [enemy.id], `${enemy.troopLabel} is knocked out.`);
          executeOnKillAbilities(state, actor);
          executeOnDeathAbilities(state, enemy);
        } else {
          executeOnDamagedAbilities(state, enemy);
        }
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
): void {
  const baseDamage = fixedSub(fixedAdd(actor.resolvedStats.damage, getPackBonus(state, actor)), target.resolvedStats.armor);
  const modifiedDamage = mode === 'ranged' ? fixedMul(baseDamage, state.effects.rangedDamageMultiplier) : baseDamage;
  const damage = fixedMax(modifiedDamage, 0);
  target.hp = fixedSub(target.hp, damage);

  buildStep(state, 'attack', [actor.id], [target.id], `${actor.troopLabel} hits ${target.troopLabel} for ${formatFixed(damage)}.`, {
    damage,
    mode,
  });

  if (allowOnAttackAbilities) {
    applyBlast(state, actor, target);
  }

  if (target.hp <= 0 && target.alive) {
    target.alive = false;
    target.hp = 0;
    removeAllEngagements(state, target);
    buildStep(state, 'knockout', [actor.id], [target.id], `${target.troopLabel} is knocked out.`);
    executeOnKillAbilities(state, actor);
    executeOnDeathAbilities(state, target);
  } else {
    executeOnDamagedAbilities(state, target);
  }

  if (strikeCount > 0 && target.alive) {
    for (let i = 0; i < strikeCount; i += 1) {
      attack(state, actor, target, mode, false, 0);
      if (!target.alive) {
        break;
      }
    }
  }
}

function pileOn(state: InternalState, actor: InternalUnit): boolean {
  const candidates = enemyUnitsOnHex(state, actor);
  if (candidates.length === 0) {
    return false;
  }
  const prioritized = candidates.filter((enemy) =>
    getAliveUnits(state, actor.side)
      .filter((ally) => ally.id !== actor.id && equalsHex(ally.position, actor.position))
      .some((ally) => ally.engagedWith.has(enemy.id)),
  );
  attack(state, actor, state.rng.pick(prioritized.length > 0 ? prioritized : candidates), 'melee');
  return true;
}

function fight(state: InternalState, actor: InternalUnit): boolean {
  const engagedEnemies = [...actor.engagedWith]
    .map((enemyId) => state.units.get(enemyId))
    .filter((enemy): enemy is InternalUnit => Boolean(enemy?.alive));
  if (engagedEnemies.length > 0) {
    attack(state, actor, state.rng.pick(engagedEnemies), 'melee');
    return true;
  }
  return pileOn(state, actor);
}

function drawAttention(state: InternalState, actor: InternalUnit, roles: RoleId[] = []): boolean {
  const currentHexEnemies = nonEngagedEnemiesOnHex(state, actor).filter((enemy) => matchesRoleFilter(enemy, roles));
  let remainingCapacity = availableCapacity(state, actor);
  const engagedTargets: InternalUnit[] = [];

  if (remainingCapacity > 0 && currentHexEnemies.length > 0) {
    state.rng.shuffle(currentHexEnemies).forEach((enemy) => {
      if (enemy.resolvedStats.size <= remainingCapacity && enemy.alive && enemy.engagedWith.size === 0) {
        createEngagement(state, actor, enemy);
        remainingCapacity = fixedSub(remainingCapacity, enemy.resolvedStats.size);
        engagedTargets.push(enemy);
      }
    });
  }

  if (engagedTargets.length > 0) {
    buildStep(state, 'engage', [actor.id], engagedTargets.map((target) => target.id), `${actor.troopLabel} engages enemies.`);
  }

  return fight(state, actor) || engagedTargets.length > 0;
}

function allySizeOnHex(state: InternalState, side: SideId, coord: HexCoord, exceptId?: string): number {
  return fixedSum(
    getAliveUnits(state, side)
      .filter((unit) => equalsHex(unit.position, coord) && unit.id !== exceptId)
      .map((unit) => unit.resolvedStats.size),
  );
}

function validMovementHexes(state: InternalState, actor: InternalUnit): HexCoord[] {
  return neighbors(actor.position)
    .filter((coord) => inRadius(coord, state.mapRadius))
    .filter((coord) => fixedAdd(allySizeOnHex(state, actor.side, coord, actor.id), actor.resolvedStats.size) <= state.saturation);
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
  return enemies.sort((a, b) => hexDistance(actor.position, a.position) - hexDistance(actor.position, b.position))[0] ?? null;
}

function moveToward(state: InternalState, actor: InternalUnit, target: InternalUnit): boolean {
  const options = validMovementHexes(state, actor);
  if (options.length === 0) {
    return false;
  }
  const currentDistance = hexDistance(actor.position, target.position);
  const scored = options.map((coord) => {
    const enemiesHere = getAliveUnits(state).filter((unit) => unit.side !== actor.side && equalsHex(unit.position, coord));
    return {
      coord,
      distance: hexDistance(coord, target.position),
      nonEngagedEnemies: enemiesHere.filter((unit) => unit.engagedWith.size === 0).length,
    };
  });
  const progressMoves = scored.filter((entry) => entry.distance < currentDistance);
  const pool = progressMoves.length > 0 ? progressMoves : scored;
  const minDistance = Math.min(...pool.map((entry) => entry.distance));
  const byDistance = pool.filter((entry) => entry.distance === minDistance);
  const minEnemies = Math.min(...byDistance.map((entry) => entry.nonEngagedEnemies));
  const selected = state.rng.pick(byDistance.filter((entry) => entry.nonEngagedEnemies === minEnemies));
  if (equalsHex(selected.coord, actor.position)) {
    return false;
  }
  removeAllEngagements(state, actor);
  actor.position = { ...selected.coord };
  buildStep(state, 'move', [actor.id], [], `${actor.troopLabel} moves.`, { toQ: actor.position.q, toR: actor.position.r });
  return true;
}

function enemiesInRange(state: InternalState, actor: InternalUnit): InternalUnit[] {
  return getAliveUnits(state).filter((enemy) => enemy.side !== actor.side && hexDistance(actor.position, enemy.position) <= actor.resolvedStats.range);
}

function pursue(state: InternalState, actor: InternalUnit, preferredRoles: RoleId[]): boolean {
  if (enemyUnitsOnHex(state, actor).some((enemy) => matchesRoleFilter(enemy, preferredRoles))) {
    return drawAttention(state, actor, preferredRoles);
  }
  const target = findClosestEnemy(state, actor, preferredRoles, false) ?? findClosestEnemy(state, actor, [], false);
  if (!target) {
    return false;
  }
  const moved = moveToward(state, actor, target);
  const enemiesOnCell = enemyUnitsOnHex(state, actor);
  if (enemiesOnCell.length === 0) {
    return moved;
  }
  if (enemiesOnCell.some((enemy) => matchesRoleFilter(enemy, preferredRoles))) {
    return drawAttention(state, actor, preferredRoles) || moved;
  }
  return drawAttention(state, actor) || moved;
}

function retreat(state: InternalState, actor: InternalUnit): boolean {
  const options = validMovementHexes(state, actor).filter(
    (coord) => getAliveUnits(state).filter((unit) => unit.side !== actor.side && equalsHex(unit.position, coord)).length === 0,
  );
  if (options.length > 0) {
    removeAllEngagements(state, actor);
    actor.position = { ...state.rng.pick(options) };
    buildStep(state, 'move', [actor.id], [], `${actor.troopLabel} retreats.`, { toQ: actor.position.q, toR: actor.position.r });
    return true;
  }
  const sameHexEnemies = enemyUnitsOnHex(state, actor);
  if (sameHexEnemies.length > 0) {
    attack(state, actor, state.rng.pick(sameHexEnemies), 'melee');
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
    const becomesCloser = hexDistance(coord, target.position) < hexDistance(actor.position, target.position);
    if (!becomesCloser) {
      return false;
    }
    const alliesOnTarget = getAliveUnits(state, actor.side).filter((ally) => equalsHex(ally.position, coord));
    return alliesOnTarget.every((ally) => ally.resolvedStats.range >= actor.resolvedStats.range);
  });
  if (options.length === 0) {
    return false;
  }
  removeAllEngagements(state, actor);
  actor.position = { ...state.rng.pick(options) };
  buildStep(state, 'move', [actor.id], [], `${actor.troopLabel} advances carefully.`, { toQ: actor.position.q, toR: actor.position.r });
  return true;
}

function executeTurnActions(state: InternalState, actor: InternalUnit): void {
  clearStaleEngagements(state);
  const engagedEnemies = [...actor.engagedWith]
    .map((enemyId) => state.units.get(enemyId))
    .filter((enemy): enemy is InternalUnit => Boolean(enemy?.alive));
  if (engagedEnemies.length > 0) {
    attack(state, actor, state.rng.pick(engagedEnemies), 'melee');
    return;
  }

  if (actor.role === 'frontline') {
    if (nonEngagedEnemiesOnHex(state, actor).length > 0) {
      drawAttention(state, actor);
      return;
    }
    pursue(state, actor, ['frontline', 'chaff']);
    return;
  }

  if (actor.role === 'chaff') {
    if (nonEngagedEnemiesOnHex(state, actor).length === 0) {
      pursue(state, actor, ['backline']);
      return;
    }
    pileOn(state, actor);
    return;
  }

  if (enemyUnitsOnHex(state, actor).length > 0) {
    retreat(state, actor);
    return;
  }
  const inRange = enemiesInRange(state, actor);
  if (inRange.length > 0) {
    attack(state, actor, state.rng.pick(inRange), 'ranged');
    return;
  }
  carefulAdvance(state, actor);
}

function executeTurn(state: InternalState, actor: InternalUnit): void {
  if (!actor.alive) {
    return;
  }
  executeTurnActions(state, actor);
  if (actor.alive) {
    executeEndOfTurnAbilities(state, actor);
  }
}

function isBattleOver(state: InternalState): boolean {
  return getAliveUnits(state, 'player').length === 0 || getAliveUnits(state, 'enemy').length === 0;
}

export function resolveBattle(input: BattleInput): BattleReplay {
  const seed = input.seed ?? randomSeed();
  const rng = createRng(seed);
  const init = initializeUnits(input, rng);
  const state: InternalState = {
    units: init.units,
    steps: [],
    mapRadius: init.mapRadius,
    saturation: SATURATION,
    rng,
    beatCount: 0,
    effects: buildEffects(input.mutatorIds),
    replayId: makeReplayId(seed, input.riftId),
    input,
  };

  const troopLabels = Object.fromEntries(
    [...input.playerCombatants, ...input.enemyCombatants].map((combatant) => [combatant.combatantId, combatant.label]),
  );
  const initial = cloneSnapshot(state.units);
  executeStartOfBattleAbilities(state);

  while (!isBattleOver(state) && state.beatCount < MAX_BEATS) {
    state.beatCount += 1;
    getAliveUnits(state).forEach((unit) => {
      unit.initiative = fixedAdd(unit.initiative, fixedAdd(unit.resolvedStats.speed, state.effects.initiativeBonusPerBeat));
    });
    buildStep(state, 'beat', [], [], `Beat ${state.beatCount}: initiative increases for all units.`, {
      beat: state.beatCount,
      initiativeBonus: state.effects.initiativeBonusPerBeat,
    });
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
    saturation: SATURATION,
    initial,
    steps: state.steps,
    outcome: resolveBattleOutcome(state),
    troopLabels,
    troopProfiles: buildTroopProfiles(input),
    aliveCounts: snapshots.map(createAliveCount),
    summary: {
      playerTroops: input.playerCombatants.map((combatant) => combatant.label),
      enemyTroops: input.enemyCombatants.map((combatant) => combatant.label),
      finalPlayerAlive: finalCounts.player,
      finalEnemyAlive: finalCounts.enemy,
    },
  };
}

export function resolveDebugBattle(input: BattleDebugInput): BattleReplay {
  const playerCombatants = Object.entries(input.player)
    .filter(([, quantity]) => quantity > 0)
    .map(([troopId, quantity]) => {
      const troop = getTroopDefinitionOrThrow(troopId);
      return {
        combatantId: `debug-player-${troopId}`,
        troopInstanceId: null,
        factionId: troop.factionId,
        unitTypeId: troop.unitTypeId,
        label: troop.label,
        role: troop.role,
        types: troop.types,
        stats: troop.stats,
        abilities: troop.abilities,
        quantity,
        cost: troop.cost,
        side: 'player' as const,
      };
    });
  const enemyCombatants = Object.entries(input.enemy)
    .filter(([, quantity]) => quantity > 0)
    .map(([troopId, quantity]) => {
      const troop = getTroopDefinitionOrThrow(troopId);
      return {
        combatantId: `debug-enemy-${troopId}`,
        troopInstanceId: null,
        factionId: troop.factionId,
        unitTypeId: troop.unitTypeId,
        label: troop.label,
        role: troop.role,
        types: troop.types,
        stats: troop.stats,
        abilities: troop.abilities,
        quantity,
        cost: troop.cost,
        side: 'enemy' as const,
      };
    });

  return resolveBattle({
    seed: input.seed ?? randomSeed(),
    riftId: null,
    tier: null,
    mutatorIds: [],
    playerCombatants,
    enemyCombatants,
  });
}

export function buildBattleInputFromResolvedCombatants(
  seed: number,
  riftId: string | null,
  tier: number | null,
  mutatorIds: string[],
  playerCombatants: ResolvedCombatantDefinition[],
  enemyCombatants: ResolvedCombatantDefinition[],
): BattleInput {
  return { seed, riftId, tier, mutatorIds, playerCombatants, enemyCombatants };
}
