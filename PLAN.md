# Shiftmake Playthrough Bookmark Implementation Plan

Source: `Shiftmake playthrough transcribed.md`

This plan de-duplicates the repeated plain-text and HTML copies of the transcript. Each item below corresponds to a unique speaker bookmark, with the timestamp from the transcript and an implementation plan for the resulting change.

## 1. Rename Unit Inspector Headers By Context

Source: 00:10:06, "Replace unit inspect with header."

Goal: Make the right-side inspector title describe what the player is inspecting, especially enemy troops in a Rift.

Plan:
- In `src/ui/App.svelte`, find the detail/inspect panel rendering for unit detail cards.
- Replace generic "Unit" / "Unit Inspect" language with "Troop Inspector", "Enemy Troop", "Ready Troop", or "Assigned Troop" depending on the inspected source.
- Ensure enemy Rift defenders display a strong header such as "Enemy Troop" or "Enemy Troop Inspector" before the troop name.
- Keep the lower-level combat identity as "unit type" only where it refers to catalog unit type.
- Verify by selecting player troops, enemy Rift defenders, and replay units.

## 2. Use Help Cursor For Informational Hover Targets

Source: 00:10:41, "Turn cursor into question mark when it is offering question mark type information..."

Goal: Make it clear when hovering/clicking only reveals information rather than selecting or assigning something.

Plan:
- Add a shared CSS class such as `.inspectable` or `.info-target` in `src/ui/App.svelte` for passive information targets.
- Apply `cursor: help` to mutators, enemy troop icons, stat chips, ability chips, top-bar glossary items, and any elements whose primary action is showing a tooltip/detail panel.
- Do not apply the help cursor to draggable troops, buttons, tabs, or selectable draft options.
- Verify hover states with mouse over Rift mutators, enemy troops, top bar stats, and ability/stat rows.

## 3. Show Summoned Unit Details From Summoner Abilities

Source: 00:18:21, "Add an ability to see what a wolf is when looking at a beastmaster."

Goal: Let players inspect summoned units before battle, starting with Beastmaster wolves and extending to skeletons/elementals.

Plan:
- Add catalog metadata that links summon abilities to their summoned unit type and quantity, if it is not already derivable from ability effects.
- Extend `UnitTooltip.svelte` / App detail-card ability rendering to show an inspectable summoned-unit chip for abilities such as Summon Wolf, Summon Skeleton, Summon Elemental, and related upgrade variants.
- On hover/focus of that chip, display the resolved summoned unit profile using the current faction/upgrades where applicable, or a neutral catalog profile when faction is not meaningful.
- Keep this in UI/helper code; battle logic remains in `src/engine/`.
- Add unit tests for any helper that maps abilities to summoned profiles.

## 4. Make Troop Quantity Visually Upfront

Source: 00:20:56, "Instead of unit inspect, it should say troop inspect... incorporate the quantity stack into the number of icons..."

Goal: Communicate that a troop is a group of bodies, not one individual.

Plan:
- Rename inspect copy from "Unit" to "Troop" where inspecting a troop instance or combatant profile.
- Add a quantity badge and/or mini-icon stack to troop inspector headers, ready troop tiles, enemy troop tiles, and draft options.
- In the inspector, represent quantity visually near the portrait before the stat grid.
- Preserve the numeric Quantity stat in the stat breakdown, but make it secondary to the visual treatment.
- Verify that high-quantity troops such as militia and goblins are visibly numerous at a glance.

## 5. Add A Two-Troop Comparison Mode

Source: 00:25:15, "Add 2 panels that allow you to hold 2 distinct units..."

Goal: Help players compare two troops without switching the inspector back and forth.

Plan:
- Add two pinned comparison slots in `src/ui/App.svelte`, initially populated by the current inspected troop and a "Pin for compare" action.
- Allow the player to pin a second troop from ready troops, enemy troops, draft options, or archive/replay profiles.
- Show both stat grids side by side and calculate deltas for shared stats.
- Use green/red deltas only for comparable numeric stats; keep abilities as plain side-by-side lists.
- Ensure this coexists with the later major comparison overhaul in item 24.

## 6. Show Goblin Quantity Modifier In Stat Breakdown

Source: 00:25:xx, "Goblins, quantity does not show up on the stat modifier."

Goal: Make it visible that goblins are weaker partly because they appear in larger quantity.

