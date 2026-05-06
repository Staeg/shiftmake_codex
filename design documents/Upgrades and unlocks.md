# Upgrades and unlocks

This document describes the current progression system.

## Currency

The only progression currency is `Essence`.

Current rules:

- the two opening faction-and-troop choices are free
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

Each unlocked faction has a native troop roster that can appear in normal troop offers.

Off-roster faction-and-troop combinations are not part of the normal pool by default. They enter a latent future-unlock pool by winning Rifts that contain those combinations.

Owning any troop from a faction marks that faction as owned for draft bucketing.

Current roster rule:

- the campaign keeps at most one troop per `faction/unitType` combination
- claiming a troop unlock immediately adds that troop to the player's roster if it is not already owned
- Rift-earned off-roster unlocks do not immediately add a troop
- latent Rift-earned combinations only become normal troop-offer candidates after their faction is unlocked

## Troop offer generation

Troop offers show 3 unique options.

Buckets are filled in this order:

1. a troop from a faction the player already owns
2. a troop of a unit type the player already owns
3. a recently defeated latent troop whose faction is already owned, then another troop from an owned faction

If any bucket cannot be satisfied, that slot falls back to a random unowned troop unlock from the remaining claimable pool.

Generated offers persist in save data until they are claimed or the cycle advances.

Offer candidate pool:

- native troop combinations for unlocked factions only
- latent off-roster troop combinations previously discovered through Rift victories, but only after their faction is unlocked

Opening pick rule:

- the opening screen only shows native faction rosters
- the player must choose two starting troops
- the two starting troops must have different factions and different troop types
- after the opening campaign starts, only those two factions' native rosters are claimable in normal troop drafts

## Scheduled faction unlocks

At the start of cycle 3:

- choose from up to 3 still-locked factions
- each faction option shows its native troop roster
- each faction option also shows defeated-enemy troop combinations already discovered for that faction, as future unlock potential
- the chosen faction immediately receives 1 randomly selected faction upgrade
- after choosing the faction, choose 2 troop type unlocks for that faction sequentially, from its native roster plus any latent defeated troops for that faction

At the start of cycle 7:

- repeat the same faction choice flow
- the chosen faction immediately receives 2 randomly selected faction upgrades
- after choosing the faction, choose 3 troop type unlocks for that faction sequentially, from its native roster plus any latent defeated troops for that faction

With the current 4-faction content set, fewer than 3 faction options can appear if fewer than 3 factions remain locked.

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
