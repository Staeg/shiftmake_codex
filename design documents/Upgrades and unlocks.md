# Upgrades and unlocks

This document describes the upgrade and unlock systems that are currently implemented.

## Resources

- `gold`: used for upgrades and adding units
- `essence`: used for faction and troop unlocks

## Unlocking factions

Current implementation:

- At campaign start, the player chooses 1 starting faction for free.
- Unlocking an additional faction costs `100 * current unlocked faction count` essence.
- Unlocking a faction immediately creates that faction's Soldier troop.

The older idea of random post-start faction draft choices is not currently implemented.

## Unlocking troop types

A faction may only unlock troop types from its `defaultUnitTypeIds`.

Rules:

- Soldier is the only troop type granted automatically when a faction is unlocked.
- A troop type cannot be unlocked twice for the same faction.
- Troop unlock cost is:
  - `unitType.cost`
  - plus `100` for each already unlocked non-soldier troop in that faction

## Adding units to a troop

Buying a unit increases that troop's quantity by 1.

Cost is based on total troop-selection cost growth:

- first compute the total cost of the troop at current quantity
- compute it again at quantity +1
- the purchase price is the difference

This produces linear cost inside the starting quantity and escalating extra-unit costs beyond it.

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

- health/damage/speed cost: `(troop cost / 10) * (existing levels + 1)`
- armor cost: `(troop cost / 20 + starting armor) * (existing levels + 1)`
- range/capacity style cost formula exists, but capacity upgrades are not currently granted to any unit type

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
