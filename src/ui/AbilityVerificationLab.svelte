<script lang="ts">
  import { onMount } from 'svelte';
  import type { BattleReplay, BattleUnit } from '../engine/types';
  import {
    ABILITY_VERIFICATION_SCENARIOS,
    ABILITY_VERIFICATION_SCENARIOS_BY_ID,
    type AbilityVerificationScenario,
  } from '../engine/abilityVerificationCatalog';
  import { BattleRenderer } from '../rendering/BattleRenderer';
  import { debugBattleStore } from '../store/debugBattleStore';
  import BattleControls from './BattleControls.svelte';
  import DebugSetupPanel from './DebugSetupPanel.svelte';
  import EventLog from './EventLog.svelte';

  type SignalMatch = {
    id: string;
    label: string;
    match: string;
    stepIndex: number | null;
  };

  type DebugStateValue = {
    player: Record<string, number>;
    enemy: Record<string, number>;
    seedInput: string;
    replay: BattleReplay | null;
    currentStep: number;
    selectedEvent: number | null;
    autoPlay: boolean;
    speedMs: number;
  };

  const scenarioGroups = Array.from(
    ABILITY_VERIFICATION_SCENARIOS.reduce((groups, scenario) => {
      const list = groups.get(scenario.group) ?? [];
      list.push(scenario);
      groups.set(scenario.group, list);
      return groups;
    }, new Map<string, AbilityVerificationScenario[]>()),
  );

  let selectedScenarioId = ABILITY_VERIFICATION_SCENARIOS[0]?.id ?? '';
  let battleHost: HTMLDivElement | null = null;
  let renderer: BattleRenderer | null = null;
  let renderedReplayId: string | null = null;
  let renderedStep = Number.NaN;
  let renderedHighlightKey = '';
  let autoTimer: ReturnType<typeof window.setInterval> | null = null;
  let scenario: AbilityVerificationScenario = ABILITY_VERIFICATION_SCENARIOS[0]!;
  let replay: BattleReplay | null = null;
  let displayStep = -1;
  let replaySnapshot: BattleUnit[] = [];
  let matches: SignalMatch[] = [];

  let state: DebugStateValue = {
    player: {},
    enemy: {},
    seedInput: '',
    replay: null,
    currentStep: -1,
    selectedEvent: null,
    autoPlay: false,
    speedMs: 8,
  };

  function currentSnapshot(replay: BattleReplay, currentStep: number): BattleUnit[] {
    if (currentStep < 0) {
      return replay.initial.units;
    }
    return replay.steps[Math.min(currentStep, replay.steps.length - 1)]?.snapshot.units ?? replay.initial.units;
  }

  function clearAutoTimer(): void {
    if (autoTimer !== null) {
      window.clearInterval(autoTimer);
      autoTimer = null;
    }
  }

  async function ensureRenderer(): Promise<void> {
    if (!battleHost || renderer) {
      return;
    }

    renderer = new BattleRenderer(battleHost);
    await renderer.init();
    syncRenderer();
  }

  function syncRenderer(): void {
    if (!renderer || !state.replay) {
      return;
    }

    renderer.setPlaybackTiming(state.autoPlay, state.speedMs);

    if (renderedReplayId !== state.replay.id) {
      renderedReplayId = state.replay.id;
      renderedStep = Number.NaN;
      renderer.setReplay(state.replay);
    }

    const displayStep = state.selectedEvent ?? state.currentStep;
    if (renderedStep !== displayStep) {
      renderedStep = displayStep;
      renderer.showStep(displayStep);
    }

    const step = displayStep >= 0 ? state.replay.steps[displayStep] ?? null : null;
    const strongIds = state.autoPlay ? [] : step?.actorIds ?? [];
    const faintIds = state.autoPlay ? [] : step?.targetIds ?? [];
    const highlightKey = `${state.autoPlay ? 'autoplay' : 'manual'}::${strongIds.join(',')}::${faintIds.join(',')}`;
    if (renderedHighlightKey !== highlightKey) {
      renderedHighlightKey = highlightKey;
      renderer.setHighlights(strongIds, faintIds);
    }
  }

  function loadScenario(targetScenario: AbilityVerificationScenario, runBattle = true): void {
    debugBattleStore.loadSetup({
      player: targetScenario.player,
      enemy: targetScenario.enemy,
      seedInput: String(targetScenario.seed),
      playerFactionUpgradeIds: targetScenario.playerFactionUpgradeIds,
      playerTroopTypeUpgradeIds: targetScenario.playerTroopTypeUpgradeIds,
      enemyFactionUpgradeIds: targetScenario.enemyFactionUpgradeIds,
      enemyTroopTypeUpgradeIds: targetScenario.enemyTroopTypeUpgradeIds,
    });
    if (runBattle) {
      debugBattleStore.runBattle();
    }
  }

  function chooseScenario(id: string): void {
    selectedScenarioId = id;
    loadScenario(ABILITY_VERIFICATION_SCENARIOS_BY_ID[id] ?? ABILITY_VERIFICATION_SCENARIOS[0]!, true);
  }

  function jumpToSignal(stepIndex: number | null): void {
    if (stepIndex === null) {
      return;
    }
    debugBattleStore.setAutoPlay(false);
    debugBattleStore.selectEvent(stepIndex);
  }

  function runManualReplayAction(action: () => void): void {
    debugBattleStore.setAutoPlay(false);
    action();
  }

  onMount(() => {
    const unsubscribe = debugBattleStore.subscribe((value) => {
      state = value as unknown as DebugStateValue;
      syncRenderer();

      clearAutoTimer();
      if (state.replay && state.autoPlay) {
        autoTimer = window.setInterval(() => {
          if (!state.replay || state.currentStep >= state.replay.steps.length - 1) {
            debugBattleStore.setAutoPlay(false);
            return;
          }
          debugBattleStore.stepForward();
        }, state.speedMs);
      }
    });

    loadScenario(scenario, true);
    void ensureRenderer();

    return () => {
      clearAutoTimer();
      unsubscribe();
      renderer?.destroy();
      renderer = null;
    };
  });

  $: if (battleHost) {
    void ensureRenderer();
  }

  $: scenario = ABILITY_VERIFICATION_SCENARIOS_BY_ID[selectedScenarioId] ?? ABILITY_VERIFICATION_SCENARIOS[0]!;
  $: replay = state.replay;
  $: displayStep = state.selectedEvent ?? state.currentStep;
  $: replaySnapshot = replay ? currentSnapshot(replay, displayStep) : [];
  $: matches = scenario.signals.map((signal) => {
    const rawIndex = replay ? replay.steps.findIndex((step) => step.message.includes(signal.match)) : -1;
    return {
      ...signal,
      stepIndex: rawIndex >= 0 ? rawIndex : null,
    };
  });
