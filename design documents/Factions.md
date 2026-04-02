# Factions

This document lists the currently implemented factions and faction-wide upgrades.

Any non-summoned unit type can now be paired with any faction. Faction identity is defined by stat adjustments, added attributes, abilities, and faction upgrades rather than by a restricted troop roster.

## Humans

- Description: "Slightly better at pretty much everything. Boring but solid."
- Added attributes: `human`
- Health: +10%
- Damage: +10%
- Speed: +10%
- Armor: +1
- Capacity: +1
- Cost modifier: none
- Faction abilities: none

Faction upgrades:

- Tier 1: `Humans United` - all human troops gain `United`
- Tier 2: `Human Combined Arms` - all human troops gain `Combined Arms 20`

## Elves

- Description: "Feared from afar. Less so up close."
- Added attributes: `elf`
- Health: -10%
- Damage: +20%
- Speed: +20%
- Range: +1 for non-melee units only
- Cost modifier: none
- Faction abilities: none

Faction upgrades:

- Tier 1: `Elven Eyes` - all non-melee elven troops gain +1 range
- Tier 3: `Elven Forsaken` - all elven troops gain `Forsaken 80`

## Goblins

- Description: "The one good thing you can say about goblins is that there's more than one of them."
- Added attributes: `goblin`, `expendable`
- Health: -30%
- Damage: -20%
- Range: -1 for non-melee units only
- Armor: -2
- Size: -1, clamped to a minimum of 1
- Capacity: -2, clamped to a minimum of 0
- Cost modifier: -50%
- Faction abilities: none

Faction upgrades:

- Tier 1: `Goblin Farewell` - all goblin troops gain `Goblin Farewell`
- Tier 2: `Goblin Pack` - all goblin troops gain `Pack 1`

## Trolls

- Description: "Never down for the count, never down for counting."
- Added attributes: `troll`
- Health: +30%
- Damage: +20%
- Speed: -20%
- Size: +1
- Capacity: +1
- Cost modifier: none
- Faction abilities: `Regen 5`

Faction upgrades:

- Tier 1: `Troll Momentum` - all troll troops gain `Ramp 1`
- Tier 3: `Troll Frenzy` - all troll troops gain `Frenzy: Ramp 1`
