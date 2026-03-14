# Abilities
All abilities have a Baseline effect. Each of those have a default target and trigger timing.
Many have modifiers. A bundle of modifiers on top of a baseline effect might be given a particular name for aesthetic purposes, but it's an abbreviation.
Some have effects on the overworld, which do not interact with the modifier system.

## Baseline effects

* Blast X
    * Default Duration: instant
    * Default Target: attacked enemy's hex
    * Default Trigger: on attack
    * Effect: all enemy units on that hex take X damage
* Bolster X or X%
    * Default Duration: battle
    * Default Target: self
    * Default Trigger: end of turn
    * Effect: target gets +X or +X% max and current health for the battle
* Haste X or X%
    * Default Duration: battle
    * Default Target: self
    * Default Trigger: end of turn
    * Effect: increase target's speed by +X or +X% for the battle
* Heal X or X%
    * Default Duration: instant
    * Default Target: friendly, within unit's range, prioritize most damaged
    * Default Trigger: end of turn
    * Effect: target regains X or X% missing health
* 
    * Default Target: 
    * Default Trigger: 
    * Effect: 
* Rangeset X
    * Default Duration: instant
    * Default Target: self
    * Default Trigger: start of battle
    * Effect: changes target's range to X
* Ramp X or X%
    * Default Duration: battle
    * Default Target: self
    * Default Trigger: end of turn
    * Effect: target gets +X or +X% damage health for the battle
* Redirect
    * Default Duration: instant
    * Default Target: attacked enemy
    * Default Trigger: on attack
    * Effect: Engage target if this unit's Capacity allows. Does not break existing engagements.
* Roleset 
    * Default Duration: instant
    * Default Target: self
    * Default Trigger: start of battle
    * Effect: changes target's role to X
* Strike X
    * Default Duration: instant
    * Default Target: attacked enemy
    * Default Trigger: on attack
    * Effect: deliver a normal attack against them X additional times

## Modifiers
Allegiance refers to allied, enemy or all (both).

### Duration

#### Replacements

* Turns X: ability duration is changed to last for X turns

### Trigger

#### Conditions

* Charge X: ability is used only only once every X Triggers
    * Example: Charge 3 Blast 10 does nothing on attacks #1, #2, #4, #5 and deals 10 damage to enemies on attacked hex on attacks #3 and #6, etc
* Combined arms: ability triggers once for each other friendly primary troop Type
* Gang: for each other friendly unit on this unit's hex, repeat the effect
* Forsaken: only triggers if no other friendly troops are present 
* Uses X: after ability is used X times, ability becomes disabled

#### Replacements

* Fallen X Y: changes Trigger to occur if a unit of allegiance X is knocked out within Y hexes
* Frenzy: changes Trigger to occur after losing health
* Onkill: changes Trigger to occur after knocking out an enemy unit
* Revenge: changes Trigger to occur after getting knocked out
* Turnend: changes Trigger to occur at the end of the unit's turn
* Turnstart: changes Trigger to occur at the start of the unit's turn

### Target

#### Conditions

* Not X: ability cannot affect units which have type or attribute X
* Only X: ability can only affect units which have type or attribute X
* Prio X: ability affects units which have type or attribute X if possible
* Unengaged: ability only affects non-Engaged units

#### Replacements

* AoE X Y: changes Target to affect all units of X allegiance within Y hexes instead
* Random X Y: changes Target to a random unit of X allegiance within Y hexes instead
* Self: changes Target to affect the unit itself


## Examples
They follow the format: {Duration} (Triggers) [Targets] Baseline effects

* Enhance X: [Random ally 2, Not caster] Haste X, Ramp X
    * At the end of every turn, increase the damage and speed of a random ally within 2 hexes by 1.
* Goblin farewell: (Revenge) [Random enemy 0] Strike 1
    * Upon getting knocked out, attack a random enemy unit on this hex.
* Pack X: {Turns 1} (Turnstart, Gang) Ramp X
    * At the start of every turn, this unit gets X damage per friendly unit on its hex for the duration of the turn.
* Power of friendship: (Combined arms) Bolster 20%, Haste 20%, Ramp 20%
    * At the start of battle, this unit gains 20% current and max health, speed and damage for each type among other friendly units.
* Regen X: [Self] Heal X
    * Regain X health at the end of every turn.
* Shapeshift - Bear: (Charge 5, Uses 1) Bolster 100, Haste 5, Ramp 20, Rangeset 0, Roleset Frontline
    * After 5 turns, this unit gains 100 current and max health, 5 speed, 20 damage as well as becoming Frontline with range 0.
* Taunt: (Endturn) [AoE 0, Unengaged] Redirect
    * At the end of turn, Engage non-Engaged enemies up to Capacity.
* Valor X: (Onkill) [AoE ally 0] Heal X
    * Upon knocking out an enemy, all allies on this unit's hex regain X health.
* Vengeance X: (Fallen ally 0) Haste X, Ramp X
    * When an ally is knocked out on the unit's hex, the unit gains X speed and damage.

## Overworld abilities

* United
    * Effect: allows going to the same Rift as other units of this faction.
