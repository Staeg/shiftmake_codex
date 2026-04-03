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
- `victoryPoints`
- `saturation`
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

There are always 4 newly generated Rifts per cycle.

## Tier effects

Tier currently affects:

- enemy stat scaling: only Tier 4 gets `+20%` health, damage, and speed over base
- number of enemy combatant groups: Tier 1-3 use `tier + 1`, Tier 4 stays at 4 groups
- VP reward: equal to tier
- mutator count: currently 1 mutator per Rift

## Mutators

Implemented mutators:

- `Momentum`: all units gain +10 initiative each beat
- `Heavy Air`: ranged attacks deal 50% damage
- `Quagmire`: recovery x2 for troops assigned to that Rift

## Enemy generation

Enemy armies are no longer budget-based.

Current rules:

- shuffle the full pool of non-summoned faction and troop-type combinations
- select exactly `min(tier, 3) + 1` unique combinations
- create one enemy combatant group for each selected combination
- derive quantity exactly the same way as player troops: `120 / resolved cost`

This means enemy Rifts can use off-roster faction and troop-type pairings just like player unlocks can.

## Saturation

Each Rift gets a random saturation value from `3` to `15`.

This value is passed into the battle resolver and directly changes movement and spawn density.

## Rewards

Rifts award VP and can unlock enemy troop combinations for future troop drafts.

- `victoryPoints = tier`
- winning can add off-roster enemy `faction/unitType` combinations to the player's future troop-offer pool
- no gold
- no Essence payout
- no upgrade batches
- no blueprints

The reward preview in the UI should therefore show:

- tier
- mutators
- enemy army
- saturation
- VP reward

## Lifecycle note

Generated Rifts are one-cycle opportunities. Any discovered Rift that is not played before the cycle advances expires immediately.
