import { describe, expect, it } from 'vitest';
import { createTroopInstance, resolveTroopCombatant } from './army';
import { buildBattleReportPayload, decodeBattleReport, encodeBattleReport, replayFromBattleReport } from './battleReport';
import { resolveBattle } from './battle';
import type { BattleInput, StoredReplayPayload } from './types';

function makeInput(seed = 123): BattleInput {
  return {
    seed,
    riftId: 'cycle-1-rift-1',
    tier: 1,
    mutatorIds: [],
    playerCombatants: [resolveTroopCombatant({ raceUpgradeIds: [], troopClassUpgradeIds: [] }, createTroopInstance('human', 'soldier'), 'player')],
    enemyCombatants: [
      resolveTroopCombatant({ raceUpgradeIds: [], troopClassUpgradeIds: [] }, createTroopInstance('goblin', 'militia'), 'enemy', null, 'enemy-goblin-militia'),
    ],
  };
}

function makePayload(input: BattleInput): StoredReplayPayload {
  return { version: 1, input };
}

describe('battle reports', () => {
  it('round trips a copy-pastable report and reruns the same battle', () => {
    const replayPayload = makePayload(makeInput(456));
    const replay = resolveBattle(replayPayload.input);
    const report = buildBattleReportPayload({
      replay,
      replayPayload,
      currentStep: 3,
      diagnostics: [
        {
          source: 'renderer',
          severity: 'warning',
          code: 'unit_texture_fallback_used',
          message: 'No texture was loaded for human/soldier; using renderer fallback texture.',
          textureKey: 'human/soldier',
        },
      ],
      createdAt: '2026-04-07T00:00:00.000Z',
      buildMode: 'test',
    });

    const decoded = decodeBattleReport(encodeBattleReport(report));

    expect(decoded.ok).toBe(true);
    if (!decoded.ok) {
      return;
    }
    expect(decoded.payload.reportId).toBe(report.reportId);
    expect(decoded.payload.summary.currentStep).toBe(3);
    expect(decoded.payload.diagnostics[0]?.code).toBe('unit_texture_fallback_used');

    const rerun = replayFromBattleReport(decoded.payload);
    expect(rerun.id).toBe(replay.id);
    expect(rerun.outcome).toBe(replay.outcome);
    expect(rerun.steps.length).toBe(replay.steps.length);
    expect(rerun.steps[3]?.metadata).toEqual(replay.steps[3]?.metadata);
  });

  it('rejects invalid report strings clearly', () => {
    expect(decodeBattleReport('not-a-report')).toEqual({ ok: false, error: 'invalid_prefix' });
    expect(decodeBattleReport('SMBR1.not-json')).toEqual({ ok: false, error: 'invalid_json' });

    const validPayload = buildBattleReportPayload({
      replay: resolveBattle(makeInput(789)),
      replayPayload: makePayload(makeInput(789)),
      createdAt: '2026-04-07T00:00:00.000Z',
    });
    const unsupported = `SMBR1.${Buffer.from(JSON.stringify({ ...validPayload, version: 2 }), 'utf8').toString('base64url')}`;

    expect(decodeBattleReport(unsupported)).toEqual({ ok: false, error: 'unsupported_version' });

    const missingInput = `SMBR1.${Buffer.from(JSON.stringify({ version: 1, reportId: 'x', createdAt: 'now', replay: { version: 1 }, summary: { replayId: 'x', stepCount: 0 }, diagnostics: [] }), 'utf8').toString('base64url')}`;
    expect(decodeBattleReport(missingInput)).toEqual({ ok: false, error: 'invalid_shape' });
  });
});
