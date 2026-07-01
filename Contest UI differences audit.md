# Contest UI Differences Audit

## Multiplayer Contest vs Singleplayer Contest

- Main menu entry: multiplayer uses `Create Room` and `Join / Rejoin Room`; singleplayer uses the save-slot `Start New Game` flow and the `Contest` mode option.
- Planning action text: multiplayer cycle submission currently uses `End Cycle`, then `Cycle Ended` / `Waiting For <opponent>` status. I did not find literal `Submit`, `Ready`, or `Begin Contest` button text in the current `App.svelte`.
- Top bar: multiplayer shows room code, copy-link, reconnect/cancel/leave controls, and connection status; singleplayer Contest does not.
- Opponent naming: multiplayer labels the rival with the opponent player name when available; singleplayer uses `Rival` / `Rival Info`.
- Readiness state: multiplayer exposes submitted/waiting room state; singleplayer immediately resolves against AI when local requirements are met.
- Editability: multiplayer can lock the submitted plan while waiting; singleplayer remains locally editable until resolution begins.
