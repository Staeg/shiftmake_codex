# Unit details

This document lists the current base unit types before faction modifiers, troop stat upgrades, or faction upgrades are applied.

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
- `quantity`: starting troop size when first created; currently `1` for every unit type
- `cost`: per-unit troop cost used by the Increase Quantity formula

## Unit types

### Archer

- Type: `archer`
- Attributes: `ranged`
- Health: 30
- Damage: 11
- Speed: 11
- Range: 2
- Armor: 0
- Size: 1
- Capacity: 0
- Role: backline
- Abilities: none
- Quantity: 1
- Cost: 20

### Avenger

- Type: `avenger`
- Attributes: `melee`
- Health: 200
- Damage: 6
- Speed: 10
- Range: 0
- Armor: 0
- Size: 2
- Capacity: 1
- Role: frontline
- Abilities: `Vengeance 3`
- Quantity: 1
- Cost: 40

### Beastmaster

- Type: `beastmaster`
- Attributes: `melee`, `summoner`
- Health: 90
- Damage: 8
- Speed: 8
- Range: 0
- Armor: 0
- Size: 2
- Capacity: 1
- Role: frontline
- Abilities: `Summon Wolf 2`
- Quantity: 1
- Cost: 60

### Champion

- Type: `champion`
- Attributes: `melee`
- Health: 130
- Damage: 20
- Speed: 17
- Range: 0
- Armor: 0
- Size: 2
- Capacity: 1
- Role: frontline
- Abilities: `Valor 20`
- Quantity: 1
- Cost: 60

### Druid

- Type: `druid`
- Attributes: `caster`
- Health: 25
- Damage: 11
- Speed: 8
- Range: 2
- Armor: 0
- Size: 1
- Capacity: 0
- Role: backline
- Abilities: `Shapeshift - Bear`
- Quantity: 1
- Cost: 30

### Elemental

- Type: `elemental`
- Attributes: `melee`, `summoned`
- Health: 60
- Damage: 13
- Speed: 7
- Range: 2
- Armor: 5
- Size: 1
- Capacity: 3
- Role: frontline
- Abilities: none
- Quantity: 1
- Cost: 20

### Elementalist

- Type: `elementalist`
- Attributes: `caster`, `summoner`
- Health: 25
- Damage: 10
- Speed: 9
- Range: 2
- Armor: 0
- Size: 1
- Capacity: 0
- Role: backline
- Abilities: `Charge 4 Summon Elemental`
- Quantity: 1
- Cost: 30

### Knight

- Type: `knight`
- Attributes: `melee`
- Health: 200
- Damage: 16
- Speed: 7
- Range: 0
- Armor: 10
- Size: 2
- Capacity: 5
- Role: frontline
- Abilities: `Taunt`
- Quantity: 1
- Cost: 60

### Militia

- Type: `militia`
- Attributes: `melee`, `expendable`
- Health: 40
- Damage: 8
- Speed: 11
- Range: 0
- Armor: 0
- Size: 1
- Capacity: 1
- Role: chaff
- Abilities: none
- Quantity: 1
- Cost: 10

### Necromancer

- Type: `necromancer`
- Attributes: `caster`, `summoner`
- Health: 40
- Damage: 16
- Speed: 8
- Range: 2
- Armor: 0
- Size: 1
- Capacity: 0
- Role: backline
- Abilities: `Corpse Summon Skeleton`
- Quantity: 1
- Cost: 40

### Priest

- Type: `priest`
- Attributes: `caster`
- Health: 25
- Damage: 7
- Speed: 8
- Range: 2
- Armor: 0
- Size: 1
- Capacity: 0
- Role: backline
- Abilities: `Mend 4`
- Quantity: 1
- Cost: 20

### Ranger

- Type: `Ranger`
- Attributes: `ranged`
- Health: 50
- Damage: 16
- Speed: 13
- Range: 3
- Armor: 0
- Size: 1
- Capacity: 0
- Role: backline
- Abilities: `Haste 1`
- Quantity: 1
- Cost: 60

### Shaman

- Type: `shaman`
- Attributes: `caster`
- Health: 20
- Damage: 11
- Speed: 8
- Range: 2
- Armor: 0
- Size: 1
- Capacity: 0
- Role: backline
- Abilities: `Enhance 1`
- Quantity: 1
- Cost: 20

### Skeleton

- Type: `skeleton`
- Attributes: `melee`, `summoned`
- Health: 40
- Damage: 13
- Speed: 7
- Range: 0
- Armor: 0
- Size: 1
- Capacity: 1
- Role: chaff
- Abilities: `Bonded`, `Fading`
- Quantity: 1
- Cost: 20

### Soldier

- Type: `soldier`
- Attributes: `melee`
- Health: 100
- Damage: 10
- Speed: 10
- Range: 0
- Armor: 2
- Size: 1
- Capacity: 2
- Role: frontline
- Abilities: none
- Quantity: 1
- Cost: 24

### Wizard

- Type: `wizard`
- Attributes: `caster`
- Health: 20
- Damage: 9
- Speed: 8
- Range: 2
- Armor: 0
- Size: 1
- Capacity: 0
- Role: backline
- Abilities: `Blast 5`
- Quantity: 1
- Cost: 20

### Wolf

- Type: `wolf`
- Attributes: `melee`, `summoned`
- Health: 70
- Damage: 5
- Speed: 12
- Range: 0
- Armor: 0
- Size: 1
- Capacity: 1
- Role: chaff
- Abilities: `Bonded`, `Pack 1`
- Quantity: 1
- Cost: 20

## Example composed troops

### Human Soldier

- Attributes: `melee`, `human`
- Health: 110
- Damage: 11
- Speed: 11
- Range: 0
- Armor: 3
- Size: 1
- Capacity: 3
- Role: frontline
- Abilities: none
- Quantity: 1
- Cost: 18

### Troll Champion

- Attributes: `melee`, `troll`
- Health: 195
- Damage: 24
- Speed: 13.6
- Range: 0
- Armor: 0
- Size: 3
- Capacity: 2
- Role: frontline
- Abilities: `Valor 20`, `Regen 5`
- Quantity: 1
- Cost: 78

### Goblin Wizard

- Attributes: `caster`, `goblin`, `expendable`
- Health: 14
- Damage: 8
- Speed: 8
- Range: 1
- Armor: -2
- Size: 1
- Capacity: 0
- Role: backline
- Abilities: `Blast 5`
- Quantity: 1
- Cost: 8
