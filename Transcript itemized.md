# Transcript Itemized — Actionable Items

## 1. Back Button: Fix Alignment and Symmetry
The back button (`<` less-than sign) is misaligned and visually off-center. It should be centrally symmetrical and properly centered. This applies everywhere the back button appears.

---

## 2. Hover Tooltip Deduplication
When selecting a new game type, both a custom UI tooltip and the browser's native tooltip appear simultaneously. Fix: remove the custom tooltip and keep only the browser-native one. Style the browser-native tooltip to match the existing design as closely as possible. Audit the rest of the UI for other locations where this double-tooltip issue occurs.

---

## 3. Multiplayer vs Single Player Contest UI: Audit Differences
The button text differs between multiplayer ("Submit" / "Ready") and single player ("Begin Contest"). Do not change anything yet — create a list of all UI differences between the two modes for later resolution.

---

## 4. Ability Descriptions: Include Stat Icons Inline
Whenever an ability description references gaining, losing, increasing, or decreasing a stat, include the icon for that stat inline in the text. This is a sweeping change across all ability/effect descriptions.

---

## 5. Speed and Initiative Icons: Differentiate but Show Relationship
The icons for Speed and Initiative should be visually distinct from each other, but the relationship (Speed generates Initiative each beat) should be visually obvious from the icons. May also require renaming one or both terms for clarity.

---

## 6. Haze Ability Text: Use "Speed" Not "Initiative"
The Haze ability currently describes its effect using "initiative." It should instead say "all units lose 5 speed." (Speed and initiative are only equivalent when no percentage-based speed effects are involved; using "speed" is the correct and consistent term here.)

---

## 7. Left Sidebar: Allow Pinning Two Selections Simultaneously
Currently hovering away from a unit collapses its info panel. Change this so that up to two selections can be pinned open in the left sidebar at once. Selecting a third item replaces the second pinned item. The first pinned item can only be replaced by manually unselecting it.

---

## 8. Buttons: Immediate Visual Feedback on Click
Buttons currently have a perceptible delay before giving visual feedback, because they wait for a server response. Buttons should visually change state (e.g., appear pressed/active) immediately on click, before the server response arrives, so the user knows their input was registered.

---

## 9. Remove Essence Counter
Remove the essence counter from the UI entirely.

---

## 10. Victory Points: Remove Hover Interactivity
Victory points should have no hover effect and no visual indicator that they are interactive or clickable.

---

## 11. Replay Control Panel: Relocate and Redesign Buttons
Move the replay control panel to the top-left of the central hex map panel. Remove all text labels from the buttons and replace with icons:
- **Play**: standard right-pointing triangle (▶)
- **Reset**: looping/circular arrow
- **Previous/Next step**: left and right arrows
- **Speed**: dropdown selector showing the multiplier (e.g., "4×") — no "Speed" label, self-explanatory

---

## 12. Replay Screen: Remove Duplicate "Back to Archive" Button
The "Back to Archive" button in the top-right of the replay screen duplicates the top-left back button. Remove the top-right one.

---

## 13. Battle Replay: Move Debug Log Button to Top Right
Move the debug log button in the battle replay view to the top right, visually matching the position of the overworld log button. It should sit in the space to the right of the event log tab selector (space freed up by removing the duplicate back button).

---

## 14. Post-Battle Result Popup: Fix Button Alignment
The continue/action button in the post-battle result popup is positioned on the left when it should be on the right. Fix the layout so the button aligns to the right side.

---

## 15. Contest vs AI: Fix Defeat Display When Fighting Enemy Forces
When the player's forces fight the enemy forces directly (after both sides clear the neutral creatures) and the player is defeated, a red remaining health bar is incorrectly shown on the left-hand side. This display issue occurs even in single player and needs to be fixed.