Plan:
- Inspect `composeBaseTroopDefinition()` / stat breakdown construction in `src/engine/unitCatalog.ts` and related helpers.
- Add a Quantity breakdown line for faction cost/quantity effects, especially Goblin cost x0.5 causing doubled quantity.
- Ensure the line explains the causal relationship without introducing string-only logic in UI.
- Add an engine test asserting that a goblin troop's quantity breakdown includes the goblin modifier.
- Verify the inspector for Goblin Druid versus Elf Druid.

## 7. Show A Drag Ghost/Origin State For Troops Being Dragged

Source: 00:28:19, "Add a grayed out signal for a unit that is currently getting dragged..."

Goal: Make troop dragging look intentional instead of like the tile disappeared or glitched.

Plan:
- In `src/ui/App.svelte`, use the existing `troopDrag` state to add a dragging class to the source troop tile.
- Render the source tile as dimmed/ghosted while the floating drag preview follows the pointer.
- Keep the troop label and quantity visible in the source tile.
- Verify dragging from Ready Troops and from assigned Rift slots.

## 8. Preview Rift Deployment While Dragging Over A Rift

Source: 00:28:39, "If you are currently hovering a drag troop onto a rift, it indicates that the troop will show up as deployed..."

Goal: Make valid drop targets and the result of dropping obvious during drag.

Plan:
- Extend the existing `TroopDragState.dropTarget` behavior in `src/ui/App.svelte`.
- When a dragged troop is over a Rift, add a visible drop-target highlight to that Rift and render a temporary "will deploy here" slot inside the Rift assignment area.
- Include invalid-state styling when the Rift cannot accept the troop, with a short reason when available.
- Verify drop previews for empty Rifts, Rifts with compatible assigned troops, and Rifts blocked by faction/type conflicts.

## 9. Explain Assignment Conflicts At The Conflicting Troops

Source: 00:29:47, "Instead of a cycle blocked message in the top right... flashing image around the two conflicting troops..."

Goal: Show why an assignment is disallowed at the place where the conflict happens.

Plan:
- Extend assignment validation to return structured conflict targets: blocked troop id, conflicting troop id, Rift id, and reason.
- Store the latest assignment conflict in UI state.
- Highlight or briefly pulse both conflicting troop tiles/slots and show a small inline message near the Rift.
- Keep the toast/banner as a backup, but make the local conflict explanation primary.
- Add tests around validation if target metadata is added in `src/engine/`.

## 10. Differentiate Selected Troop And Assigned Troop Visuals

Source: 00:30:36, "The select highlight visual effect looks very similar to the assigned troop effect on rifts."

Goal: Avoid confusing a selected troop with a troop already assigned to a Rift.

Plan:
- Audit CSS classes for selected ready troops and assigned Rift troop chips in `src/ui/App.svelte`.
- Make selection a thin focus ring or glow and assignment a persistent filled badge/slot treatment.
- Ensure keyboard focus remains visible and distinct from selection.
- Verify by selecting a ready troop, assigning it, selecting an assigned troop, and unassigning it.

## 11. Remove The Recovering Rift State From The UI

Source: 00:31:43, "Get rid of the recovering thing. It's a relic from a previous iteration."

Goal: Stop showing obsolete Rift recovery terminology.

Plan:
- Search for Rift state labels in `src/ui/App.svelte`, `src/engine/types.ts`, and `src/engine/rift.ts`.
- If `recovering` is only presentational, remove it from UI labels and state summaries.
- If it exists in engine types but is unused, remove it from the type and update tests/saves carefully.
- Keep troop recovery terminology intact; this bookmark is about Rift status only.
- Verify existing saves still load or are migrated safely.

## 12. Add Hover Explanations To The Top Status Bar

Source: 00:32:30, "Add on hover information to everything in the main bar at the top of the screen..."

Goal: Explain Cycle, Essence, VP, Active, and related top-bar counters.

Plan:
- Identify top status bar markup in `src/ui/App.svelte`.
- Add title/tooltip/detail-panel descriptions for Cycle, Essence, Victory Points, Active, and Idle.
- Explain cycle start/end, Essence spending, VP gain from held Rifts, and assignment status.
- Reuse existing tooltip/detail-card patterns so this does not create another bespoke tooltip system.
- Verify hover/focus accessibility for keyboard and mouse.

## 13. Move Active/Idle Counts Into Ready Troops

Source: 00:33:29, "Move the active and idle numbers to the Ready Troops panel at the bottom of the screen."

Goal: Place troop assignment counts next to the troop list they describe.

