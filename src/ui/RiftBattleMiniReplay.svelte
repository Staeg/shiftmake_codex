<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import type { BattleOutcome, BattleReplay, BattleStep, BattleUnit, HexCoord, SideId, UnitClassId } from '../engine/types';
  import { footprintCenter } from '../engine/hex';
  import { UNIT_SPRITE_URLS } from '../rendering/unitVisualAssets';
  import { buildBattlePresentationTimeline } from '../rendering/battlePresentationTimeline';
  import { BASE_STEP_MS } from '../rendering/renderingConstants';

  type Point = { x: number; y: number };
  type Bounds = { minX: number; maxX: number; minY: number; maxY: number };
  type HealthSide = { current: number; max: number; percent: number };
  export type MiniReplayHealthTone = 'player' | 'neutral' | 'opponent';
  type EffectView =
    | { kind: 'attack'; mode: 'melee' | 'ranged' | 'blast' | null; from: Point | null; to: Point | null; progress: number }
    | { kind: 'buff'; point: Point | null; progress: number; tone: 'positive' | 'negative' | 'neutral' }
    | { kind: 'death'; points: Point[]; progress: number };

  const HEX_SIZE = 18;
  const UNIT_SIZE = 18;
  const MAP_PADDING = 12;
  const BATTLE_SPEED_MULTIPLIER = 64;

  export let replay: BattleReplay;
  export let leftSource: SideId = 'enemy';
  export let rightSource: SideId = 'player';
  export let leftHealthTone: MiniReplayHealthTone = 'neutral';
  export let rightHealthTone: MiniReplayHealthTone = 'player';
  export let result: BattleOutcome = 'draw';
  export let opponentOutcome = false;
  export let delayMs = 0;
  export let startFinished = false;
  export let portraits: Record<string, string> = {};

  let stepIndex = -1;
  let finished = false;
  let effect: EffectView | null = null;
  let startTime = 0;
  let delayHandle: ReturnType<typeof window.setTimeout> | null = null;
  let animationFrame: number | null = null;

  $: mapHexes = replay.mapHexes.length > 0 ? replay.mapHexes : fallbackMapHexes(replay.mapRadius);
  $: bounds = computeBounds(mapHexes);
  $: viewBox = `${bounds.minX - MAP_PADDING} ${bounds.minY - MAP_PADDING} ${bounds.maxX - bounds.minX + MAP_PADDING * 2} ${bounds.maxY - bounds.minY + MAP_PADDING * 2}`;
  $: snapshot = stepIndex < 0 ? replay.initial.units : replay.steps[Math.min(stepIndex, replay.steps.length - 1)]?.snapshot.units ?? replay.initial.units;
  $: leftHealth = sideHealth(snapshot, leftSource);
  $: rightHealth = sideHealth(snapshot, rightSource);
  $: layout = layoutUnits(snapshot);
  $: resultLabel = result === 'victory' ? 'Victory' : result === 'defeat' ? 'Defeat' : 'Draw';

  onMount(() => {
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion || startFinished) {
      stepIndex = replay.steps.length - 1;
      finished = true;
      return;
    }

    delayHandle = window.setTimeout(() => {
      startTime = performance.now();
      animationFrame = requestAnimationFrame(tickReplay);
    }, Math.max(0, delayMs));
  });

  onDestroy(() => {
    if (delayHandle !== null) {
      window.clearTimeout(delayHandle);
      delayHandle = null;
    }
    if (animationFrame !== null) {
      cancelAnimationFrame(animationFrame);
      animationFrame = null;
    }
  });

  function tickReplay(now: number): void {
    const timeline = buildBattlePresentationTimeline(replay, BASE_STEP_MS / BATTLE_SPEED_MULTIPLIER);
    const elapsed = now - startTime;
    const cue = timeline.cues.find((entry) => elapsed >= entry.startMs && elapsed <= entry.startMs + entry.durationMs);
    const previousStepIndex = stepIndex;

    if (cue) {
      stepIndex = cue.stepIndex;
      const progress = Math.max(0, Math.min(1, (elapsed - cue.startMs) / cue.durationMs));
      effect = buildEffect(replay.steps[cue.stepIndex], previousStepIndex, progress);
    } else {
      const pastCue = [...timeline.cues].reverse().find((entry) => elapsed > entry.startMs + entry.durationMs);
      stepIndex = pastCue?.stepIndex ?? -1;
      effect = null;
    }

    if (elapsed >= timeline.durationMs + 180) {
      stepIndex = replay.steps.length - 1;
      finished = true;
      effect = null;
      animationFrame = null;
      return;
    }

    animationFrame = requestAnimationFrame(tickReplay);
  }

  function fallbackMapHexes(radius: number): HexCoord[] {
    const hexes: HexCoord[] = [];
    for (let q = -radius; q <= radius; q += 1) {
      const rMin = Math.max(-radius, -q - radius);
      const rMax = Math.min(radius, -q + radius);
      for (let r = rMin; r <= rMax; r += 1) {
        hexes.push({ q, r });
      }
    }
    return hexes;
  }

  function axialToPixel(coord: HexCoord): Point {
    return {
      x: HEX_SIZE * (Math.sqrt(3) * coord.q + (Math.sqrt(3) / 2) * coord.r),
      y: HEX_SIZE * (1.5 * coord.r),
    };
  }

  function hexPoints(coord: HexCoord): string {
    const center = axialToPixel(coord);
    return Array.from({ length: 6 }, (_, index) => {
      const angle = (Math.PI / 180) * (60 * index - 30);
      return `${center.x + HEX_SIZE * Math.cos(angle)},${center.y + HEX_SIZE * Math.sin(angle)}`;
    }).join(' ');
  }

  function computeBounds(hexes: HexCoord[]): Bounds {
    const seed = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
    hexes.forEach((hex) => {
      const center = axialToPixel(hex);
      seed.minX = Math.min(seed.minX, center.x - HEX_SIZE);
      seed.maxX = Math.max(seed.maxX, center.x + HEX_SIZE);
      seed.minY = Math.min(seed.minY, center.y - HEX_SIZE);
      seed.maxY = Math.max(seed.maxY, center.y + HEX_SIZE);
    });
    return Number.isFinite(seed.minX) ? seed : { minX: -HEX_SIZE, maxX: HEX_SIZE, minY: -HEX_SIZE, maxY: HEX_SIZE };
  }

  function unitPoint(unit: BattleUnit): Point {
    return axialToPixel(footprintCenter(unit.occupiedHexes.length > 0 ? unit.occupiedHexes : [unit.position]));
  }

  function layoutUnits(units: BattleUnit[]): Array<{ unit: BattleUnit; point: Point; imageUrl: string; scale: number }> {
    const aliveUnits = units.filter((unit) => unit.alive);
    const occupancy = new Map<string, number>();
    return aliveUnits.map((unit) => {
      const center = unitPoint(unit);
      const key = `${Math.round(center.x)},${Math.round(center.y)}`;
      const count = occupancy.get(key) ?? 0;
      occupancy.set(key, count + 1);
      const spread = count === 0 ? { x: 0, y: 0 } : { x: Math.cos(count * 2.399) * 5, y: Math.sin(count * 2.399) * 4 };
      const imageUrl = portraits[`${unit.raceId}/${unit.unitClassId}`] ?? UNIT_SPRITE_URLS[unit.unitClassId as UnitClassId] ?? '';
      return {
        unit,
        point: { x: center.x + spread.x, y: center.y + spread.y },
        imageUrl,
        scale: Math.max(0.74, Math.min(1.45, Math.sqrt(Math.max(1, unit.stats.size)) * 0.82)),
      };
    });
  }

  function sideHealth(units: BattleUnit[], source: SideId): HealthSide {
    const sideUnits = units.filter((unit) => unit.side === source);
    const max = sideUnits.reduce((sum, unit) => sum + unit.maxHp, 0);
    const current = sideUnits.reduce((sum, unit) => sum + (unit.alive ? Math.max(0, unit.hp) : 0), 0);
    return { current, max, percent: max > 0 ? Math.max(0, Math.min(100, (current / max) * 100)) : 0 };
  }

  function unitFromStep(step: BattleStep | undefined, unitId: string): BattleUnit | null {
    return step?.snapshot.units.find((unit) => unit.id === unitId) ?? replay.initial.units.find((unit) => unit.id === unitId) ?? null;
  }

  function previousUnits(previousStepIndex: number): BattleUnit[] {
    if (previousStepIndex < 0) {
      return replay.initial.units;
    }
    return replay.steps[Math.min(previousStepIndex, replay.steps.length - 1)]?.snapshot.units ?? replay.initial.units;
  }

  function buildEffect(step: BattleStep | undefined, previousStepIndex: number, progress: number): EffectView | null {
    if (!step) {
      return null;
    }

    const prevUnits = previousUnits(previousStepIndex);
    if (step.kind === 'attack') {
      const actor = prevUnits.find((unit) => unit.id === step.actorIds[0]) ?? unitFromStep(step, step.actorIds[0] ?? '');
      const target = prevUnits.find((unit) => unit.id === step.targetIds[0]) ?? unitFromStep(step, step.targetIds[0] ?? '');
      return {
        kind: 'attack',
        mode: step.metadata?.mode ?? null,
        from: actor ? unitPoint(actor) : null,
        to: target ? unitPoint(target) : null,
        progress,
      };
    }

    if (step.kind === 'buff' || step.kind === 'heal') {
      const target = unitFromStep(step, step.targetIds[0] ?? step.actorIds[0] ?? '');
      const amount = step.metadata?.amount;
      return {
        kind: 'buff',
        point: target ? unitPoint(target) : null,
        progress,
        tone: step.kind === 'heal' || (typeof amount === 'number' && amount > 0) ? 'positive' : 'neutral',
      };
    }

    if (step.kind === 'death') {
      return {
        kind: 'death',
        points: step.targetIds.map((id) => prevUnits.find((unit) => unit.id === id) ?? unitFromStep(step, id)).filter((unit): unit is BattleUnit => Boolean(unit)).map(unitPoint),
        progress,
      };
    }

    return null;
  }
