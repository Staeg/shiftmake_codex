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
  - `Mark of a Thousand Cuts` (tier 2): Bladesingers place a Mark on enemies they attack. If their target already has Mark, they get -1 armor. Mark is removed at the end of the Marked unit's turn.
  - `Chorus` (tier 3): Bladesingers lose 5 rate. They get Strike 1 at the end of their turns.

### Notes

Short ranged multistrike specialist - weaker than average without synergies. Aesthetics: lithe telekinetic flying knife wielder.
Flow should be implemented as: they can attack twice per turn if and only if they have valid attack targets before and after moving (requires actual movement), and both attacks trigger Strike and other normal attack effects.
Mark should be applied instantly, so if a Bladesinger with Flow attacks an enemy both before and after its movement and both of its Strikes land on that target, they should get Mark and -3 armor, the third hit would have dealt an additional 1 damage and the fourth would deal an additional 2 damage due to the lost armor.


## Slayer
- Attributes: `melee`
- Stats: health 120, damage 30, rate 13, move 5, range 0, armor -2, size 3, capacity 3
- Role: Pusher
- Abilities: `Reap`: overkill damage spills to another random adjacent enemy.
- Cost: 60
- Troop upgrades:
  - `Hook` (tier 2): If a Slayer would close the distance to a target and attack them on the same turn, they instead move their target to an adjacent location and attack them. If the target would be killed by this attack, also pull a random enemy adjacent to the target.
  - `Trance` (tier 2): Slayers start battle with -400 readiness. When they would take a normal turn, they take 4 additional turns and then lose an additional 400 readiness.
  - `Wraiths` (tier 3): Slayers become untargetable by both friendly and enemy effects and attacks while their readiness is under 100. They break engagement at the end of their turn.

### Notes

Large, mobile and vulnerable Pusher unit - prone to running in and dying on its own. Aesthetics: full-body tattoos, wielding a scythe on a chain.
Reap only triggers off the main attack and doesn't chain. It spills to an enemy adjacent to the Slayer, not the target.
Hooks only works if normal movement would have succeeded and been followed by a normal attack.
Trance makes them not lose readiness for their first 4 turns, then lose 500 total readiness at the end of their 5th turn at once: 100 as normal plus the additional 400.
Wraiths make it so that they need to be hit on the same Beat that they are active, otherwise they cannot die.

## Monk
- Attributes: `melee`
- Stats: health 160, damage 7, rate 11, move 3, range 0, armor 2, size 0, capacity 6
- Role: frontline
- Abilities: `Serenity 4`: Reduces the rate of touching enemies by 4. For each 2 hexes further than that the reduction grows weaker by 1. Does not stack.
- Cost: 40
- Troop upgrades:
  - `Merry Bunch` (tier 2): Doubles the quantity of Monks in a Troop. Their Serenity now stacks.
  - `Balance` (tier 2): When a Monk deals damage, a random ally is healed that much health. When a Monk loses health, they lose that much max health as well and a random enemy loses that much health.
  - `Urgent Care` (tier 3): Monk Serenity now affects allies with an equivalent rate increase. Affected allies heal HP at the end of their turn equal to the difference between their class base rate and current rate.

### Notes

Knight alternative, best at dealing with slower and shorter-ranged enemies. Aesthetics: bald, bare-handed, topless with bead necklace.
Serenity effect is -4 rate within range 1/2, -3 rate within range 3/4, -2 rate within range 5/6, -1 rate within range 7/8. This should be implemented as a general category/ability type: Tapering Aura, with starting magnitude of -4 rate and a taper of 2 hexes.
Balance healing targets allies that are missing health, but does not optimize the amount of HP restored. The max health loss doesn't double up, the monk just loses both current and max health simultaneously.
Merry bunch functionally halves their cost. The stacking Serenity causes an enemy who is adjacent to two Monks lose 8 rate, or who is 2 range away from one and 4 range away from another lose 4 rate.
Urgent care doesn't heal any health if the unit is at or below their class base rate.
Merry Bunch and Urgent Care taken together double up on the rate increase, but affected allies only trigger the end-of-turn heal once - it will simply be bigger due to the increased rate.


## Battlemage
- Attributes: `caster`, `melee`
- Stats: health 110, damage 14, rate 10, move 3, range 0, armor 0, size 2, capacity 4
- Role: frontline
- Abilities: `Ward 1`: Reduces damage from 1 damaging normal attack to 0. Refreshes at the start of each turn. + `Nimble`: After being attacked in melee, breaks engagement with the attacker.
- Cost: 40
- Troop upgrades:
  - `Zappy Reaction` (tier 2): When a Battlemage takes 0 damage from a normal attack, the attacker and all enemies adjacent to them lose 20 health.
  - `Hubris` (tier 3): Battlemages lose 13 armor and gain Ward 6.
  - `Mark of the Paper Hand` (tier 2): Battlemages place a Mark on enemies they attack. Enemies with a Mark have their damage reduced to 0. Mark is removed at the end of the Marked unit's turn.

### Notes

Tricky duelist.
Ward should apply after other effects including armor. It shouldn't prevent other effects from attacks like Blast or Shredding Arrows.
Zappy Reaction should also trigger in cases where they have gained armor from allies or enemy damage has been lowered sufficiently.
Hubris causes them to go up to Ward 7, which neuters 7 normal attacks after each of their turns.
