import { equalsHex, hexDistance, hexKey, inRadius, neighbors } from './hex';
import { fixed, fixedAdd, fixedClamp, fixedMax, fixedSub, fixedSum, formatFixed } from './fixed';
import { createRng, type Rng } from './rng';
import { getTroopDefinitionOrThrow, TROOP_CATALOG } from './unitCatalog';
import type {
  BattleReplay,
  BattleStateSnapshot,
  BattleStep,
  BattleStepKind,
  BattleUnit,
  HexCoord,
  RoleId,
  SideId,
  TroopTypeId,
} from './types';
import type { BattleDebugInput } from './debugTypes';

type InternalUnit = BattleUnit & {
  engagedWith: Set<string>;
};

interface InternalState {
  units: Map<string, InternalUnit>;
  steps: BattleStep[];
  mapRadius: number;
  saturation: number;
  rng: Rng;
  beatCount: number;
}

interface SpawnContext {
  units: Map<string, InternalUnit>;
  rng: Rng;
  saturation: number;
}

const BASE_MAP_RADIUS = 3;
const SATURATION = 10;
const MAX_BEATS = 1000;

function troop(troopId: TroopTypeId) {
  return getTroopDefinitionOrThrow(troopId);
}

function cloneSnapshot(units: Map<string, InternalUnit>): BattleStateSnapshot {
  return {
    units: [...units.values()].map((unit) => ({
      id: unit.id,
      troopId: unit.troopId,
      unitTypeId: unit.unitTypeId,
      factionId: unit.factionId,
      side: unit.side,
      role: unit.role,
      position: { ...unit.position },
      hp: fixed(unit.hp),
      maxHp: fixed(unit.maxHp),
      initiative: fixed(unit.initiative),
      alive: unit.alive,
      engagedWithIds: [...unit.engagedWith],
    })),
  };
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

function randomSeed(): number {
  return (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0;
}

function toUnitList(selection: BattleDebugInput['player']): TroopTypeId[] {
  const troopIds: TroopTypeId[] = [];

  Object.entries(selection).forEach(([troopId, rawCount]) => {
    if (!(troopId in TROOP_CATALOG)) {
      return;
    }

    const count = Math.max(0, Math.floor(rawCount ?? 0));
    for (let i = 0; i < count; i += 1) {
      troopIds.push(troopId);
    }
  });

  return troopIds;
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
  const bestDelta = Math.min(
    ...candidates.map((cell) => Math.abs(hexDistance(cell, enemyCorner) - originEnemyDistance)),
  );

  const nextCells = candidates.filter(
    (cell) => Math.abs(hexDistance(cell, enemyCorner) - originEnemyDistance) === bestDelta,
  );

  nextCells.forEach((cell) => {
    if (!activeCells.some((active) => equalsHex(active, cell))) {
      activeCells.push(cell);
    }
  });

  return nextCells.length > 0;
}

function placeUnitWithExpandableCells(
  troopId: TroopTypeId,
  side: SideId,
  origin: HexCoord,
  radius: number,
  activeCells: HexCoord[],
  context: SpawnContext,
  forbidden: Set<string>,
  occupancy: Map<string, number>,
): HexCoord | null {
  const size = troop(troopId).stats.size;
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
        return {
          cell,
          used,
          utilization: fixed(used / context.saturation),
        };
      })
      .filter((item): item is { cell: HexCoord; used: number; utilization: number } => item !== null);

    if (candidates.length > 0) {
      const minUtilization = Math.min(...candidates.map((item) => item.utilization));
      const utilizationFinalists = candidates.filter((item) => item.utilization === minUtilization);
      const minUsed = Math.min(...utilizationFinalists.map((item) => item.used));
      const finalists = utilizationFinalists.filter((item) => item.used === minUsed);
      const selected = context.rng.pick(finalists).cell;
      const key = hexKey(selected);
      occupancy.set(key, fixedAdd(occupancy.get(key) ?? 0, size));
      return selected;
    }

    const expanded = expandSpawnCells(side, origin, radius, activeCells, forbidden);
    if (!expanded) {
      return null;
    }
  }
}

