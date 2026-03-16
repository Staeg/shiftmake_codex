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
- `quantity`: starting troop size when first created
- `cost`: troop cost used by unlock and unit-add formulas

## Unit types

### Archer

- Type: `archer`
- Attributes: `ranged`
- Health: 30
- Damage: 10
- Speed: 10
- Range: 2
- Armor: 0
- Size: 1
- Capacity: 0
- Role: backline
- Abilities: none
- Quantity: 5
- Cost: 100

### Avenger

- Type: `avenger`
- Attributes: `melee`
- Health: 200
- Damage: 10
- Speed: 10
- Range: 0
- Armor: 0
- Size: 2
- Capacity: 1
- Role: frontline
- Abilities: `Vengeance 1`
- Quantity: 1
- Cost: 40

### Champion

- Type: `champion`
- Attributes: `melee`
- Health: 150
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
- Health: 20
- Damage: 10
- Speed: 8
- Range: 2
- Armor: 0
- Size: 1
- Capacity: 0
- Role: backline
- Abilities: `Shapeshift - Bear`
- Quantity: 3
- Cost: 80

### Knight

- Type: `knight`
- Attributes: `melee`
- Health: 200
- Damage: 20
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
- Speed: 12
- Range: 0
- Armor: 0
- Size: 1
- Capacity: 1
- Role: chaff
- Abilities: none
- Quantity: 10
- Cost: 60

### Shaman

- Type: `shaman`
- Attributes: `caster`
- Health: 20
- Damage: 10
- Speed: 8
- Range: 2
- Armor: 0
- Size: 1
- Capacity: 0
- Role: backline
- Abilities: `Enhance 1`
- Quantity: 3
- Cost: 60

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
- Quantity: 5
- Cost: 100

### Wizard

- Type: `wizard`
- Attributes: `caster`
- Health: 20
- Damage: 10
- Speed: 8
- Range: 2
- Armor: 0
- Size: 1
- Capacity: 0
- Role: backline
- Abilities: `Blast 5`
- Quantity: 3
- Cost: 60

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
- Quantity: 5
- Cost: 90

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
- Quantity: 3
- Cost: 24
