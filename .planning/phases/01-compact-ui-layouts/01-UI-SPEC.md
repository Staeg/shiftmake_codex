---
phase: 1
slug: compact-ui-layouts
status: approved
shadcn_initialized: false
preset: none
created: 2026-04-02
reviewed_at: 2026-04-02
---

# Phase 1 - UI Design Contract

> Visual and interaction contract for frontend phases. Generated from roadmap, requirements, project context, and current Svelte/CSS surfaces.

---

## Design System

| Property | Value |
|----------|-------|
| Tool | none |
| Preset | not applicable |
| Component library | none |
| Icon library | existing inline glyphs and unit/rift sprites only |
| Font | Alegreya Sans SC for headings and UI chrome, IBM Plex Mono for controls and numeric/UI detail |

**Source notes**
- Visual language is preserved from `src/app.css` and `src/ui/App.svelte`: dark navy surfaces, warm gold accent, cool slate secondary text, pixel-art sprites, and mono control text.
- Phase intent is tightening density and screen fit, not introducing drawers, new popup systems, or a new design system.

---

## Spacing Scale

Declared values (must be multiples of 4):

| Token | Value | Usage |
|-------|-------|-------|
| xs | 4px | Icon gaps, stacked micro-label spacing, bar/chart separation |
| sm | 8px | Chip padding, pill spacing, button internal gaps |
| md | 16px | Default panel padding, card gaps, section spacing |
| lg | 24px | Topbar padding, major card padding, column gaps |
| xl | 32px | Screen edge padding at full desktop |
| 2xl | 48px | Reserved for exceptional empty states only |
| 3xl | 64px | Not used in Phase 1 gameplay screens |

Exceptions: `44px` minimum hit target for clickable icon-only controls such as replay zoom and small inspect buttons.

**Density rules**
- Common desktop target is `1366x768` and above. Primary gameplay screens must fit without routine page scrolling.
- Default outer page padding is `16px`, not `32px`, on gameplay screens.
- Default panel padding is `16px`. Dense panels may use `8px` only for replay sidebars, archive rows, and compact assignment grids.
- Default gap between stacked sections is `16px`. Do not exceed `24px` inside gameplay panels.
- Avoid empty vertical bands. If a panel contains only 1-2 rows of content, it should collapse to content height rather than reserve extra space.

---

## Typography

| Role | Size | Weight | Line Height |
|------|------|--------|-------------|
| Body | 14px | 400 | 1.5 |
| Label | 12px | 600 | 1.3 |
| Heading | 20px | 600 | 1.2 |
| Display | 28px | 600 | 1.15 |

**Typography rules**
- Use exactly two weights in Phase 1 UI: `400` and `600`.
- Body copy, metadata, explanatory text, and replay detail text use `14px`.
- Eyebrows, chip labels, compact metadata, and panel toggles use `12px` uppercase or small caps styling.
- Screen titles use `28px` only once per screen.
- Section titles inside panels use `20px`.
- Numeric emphasis such as VP, alive counts, and slot state may scale to `20px` or `28px`, but not beyond the display size.

---

## Color

| Role | Value | Usage |
|------|-------|-------|
| Dominant (60%) | `#0a1018` | App background, replay field surround, page canvas |
| Secondary (30%) | `#161f2a` | Panels, cards, topbar, modal surfaces, compact tiles |
| Accent (10%) | `#d4ad73` | Current selection outlines, primary CTA fills, focused replay rows, critical highlighted controls only |
| Destructive | `#aa5f5f` | Blocked warnings, destructive/replace confirmations only |

Accent reserved for: primary CTA, selected rift/troop/archive card, active mode toggle, focused replay unit row, confirmation-state end-cycle button, and key outcome emphasis. Accent must not be used for all buttons, all chips, or passive metadata.

**Color rules**
- Preserve the dark steel-and-brass palette already present in the app.
- Secondary text uses cool slate tones in the `#93a9bc` to `#a7b8c8` range.
- Essence may keep its existing violet glow as a semantic resource cue, but it is not a second accent system.
- Replay health/detail bars may keep existing warm damage and green healing colors because they are semantic chart colors, not navigation accents.

---

## Copywriting Contract

| Element | Copy |
|---------|------|
| Primary CTA | End Cycle |
| Empty state heading | No Focus Item |
| Empty state body | Select a Rift, troop, or archive entry to inspect details without leaving the current screen. |
| Error state | Replay data unavailable. This archive entry is still saved as a summary. Return to the archive or continue planning. |
| Destructive confirmation | Replace Save: Replace this save slot and start a new campaign? This cannot be undone. |

**Additional locked copy**
- Main menu primary action labels remain `Load Slot` and `Start Campaign`.
- Replay launch CTA remains `Watch Battle`.
- Replay exit action remains `Return to Overworld`.
- Archive back action remains `Back to Archive`.
- Validation block heading remains direct and specific: `Can't End Cycle Yet`.
- End-cycle confirmation uses the existing two-step label pattern: `End Cycle` -> `Confirm End Cycle`.

---

## Layout Contract

### Main Menu
- Keep a single-screen centered panel with the save slots visible together.
- Slot cards stay in one grid, targeting `3` columns on common desktop widths.
- Reduce introductory copy to a short supporting paragraph; the slot grid is the main content.
- Slot metadata stays compact and stacked in-card. Do not introduce separate detail popups for slots.
- `Replace Save` is visually secondary to `Load Slot` or `Start Campaign`.

