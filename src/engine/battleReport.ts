import { resolveBattle } from './battle';
import type { BattleReportDiagnostic, BattleReportPayload, BattleReplay, ReplayIndexEntry, StoredReplayPayload } from './types';

const REPORT_PREFIX = 'SMBR1.';
const REPORT_VERSION = 1;
const APP_VERSION = '0.1.0';

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

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(',')}]`;
  }

  if (value && typeof value === 'object') {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`)
      .join(',')}}`;
  }

  return JSON.stringify(value);
}

function hashString(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36).padStart(7, '0');
}

function encodeBase64Url(value: string): string {
  if (typeof btoa === 'function') {
    const bytes = new TextEncoder().encode(value);
    let binary = '';
    bytes.forEach((byte) => {
      binary += String.fromCharCode(byte);
    });
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  }

  return Buffer.from(value, 'utf8').toString('base64url');
}

function decodeBase64Url(value: string): string {
  if (typeof atob === 'function') {
    const padded = `${value}${'='.repeat((4 - (value.length % 4)) % 4)}`.replace(/-/g, '+').replace(/_/g, '/');
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }

  return Buffer.from(value, 'base64url').toString('utf8');
}

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
