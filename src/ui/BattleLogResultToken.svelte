<script lang="ts">
  import type { BattleOutcome } from '../engine/types';
  import type { MiniReplayHealthTone } from './RiftBattleMiniReplay.svelte';

  export let outcome: BattleOutcome = 'draw';
  export let opponentOutcome = false;
  export let leftPercent = 0;
  export let rightPercent = 0;
  export let leftTone: MiniReplayHealthTone = 'neutral';
  export let rightTone: MiniReplayHealthTone = 'player';

  $: clampedLeft = Math.max(0, Math.min(100, leftPercent));
  $: clampedRight = Math.max(0, Math.min(100, rightPercent));
  $: leftLabel = leftTone === 'player' ? 'You' : leftTone === 'opponent' ? 'Rival' : 'Neutral';
  $: rightLabel = rightTone === 'player' ? 'You' : rightTone === 'opponent' ? 'Rival' : 'Neutral';
</script>

<span class="battle-log-token" aria-hidden="true">
  <span class={`battle-log-health ${leftTone}`}>
    <em>{leftLabel}</em>
    <span style={`--health-width:${clampedLeft}%`}></span>
  </span>
  <span class="battle-log-result">
    {#if opponentOutcome}
      <span class="swap-arrow">&lt;-&gt;</span>
    {:else}
      <svg class={`result-icon ${outcome}`} viewBox="0 0 64 64">
        {#if outcome === 'victory'}
          <path d="M12 47h40l-4 9H16l-4-9Z" />
          <path d="M15 42 10 16l15 13 7-18 7 18 15-13-5 26H15Z" />
        {:else if outcome === 'defeat'}
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
    {/if}
  </span>
  <span class={`battle-log-health ${rightTone}`}>
    <em>{rightLabel}</em>
    <span style={`--health-width:${clampedRight}%`}></span>
  </span>
</span>

<style>
  .battle-log-token {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 2.1rem minmax(0, 1fr);
    align-items: center;
    gap: 0.48rem;
    width: 100%;
    min-width: 0;
    min-height: 2.35rem;
    padding: 0.42rem 0.55rem;
    border: 1px solid rgba(132, 158, 178, 0.18);
    border-radius: 8px;
    background:
      linear-gradient(90deg, rgba(17, 28, 36, 0.9), rgba(8, 13, 20, 0.86) 50%, rgba(17, 28, 36, 0.9)),
      rgba(8, 13, 20, 0.88);
    box-shadow: inset 0 0 16px rgba(0, 0, 0, 0.24);
  }

  .battle-log-health {
    display: grid;
    gap: 0.18rem;
    height: auto;
    min-width: 0;
    overflow: hidden;
    color: #9fb0bf;
    font-size: 0.56rem;
    font-style: normal;
    font-weight: 800;
    line-height: 1;
    text-transform: uppercase;
  }

  .battle-log-health em {
    overflow: hidden;
    color: inherit;
    font-style: normal;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .battle-log-health > span {
    display: block;
    height: 0.42rem;
    min-width: 0.18rem;
    overflow: hidden;
    border: 1px solid rgba(185, 205, 216, 0.22);
    border-radius: 999px;
    background: rgba(4, 7, 10, 0.72);
  }

  .battle-log-health > span::before {
    display: block;
    width: var(--health-width, 0%);
    height: 100%;
    border-radius: inherit;
    content: '';
  }

  .battle-log-health.player > span::before {
    background: linear-gradient(90deg, #4fa666, #a7dd6d);
  }

  .battle-log-health.opponent > span::before {
    background: linear-gradient(90deg, #c84f5b, #f2a06d);
  }

  .battle-log-health.neutral > span::before {
    background: linear-gradient(90deg, #68727c, #b6c0c8);
  }

  .battle-log-result {
    display: grid;
    place-items: center;
    min-width: 0;
  }

  .swap-arrow {
    color: #dbe8f3;
    font-family: var(--ui-font-mono);
    font-size: 0.78rem;
    font-weight: 900;
    line-height: 1;
    text-shadow: 0 1px 3px #020406;
  }

  .result-icon {
    width: 1.45rem;
    height: 1.45rem;
    fill: #f4e7c6;
    filter:
      drop-shadow(0 1px 2px rgba(0, 0, 0, 0.7))
      drop-shadow(0 0 7px rgba(242, 205, 128, 0.34));
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
</style>
