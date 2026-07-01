<script lang="ts">
  import { formatFixed } from '../engine/fixed';
  import { getSummonedUnitPreviews } from '../engine/unitCatalog';
  import type { AbilityDefinition, BattleUnit, ExplainedStatKey, RaceId, ReplayTroopProfile, StatBreakdown, StatBreakdownLine, UnitClassId } from '../engine/types';
  import { formatAbilityDescription, statIcon } from './inspectText';
  import GameIcon from './GameIcon.svelte';
  import StatBreakdownGrid from './StatBreakdownGrid.svelte';

  export let unit: BattleUnit | null = null;
  export let profile: ReplayTroopProfile | null = null;
  export let engagedUnits: BattleUnit[] = [];
  export let getUnitPortraitUrl: ((unit: BattleUnit) => string) | null = null;
  export let getRaceUnitPortraitUrl: ((raceId: RaceId, unitClassId: UnitClassId) => string) | null = null;
  export let x = 0;
  export let y = 0;
  export let locked = false;
  export let lastActionStep: number | null = null;
  export let nextActionStep: number | null = null;
  export let onGoToLastAction: (() => void) | null = null;
  export let onGoToNextAction: (() => void) | null = null;
  export let docked = false;
  export let liveBuffLines: Partial<Record<ExplainedStatKey, StatBreakdownLine[]>> = {};
  export let onHoverStat: ((key: string) => void) | null = null;
  export let onHoverAbility: (() => void) | null = null;
  export let onPreviousAction: (() => void) | null = null;
  export let onNextAction: (() => void) | null = null;
  let hoveredAbilityText: { label: string; description: string } | null = null;
  let hoveredSummonProfile: ReplayTroopProfile | null = null;

  $: display = unit || profile
    ? {
        troopLabel: unit?.troopLabel ?? profile?.troopLabel ?? '',
        hp: unit?.hp ?? profile?.stats.health ?? 0,
        maxHp: unit?.maxHp ?? profile?.stats.health ?? 0,
        readiness: unit ? unit.readiness : null,
        role: unit?.role ?? profile?.role ?? 'frontline',
        raceId: unit?.raceId ?? profile?.raceId ?? '',
        unitClassId: unit?.unitClassId ?? profile?.unitClassId ?? '',
        unitClassTag: unit?.unitClassTag ?? profile?.unitClassTag ?? '',
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
            : stat === 'rate'
              ? display.stats?.rate ?? 0
              : stat === 'move'
                ? display.stats?.move ?? 0
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
        { key: 'rate' as const, label: statIcon('rate'), value: formatFixed(display.stats.rate), breakdown: mergedBreakdown('rate') },
        { key: 'move' as const, label: statIcon('move'), value: formatFixed(display.stats.move), breakdown: mergedBreakdown('move') },
        { key: 'range' as const, label: statIcon('range'), value: formatFixed(display.stats.range), breakdown: mergedBreakdown('range') },
      ]
    : [];

  function resolveUnitPortrait(unit: BattleUnit): string {
    return getUnitPortraitUrl?.(unit) ?? '';
  }

  $: displayPortraitUrl =
    display && display.raceId && display.unitClassId
      ? (unit ? resolveUnitPortrait(unit) : getRaceUnitPortraitUrl?.(display.raceId, display.unitClassId) ?? '')
      : '';

  function summonRaceId(): string {
    return profile?.raceId ?? unit?.raceId ?? 'human';
  }

  function buildSummonProfile(ability: AbilityDefinition, unitClassId: string, grantedKey: string): ReplayTroopProfile | null {
    if (!display) {
      return null;
    }
    const preview = getSummonedUnitPreviews(ability, summonRaceId())
      .find((entry) => entry.unitClassId === unitClassId && entry.grantedAbilityIds.join(',') === grantedKey);
    if (!preview) {
      return null;
    }
    const statBreakdowns = Object.fromEntries(
      (['health', 'damage', 'rate', 'move', 'armor', 'range', 'capacity', 'size'] as const).map((stat) => [
        stat,
        { stat, finalValue: preview.troop.stats[stat], lines: [{ label: 'Summoned', value: preview.troop.stats[stat], kind: 'base' as const }] },
      ]),
    ) as ReplayTroopProfile['statBreakdowns'];
    return {
      side: display.side,
      troopLabel: preview.troop.label,
      unitClassId: preview.troop.unitClassId,
      raceId: preview.troop.raceId,
      role: preview.troop.role,
      unitClassTag: preview.troop.unitClassTag,
      attributes: preview.troop.attributes,
      stats: preview.troop.stats,
      abilities: preview.troop.abilities,
      statBreakdowns,
    };
  }
