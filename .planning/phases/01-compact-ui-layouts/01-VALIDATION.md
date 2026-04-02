---
phase: 01
slug: compact-ui-layouts
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-02
---

# Phase 01 - Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | none - uses Vite defaults |
| **Quick run command** | `npm run build` |
| **Full suite command** | `npm run test` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm run build`
- **After every plan wave:** Run `npm run test`
- **Before `$gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 01-01-01 | 01 | 1 | UI-04 | build | `npm run build` | ✅ | ⬜ pending |
| 01-01-02 | 01 | 1 | UI-04 | build | `npm run build` | ✅ | ⬜ pending |
| 01-02-01 | 02 | 2 | UI-01 | build | `npm run build` | ✅ | ⬜ pending |
| 01-02-02 | 02 | 2 | UI-02 | build | `npm run build` | ✅ | ⬜ pending |
| 01-02-03 | 02 | 2 | UI-03 | build | `npm run build` | ✅ | ⬜ pending |
| 01-03-01 | 03 | 3 | UI-01 | build | `npm run build` | ✅ | ⬜ pending |
| 01-03-02 | 03 | 3 | UI-02 | build | `npm run build` | ✅ | ⬜ pending |
| 01-03-03 | 03 | 3 | UI-03 | build | `npm run build` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] Existing infrastructure covers all phase requirements.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Main menu fits at `1366x768` without page scroll | UI-01 | Layout fit depends on actual rendered viewport composition | Run the app, open `main_menu`, and confirm all three slot cards and primary actions are visible without page scrolling |
| Overworld planning shell stays single-screen in normal states | UI-01, UI-02, UI-03 | Requires rendered inspection of topbar, inspect rail, center content, and right rail together | Run the app, open a populated planning screen, and confirm topbar, left inspect panel, center browsing region, right support/archive rail, and end-cycle CTA remain visible outside dense edge cases |
| Replay viewport remains dominant while side panels fit | UI-01, UI-02, UI-03 | Requires visual confirmation that shell compaction does not crowd the battlefield | Run a replay at `1366x768` and confirm battlefield, left focus, replay controls, alive counts, and timeline toggle remain visible together |
| Internal panel scroll is bounded to archive/log/recap surfaces rather than the page shell | UI-03, UI-04 | Overflow behavior is easiest to verify in-browser | Trigger dense archive, event log, or recap content and confirm scroll occurs inside the relevant panel while the page shell stays fixed |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-04-02
