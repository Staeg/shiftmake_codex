import { equalsHex, hexDistance, hexKey, inRadius, neighbors } from './hex';
import { fixed, fixedAdd, fixedClamp, fixedMax, fixedMul, fixedSub, fixedSum, formatFixed } from './fixed';
import { createRng } from './rng';
import { composeBaseTroopDefinition, composeSummonedTroopDefinition, getMutator, getTroopDefinitionOrThrow } from './unitCatalog';
const BASE_MAP_RADIUS = 3;
const DEFAULT_SATURATION = 10;
const MAX_BEATS = 1000;
function randomSeed() {
    return (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0;
}
function makeReplayId(seed, riftId) {
    return `${riftId ?? 'debug'}-${seed}`;
}
function buildEffects(mutatorIds) {
    return mutatorIds.reduce((effects, mutatorId) => {
        const definition = getMutator(mutatorId);
        return {
            initiativeBonusPerBeat: effects.initiativeBonusPerBeat + (definition.initiativeBonusPerBeat ?? 0),
            rangedDamageMultiplier: effects.rangedDamageMultiplier * (definition.rangedDamageMultiplier ?? 1),
        };
    }, { initiativeBonusPerBeat: 0, rangedDamageMultiplier: 1 });
}
function cloneSnapshot(units) {
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
            type: unit.type,
            attributes: [...unit.attributes],
            position: { ...unit.position },
            stats: { ...unit.resolvedStats },
            hp: fixed(unit.hp),
            maxHp: fixed(unit.maxHp),
            initiative: fixed(unit.initiative),
            alive: unit.alive,
            engagedWithIds: [...unit.engagedWith],
        })),
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
        if (unit.side === 'player') {
            player += 1;
        }
        else {
            enemy += 1;
        }
        byTroopLabel[unit.troopLabel] = (byTroopLabel[unit.troopLabel] ?? 0) + 1;
    });
    return { player, enemy, byTroopLabel };
}
function cloneAbilityDefinition(ability) {
    return {
        ...ability,
        trigger: { ...ability.trigger, fallen: ability.trigger.fallen ? { ...ability.trigger.fallen } : undefined },
        duration: { ...ability.duration },
        target: ability.target
            ? {
                ...ability.target,
                filters: ability.target.filters
                    ? {
                        notTypes: ability.target.filters.notTypes ? [...ability.target.filters.notTypes] : undefined,
                        onlyTypes: ability.target.filters.onlyTypes ? [...ability.target.filters.onlyTypes] : undefined,
                        prioritizeTypes: ability.target.filters.prioritizeTypes ? [...ability.target.filters.prioritizeTypes] : undefined,
                        unengaged: ability.target.filters.unengaged,
                    }
                    : undefined,
            }
            : undefined,
        effects: ability.effects.map((effect) => ({ ...effect })),
    };
}
function createRuntimeAbilityState(ability) {
    return {
        definition: cloneAbilityDefinition(ability),
        triggerCount: 0,
        usesRemaining: ability.trigger.maxUses ?? null,
    };
}
function buildTroopProfiles(input, summonedProfiles) {
    const seen = new Set();
    const profiles = [];
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
            type: combatant.type,
            attributes: [...combatant.attributes],
            stats: { ...combatant.stats },
            abilities: combatant.abilities.map(cloneAbilityDefinition),
            statBreakdowns: combatant.statBreakdowns ??
                {
                    health: { stat: 'health', finalValue: combatant.stats.health, lines: [{ label: 'Resolved', value: combatant.stats.health, kind: 'base' }] },
                    damage: { stat: 'damage', finalValue: combatant.stats.damage, lines: [{ label: 'Resolved', value: combatant.stats.damage, kind: 'base' }] },
                    speed: { stat: 'speed', finalValue: combatant.stats.speed, lines: [{ label: 'Resolved', value: combatant.stats.speed, kind: 'base' }] },
                    armor: { stat: 'armor', finalValue: combatant.stats.armor, lines: [{ label: 'Resolved', value: combatant.stats.armor, kind: 'base' }] },
                    range: { stat: 'range', finalValue: combatant.stats.range, lines: [{ label: 'Resolved', value: combatant.stats.range, kind: 'base' }] },
                    capacity: { stat: 'capacity', finalValue: combatant.stats.capacity, lines: [{ label: 'Resolved', value: combatant.stats.capacity, kind: 'base' }] },
                    size: { stat: 'size', finalValue: combatant.stats.size, lines: [{ label: 'Resolved', value: combatant.stats.size, kind: 'base' }] },
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
function buildStep(state, kind, actorIds, targetIds, message, metadata) {
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
function startingCorner(side, radius) {
    return side === 'player' ? { q: -radius, r: 0 } : { q: radius, r: 0 };
}
function meleeStart(side, radius) {
    return side === 'player' ? { q: -radius + 1, r: 0 } : { q: radius - 1, r: 0 };
}
function expandSpawnCells(side, origin, radius, activeCells, forbidden) {
    const enemyCorner = startingCorner(side === 'player' ? 'enemy' : 'player', radius);
    const originEnemyDistance = hexDistance(origin, enemyCorner);
    const frontier = new Map();
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
function placeUnitWithExpandableCells(combatant, side, origin, radius, activeCells, context, forbidden, occupancy) {
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
            .filter((item) => item !== null);
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
function spawnGroup(side, combatants, origin, radius, context, forbidden) {
    if (combatants.length === 0) {
        return new Set();
    }
    const totalGroupSize = fixedSum(combatants.map((combatant) => combatant.stats.size));
    const targetCellCount = Math.max(1, Math.ceil(totalGroupSize / context.saturation));
    const activeCells = forbidden.has(hexKey(origin)) ? [] : [origin];
    const occupancy = new Map();
    const usedHexes = new Set();
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
            summonerUnitId: null,
            role: combatant.role,
            type: combatant.type,
            attributes: [...combatant.attributes],
            position: { ...slot },
            hp: combatant.stats.health,
            maxHp: combatant.stats.health,
            initiative: fixed(context.rng.int(11)),
            alive: true,
            engagedWith: new Set(),
            resolvedStats: { ...combatant.stats },
            resolvedAbilities: combatant.abilities.map(createRuntimeAbilityState),
            activeTimedEffects: [],
        });
    });
    return usedHexes;
}
function expandCombatants(combatants) {
    return combatants.flatMap((combatant) => Array.from({ length: combatant.quantity }, (_, index) => ({
        ...combatant,
        quantity: 1,
        combatantId: `${combatant.combatantId}-${index + 1}`,
    })));
}
function spawnUnitsForSide(side, combatants, radius, context) {
    const ranged = combatants.filter((combatant) => combatant.stats.range > 0);
    const melee = combatants.filter((combatant) => combatant.stats.range === 0);
    const meleeForbidden = new Set();
    const rangedHexes = spawnGroup(side, ranged, startingCorner(side, radius), radius, context, new Set());
    if (!rangedHexes) {
        return false;
    }
    rangedHexes.forEach((key) => meleeForbidden.add(key));
    const meleeHexes = spawnGroup(side, melee, meleeStart(side, radius), radius, context, meleeForbidden);
    return meleeHexes !== null;
}
function initializeUnits(input, rng) {
    let radius = BASE_MAP_RADIUS;
    const playerUnits = expandCombatants(input.playerCombatants);
    const enemyUnits = expandCombatants(input.enemyCombatants);
    const saturation = input.saturation ?? DEFAULT_SATURATION;
    while (true) {
        const units = new Map();
        const context = { units, rng, saturation };
        const playerOk = spawnUnitsForSide('player', playerUnits, radius, context);
        const enemyOk = playerOk && spawnUnitsForSide('enemy', enemyUnits, radius, context);
        if (playerOk && enemyOk) {
            return { units, mapRadius: radius };
        }
        radius += 1;
    }
}
function getAliveUnits(state, side) {
    return [...state.units.values()].filter((unit) => unit.alive && (!side || unit.side === side));
}
function resolveBattleOutcome(state) {
    const playerAlive = getAliveUnits(state, 'player').length > 0;
    const enemyAlive = getAliveUnits(state, 'enemy').length > 0;
    if (playerAlive && !enemyAlive)
        return 'victory';
    if (!playerAlive && enemyAlive)
        return 'defeat';
    return 'draw';
}
function clearStaleEngagements(state) {
    state.units.forEach((unit) => {
        unit.engagedWith.forEach((enemyId) => {
            const enemy = state.units.get(enemyId);
            if (!enemy?.alive || !equalsHex(enemy.position, unit.position)) {
                unit.engagedWith.delete(enemyId);
            }
        });
    });
}
function availableCapacity(state, unit) {
    const used = fixedSum([...unit.engagedWith]
        .map((enemyId) => state.units.get(enemyId))
        .filter((enemy) => Boolean(enemy))
        .map((enemy) => enemy.resolvedStats.size));
    return fixedMax(fixedSub(unit.resolvedStats.capacity, used), 0);
}
function enemyUnitsOnHex(state, unit) {
    return getAliveUnits(state).filter((other) => other.side !== unit.side && equalsHex(other.position, unit.position));
}
function nonEngagedEnemiesOnHex(state, unit) {
    return enemyUnitsOnHex(state, unit).filter((enemy) => enemy.engagedWith.size === 0);
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
}
function engageEnemiesOnHex(state, actor, roles = [], includeAlreadyEngaged = false) {
    let remainingCapacity = availableCapacity(state, actor);
    const engagedTargets = [];
    const candidates = enemyUnitsOnHex(state, actor)
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
            remainingCapacity = fixedSub(remainingCapacity, enemy.resolvedStats.size);
            engagedTargets.push(enemy);
        }
    });
    return engagedTargets;
}
function matchesRoleFilter(unit, roles) {
    return roles.length === 0 || roles.includes(unit.role);
}
function getDistinctFriendlyUnitTypes(state, unit) {
    return [...new Set(getAliveUnits(state, unit.side).map((entry) => entry.type))];
}
function formatSigned(value) {
    return value >= 0 ? `+${formatFixed(value)}` : formatFixed(value);
}
function hasAbility(unit, abilityId) {
    return unit.resolvedAbilities.some((runtime) => runtime.definition.id === abilityId);
}
function hasMatchingIdentityTag(unit, tags) {
    return tags.some((tag) => unit.type === tag || unit.attributes.includes(tag));
}
function evaluateScaledAmount(base, amount, mode) {
    return mode === 'percent' ? fixedMul(base, amount / 100) : amount;
}
function applyBolster(state, actor, target, runtime, effect) {
    const maxIncrease = evaluateScaledAmount(target.maxHp, effect.amount, effect.mode);
    const currentIncrease = evaluateScaledAmount(target.hp, effect.amount, effect.mode);
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
    return true;
}
function applyRamp(state, actor, target, runtime, effect) {
    const increase = evaluateScaledAmount(target.resolvedStats.damage, effect.amount, effect.mode);
    if (increase <= 0) {
        return false;
    }
    target.resolvedStats.damage = fixedAdd(target.resolvedStats.damage, increase);
    buildStep(state, 'buff', [actor.id], [target.id], `${target.troopLabel} gains ${formatSigned(increase)} damage.`, {
        amount: increase,
        effect: 'ramp',
        sourceAbilityId: runtime.definition.id,
        sourceAbilityLabel: runtime.definition.label,
    });
    return true;
}
function applyHaste(state, actor, target, runtime, effect) {
    const increase = evaluateScaledAmount(target.resolvedStats.speed, effect.amount, effect.mode);
    if (increase <= 0) {
        return false;
    }
    target.resolvedStats.speed = fixedClamp(fixedAdd(target.resolvedStats.speed, increase), 1, 100);
    buildStep(state, 'buff', [actor.id], [target.id], `${target.troopLabel} gains ${formatSigned(increase)} speed.`, {
        amount: increase,
        effect: 'haste',
        sourceAbilityId: runtime.definition.id,
        sourceAbilityLabel: runtime.definition.label,
    });
    return true;
}
function healUnit(state, actor, target, effect) {
    if (!target.alive || target.hp >= target.maxHp) {
        return false;
    }
    const missing = fixedSub(target.maxHp, target.hp);
    const amount = effect.mode === 'percent' ? fixedMul(missing, effect.amount / 100) : effect.amount;
    const nextHp = fixedClamp(fixedAdd(target.hp, amount), 0, target.maxHp);
    const actual = fixedSub(nextHp, target.hp);
    if (actual <= 0) {
        return false;
    }
    target.hp = nextHp;
    buildStep(state, 'heal', [actor.id], [target.id], `${actor.troopLabel} heals ${target.troopLabel} for ${formatFixed(actual)}.`, {
        amount: actual,
        effect: 'heal',
    });
    return true;
}
function applyRangeSet(state, actor, target, runtime, effect) {
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
function applyRoleSet(state, actor, target, runtime, effect) {
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
function applyTemporaryEffect(state, actor, target, runtime, effect) {
    const turns = runtime.definition.duration.kind === 'turns' ? runtime.definition.duration.turns : 0;
    if (turns <= 0) {
        return false;
    }
    if (effect.kind === 'bolster') {
        const maxApplied = evaluateScaledAmount(target.maxHp, effect.amount, effect.mode);
        const hpApplied = evaluateScaledAmount(target.hp, effect.amount, effect.mode);
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
        const amountApplied = evaluateScaledAmount(target.resolvedStats.speed, effect.amount, effect.mode);
        if (amountApplied <= 0) {
            return false;
        }
        target.resolvedStats.speed = fixedClamp(fixedAdd(target.resolvedStats.speed, amountApplied), 1, 100);
        target.activeTimedEffects.push({
            effectKind: 'haste',
            sourceAbilityId: runtime.definition.id,
            sourceUnitId: actor.id,
            remainingTurns: turns,
            amountApplied,
        });
        buildStep(state, 'buff', [actor.id], [target.id], `${target.troopLabel} gains ${formatSigned(amountApplied)} speed until end of turn.`, {
            amount: amountApplied,
            effect: 'haste',
            sourceAbilityId: runtime.definition.id,
            sourceAbilityLabel: runtime.definition.label,
            temporary: true,
        });
        return true;
    }
    if (effect.kind === 'ramp') {
        const amountApplied = evaluateScaledAmount(target.resolvedStats.damage, effect.amount, effect.mode);
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
function expireTimedEffects(state, unit) {
    const remaining = [];
    unit.activeTimedEffects.forEach((effect) => {
        const nextTurns = effect.remainingTurns - 1;
        if (nextTurns > 0) {
            remaining.push({ ...effect, remainingTurns: nextTurns });
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
            unit.resolvedStats.speed = fixedClamp(fixedSub(unit.resolvedStats.speed, effect.amountApplied), 1, 100);
            buildStep(state, 'buff', [effect.sourceUnitId], [unit.id], `${unit.troopLabel} loses ${formatSigned(effect.amountApplied)} speed.`, {
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
function matchesFallenTrigger(unit, fallenUnit, allegiance) {
    if (unit.id === fallenUnit.id) {
        return false;
    }
    if (allegiance === 'all') {
        return true;
    }
    return allegiance === 'ally' ? unit.side === fallenUnit.side : unit.side !== fallenUnit.side;
}
function filterTargetCandidates(candidates, filters) {
    if (!filters) {
        return candidates;
    }
    return candidates.filter((candidate) => {
        if (filters.onlyTypes && !hasMatchingIdentityTag(candidate, filters.onlyTypes)) {
            return false;
        }
        if (filters.notTypes && hasMatchingIdentityTag(candidate, filters.notTypes)) {
            return false;
        }
        if (filters.unengaged && candidate.engagedWith.size > 0) {
            return false;
        }
        return true;
    });
}
function prioritizeCandidates(candidates, filters) {
    if (!filters?.prioritizeTypes?.length) {
        return candidates;
    }
    const prioritized = candidates.filter((candidate) => hasMatchingIdentityTag(candidate, filters.prioritizeTypes ?? []));
    return prioritized.length > 0 ? prioritized : candidates;
}
// Default target resolution for effects that don't have an explicit target definition.
// Each effect kind that needs context from the trigger event gets its own named helper,
// keeping that semantic knowledge co-located with the effect rather than buried in a
// generic dispatch function.
function getBlastDefaultTargets(state, actor, event) {
    if (!event.attackTarget) {
        return [];
    }
    return getAliveUnits(state).filter((unit) => unit.side !== actor.side && equalsHex(unit.position, event.attackTarget.position));
}
function getStrikeDefaultTarget(event) {
    return event.attackTarget?.alive ? [event.attackTarget] : [];
}
function getHealDefaultTargets(state, actor, target) {
    const candidates = getAliveUnits(state, actor.side)
        .filter((unit) => hexDistance(actor.position, unit.position) <= actor.resolvedStats.range)
        .filter((unit) => unit.hp < unit.maxHp);
    const filtered = prioritizeCandidates(filterTargetCandidates(candidates, target?.filters), target?.filters);
    if (filtered.length === 0) {
        return [];
    }
    const mostMissing = Math.max(...filtered.map((unit) => fixedSub(unit.maxHp, unit.hp)));
    return filtered.filter((unit) => fixedSub(unit.maxHp, unit.hp) === mostMissing);
}
export function resolveAbilityTargetRadius(actor, target) {
    if (!target) {
        return 0;
    }
    if (target.radiusSource === 'selfRange') {
        return actor.resolvedStats.range;
    }
    return target.radius ?? 0;
}
function resolveFallenTriggerRadius(actor, trigger) {
    if (!trigger.fallen) {
        return 0;
    }
    if (trigger.fallen.radiusSource === 'selfRange') {
        return actor.resolvedStats.range;
    }
    return trigger.fallen.radius;
}
function getTargetCandidates(state, actor, ability, effect, event) {
    const target = ability.target;
    if (target?.mode === 'self') {
        return [actor];
    }
    if (target?.mode === 'random' || target?.mode === 'aoe') {
        const radius = resolveAbilityTargetRadius(actor, target);
        const allegiance = target.allegiance ?? 'ally';
        const candidates = getAliveUnits(state).filter((unit) => {
            if (allegiance === 'ally' && unit.side !== actor.side)
                return false;
            if (allegiance === 'enemy' && unit.side === actor.side)
                return false;
            return hexDistance(actor.position, unit.position) <= radius;
        });
        return prioritizeCandidates(filterTargetCandidates(candidates, target.filters), target.filters);
    }
    if (effect.kind === 'blast')
        return getBlastDefaultTargets(state, actor, event);
    if (effect.kind === 'strike')
        return getStrikeDefaultTarget(event);
    if (effect.kind === 'heal')
        return getHealDefaultTargets(state, actor, target);
    return [actor];
}
function resolveTargets(state, actor, ability, effect, event) {
    const candidates = getTargetCandidates(state, actor, ability, effect, event).filter((candidate) => candidate.alive);
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
function canTriggerAbility(state, actor, runtime, event) {
    const trigger = runtime.definition.trigger;
    if (trigger.timing !== event.timing) {
        return false;
    }
    if (runtime.usesRemaining !== null && runtime.usesRemaining <= 0) {
        return false;
    }
    if (trigger.condition === 'forsaken' && getDistinctFriendlyUnitTypes(state, actor).length > 1) {
        return false;
    }
    if (trigger.fallen && event.fallenUnit) {
        if (!matchesFallenTrigger(actor, event.fallenUnit, trigger.fallen.allegiance)) {
            return false;
        }
        if (hexDistance(actor.position, event.fallenUnit.position) > resolveFallenTriggerRadius(actor, trigger)) {
            return false;
        }
    }
    return true;
}
function getAbilityRepeatCount(state, actor, runtime) {
    if (runtime.definition.trigger.repeatPerDistinctFriendlyTroopType) {
        return Math.max(0, getDistinctFriendlyUnitTypes(state, actor).filter((type) => type !== actor.type).length);
    }
    if (runtime.definition.trigger.repeatPerOtherFriendlyUnitOnHex) {
        return getAliveUnits(state, actor.side).filter((ally) => ally.id !== actor.id && equalsHex(ally.position, actor.position)).length;
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
        unitTypeId: unit.unitTypeId,
        factionId: unit.factionId,
        role: unit.role,
        type: unit.type,
        attributes: [...unit.attributes],
        stats: { ...unit.resolvedStats },
        abilities: unit.resolvedAbilities.map((runtime) => cloneAbilityDefinition(runtime.definition)),
        statBreakdowns: {
            health: { stat: 'health', finalValue: unit.resolvedStats.health, lines: [{ label: 'Summoned', value: unit.resolvedStats.health, kind: 'base' }] },
            damage: { stat: 'damage', finalValue: unit.resolvedStats.damage, lines: [{ label: 'Summoned', value: unit.resolvedStats.damage, kind: 'base' }] },
            speed: { stat: 'speed', finalValue: unit.resolvedStats.speed, lines: [{ label: 'Summoned', value: unit.resolvedStats.speed, kind: 'base' }] },
            armor: { stat: 'armor', finalValue: unit.resolvedStats.armor, lines: [{ label: 'Summoned', value: unit.resolvedStats.armor, kind: 'base' }] },
            range: { stat: 'range', finalValue: unit.resolvedStats.range, lines: [{ label: 'Summoned', value: unit.resolvedStats.range, kind: 'base' }] },
            capacity: { stat: 'capacity', finalValue: unit.resolvedStats.capacity, lines: [{ label: 'Summoned', value: unit.resolvedStats.capacity, kind: 'base' }] },
            size: { stat: 'size', finalValue: unit.resolvedStats.size, lines: [{ label: 'Summoned', value: unit.resolvedStats.size, kind: 'base' }] },
        },
    });
}
function tryFindSummonHex(state, actor, origin, size) {
    const candidatePool = [origin, ...state.rng.shuffle(neighbors(origin).filter((coord) => inRadius(coord, state.mapRadius)))];
    const valid = candidatePool.filter((coord) => fixedAdd(allySizeOnHex(state, actor.side, coord), size) <= state.saturation);
    if (valid.length === 0) {
        return null;
    }
    return valid[0] ?? null;
}
function summonUnit(state, actor, runtime, effect, origin) {
    const troop = composeSummonedTroopDefinition(actor.factionId, effect.unitTypeId);
    const summonHex = tryFindSummonHex(state, actor, origin, troop.stats.size);
    if (!summonHex) {
        return false;
    }
    const summonIndex = [...state.units.values()].filter((unit) => unit.side === actor.side && unit.troopLabel === troop.label).length + 1;
    const unitId = `${actor.id}-summon-${effect.unitTypeId}-${summonIndex}`;
    const summonedUnit = {
        id: unitId,
        troopInstanceId: null,
        troopLabel: troop.label,
        unitTypeId: troop.unitTypeId,
        factionId: troop.factionId,
        side: actor.side,
        summonerUnitId: actor.id,
        role: troop.role,
        type: troop.type,
        attributes: [...troop.attributes],
        position: { ...summonHex },
        hp: troop.stats.health,
        maxHp: troop.stats.health,
        initiative: 0,
        alive: true,
        engagedWith: new Set(),
        resolvedStats: { ...troop.stats },
        resolvedAbilities: troop.abilities.map(createRuntimeAbilityState),
        activeTimedEffects: [],
    };
    state.units.set(unitId, summonedUnit);
    recordSummonedProfile(state, summonedUnit);
    buildStep(state, 'buff', [actor.id], [unitId], `${actor.troopLabel} summons ${troop.label}.`, {
        effect: 'summon',
        unitTypeId: troop.unitTypeId,
        sourceAbilityId: runtime.definition.id,
        sourceAbilityLabel: runtime.definition.label,
    });
    return true;
}
// Registry of handlers for effects that operate on resolved targets.
// Adding a new effect kind only requires adding an entry here — the dispatch in
// executeAbilityEffect does not need to change.
// 'taunt' is absent: it bypasses target resolution and uses engageEnemiesOnHex directly.
// 'pack' is absent: it is a passive bonus computed in getPackBonus, not a triggered effect.
const PER_TARGET_EFFECT_HANDLERS = {
    blast: (state, actor, runtime, target, effect) => {
        const e = effect;
        const damage = fixedMax(e.amount, 0);
        target.hp = fixedSub(target.hp, damage);
        buildStep(state, 'attack', [actor.id], [target.id], `${actor.troopLabel} splashes ${formatFixed(damage)} blast damage.`, {
            damage,
            mode: 'blast',
            sourceAbilityId: runtime.definition.id,
            sourceAbilityLabel: runtime.definition.label,
        });
        if (target.hp <= 0 && target.alive) {
            handleDeath(state, actor, target);
        }
        else if (target.alive) {
            triggerUnitAbilities(state, target, { timing: 'onDamaged' });
        }
        return true;
    },
    bolster: (state, actor, runtime, target, effect) => applyBolster(state, actor, target, runtime, effect),
    haste: (state, actor, runtime, target, effect) => applyHaste(state, actor, target, runtime, effect),
    heal: (state, actor, _runtime, target, effect) => healUnit(state, actor, target, effect),
    ramp: (state, actor, runtime, target, effect) => applyRamp(state, actor, target, runtime, effect),
    rangeset: (state, actor, runtime, target, effect) => applyRangeSet(state, actor, target, runtime, effect),
    roleset: (state, actor, runtime, target, effect) => applyRoleSet(state, actor, target, runtime, effect),
    summon: (state, actor, runtime, _target, effect, event) => {
        const summon = effect;
        const origin = summon.consumeFallenUnitCorpse ? event.fallenUnit?.position : actor.position;
        if (!origin) {
            return false;
        }
        if (summon.consumeFallenUnitCorpse && event.fallenUnit) {
            if (!state.corpses.has(event.fallenUnit.id)) {
                return false;
            }
        }
        let summonedAny = false;
        for (let index = 0; index < summon.count; index += 1) {
            summonedAny = summonUnit(state, actor, runtime, summon, origin) || summonedAny;
        }
        if (summonedAny && summon.consumeFallenUnitCorpse && event.fallenUnit) {
            state.corpses.delete(event.fallenUnit.id);
        }
        return summonedAny;
    },
    strike: (state, actor, _runtime, target, effect) => {
        const e = effect;
        const strikeCount = Math.max(0, Math.floor(e.amount));
        if (strikeCount > 0 && target.alive) {
            for (let i = 0; i < strikeCount; i += 1) {
                attack(state, actor, target, actor.resolvedStats.range > 0 ? 'ranged' : 'melee', false, 0);
                if (!target.alive) {
                    break;
                }
            }
            return true;
        }
        return false;
    },
    redirect: (state, actor, runtime, target) => {
        if (!target.alive || target.engagedWith.size > 0 || actor.engagedWith.has(target.id)) {
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
function executeAbilityEffect(state, actor, runtime, effect, event) {
    const handler = PER_TARGET_EFFECT_HANDLERS[effect.kind];
    if (!handler) {
        return false;
    }
    const targets = resolveTargets(state, actor, runtime.definition, effect, event);
    if (targets.length === 0) {
        return false;
    }
    let applied = false;
    targets.forEach((target) => {
        if (!target.alive && effect.kind !== 'strike') {
            return;
        }
        if (runtime.definition.duration.kind === 'turns' &&
            (effect.kind === 'bolster' || effect.kind === 'haste' || effect.kind === 'ramp' || effect.kind === 'rangeset' || effect.kind === 'roleset')) {
            applied = applyTemporaryEffect(state, actor, target, runtime, effect) || applied;
            return;
        }
        applied = handler(state, actor, runtime, target, effect, event) || applied;
    });
    return applied;
}
function triggerUnitAbilities(state, actor, event) {
    actor.resolvedAbilities.forEach((runtime) => {
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
        }
        if (applied && runtime.usesRemaining !== null) {
            runtime.usesRemaining -= 1;
        }
    });
}
function executeStartOfBattleAbilities(state) {
    getAliveUnits(state).forEach((unit) => {
        triggerUnitAbilities(state, unit, { timing: 'startOfBattle' });
    });
}
function executeEndOfTurnAbilities(state, actor) {
    triggerUnitAbilities(state, actor, { timing: 'endOfTurn' });
}
function executeStartOfTurnAbilities(state, actor) {
    triggerUnitAbilities(state, actor, { timing: 'startOfTurn' });
}
function handleDeath(state, actor, target) {
    if (!target.alive) {
        return;
    }
    target.alive = false;
    target.hp = 0;
    removeAllEngagements(state, target);
    if (!hasAbility(target, 'fading')) {
        state.corpses.set(target.id, { ...target.position });
    }
    buildStep(state, 'death', [actor.id], [target.id], `${target.troopLabel} is killed.`);
    const bondedDependents = getAliveUnits(state, target.side).filter((unit) => unit.summonerUnitId === target.id && hasAbility(unit, 'bonded'));
    triggerUnitAbilities(state, actor, { timing: 'onKill', fallenUnit: target });
    triggerUnitAbilities(state, target, { timing: 'onDeath', fallenUnit: target });
    getAliveUnits(state).forEach((unit) => {
        if (unit.id !== target.id) {
            triggerUnitAbilities(state, unit, { timing: 'onFallen', fallenUnit: target });
        }
    });
    bondedDependents.forEach((unit) => handleDeath(state, target, unit));
}
function attack(state, actor, target, mode, allowOnAttackAbilities = true, strikeCount = 0) {
    const baseDamage = fixedSub(actor.resolvedStats.damage, target.resolvedStats.armor);
    const modifiedDamage = mode === 'ranged' ? fixedMul(baseDamage, state.effects.rangedDamageMultiplier) : baseDamage;
    const damage = fixedMax(modifiedDamage, 0);
    target.hp = fixedSub(target.hp, damage);
    buildStep(state, 'attack', [actor.id], [target.id], `${actor.troopLabel} hits ${target.troopLabel} for ${formatFixed(damage)}.`, {
        damage,
        mode,
    });
    if (allowOnAttackAbilities) {
        triggerUnitAbilities(state, actor, { timing: 'onAttack', attackTarget: target });
    }
    if (target.hp <= 0 && target.alive) {
        handleDeath(state, actor, target);
    }
    else {
        triggerUnitAbilities(state, target, { timing: 'onDamaged' });
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
function pileOn(state, actor) {
    const candidates = enemyUnitsOnHex(state, actor);
    if (candidates.length === 0) {
        return false;
    }
    const prioritized = candidates.filter((enemy) => getAliveUnits(state, actor.side)
        .filter((ally) => ally.id !== actor.id && equalsHex(ally.position, actor.position))
        .some((ally) => ally.engagedWith.has(enemy.id)));
    attack(state, actor, state.rng.pick(prioritized.length > 0 ? prioritized : candidates), 'melee');
    return true;
}
function fight(state, actor) {
    const engagedEnemies = [...actor.engagedWith]
        .map((enemyId) => state.units.get(enemyId))
        .filter((enemy) => Boolean(enemy?.alive));
    if (engagedEnemies.length > 0) {
        attack(state, actor, state.rng.pick(engagedEnemies), 'melee');
        return true;
    }
    return pileOn(state, actor);
}
function drawAttention(state, actor, roles = []) {
    const engagedTargets = engageEnemiesOnHex(state, actor, roles);
    if (engagedTargets.length > 0) {
        buildStep(state, 'engage', [actor.id], engagedTargets.map((target) => target.id), `${actor.troopLabel} engages enemies.`);
    }
    return fight(state, actor) || engagedTargets.length > 0;
}
function allySizeOnHex(state, side, coord, exceptId) {
    return fixedSum(getAliveUnits(state, side)
        .filter((unit) => equalsHex(unit.position, coord) && unit.id !== exceptId)
        .map((unit) => unit.resolvedStats.size));
}
function validMovementHexes(state, actor) {
    return neighbors(actor.position)
        .filter((coord) => inRadius(coord, state.mapRadius))
        .filter((coord) => fixedAdd(allySizeOnHex(state, actor.side, coord, actor.id), actor.resolvedStats.size) <= state.saturation);
}
function findClosestEnemy(state, actor, preferredRoles, nonEngagedOnly) {
    const enemies = getAliveUnits(state).filter((unit) => unit.side !== actor.side &&
        (preferredRoles.length === 0 || preferredRoles.includes(unit.role)) &&
        (!nonEngagedOnly || unit.engagedWith.size === 0));
    if (enemies.length === 0) {
        return null;
    }
    return enemies.sort((a, b) => hexDistance(actor.position, a.position) - hexDistance(actor.position, b.position))[0] ?? null;
}
function moveToward(state, actor, target) {
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
function enemiesInRange(state, actor) {
    return getAliveUnits(state).filter((enemy) => enemy.side !== actor.side && hexDistance(actor.position, enemy.position) <= actor.resolvedStats.range);
}
function pursue(state, actor, preferredRoles) {
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
function retreat(state, actor) {
    const options = validMovementHexes(state, actor).filter((coord) => getAliveUnits(state).filter((unit) => unit.side !== actor.side && equalsHex(unit.position, coord)).length === 0);
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
function carefulAdvance(state, actor) {
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
function executeTurnActions(state, actor) {
    clearStaleEngagements(state);
    const engagedEnemies = [...actor.engagedWith]
        .map((enemyId) => state.units.get(enemyId))
        .filter((enemy) => Boolean(enemy?.alive));
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
function executeTurn(state, actor) {
    if (!actor.alive) {
        return;
    }
    executeStartOfTurnAbilities(state, actor);
    if (!actor.alive) {
        return;
    }
    executeTurnActions(state, actor);
    executeEndOfTurnAbilities(state, actor);
    expireTimedEffects(state, actor);
}
function isBattleOver(state) {
    return getAliveUnits(state, 'player').length === 0 || getAliveUnits(state, 'enemy').length === 0;
}
export function resolveBattle(input) {
    const seed = input.seed ?? randomSeed();
    const rng = createRng(seed);
    const init = initializeUnits(input, rng);
    const saturation = input.saturation ?? DEFAULT_SATURATION;
    const state = {
        units: init.units,
        corpses: new Map(),
        summonedProfiles: new Map(),
        steps: [],
        mapRadius: init.mapRadius,
        saturation,
        rng,
        beatCount: 0,
        effects: buildEffects(input.mutatorIds),
        replayId: makeReplayId(seed, input.riftId),
        input,
    };
    const troopLabels = Object.fromEntries([...input.playerCombatants, ...input.enemyCombatants].map((combatant) => [combatant.combatantId, combatant.label]));
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
        saturation: state.saturation,
        initial,
        steps: state.steps,
        outcome: resolveBattleOutcome(state),
        troopLabels,
        troopProfiles: buildTroopProfiles(input, state.summonedProfiles),
        aliveCounts: snapshots.map(createAliveCount),
        summary: {
            playerTroops: input.playerCombatants.map((combatant) => combatant.label),
            enemyTroops: input.enemyCombatants.map((combatant) => combatant.label),
            finalPlayerAlive: finalCounts.player,
            finalEnemyAlive: finalCounts.enemy,
        },
    };
}
export function resolveDebugBattle(input) {
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
            type: troop.type,
            attributes: troop.attributes,
            stats: troop.stats,
            abilities: troop.abilities,
            quantity,
            cost: troop.cost,
            side: 'player',
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
            type: troop.type,
            attributes: troop.attributes,
            stats: troop.stats,
            abilities: troop.abilities,
            quantity,
            cost: troop.cost,
            side: 'enemy',
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
export function buildBattleInputFromResolvedCombatants(seed, riftId, tier, mutatorIds, saturation, playerCombatants, enemyCombatants) {
    return { seed, riftId, tier, mutatorIds, saturation, playerCombatants, enemyCombatants };
}
//# sourceMappingURL=battle.js.map