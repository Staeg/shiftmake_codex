# Rifts (draft)

This document defines Rift generation, properties, enemy composition, and rewards.

## Design goals

* Every Rift should present a clear risk/reward identity at a glance.
* Players should have enough information to make informed assignments.
* Rift diversity should come from composable properties, not random noise.

## Rift identity model

Each Rift is defined by a bundle of properties:

* `tier`: baseline challenge level.
* `biome`: thematic ruleset (e.g., Ruins, Wilds, Ashfields, Crystal).
* `stability`: how volatile outcomes/modifiers are.
* `enemy profile`: faction mix + role distribution + special tags.
* `reward package`: immediate + optional bonus rewards.
* `mutators`: optional temporary battle modifiers.
* `timer` (optional): expires after N cycles.

## Suggested Rift properties

### Tier

* Controls enemy stat scaling and composition budget.
* Influences reward budget directly.
* Can gate rare mutators and unique drops.

### Biome

Biome can apply one passive rule to all battles in this Rift.
Examples:

* Ruins: higher armor prevalence.
* Wilds: faster chaff and ambush-style role mixes.
* Ashfields: reduced healing/recovery efficiency.
* Crystal: higher ranged prevalence and fragile high-damage enemies.

### Stability

* Stable: predictable enemy roster and rewards.
* Unstable: 1-2 hidden encounter twists revealed at assignment lock.
* Fractured: stronger reward multipliers but includes harsh mutators.

### Mutators (battle-level)

Examples:

* `Momentum`: all units gain +X initiative on Beat 1.
* `Thin Lines`: saturation limit reduced by 1.
* `Heavy Air`: ranged attack damage reduced by Y.
* `Blood Price`: knockout events accelerate initiative for all alive units.

Mutators should always be visible before assignment unless explicitly marked as hidden by a Rift property.

## Enemy generation (draft)

Enemy armies are generated from a threat budget:

* Base budget from tier.
* Biome and mutators convert budget into specific stats/roles.
* Role quotas maintain readable shape (frontline/chaff/backline proportions).

Suggested composition archetypes:

* Bulwark: heavy frontline + low ranged.
* Swarm: high chaff count, low individual stats.
* Spearline: moderate frontline + strong backline.
* Glass Cannon: fragile units with high damage/speed.
* Mixed Patrol: balanced spread for neutral baseline.

## Rift enemy preview UX

Before commitment, show:

* Total threat rating.
* Unit count by role.
* Notable tags (armor-heavy, ranged-heavy, fast, etc.).
* Any mutators and whether they are fixed or hidden.

Optional advanced view:

* Full per-unit archetype table.
* Simulated matchup hints against selected troop.

## Reward model (draft)

Each Rift grants one primary reward plus optional bonuses.

### Primary reward categories

* Resources (currency, materials).
* Unlock progress (new faction, troop, or node access).
* Upgrade tokens (faction-wide or unit-type-wide).
* Rare blueprint/trait unlock chance.

### Bonus rewards

* Perfect-clear bonus (minimal knockouts or damage thresholds).
* Speed bonus (resolve under N beats).
* Risk bonus (unstable/fractured Rifts).

### Reward scaling rules

* Higher tier = larger reward budget.
* Hard mutators increase reward multipliers.
* Very safe/predictable Rifts pay less than volatile/high-risk Rifts.

## Failure and retreat outcomes (draft)

* Defeat still grants small consolation rewards (optional, tuned low).
* Defeat increases recovery time for deployed troops.
* Failed Rifts may persist for one cycle with changed modifiers, or close permanently.

## Rift lifecycle states

* `discovered`: visible, unassigned.
* `assigned`: troop locked in.
* `resolving`: battle in progress or queued.
* `resolved_victory` / `resolved_defeat`.
* `expired` or `collapsed`.

## Suggested data shape

```ts
interface Rift {
  id: string;
  seed: number;
  tier: number;
  biome: string;
  stability: 'stable' | 'unstable' | 'fractured';
  mutators: string[];
  threatRating: number;
  enemyArmy: Army;
  reward: RewardPackage;
  bonusRewards: RewardPackage[];
  expiresInCycles?: number;
  state: 'discovered' | 'assigned' | 'resolving' | 'resolved_victory' | 'resolved_defeat' | 'expired';
}
```

## Open design questions

* Should hidden mutators be allowed at all, or only in specific stability classes?
* Should failed Rifts mutate and remain, or always disappear after resolution?
* How much of enemy composition should be exact versus summarized before assignment?
* Should certain factions gain affinity bonuses in matching biomes?
