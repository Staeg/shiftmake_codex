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
- `armor`: flat reduction to incoming normal attack damage
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
- Troop upgrade: `Shredding Arrows` (tier 2)

### Avenger

- Attributes: `melee`
- Stats: health 200, damage 6, speed 10, range 0, armor 0, size 2, capacity 1
- Role: frontline
- Abilities: `Vengeance 3`
- Cost: 40
- Troop upgrade: `Sevenfold` (tier 2)

### Beastmaster

- Attributes: `melee`, `summoner`
- Stats: health 90, damage 8, speed 8, range 0, armor 0, size 2, capacity 1
- Role: frontline
- Abilities: `Summon Wolf 2`
- Cost: 60
- Troop upgrade: `Blood in the Water` (tier 2)

### Champion

- Attributes: `melee`
- Stats: health 130, damage 20, speed 17, range 0, armor 0, size 2, capacity 1
- Role: frontline
- Abilities: `Valor 20`
- Cost: 60
- Troop upgrade: `Executioner` (tier 2)

### Druid

- Attributes: `caster`
- Stats: health 25, damage 11, speed 8, range 2, armor 0, size 1, capacity 0
- Role: backline
- Abilities: `Shapeshift - Bear`
- Cost: 30
- Troop upgrade: `Wild Growth` (tier 2)

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
- Troop upgrade: `Mitosis` (tier 3)

### Knight

- Attributes: `melee`
- Stats: health 200, damage 16, speed 7, range 0, armor 10, size 2, capacity 5
- Role: frontline
- Abilities: `Taunt`
- Cost: 60
- Troop upgrade: `Retaliate` (tier 2)

### Militia

- Attributes: `melee`, `expendable`
- Stats: health 40, damage 8, speed 11, range 0, armor 0, size 1, capacity 1
- Role: chaff
- Abilities: none
- Cost: 10
- Troop upgrade: `Scurry` (tier 3)

### Necromancer

- Attributes: `caster`, `summoner`
- Stats: health 40, damage 16, speed 8, range 2, armor 0, size 1, capacity 0
- Role: backline
- Abilities: `Corpse Summon Skeleton`
- Cost: 40
- Troop upgrades: `Alternate Fuel` (tier 2), `Rising Tide` (tier 3)

### Priest

- Attributes: `caster`
- Stats: health 25, damage 7, speed 8, range 2, armor 0, size 1, capacity 0
- Role: backline
- Abilities: `Mend 4`
- Cost: 20
- Troop upgrade: `Zeal` (tier 3)

### Ranger

- Attributes: `ranged`
- Stats: health 50, damage 16, speed 13, range 3, armor 0, size 1, capacity 0
- Role: backline
- Abilities: `Haste 1`
- Cost: 60
- Troop upgrade: `Concussive Shots` (tier 2)

### Shaman

- Attributes: `caster`
- Stats: health 20, damage 11, speed 8, range 2, armor 0, size 1, capacity 0
- Role: backline
- Abilities: `Enhance 1`
- Cost: 20
- Troop upgrade: `Serve Once More` (tier 3)

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
- Troop upgrades: none

### Wizard

- Attributes: `caster`
- Stats: health 20, damage 9, speed 8, range 2, armor 0, size 1, capacity 0
- Role: backline
- Abilities: `Blast 5`
- Cost: 20
- Troop upgrade: `Storm` (tier 2)

### Wolf

- Attributes: `melee`, `summoned`
- Stats: health 70, damage 6, speed 12, range 2, armor 0, size 1, capacity 1
- Role: frontline
- Abilities: `Bonded`, `Pack 1`
- Cost: 20

## Notes

- Base unit costs are faction-neutral. Resolved troop cost can change after faction modifiers.
- Because quantity is derived from resolved cost, Goblin troops are usually larger than equivalent troops from other factions.
- Stat upgrades were removed from the game. Only faction upgrades and troop-type upgrades remain.
- The Soldier upgrade `Just a bunch of guys` was removed from the game.
