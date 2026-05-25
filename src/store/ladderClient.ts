import { getConfiguredMultiplayerServerUrl } from '../config/multiplayer';
import type { LadderDrawResult, LadderHarvestResult, LadderRiftSetPayload } from '../engine/types';

function ladderBaseUrl(): string {
  const configured = getConfiguredMultiplayerServerUrl();
  const raw = configured || 'ws://localhost:8787';
  return raw.replace(/^ws:/, 'http:').replace(/^wss:/, 'https:').replace(/\/+$/, '');
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${ladderBaseUrl()}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof payload.error === 'string' ? payload.error : `Ladder server returned ${response.status}.`);
  }
  return payload as T;
}

export function drawLadderRiftSet(cycleNumber: number): Promise<LadderDrawResult> {
  return postJson<LadderDrawResult>('/ladder/draw', { cycleNumber });
}

export function harvestLadderRiftSet(parentId: string, payload: LadderRiftSetPayload): Promise<LadderHarvestResult> {
  return postJson<LadderHarvestResult>('/ladder/harvest', { parentId, payload });
}
