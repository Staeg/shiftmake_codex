# Unit details

Per-unit battle stats:

* Types: faction and troop-type tags. They do nothing on their own, but abilities/upgrades can reference them.
* Health: damage required to knock the unit out.
* Damage: health removed from the target on a normal attack.
* Speed: initiative gained each Beat.
* Range: targeting distance in hexes. `0` means melee (can only attack enemies on the same hex).
* Armor: flat reduction to incoming normal attack damage (melee and ranged).
* Size: how much this unit "costs" when an enemy tries to Engage it.
* Capacity: total enemy Size this unit can Engage at once when initiating Engagements.
* Role: behavior profile used when the unit is not Engaged.

Notes on Size and Capacity:

* When this unit initiates Engagements, Capacity is what matters.
* When enemies try to Engage this unit, this unit's Size is what matters.

Example: Human Swordsman

* Types: human, swordsman
* Health: 100
* Damage: 15
* Speed: 8
* Range: 0
* Armor: 5
* Size: 2
* Capacity: 5
* Role: Frontline

Example: Human Peasant

* Types: human, peasant, expendable
* Health: 40
* Damage: 8
* Speed: 12
* Range: 0
* Armor: 1
* Size: 1
* Capacity: 1
* Role: Chaff

Example: Human Archer

* Types: human, archer
* Health: 30
* Damage: 5
* Speed: 10
* Range: 2
* Armor: 0
* Size: 1
* Capacity: 0
* Role: Backline
