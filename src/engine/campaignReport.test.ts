import { describe, expect, it } from 'vitest';
import { claimOpeningTroop, startNewGame } from './game';
import { buildCampaignReportPayload, decodeCampaignReport, encodeCampaignReport } from './campaignReport';
import type { CampaignReportUiContext, StoredReplayPayload } from './types';

const UI_CONTEXT: CampaignReportUiContext = {
  screen: 'overworld',
  centerMode: 'rifts',
  selectedRiftId: 'cycle-1-rift-1',
  selectedTroopId: null,
  selectedReplayId: null,
  currentReplayStep: null,
  systemMessage: 'Testing',
  validationMessages: [],
};

function makeReplayPayload(seed: number): StoredReplayPayload {
  return {
    version: 1,
    input: {
      seed,
      riftId: `rift-${seed}`,
      tier: 1,
      mutatorIds: [],
      playerCombatants: [],
      enemyCombatants: [],
    },
  };
}

describe('campaign reports', () => {
  it('round trips campaign state, replay payloads, and UI context', () => {
    const game = {
      ...claimOpeningTroop(startNewGame(99), 'human/soldier'),
      replayIndex: [
        {
          id: 'replay-1',
          replayId: 'replay-1',
          riftId: 'rift-1',
          cycleNumber: 1,
          battleSeed: 7,
          outcome: 'victory' as const,
          playerTroopLabels: ['Human Soldier'],
          mutatorIds: [],
          summary: 'VICTORY 1-0',
          estimatedBytes: 100,
        },
      ],
    };
    const payload = buildCampaignReportPayload({
      game,
      replayPayloads: { 'replay-1': makeReplayPayload(7) },
      missingReplayIds: ['missing-replay'],
      uiContext: UI_CONTEXT,
      createdAt: '2026-04-07T00:00:00.000Z',
      buildMode: 'test',
    });

    const decoded = decodeCampaignReport(encodeCampaignReport(payload));

    expect(decoded.ok).toBe(true);
    if (!decoded.ok) {
      return;
    }
    expect(decoded.payload.reportId).toBe(payload.reportId);
    expect(decoded.payload.game.campaignSeed).toBe(99);
    expect(decoded.payload.replayPayloads['replay-1']?.input.seed).toBe(7);
    expect(decoded.payload.missingReplayIds).toEqual(['missing-replay']);
    expect(decoded.payload.uiContext.selectedRiftId).toBe('cycle-1-rift-1');
    expect(decoded.payload.summary.replayPayloadCount).toBe(1);
  });

  it('rejects malformed campaign report strings', () => {
    expect(decodeCampaignReport('not-a-report')).toEqual({ ok: false, error: 'invalid_prefix' });
    expect(decodeCampaignReport('SMCR1.not-json')).toEqual({ ok: false, error: 'invalid_json' });

    const valid = buildCampaignReportPayload({
      game: claimOpeningTroop(startNewGame(1), 'elf/archer'),
      replayPayloads: {},
      missingReplayIds: [],
      uiContext: UI_CONTEXT,
      createdAt: '2026-04-07T00:00:00.000Z',
    });
    const unsupported = `SMCR1.${Buffer.from(JSON.stringify({ ...valid, version: 2 }), 'utf8').toString('base64url')}`;
    expect(decodeCampaignReport(unsupported)).toEqual({ ok: false, error: 'unsupported_version' });

    const missingGame = `SMCR1.${Buffer.from(JSON.stringify({ version: 1, reportId: 'x', createdAt: 'now', replayPayloads: {}, missingReplayIds: [], uiContext: UI_CONTEXT, summary: {} }), 'utf8').toString('base64url')}`;
    expect(decodeCampaignReport(missingGame)).toEqual({ ok: false, error: 'invalid_game_state' });

    const badReplayMap = `SMCR1.${Buffer.from(JSON.stringify({ ...valid, replayPayloads: { broken: { version: 1 } } }), 'utf8').toString('base64url')}`;
    expect(decodeCampaignReport(badReplayMap)).toEqual({ ok: false, error: 'invalid_shape' });
  });
});
