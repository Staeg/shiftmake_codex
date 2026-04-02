# Phase 01 Research - Compact UI Layouts

**Date:** 2026-04-02
**Phase:** 1 - Compact UI Layouts
**Requirements:** UI-01, UI-02, UI-03, UI-04

## Objective

Research the current brownfield UI so Phase 1 can be planned safely and specifically. The goal is not a visual redesign or interaction-model rewrite. The goal is to tighten the existing menu, overworld, and replay layouts so they fit a common desktop viewport with less dead space, fewer oversized overlays, and more stable single-screen information density.

## Current UI Shape

- `src/ui/App.svelte` is the main implementation surface at roughly 2,554 lines. It owns menu flow, overworld layout, archive/replay selection, replay controls, recap modal behavior, and the bulk of Phase 1 layout risk.
- `src/app.css` sets global typography and background tokens, but most screen layout and panel styling currently lives inside the `<style>` block in `src/ui/App.svelte`.
- The app already uses CSS grid heavily. This is good for Phase 1 because the target behavior can likely be reached by rebalancing grids, gaps, paddings, fixed widths, and overflow boundaries rather than inventing a new UI architecture.
- The replay runtime in `src/rendering/BattleRenderer.ts` is not the main Phase 1 layout risk. The bigger issue is how replay controls and supporting panes are framed around the viewport in `src/ui/App.svelte`.

## High-Value Findings

### 1. The current shell already matches the desired three-region model

The user wants tighter layouts, not a new interaction model. The code already uses the right broad structure:

- Main shell: `src/ui/App.svelte`
  - `.shell, .replay-shell` use three-column grids
- Overworld detail flow:
  - left inspect
  - center browsing/selection
  - right archive/support/actions
- Replay flow:
  - left focus/detail
  - center viewport
  - right alive counts + event log

This means Phase 1 should preserve the existing regional model and improve fit/density inside those regions.

### 2. The biggest dead-space drivers are generous shell-level padding, large panel chrome, and repeated card spacing

Concrete hotspots in `src/ui/App.svelte`:

- `.shell, .replay-shell`
  - `gap: 1rem; padding: 1rem;`
- `.topbar`
  - padded, rounded, shadowed, and uses a fairly wide `1.2fr 1fr auto` layout
- `.panel, .menu-panel, .draft-panel`
  - `padding: 1rem; border-radius: 20px;`
- `.rift-grid, .faction-grid, .slot-grid, .draft-grid`
  - `grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));`
- replay shell and viewport framing
  - large radii and min-heights on `.replay-shell`, `.replay-center`, `.viewport-shell`, `.viewport`

None of these are individually broken, but together they consume a lot of vertical and horizontal room before gameplay information even appears.

### 3. The replay screen already has the right bounded-scroll architecture, but some minimum sizing is likely too expensive

Relevant replay layout rules in `src/ui/App.svelte`:

- `.replay-shell`
  - `height: 100vh`
  - `grid-template-columns: 280px minmax(0, 1fr) 320px`
  - `overflow: hidden`
- `.replay-center`
  - `min-height: 680px`
- `.viewport-shell`
  - `min-height: 680px`
- `.viewport`
  - `min-height: 680px`
- `.focus-panel`
  - `overflow: auto`
- `.collapsible-stack`
  - bounded internal scrolling for right-rail sections

This is close to the desired phase outcome, but the fixed minimums and heavy chrome around the viewport are likely causing replay fit pressure on shorter desktop heights.

### 4. Oversized overlays are a targeted Phase 1 concern, not an app-wide modal problem

There are a few overlay-style surfaces that matter for this phase:

- game-over / unlock dialog:
  - `.unlock-faction-dialog`
- replay recap:
  - `.replay-recap-modal`
  - `.replay-recap-backdrop`

The UI spec explicitly allows the battle recap overlay to remain, but it should be compact and bounded. So Phase 1 should not remove overlays indiscriminately. It should specifically resize, bound, and simplify the large ones that threaten viewport fit.

### 5. The slot/menu and overworld surfaces are likely plan-friendly extraction seams

Even though `App.svelte` is large, the screen branches are explicit:

- `main_menu`
- `overworld` opening unlock
- `overworld` planning
- `replay`

This suggests a safe refactor strategy:

- extract screen-region or screen-mode components
- keep data/control logic in `App.svelte` initially
- move markup and local layout styling first

That gives Phase 1 a way to reduce layout blast radius without trying to rewrite state flow or store interactions.

## Recommended Phase Framing

Phase 1 should be planned as a brownfield layout-and-structure pass with three practical workstreams:

1. **Shared shell and chrome tightening**
   - normalize gaps, paddings, panel radii, topbar density, and reusable panel/card rhythm
2. **Overworld fit pass**
   - tighten the main planning shell, left/center/right weighting, archive/detail density, and opening unlock presentation