### Opening Unlock
- Keep the existing left-detail plus right-choice layout.
- The left inspect panel is persistent on desktop and must not require a popup for troop/faction preview.
- Faction cards and troop-icon grids should favor dense icon presentation over large descriptive blocks.
- Hover and focus preview behavior is preserved; pinning remains available.

### Overworld Planning
- Preserve the current three-region model: left inspect, center selection grid, right support/archive/actions.
- Desktop target layout is `320px / flexible / 320px` or tighter if needed. Do not exceed `1040px` total content width before internal wrapping.
- The topbar must stay one row at common desktop sizes, with title, resource strip, and mode actions visible together.
- Center content is the primary browsing surface. Left and right columns are support panels and must not visually overpower the center.
- Rift cards prioritize: tier/id, VP, mutators, assigned troops, and one direct action. Remove decorative dead space before compressing information density.
- Troop mode prioritizes: troop identity, readiness/assignment, core stats, abilities, and assignment targets in one view.
- Archive access stays in the right column rather than opening a new navigation mode.

### Replay
- Replay remains a three-region composition with the battlefield dominant.
- Desktop target layout is `280px / flexible / 320px`.
- The battlefield viewport owns the most area and should remain visible at all times while side panels scroll independently.
- Live timeline and alive counts stay docked, collapsible, and visible in the right rail. Do not move them to modal-only access.
- Battle recap is the only large overlay retained in this phase. It must fit within viewport height and avoid routine scrolling where possible.

---

## Interaction Contract

### General
- Favor in-place inspection, hover previews, and pinned side-panel detail over new modals or drawers.
- Selection is single-focus per domain: one rift, one troop, or one archive entry at a time.
- Hover may preview additional detail, but click locks it.
- Scroll should occur inside bounded panels before the full page scrolls.

### Overworld
- Switching between `Rifts` and `Factions & Troops` must not reflow the whole page into a different navigation paradigm.
- Assign/unassign actions happen directly from the selected context and from the corresponding card list; keep both fast paths.
- Archive inspection happens in the existing right panel. Opening replay is a deliberate explicit action, not automatic on selection.
- The game-over dialog remains an overlay, but it should stay compact and action-first.

### Replay
- Hovering a unit, mutator, or roster row previews details in the left focus panel.
- Clicking a unit or roster row locks focus until another item is selected or focus is cleared.
- Alive counts support two modes only: compact totals and expanded roster.
- Event log stays collapsible instead of moving off-screen or behind a new popup.
- Replay zoom controls remain overlay buttons inside the battlefield frame.
- Every icon-only replay control must expose an accessible name via `aria-label` and a matching tooltip on hover/focus. If a control cannot provide both, it must render visible text instead of icon-only chrome.
- Required replay control labels are explicit: `Zoom In`, `Zoom Out`, `Reset Zoom`, `Play`, `Pause`, `Next Step`, `Previous Step`, and `Open Battle Recap` wherever those controls appear.
- Battle recap remains user-invoked and dismissible; it must not block standard replay inspection unless opened intentionally.

---

## Screen-Specific Fit Targets

- `main_menu`: all three slots and main actions visible at `1366x768` without page scroll.
- `overworld planning`: topbar, selected-detail panel, center grid, right-side actions/archive, and footer CTA visible with at most internal panel scroll in dense states.
- `replay`: viewport, controls, left focus panel, alive counts, and timeline toggle visible together at `1366x768`; event log body may scroll internally.
- Unusually dense edge cases may scroll inside archive, offer, or recap panels, but the primary shell should remain fixed and legible.

---

## Component Inventory

- `Topbar`: cycle title, resource strip, mode toggle, exit-to-menu.
- `Panel`: shared compact surface for menu, overworld, replay, warnings, and detail views.
- `Rift card`: title, visual, reward pills, mutators, assigned troop strip, optional quick action.
- `Troop chip`: portrait, label, state summary.
- `Detail panel`: selected or hovered inspection target with stat grid and ability chips.
- `Archive card`: replay summary row with status.
- `Replay focus panel`: mutator/detail copy or docked unit tooltip.
- `Replay sidebar stacks`: alive counts block plus event log block.
- `Battle recap modal`: compact two-column comparison with expandable troop groups.

No new component family is required for this phase. Refine and split the existing `App.svelte` surface into these responsibilities if needed.

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| shadcn official | none | not applicable |

---

## Implementation Notes For Planner

- Preserve the current visual language and typography families.
- Prioritize layout tightening before visual restyling.
- Remove dead space by reducing padding, card height, and redundant copy before hiding information.
- Prefer bounded internal scrolling on archive, event log, recap, and long upgrade lists.
- Do not introduce drawers, slide-over panels, or new popup-driven inspection systems in Phase 1.
- If component extraction is needed, extract by screen responsibility: menu, overworld left/center/right, replay left/center/right.

---

## Checker Sign-Off

- [ ] Dimension 1 Copywriting: PASS
- [ ] Dimension 2 Visuals: PASS
- [ ] Dimension 3 Color: PASS
- [ ] Dimension 4 Typography: PASS
- [ ] Dimension 5 Spacing: PASS
- [ ] Dimension 6 Registry Safety: PASS

**Approval:** approved
