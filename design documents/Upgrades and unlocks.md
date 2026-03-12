# Upgrades
All upgrades have a gold cost. Adding units to a troop counts as an upgrade: their quantity gets increased.

## Adding a unit (ugrading quantity)
Gold required depends on the troop's cost and how many units above its starting Quantity are present.

The formula used: (cost / starting Quantity) * current Quantity. This means the first additional unit in a troop with starting Quantity 1 is just the cost of the troop, while the second one is twice that. The first additional unit in a troop with starting Quantity 10 is 10% of the cost, while the 11th additional unit will be equal to the full cost of the troop.

## Upgrading health, damage, speed, armor, range, capacity
All troop types can upgrade health and damage. Only certain types of units can upgrade the other stats.
Gold required is a fraction of the troop's unlock cost multiplied by how many upgrades of its kind have been purchased before. 

Health, damage and speed use upgrade costs: (troop cost / 10) * (existing upgrades + 1). A unit with cost 100 needs 10 gold for its first health upgrade and 20 gold for its second health upgrade. Health upgrades do not increase the costs of damage upgrades and vice versa, and so on for all the other stat types.

These upgrades increase the stat by 10% multiplicatively. A unit with base health 100 and two health upgrades will have 121 health.

Armor uses a different formula for upgrades: (troop cost / 20 + starting armor) * (existing upgrades + 1). Each upgrade increases armor by 1.

Range and capacity use yet another formula: (troop cost * (purchased upgrades + starting stat)) / (starting stat * 2). Each upgrade increases the stat by 1.

## Special upgrades

Each Faction comes with its own unique faction-wide upgrades from the very beginning. Other special upgrades come from Rifts of tier 2 and above, which can affect factions or troop types. All of these need to be paid for before their effects take place.

Details for them are in the Unit details and types.md and Factions.md docs.
(Note: troop type-wide upgrades are not yet implemented)

If a unit would get the same type of ability from multiple sources, the numerical values are added together if the ability has any; otherwise, if the ability has no numerical component, there is no additional benefit over having one instance of the ability.

# Unlocks
All unlocks have an essence cost. 

## Unlocking factions

At the start of a game, you get a choice of 3 random factions to unlock for free.

Unlocking a new faction past that costs 100 essence per already unlocked faction. This gives a selection of 3 random factions not yet unlocked.

## Unlocking troop types

Each faction has its soldier troop type available from the moment it's unlocked. Unlocking additional troop types past that requires essence equal to the cost of that unit + 100 for every other unit type besides soldier already unlocked.

No randomness is involved in troop unlocks: the menu shows all possible troop types for that faction and the action can be canceled at any point before confirming.

Blueprints earned from Rifts function as normal unlocks, except they cannot be performed (and they do not show up on any menus) until the relevant blueprint is acquired.