# Rifts

This document describes the current Rift system.

## Rift identity

Each generated Rift currently contains:

- `id`
- `cycleNumber`
- `seed`
- `tier`
- `mutatorIds`
- `enemyArmy`
- `rewardPackage`
- `saturation`
- `expiresInCycles`
- `state`

Current states:

- `discovered`
- `resolved_victory`
- `resolved_defeat`
- `expired`

## Tier schedule

Current implemented schedule by cycle:

- Cycle 1: `2 / 1 / 1 / 1`
- Cycle 2: `2 / 2 / 1 / 1`
- Cycle 3: `3 / 2 / 1 / 1`
- Cycle 4: `3 / 2 / 2 / 1`
- Cycle 5: `3 / 3 / 2 / 1`
- Cycle 6+: `4 / 3 / 2 / 1`

There are always 4 newly generated Rifts per cycle in the current implementation.

## Tier effects

Tier currently affects:

- enemy stat scaling: `+20%` health, damage, and speed per tier above 1
- number of enemy combatant groups: `tier + 1`
- number of reward slots
- mutator count: currently always 1 mutator for any tier above 0

## Mutators

Implemented mutators:

- `Momentum`: all units gain +10 initiative each beat
- `Heavy Air`: ranged attacks deal 50% damage
- `Rich`: enemy budget x1.5, rewards x2
- `Outpost`: enemy budget x0.8
- `Quagmire`: enemy budget x0.5, recovery x2

## Enemy generation

Enemy armies are generated from a budget.

Current rules:

- base budget = `150 * tier`
- budget gets a random variance of `0.9`, `0.95`, `1`, `1.05`, or `1.1`
- mutators multiply the budget
- random faction/unit-type pairs are shuffled from all default faction rosters
- the Rift selects `tier + 1` pairs
- budget is split evenly across those selections
- quantity for each group is `floor(perSelectionBudget / perUnitCost)`, minimum 1

Enemy per-unit budget cost is the troop's per-unit cost. Because all troop types now start at quantity `1`, this is numerically the same as the troop's listed cost.

## Saturation

Each Rift gets a random saturation value from `3` to `15`.

This value is passed into the battle resolver and directly changes movement and spawn density.

## Rewards

`RewardPackage` currently contains:

- `resources.gold`
- `resources.essence`
- `upgradeChoiceBatches`
- `summaryParts`

Reward generation:

- slot 1 is always either gold or essence
- additional slots up to the Rift tier pick distinct categories from the remaining pool
- categories are `gold`, `essence`, `upgrade`, `blueprint`
- `blueprint` currently always falls back to resource rewards
- `upgrade` becomes an upgrade choice batch only if at least 3 eligible faction upgrades remain

Base resource values per reward slot tier:

- gold: `50 * slotTier`
- essence: `50 * slotTier`

Fallback reward when a blueprint or exhausted upgrade slot is rolled:

- `29 * slotTier` gold
- `20 * slotTier` essence

`Rich` doubles gold and essence rewards. It also doubles upgrade-choice batches, then floors to a whole number.

## Reward choices

Victorious Rifts can generate reward-choice batches after battle resolution.

Current implementation:

- each batch offers 3 unowned faction upgrades
- the options come from unlocked factions only
- options are consumed from a simple pool slice, not weighted by relevance beyond faction unlock status

## Lifecycle note

Rifts still store `expiresInCycles: 2`, but the current campaign flow expires all unplayed discovered Rifts as soon as the cycle advances. In practice, a generated Rift is only playable during its own planning cycle.
