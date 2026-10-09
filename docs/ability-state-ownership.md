# Battle Ability State Ownership

Inventory for Milestone 5, 2026-10-08. All state below is battle-local; campaign
saves persist resolved inputs, not these runtime objects. Replay snapshots expose
visible unit fields only. Runtime state changes affect events, stats, births and
deaths indirectly, rather than becoming new snapshot fields.

| State | Owner | Lifetime / reset | Replay effect |
| --- | --- | --- | --- |
| `RuntimeAbilityState.definition`, `triggerCount`, `usesRemaining` | One ability instance on one source unit | Fresh cloned definition and budget on placement, summon or ability grant; count increments for matching trigger attempts, budget decrements only on application | Charge timing and source use limits determine emitted effects |
| Mercy Before Dawn protection used | Recipient unit, not protecting ability | Once per unit per battle; persists through side/role changes | Recipient may survive one lethal hit; protecting priest retains its separate budget |
| Stoneblood used | Recipient unit | Once per battle; consumes before saving HP and removing Regen | Survival and future healing |
| Fade Into Shadow used | Engaged recipient unit | Once per battle; consumed before attempting retreat, even when no retreat is legal | Ability movement and later engagements |
| Glamour used | Attacked recipient unit | Once per battle; consumed only when a redirect candidate exists | Redirected attack; strike/retaliation do not consume it |
| `activeTimedEffects` | Recipient unit, with source ability/unit attribution | Created on application; decremented/expired on recipient turns | Expiry events and reversible stat/role changes |
| `committedBacklineTargetId` | Acting unit | Retained until objective invalidation | Movement decisions and role metadata |
| `graveVigorBlockedSides` | Recipient unit, partitioned by source side | Once blocked, retained for the battle | Suppresses subsequent beneficial effects from that side |
| `brambleSnareStacks` | Shapeshifting unit | Accumulates on qualifying shapeshifts | Later attack rate reductions |
| `bonusStrikeCharges` | Effect recipient unit | Accumulates on charge grant; spends one per normal attack | Additional strikes |
| `scavengersHungerKills` | Killing unit | Accumulates successful uses up to the mechanic limit | Skeleton summons |
| `sentinelRunesTriggered` | Knight unit | Set only after successful summon placement; retained even on death | Threshold/death summons and engagements |
| `holyConstructsTriggered` | Healed recipient unit | Set after successful summon placement; source priest remains separate | Healing-triggered elemental birth |
| `berserkDeathPending`, `berserkTurnsUntilDeath` | Recipient unit | Lethal-hit state plus explicit turn countdown | Damage immunity followed by forced death |
| `hexedStacks`, `zealStacks` | Recipient unit | Accumulate seed/application effects; no general turn reset | Attack scaling, periodic HP loss/heal/readiness events |
| `summonerUnitId` | Summoned unit | Set on birth and retained | Bonded destruction and summon synergies |
| `pendingDiggyHoleCombatants` | Side | Deferred placement, emptied after appearance | Delayed units and battle termination rules |
| `copiousAleAppliedTroopKeys` | Troop group within a side (current troop-label key) | Applied once per group per battle | One slowed recipient per group |
| `changelingTriggeredSides` | Side | Used once after the beat threshold | Side transfers |
| `corpses` | Battle, indexed by fallen unit | Added on death, removed on corpse consumption | Corpse-dependent ability effects |
| `pendingGraveVigorBlocks` | Battle execution sequence | Queued during effects and flushed after each repeat | Preserves within-effect application ordering |
| `dreamworkTriggeredUnitIdsThisBeat` | Battle, keyed by assisting unit | Cleared each beat | At most one assist per unit per beat |
| `crackExploitsDepth` | Battle effect execution | Nested blast depth, restored after execution | Recursion guard, not a charge counter |
| `effects` mutator adjustments | Battle | Derived once from input and applied to initial/summoned units | Readiness, damage, armor and environmental effects |
| `distinctTypeCache`, alive indexes, snapshot cache, dirty IDs, summoned profiles | Battle | Updated/invalidated by placement, deaths, side transfer and recording | Derived bookkeeping, not ability-use storage |
| `currentTurnUnitId`, beat count, RNG | Battle execution | Updated on beat/turn boundaries; fresh per resolve | Deterministic event and delayed-death ordering |

## Selected Migration

Only the four simple once-per-unit flags move into a typed record with one factory
and explicit read/mark accessors. They share ownership and reset semantics; they
do not belong in source ability `triggerCount` or `usesRemaining`. In particular,
Mercy recipient protection is deliberately named separately from its source.

Initial placement and summoning allocate independent records. Granting abilities,
changing roles, and changing sides do not reset them, matching the prior flags.
No runtime field enters a replay snapshot or persisted input. Consumption order
and the distinction between attempted and successful effects remain unchanged.

Successful-placement flags, timed effect payloads, delayed death, side blocking,
corpses and execution queues remain explicit. Sentinel Runes and Holy Constructs
could share a future once-state contract, but their placement-success conditions
remain outside this first sample. Counters also remain dedicated rather than
being turned into an arbitrary string map.

## Reference Coverage

Six additional complete compressed replays under `src/engine/__fixtures__/unit-once-effects/`
were captured before changing the engine using
`node --import tsx scripts/captureUnitOnceEffectReferences.ts`. Do not regenerate
them to mask migration differences. They cover two recipients of a single troop,
multiple priests, a synthetic single-use priest budget, repeated engagements and
attacks, and fresh summoned units. Existing Milestone 0 references remain intact.

## Verification

The migration retains both placement and summon initialization paths, with all
four old standalone flags removed. Thirteen focused tests verify independent
records, per-effect usage, multiple source/recipient ownership, repeated triggers,
summon initialization and fresh state on a second resolution of the same input.
All six complete effect replays and the five original reference replays match
without recapture after the engine change.

`unitOnceEffects.ts` passes isolated strict TypeScript checking including
unchecked-index and exact-optional checks. The fixture passes strict checking;
adding those extra flags to its dependency graph exposes existing `unitCatalog.ts`
errors rather than errors in the new fixture. Full Vitest suite: 373 tests in 35
files passed (19.22s). Production build passed (12.70s), retaining the existing
large-chunk warning. No persistence or replay version change is needed.
