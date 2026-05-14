# Multiplayer Issues To Revisit Before Publishing

These are not blockers for private LAN or friend testing. They are the main multiplayer weaknesses found during the Milestone 7 scan and should be addressed before treating multiplayer as a public or semi-public feature.

## Client Predictability And Authority

- Projected client state still includes deterministic player seeds. A modified client can inspect or predict future player-specific rolls such as opening and draft offers.
- Planning submission validation can reveal paid drafts server-side while matching submitted choices. This is fine for cooperative private rooms, but it is not a strong anti-cheat boundary.
- Long-term direction: keep hidden/random future decisions server-owned, send only currently visible choices to clients, and validate explicit actions against server-side room state.

## Room Durability

- Active rooms live only in server memory. Restarting the multiplayer server loses active rooms, reconnect tokens, submitted readiness, and replay payloads.
- This matches the current private-room target, but hosted play may need lightweight persistence or an explicit “server restarts end rooms” product decision.

## Room Memory Growth

- Replay payloads are retained in active room memory for the life of the room.
- Empty rooms expire, but active long-running rooms do not currently have a replay payload memory cap.
- IP rate-limit buckets are not pruned, so many unique remote addresses could grow the rate-limit map over time.

## Protocol Input Hygiene

- Client-requested room IDs are normalized to uppercase but are not constrained by length or allowed characters beyond the global message-size limit.
- Player names are sanitized and length-limited, but room code rules should be similarly explicit before publishing.

## Browser Message Robustness

- The browser store parses server messages directly. A malformed server/proxy message could throw in the message handler instead of becoming a readable multiplayer error.
- Add defensive parsing for `room-snapshot` and `room-error` payloads on the client side.

## Hosting And Security Policy

- Allowed-origin checks exist, but deployment needs a clear origin list and reverse-proxy configuration.
- Public hosting should use HTTPS for the app and `wss://` for the WebSocket server.
- Rate limiting is intentionally basic and suitable for casual protection, not hostile public traffic.

## Test Coverage Gaps

- The current two-client smoke suite covers create/join, opening, planning-cycle resolution, replay projection, and reconnect while waiting.
- Still missing: browser UI E2E coverage for two real pages, screenshot-on-failure capture, replay canvas smoke checks, malformed server-message client behavior, and long-session memory pressure.
