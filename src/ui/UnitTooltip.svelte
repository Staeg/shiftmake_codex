<script lang="ts">
  import { formatFixed } from '../engine/fixed';
  import type { BattleUnit } from '../engine/types';

  export let unit: BattleUnit;
  export let engagedUnits: BattleUnit[] = [];
  export let x = 0;
  export let y = 0;
  export let locked = false;
  export let docked = false;

  const ROLE_DETAILS: Record<string, string> = {
    frontline: 'Frontline troops close distance and try to tie enemies up in engagements.',
    chaff: 'Chaff units swarm vulnerable targets and reinforce crowded hexes.',
    backline: 'Backline units prefer space, ranged attacks, and careful retreating.',
  };
</script>

<aside class="tooltip" class:docked={docked} style={docked ? '' : `left:${x + 14}px; top:${y - 10}px;`}>
  <header>
    <strong>{unit.troopLabel}</strong>
    <small>{unit.id}</small>
  </header>

  <div class="rows">
    <div><span>Health</span><b>{formatFixed(Math.max(0, unit.hp))}/{formatFixed(Math.max(0, unit.maxHp))}</b></div>
    <div><span>Initiative</span><b>{formatFixed(unit.initiative)}</b></div>
    <div><span>Role</span><b>{unit.role}</b></div>
    <div><span>Hex</span><b>{unit.position.q},{unit.position.r}</b></div>
  </div>

  <div class="meta">
    <span>Types: {unit.types.join(', ')}</span>
    <span>{ROLE_DETAILS[unit.role]}</span>
  </div>

  <div class="engaged">
    <span>Engaged With ({engagedUnits.length})</span>
    {#if engagedUnits.length === 0}
      <small>None</small>
    {:else}
      <ul>
        {#each engagedUnits as other}
          <li>{other.troopLabel}</li>
        {/each}
      </ul>
    {/if}
  </div>

  {#if locked}
    <footer>Locked selection (click unit again to unlock)</footer>
  {/if}
</aside>

<style>
  .tooltip {
    position: absolute;
    width: 280px;
    background: rgba(10, 15, 24, 0.96);
    border: 1px solid #3c5269;
    border-radius: 10px;
    padding: 0.55rem;
    color: #ecf2f9;
    z-index: 5;
    pointer-events: auto;
    box-shadow: 0 10px 28px rgba(0, 0, 0, 0.5);
  }

  .tooltip.docked {
    position: relative;
    width: 100%;
    left: auto;
    top: auto;
    z-index: 1;
    box-shadow: none;
    background: linear-gradient(145deg, rgba(20, 24, 32, 0.95), rgba(11, 13, 18, 0.95));
    border-color: #2f3b49;
  }

  header {
    display: grid;
    margin-bottom: 0.45rem;
  }

  header small {
    color: #90a2b4;
    font-size: 0.72rem;
  }

  .rows {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.28rem 0.45rem;
    margin-bottom: 0.45rem;
  }

  .rows div {
    display: flex;
    justify-content: space-between;
    background: rgba(22, 32, 44, 0.65);
    border: 1px solid #2f4155;
    border-radius: 6px;
    padding: 0.2rem 0.35rem;
    font-size: 0.78rem;
  }

  .meta,
  .engaged {
    display: grid;
    gap: 0.22rem;
    color: #bfccd8;
    font-size: 0.75rem;
    margin-bottom: 0.35rem;
  }

  .engaged {
    border-top: 1px solid #28384a;
    padding-top: 0.35rem;
  }

  ul {
    margin: 0;
    padding-left: 1rem;
  }

  footer {
    margin-top: 0.35rem;
    font-size: 0.7rem;
    color: #95a5b5;
  }
</style>
