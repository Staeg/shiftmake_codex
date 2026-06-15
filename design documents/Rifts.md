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
- optional Guardian upgrade snapshot ids for Ladder enemy resolution
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
- mutator distribution: generation deals mutators from a cycle-level shuffled bag, so the 4 visible Rifts are spread as evenly as possible before any mutator repeats

## Mutators

Implemented mutators:

- `Momentum`: all units gain +10 initiative each beat
- `Haze`: all units lose 5 initiative each beat
- `Heavy Air`: ranged attacks deal 50% damage
- `Animated`: all units lose `Fading`
- `Corrosion`: all units start with 0 armor and cannot have positive armor during that battle
- `Quakes`: every 10 beats, each unit is displaced to a random adjacent anchor position if its full footprint fits
- `Decay`: every beat, each unit loses 1 HP ignoring armor

## Enemy generation

Enemy armies are no longer budget-based.

Current rules:

- shuffle the full pool of non-summoned faction and troop-type combinations
- select exactly `min(tier, 3) + 1` unique combinations
- create one enemy combatant group for each selected combination
- derive quantity exactly the same way as player troops: `120 / resolved cost`

This means enemy Rifts can use off-roster faction and troop-type pairings just like player unlocks can.

## Capacity metadata

Each Rift still stores a legacy `saturation` value from `3` to `15`.

This value is passed into battle inputs and replay payloads for compatibility and reporting. Normal battle placement and movement now use explicit `mapHexes` plus full unit footprints instead of same-hex saturation occupancy.

## Assignment limits

Current Rift assignment restrictions:

- a troop cannot be assigned while recovering
- a troop can only be assigned to one Rift at a time
- every ready troop that is not already occupying a Contest Rift must be assigned before the cycle can end
- no more than one troop from the same faction can enter the same Rift unless that faction has the `United` overworld effect
- no more than one troop of the same troop type can enter the same Rift

## Rewards

Rifts award VP and can record enemy troop combinations as latent future unlocks.

- `victoryPoints = tier`
- winning can add off-roster enemy `faction/unitType` combinations to the latent future-unlock pool
- latent combinations from locked factions are not draftable until that faction is unlocked
- no gold
- no Essence payout
- no upgrade batches
- no blueprints

The reward preview in the UI should therefore show:

- tier
- mutators
- enemy army
- saturation compatibility metadata
- VP reward

## Lifecycle note

Generated Rifts are one-cycle opportunities. Any discovered Rift that is not played before the cycle advances expires immediately.

## Ladder Rift-sets

Campaign creates Rifts locally from the deterministic cycle generator. Ladder instead draws a compact Rift-set from the Ladder server for each cycle.

Each Ladder Rift-set stores:

- Rift id
- Cycle
- tier
- mutator ids
- saturation compatibility metadata
- VP value
- Guardian faction and troop-type identities
- Guardian faction upgrade ids
- Guardian troop-type upgrade ids

Guardian upgrade ids are snapshots from the player who conquered that Rift in a previous Ladder cycle. The payload stores identities and upgrade ids, not baked combat stats, so Guardians are resolved by the normal engine combatant rules when the Rift-set is drawn.

After a Ladder cycle resolves, the played parent Rift-set is harvested into a child set:

- parent appearances increments by 1
- the parent may be marked spent
- conquered Rifts replace their Guardians with the player's assigned troops and current upgrade snapshots
- unconquered Rifts retain their previous Guardians
