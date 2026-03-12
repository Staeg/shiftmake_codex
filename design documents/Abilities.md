# Abilities
All abilities have a Baseline effect. Each of those have a default target and trigger timing.
Many have modifiers. A bundle of modifiers on top of a baseline effect might be given a particular name for aesthetic purposes, but it's an abbreviation.
Some have effects on the overworld, which do not interact with the modifier system.

## Baseline effects

* Blast X
    * Target: attacked enemy's hex
    * Trigger: on attack
    * Effect: all enemy units on that hex take X damage
* Boost X
    * Target: self
    * Trigger: start of battle
    * Effect: gain +X% health, damage and speed for the battle
* Heal X
    * Target: friendly, within unit's range, prioritize most damaged
    * Trigger: end of turn
    * Effect: target regains X health
* 
    * Target: 
    * Trigger: 
    * Effect: 
* Pack X
    * Target: self
    * Trigger: passive
    * Effect: increases damage by X for each allied unit on this unit's hex
* Ramp X
    * Target: self
    * Trigger: end of turn
    * Effect: increase target's damage by 1 for the battle
* Strike X
    * Target: attacked enemy
    * Trigger: on attack
    * Effect: deliver a normal attack against them X additional times

## Modifiers

### Trigger

* Onkill: changes Trigger to occur after knocking out an enemy unit
* Revenge: changes Trigger to occur after getting knocked out
* Frenzy: changes Trigger to occur after losing health

### Target

"Of the original allegiance" means that if the original effect targeted allies, the modified effect also targets only allies. Likewise for enemies and all units.

* Self: changes Target to affect the unit itself
* AoE X: changes Target to affect all units of the original allegiance within X hexes instead
* Random X: changes Target to a random unit of the original allegiance within X hexes instead

### Amplifiers

* Combined arms: for each other friendly troop type when triggered, repeat the effect 

### Conditions

* Forsaken: only triggers if no other friendly troops are present

## Examples

* Valor X: Onkill, AoE 0, Heal X
    * Upon knocking out an enemy, all allies on this unit's hex regain X health.
* Regen X: Self, Heal X
    * Regain X health at the end of every turn.
* Goblin farewell: Revenge, Random 0, Strike 1
    * Upon getting knocked out, attack a random enemy unit on this hex.

## Overworld abilities

* United
    * Effect: allows going to the same Rift as other units of this faction.