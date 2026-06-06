# Unit details

This document lists the current base unit types before faction modifiers, faction upgrades, or troop-type upgrades are applied.

Summoned units do not have their own unlockable upgrades.

## Stat meanings

- `type`: primary troop identity
- `attributes`: secondary tags
- `health`: HP before death
- `damage`: base normal attack damage
- `speed`: initiative gained each beat
- `move`: how many legal hexes a unit can travel during ordinary movement and special repositioning
- `range`: hex attack distance, with `0` meaning melee
- `armor`: flat adjustment to incoming normal attack damage; negative armor increases damage taken
- `size`: footprint scale and how much enemy capacity is needed to engage the unit
- `capacity`: how much total enemy size the unit can engage
- `role`: autonomous behavior profile
- `cost`: base troop cost before faction cost modifiers
- `quantity`: derived after faction resolution as `120 / resolved cost`

Footprint sizes:

- Size 1 occupies one hex.
- Size 2 occupies a north- or south-facing 3-hex triangle.
- Size 3 occupies a 7-hex radius-1 footprint.
- Size 4 occupies the size-2 triangle plus one surrounding layer.
- Size 5 occupies a 19-hex radius-2 footprint.

## Base unit types

### Archer

- Attributes: `ranged`
- Stats: health 30, damage 11, speed 11, move 2, range 5, armor 0, size 1, capacity 0
- Role: backline
- Abilities: none
- Cost: 20
- Troop upgrades:
  - `Crippling Shots` (tier 3): on attack, reduce the target armor by 1 and speed by 1 for the battle

### Avenger

- Attributes: `melee`
- Stats: health 200, damage 6, speed 10, move 1, range 0, armor 0, size 2, capacity 1
- Role: frontline
- Abilities: `Vengeance 3`
- Cost: 40
- Troop upgrades:
  - `Sevenfold` (tier 2): consume nearby corpses to summon skeletons, up to 7 times
  - `Witness` (tier 3): when a nearby ally falls, set initiative to 100; when an ally dies on the Avenger's hex, strike the killer once if it is still there

### Beastmaster

- Attributes: `melee`, `summoner`
- Stats: health 90, damage 8, speed 8, move 2, range 0, armor 0, size 2, capacity 1
- Role: frontline
- Abilities: `Summon Wolf 2`
- Cost: 60
- Troop upgrades:
  - `Bloodhounds` (tier 3): starting wolves summon more wolves on kills; if engaged, a wolf touching the Beastmaster joins the fight and heals 10
  - `Thrill of the Hunt` (tier 3): wolves touching the Beastmaster gain 10 initiative at end of turn, and any wolf kill gives allies touching the fallen unit +2 damage for the battle

### Champion

- Attributes: `melee`
- Stats: health 130, damage 20, speed 17, move 2, range 0, armor 0, size 2, capacity 1
- Role: frontline
- Abilities: `Valor 20`
- Cost: 60
- Troop upgrades:
  - `Anointed Executioner` (tier 3): target the lowest-HP legal enemy; healing and positive stat gains affecting the Champion are doubled

### Druid

- Attributes: `caster`
- Stats: health 25, damage 11, speed 8, move 2, range 5, armor 0, size 1, capacity 0
- Role: backline
- Abilities: `Shapeshift - Bear`
- Cost: 30
- Troop upgrades:
  - `Forest Friends` (tier 3): end of turn, heal self and all units Bonded to that specific Druid for 20; each shapeshift summons 2 wolves
  - `True Form` (tier 2): shapeshift can trigger a second time
  - `Ent's Visage` (tier 3): after shapeshifting, normal attackers take 6 damage when they hit the Druid; each shapeshift empowers the Druid so its melee hits apply an additional battle-long `-2 speed`

### Elemental

- Attributes: `melee`, `summoned`
- Stats: health 60, damage 13, speed 7, move 1, range 0, armor 5, size 1, capacity 3
- Role: frontline
- Abilities: none
- Cost: 20

### Elementalist

- Attributes: `caster`, `summoner`
- Stats: health 25, damage 10, speed 9, move 2, range 5, armor 0, size 1, capacity 0
- Role: backline
- Abilities: `Charge 4 Summon Elemental`
- Cost: 30
- Troop upgrades:
  - `Crackling Mitosis` (tier 3): when an allied elemental dies, blast its hex for 8; each summoned elemental can repeat the elemental summon once
  - `Living Circuit` (tier 3): end of turn, the Elementalist gains 15 initiative once if any allied elemental is in range, and all allied elementals in range gain 15 initiative

