import { buildBalanceBattleInput, createSeedRange, createUnitTypeCombatant, sweepBattleSeeds } from './balanceHarness';
import { fixed } from './fixed';
import { UNIT_TYPES, getUnitType } from './unitCatalog';
function compareTroopIds(left, right) {
    return left.localeCompare(right);
}
function choose(items, size, start = 0, prefix = [], result = []) {
    if (prefix.length === size) {
        result.push([...prefix]);
        return result;
    }
    for (let index = start; index <= items.length - (size - prefix.length); index += 1) {
        prefix.push(items[index]);
        choose(items, size, index + 1, prefix, result);
        prefix.pop();
    }
    return result;
}
function emptyRecord() {
    return {
        wins: 0,
        losses: 0,
        draws: 0,
        samples: 0,
    };
}
function cloneRecord(record) {
    return {
        wins: record?.wins ?? 0,
        losses: record?.losses ?? 0,
        draws: record?.draws ?? 0,
        samples: record?.samples ?? 0,
    };
}
export function getEligiblePermutationUnitTypeIds() {
    return filterEligiblePermutationUnitTypeIds(Object.values(UNIT_TYPES).map((unitType) => unitType.id));
}
export function filterEligiblePermutationUnitTypeIds(unitTypeIds) {
    return Object.values(UNIT_TYPES)
        .filter((unitType) => unitTypeIds.includes(unitType.id))
        .filter((unitType) => !unitType.attributes.includes('summoned'))
        .map((unitType) => unitType.id)
        .sort(compareTroopIds);
}
export function resolvePermutationQuantity(unitTypeId) {
    return Math.max(1, Math.round(120 / getUnitType(unitTypeId).cost));
}
export function resolvePermutationTroops(unitTypeIds = getEligiblePermutationUnitTypeIds()) {
    return [...unitTypeIds].sort(compareTroopIds).map((troopId) => ({
        troopId,
        label: getUnitType(troopId).label,
        quantity: resolvePermutationQuantity(troopId),
    }));
}
export function generatePermutationTeams(teamSize, unitTypeIds) {
    return choose([...unitTypeIds].sort(compareTroopIds), teamSize).map((troopIds) => ({
        troopIds,
        key: troopIds.join('+'),
        label: troopIds.map((troopId) => getUnitType(troopId).label).join(' + '),
    }));
}
export function generatePermutationMatchups(teams) {
    const ordered = [...teams].sort((left, right) => left.key.localeCompare(right.key));
    const matchups = [];
    for (let leftIndex = 0; leftIndex < ordered.length; leftIndex += 1) {
        for (let rightIndex = leftIndex + 1; rightIndex < ordered.length; rightIndex += 1) {
            const left = ordered[leftIndex];
            const right = ordered[rightIndex];
            matchups.push({
                key: `${left.key}__vs__${right.key}`,
                left,
                right,
                index: matchups.length,
            });
        }
    }
    return matchups;
}
export function createPermutationSeeds(teamSize, matchupIndex, runCount) {
    return createSeedRange(runCount, teamSize * 1_000_000 + matchupIndex * runCount);
}
export function createEmptyPermutationAggregate(unitTypeIds) {
    const troopIds = [...unitTypeIds].sort(compareTroopIds);
    const quantities = Object.fromEntries(troopIds.map((troopId) => [troopId, resolvePermutationQuantity(troopId)]));
    const labels = Object.fromEntries(troopIds.map((troopId) => [troopId, getUnitType(troopId).label]));
    const overall = Object.fromEntries(troopIds.map((troopId) => [troopId, emptyRecord()]));
    const matrix = Object.fromEntries(troopIds.map((troopId) => [
        troopId,
        Object.fromEntries(troopIds.filter((otherTroopId) => otherTroopId !== troopId).map((otherTroopId) => [otherTroopId, emptyRecord()])),
    ]));
    return {
        troopIds,
        quantities,
        labels,
        overall,
        against: matrix,
        alongside: Object.fromEntries(troopIds.map((troopId) => [
            troopId,
            Object.fromEntries(troopIds.filter((otherTroopId) => otherTroopId !== troopId).map((otherTroopId) => [otherTroopId, emptyRecord()])),
        ])),
    };
}
function applyOutcomeToSide(record, outcome, side) {
    record.samples += 1;
    if (outcome === 'draw') {
        record.draws += 1;
        return;
    }
    if (side === 'winner') {
        record.wins += 1;
        return;
    }
    record.losses += 1;
}
export function applyPermutationOutcome(aggregate, leftTroopIds, rightTroopIds, outcome) {
    const leftWon = outcome === 'victory';
    const rightWon = outcome === 'defeat';
    leftTroopIds.forEach((troopId) => {
        const record = aggregate.overall[troopId];
        applyOutcomeToSide(record, outcome, leftWon ? 'winner' : rightWon ? 'loser' : 'draw');
    });
    rightTroopIds.forEach((troopId) => {
        const record = aggregate.overall[troopId];
        applyOutcomeToSide(record, outcome, rightWon ? 'winner' : leftWon ? 'loser' : 'draw');
    });
    leftTroopIds.forEach((troopId) => {
        rightTroopIds.forEach((otherTroopId) => {
            const record = aggregate.against[troopId]?.[otherTroopId];
            if (record) {
                applyOutcomeToSide(record, outcome, leftWon ? 'winner' : rightWon ? 'loser' : 'draw');
            }
        });
    });
    rightTroopIds.forEach((troopId) => {
        leftTroopIds.forEach((otherTroopId) => {
            const record = aggregate.against[troopId]?.[otherTroopId];
            if (record) {
                applyOutcomeToSide(record, outcome, rightWon ? 'winner' : leftWon ? 'loser' : 'draw');
            }
        });
    });
    leftTroopIds.forEach((troopId) => {
        leftTroopIds.forEach((teammateTroopId) => {
            if (troopId === teammateTroopId) {
                return;
            }
            const record = aggregate.alongside[troopId]?.[teammateTroopId];
            if (record) {
                applyOutcomeToSide(record, outcome, leftWon ? 'winner' : rightWon ? 'loser' : 'draw');
            }
        });
    });
    rightTroopIds.forEach((troopId) => {
        rightTroopIds.forEach((teammateTroopId) => {
            if (troopId === teammateTroopId) {
                return;
            }
            const record = aggregate.alongside[troopId]?.[teammateTroopId];
            if (record) {
                applyOutcomeToSide(record, outcome, rightWon ? 'winner' : leftWon ? 'loser' : 'draw');
            }
        });
    });
}
export function mergePermutationAggregates(base, incoming) {
    base.troopIds.forEach((troopId) => {
        const baseOverall = base.overall[troopId];
        const incomingOverall = incoming.overall[troopId];
        baseOverall.wins += incomingOverall.wins;
        baseOverall.losses += incomingOverall.losses;
        baseOverall.draws += incomingOverall.draws;
        baseOverall.samples += incomingOverall.samples;
        base.troopIds.forEach((otherTroopId) => {
            if (troopId === otherTroopId) {
                return;
            }
            const baseAgainst = base.against[troopId]?.[otherTroopId];
            const incomingAgainst = incoming.against[troopId]?.[otherTroopId];
            if (baseAgainst && incomingAgainst) {
                baseAgainst.wins += incomingAgainst.wins;
                baseAgainst.losses += incomingAgainst.losses;
                baseAgainst.draws += incomingAgainst.draws;
                baseAgainst.samples += incomingAgainst.samples;
            }
            const baseAlongside = base.alongside[troopId]?.[otherTroopId];
            const incomingAlongside = incoming.alongside[troopId]?.[otherTroopId];
            if (baseAlongside && incomingAlongside) {
                baseAlongside.wins += incomingAlongside.wins;
                baseAlongside.losses += incomingAlongside.losses;
                baseAlongside.draws += incomingAlongside.draws;
                baseAlongside.samples += incomingAlongside.samples;
            }
        });
    });
    return base;
}
function finalizeRecord(record, troopId, quantity) {
    const decisiveSamples = record.wins + record.losses;
    return {
        troopId,
        label: getUnitType(troopId).label,
        quantity,
        wins: record.wins,
        losses: record.losses,
        draws: record.draws,
        samples: record.samples,
        decisiveWinRate: decisiveSamples === 0 ? 0 : fixed(record.wins / decisiveSamples),
        drawRate: record.samples === 0 ? 0 : fixed(record.draws / record.samples),
    };
}
function sortMatrixEntries(entries) {
    return [...entries].sort((left, right) => right.decisiveWinRate - left.decisiveWinRate ||
        right.drawRate - left.drawRate ||
        left.troopId.localeCompare(right.troopId));
}
export function finalizePermutationAggregate(aggregate, teamSize, teamCount, matchupCount, runCount, elapsedMs, generatedAt = new Date().toISOString()) {
    const troops = aggregate.troopIds.map((troopId) => ({
        troopId,
        label: aggregate.labels[troopId],
        quantity: aggregate.quantities[troopId],
    }));
    return {
        mode: `permutations-${teamSize}v${teamSize}`,
        teamSize,
        runCount,
        troopCount: aggregate.troopIds.length,
        teamCount,
        matchupCount,
        elapsedMs,
        generatedAt,
        troops,
        overall: sortMatrixEntries(aggregate.troopIds.map((troopId) => finalizeRecord(aggregate.overall[troopId], troopId, aggregate.quantities[troopId]))),
        against: aggregate.troopIds.map((troopId) => ({
            troopId,
            label: aggregate.labels[troopId],
            quantity: aggregate.quantities[troopId],
            entries: sortMatrixEntries(aggregate.troopIds
                .filter((otherTroopId) => otherTroopId !== troopId)
                .map((otherTroopId) => finalizeRecord(aggregate.against[troopId]?.[otherTroopId] ?? emptyRecord(), otherTroopId, aggregate.quantities[otherTroopId]))),
        })),
        alongside: aggregate.troopIds.map((troopId) => ({
            troopId,
            label: aggregate.labels[troopId],
            quantity: aggregate.quantities[troopId],
            entries: sortMatrixEntries(aggregate.troopIds
                .filter((otherTroopId) => otherTroopId !== troopId)
                .map((otherTroopId) => finalizeRecord(aggregate.alongside[troopId]?.[otherTroopId] ?? emptyRecord(), otherTroopId, aggregate.quantities[otherTroopId]))),
        })),
    };
}
function renderTable(entries) {
    return [
        '| Troop | Qty | Win % | Draw % | Wins | Losses | Draws | Samples |',
        '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
        ...entries.map((entry) => `| ${entry.label} | ${entry.quantity} | ${entry.decisiveWinRate.toFixed(3)} | ${entry.drawRate.toFixed(3)} | ${entry.wins} | ${entry.losses} | ${entry.draws} | ${entry.samples} |`),
    ];
}
export function renderPermutationReport(data) {
    return [
        `# ${data.teamSize}v${data.teamSize} Permutation Report`,
        '',
        `- Generated: ${data.generatedAt}`,
        `- Eligible troops: ${data.troopCount}`,
        `- Teams: ${data.teamCount}`,
        `- Matchups: ${data.matchupCount}`,
        `- Runs per matchup: ${data.runCount}`,
        `- Elapsed ms: ${data.elapsedMs}`,
        '',
        '## Overall troop winrates',
        '',
        ...renderTable(data.overall),
        '',
        '## Against every troop type',
        '',
        ...data.against.flatMap((section) => [
            `### ${section.label}`,
            '',
            ...renderTable(section.entries),
            '',
        ]),
        '## Alongside every troop type',
        '',
        ...data.alongside.flatMap((section) => [
            `### ${section.label}`,
            '',
            ...renderTable(section.entries),
            '',
        ]),
    ].join('\n');
}
export function runPermutationBatch(teamSize, matchups, runCount, unitTypeIds) {
    const aggregate = createEmptyPermutationAggregate(unitTypeIds);
    const quantities = Object.fromEntries(unitTypeIds.map((troopId) => [troopId, resolvePermutationQuantity(troopId)]));
    const results = matchups.map((matchup) => {
        const sweep = sweepBattleSeeds((seed) => buildBalanceBattleInput(seed, matchup.left.troopIds.map((troopId, index) => createUnitTypeCombatant(troopId, {
            side: 'player',
            quantity: quantities[troopId],
            combatantId: `player-${matchup.index}-${index}-${troopId}`,
        })), matchup.right.troopIds.map((troopId, index) => createUnitTypeCombatant(troopId, {
            side: 'enemy',
            quantity: quantities[troopId],
            combatantId: `enemy-${matchup.index}-${index}-${troopId}`,
        }))), createPermutationSeeds(teamSize, matchup.index, runCount));
        sweep.entries.forEach((entry) => {
            applyPermutationOutcome(aggregate, matchup.left.troopIds, matchup.right.troopIds, entry.metrics.outcome);
        });
        return {
            matchupKey: matchup.key,
            record: {
                playerWins: sweep.summary.wins,
                enemyWins: sweep.summary.losses,
                draws: sweep.summary.draws,
                samples: sweep.summary.battles,
            },
        };
    });
    return { aggregate, results };
}
export function serializePermutationAggregate(aggregate) {
    return {
        troopIds: [...aggregate.troopIds],
        quantities: Object.fromEntries(Object.entries(aggregate.quantities)),
        labels: Object.fromEntries(Object.entries(aggregate.labels)),
        overall: Object.fromEntries(aggregate.troopIds.map((troopId) => [troopId, cloneRecord(aggregate.overall[troopId])])),
        against: Object.fromEntries(aggregate.troopIds.map((troopId) => [
            troopId,
            Object.fromEntries(aggregate.troopIds
                .filter((otherTroopId) => otherTroopId !== troopId)
                .map((otherTroopId) => [otherTroopId, cloneRecord(aggregate.against[troopId]?.[otherTroopId])])),
        ])),
        alongside: Object.fromEntries(aggregate.troopIds.map((troopId) => [
            troopId,
            Object.fromEntries(aggregate.troopIds
                .filter((otherTroopId) => otherTroopId !== troopId)
                .map((otherTroopId) => [otherTroopId, cloneRecord(aggregate.alongside[troopId]?.[otherTroopId])])),
        ])),
    };
}
//# sourceMappingURL=permutationReport.js.map