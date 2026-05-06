# Unit details

This document lists the current base unit types before faction modifiers, faction upgrades, or troop-type upgrades are applied.

Summoned units do not have their own unlockable upgrades.

## Stat meanings

- `type`: primary troop identity
- `attributes`: secondary tags
- `health`: HP before death
- `damage`: base normal attack damage
- `speed`: initiative gained each beat
- `range`: hex attack distance, with `0` meaning melee
- `armor`: flat adjustment to incoming normal attack damage; negative armor increases damage taken
- `size`: how much enemy capacity is needed to engage the unit
- `capacity`: how much total enemy size the unit can engage
- `role`: autonomous behavior profile
- `cost`: base troop cost before faction cost modifiers
- `quantity`: derived after faction resolution as `120 / resolved cost`

## Base unit types

### Archer

- Attributes: `ranged`
- Stats: health 30, damage 11, speed 11, range 2, armor 0, size 1, capacity 0
- Role: backline
- Abilities: none
- Cost: 20
- Troop upgrades:
  - `Shredding Arrows` (tier 2): on attack, reduce the target armor by 1 for the battle
  - `Pinning Volley` (tier 2): on attack, reduce the target speed by 1 for the battle

### Avenger

- Attributes: `melee`
- Stats: health 200, damage 6, speed 10, range 0, armor 0, size 2, capacity 1
- Role: frontline
- Abilities: `Vengeance 3`
- Cost: 40
- Troop upgrades:
  - `Sevenfold` (tier 2): consume nearby corpses to summon skeletons, up to 7 times
  - `Blood Oath` (tier 2): when a nearby ally falls, set initiative to 100
  - `Last Witness` (tier 3): when an ally dies on the Avenger's hex, strike the killer twice if it is still there

### Beastmaster

- Attributes: `melee`, `summoner`
- Stats: health 90, damage 8, speed 8, range 0, armor 0, size 2, capacity 1
- Role: frontline
- Abilities: `Summon Wolf 2`
- Cost: 60
- Troop upgrades:
  - `Blood in the Water` (tier 2): starting wolves summon more wolves on kills
  - `Packmaster's Whistle` (tier 3): if engaged, a wolf on the Beastmaster's hex joins the fight and heals 10
  - `Thrill of the Hunt` (tier 3): wolves on the Beastmaster's hex gain 10 initiative at end of turn, and any wolf kill gives allies on that hex +2 damage for the battle

### Champion

- Attributes: `melee`
- Stats: health 130, damage 20, speed 17, range 0, armor 0, size 2, capacity 1
- Role: frontline
- Abilities: `Valor 20`
- Cost: 60
- Troop upgrades:
  - `Executioner` (tier 2): target the lowest-HP legal enemy
  - `Anointed` (tier 3): healing and positive stat gains affecting the Champion are doubled

### Druid

- Attributes: `caster`
- Stats: health 25, damage 11, speed 8, range 2, armor 0, size 1, capacity 0
- Role: backline
- Abilities: `Shapeshift - Bear`
- Cost: 30
- Troop upgrades:
  - `Wild Growth` (tier 2): end of turn, heal self for 60
  - `True Form` (tier 2): shapeshift can trigger a second time
  - `Thornhide` (tier 3): after shapeshifting, normal attackers take 6 damage when they hit the Druid
  - `Bramble Snare` (tier 3): each shapeshift empowers the Druid so its melee hits apply an additional battle-long `-2 speed`
  - `Wild Call` (tier 3): each shapeshift summons 2 wolves

### Elemental

- Attributes: `melee`, `summoned`
- Stats: health 60, damage 13, speed 7, range 2, armor 5, size 1, capacity 3
- Role: frontline
- Abilities: none
- Cost: 20

### Elementalist

- Attributes: `caster`, `summoner`
- Stats: health 25, damage 10, speed 9, range 2, armor 0, size 1, capacity 0
- Role: backline
- Abilities: `Charge 4 Summon Elemental`
- Cost: 30
- Troop upgrades:
  - `Arc Conductor` (tier 2): when an allied elemental dies, blast its hex for 8
  - `Mitosis` (tier 3): each summoned elemental can repeat the elemental summon once
  - `Living Circuit` (tier 3): end of turn, the Elementalist gains 15 initiative once if any allied elemental is in range, and all allied elementals in range gain 15 initiative

### Knight