### Knight

- Attributes: `melee`
- Stats: health 200, damage 16, speed 7, move 1, range 0, armor 10, size 2, capacity 5
- Role: frontline
- Abilities: `Taunt`
- Cost: 60
- Troop upgrades:
  - `Dine in Hell` (tier 3): start of turn, if engaged at full capacity, gain +5 armor until next turn; while engaged at full capacity, answer normal attacks with one normal attack
  - `Sentinel Runes` (tier 3): the first enemy to move out of contact with the Knight causes 2 elementals to be summoned at its new position; if unused, this triggers on death instead

### Militia

- Attributes: `melee`, `expendable`
- Stats: health 40, damage 8, speed 11, move 3, range 0, armor 0, size 1, capacity 1
- Role: Pusher
- Abilities: none
- Cost: 10
- Troop upgrades:
  - `Rat Behavior` (tier 3): start of turn, gain +1 initiative per other Militia touching them
  - `Dogpile` (tier 3): attacks against enemies engaged by at least 3 allies strike 1 extra time

### Necromancer

- Attributes: `caster`, `summoner`
- Stats: health 40, damage 16, speed 8, move 2, range 5, armor 0, size 1, capacity 0
- Role: backline
- Abilities: `Corpse Summon Skeleton`
- Cost: 40
- Troop upgrades:
  - `Hemomancy` (tier 3): may spend 10 HP instead of consuming a corpse; summoned skeletons heal allies touching them for 7 each turn
  - `Explosion Corpse` (tier 3): summoned skeletons spawn with 100 initiative; consuming a corpse makes enemies adjacent to that corpse lose 1 armor and 1 damage for the battle

### Priest

- Attributes: `caster`
- Stats: health 25, damage 7, speed 8, move 2, range 5, armor 0, size 1, capacity 0
- Role: backline
- Abilities: `Mend 4`
- Cost: 20
- Troop upgrades:
  - `Bolstering Light` (tier 3): when a Priest heal brings its target to full HP, that target gains +1 speed and +1 damage for the battle; otherwise, that target gains 40 initiative
  - `Mercy Before Dawn` (tier 3): the first time each battle an ally in range would die, it survives at 1 HP

### Ranger

- Attributes: `ranged`
- Stats: health 50, damage 16, speed 13, move 3, range 7, armor 0, size 1, capacity 0
- Role: backline
- Abilities: `Self Haste 2`
- Cost: 60
- Troop upgrades:
  - `On the Hunt` (tier 3): on attack, set the target initiative to 0; the first 2 kills against non-`Fading` enemies consume the corpse and summon a wolf there
  - `Shadow's Embrace` (tier 3): after ranged attacks, move to a safer hex that still keeps an enemy in range; attacks against unengaged targets deal double damage

### Shaman

- Attributes: `caster`
- Stats: health 20, damage 11, speed 8, move 2, range 5, armor 0, size 1, capacity 0
- Role: backline
- Abilities: `Enhance 1`
- Cost: 20
- Troop upgrades:
  - `War Drums` (tier 2): `Enhance 1` affects all allies on the chosen allied hex
  - `Grave Vigor` (tier 3): beneficial effects also make the target summon a skeleton on death and leave no corpse; `Enhance` gives affected allies 1 extra strike on their next normal attack; targets affected by any beneficial effect from a Grave Vigor Shaman ignore future beneficial effects and targeting from Grave Vigor Shamans

### Skeleton

- Attributes: `melee`, `summoned`
- Stats: health 40, damage 13, speed 7, move 2, range 0, armor 0, size 1, capacity 1
- Role: Pusher
- Abilities: `Bonded`, `Fading`
- Cost: 20

### Soldier

- Attributes: `melee`
- Stats: health 100, damage 10, speed 10, move 2, range 0, armor 2, size 1, capacity 2
- Role: frontline
- Abilities: none
- Cost: 24
- Troop upgrade:
  - `Shield Drill` (tier 3): Soldiers have -4 armor, but each ranged attack can deal at most 1 damage to a Soldier after all modifiers

### Wizard

