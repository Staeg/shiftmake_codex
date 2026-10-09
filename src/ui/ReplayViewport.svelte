<script context="module" lang="ts">
  import type { UnitPointerInfo } from '../rendering/BattleRenderer';

  export interface ReplayViewportInspection {
    read(): { strongIds: string[]; eventMarkerIds: string[]; terrainVisible: boolean };
    hover(info: UnitPointerInfo | null): void;
    select(info: UnitPointerInfo): void;
    reset(): void;
    beforeNavigate(): void;
  }
  export type ReplayControlAction = 'step-previous' | 'step-next' | 'play' | 'pause';
</script>

<script lang="ts">
  import { onMount } from 'svelte';
  import type { BattleReplay, BattleReportDiagnostic } from '../engine/types';
  import type { BattleRenderer as BattleRendererType, ReplayStepNavigationKind } from '../rendering/BattleRenderer';
  import { createReplayPlaybackController } from '../rendering/replayPlaybackController';
  import { createReplayRendererLifecycle } from '../rendering/replayRendererLifecycle';
  import { gameStore, gameSessionStore, replayPlaybackStore } from '../store/gameStore';
  import BattleControls from './BattleControls.svelte';

  export let inspection: ReplayViewportInspection;
  export let onDiagnostic: (diagnostic: BattleReportDiagnostic) => void;
  export let onControlAction: (action: ReplayControlAction) => void;
  export let navigationKind: ReplayStepNavigationKind = 'manual-step';

  let mounted = false;
  let host: HTMLDivElement | null = null;
  let renderer: BattleRendererType | null = null;
  let renderedReplay: BattleReplay | null = null;
  let renderedStep = Number.NaN;
  let renderedHighlightKey = '';

  const playback = createReplayPlaybackController({
    read: () => ({ state: $replayPlaybackStore, active: mounted && $gameSessionStore.screen === 'replay' }),
    scheduler: {
      now: () => performance.now(),
      request: (callback) => window.requestAnimationFrame(callback),
      cancel: (handle) => window.cancelAnimationFrame(handle),
    },
    advance: (step) => {
      navigationKind = 'auto';
      gameStore.jumpTo(step);
    },
    pause: () => gameStore.setAutoPlay(false),
    idle: refresh,
  });

  const lifecycle = createReplayRendererLifecycle<HTMLDivElement, BattleRendererType>({
    load: async () => {
      const { BattleRenderer } = await import('../rendering/BattleRenderer');
      return (container) => {
        const nextRenderer = new BattleRenderer(container);
        nextRenderer.setDiagnosticHandler((diagnostic) => onDiagnostic(diagnostic));
        nextRenderer.setInteractionHandlers({
          onUnitHover: (info) => inspection.hover(info),
          onUnitClick: (info) => inspection.select(info),
        });
        return nextRenderer;
      };
    },
    isCurrent: (container) => mounted && host === container && $gameSessionStore.screen === 'replay',
    changed: (nextRenderer) => {
      renderer = nextRenderer;
      renderedReplay = null;
      renderedStep = Number.NaN;
      renderedHighlightKey = '';
      renderer?.refreshViewport();
      refresh();
    },
    failed: (error) => onDiagnostic({ source: 'ui', severity: 'error', code: 'renderer_init_failed',
      message: error instanceof Error ? error.message : 'Renderer failed to initialize.' }),
  });

  export function refresh(): void {
    const state = $replayPlaybackStore;
    if (!renderer || !state.loadedReplay) {
      return;
    }
    renderer.setPlaybackTiming(state.autoPlay, state.rateMs);
    if (renderedReplay !== state.loadedReplay) {
      renderer.setReplay(state.loadedReplay);
      renderedReplay = state.loadedReplay;
      renderedStep = Number.NaN;
      renderedHighlightKey = '';
      inspection.reset();
    }
    if (renderedStep !== state.currentStep) {
      renderer.showStep(state.currentStep, navigationKind);
      renderedStep = state.currentStep;
      navigationKind = 'manual-step';
    }
    const view = inspection.read();
    renderer.setHexInspectionVisible(!view.terrainVisible);
    renderer.setTerrainVisible(view.terrainVisible);
    const highlightKey = `${state.autoPlay ? 'autoplay' : 'manual'}::${view.strongIds.join('|')}::${view.eventMarkerIds.join('|')}`;
    if (highlightKey !== renderedHighlightKey) {
      renderer.setHighlights(view.strongIds, view.eventMarkerIds);
      renderedHighlightKey = highlightKey;
    }
  }

  function navigate(action: () => void, kind: ReplayStepNavigationKind, signal?: ReplayControlAction): void {
    gameStore.setAutoPlay(false);
    inspection.beforeNavigate();
    navigationKind = kind;
    action();
    if (signal) {
      onControlAction(signal);
    }
  }

  function toggleAutoPlay(): void {
    const playing = !$replayPlaybackStore.autoPlay;
    gameStore.setAutoPlay(playing);
    onControlAction(playing ? 'play' : 'pause');
  }

  onMount(() => {
    mounted = true;
    return () => {
      mounted = false;
      playback.dispose();
      lifecycle.dispose();
      inspection.reset();
    };
  });

  $: if (mounted && host && $gameSessionStore.screen === 'replay') {
    void lifecycle.ensure(host);
  }
  $: if (mounted && (!host || $gameSessionStore.screen !== 'replay')) {
    lifecycle.reset();
  }
  $: if (mounted) {
    playback.sync($replayPlaybackStore, $gameSessionStore.screen === 'replay');
  }
  $: if (mounted && renderer && $replayPlaybackStore.loadedReplay) {
    $replayPlaybackStore.currentStep;
    $replayPlaybackStore.autoPlay;
    $replayPlaybackStore.rateMs;
    navigationKind;
    refresh();
  }
  $: if (mounted && $replayPlaybackStore.loadedReplay && $replayPlaybackStore.autoPlay
    && $replayPlaybackStore.currentStep >= $replayPlaybackStore.loadedReplay.steps.length - 1) {
    gameStore.setAutoPlay(false);
  }
