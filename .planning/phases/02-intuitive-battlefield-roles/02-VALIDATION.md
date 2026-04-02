---
phase: 2
slug: intuitive-battlefield-roles
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-02
---

# Phase 2 - Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest |
| **Config file** | `vite.config.mts` |
| **Quick run command** | `npm run test` |
| **Full suite command** | `npm run test` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm run test`
- **After every plan wave:** Run `npm run test`
- **Before `$gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 20 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 2-01-01 | 01 | 1 | ROLE-01, ROLE-02, ROLE-03, ROLE-04, ROLE-05 | unit | `npm run test` | ❌ W0 | ⬜ pending |
| 2-02-01 | 02 | 2 | ROLE-01, ROLE-03, ROLE-05 | simulation | `npm run test` | ❌ W0 | ⬜ pending |
| 2-03-01 | 03 | 2 | ROLE-06 | unit | `npm run test` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/engine/roleBehavior.test.ts` or equivalent dedicated scenario section in `src/engine/battle.test.ts` for ROLE-01 through ROLE-06
- [ ] `src/engine/simulationHarness.test.ts` coverage for backline breach timing and protection metrics
- [ ] Replay-readability assertions covering role-intent messages and/or metadata in battle replay steps
- [ ] Confirmation that `npm run test` remains the reliable verification command even when filtered Vitest file runs are sandbox-flaky

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Replay intent feels intuitive in the event log and recap | ROLE-06 | Automated tests can assert messages and metadata, but human readability still needs a quick replay review | Run a representative replay after implementation and confirm the log explains why frontline held, chaff overran, and backline retreated |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 20s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
