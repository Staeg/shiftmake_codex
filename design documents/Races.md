# Races

This document lists the currently implemented races and race-wide upgrades.

Race identity is defined by stat adjustments, added attributes, abilities, race upgrades, and a native troop roster. Rifts can still unlock unusual cross-race troop combinations outside those native rosters.

## Native troop rosters

These are the currently implemented default recruit pools for each race.

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
- Race abilities: none

Race upgrades:

- Tier 1: `Tubthumping` - all human troops gain `United`; harmful damage or speed reductions become `+1` instead
- Tier 2: `Human Combined Arms` - all human troops gain `Combined Arms 20`
- Tier 2: `Hold the Standard` - whenever a non-`Fading` ally dies touching a Human unit, that Human unit heals 15

## Elves

- Added attributes: `elf`
- Health: -10%
- Damage: +20%
- Speed: +20%
- Range: +1 for non-melee units only
- Cost modifier: none
- Race abilities: none

Race upgrades:

- Tier 1: `Elven Reflexes` - all non-melee elven troops gain +1 range; the first time each battle an engaged elven backline unit retreats 1 hex for free
- Tier 2: `Silvershot Doctrine` - ranged and caster attacks gain +1 damage and +2 initiative per hex of distance; attacks made from max range make the target lose 30 initiative
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
- Race abilities: none

Race upgrades:

- Tier 1: `Goblin Behavior` - all goblin troops gain `Goblin Farewell` and `Snatch the Moment`
- Tier 2: `Goblin Pack` - all goblin troops gain `Pack 1`
- Tier 3: `Loot Frenzy` - when a Goblin gets a kill, allies touching the fallen unit heal 10 and gain 30 initiative

## Trolls

- Added attributes: `troll`
- Health: +30%
- Damage: +20%
- Speed: -20%
- Size: +1
- Capacity: +1
- Cost modifier: none
- Race abilities: `Regen 5`

Race upgrades:

- Tier 1: `Roll the Boulder` - all troll troops gain `Ramp 1` and `Crushing Sweep`
- Tier 2: `Mossblood` - each troll survives the first lethal hit at 25 HP and loses Regen for that battle; all troll troops gain `Frenzy: Ramp 1`
- Tier 2: `Rowdy Regrowth` - whenever a Troll is healed, it gains 20 initiative

## Dwarves

- Added attributes: `dwarf`
- Health: +20%
- Speed: -15%
- Armor: +3
- Capacity: +1
- Cost modifier: none
- Race abilities: none

Race upgrades:

- Tier 1: `Diggy Hole` - Dwarven units do not spawn at battle start; after 10 beats, they spawn on the enemy side of the board
- Tier 2: `Ale and Hearty` - Dwarven troops gain +40% speed, but one random unit from each Dwarven troop has speed set to 1 at combat start
- Tier 3: `Stall Warts` - Dwarven troops gain +1 armor and lose 1 speed for the battle after they are hit by normal attacks

## Orcs

- Added attributes: `orc`
- Damage: +25%
- Speed: +10%
- Armor: -1
- Capacity: -1, clamped to a minimum of 0
- Cost modifier: none
- Race abilities: none

Race upgrades:

- Tier 1: `Seeing Red` - whenever an Orc kills an enemy unit, it loses 1 armor for the battle and gains 75 initiative
- Tier 2: `First Blood` - Orc units make an immediate normal attack when they engage, before the normal engagement attack
- Tier 3: `Berserk` - when an Orc would die from damage, it becomes immune to damage, has its initiative set to 0, and dies at the end of its next turn

## Fae

- Added attributes: `fae`
- Health: -20%
- Speed: +15%
- Range: +1 for non-melee units only
- Armor: -1
- Cost modifier: none
- Race abilities: none

Race upgrades:

- Tier 2: `Glamour` - once per battle per Fae unit, redirect an incoming normal attack to a random enemy in range; triggered attack effects resolve as though the Fae made the attack
- Tier 3: `Changeling` - if a Fae troop was brought to battle, after beat 12 one random enemy unit from each enemy troop changes sides
- Tier 3: `Whimsy` - whenever a Fae unit takes damage, it relocates to a random hex
