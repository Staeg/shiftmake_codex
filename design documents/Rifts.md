# Rifts (draft)

This document defines Rift generation, properties, enemy composition, and rewards.

## Design goals

* Every Rift should present a clear risk/reward identity at a glance.
* Players should have enough information to make informed assignments.
* Rift diversity should come from composable properties, not random noise.

## Rift identity model

Each Rift is defined by a bundle of properties:

* `tier`: baseline challenge level.
* `reward package`: immediate + optional bonus rewards.
* `mutators`: optional temporary battle modifiers.
* `timer`: expires after a number of Overworld cycles.

## Rift properties

### Tier

* Controls enemy stat scaling and composition budget. Each tier above 1 gives the enemies +20% to Health, Damage and Speed.
* Influences reward budget directly.
* Each tier of Rift gives it 1 mutator at random.

### Number of Rifts per cycle

* The first cycle should have 3 Rifts, one of which is tier 2 and the others tier 1. The notation used to represent this is 2/1/1. The cycles after that should have the following Rift tiers:
  * 2/1/1/1
  * 2/2/1/1
  * 3/2/1/1
  * 3/2/1/1/1
  * 3/2/2/1/1
  * 3/2/2/2/1
  * 3/3/2/2/1
  * 4/3/2/2/1
  * 4/3/3/2/1
  * 4/3/3/2/2
  * Finally, cycle 12 and onwards should be 4/3/3/3/2: one tier 4 Rift, three tier 3 Rifts, one tier 2 Rift.

### Mutators (battle-level)

Examples:

* `Momentum`: all units gain +10 initiative every Beat.
* `Heavy Air`: ranged attack damage reduced by 50%.
* `Red Hands`: knocking out an enemy gives the unit another turn.
* `Rich`: enemy budget increased by 50%. Rewards doubled (traits give another batch to choose from).
* `Outpost`: enemy budget decreased by 20%.
* `Quagmire`: enemy budget decreased by 50%. Troops sent here spend twice as long recovering, victory or defeat.

Mutators should always be visible before assignment.

## Enemy generation

Enemy armies are generated from a threat budget:

* Base budget: 500 per tier.
* Mutators increase or decrease the budget.
* A random faction and unit type are selected. An additional combination is selected for each tier of the Rift. This means tier 1 Rifts have 2 kinds of enemies and tier 4 Rifts have 5.
* Each troop gets units based on its cost, as many as possible without exceeding budget.

## Rift enemy preview UX

Before commitment, show:

* Full per-unit table.
* Any mutators.
* All rewards, taking into account mutator effects.

## Reward model

Each Rift grants one primary reward as well as additional rewards for each tier above 1. For example, a tier 3 Rift might offer 150 gold, a T2 trait unlock and 50 essence.

### Primary reward categories

* Resources (currency, materials). 50 gold or 50 essence per tier of reward slot used.
* Blueprint/upgrade unlock. Both variants gives a choice of 3 as yet unpicked options. If possible, each blueprint and upgrade will give a selection of 2 picks that already affect a faction type the player has unlocked and 1 will affect ones that are not yet useful; if not possible, random ones of the correct tier will be chosen.
* If a Rift offers either blueprints or upgrades when the player has no more possible unlocks of that tier, it is replaced with 29 gold and 20 essence per tier of that reward.

Note: Blueprint implementation is for next version. That means that any Rift that rolls blueprints as a reward will trigger the replacement clause.

### Reward scaling rules

* Higher tier = larger reward budget. 
* Tier 1 Rifts just have a gold or essence reward.
* Each tier above that chooses a type of reward that hasn't been assigned before and elevates it to the tier level.
* Rifts go up to tier 4, which will have gold, essence, blueprint and trait rewards.
* Hard mutators increase reward multipliers.

## Rift lifecycle states

* `discovered`: visible, unassigned.
* `assigned`: troop locked in.
* `resolved_victory` / `resolved_defeat`.
* `expired`.

## Suggested data shape

```ts
interface Rift {
  id: string;
  seed: number;
  tier: number;
  mutators: string[];
  enemyArmy: Army;
  reward: RewardPackage;
  expiresInCycles?: number;
  state: 'discovered' | 'assigned' | 'resolved_victory' | 'resolved_defeat' | 'expired';
}
```
