<script lang="ts">
  import { formatFixed } from '../engine/fixed';
  import type { BattleUnit, ReplayTroopProfile } from '../engine/types';

  export let unit: BattleUnit | null = null;
  export let profile: ReplayTroopProfile | null = null;
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

  $: display = unit || profile
    ? {
        troopLabel: unit?.troopLabel ?? profile?.troopLabel ?? '',
        id: unit?.id ?? null,
        hp: unit?.hp ?? profile?.stats.health ?? 0,
        maxHp: unit?.maxHp ?? profile?.stats.health ?? 0,
        initiative: unit ? unit.initiative : null,
        role: unit?.role ?? profile?.role ?? 'frontline',
        position: unit?.position ?? null,
        type: unit?.type ?? profile?.type ?? '',
        attributes: unit?.attributes ?? profile?.attributes ?? [],
        side: unit?.side ?? profile?.side ?? 'player',
        stats: profile?.stats ?? null,
        abilities: profile?.abilities ?? [],
      }
    : null;
</script>

{#if display}
  <aside class="tooltip" class:docked={docked} style={docked ? '' : `left:${x + 14}px; top:${y - 10}px;`}>
    <header>
      <div>
        <p>{display.side === 'player' ? 'Player Unit' : 'Enemy Unit'}</p>
        <strong>{display.troopLabel}</strong>
      </div>
      {#if display.id}
        <small>{display.id}</small>
      {/if}
    </header>

    <div class="rows">
      <div><span>Health</span><b>{formatFixed(Math.max(0, display.hp))}/{formatFixed(Math.max(0, display.maxHp))}</b></div>
      <div><span>Role</span><b>{display.role}</b></div>
      {#if display.initiative !== null}
        <div><span>Initiative</span><b>{formatFixed(display.initiative)}</b></div>
      {/if}
      {#if display.position}
        <div><span>Hex</span><b>{display.position.q},{display.position.r}</b></div>
      {/if}
      {#if display.stats}
        <div><span>Damage</span><b>{formatFixed(display.stats.damage)}</b></div>
        <div><span>Armor</span><b>{formatFixed(display.stats.armor)}</b></div>
        <div><span>Speed</span><b>{formatFixed(display.stats.speed)}</b></div>
        <div><span>Range</span><b>{formatFixed(display.stats.range)}</b></div>
        <div><span>Size</span><b>{formatFixed(display.stats.size)}</b></div>
        <div><span>Capacity</span><b>{formatFixed(display.stats.capacity)}</b></div>
      {/if}
    </div>

    <div class="meta">
      <span>Type: {display.type}{display.attributes.length > 0 ? ` | Attributes: ${display.attributes.join(', ')}` : ''}</span>
      <span>{ROLE_DETAILS[display.role]}</span>
    </div>

    {#if display.stats}
      <div class="abilities">
        <span>Abilities</span>
        {#if display.abilities.length === 0}
          <small>None</small>
        {:else}
          <ul>
            {#each display.abilities as ability}
              <li>
                <strong>{ability.label}</strong>
                <small>{ability.shortText}</small>
              </li>
            {/each}
          </ul>
        {/if}
      </div>
    {/if}

    {#if display.id}
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
    {/if}

    {#if locked}
      <footer>Locked selection (click unit again to unlock)</footer>
    {/if}
  </aside>
{/if}

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
    display: flex;
    justify-content: space-between;
    gap: 0.75rem;
    align-items: start;
    margin-bottom: 0.65rem;
  }

  header p {
    margin: 0 0 0.15rem;
    font-size: 0.68rem;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: #9cb0bf;
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
  .engaged,
  .abilities {
    display: grid;
    gap: 0.22rem;
    color: #bfccd8;
    font-size: 0.75rem;
    margin-bottom: 0.35rem;
  }

  .engaged,
  .abilities {
    border-top: 1px solid #28384a;
    padding-top: 0.35rem;
  }

  .abilities ul,
  .engaged ul {
    margin: 0;
    padding-left: 1rem;
    display: grid;
    gap: 0.35rem;
  }

  .abilities li {
    display: grid;
    gap: 0.15rem;
  }

  .abilities li small {
    color: #9fb1bf;
  }

  footer {
    margin-top: 0.35rem;
    font-size: 0.7rem;
    color: #95a5b5;
  }
</style>
