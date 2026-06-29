import type { BattleReplay, BattleStep } from '../engine/types';
import { BASE_STEP_MS } from './renderingConstants';

export type BattlePresentationCueKind = 'move' | 'engage' | 'attack' | 'death' | 'heal' | 'buff';

export interface BattlePresentationCue {
  stepIndex: number;
  kind: BattlePresentationCueKind;
  startMs: number;
  durationMs: number;
}

export interface BattlePresentationTimeline {
  cues: BattlePresentationCue[];
  durationMs: number;
}

function playbackScale(speedMs: number): number {
  return Number.isFinite(speedMs) && speedMs > 0 ? speedMs / BASE_STEP_MS : 1;
}

function cueTiming(step: BattleStep): { durationMs: number; spacingMs: number } | null {
  switch (step.kind) {
    case 'attack':
      return step.metadata?.mode === 'melee' ? { durationMs: 520, spacingMs: 190 } : { durationMs: 680, spacingMs: 210 };
    case 'move':
      return { durationMs: 320, spacingMs: 240 };
    case 'engage':
      return { durationMs: 360, spacingMs: 260 };
    case 'death':
      return { durationMs: 700, spacingMs: 220 };
    case 'heal':
      return { durationMs: 660, spacingMs: 170 };
    case 'buff':
      return step.metadata?.effect === 'summon' ? { durationMs: 720, spacingMs: 190 } : { durationMs: 580, spacingMs: 160 };
    default:
      return null;
  }
}

export function buildBattlePresentationTimeline(replay: BattleReplay, speedMs = BASE_STEP_MS): BattlePresentationTimeline {
  const scale = playbackScale(speedMs);
  const cues: BattlePresentationCue[] = [];
  let cursorMs = 0;
  let lastEndMs = 0;

  replay.steps.forEach((step) => {
    const timing = cueTiming(step);
    if (!timing) {
      return;
    }

    const durationMs = Math.max(1, Math.round(timing.durationMs * scale));
    const spacingMs = Math.max(1, Math.round(timing.spacingMs * scale));
    cues.push({
      stepIndex: step.index,
      kind: step.kind,
      startMs: cursorMs,
      durationMs,
    });
    lastEndMs = Math.max(lastEndMs, cursorMs + durationMs);
    cursorMs += spacingMs;
  });

  return {
    cues,
    durationMs: Math.max(lastEndMs, cursorMs),
  };
}