Plan:
- Remove Active/Idle counts from the global top bar.
- Add a compact count row in the Ready Troops panel: Ready, Assigned, Recovering/Unavailable as appropriate.
- Clarify wording so "active" means assigned this cycle only if that is the intended meaning.
- Update any top-bar tooltip plan from item 12 to match the new location.
- Verify counts update after assign, unassign, cycle resolution, and troop recovery.

## 14. Put "Back To Archive" In The Replay Sidebar

Source: 00:35:38, "The Back to archive button should be part of the right sidebar..."

Goal: Make replay navigation feel attached to the archive/detail workflow.

Plan:
- Move or duplicate the Back to Archive control from the replay header into the right sidebar panel.
- Use a back-arrow icon plus text, consistent with existing replay sidebar actions.
- Keep escape/navigation behavior unchanged.
- Verify entering replay from archive and returning lands on the same archive context.

## 15. Add Direct Spectate Button In Battle Archive

Source: 00:36:19, "Add a button that directly spectates the battle... an eye..."

Goal: Let players open a replay directly from archive list items without first inspecting details.

Plan:
- In the battle archive list in `src/ui/App.svelte`, add an icon button using an eye glyph/icon for each replay with an available payload.
- Keep existing inspect behavior on the archive item itself.
- Disable or show summary-only state for missing replay payloads.
- Add accessible label such as "Watch battle".
- Verify the direct button opens the replay viewer for the correct replay.

## 16. Remove Remaining Troop Counts From Archive Overview

Source: 00:36:55, "Get rid of the quantity of remaining troops from the overview..."

Goal: Simplify battle archive list rows by hiding survivor counts until inspection.

Plan:
- Remove final alive count display from archive overview cards/list rows.
- Keep survivor counts in the detail panel and replay recap.
- Preserve outcome, participants, Rift, cycle, and mutators in the overview.
- Verify list rows are easier to scan and detailed counts remain accessible on click.

## 17. Make Replay Play Button More Prominent

Source: 00:37:41, "Make the play button a lot more obvious."

Goal: Make it obvious how to start replay playback.

Plan:
- Update `src/ui/BattleControls.svelte`.
- Give the Play/Pause button primary-button styling, a play/pause icon, and stronger color contrast.
- Ensure disabled state remains clear.
- Consider placing Play first or central among replay controls if layout supports it.
- Verify at desktop and mobile widths.

## 18. Add Secondary Highlight For Other Units Affected By A Replay Step

Source: 00:41:32, "When you highlight a step that affects more than one unit..."

Goal: In replay, distinguish the active unit from other affected units.

Plan:
- Inspect `src/ui/replayStepExplanation.ts`, `ReplayStepExplanation.svelte`, and `src/rendering/BattleRenderer.ts` highlight APIs.
- Extend replay step metadata/explanation to identify secondary affected unit ids when the step impacts multiple units.
- Render active unit highlight in gold and secondary affected units in silver.
- Apply the same distinction to health sidebar unit rows where feasible.
- Add tests for explanation helper metadata if available.

## 19. Keep Troops Stuck On Occupied Rifts In Contest Mode

Source: 00:43:30, "Make it so that the guys are stuck on the rift that you have occupied in contest mode."

Goal: Contest-mode troops that successfully hold a Rift should remain committed there.

Plan:
- Inspect contest cycle resolution in `src/engine/game.ts` and multiplayer contest helpers.
- After a player conquers/defends a Rift in contest mode, preserve troop `assignmentRiftId` for holding troops instead of returning them to ready state.
- Decide whether non-contest campaign mode keeps the current recovery/return behavior.
- Add engine tests covering successful occupation, failed attack, successful defense, and loss of occupied Rift.
- Update UI to show holding troops as unavailable for reassignment.

## 20. Fix "No Troops Are Assigned" Validation

Source: 00:44:01, "'No troops are assigned' doesn't actually track whether troops are assigned..."

Goal: Make end-cycle validation messages describe the actual issue.

Plan:
- Inspect validation logic in `src/engine/game.ts` for end-cycle issues.
- Separate "no troops assigned anywhere" from "unused troops remain" and from "no new attack assigned".
- Return distinct validation issue codes and UI messages.
- Add tests for zero assigned troops, some assigned troops with idle troops remaining, and troops holding contest Rifts.
- Update UI copy to use the precise validation issue.

## 21. Clarify Rift-Unlocked Troops Versus Native Rosters

Source: 00:45:21, "Make it so that the unlocked troops from previous battles are included in the native roster or so that it's less differentiated."

