# Upgrades and unlocks

This document describes the upgrade and unlock systems that are currently implemented.

## Resources

- `gold`: used for upgrades and adding units
- `essence`: used for faction and troop unlocks

## Unlocking factions

Current implementation:

- At campaign start, the player chooses 1 starting faction for free.
- Unlocking an additional faction costs `100 * current unlocked faction count` essence.
- Unlocking a faction immediately creates that faction's Soldier troop at quantity `1`.

The older idea of random post-start faction draft choices is not currently implemented.

## Unlocking troop types

A faction may only unlock troop types from its `defaultUnitTypeIds`.

Rules:

- Soldier is the only troop type granted automatically when a faction is unlocked.
- A troop type cannot be unlocked twice for the same faction.
- Newly unlocked troop types start at quantity `1`.
- Troop unlock cost is `100` essence for each currently unlocked troop.

## Adding units to a troop

Buying a unit increases that troop's quantity by 1.

Cost is based on total troop-selection cost growth using the troop's per-unit cost:

- first compute the total cost of the troop at current quantity
- compute it again at quantity +1
- the purchase price is the difference

Because troops now start at quantity `1`, every extra unit after the first uses the escalating extra-unit curve.

## Troop stat upgrades

Implemented upgradeable stats:

- health
- damage
- speed for champions and wizards
- armor for soldiers and knights
- range for archers

Upgrade effects:

- health, damage, speed: +10% multiplicative per level
- armor: +1 per level
- range: +1 per level

Current formulas:

- health/damage/speed cost: `(100 / 10) * (existing levels + 1)`
- armor cost: `(100 / 20 + starting armor) * (existing levels + 1)`
- range/capacity style cost formula uses `100` as its base value; capacity upgrades are not currently granted to any unit type

## Faction upgrades

Faction upgrades are global for all troops in that faction.

Implemented sources:

- `default`: purchasable in planning with gold
- `rift`: earned through reward choices after victories

Implemented effect kinds:

- add an ability
- add an attribute
- modify stats, optionally only for non-melee troops

## Reward upgrades

Victorious Rifts can generate choice batches of 3 faction upgrades.

Important current limitation:

- only faction upgrades exist as reward choices
- troop-type-wide upgrades are not currently implemented
- blueprint rewards are not implemented and always fall back to resources