</script>

<div class="replay-map-controls ui-debug-target" data-ui-name="Replay controls overlay">
  <BattleControls
    replayLength={$replayPlaybackStore.loadedReplay?.steps.length ?? 0}
    currentStep={$replayPlaybackStore.currentStep}
    autoPlay={$replayPlaybackStore.autoPlay}
    rateMs={$replayPlaybackStore.rateMs}
    onJumpStart={() => navigate(() => gameStore.jumpTo(-1), 'reset')}
    onStepBack={() => navigate(() => gameStore.stepBackward(), 'manual-step', 'step-previous')}
    onStepForward={() => navigate(() => gameStore.stepForward(), 'manual-step', 'step-next')}
    onToggleAuto={toggleAutoPlay}
    onSetRate={(rate) => gameStore.setRateMs(rate)}
  />
</div>
<div class="replay-zoom-controls ui-debug-target" data-ui-name="Replay zoom controls" aria-label="Replay zoom controls">
  <button class="replay-zoom-button ui-debug-target" data-ui-name="Zoom in button" type="button" aria-label="Zoom In" title="Zoom In" on:click={() => renderer?.zoomIn()}>+</button>
  <button class="replay-zoom-button ui-debug-target" data-ui-name="Zoom out button" type="button" aria-label="Zoom Out" title="Zoom Out" on:click={() => renderer?.zoomOut()}>-</button>
  <button class="replay-reset-button ui-debug-target" data-ui-name="Reset zoom button" type="button" aria-label="Reset Zoom" title="Reset Zoom" on:click={() => renderer?.resetZoom()}>Reset Zoom</button>
</div>
<slot name="mutators" />
<div class="viewport ui-debug-target" data-ui-name="Battlefield canvas" bind:this={host}></div>
<slot />

<svelte:window on:resize={() => renderer?.refreshViewport()} />

<style>
  .replay-map-controls {
    position: absolute;
    top: 0.75rem;
    left: 0.75rem;
    z-index: 6;
    pointer-events: auto;
  }

  .viewport {
    min-height: 0;
    width: 100%;
    height: 100%;
  }

  .viewport {
    display: block;
    position: relative;
    width: 100%;
    height: 100%;
    min-height: clamp(340px, 50vh, 560px);
    border: 1px solid rgba(126, 157, 181, 0.2);
    border-radius: calc(var(--ui-panel-radius) + var(--ui-space-sm));
    background:
      radial-gradient(circle at 50% 20%, rgba(46, 70, 89, 0.9), transparent 42%),
      linear-gradient(180deg, #10202c, #08101a 62%, #06090f);
    box-shadow: inset 0 0 0 1px rgba(201, 171, 124, 0.06);
  }

  .viewport :global(.battle-tutorial-unit-targets) {
    position: absolute;
    inset: 0;
    overflow: hidden;
    pointer-events: none;
  }

  .viewport :global(.battle-tutorial-unit-target) {
    position: absolute;
    pointer-events: none;
  }

  .replay-zoom-controls {
    position: absolute;
    top: 0.45rem;
    right: 0.45rem;
    bottom: auto;
    left: auto;
    z-index: 2;
    display: inline-flex;
    align-items: center;
    gap: 0.22rem;
    padding: 0.22rem;
    width: max-content;
    max-width: calc(100% - 0.9rem);
    border-radius: 999px;
    border: 1px solid rgba(126, 157, 181, 0.18);
    background: rgba(7, 11, 18, 0.6);
    backdrop-filter: blur(10px);
  }

  .replay-zoom-button,
  .replay-reset-button {
    min-height: 1.75rem;
    border: 1px solid rgba(124, 153, 176, 0.22);
    background: rgba(15, 23, 35, 0.96);
    color: #f4f7fb;
    font: inherit;
  }

  .replay-zoom-button {
    width: 1.75rem;
    padding: 0;
    border-radius: 999px;
    display: grid;
    place-items: center;
  }

  .replay-reset-button {
    padding: 0 0.55rem;
    border-radius: 999px;
    font-size: 0.68rem;
    letter-spacing: 0.04em;
  }

  @media (max-width: 1280px) {
    .viewport { min-height: 420px; }
  }
</style>
