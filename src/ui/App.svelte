<script lang="ts">
  import { get } from 'svelte/store';
  import { onDestroy, onMount } from 'svelte';
  import type { BattleReplay, BattleUnit } from '../engine/types';
  import { debugBattleStore } from '../store/debugBattleStore';
  import { BattleRenderer, type UnitPointerInfo } from '../rendering/BattleRenderer';
  import DebugSetupPanel from './DebugSetupPanel.svelte';
  import BattleControls from './BattleControls.svelte';
  import EventLog from './EventLog.svelte';
  import UnitTooltip from './UnitTooltip.svelte';

  let viewport: HTMLDivElement;
  let renderer: BattleRenderer | null = null;
  let mountedReplay: BattleReplay | null = null;
  let autoTimer: ReturnType<typeof setInterval> | null = null;

  let hoveredPointer: UnitPointerInfo | null = null;
  let lockedPointer: UnitPointerInfo | null = null;

  const state = debugBattleStore;

  function clearAutoTimer(): void {
    if (autoTimer) {
      clearInterval(autoTimer);
      autoTimer = null;
    }
  }

  function toggleAuto(): void {
    debugBattleStore.setAutoPlay(!$state.autoPlay);
  }

  onMount(async () => {
    renderer = new BattleRenderer(viewport);
    renderer.setInteractionHandlers({
      onUnitHover: (info) => {
        if (lockedPointer) {
          return;
        }
        hoveredPointer = info;
      },
      onUnitClick: (info) => {
        if (lockedPointer?.unitId === info.unitId) {
          lockedPointer = null;
          hoveredPointer = info;
          return;
        }
        lockedPointer = info;
        hoveredPointer = info;
      },
    });

    await renderer.init();
    debugBattleStore.runBattle();
  });

  onDestroy(() => {
    clearAutoTimer();
    renderer?.destroy();
  });

  $: if (renderer && $state.replay && $state.replay !== mountedReplay) {
    renderer.setReplay($state.replay);
    mountedReplay = $state.replay;
    hoveredPointer = null;
    lockedPointer = null;
  }

  $: currentUnits = (() => {
    if (!$state.replay) {
      return [] as BattleUnit[];
    }
    if ($state.currentStep < 0) {
      return $state.replay.initial.units;
    }
    return $state.replay.steps[$state.currentStep]?.snapshot.units ?? $state.replay.initial.units;
  })();

  $: currentUnitById = new Map(currentUnits.map((unit) => [unit.id, unit]));

  $: {
    const lockedId = lockedPointer?.unitId;
    if (lockedId && !currentUnitById.has(lockedId)) {
      lockedPointer = null;
    }

    const hoverId = hoveredPointer?.unitId;
    if (!lockedPointer && hoverId && !currentUnitById.has(hoverId)) {
      hoveredPointer = null;
    }
  }

  $: activePointer = lockedPointer ?? hoveredPointer;
  $: activeUnit = activePointer ? currentUnitById.get(activePointer.unitId) ?? null : null;
  $: engagedUnits = activeUnit
    ? activeUnit.engagedWithIds.map((id) => currentUnitById.get(id)).filter((unit): unit is BattleUnit => Boolean(unit))
    : [];

  $: if (renderer && $state.replay) {
    renderer.showStep($state.currentStep);
  }

  $: if (renderer) {
    renderer.setPlaybackTiming($state.autoPlay, $state.speedMs);
  }

  $: if (renderer) {
    const selected = $state.selectedEvent;
    const strong = new Set<string>();
    if ($state.replay && selected !== null) {
      const step = $state.replay.steps[selected];
      (step?.actorIds ?? []).forEach((id) => strong.add(id));
      (step?.targetIds ?? []).forEach((id) => strong.add(id));
    }

    if (activeUnit) {
      strong.add(activeUnit.id);
    }

    const faint = activeUnit
      ? activeUnit.engagedWithIds.filter((id) => !strong.has(id) && currentUnitById.has(id))
      : [];

    renderer.setHighlights([...strong], faint);
  }

  $: {
    clearAutoTimer();
    if ($state.autoPlay && $state.replay) {
      autoTimer = setInterval(() => {
        const snapshot = get(debugBattleStore);
        if (!snapshot.replay) {
          debugBattleStore.setAutoPlay(false);
          return;
        }
        const before = snapshot.currentStep;
        debugBattleStore.stepForward();
        const after = get(debugBattleStore).currentStep;
        if (after === before) {
          debugBattleStore.setAutoPlay(false);
        }
      }, $state.speedMs);
    }
  }
