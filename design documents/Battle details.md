# Battle details

This document describes the current battle implementation in `src/engine/battle.ts`.

## Map

Battles take place on a hex grid.

- Starting map radius: `3`
- The map expands automatically if spawning both armies would otherwise fail.
- Each Rift can define a saturation limit.
- Default saturation is `10` if none is supplied.

Saturation rule:

- A unit may move into a hex only if allied total `size` on that hex, including itself, would stay `<= saturation`.

## Spawning

Each combatant definition expands into individual units equal to its `quantity`.

Per side:

- ranged units spawn from the side's corner hex
- melee units spawn one step closer to the center
- melee units do not reuse ranged spawn hexes for that side
- units spread across nearby legal hexes when needed
- placement prefers the least-saturated available spawn hexes

If either army cannot be spawned, map radius increases by 1 and spawning is retried.

## Beats and initiative

Battles advance in beats.

On each beat:

1. Every alive unit gains initiative equal to `speed + mutator bonus`.
2. A replay `beat` step is logged.
3. Beat-timed mutators then resolve.
4. Units with initiative `>= 100` act in shuffled order.
5. Each acting unit spends `100` initiative.

Initial initiative is random from `0` to `10` inclusive.

If a battle reaches `1000` beats, it stops and the outcome is resolved from remaining survivors, which usually means a draw.

## Turn flow

For each acting unit:

1. Trigger `startOfTurn` abilities.
2. If still alive, execute role/engagement behavior.
3. Trigger `endOfTurn` abilities.
4. Expire that unit's temporary timed effects.

The battle engine also supports passive runtime hooks that are still replay-visible:

- receive-side modifiers such as doubled healing or stat gains
- move-off-hex triggers such as `Sentinel Runes`
- per-shapeshift triggers such as `Forest Friends` and `Bramble Snare`
- side-wide summon synergies that can affect future wolves or elementals even if the original source troop type is absent from that specific battle
- target gating such as `Grave Vigor`, which removes already affected allies from later beneficial targeting by Grave Vigor Shamans

## Combat rules

Normal attack damage is:

`max(attacker damage - effective armor, 0)`

If armor is negative, it increases incoming normal damage instead of reducing it.

Ranged attacks are further multiplied by any active mutator effect, currently only `Heavy Air`.

`Shield Drill` is a Soldier sidegrade: Soldiers have lower armor, but ranged attacks against Soldiers are capped at 1 damage after all other modifiers.

Current mutator-specific battle rules include:

- `Momentum`: all units gain +10 initiative each beat
- `Haze`: all units lose 5 initiative each beat
- `Animated`: `Fading` is removed from all units, including summons and future granted effects
- `Corrosion`: all units start at 0 armor and cannot have positive armor during that battle
- `Quakes`: every 10 beats, each unit is displaced to a random adjacent hex if one fits the saturation rules
- `Decay`: every beat, each unit loses 1 HP ignoring armor

If a target reaches `0` HP:

- it is killed
- all its engagements are removed
- `onKill`, `onDeath`, and `onFallen` triggers fire as appropriate
- non-`Fading` units leave corpses that corpse-consuming abilities can use
- some upgrades can replace corpse use with health payment, consume corpses on kills, or trigger additional summon or heal reactions off the death event

## Engagements

Engagements are explicit and symmetric.

- `capacity` is how much enemy `size` a unit can engage
- `size` is how much capacity that unit consumes when engaged
- moving away clears engagements
- dead units are removed from all engagements

`redirect` does not replace existing engagements. It only creates a new one when:

- the target is alive
- the target is currently unengaged
- the actor is not already engaging the target
- the actor still has enough capacity

## Role behavior

### Frontline

- Frontline units try to hold the line first.
- They prefer to intercept enemy frontline or chaff before those enemies can reach allied backline units.
- If no meaningful frontline target remains, they push into reachable enemy backline instead of idling.

### Chaff

- Chaff units are the breakthrough role.
- They look for openings past the frontline, prefer to spill into enemy backline targets, and keep pressuring that backline once they get there.
- If they are already in the scrum, they pile onto same-hex enemies to keep pressure high.

### Backline

- Backline units try to keep space.
- If threatened up close, they prefer to reposition into safer hexes that preserve or increase distance from enemies.
- Otherwise they attack from range, or advance carefully only when they can do so without giving up their spacing advantage.

## Replay output

Every battle produces a deterministic replay containing:

- initial snapshot
- all battle steps with snapshots
- troop profiles with resolved stats and abilities
- alive-count history
- end summary

The renderer is only a replay consumer.

Because replay steps carry source ability ids and labels, upgrade moments such as `Bolstering Light`, `Living Circuit`, `Loot Frenzy`, `Sentinel Runes`, and `Thrill of the Hunt` can be audited directly from the log.
