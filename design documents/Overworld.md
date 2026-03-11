# Overworld (draft)

This document defines the strategic layer that sits between battles.

## Design goals

* Prioritize readable, low-friction decision-making.
* Keep risk/reward legible before commitment.
* Encourage long-term planning through faction cooldown pressure, not hidden information.
* Make phase transitions explicit so players always know what actions are available.

## Core loop

1. New Rifts appear.
2. Player inspects Rift threats/rewards.
3. Player assigns available troops to selected Rifts.
4. Assigned battles resolve (with replay access).
5. Recovery timers advance; resources and unlocks are granted.
6. Player spends resources in management/upgrades.
7. Next cycle begins.

## Global state shown at all times

* Current cycle/turn number.
* Total resources by type.
* Number of active troops, recovering troops, and idle troops.
* Global modifiers currently in effect.
* Button to open Battle Replays archive.

## Phases and available actions

### 1. Planning phase

Purpose: inspect map-level opportunities and prepare commitments.

Available actions:

* Inspect each open Rift (enemy composition, threat tags, reward package).
* Filter/sort Rifts (reward type, danger, distance, faction affinity).
* Inspect troop readiness and current builds.
* Pin Rifts for later consideration.

Unavailable actions:

* Final troop commitment.
* Upgrades that would alter already-committed battles.

### 2. Assignment phase

Purpose: commit troops to specific Rifts.

Available actions:

* Select one troop and assign it to one Rift.
* Reassign before locking phase.
* Validate assignment conflicts (one troop/faction lock rules).
* Confirm assignments and lock.

Unavailable actions:

* Editing committed assignments after lock.

### 3. Resolution phase

Purpose: process all committed battles and outcomes.

Available actions:

* Watch live auto-resolve or skip to summary.
* Open step-by-step replay of any resolved battle.
* Inspect event logs and unit outcomes.

Unavailable actions:

* New assignments.
* Upgrade spending until all selected battles finish.

### 4. Recovery and management phase

Purpose: apply outcomes and prepare next cycle.

Available actions:

* Review gained rewards, losses, and cooldowns.
* Spend resources on upgrades and unlocks.
* Reorganize troop compositions (if feature enabled).
* End phase to generate next Rift set.

Unavailable actions:

* Entering newly generated Rifts until phase ends.

## Suggested interface layout

## Top bar

* Left: cycle number, difficulty tier, objective progress.
* Center: key resources.
* Right: settings, help, replay archive.

## Left panel (Rift browser)

* Rift list cards with threat, reward, and status badges.
* Search/filter controls.
* "Pinned" subsection.

## Center panel (map canvas)

* Overworld map with Rift nodes.
* Visual links indicating route or region grouping.
* Hover state: quick summary tooltip.
* Click state: full Rift detail card on right panel.

## Right panel (context panel)

This panel changes by selected context:

* Rift selected: full enemy preview, rewards, suggested counters.
* Troop selected: unit makeup, upgrades, readiness, faction lock notes.
* Assignment summary: committed pairings and unresolved conflicts.

## Bottom action rail

Phase-specific primary actions:

* Planning: `Enter Assignment`
* Assignment: `Lock Assignments`
* Resolution: `Skip to Results` / `Watch Replays`
* Recovery: `Confirm Upgrades` / `Start Next Cycle`

## UX behavior and guardrails

* Primary action button should always state current phase intent (never generic "Continue").
* Illegal assignments must be blocked with explicit, localized error messages.
* Any action that ends a phase should show a short confirmation summary.
* Replays must remain accessible after phase transitions.

## Data and balancing hooks (draft)

* Rift generation seed per cycle for deterministic debugging.
* Threat budget per cycle (grows over time).
* Reward budget per cycle tied to threat and biome modifiers.
* Recovery duration multipliers based on outcome and troop state.

## Open design questions

* Whether assignment is one troop per Rift only, or allows multi-troop deployments later.
* Whether player can partially skip Resolution and only replay selected battles.
* Whether map geography (distance/region) should mechanically affect rewards or cooldown.