3. **Replay fit pass**
   - preserve the dominant battlefield, but reduce shell overhead, make side rails more compact, and bound recap/timeline/detail scrolling more clearly

This is a better fit than planning by visual primitives alone because the user’s complaint is screen-flow-specific.

## Safe Execution Strategy

### Recommended slicing

**Plan 1: Layout tokens and shell tightening**
- Touch shared panel/card/topbar spacing and shell fit rules first
- This creates the density baseline the later screen-specific work can use

**Plan 2: Menu + overworld layout refinement**
- Apply the shared layout baseline to `main_menu`, `opening_unlock`, and `planning`
- Focus on no-routine-scroll and reducing dead space before any decorative changes

**Plan 3: Replay layout refinement**
- Adjust replay shell widths, viewport framing, control density, right-rail behavior, and recap fit
- Keep `BattleRenderer.ts` mostly untouched unless layout work proves it needs a new container contract

### Extraction guidance

If component extraction is included, keep it narrow and screen-responsibility-based:

- menu surface
- overworld left/center/right surface blocks
- replay left/center/right surface blocks

Do **not** mix this phase with deep store refactors or renderer rewrites. The highest-value extraction is “reduce markup density inside `App.svelte` so layout work becomes safer,” not “re-architect the app.”

## File-Level Hotspots

### Primary execution files

- `src/ui/App.svelte`
  - main target for all Phase 1 layout work
- `src/app.css`
  - global typography/background tokens; useful if layout tokens should be centralized

### Likely read-first dependencies

- `src/ui/BattleControls.svelte`
  - replay controls contract
- `src/ui/EventLog.svelte`
  - bounded scrolling and replay sidebar fit
- `src/ui/StatBreakdownGrid.svelte`
  - detail-panel density
- `src/ui/UnitTooltip.svelte`
  - focus/detail panel fit
- `src/rendering/BattleRenderer.ts`
  - only to confirm viewport container assumptions and zoom/control overlays

### Lower-priority / avoid unless needed

- `src/store/gameStore.ts`
  - not a Phase 1 target unless layout changes uncover obvious view-state friction
- `src/engine/*`
  - out of scope for this phase by architecture and roadmap

## Risks And Constraints

### Risk: `App.svelte` blast radius

Because `src/ui/App.svelte` contains all three screen modes plus large embedded CSS, seemingly small spacing or structural changes can regress unrelated flows.

**Planning implication:** plans should stage shell changes before screen-specific changes, and acceptance criteria should mention all affected screens explicitly.

### Risk: replay layout can regress visibility while “fixing” scroll

Because the replay view already uses bounded internal scrolling and `height: 100vh`, aggressive compaction could accidentally make the battlefield feel cramped or move core controls out of sight.

**Planning implication:** replay tasks should verify battlefield dominance and control visibility, not just reduced scrolling.

### Risk: hidden coupling between visual density and inspect behavior

The current UI uses hover preview, pinned detail, selection state, archive selection, and recap expansion in one surface. Tightening layout without preserving these hooks could reduce readability rather than improve it.

**Planning implication:** plans should treat interaction preservation as part of layout work, especially for overworld inspect panels and replay focus behavior.

## Validation Architecture

Phase 1 validation should rely on a mix of file-level checks and manual viewport verification.

### Required artifact-level checks

- confirm shell/grid definitions still exist for:
  - main menu / overworld shell
  - replay shell
- confirm replay icon-only controls retain explicit labels/tooltip behavior per `01-UI-SPEC.md`
- confirm recap and log surfaces use bounded internal scroll rather than forcing page scroll

### Manual verification targets

At a minimum, validate at common desktop size `1366x768`:

- `main_menu`
  - all three slot cards and primary actions visible without page scroll
- `overworld planning`
  - topbar, inspect panel, center selection region, right support/archive region, and end-cycle CTA visible together outside dense edge cases
- `replay`
  - battlefield viewport, left focus panel, right rail controls/alive counts, and replay controls visible together

### Suggested execution-time checks

- run the app and manually inspect the three target screens
- prefer screenshot-based verification or side-by-side before/after capture if available
- if a scroll remains necessary, it should be internal to archive/log/recap-style bounded panels, not the page shell

## Planner Guidance

- Use the approved `01-UI-SPEC.md` as the primary design contract
- Plan for minimal interaction-model change
- Focus first on density, fit, and bounded scroll behavior
- Keep shared shell adjustments separate from screen-specific tuning
- Prefer small responsible component extraction over massive reorganization
- Treat `src/ui/App.svelte` as the center of gravity, with adjacent replay/detail components as secondary support files

## Recommended Outcome For Planning

The planner should produce a small number of concrete plans that:

- establish shared compact-layout rules
- apply them to menu/opening/overworld surfaces
- apply them to replay surfaces
- include clear viewport-fit acceptance criteria
- keep engine/store changes out unless strictly necessary for UI fit

---
*Research prepared locally after a stalled researcher run. Downstream planners should treat this as the phase technical research artifact.*