function spawnGroup(
  side: SideId,
  troopIds: TroopTypeId[],
  origin: HexCoord,
  radius: number,
  context: SpawnContext,
  idCounter: { value: number },
  forbidden: Set<string>,
): Set<string> | null {
  if (troopIds.length === 0) {
    return new Set<string>();
  }

  const totalGroupSize = fixedSum(troopIds.map((troopId) => troop(troopId).stats.size));
  const targetCellCount = Math.max(1, Math.ceil(totalGroupSize / context.saturation));
  const activeCells: HexCoord[] = forbidden.has(hexKey(origin)) ? [] : [origin];
  const occupancy = new Map<string, number>();
  const usedHexes = new Set<string>();

  while (activeCells.length < targetCellCount) {
    const expanded = expandSpawnCells(side, origin, radius, activeCells, forbidden);
    if (!expanded) {
      break;
    }
  }

  for (const troopId of troopIds) {
    const slot = placeUnitWithExpandableCells(troopId, side, origin, radius, activeCells, context, forbidden, occupancy);
    if (!slot) {
      return null;
    }

    const definition = troop(troopId);
    const unitId = `${side}_${definition.factionId}_${definition.unitTypeId}_${idCounter.value}`;
    idCounter.value += 1;
    usedHexes.add(hexKey(slot));

    context.units.set(unitId, {
      id: unitId,
      troopId,
      unitTypeId: definition.unitTypeId,
      factionId: definition.factionId,
      side,
      role: definition.role,
      position: { ...slot },
      hp: definition.stats.health,
      maxHp: definition.stats.health,
      initiative: fixed(context.rng.int(11)),
      alive: true,
      engagedWith: new Set<string>(),
    });
  }

  return usedHexes;
}

function spawnUnitsForSide(
  side: SideId,
  troopIds: TroopTypeId[],
  radius: number,
  context: SpawnContext,
  idCounter: { value: number },
): boolean {
  const ranged = troopIds.filter((troopId) => troop(troopId).stats.range > 0);
  const melee = troopIds.filter((troopId) => troop(troopId).stats.range === 0);
  const meleeForbidden = new Set<string>();

  const rangedHexes = spawnGroup(side, ranged, startingCorner(side, radius), radius, context, idCounter, new Set<string>());
  if (!rangedHexes) {
    return false;
  }
  rangedHexes.forEach((key) => meleeForbidden.add(key));

  const meleeHexes = spawnGroup(side, melee, meleeStart(side, radius), radius, context, idCounter, meleeForbidden);
  return meleeHexes !== null;
}

function initializeUnits(
  playerUnits: TroopTypeId[],
  enemyUnits: TroopTypeId[],
  rng: Rng,
): { units: Map<string, InternalUnit>; mapRadius: number } {
  let radius = BASE_MAP_RADIUS;

  while (true) {
    const units = new Map<string, InternalUnit>();
    const idCounter = { value: 0 };
    const context: SpawnContext = {
      units,
      rng,
      saturation: SATURATION,
    };

    const playerOk = spawnUnitsForSide('player', playerUnits, radius, context, idCounter);
    const enemyOk = playerOk && spawnUnitsForSide('enemy', enemyUnits, radius, context, idCounter);

    if (playerOk && enemyOk) {
      return {
        units,
        mapRadius: radius,
      };
    }

    radius += 1;
  }
}

function getAliveUnits(state: InternalState, side?: SideId): InternalUnit[] {
  return [...state.units.values()].filter((unit) => unit.alive && (side ? unit.side === side : true));
}

function resolveBattleOutcome(state: InternalState): 'victory' | 'defeat' | 'draw' {
  const playerAlive = getAliveUnits(state, 'player').length > 0;
  const enemyAlive = getAliveUnits(state, 'enemy').length > 0;
  if (playerAlive && !enemyAlive) {
    return 'victory';
  }
  if (!playerAlive && enemyAlive) {
    return 'defeat';
  }
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
      .map((enemy) => troop(enemy.troopId).stats.size),
  );
  return fixedMax(fixedSub(troop(unit.troopId).stats.capacity, used), 0);
}

function enemyUnitsOnHex(state: InternalState, unit: InternalUnit): InternalUnit[] {
  return getAliveUnits(state).filter((other) => other.side !== unit.side && equalsHex(other.position, unit.position));
}

function nonEngagedEnemiesOnHex(state: InternalState, unit: InternalUnit): InternalUnit[] {
  return enemyUnitsOnHex(state, unit).filter((enemy) => enemy.engagedWith.size === 0);
}

function removeAllEngagements(state: InternalState, unit: InternalUnit): void {
  const enemyIds = [...unit.engagedWith];
  enemyIds.forEach((enemyId) => {
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
      const enemySize = troop(enemy.troopId).stats.size;
      if (enemySize <= remainingCapacity && enemy.alive && enemy.engagedWith.size === 0) {
        createEngagement(state, actor, enemy);
        remainingCapacity = fixedSub(remainingCapacity, enemySize);
        engagedTargets.push(enemy);
      }
    });
  }

  if (engagedTargets.length > 0) {
    buildStep(
      state,
      'engage',
      [actor.id],
      engagedTargets.map((target) => target.id),
      `${actor.id} engages ${engagedTargets.length} enemy unit(s).`,
    );
  }

  return fight(state, actor) || engagedTargets.length > 0;
}