</script>

<div class="mini-replay" class:finished aria-label={`Miniature battle replay: ${resultLabel}`}>
  <div class={`mini-health ${leftHealthTone}`} aria-hidden="true">
    <span style={`height:${leftHealth.percent}%`}></span>
  </div>
  <div class="mini-stage">
    <svg viewBox={viewBox} preserveAspectRatio="xMidYMid meet">
      <g class="battlefield">
        {#each mapHexes as hex}
          <polygon class="hex" points={hexPoints(hex)} />
        {/each}
      </g>
      <g class="effects">
        {#if effect?.kind === 'attack' && effect.from && effect.to}
          {#if effect.mode === 'ranged'}
            <line
              class="projectile"
              x1={effect.from.x}
              y1={effect.from.y}
              x2={effect.from.x + (effect.to.x - effect.from.x) * effect.progress}
              y2={effect.from.y + (effect.to.y - effect.from.y) * effect.progress}
            />
          {:else}
            <line class="melee-flash" x1={effect.from.x} y1={effect.from.y} x2={effect.to.x} y2={effect.to.y} />
          {/if}
        {:else if effect?.kind === 'buff' && effect.point}
          <circle class={`pulse ${effect.tone}`} cx={effect.point.x} cy={effect.point.y} r={5 + effect.progress * 12} />
        {:else if effect?.kind === 'death'}
          {#each effect.points as point}
            <path class="death-mark" d={`M ${point.x - 5} ${point.y - 5} L ${point.x + 5} ${point.y + 5} M ${point.x + 5} ${point.y - 5} L ${point.x - 5} ${point.y + 5}`} />
          {/each}
        {/if}
      </g>
      <g class="units">
        {#each layout as entry (entry.unit.id)}
          <image
            class={`unit ${entry.unit.side}`}
            class:hit={effect?.kind === 'attack' && effect.to && Math.hypot(effect.to.x - entry.point.x, effect.to.y - entry.point.y) < 16 && effect.progress > 0.45}
            href={entry.imageUrl}
            x={entry.point.x - (UNIT_SIZE * entry.scale) / 2}
            y={entry.point.y - (UNIT_SIZE * entry.scale) / 2}
            width={UNIT_SIZE * entry.scale}
            height={UNIT_SIZE * entry.scale}
          />
        {/each}
      </g>
    </svg>
    {#if finished}
      <div class="result-overlay" aria-hidden="true">
        {#if opponentOutcome}
          <span class="swap-arrow">&lt;-&gt;</span>
        {/if}
        <svg class={`result-icon ${result}`} viewBox="0 0 64 64">
          {#if result === 'victory'}
            <path d="M12 47h40l-4 9H16l-4-9Z" />
            <path d="M15 42 10 16l15 13 7-18 7 18 15-13-5 26H15Z" />
          {:else if result === 'defeat'}
            <path d="M18 50h28v7H18v-7Z" />
            <path d="M14 29c0-12 8-21 18-21s18 9 18 21c0 10-6 18-18 18s-18-8-18-18Z" />
            <circle class="cutout" cx="25" cy="30" r="5" />
            <circle class="cutout" cx="39" cy="30" r="5" />
            <path class="cutout-stroke" d="M29 42h6m-12 8v7m6-7v7m6-7v7m6-7v7" />
          {:else}
            <path d="M14 38c12-2 20-11 31-27 1 12-2 21-8 27 5 1 9 3 13 7-12 1-21 0-28-4l-8 7 3-8-8-4 5-4Z" />
            <path d="M36 15c6 2 11 5 15 10-6 0-11-1-16-4l1-6Z" />
          {/if}
        </svg>
      </div>
    {/if}
  </div>
  <div class={`mini-health ${rightHealthTone}`} aria-hidden="true">
    <span style={`height:${rightHealth.percent}%`}></span>
  </div>
</div>

<style>
  .mini-replay {
    position: absolute;
    inset: 0;
    display: grid;
    grid-template-columns: 0.35rem minmax(0, 1fr) 0.35rem;
    gap: 0.18rem;
    align-items: stretch;
    padding: 0.22rem;
    pointer-events: none;
  }

  .mini-stage {
    position: relative;
    min-width: 0;
    overflow: hidden;
    border: 1px solid rgba(148, 177, 198, 0.24);
    border-radius: 8px;
    background:
      radial-gradient(circle at center, rgba(233, 206, 148, 0.08), transparent 62%),
      #0d141d;
  }

  .mini-stage svg {
    width: 100%;
    height: 100%;
    display: block;
  }

  .mini-health {
    align-self: stretch;
    display: flex;
    align-items: end;
    min-height: 0;
    overflow: hidden;
    border: 1px solid rgba(185, 205, 216, 0.24);
    border-radius: 999px;
    background: rgba(5, 8, 12, 0.72);
  }

  .mini-health span {
    display: block;
    width: 100%;
    min-height: 0;
    border-radius: inherit;
    transition: height 80ms linear;
  }

  .mini-health.player span {
    background: linear-gradient(0deg, #4fa666, #a7dd6d);
  }

  .mini-health.opponent span {
    background: linear-gradient(0deg, #c84f5b, #f2a06d);
  }

  .mini-health.neutral span {
    background: linear-gradient(0deg, #68727c, #b6c0c8);
  }

  .hex {
    fill: rgba(29, 42, 48, 0.78);
    stroke: rgba(117, 145, 157, 0.38);
    stroke-width: 1;
  }

  .unit {
    image-rendering: pixelated;
    filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.55));
    transition: opacity 90ms linear;
  }

  .unit.enemy {
    transform-box: fill-box;
    transform-origin: center;
    transform: scaleX(-1);
  }

  .unit.hit {
    filter:
      sepia(1)
      saturate(2.6)
      hue-rotate(310deg)
      drop-shadow(0 0 5px rgba(255, 90, 84, 0.9));
  }

  .projectile {
    stroke: #ffeab0;
    stroke-width: 4;
    stroke-linecap: round;
    filter: drop-shadow(0 0 4px rgba(255, 186, 79, 0.9));
  }

  .melee-flash {
    stroke: #fff3b8;
    stroke-width: 5;
    stroke-linecap: round;
    opacity: 0.74;
    filter: drop-shadow(0 0 5px rgba(255, 179, 83, 0.9));
  }

  .pulse {
    fill: none;
    stroke-width: 3;
    opacity: 0.75;
  }

  .pulse.positive {
    stroke: #9de7a3;
  }

  .pulse.neutral {
    stroke: #b8d4f5;
  }

  .pulse.negative {
    stroke: #ff8b8b;
  }

  .death-mark {
    stroke: #f5d9b4;
    stroke-width: 3;
    stroke-linecap: round;
    opacity: 0.88;
  }

  .finished .battlefield,
  .finished .units,
  .finished .effects {
    opacity: 0.2;
    transition: opacity 360ms ease-out;
  }

  .result-overlay {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    gap: 0.12rem;
    align-content: center;
    background: radial-gradient(circle at center, rgba(7, 10, 15, 0.24), rgba(7, 10, 15, 0.66));
    animation: result-enter 360ms ease-out both;
  }

  .swap-arrow {
    color: #dbe8f3;
    font-family: var(--ui-font-mono);
    font-size: 0.7rem;
    font-weight: 800;
    line-height: 1;
    text-shadow: 0 1px 3px #020406;
  }

  .result-icon {
    width: 2rem;
    height: 2rem;
    fill: #f4e7c6;
    filter:
      drop-shadow(0 1px 2px rgba(0, 0, 0, 0.7))
      drop-shadow(0 0 8px rgba(242, 205, 128, 0.42));
  }

  .result-icon.victory {
    fill: #f7d271;
  }

  .result-icon.defeat {
    fill: #d8e0e5;
  }

  .result-icon.draw {
    fill: #dcecf0;
  }

  .cutout {
    fill: #111821;
  }

  .cutout-stroke {
    fill: none;
    stroke: #111821;
    stroke-width: 4;
    stroke-linecap: round;
  }

  @keyframes result-enter {
    from {
      opacity: 0;
      transform: scale(0.88);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .result-overlay {
      animation-duration: 1ms;
    }

    .unit,
    .mini-health span,
    .finished .battlefield,
    .finished .units,
    .finished .effects {
      transition-duration: 1ms;
    }
  }
</style>
