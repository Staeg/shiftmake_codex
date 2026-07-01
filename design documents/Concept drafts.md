# Troop ideas
Use the Notes when implementing the Troops, but do not put them into any player-facing descriptions - these are development aids.

## Template
- Attributes: `caster`
- Stats: health , damage , rate , move 3, range , armor 0, size 2, capacity 0
- Role: frontline backline Pusher
- Abilities: 
- Cost: 20
- Troop upgrades:
  - ` ` (tier ): 
  - ` ` (tier ): 
  - ` ` (tier ): 

### Notes


## Bladesinger
- Attributes: `ranged`
- Stats: health 70, damage 7, rate 12, move 4, range 3, armor 0, size 2, capacity 0
- Role: backline
- Abilities: Strike 1
- Cost: 40
- Troop upgrades:
  - `Flow` (tier 2): Bladesingers can attack both before and after moving. They break engagement at the start of their turn.
  - `Thousand Cuts` (tier 2): Bladesingers place a Mark on enemies they attack. If their target already has Mark, they get -1 armor. Mark is removed at the start of the Marked unit's turn.
  - `Chorus` (tier 3): Bladesingers lose 5 rate. They get Strike 1 at the end of their turns.

### Notes

Short ranged multistrike specialist. Aesthetics: telekinetic multi-knife wielder.
Flow should be implemented as: they can attack twice per turn if and only if they have valid attack targets before and after moving, and both attacks trigger Strike and other normal attack effects.
Mark should be applied instantly, so if a Bladesinger with Flow attacks an enemy both before and after its movement and both of its Strikes land on that target, they should get Mark and -3 armor, the third hit would have dealt an additional 1 damage and the fourth would deal an additional 2 damage due to the lost armor.