function allySizeOnHex(state: InternalState, side: SideId, coord: HexCoord, exceptId?: string): number {
  return fixedSum(
    getAliveUnits(state, side)
      .filter((unit) => equalsHex(unit.position, coord) && unit.id !== exceptId)
      .map((unit) => troop(unit.troopId).stats.size),
  );
}

function validMovementHexes(state: InternalState, actor: InternalUnit): HexCoord[] {
  const adjacent = neighbors(actor.position).filter((coord) => inRadius(coord, state.mapRadius));
  const size = troop(actor.troopId).stats.size;
  return adjacent.filter((coord) => fixedAdd(allySizeOnHex(state, actor.side, coord, actor.id), size) <= state.saturation);
}

function findClosestEnemy(
  state: InternalState,
  actor: InternalUnit,
  preferredRoles: RoleId[],
  nonEngagedOnly: boolean,
): InternalUnit | null {
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
    const distance = hexDistance(coord, target.position);
    const enemiesHere = getAliveUnits(state).filter((unit) => unit.side !== actor.side && equalsHex(unit.position, coord));
    const nonEngagedEnemies = enemiesHere.filter((unit) => unit.engagedWith.size === 0).length;
    return {
      coord,
      distance,
      nonEngagedEnemies,
    };
  });

  const progressMoves = scored.filter((item) => item.distance < currentDistance);
  const distancePool = progressMoves.length > 0 ? progressMoves : scored;

  const minDistance = Math.min(...distancePool.map((item) => item.distance));
  const byDistance = distancePool.filter((item) => item.distance === minDistance);
  const minEnemies = Math.min(...byDistance.map((item) => item.nonEngagedEnemies));
  const finalists = byDistance.filter((item) => item.nonEngagedEnemies === minEnemies);

  const selected = state.rng.pick(finalists);
  if (equalsHex(selected.coord, actor.position)) {
    return false;
  }

  removeAllEngagements(state, actor);
  actor.position = { ...selected.coord };
  buildStep(state, 'move', [actor.id], [], `${actor.id} moves.`, {
    toQ: actor.position.q,
    toR: actor.position.r,
  });
  return true;
}

function enemiesInRange(state: InternalState, actor: InternalUnit): InternalUnit[] {
  const range = troop(actor.troopId).stats.range;
  return getAliveUnits(state).filter((enemy) => enemy.side !== actor.side && hexDistance(actor.position, enemy.position) <= range);
}

function healUnit(state: InternalState, healer: InternalUnit, target: InternalUnit, amount: number): void {
  if (!target.alive || target.hp >= target.maxHp) {
    return;
  }
  const newHp = fixedClamp(fixedAdd(target.hp, amount), 0, target.maxHp);
  const actual = fixedSub(newHp, target.hp);
  if (actual <= 0) {
    return;
  }
  target.hp = newHp;
  buildStep(
    state,
    'heal',
    [healer.id],
    [target.id],
    `${healer.id} heals ${target.id} for ${formatFixed(actual)}.`,
    { amount: actual },
  );
}

function executeEndOfTurnAbilities(state: InternalState, actor: InternalUnit): void {
  troop(actor.troopId).abilities.forEach((ability) => {
    if (ability.trigger !== 'endOfTurn' || ability.baselineId !== 'heal') {
      return;
    }
    if (ability.target.kind === 'self') {
      healUnit(state, actor, actor, ability.amount);
    } else if (ability.target.kind === 'friendlyInRangeMostDamaged') {
      const allies = getAliveUnits(state, actor.side);
      if (allies.length === 0) {
        return;
      }
      const mostDamaged = allies.sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
      if (mostDamaged) {
        healUnit(state, actor, mostDamaged, ability.amount);
      }
    }
  });
}

function executeOnKillAbilities(state: InternalState, actor: InternalUnit): void {
  troop(actor.troopId).abilities.forEach((ability) => {
    if (ability.trigger !== 'onKill' || ability.baselineId !== 'heal') {
      return;
    }
    if (ability.target.kind === 'area') {
      const radius = ability.target.radius ?? 0;
      getAliveUnits(state, actor.side)
        .filter((ally) => hexDistance(actor.position, ally.position) <= radius)
        .forEach((ally) => healUnit(state, actor, ally, ability.amount));
    }
  });
}

function attack(state: InternalState, actor: InternalUnit, target: InternalUnit, mode: 'melee' | 'ranged'): void {
  const damage = fixedMax(fixedSub(troop(actor.troopId).stats.damage, troop(target.troopId).stats.armor), 0);
  target.hp = fixedSub(target.hp, damage);

  buildStep(
    state,
    'attack',
    [actor.id],
    [target.id],
    `${actor.id} hits ${target.id} for ${formatFixed(damage)}.`,
    {
      damage,
      mode,
    },
  );

  if (target.hp <= 0 && target.alive) {
    target.alive = false;
    target.hp = 0;
    removeAllEngagements(state, target);
    buildStep(state, 'knockout', [actor.id], [target.id], `${target.id} is knocked out.`);
    executeOnKillAbilities(state, actor);
  }
}

