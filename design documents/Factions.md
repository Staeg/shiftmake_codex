# Factions

This document lists the currently implemented factions and faction-wide upgrades.

Faction identity is defined by stat adjustments, added attributes, abilities, faction upgrades, and a native troop roster. Rifts can still unlock unusual cross-faction troop combinations outside those native rosters.

## Native troop rosters

These are the currently implemented default recruit pools for each faction.

- Humans: `soldier`, `archer`, `knight`, `priest`, `wizard`
- Elves: `archer`, `ranger`, `druid`, `beastmaster`, `champion`
- Goblins: `militia`, `soldier`, `shaman`, `necromancer`, `wizard`
- Trolls: `champion`, `avenger`, `priest`, `shaman`, `elementalist`
- Dwarves: `soldier`, `knight`, `avenger`, `necromancer`, `elementalist`
- Orcs: `militia`, `soldier`, `champion`, `avenger`, `beastmaster`
- Fae: `ranger`, `druid`, `shaman`, `wizard`, `elementalist`

## Humans

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
- Tier 2: `Stoneblood` - each troll survives the first lethal hit at 25 HP and loses Regen for that battle
- Tier 2: `Rowdy Regrowth` - whenever a Troll is healed, it gains 15 initiative
- Tier 3: `Troll Frenzy` - all troll troops gain `Frenzy: Ramp 1`
- Tier 3: `Crushing Sweep` - troll melee kills splash damage across the hex based on troll size

## Dwarves

- Added attributes: `dwarf`
- Health: +20%
- Speed: -15%
- Armor: +3
- Capacity: +1
- Cost modifier: none
- Faction abilities: none

Faction upgrades:

- Tier 1: `Diggy Hole` - Dwarven units do not spawn at battle start; after 10 beats, they spawn on the enemy side of the board
- Tier 2: `Ale and Hearty` - Dwarven troops gain +40% speed, but one random unit from each Dwarven troop has speed set to 1 at combat start
- Tier 2: `Mycelial Beards` - damage a Dwarven unit would receive is split among all Dwarven units on its hex after mitigation
- Tier 3: `Stall Warts` - Dwarven troops gain +1 armor and lose 1 speed for the battle after they are hit by normal attacks

## Orcs

- Added attributes: `orc`
- Health: +10%
- Damage: +25%
- Speed: +10%
- Armor: -1
- Capacity: -1, clamped to a minimum of 0
- Cost modifier: none
- Faction abilities: none

Faction upgrades:

- Tier 1: `Seeing Red` - whenever an Orc kills an enemy unit, it loses 1 armor for the battle and gains 75 initiative
- Tier 2: `First Blood` - Orc units make an immediate normal attack when they engage, before the normal engagement attack
- Tier 3: `Warcry` - when an enemy dies on a hex with an Orc unit, all allied units gain +1 damage for the battle; multiple Orcs can trigger from the same death
- Tier 3: `Berserk` - when an Orc would die from damage, it becomes immune to damage, has its initiative set to 0, and dies at the end of its next turn

## Fae

- Added attributes: `fae`
- Health: -20%
- Speed: +15%
- Range: +1 for non-melee units only
- Armor: -1
- Cost modifier: none
- Faction abilities: none

Faction upgrades:

- Tier 1: `Ensorcel` - at combat start, mark a random enemy prioritized by frontline, chaff, then backline; the marked unit loses all abilities, Fae target it while it is in range, and a new enemy is marked when it dies
- Tier 2: `Glamour` - once per battle per Fae unit, redirect an incoming normal attack to a random enemy in range; triggered attack effects resolve as though the Fae made the attack
- Tier 3: `Changeling` - if a Fae troop was brought to battle, after beat 12 one random enemy unit from each enemy troop changes sides
- Tier 3: `Whimsy` - whenever a Fae unit takes damage, it relocates to a random hex