</script>

{#if display}
  <aside class="tooltip" class:docked={docked} style={docked ? '' : `left:${x + 14}px; top:${y - 10}px;`}>
    <header>
      <div>
        <p>{display.side === 'player' ? 'Player Unit' : 'Enemy Unit'}</p>
        <strong>{display.troopLabel}</strong>
      </div>
      {#if displayPortraitUrl}
        <img
          class="unit-portrait"
          class:enemy={display.side === 'enemy'}
          src={displayPortraitUrl}
          alt=""
          aria-hidden="true"
        />
      {/if}
    </header>

    <div class="rows">
      {#if display.readiness !== null}
        <div><span>Readiness</span><b>{formatFixed(display.readiness)}</b></div>
      {/if}
    </div>

    {#if display.stats}
      <StatBreakdownGrid stats={statEntries} columns={3} {onHoverStat} />
    {/if}

    <div class="meta">
      <span>Class: {display.unitClassTag}</span>
    </div>

    {#if display.stats}
      <div class="abilities">
        <span>Abilities</span>
        {#if display.abilities.length === 0}
          <small>None</small>
        {:else}
          <div class="ability-chips">
            {#each display.abilities as ability}
              {@const summonPreviews = getSummonedUnitPreviews(ability, summonRaceId())}
              <button
                type="button"
                class="ability-chip"
                on:mouseenter={() => {
                  hoveredAbilityText = { label: ability.label, description: formatAbilityDescription(ability) };
                  onHoverAbility?.();
                }}
                on:focus={() => {
                  hoveredAbilityText = { label: ability.label, description: formatAbilityDescription(ability) };
                  onHoverAbility?.();
                }}
                on:mouseleave={() => (hoveredAbilityText = null)}
                on:blur={() => (hoveredAbilityText = null)}
              >
                <span class="icon-label"><GameIcon kind="ability" id={ability.id} label={ability.label} /><span>{ability.label}</span></span>
              </button>
              {#each summonPreviews as summon}
                <button
                  type="button"
                  class="ability-chip summon-preview-chip"
                  on:mouseenter={() => (hoveredSummonProfile = buildSummonProfile(ability, summon.unitClassId, summon.grantedAbilityIds.join(',')))}
                  on:focus={() => (hoveredSummonProfile = buildSummonProfile(ability, summon.unitClassId, summon.grantedAbilityIds.join(',')))}
                  on:mouseleave={() => (hoveredSummonProfile = null)}
                  on:blur={() => (hoveredSummonProfile = null)}
                >
                  <span>{summon.count} {summon.troop.label}</span>
                </button>
              {/each}
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

    {#if hoveredSummonProfile}
      <div class="inspect-tooltip summon-profile">
        <strong>{hoveredSummonProfile.troopLabel}</strong>
        <p>Summoned unit.</p>
        <StatBreakdownGrid
          stats={[
            { key: 'health', label: statIcon('health'), value: formatFixed(hoveredSummonProfile.stats.health), breakdown: hoveredSummonProfile.statBreakdowns.health },
            { key: 'damage', label: statIcon('damage'), value: formatFixed(hoveredSummonProfile.stats.damage), breakdown: hoveredSummonProfile.statBreakdowns.damage },
            { key: 'rate', label: statIcon('rate'), value: formatFixed(hoveredSummonProfile.stats.rate), breakdown: hoveredSummonProfile.statBreakdowns.rate },
            { key: 'move', label: statIcon('move'), value: formatFixed(hoveredSummonProfile.stats.move), breakdown: hoveredSummonProfile.statBreakdowns.move },
            { key: 'armor', label: statIcon('armor'), value: formatFixed(hoveredSummonProfile.stats.armor), breakdown: hoveredSummonProfile.statBreakdowns.armor },
          ]}
          columns={3}
        />
      </div>
    {/if}

    {#if unit}
      <div class="engaged">
        <span>Engaged With ({engagedUnits.length})</span>
        {#if engagedUnits.length === 0}
          <small>None</small>
        {:else}
          <div class="engaged-sprites">
            {#each engagedUnits as other}
              <div class="engaged-sprite" title={other.troopLabel}>
                <img src={resolveUnitPortrait(other)} alt={other.troopLabel} />
              </div>
            {/each}
          </div>
        {/if}
      </div>
    {/if}

    {#if locked}
      <div class="action-nav">
        <div class="action-buttons">
          <button
            type="button"
            class="action-button"
            data-tutorial-target="unit-previous-action"
            disabled={lastActionStep === null}
            on:click={() => {
              onGoToLastAction?.();
              onPreviousAction?.();
            }}
          >
            &lt;- Unit's Previous Action
          </button>
          <button
            type="button"
            class="action-button"
            data-tutorial-target="unit-next-action"
            disabled={nextActionStep === null}
            on:click={() => {
              onGoToNextAction?.();
              onNextAction?.();
            }}
          >
            Unit's Next Action -&gt;
          </button>
        </div>
      </div>
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

  header strong {
    display: block;
    padding-right: 0.2rem;
    overflow-wrap: anywhere;
  }

  .unit-portrait {
    flex: 0 0 auto;
    width: 2.15rem;
    height: 2.15rem;
    object-fit: contain;
    image-rendering: pixelated;
    filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.42));
  }

  .unit-portrait.enemy {
    transform: scaleX(-1);
  }

  .rows {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.18rem 0.28rem;
    margin-bottom: 0.28rem;
  }

  .rows div {
    display: flex;
    justify-content: space-between;
    background: rgba(22, 32, 44, 0.65);
    border: 1px solid #2f4155;
    border-radius: 6px;
    padding: 0.16rem 0.28rem;
    font-size: 0.7rem;
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

  .engaged-sprites {
    display: flex;
    flex-wrap: wrap;
    gap: 0.22rem;
    align-items: center;
  }

  .engaged-sprite {
    width: 1.25rem;
    height: 1.25rem;
    display: grid;
    place-items: center;
    border-radius: 4px;
    border: 1px solid rgba(146, 170, 192, 0.16);
    background: rgba(14, 20, 29, 0.72);
    overflow: hidden;
  }

  .engaged-sprite img {
    width: 100%;
    height: 100%;
    object-fit: contain;
    image-rendering: pixelated;
  }

  .action-nav {
    display: grid;
    gap: 0.18rem;
    margin-top: 0.08rem;
    padding-top: 0.24rem;
    border-top: 1px solid #28384a;
    color: #bfccd8;
    font-size: 0.68rem;
  }

  .action-buttons {
    display: flex;
    gap: 0.24rem;
    flex-wrap: wrap;
  }

  .action-button {
    flex: 1 1 0;
    padding: 0.18rem 0.35rem;
    border: 1px solid rgba(212, 173, 115, 0.24);
    border-radius: 999px;
    background: rgba(31, 24, 16, 0.82);
    color: #f1d7ae;
    font: inherit;
    font-size: 0.66rem;
    cursor: pointer;
  }

  .action-button:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .ability-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.22rem;
  }

  .ability-chip {
    display: inline-flex;
    align-items: center;
    gap: 0.28rem;
    padding: 0.18rem 0.42rem;
    border: 1px solid rgba(212, 173, 115, 0.24);
    border-radius: 999px;
    background: rgba(31, 24, 16, 0.82);
    color: #f1d7ae;
    font: inherit;
    font-size: 0.68rem;
    cursor: help;
  }

  .icon-label {
    display: inline-flex;
    align-items: center;
    gap: 0.28rem;
    min-width: 0;
  }

  .ability-chip :global(.game-icon) {
    --game-icon-size: 1.43rem;
  }

  .ability-chip :global(.game-icon.raster-icon) {
    --game-icon-raster-scale: 1.45;
  }

  .summon-preview-chip {
    border-color: rgba(215, 221, 230, 0.34);
    background: rgba(28, 34, 42, 0.82);
    color: #d7dde6;
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

</style>