Goal: Reduce confusion when faction unlock screens show native troops separately from Rift-earned troop options.

Plan:
- Inspect faction unlock and troop-type unlock offer rendering in `src/ui/App.svelte`.
- Present all immediately claimable troop options for the chosen faction in one unified roster section.
- Mark native options and Rift-discovered options with subtle source labels only if useful.
- Keep engine rules from `TECHNICAL.md`: off-roster combinations remain latent until their faction is unlocked.
- Verify cycle 3/7 faction unlock screens with both native-only and Rift-earned options.

## 22. Require Confirmation For Scheduled Faction Unlocks

Source: 00:47:43, "When unlocking new factions at the start of cycle 3 and cycle 7... you need a confirmation button."

Goal: Prevent accidental single-click faction unlocks.

Plan:
- In scheduled faction unlock UI, make clicking an option select it rather than immediately confirming it.
- Add a Confirm button that commits the selected faction.
- Disable Confirm until a faction is selected.
- Keep existing opening unlock flow behavior only if it already has clear confirmation.
- Add store/UI tests if selection/confirmation is covered.

## 23. Prevent Reassigning Troops Holding A Rift

Source: 00:48:09, "The player is capable of reassigning the troops that they currently have holding a rift..."

Goal: Troops currently holding a player Rift cannot be assigned elsewhere.

Plan:
- This is the enforcement counterpart to item 19.
- In engine assignment functions, reject assignment changes for troops whose `assignmentRiftId` points to a held Rift in contest mode.
- In UI, render holding troops in a "holding" state and do not start drag for them unless there is an explicit future withdraw action.
- Add tests that reassign attempts fail both through direct engine calls and through cycle setup helpers.
- Verify held troops remain visible on their Rift.

## 24. Major Side-By-Side Troop Comparison Overhaul

Source: 00:52:16, "Add an ability to compare several different troops side by side..."

Goal: Support broader strategic comparison across owned troops, enemy troops, and draft/upgrade options.

Plan:
- Treat this as the larger version of item 5.
- Design a comparison tray or modal that can hold several troop cards at once.
- Cards should show portrait, quantity, core stats, abilities, faction/type tags, and relevant upgrades.
- Allow adding/removing cards from ready troops, Rift defenders, draft options, and upgrade-affected previews.
- Avoid relying only on red/green deltas; the key request is simultaneous visibility.
- Implement after smaller inspector/quantity work so the cards can reuse improved components.

## 25. Add Descriptions For Summoned/Generated Units

Source: 00:59:59, "Add a description for what a skeleton is, for necromancer is, and other abilities such as the Avenger upgrade that spawns skeletons."

Goal: Explain generated units wherever an ability refers to them.

Plan:
- Extend catalog ability formatting so summon references are inspectable and/or include a short generated-unit description.
- Cover Necromancer skeletons, Avenger skeleton-spawning upgrade variants, Beastmaster wolves, Elementalist elementals, and any future generated units.
- Reuse the summoned-unit inspection work from item 3.
- Add tests for description formatting so summon references do not regress.

## 26. Make Essence Draft Relationships Clearer

Source: 01:09:52, "Make the essence draft more obvious in terms of what things affect and help each other."

Goal: Make it clear that troop choices and upgrade choices are separate but can synergize.

Plan:
- In the Essence draft UI, label the two choice groups explicitly: "Choose one troop" and "Choose one upgrade".
- Show affected owned/new troops for each upgrade more directly.
- When a selected troop would be affected by a selected upgrade, display a visible synergy indicator between them.
- After confirming one side, keep it shown in a confirmed/locked visual state rather than making the player feel they advanced to another hidden step.
- Verify the player can still inspect existing roster while considering draft options.

## 27. Move Essence Draft To Bottom With Two Side-By-Side Menus

Source: 01:10:15, "Have it at the bottom of the screen with two menus side by side, instead of being in the right sidebar."

Goal: Reframe Essence drafts as a focused selection bar connected to the roster, not as equal-standing sidebar content.

Plan:
- Move Essence draft rendering from the right sidebar into a bottom panel above or near Ready Troops.
- Render troop options and upgrade options as two adjacent groups, each with its own Confirm/locked state.
- Ensure the panel remains usable at mobile widths by stacking the two groups.
- Keep the right sidebar for inspection/details.
- Verify normal two-sided drafts and one-sided fallback drafts.

## 28. Highlight Troops Affected By Hovered Upgrade

