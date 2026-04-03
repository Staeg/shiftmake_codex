---
phase: 3
slug: full-run-campaign-balance
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-02
---

# Phase 3 - Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest |
| **Config file** | `vite.config.mts` |
| **Quick run command** | `npm run test` |
| **Full suite command** | `npm run test` |
| **Estimated runtime** | ~5 seconds on the current repo |

---

## Sampling Rate

- **After every task commit:** Run `npm run test`
- **After every plan wave:** Run `npm run test`
- **Before `$gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 3-01-01 | 01 | 1 | BAL-01, BAL-02, BAL-03, BAL-04, BAL-05 | simulation + unit | `npm run test` | no | pending |
| 3-02-01 | 02 | 2 | BAL-01, BAL-02, BAL-03 | unit + simulation | `npm run test` | partial | pending |
| 3-03-01 | 03 | 2 | BAL-04, BAL-05 | unit + simulation | `npm run test` | partial | pending |

*Status: pending -> green -> red -> flaky*

---

## Wave 0 Requirements

- [ ] `src/engine/campaignSimulation.ts` with deterministic multi-cycle run helpers and summary metrics
- [ ] `src/engine/campaignSimulation.test.ts` covering deterministic metrics, policy behavior, and sweep summaries
- [ ] `scripts/reportCampaignBalance.ts` for reproducible markdown or JSON balance output
- [ ] `src/engine/rift.test.ts` coverage for schedule table, saturation bands, role quotas, and tier multiplier behavior
- [ ] `src/engine/campaign.test.ts` coverage for first-win Essence bonus, upgrade cost/gating, and early new-faction offer priority
- [ ] A clean branch where the pre-existing Phase 2 role-behavior failures are resolved before final phase verification

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| A sample run feels pressured early without feeling doomed | BAL-01 | Automated sweeps can measure outcomes, but perceived pressure still needs one human pass | Play one fresh run after implementation, note cycle-1 through cycle-3 choices, and confirm at least one meaningful tradeoff appears without an obvious dead end |
| Late cycles still feel tense rather than solved | BAL-02 | Simulation can show losses and resource pressure, but player readability still matters | Open a cycle-8+ save or fresh long run and confirm at least one Rift assignment choice feels non-trivial |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all missing references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