</script>

<main class="lab-shell">
  <section class="lab-sidebar">
    <header class="lab-header panel">
      <p class="eyebrow">Verification Lab</p>
      <h1>Ability Replay Harness</h1>
      <p>Use seeded scenarios to watch the new upgrades in the real replay viewer. Only capture screenshots when something actually looks wrong.</p>
    </header>

    <section class="panel scenario-panel">
      <div class="scenario-panel-header">
        <div>
          <p class="eyebrow">Scenario Library</p>
          <h2>{scenario.label}</h2>
        </div>
        <button type="button" class="ghost-button" on:click={() => loadScenario(scenario, true)}>Reload</button>
      </div>

      <p class="scenario-summary">{scenario.summary}</p>
      <small>Seed {scenario.seed}</small>

      <div class="coverage-chips">
        {#each scenario.coveredAbilityIds as abilityId}
          <span>{abilityId}</span>
        {/each}
      </div>

      <div class="scenario-groups">
        {#each scenarioGroups as [group, scenarios]}
          <section>
            <p class="eyebrow">{group}</p>
            <div class="scenario-list">
              {#each scenarios as entry}
                <button type="button" class:selected={entry.id === selectedScenarioId} on:click={() => chooseScenario(entry.id)}>
                  <strong>{entry.label}</strong>
                  <small>{entry.coveredAbilityIds.length} checks</small>
                </button>
              {/each}
            </div>
          </section>
        {/each}
      </div>
    </section>

    <section class="panel signal-panel">
      <p class="eyebrow">Replay Signals</p>
      <h2>Expected Trigger Evidence</h2>
      {#if matches.length === 0}
        <p class="empty-copy">This scenario relies mostly on the manual checks below.</p>
      {:else}
        <div class="signal-list">
          {#each matches as signal}
            <div class:missing={signal.stepIndex === null} class="signal-row">
              <div>
                <strong>{signal.label}</strong>
                <small>{signal.stepIndex === null ? 'Not found yet' : `Step ${signal.stepIndex + 1}`}</small>
              </div>
              <button type="button" disabled={signal.stepIndex === null} on:click={() => jumpToSignal(signal.stepIndex)}>Jump</button>
            </div>
          {/each}
        </div>
      {/if}

      <div class="manual-checks">
        <p class="eyebrow">Manual Checks</p>
        <ul>
          {#each scenario.manualChecks as check}
            <li>{check}</li>
          {/each}
        </ul>
      </div>
    </section>

    <DebugSetupPanel
      player={state.player}
      enemy={state.enemy}
      seedInput={state.seedInput}
      replaySeed={replay?.seed ?? null}
      onSetArmy={(side, key, value) => debugBattleStore.setArmy(side, key, value)}
      onSetSeed={(value) => debugBattleStore.setSeed(value)}
      onRunBattle={() => debugBattleStore.runBattle()}
      onRestart={() => debugBattleStore.restart()}
    />
  </section>

  <section class="lab-main">
    <div class="panel battle-stage">
      <div class="battle-stage-header">
        <div>
          <p class="eyebrow">Replay View</p>
          <h2>{scenario.label}</h2>
        </div>
        <div class="snapshot-meta">
          <span>{replay ? `Seed ${replay.seed}` : 'No replay yet'}</span>
          <span>{replay ? `${Math.max(0, displayStep + 1)}/${replay.steps.length} steps` : 'Run a battle'}</span>
        </div>
      </div>
      <div class="viewport" bind:this={battleHost}></div>
    </div>

    <BattleControls
      replayLength={replay?.steps.length ?? 0}
      currentStep={state.currentStep}
      autoPlay={state.autoPlay}
      speedMs={state.speedMs}
      onJumpStart={() => runManualReplayAction(() => debugBattleStore.jumpTo(-1))}
      onStepBack={() => runManualReplayAction(() => debugBattleStore.stepBackward())}
      onStepForward={() => runManualReplayAction(() => debugBattleStore.stepForward())}
      onToggleAuto={() => debugBattleStore.setAutoPlay(!state.autoPlay)}
      onSetSpeed={(speedMs) => debugBattleStore.setSpeedMs(speedMs)}
    />

    <section class="panel snapshot-panel">
      <p class="eyebrow">Current Snapshot</p>
      <h2>Alive Units</h2>
      {#if replaySnapshot.length === 0}
        <p>No replay selected.</p>
      {:else}
        <div class="snapshot-grid">
          {#each replaySnapshot.filter((unit) => unit.alive) as unit}
            <div class="unit-card">
              <strong>{unit.troopLabel}</strong>
              <small>{unit.side} · HP {unit.hp} · Init {unit.initiative}</small>
            </div>
          {/each}
        </div>
      {/if}
    </section>
  </section>

  <section class="lab-log">
    <EventLog
      steps={replay?.steps ?? []}
      selected={state.selectedEvent}
      currentStep={state.currentStep}
      showTitle={true}
      onSelect={(index) => runManualReplayAction(() => debugBattleStore.selectEvent(index))}
    />
  </section>
</main>

<style>
  :global(body) {
    margin: 0;
  }

  .lab-shell {
    min-height: 100vh;
    display: grid;
    grid-template-columns: 360px minmax(0, 1fr) 360px;
    gap: 1rem;
    padding: 1rem;
    box-sizing: border-box;
    background:
      radial-gradient(circle at top, rgba(114, 143, 176, 0.14), transparent 35%),
      linear-gradient(180deg, #0c1117, #0a0e14 55%, #080c11);
    color: #edf2f7;
  }

  .lab-sidebar,
  .lab-main,
  .lab-log {
    min-height: 0;
    display: grid;
    gap: 1rem;
    align-content: start;
  }

  .lab-main {
    grid-template-rows: minmax(0, 1fr) auto auto;
  }

  .panel {
    background: linear-gradient(145deg, rgba(20, 24, 32, 0.95), rgba(11, 13, 18, 0.95));
    border: 1px solid #2f3b49;
    border-radius: 14px;
    padding: 0.85rem;
    box-sizing: border-box;
  }

  .eyebrow {
    margin: 0 0 0.25rem;
    color: #93a7bb;
    font-size: 0.72rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  h1,
  h2,
  p,
  ul {
    margin: 0;
  }

  .lab-header h1 {
    margin-bottom: 0.4rem;
    font-size: 1.4rem;
  }

  .scenario-panel,
  .signal-panel {
    display: grid;
    gap: 0.8rem;
  }

  .scenario-panel-header,
  .battle-stage-header {
    display: flex;
    justify-content: space-between;
    gap: 0.75rem;
    align-items: start;
  }

  .scenario-summary {
    color: #d7dee7;
    line-height: 1.4;
  }

  .coverage-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
  }

  .coverage-chips span,
  .snapshot-meta span {
    border: 1px solid rgba(120, 146, 171, 0.28);
    background: rgba(120, 146, 171, 0.12);
    border-radius: 999px;
    padding: 0.18rem 0.5rem;
    font-size: 0.74rem;
    color: #dce7f2;
  }

  .scenario-groups {
    display: grid;
    gap: 0.85rem;
    max-height: 24rem;
    overflow: auto;
    padding-right: 0.2rem;
  }

  .scenario-list {
    display: grid;
    gap: 0.35rem;
  }

  .scenario-list button,
  .signal-row button,
  .ghost-button {
    background: #1b2430;
    border: 1px solid #344556;
    color: #edf2f7;
    border-radius: 10px;
    cursor: pointer;
    font: inherit;
  }

  .scenario-list button {
    padding: 0.55rem 0.65rem;
    text-align: left;
    display: grid;
    gap: 0.18rem;
  }

  .scenario-list button.selected {
    border-color: #c5b574;
    box-shadow: inset 0 0 0 1px rgba(197, 181, 116, 0.35);
  }

  .scenario-list small,
  .signal-row small,
  .unit-card small {
    color: #9fb0c1;
  }

  .signal-list {
    display: grid;
    gap: 0.45rem;
  }

  .signal-row {
    display: flex;
    justify-content: space-between;
    gap: 0.75rem;
    align-items: center;
    border: 1px solid #334353;
    border-radius: 12px;
    padding: 0.55rem 0.65rem;
    background: rgba(23, 31, 40, 0.84);
  }

  .signal-row.missing {
    border-color: rgba(194, 109, 109, 0.35);
  }

  .signal-row button,
  .ghost-button {
    padding: 0.4rem 0.7rem;
  }

  .signal-row button:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .manual-checks ul {
    padding-left: 1.1rem;
    display: grid;
    gap: 0.45rem;
    color: #d5dde6;
  }

  .battle-stage {
    min-height: 0;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    gap: 0.8rem;
  }

  .snapshot-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
    justify-content: end;
  }

  .viewport {
    min-height: 34rem;
    border-radius: 12px;
    overflow: hidden;
    background: #111117;
    border: 1px solid #293543;
  }

  .snapshot-panel {
    display: grid;
    gap: 0.75rem;
  }

  .snapshot-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
    gap: 0.45rem;
    max-height: 12rem;
    overflow: auto;
  }

  .unit-card {
    border: 1px solid #314152;
    border-radius: 10px;
    padding: 0.5rem 0.6rem;
    background: rgba(20, 27, 36, 0.9);
    display: grid;
    gap: 0.16rem;
  }

  .lab-log :global(.panel) {
    min-height: calc(100vh - 2rem);
  }

  @media (max-width: 1500px) {
    .lab-shell {
      grid-template-columns: 320px minmax(0, 1fr) 320px;
    }
  }

  @media (max-width: 1200px) {
    .lab-shell {
      grid-template-columns: 1fr;
    }

    .lab-log :global(.panel) {
      min-height: 24rem;
    }
  }
</style>