Source: 01:12:01, "Add a transparent plus symbol to troops when you are hovering over an upgrade that would affect them."

Goal: Make upgrade impact visible on the actual roster.

Plan:
- Track the currently hovered/focused upgrade option in `src/ui/App.svelte`.
- Use existing `upgradeAffectsTroop()` to identify affected owned troops and selected/new draft troops.
- Overlay a subtle transparent plus badge on affected troop tiles.
- Ensure the effect works for keyboard focus as well as mouse hover.
- Verify faction upgrades, troop-type upgrades, and upgrades that affect a newly drafted troop.

## 29. Add Initiative Indicator To Replay Health Sidebar

Source: 01:16:53, "Add an indicator of initiative to the right sidebar health trackers."

Goal: Make replay turn order and action timing legible.

Plan:
- Extend `ReplayHealthUnit` in `src/ui/App.svelte` to include current initiative from the replay snapshot.
- Add a small initiative bar or numeric chip to each unit row in the replay health sidebar.
- Show threshold context, likely 100, in tooltip/copy.
- Update as replay steps advance.
- Verify bars change during playback and remain readable at small widths.

## 30. Fix Contest Battle Ownership/Outcome Bug

Source: 01:18:35, "There's something ... about who wins and who sends the attackers..."

Goal: Correct the contest bug where archive outcomes and Rift ownership disagree after opponent attacks player-held Rifts.

Plan:
- Reproduce with an engine test: player holds two Rifts, opponent attacks both, archive lists player victories, but Rifts become rival-held.
- Inspect contest resolution in `src/engine/game.ts` and `src/engine/multiplayerContest.ts`.
- Ensure battle participants, attacker/defender roles, outcome interpretation, and post-battle Rift owner assignment all use the same perspective.
- Add regression tests for player attack neutral, player attack rival, rival attack player, and successful/failed defense.
- Verify archive labels and Rift ownership after cycle resolution.

## 31. Link Battle Archive Entries To Their Rifts

Source: 01:19:21, "Add the Battle archive links to the visual representation of the rifts that they represent, at least in contest."

Goal: Make archive outcomes traceable to the map/Rift where they occurred.

Plan:
- Ensure `ReplayIndexEntry.riftId` is populated and stable for all contest battles.
- In archive rows, show the Rift name/label/visual thumbnail matching the corresponding open Rift where available.
- Add click/hover behavior that selects or highlights the matching Rift in the Rift panel.
- If the Rift no longer exists, show the archived Rift label from replay metadata.
- Verify with multiple battles in one cycle.

## 32. Make Ready Troops Wrap Instead Of Scrolling Horizontally/Vertically

Source: 01:19:53, "Ready troops... create new horizontal lines... icons be smaller."

Goal: Let players see all ready troops at once when the roster grows.

Plan:
- Update Ready Troops CSS in `src/ui/App.svelte` to use wrapping grid/flex layout.
- Reduce tile size responsively when the troop count grows.
- Avoid internal scrollbars unless the viewport is truly too small.
- Preserve drag/drop hit targets and quantity badges.
- Verify with early roster, midgame roster, and many debug/generated troops.

## 33. Hide End Cycle Outside Rifts Or Snap Back To Rifts

Source: 01:23:20, "Make end cycle either snap to Rift or just not show up on the factions and troops menu."

Goal: Keep End Cycle associated with the main Rift/action screen.

Plan:
- Identify tab state and End Cycle button placement in `src/ui/App.svelte`.
- Preferred implementation: show End Cycle only on the Rifts/main action tab.
- If keeping it globally, clicking End Cycle from Factions/Troops should switch to Rifts and focus the unresolved assignment/validation context before confirming.
- Update warning flows so validation messages are visible on the Rifts screen.
- Verify from every overworld tab.

## 34. Show Overall Cycle Progress Toward Game End

Source: 01:24:20, "Already in fact in the bookmarks" after discussion of showing there are 10 cycles.

Goal: Make the 10-cycle contest/campaign endpoint visible without requiring hover explanation.

Plan:
- Add a compact cycle progress indicator near the Cycle display, such as "Cycle 7/10" and/or a small progress strip.
- For postgame continuation, show "Cycle 11+ / postgame" or equivalent so players know scoring has concluded.
- Add tooltip text explaining that score is evaluated at the final cycle and play can continue afterward if applicable.
- Keep the implementation data-driven from the final-cycle constant in engine/config rather than duplicating magic numbers in UI.
- Verify campaign and contest modes if their final cycle counts differ.
