# Unit details
Factions have 

Per-unit battle stats:

* Type: the unit's single primary troop identity. This is what Combined Arms counts.
* Attributes: secondary tags such as faction, ranged/caster/melee, expendable, etc. Type-based ability filters match against the combined set of `Type + Attributes`.
* Health: damage required to knock the unit out.
* Damage: health removed from the target on a normal attack. Cannot go below 0.
* Speed: initiative gained each Beat. Cannot go below 1 or above 100.
* Range: targeting distance in hexes. `0` means melee (can only attack enemies on the same hex). Cannot go below 0.
* Armor: flat reduction to incoming normal attack damage (melee and ranged).
* Size: how much this unit "costs" when an enemy tries to Engage it. Cannot go below 1.
* Capacity: total enemy Size this unit can Engage at once when initiating Engagements. Cannot go below 0.
* Role: behavior profile used when the unit is not Engaged.
* Abilities: special skills with a multitude of possible effects, targets and triggers.
* Quantity: starting number of units in a troop when first unlocked.
* Cost: amount of essence to unlock this troop.

Notes on Size and Capacity:

* When this unit initiates Engagements, Capacity is what matters.
* When enemies try to Engage this unit, this unit's Size is what matters.

## Unit types

### Archer

* Type: archer
* Attributes: ranged
* Health: 30
* Damage: 10
* Speed: 10
* Range: 2
* Armor: 0
* Size: 1
* Capacity: 0
* Role: Backline
* Abilities: none
* Quantity: 5
* Cost: 100

### Avenger

* Type: avenger
* Attributes: melee
* Health: 200
* Damage: 10
* Speed: 10
* Range: 0
* Armor: 0
* Size: 2
* Capacity: 1
* Role: Frontline
* Abilities: Vengeance 1
* Quantity: 1
* Cost: 40

### Champion

* Type: champion
* Attributes: melee
* Health: 150
* Damage: 20
* Speed: 17
* Range: 0
* Armor: 0
* Size: 2
* Capacity: 1
* Role: Frontline
* Abilities: Valor 20
* Quantity: 1
* Cost: 60

### Druid
* Type: druid
* Attributes: caster
* Health: 20
* Damage: 10
* Speed: 8
* Range: 2
* Armor: 0
* Size: 1
* Capacity: 0
* Role: Backline
* Abilities: Shapeshift - Bear
* Quantity: 3
* Cost: 80

### Knight

* Type: knight
* Attributes: melee
* Health: 200
* Damage: 20
* Speed: 7
* Range: 0
* Armor: 10
* Size: 2
* Capacity: 5
* Role: Frontline
* Abilities: Taunt
* Quantity: 1
* Cost: 60

### Militia

* Type: militia
* Attributes: melee, expendable
* Health: 40
* Damage: 8
* Speed: 12
* Range: 0
* Armor: 0
* Size: 1
* Capacity: 1
* Role: Chaff
* Abilities: none
* Quantity: 10
* Cost: 60

### Shaman
* Type: shaman
* Attributes: caster
* Health: 20
* Damage: 10
* Speed: 8
* Range: 2
* Armor: 0
* Size: 1
* Capacity: 0
* Role: Backline
* Abilities: Enhance 1
* Quantity: 3
* Cost: 60

### Soldier

* Type: soldier
* Attributes: melee
* Health: 100
* Damage: 10
* Speed: 10
* Range: 0
* Armor: 2
* Size: 1
* Capacity: 2
* Role: Frontline
* Abilities: none
* Quantity: 5
* Cost: 100

### Wizard
* Type: wizard
* Attributes: caster
* Health: 20
* Damage: 10
* Speed: 8
* Range: 2
* Armor: 0
* Size: 1
* Capacity: 0
* Role: Backline
* Abilities: Blast 5
* Quantity: 3
* Cost: 60


## Examples

### Human Soldier

* Type: soldier
* Attributes: melee, human
* Health: 110
* Damage: 11
* Speed: 11
* Range: 0
* Armor: 3
* Size: 1
* Capacity: 2
* Role: Frontline
* Abilities: none
* Quantity: 5
* Cost: 90

### Troll Champion

* Type: champion
* Attributes: melee, troll
* Health: 195
* Damage: 24
* Speed: 13.6
* Range: 0
* Armor: 0
* Size: 3
* Capacity: 2
* Role: Frontline
* Cost: 325
* Abilities: Valor 20, Regen 5
* Quantity: 1
* Cost: 60

### Goblin Wizard

* Type: wizard
* Attributes: caster, goblin, expendable
* Health: 14
* Damage: 4
* Speed: 8
* Range: 1
* Armor: -2
* Size: 1
* Capacity: 0
* Role: Backline
* Cost: 30
* Abilities: Blast 5
* Quantity: 3
* Cost: 24
