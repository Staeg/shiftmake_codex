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
3. Units with initiative `>= 100` act in shuffled order.
4. Each acting unit spends `100` initiative.

Initial initiative is random from `0` to `10` inclusive.

If a battle reaches `1000` beats, it stops and the outcome is resolved from remaining survivors, which usually means a draw.

## Turn flow

For each acting unit:

1. Trigger `startOfTurn` abilities.
2. If still alive, execute role/engagement behavior.
3. Trigger `endOfTurn` abilities.
4. Expire that unit's temporary timed effects.

## Combat rules

Normal attack damage is:

`max(attacker damage - target armor, 0)`

Ranged attacks are further multiplied by any active mutator effect, currently only `Heavy Air`.

If a target reaches `0` HP:

- it is killed
- all its engagements are removed
- `onKill`, `onDeath`, and `onFallen` triggers fire as appropriate

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

- If any unengaged enemies share the hex, engage them and fight.
- Otherwise pursue enemy frontline or chaff.

### Chaff

- If no unengaged enemies share the hex, pursue enemy backline.
- Otherwise pile on a same-hex target, preferring enemies already engaged by allies on that hex.

### Backline

- If enemies share the hex, retreat to a random adjacent enemy-free hex if possible; otherwise attack a same-hex enemy.
- Else if enemies are in range, make a ranged attack.
- Else carefully advance toward the nearest enemy while avoiding stepping onto a hex occupied by a shorter-range ally.

## Replay output

Every battle produces a deterministic replay containing:

- initial snapshot
- all battle steps with snapshots
- troop profiles with resolved stats and abilities
- alive-count history
- end summary

The renderer is only a replay consumer.