- Attributes: `melee`
- Stats: health 200, damage 16, speed 7, range 0, armor 10, size 2, capacity 5
- Role: frontline
- Abilities: `Taunt`
- Cost: 60
- Troop upgrades:
  - `Retaliate` (tier 2): answer normal attacks with one normal attack
  - `Brace` (tier 2): start of turn, if engaged at full capacity, gain +5 armor until next turn
  - `Challenge Accepted` (tier 3): enemies redirected by the Knight deal 4 less damage while engaged with it
  - `Sentinel Runes` (tier 3): the first enemy to move off the Knight's hex causes 2 elementals to be summoned on its new hex; if unused, this triggers on death instead

### Militia

- Attributes: `melee`, `expendable`
- Stats: health 40, damage 8, speed 11, range 0, armor 0, size 1, capacity 1
- Role: chaff
- Abilities: none
- Cost: 10
- Troop upgrades:
  - `Rabble Rush` (tier 2): start of turn, gain +1 initiative per other Militia on the same hex
  - `Scurry` (tier 3): does not count toward allied saturation
  - `Dogpile` (tier 3): attacks against enemies engaged by at least 3 allies strike 1 extra time

### Necromancer

- Attributes: `caster`, `summoner`
- Stats: health 40, damage 16, speed 8, range 2, armor 0, size 1, capacity 0
- Role: backline
- Abilities: `Corpse Summon Skeleton`
- Cost: 40
- Troop upgrades:
  - `Alternate Fuel` (tier 2): may spend 10 HP instead of consuming a corpse
  - `Early Riser` (tier 2): summoned skeletons spawn with 100 initiative
  - `Rising Tide` (tier 3): summoned skeletons heal allies on their own hex for 7 each turn
  - `Carrion Choir` (tier 3): consuming a corpse makes nearby enemies lose 1 armor and 1 damage for the battle

### Priest

- Attributes: `caster`
- Stats: health 25, damage 7, speed 8, range 2, armor 0, size 1, capacity 0
- Role: backline
- Abilities: `Mend 4`
- Cost: 20
- Troop upgrades:
  - `Zeal` (tier 3): when a Priest heals a target, that target gains +1 speed and +1 damage for the battle
  - `Mercy Before Dawn` (tier 3): the first time each battle an ally in range would die, it survives at 1 HP
  - `Overflowing Grace` (tier 2): when a Priest heal brings an ally to full HP, that ally gains 40 initiative

### Ranger

- Attributes: `ranged`
- Stats: health 50, damage 16, speed 13, range 3, armor 0, size 1, capacity 0
- Role: backline
- Abilities: `Self Haste 2`
- Cost: 60
- Troop upgrades:
  - `Concussive Shots` (tier 2): on attack, set the target initiative to 0
  - `Skirmisher's Step` (tier 2): after ranged attacks, move to a safer hex that still keeps an enemy in range
  - `Heartseeker` (tier 3): attacks against unengaged targets deal double damage
  - `Scavenger's Hunger` (tier 3): the first 3 kills against non-`Fading` enemies consume the corpse and summon a wolf there

### Shaman

- Attributes: `caster`
- Stats: health 20, damage 11, speed 8, range 2, armor 0, size 1, capacity 0
- Role: backline
- Abilities: `Enhance 1`
- Cost: 20
- Troop upgrades:
  - `War Drums` (tier 2): `Enhance 1` affects all allies on the chosen allied hex
  - `Serve Once More` (tier 3): beneficial effects also make the target summon a skeleton on death and leave no corpse
  - `Static Charge` (tier 3): `Enhance` also gives affected allies 1 extra strike on their next normal attack

### Skeleton

- Attributes: `melee`, `summoned`
- Stats: health 40, damage 13, speed 7, range 0, armor 0, size 1, capacity 1
- Role: chaff
- Abilities: `Bonded`, `Fading`
- Cost: 20

### Soldier

- Attributes: `melee`
- Stats: health 100, damage 10, speed 10, range 0, armor 2, size 1, capacity 2
- Role: frontline
- Abilities: none
- Cost: 24
- Troop upgrade:
  - `Shield Drill` (tier 2): allies on a Soldier's hex take 1 less damage from ranged attacks and strikes

### Wizard

- Attributes: `caster`
- Stats: health 20, damage 9, speed 8, range 2, armor 0, size 1, capacity 0
- Role: backline
- Abilities: `Blast 5`
- Cost: 20
- Troop upgrades:
  - `Storm` (tier 2): every 4 turns, make 4 extra strikes against a random enemy in range
  - `Spell Echo` (tier 2): `Blast` chains to an adjacent hex that has not already been hit in that chain
  - `Leyline Focus` (tier 2): start of turn, if no enemy is within 1 hex, gain 25 initiative
  - `Lightning Rods` (tier 3): `Blast` deals +1 damage per elemental on the target hex, and Wizards summon 1 elemental at battle start

