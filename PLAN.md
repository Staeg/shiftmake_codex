# Shiftmake Playthrough Follow-Up Plan

This plan itemizes changes and fixes raised in `Shiftmake playthrough transcript.md`.

## P0 - Multiplayer Correctness

1. Fix scheduled race unlock symmetry for Player 2.
   - Player 2 must receive and be able to choose their own cycle-3 and cycle-7 race unlock offers.
   - The flow should be symmetric from each player's local perspective, not a Player 1 screen copied with colors swapped.
   - Add engine/server tests covering Player 2 scheduled unlock submission and room advancement.

2. Allow a player who has finished a non-planning unlock step to submit while the other player is still choosing.
   - Applies to opening picks, scheduled race unlocks, and any remaining scheduled unlock steps.
   - The submitted player should see a waiting state instead of being blocked on an inactive screen.

3. Fix multiplayer battle log perspective and result symbols.
   - Player 2 should see themselves as "you" consistently.
   - Result glyphs, colors, side labels, and loss/win indicators must be recomputed for the viewing player.
   - Do not rely on a Player 1 battle log with colors flipped.

4. Investigate multiplayer ready/resolve latency feedback.
   - The transcript reports a long pause after both players submit ready before either player sees that the other finished.
   - Determine whether this is network signaling delay, server processing, replay payload generation, or UI state delay.
   - Add immediate "you submitted / waiting for opponent" feedback and a distinct "both submitted / resolving" state if resolution is slow.

5. Harden leave/rejoin room behavior.
   - Leaving should not produce zombie room states.
   - Same-name rejoin/reconnect should work consistently for both seats.
   - Consider showing the room code/link after leaving only if rejoin is actually supported from that state.

## P1 - Multiplayer Setup UI

1. Redesign the multiplayer room controls as a distinct setup area.
   - Separate "join/create room" controls from the faction/race-pick game surface.
   - Avoid the current off-aligned controls and awkward whitespace between buttons.
   - Prefer one coherent top row or a self-contained room panel with clear symmetry.

2. Remove duplicated selected-faction/ready controls from the bottom-right area.
   - Keep one canonical ready control.
   - If two race/faction picks are required, show a disabled ready button until the requirement is met.
   - Make the enabled state visually obvious, for example a strong green/highlighted ready state.

3. Make room tools part of the main menu in multiplayer.
   - Room code, copy link, player list, and leave room should be available.

## P1 - Overworld Action Clarity

1. Rename `Assign Troops` and `Spend Essence`.
   - The transcript reader interpreted it as a confirm/lock-in button.
   - Make it read as a navigation/request action, not cycle submission.
   - Recommended direction: gray out the End Cycle button, have hover text based on what still needs to be done while maintaining on-click highlights depending on what needs to be done.

2. Automatically reveal Essence drafts even in multiplayer.
   - Unlike singleplayer you currently need to click "reveal unlock draft". Make it match singleplayer.

4. Distinguish inspect-only selections from actionable selections.
   - Make `Races and Troops`, `Stag/Rival Info`  look like subordinate tabs or like drawers/info boards. Make `Main Menu` look like three horizontal lines indicating a menu.

5. Rework the available troops panel.
   - The current overlay/panel can collide with unlock draft content.
   - Remove the panel framing and leavie only draggable troop icons in a stable area.
   - Enlarge the draggable troop icons by around 50% for visual clarity.
   - Preserve drag-to-Rift and drag-back-to-ready functionality.

## P1 - Scheduled Race Unlock UI

1. Increase readability, especially of the scheduled race unlock screen.
   - Increase font size for "Choose a Race" and related body copy.
   - Stop using small caps/all-caps styling for longer explanatory text. Replace the small caps with a better font wherever it is used.

2. Rewrite scheduled race unlock instructions.
   - Current copy was hard to parse: "Each candidate joins with its shown upgrades..."
   - Suggested direction: "Shown upgrades and included troops are unlocked immediately. Below that you can see what this race can unlock later."

3. Fix unlock draft card spacing and selection highlights.
   - Upgrade choices are vertically cramped.
   - Green highlight/confirmation indicator can overlap neighboring content after confirming a troop or upgrade.
   - Ensure selected/confirmed states stay inside their card boundaries at desktop and mobile sizes and do not overlap other elements when the size changes.

## P1 - Battle Replay And Archive UX

1. Redesign multiplayer battle result rows/cards.
   - The transcript shows confusion about which bars belong to which player and which result symbols indicate whose win/loss.
   - Make ownership, attacker/defender side, and outcome explicit without relying only on left/right origin, red/gray color, or skull placement.
   - Consider a few alternative layouts before implementation.

2. Remove total health numbers from the always-visible replay side overview.
   - Keep health bars visible.
   - Move exact current/max HP numbers into hover/focus tooltips for the total health bars.
   - This should reduce clipping of labels such as enemy/player names.

3. Match in-battle replay stat display to overworld stat display.
   - Use the same stat formatting and icon treatment as overworld unit stats, including the absence of differently colored boxes around stats.
   - Continue to omit troop quantity in replay stats because replay inspection is for a specific unit, not the whole troop.

## P1 - Mutators And Ability Clarity

1. Remove the `Animated` mutator.
   - `Animated` only removes `Fading`, and `Fading` is currently too niche for this to be worth a Rift mutator slot.
   - Remove it from the mutator catalog, Rift generation pool, icon manifest/prompts, docs, and tests.

## Verification Checklist

1. Add or update Vitest coverage for multiplayer scheduled unlocks, Player 2 submissions, battle log projection, and `Animated` removal.
2. Run `npm run test`.
3. Run `npm run build`.
4. Manually play a two-player multiplayer room through opening, cycle 1 resolution, cycle 3 race unlock, and one post-unlock planning cycle from both Player 1 and Player 2 browsers.
