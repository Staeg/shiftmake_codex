# Upgrades and unlocks

This document describes the current progression system.

## Currency

The only progression currency is `Essence`.

Current rules:

- the opening faction-and-troop choice is free
- each cycle grants `+2` Essence after battles resolve
- claiming a troop unlock costs `1` Essence
- claiming an upgrade unlock costs `1` Essence
- unused Essence carries over between cycles

Removed from the progression model:

- gold
- buying units
- stat upgrades
- faction unlock purchases
- blueprints
- post-battle reward claims

## Unlocking troops

Each faction has a native troop roster that can appear in normal troop offers.

Off-roster faction-and-troop combinations are not part of the normal pool by default. They are unlocked by winning Rifts that contain those combinations.

Owning any troop from a faction marks that faction as owned for draft bucketing.

Current roster rule:

- the campaign keeps at most one troop per `faction/unitType` combination
- claiming a troop unlock immediately adds that troop to the player's roster if it is not already owned
- Rift-earned off-roster unlocks do not immediately add a troop; they add that combination to the future troop-offer pool

## Troop offer generation

Troop offers show 3 unique options.

Buckets are filled in this order:

1. a troop from a faction the player already owns
2. a troop of a unit type the player already owns
3. a troop from a faction the player does not yet own

If any bucket cannot be satisfied, that slot falls back to a random unowned troop unlock from the remaining pool.

Generated offers persist in save data until they are claimed or the cycle advances.

Offer candidate pool:

- all native troop combinations across the current factions
- any off-roster troop combinations previously unlocked through Rift victories

Opening pick rule:

- the opening pick only shows native faction rosters

## Unlocking upgrades

Upgrades are permanent unlocks, not purchases with escalating costs.

Implemented upgrade families:

- faction upgrades
- troop-type upgrades

There are no troop stat upgrades.

## Upgrade offer generation

Upgrade offers show 3 unique options.

Buckets are filled in this order:

1. a troop-type upgrade for a unit type the player already owns
2. a faction upgrade for a faction the player already owns
3. an upgrade that matches neither of the first two buckets

If any bucket cannot be satisfied, that slot falls back to a random unowned upgrade from the remaining pool.

Generated offers persist in save data until they are claimed or the cycle advances.

## Implemented faction upgrades

- `Humans United`
- `Human Combined Arms`
- `Elven Eyes`
- `Elven Forsaken`
- `Goblin Farewell`
- `Goblin Pack`
- `Troll Momentum`
- `Troll Frenzy`

## Implemented troop-type upgrades

- `Shredding Arrows`
- `Sevenfold`
- `Blood in the Water`
- `Executioner`
- `Wild Growth`
- `Mitosis`
- `Retaliate`
- `Scurry`
- `Alternate Fuel`
- `Rising Tide`
- `Zeal`
- `Concussive Shots`
- `Serve Once More`
- `Storm`

Removed upgrade:

- `Just a bunch of guys`