function pileOn(state: InternalState, actor: InternalUnit): boolean {
  const candidates = enemyUnitsOnHex(state, actor);
  if (candidates.length === 0) {
    return false;
  }

  const prioritized = candidates.filter((enemy) => {
    const allies = getAliveUnits(state, actor.side).filter((ally) => ally.id !== actor.id && equalsHex(ally.position, actor.position));
    return allies.some((ally) => ally.engagedWith.has(enemy.id));
  });

  const targetPool = prioritized.length > 0 ? prioritized : candidates;
  attack(state, actor, state.rng.pick(targetPool), 'melee');
  return true;
}

function pursue(state: InternalState, actor: InternalUnit, preferredRoles: RoleId[]): boolean {
  const enemiesBeforeMove = enemyUnitsOnHex(state, actor);
  if (enemiesBeforeMove.some((enemy) => matchesRoleFilter(enemy, preferredRoles))) {
    return drawAttention(state, actor, preferredRoles);
  }

  const preferredTarget = findClosestEnemy(state, actor, preferredRoles, false);
  const target = preferredTarget ?? findClosestEnemy(state, actor, [], false);
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

  return drawAttention(state, actor, []) || moved;
}

function overrun(state: InternalState, actor: InternalUnit, preferredRoles: RoleId[]): boolean {
  if (nonEngagedEnemiesOnHex(state, actor).length > 0) {
    return false;
  }
  return pursue(state, actor, preferredRoles);
}

function retreat(state: InternalState, actor: InternalUnit): boolean {
  const options = validMovementHexes(state, actor).filter((coord) => {
    const enemies = getAliveUnits(state).filter((unit) => unit.side !== actor.side && equalsHex(unit.position, coord));
    return enemies.length === 0;
  });

  if (options.length > 0) {
    removeAllEngagements(state, actor);
    actor.position = { ...state.rng.pick(options) };
    buildStep(state, 'move', [actor.id], [], `${actor.id} retreats.`, {
      toQ: actor.position.q,
      toR: actor.position.r,
    });
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

  const ownRange = troop(actor.troopId).stats.range;
  const options = validMovementHexes(state, actor).filter((coord) => {
    const becomesCloser = hexDistance(coord, target.position) < hexDistance(actor.position, target.position);
    if (!becomesCloser) {
      return false;
    }
    const alliesOnTarget = getAliveUnits(state, actor.side).filter((ally) => equalsHex(ally.position, coord));
    return alliesOnTarget.every((ally) => troop(ally.troopId).stats.range >= ownRange);
  });

  if (options.length === 0) {
    return false;
  }

  removeAllEngagements(state, actor);
  actor.position = { ...state.rng.pick(options) };
  buildStep(state, 'move', [actor.id], [], `${actor.id} advances carefully.`, {
    toQ: actor.position.q,
    toR: actor.position.r,
  });
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
    overrun(state, actor, ['frontline', 'chaff']);
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
  const playerAlive = getAliveUnits(state, 'player').length;
  const enemyAlive = getAliveUnits(state, 'enemy').length;
  return playerAlive === 0 || enemyAlive === 0;
}

export function resolveDebugBattle(input: BattleDebugInput): BattleReplay {
  const seed = input.seed ?? randomSeed();
  const rng = createRng(seed);
  const playerUnits = toUnitList(input.player);
  const enemyUnits = toUnitList(input.enemy);

  const init = initializeUnits(playerUnits, enemyUnits, rng);

  const state: InternalState = {
    units: init.units,
    steps: [],
    mapRadius: init.mapRadius,
    saturation: SATURATION,
    rng,
    beatCount: 0,
  };

  const initial = cloneSnapshot(state.units);

  while (!isBattleOver(state) && state.beatCount < MAX_BEATS) {
    state.beatCount += 1;

    getAliveUnits(state).forEach((unit) => {
      unit.initiative = fixedAdd(unit.initiative, troop(unit.troopId).stats.speed);
    });

    buildStep(state, 'beat', [], [], `Beat ${state.beatCount}: initiative increases for all units.`, {
      beat: state.beatCount,
    });

    const ready = getAliveUnits(state)
      .filter((unit) => unit.initiative >= 100)
      .map((unit) => unit.id);

    const order = state.rng.shuffle(ready);

    order.forEach((unitId) => {
      const unit = state.units.get(unitId);
      if (!unit?.alive) {
        return;
      }
      unit.initiative = fixedSub(unit.initiative, 100);
      executeTurn(state, unit);
    });
  }

  return {
    seed,
    mapRadius: state.mapRadius,
    saturation: SATURATION,
    initial,
    steps: state.steps,
    outcome: resolveBattleOutcome(state),
  };
}
