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
- Rate: +10%
- Armor: +1
- Capacity: +1
- Cost modifier: none
- Race abilities: none

Race upgrades:

- Tier 1: `Tubthumping` - all human troops gain `United`; harmful damage or rate reductions become `+1` instead
- Tier 2: `Combined Arms` - all human troops gain `Combined Arms 20`
- Tier 2: `Hold the Standard` - whenever a non-`Fading` ally dies, each Human unit restores 15 health

## Elves

- Added attributes: `elf`
- Health: -10%
- Damage: +10%
- Rate: +20%
- Move: +1
- Cost modifier: none
- Race abilities: none

Race upgrades:

- Tier 1: `Feline Grace` - all non-melee elven troops gain +2 range; the first time each battle an engaged elven backline unit retreats 1 hex for free
- Tier 2: `Silvershot Doctrine` - ranged and caster attacks gain +1 damage and +2 readiness per hex of distance; attacks made from max range make the target lose 30 readiness
- Tier 3: `Forsaken` - all elven troops gain `Forsaken 80`

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

- Tier 1: `Gallowsworn` - all goblin troops gain `Goblin Farewell` and `Snatch the Moment`
- Tier 2: `Horde` - all goblin troops gain `Horde 4`
- Tier 1: `Overwhelm Hex` - when a Goblin is present, a random unit from each enemy troop gains 1 stack of Hex at battle start; enemies lose health equal to your living Goblins per Hex stack at end of turn

## Trolls

- Added attributes: `troll`
- Health: +30%
- Damage: +20%
- Rate: -20%
- Size: +1
- Capacity: +1
- Cost modifier: none
- Race abilities: `Regen 5`

Race upgrades:

- Tier 1: `Gargantuan Zeal` - when a Troll is present, a random unit from each allied troop gains 1 stack of Zeal at battle start; allies gain damage based on their bulk per Zeal stack
- Tier 2: `Mossblood` - all troll troops gain `Frenzy: Ramp 1`; each troll survives the first lethal hit at 25 HP and loses Regen for that battle
- Tier 2: `Rowdy Regrowth` - whenever a Troll regains health, it gains 20 readiness and +1 damage

## Dwarves

- Added attributes: `dwarf`
- Health: +20%
- Rate: -10%
- Move: -1
- Armor: +3
- Capacity: +1
- Cost modifier: none
- Race abilities: none

Race upgrades:

- Tier 1: `Diggy Hole` - Dwarven units do not spawn at battle start; after 10 beats, they spawn on the enemy side of the board with 100 readiness
- Tier 2: `Ale and Hearty` - Dwarven troops gain +60% rate, but one random unit from each Dwarven troop has rate set to 1 at combat start
- Tier 3: `Stall Warts` - Dwarven troops gain +1 armor and lose 1 rate for the battle after they are hit by normal attacks

## Orcs

- Added attributes: `orc`
- Health: +10%
- Damage: +10%
- Rate: +10%
- Range: -2 for non-melee units only
- Armor: -1
- Size: +1
- Capacity: -1, clamped to a minimum of 0
- Cost modifier: none
- Race abilities: `Frenzy: Ramp 1`

Race upgrades:

- Tier 1: `Seeing Red` - whenever an Orc kills an enemy unit, it loses 1 armor for the battle and gains 75 readiness
- Tier 2: `First Blood` - Orc units make an immediate normal attack when they engage, before the normal engagement attack
- Tier 3: `Berserk` - when an Orc would die from health loss, it stops losing health, has its readiness set to 0, and dies at the end of its next turn

## Fae

- Added attributes: `fae`
- Health: -20%
- Rate: +10%
- Armor: -3
- Size: -1, clamped to a minimum of 1
- Cost modifier: none
- Race abilities: `Summon Wolf 1`

Race upgrades:

- Tier 2: `Glamour` - once per battle per Fae unit, redirect an incoming normal attack to a random enemy in range; triggered attack effects resolve as though the Fae made the attack
- Tier 3: `Changeling` - if a Fae troop was brought to battle, after beat 12 one random enemy unit from each enemy troop changes sides
- Tier 3: `Whimsy` - whenever a Fae unit loses health, it relocates to a random hex