</script>

<main>
  <section class="left">
    <DebugSetupPanel
      player={$state.player}
      enemy={$state.enemy}
      seedInput={$state.seedInput}
      replaySeed={$state.replay?.seed ?? null}
      onSetArmy={debugBattleStore.setArmy}
      onSetSeed={debugBattleStore.setSeed}
      onRunBattle={() => debugBattleStore.runBattle()}
      onRestart={() => debugBattleStore.restart()}
    />

    <BattleControls
      replayLength={$state.replay?.steps.length ?? 0}
      currentStep={$state.currentStep}
      autoPlay={$state.autoPlay}
      speedMs={$state.speedMs}
      onStepBack={() => debugBattleStore.stepBackward()}
      onStepForward={() => debugBattleStore.stepForward()}
      onJumpStart={() => debugBattleStore.jumpTo(-1)}
      onToggleAuto={toggleAuto}
      onSetSpeed={(ms) => debugBattleStore.setSpeedMs(ms)}
    />

    <section class="status">
      <h2>Result</h2>
      {#if $state.replay}
        <p>
          Outcome: <strong>{$state.replay.outcome}</strong>
        </p>
        <p>
          Map radius: {$state.replay.mapRadius} | Saturation: {$state.replay.saturation}
        </p>
      {/if}
    </section>
  </section>

  <section class="center">
    <div class="viewport" bind:this={viewport}></div>
  </section>

  <section class="right">
    <EventLog
      steps={$state.replay?.steps ?? []}
      selected={$state.selectedEvent}
      currentStep={$state.currentStep}
      onSelect={(index) => debugBattleStore.selectEvent(index)}
    />

    <section class="unit-panel">
      <h2>Unit Focus</h2>
      {#if activeUnit}
        <UnitTooltip
          unit={activeUnit}
          engagedUnits={engagedUnits}
          x={0}
          y={0}
          locked={Boolean(lockedPointer)}
          docked={true}
        />
      {:else}
        <p>Hover or click a unit to inspect it.</p>
      {/if}
    </section>
  </section>
</main>

<style>
  main {
    min-height: 100vh;
    display: grid;
    grid-template-columns: 330px minmax(0, 1fr) 350px;
    gap: 1rem;
    padding: 1rem;
  }

  .left,
  .right {
    display: grid;
    align-content: start;
    gap: 1rem;
    min-height: 0;
  }

  .center {
    min-height: 640px;
  }

  .viewport {
    height: 100%;
    min-height: 640px;
    border: 1px solid #2f3b49;
    border-radius: 14px;
    overflow: hidden;
    background: radial-gradient(circle at 50% 20%, #1f2f3a, #0d1118 60%, #090d14 100%);
  }

  .unit-panel {
    background: linear-gradient(145deg, rgba(20, 24, 32, 0.95), rgba(11, 13, 18, 0.95));
    border: 1px solid #2f3b49;
    border-radius: 14px;
    padding: 0.8rem;
    display: grid;
    gap: 0.6rem;
  }

  .unit-panel h2,
  .unit-panel p {
    margin: 0;
  }

  .unit-panel p {
    color: #aeb8c2;
    font-size: 0.88rem;
  }

  .status {
    background: linear-gradient(145deg, rgba(20, 24, 32, 0.95), rgba(11, 13, 18, 0.95));
    border: 1px solid #2f3b49;
    border-radius: 14px;
    padding: 1rem;
  }

  .status h2,
  .status p {
    margin: 0;
  }

  .status p + p {
    margin-top: 0.4rem;
  }

  @media (max-width: 1260px) {
    main {
      grid-template-columns: 1fr;
      grid-template-rows: auto minmax(420px, 56vh) auto;
    }

    .center {
      min-height: 420px;
    }

    .viewport {
      min-height: 420px;
    }
  }
</style>



