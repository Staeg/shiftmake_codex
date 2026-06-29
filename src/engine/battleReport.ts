import { resolveBattle } from './battle';
import type { BattleReportDiagnostic, BattleReportPayload, BattleReplay, ReplayIndexEntry, StoredReplayPayload } from './types';
import { decodeBase64Url, encodeBase64Url, hashString, stableStringify } from '../shared/reportEncoding';
import { APP_VERSION } from './appVersion';

const REPORT_PREFIX = 'SMBR1.';
const REPORT_VERSION = 1;

type BattleReportOptions = {
  replay: BattleReplay;
  replayPayload: StoredReplayPayload;
  replayIndexEntry?: ReplayIndexEntry | null;
  currentStep?: number | null;
  diagnostics?: BattleReportDiagnostic[];
  createdAt?: string;
  buildMode?: string;
};

export type BattleReportDecodeResult =
  | { ok: true; payload: BattleReportPayload }
  | { ok: false; error: 'invalid_prefix' | 'invalid_json' | 'unsupported_version' | 'invalid_shape' };

export type BattleReportDecodeError = Extract<BattleReportDecodeResult, { ok: false }>['error'];

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function hasBattleInput(value: unknown): boolean {
  if (!isObject(value)) {
    return false;
  }
  return (
    typeof value.seed === 'number' &&
    Array.isArray(value.mutatorIds) &&
    Array.isArray(value.playerCombatants) &&
    Array.isArray(value.enemyCombatants)
  );
}

export function buildBattleReportPayload(options: BattleReportOptions): BattleReportPayload {
  const currentStep =
    typeof options.currentStep === 'number' && options.currentStep >= 0
      ? Math.min(Math.floor(options.currentStep), options.replay.steps.length - 1)
      : undefined;
  const reportBase = stableStringify({
    input: options.replayPayload.input,
    currentStep: currentStep ?? null,
    diagnostics: options.diagnostics ?? [],
  });
  const reportId = `br-${hashString(reportBase)}`;

  return {
    version: REPORT_VERSION,
    reportId,
    createdAt: options.createdAt ?? new Date().toISOString(),
    app: {
      name: 'shiftmake',
      version: APP_VERSION,
      ...(options.buildMode ? { buildMode: options.buildMode } : {}),
    },
    replay: options.replayPayload,
    summary: {
      replayId: options.replay.id,
      riftId: options.replay.riftId,
      seed: options.replay.seed,
      tier: options.replay.tier,
      cycleNumber: options.replayIndexEntry?.cycleNumber ?? null,
      outcome: options.replay.outcome,
      playerTroopLabels: [...options.replay.summary.playerTroops],
      enemyTroopLabels: [...options.replay.summary.enemyTroops],
      mutatorIds: [...options.replay.mutatorIds],
      stepCount: options.replay.steps.length,
      ...(currentStep !== undefined ? { currentStep } : {}),
    },
    diagnostics: options.diagnostics ? [...options.diagnostics] : [],
  };
}

export function encodeBattleReport(payload: BattleReportPayload): string {
  return `${REPORT_PREFIX}${encodeBase64Url(JSON.stringify(payload))}`;
}

export function decodeBattleReport(value: string): BattleReportDecodeResult {
  const trimmed = value.trim();
  if (!trimmed.startsWith(REPORT_PREFIX)) {
    return { ok: false, error: 'invalid_prefix' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(decodeBase64Url(trimmed.slice(REPORT_PREFIX.length)));
  } catch {
    return { ok: false, error: 'invalid_json' };
  }

  if (!isObject(parsed)) {
    return { ok: false, error: 'invalid_shape' };
  }

  if (parsed.version !== REPORT_VERSION) {
    return { ok: false, error: 'unsupported_version' };
  }

  const replay = parsed.replay;
  if (!isObject(replay) || replay.version !== 1 || !hasBattleInput(replay.input)) {
    return { ok: false, error: 'invalid_shape' };
  }

  const summary = parsed.summary;
  if (!isObject(summary) || typeof summary.replayId !== 'string' || typeof summary.stepCount !== 'number') {
    return { ok: false, error: 'invalid_shape' };
  }

  if (typeof parsed.reportId !== 'string' || typeof parsed.createdAt !== 'string' || !Array.isArray(parsed.diagnostics)) {
    return { ok: false, error: 'invalid_shape' };
  }

  return { ok: true, payload: parsed as BattleReportPayload };
}

export function replayFromBattleReport(payload: BattleReportPayload): BattleReplay {
  return resolveBattle(payload.replay.input);
}

export function battleReportDecodeErrorMessage(error: BattleReportDecodeError): string {
  switch (error) {
    case 'invalid_prefix':
      return 'Battle report must start with SMBR1.';
    case 'invalid_json':
      return 'Battle report data could not be decoded.';
    case 'unsupported_version':
      return 'This battle report version is not supported by this build.';
    case 'invalid_shape':
      return 'Battle report is missing required battle input data.';
    default:
      return 'Battle report could not be imported.';
  }
}
