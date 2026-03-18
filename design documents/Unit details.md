# Unit details

This document lists the current base unit types before faction modifiers, troop stat upgrades, or faction upgrades are applied.
It also has unlockable upgrades for each troop type. Summoned units do not have their own upgrades; their summoners might have upgrades which affect them, however.

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

#### Unlockable upgrades

- Tier: 2
- Name: Shredding arrows
- Cost: 40
- Effect: Causes Archers to remove 1 armor from their target after attacking for the rest of the battle.

- Tier: 
- Name: 
- Cost: 
- Effect: 

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

#### Unlockable upgrades

- Tier: 2
- Name: Sevenfold
- Cost: 90
- Effect: Avengers gain the `Uses 7 Corpse Summon Skeleton` ability.

- Tier: 
- Name: 
- Cost: 
- Effect: 

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

#### Unlockable upgrades

- Tier: 2
- Name: Blood in the water
- Cost: 20
- Effect: Gives Wolves the `On Kill Summon Wolf 1` ability.

- Tier: 
- Name: 
- Cost: 
- Effect: 

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

#### Unlockable upgrades

- Tier: 2
- Name: Executioner
- Cost: 20
- Effect: Causes Champions to prioritize attacking the lowest-health enemy among possible legal attack targets.

- Tier: 
- Name: 
- Cost: 
- Effect: 

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

#### Unlockable upgrades

- Tier: 2
- Name: Wild Growth
- Cost: 60
- Effect: Gives Druids the `Regen 60` ability.

- Tier: 
- Name: 
- Cost: 
- Effect: 

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

#### Unlockable upgrades

- Tier: 3
- Name: Mitosis
- Cost: 110
- Effect: Gives Elementals the `Charge 4 Uses 1 Summon Elemental` ability.

- Tier: 
- Name: 
- Cost: 
- Effect: 

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

#### Unlockable upgrades

- Tier: 2
- Name: Retaliate
- Cost: 90
- Effect: Makes Knights retaliate against enemies that hit them with a normal attack by making one normal attack of their own.

- Tier: 
- Name: 
- Cost: 
- Effect: 

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

#### Unlockable upgrades

- Tier: 3
- Name: Scurry
- Cost: 30
- Effect: Makes Militia not count towards a hex's allied saturation limit.

- Tier: 
- Name: 
- Cost: 
- Effect: 

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

#### Unlockable upgrades

- Tier: 2
- Name: Alternate fuel
- Cost: 40
- Effect: Makes Necromancers use corpse-consuming abilities without requiring or consuming a corpse by instead paying 10 health, if this would not kill the Necromancer.

#### Unlockable upgrades

- Tier: 3
- Name: Rising tide
- Cost: 70
- Effect: Gives Skeletons `AoE Ally 0 Heal 7`.

#### Unlockable upgrades

- Tier: 
- Name: 
- Cost: 
- Effect: 

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

#### Unlockable upgrades

- Tier: 3
- Name: Zeal
- Cost: 110
- Effect: Makes Priests also `Enhance 1` whoever they heal, even if the heal restores 0 HP.

#### Unlockable upgrades

- Tier: 
- Name: 
- Cost: 
- Effect: 

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

#### Unlockable upgrades

- Tier: 2
- Name: Concussive shots
- Cost: 40
- Effect: Makes Ranger attacks set their target's initiative to 0.

- Tier: 
- Name: 
- Cost: 
- Effect: 

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

#### Unlockable upgrades

- Tier: 3
- Name: Serve once more
- Cost: 60
- Effect: Makes Shamans' beneficial effects also cause the targets of those effects to gain `Fading` and `On Death Summon Skeleton`.

- Tier: 
- Name: 
- Cost: 
- Effect: 

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

#### Unlockable upgrades

- Tier: 3
- Name: Just a bunch of guys
- Cost: 20
- Effect: Makes Soldier quantity upgrades use the same gold cost as the first added unit for every later added unit.

- Tier: 
- Name: 
- Cost: 
- Effect: 

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

#### Unlockable upgrades

- Tier: 2
- Name: Storm
- Cost: 80
- Effect: Gives Wizards the `Charge 4 Random Enemy R Strike 4` ability.

- Tier: 
- Name: 
- Cost: 
- Effect: 

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