### Wolf

- Attributes: `melee`, `summoned`
- Stats: health 70, damage 6, speed 12, range 2, armor 0, size 1, capacity 1
- Role: frontline
- Abilities: `Bonded`, `Pack 1`
- Cost: 20

## Current faction upgrades

### Humans

- `Humans United` (tier 1): multiple Human troops may enter the same Rift
- `Human Combined Arms` (tier 2): gain +20% health, damage, and speed for each other friendly troop type in the battle
- `Tubthumping` (tier 3): harmful damage or speed reductions become `+1` instead
- `Hold the Standard` (tier 2): whenever a non-`Fading` ally dies on a Human hex, Human units on that hex heal 15

### Elves

- `Elven Eyes` (tier 1): all non-melee Elven troops gain +1 range
- `Fade Into Shadow` (tier 2): the first time an Elven backline unit is engaged each battle, it retreats 1 hex for free
- `Elven Forsaken` (tier 3): if fighting alone with no other friendly troop types, gain +80% health, damage, and speed
- `Long Shot Doctrine` (tier 3): ranged and caster attacks gain +1 damage and +2 initiative per hex of distance
- `Silver Distance` (tier 2): attacks made from max range make the target lose 30 initiative

### Goblins

- `Goblin Farewell` (tier 1): on death, make 1 extra strike against a random enemy on the same hex
- `Goblin Pack` (tier 2): start of turn, gain +1 damage per other friendly unit on the same hex until end of turn
- `Snatch the Moment` (tier 3): on kill, enemies on that hex lose 20 initiative
- `Loot Frenzy` (tier 3): on kill, Goblins on that hex heal 5 and gain 35 initiative

### Trolls

- `Troll Momentum` (tier 1): end of turn, gain +1 damage for the battle
- `Stoneblood` (tier 2): the first lethal hit leaves the Troll alive at 25 HP and removes `Regen 5`
- `Troll Frenzy` (tier 3): after taking damage, gain +1 damage for the battle
- `Crushing Sweep` (tier 3): melee kills deal splash damage equal to `5 x size` on that hex
- `Rowdy Regrowth` (tier 2): whenever a Troll is healed, it gains 15 initiative

### Dwarves

- `Diggy Hole` (tier 1): Dwarven units do not spawn at battle start; after 10 beats, they spawn on the enemy side of the board
- `Ale and Hearty` (tier 2): Dwarven troops gain +40% speed, but one random unit from each Dwarven troop has speed set to 1 at combat start
- `Mycelial Beards` (tier 2): damage a Dwarven unit would receive is split equally among all Dwarven units on that hex after mitigation
- `Stall Warts` (tier 3): Dwarven troops gain +1 armor for the battle after they are hit by normal attacks

### Orcs

- `Seeing Red` (tier 1): whenever an Orc kills an enemy unit, it loses 1 armor for the battle and gains 75 initiative
- `First Blood` (tier 2): Orc units make an immediate normal attack when they engage, before the normal engagement attack
- `Warcry` (tier 3): when an enemy dies on a hex with an Orc unit, all allied units gain +1 damage for the battle; multiple Orcs can trigger from the same death
- `Berserk` (tier 3): when an Orc would die from damage, it becomes immune to damage, has its initiative set to 0, and dies at the end of its next turn

### Fae

- `Ensorcel` (tier 1): at combat start, mark a random enemy prioritized by frontline, chaff, then backline; the marked unit loses all abilities, Fae target it while it is in range, and a new enemy is marked when it dies
- `Glamour` (tier 2): once per battle per Fae unit, redirect an incoming normal attack to a random enemy in range; triggered attack effects resolve as though the Fae made the attack
- `Changeling` (tier 3): if a Fae troop was brought to battle, after beat 12 one random enemy unit from each enemy troop changes sides
- `Whimsy` (tier 3): whenever a Fae unit takes damage, it relocates to a random hex

## Notes

- Base unit costs are faction-neutral. Resolved troop cost can change after faction modifiers.
- Because quantity is derived from resolved cost, Goblin troops are usually larger than equivalent troops from other factions.
- Stat upgrades were removed from the game. Only faction upgrades and troop-type upgrades remain.
- The Soldier upgrade `Just a bunch of guys` was removed from the game.
- Some summon-facing upgrades are side-wide in battle resolution. For example, wolves created by Druids or Rangers still benefit from owned wolf synergies such as `Thrill of the Hunt`, even if no Beastmaster is present in that battle.