- Attributes: `caster`
- Stats: health 20, damage 9, speed 8, move 2, range 5, armor 0, size 1, capacity 0
- Role: backline
- Abilities: `Blast 5`
- Cost: 20
- Troop upgrades:
  - `Storm Rods` (tier 3): every 4 turns, make 4 extra strikes against a random enemy in range; `Blast` deals +1 damage per elemental overlapping the target cell, and Wizards summon 1 elemental at battle start
  - `Spell Echo` (tier 2): `Blast` chains to an adjacent hex that has not already been hit in that chain

### Wolf

- Attributes: `melee`, `summoned`
- Stats: health 70, damage 6, speed 12, move 3, range 0, armor 0, size 1, capacity 1
- Role: Pusher
- Abilities: `Bonded`, `Pack 1`
- Cost: 20

## Current faction upgrades

### Humans

- `Tubthumping` (tier 1): multiple Human troops may enter the same Rift; harmful damage or speed reductions become `+1` instead
- `Human Combined Arms` (tier 2): gain +20% health, damage, and speed for each other friendly troop type in the battle
- `Hold the Standard` (tier 2): whenever a non-`Fading` ally dies touching a Human unit, that Human unit heals 15

### Elves

- `Elven Reflexes` (tier 1): all non-melee Elven troops gain +1 range; the first time an Elven backline unit is engaged each battle, it retreats 1 hex for free
- `Elven Forsaken` (tier 3): if fighting alone with no other friendly troop types, gain +80% health, damage, and speed
- `Silvershot Doctrine` (tier 2): ranged and caster attacks gain +1 damage and +2 initiative per hex of distance; attacks made from max range make the target lose 30 initiative

### Goblins

- `Goblin Behavior` (tier 1): on death, make 1 extra strike against a random touching enemy; on kill, enemies touching the fallen unit lose 20 initiative
- `Goblin Pack` (tier 2): start of turn, gain +1 damage per other friendly unit touching it until end of turn
- `Loot Frenzy` (tier 3): on kill, allies touching the fallen unit heal 10 and gain 30 initiative

### Trolls

- `Roll the Boulder` (tier 1): end of turn, gain +1 damage for the battle; melee kills deal splash damage equal to `5 x size` to enemies touching the fallen unit
- `Mossblood` (tier 2): the first lethal hit leaves the Troll alive at 25 HP and removes `Regen 5`; after taking damage, gain +1 damage for the battle
- `Rowdy Regrowth` (tier 2): whenever a Troll is healed, it gains 20 initiative

### Dwarves

- `Diggy Hole` (tier 1): Dwarven units do not spawn at battle start; after 10 beats, they spawn on the enemy side of the board
- `Ale and Hearty` (tier 2): Dwarven troops gain +40% speed, but one random unit from each Dwarven troop has speed set to 1 at combat start
- `Stall Warts` (tier 3): Dwarven troops gain +1 armor and lose 1 speed for the battle after they are hit by normal attacks

### Orcs

- `Seeing Red` (tier 1): whenever an Orc kills an enemy unit, it loses 1 armor for the battle and gains 75 initiative
- `First Blood` (tier 2): Orc units make an immediate normal attack when they engage, before the normal engagement attack
- `Berserk` (tier 3): when an Orc would die from damage, it becomes immune to damage, has its initiative set to 0, and dies at the end of its next turn

### Fae

- `Glamour` (tier 2): once per battle per Fae unit, redirect an incoming normal attack to a random enemy in range; triggered attack effects resolve as though the Fae made the attack
- `Changeling` (tier 3): if a Fae troop was brought to battle, after beat 12 one random enemy unit from each enemy troop changes sides
- `Whimsy` (tier 3): whenever a Fae unit takes damage, it relocates to a random hex

## Notes

- Base unit costs are faction-neutral. Resolved troop cost can change after faction modifiers.
- Because quantity is derived from resolved cost, Goblin troops are usually larger than equivalent troops from other factions.
- Stat upgrades were removed from the game. Only faction upgrades and troop-type upgrades remain.
- The Soldier upgrade `Just a bunch of guys` was removed from the game.
- Some summon-facing upgrades are side-wide in battle resolution. For example, wolves created by Druids or Rangers still benefit from owned wolf synergies such as `Thrill of the Hunt`, even if no Beastmaster is present in that battle.
