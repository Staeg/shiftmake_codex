<script lang="ts">
  import { formatFixed } from '../engine/fixed';
  import type { BattleUnit, ExplainedStatKey, ReplayTroopProfile, StatBreakdown, StatBreakdownLine } from '../engine/types';
  import { formatAbilityExact, formatRoleExact, statIcon } from './inspectText';
  import StatBreakdownGrid from './StatBreakdownGrid.svelte';

  export let unit: BattleUnit | null = null;
  export let profile: ReplayTroopProfile | null = null;
  export let engagedUnits: BattleUnit[] = [];
  export let x = 0;
  export let y = 0;
  export let locked = false;
  export let docked = false;
  export let liveBuffLines: Partial<Record<ExplainedStatKey, StatBreakdownLine[]>> = {};
  let hoveredRoleText: { label: string; description: string } | null = null;
  let hoveredAbilityText: { label: string; description: string } | null = null;

  $: display = unit || profile
    ? {
        troopLabel: unit?.troopLabel ?? profile?.troopLabel ?? '',
        id: unit?.id ?? null,
        hp: unit?.hp ?? profile?.stats.health ?? 0,
        maxHp: unit?.maxHp ?? profile?.stats.health ?? 0,
        initiative: unit ? unit.initiative : null,
        role: unit?.role ?? profile?.role ?? 'frontline',
        type: unit?.type ?? profile?.type ?? '',
        attributes: unit?.attributes ?? profile?.attributes ?? [],
        side: unit?.side ?? profile?.side ?? 'player',
        stats: unit?.stats ?? profile?.stats ?? null,
        abilities: profile?.abilities ?? [],
      }
    : null;

  function mergedBreakdown(stat: ExplainedStatKey): StatBreakdown | null {
    if (!display || !profile) {
      return null;
    }

    const base = profile.statBreakdowns?.[stat] ?? null;
    const live = liveBuffLines[stat] ?? [];
    if (!base && live.length === 0) {
      return null;
    }

    const finalValue =
      stat === 'health'
        ? display.maxHp
        : stat === 'damage'
          ? display.stats?.damage ?? 0
          : stat === 'armor'
            ? display.stats?.armor ?? 0
            : stat === 'speed'
              ? display.stats?.speed ?? 0
              : stat === 'range'
                ? display.stats?.range ?? 0
                : stat === 'size'
                  ? display.stats?.size ?? 0
                  : display.stats?.capacity ?? 0;

    return {
      stat,
      finalValue,
      lines: [...(base?.lines ?? []), ...live],
    };
  }

  $: statEntries = display?.stats
    ? [
        { key: 'health' as const, label: statIcon('health'), value: `${formatFixed(Math.max(0, display.hp))}/${formatFixed(Math.max(0, display.maxHp))}`, breakdown: mergedBreakdown('health') },
        { key: 'damage' as const, label: statIcon('damage'), value: formatFixed(display.stats.damage), breakdown: mergedBreakdown('damage') },
        { key: 'armor' as const, label: statIcon('armor'), value: formatFixed(display.stats.armor), breakdown: mergedBreakdown('armor') },
        { key: 'speed' as const, label: statIcon('speed'), value: formatFixed(display.stats.speed), breakdown: mergedBreakdown('speed') },
        { key: 'range' as const, label: statIcon('range'), value: formatFixed(display.stats.range), breakdown: mergedBreakdown('range') },
        { key: 'size' as const, label: statIcon('size'), value: formatFixed(display.stats.size), breakdown: mergedBreakdown('size') },
        { key: 'capacity' as const, label: statIcon('capacity'), value: formatFixed(display.stats.capacity), breakdown: mergedBreakdown('capacity') },
      ]
    : [];
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
      <button
        type="button"
        class="inspect-chip"
        on:mouseenter={() => (hoveredRoleText = { label: display.role, description: formatRoleExact(display.role) })}
        on:focus={() => (hoveredRoleText = { label: display.role, description: formatRoleExact(display.role) })}
        on:mouseleave={() => (hoveredRoleText = null)}
        on:blur={() => (hoveredRoleText = null)}
      >
        <span>Role</span>
        <b>{display.role}</b>
      </button>
      {#if display.initiative !== null}
        <div><span>Initiative</span><b>{formatFixed(display.initiative)}</b></div>
      {/if}
    </div>

    {#if hoveredRoleText}
      <div class="inspect-tooltip role-tooltip">
        <strong>{hoveredRoleText.label}</strong>
        <p>{hoveredRoleText.description}</p>
      </div>
    {/if}

    {#if display.stats}
      <StatBreakdownGrid stats={statEntries} columns={2} />
    {/if}

    <div class="meta">
      <span>Type: {display.type}{display.attributes.length > 0 ? ` | Attributes: ${display.attributes.join(', ')}` : ''}</span>
    </div>

    {#if display.stats}
      <div class="abilities">
        <span>Abilities</span>
        {#if display.abilities.length === 0}
          <small>None</small>
        {:else}
          <div class="ability-chips">
            {#each display.abilities as ability}
              <button
                type="button"
                class="ability-chip"
                on:mouseenter={() => (hoveredAbilityText = { label: ability.label, description: formatAbilityExact(ability) })}
                on:focus={() => (hoveredAbilityText = { label: ability.label, description: formatAbilityExact(ability) })}
                on:mouseleave={() => (hoveredAbilityText = null)}
                on:blur={() => (hoveredAbilityText = null)}
              >
                {ability.label}
              </button>
            {/each}
          </div>
        {/if}
      </div>
    {/if}

    {#if hoveredAbilityText}
      <div class="inspect-tooltip">
        <strong>{hoveredAbilityText.label}</strong>
        <p>{hoveredAbilityText.description}</p>
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
    width: 256px;
    background: rgba(10, 15, 24, 0.96);
    border: 1px solid #3c5269;
    border-radius: 10px;
    padding: 0.38rem;
    color: #ecf2f9;
    z-index: 5;
    pointer-events: auto;
    box-shadow: 0 10px 28px rgba(0, 0, 0, 0.5);
  }

  .tooltip.docked {
    position: relative;
    width: 100%;
    max-width: 100%;
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
    gap: 0.45rem;
    align-items: start;
    margin-bottom: 0.35rem;
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
    gap: 0.18rem 0.28rem;
    margin-bottom: 0.28rem;
  }

  .rows div,
  .inspect-chip {
    display: flex;
    justify-content: space-between;
    background: rgba(22, 32, 44, 0.65);
    border: 1px solid #2f4155;
    border-radius: 6px;
    padding: 0.16rem 0.28rem;
    font-size: 0.7rem;
  }

  .inspect-chip {
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: help;
  }

  :global(.tooltip .stats-grid) {
    margin-bottom: 0.35rem;
  }

  .meta,
  .engaged,
  .abilities {
    display: grid;
    gap: 0.14rem;
    color: #bfccd8;
    font-size: 0.68rem;
    margin-bottom: 0.24rem;
  }

  .engaged,
  .abilities {
    border-top: 1px solid #28384a;
    padding-top: 0.24rem;
  }

  .engaged ul {
    margin: 0;
    padding-left: 1rem;
    display: grid;
    gap: 0.35rem;
  }

  .ability-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.22rem;
  }

  .ability-chip {
    padding: 0.18rem 0.42rem;
    border: 1px solid rgba(212, 173, 115, 0.24);
    border-radius: 999px;
    background: rgba(31, 24, 16, 0.82);
    color: #f1d7ae;
    font: inherit;
    font-size: 0.68rem;
    cursor: help;
  }

  .inspect-tooltip {
    display: grid;
    gap: 0.25rem;
    padding-top: 0.24rem;
    border-top: 1px solid #28384a;
    color: #bfccd8;
    font-size: 0.68rem;
  }

  .inspect-tooltip p {
    margin: 0;
  }

  .role-tooltip {
    margin-top: -0.1rem;
    margin-bottom: 0.28rem;
  }

  footer {
    margin-top: 0.24rem;
    font-size: 0.66rem;
    color: #95a5b5;
  }
</style>
