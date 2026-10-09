<script lang="ts" context="module">
  import type { RaceId, TroopUnlockId } from '../engine/types';
  export interface ScheduledUnlockActions {
    disabled: boolean;
    waitingLabel: string | null;
    claimRace(raceId: RaceId): void;
    claimTroop(troopUnlockId: TroopUnlockId): void;
  }
</script>

<script lang="ts">
  import type { GameState, RaceId, UnitClassId, TroopUnlockId, UpgradeId, RaceUnlockOffer } from '../engine/types';
  import { createTroopInstance, resolveTroopCombatant } from '../engine/army';
  import { getRace, getRaceNativeTroopUnlockIds, getUnitClass, isNativeTroopUnlockId } from '../engine/unitCatalog';
  import { buildRaceDetail, buildUpgradeDetail, getUpgradeDetails, buildResolvedUnitDetail as buildUnitDetail, getDetailInspectLabel,
    parseTroopUnlockId, unitIconColumns, unitIconCopies, unitIconDensityClass, type DetailCard } from './detailCards';
  import GameIcon from './GameIcon.svelte';
  import InlineStatText from './InlineStatText.svelte';
  import StatBreakdownGrid from './StatBreakdownGrid.svelte';

  export let game: GameState;
  export let actions: ScheduledUnlockActions;
  export let getRacePortrait: (raceId: RaceId) => string;
  export let getRaceUnitPortrait: (raceId: RaceId, unitClassId: UnitClassId) => string;

  let selectedScheduledRaceId: RaceId | null = null;
  let lastRaceOffer: RaceUnlockOffer | null = null;
  $: if (game.activeRaceUnlockOffer !== lastRaceOffer) {
    lastRaceOffer = game.activeRaceUnlockOffer;
    selectedScheduledRaceId = null;
    resetInspection();
  }

  let hoveredDetail: DetailCard | null = null;
  let pinnedDetails: DetailCard[] = [];
  let abilityTooltip: { label: string; description: string; ownerDetailKey: string } | null = null;

  $: activeDetail = pinnedDetails[0] ?? hoveredDetail ?? null;
  $: highlightedDetailKeys = new Set([...pinnedDetails.map((detail) => detail.detailKey), ...(hoveredDetail ? [hoveredDetail.detailKey] : [])]);

  function buildResolvedUnitDetail(
    detailKey: string, label: string, raceId: RaceId, unitClassId: UnitClassId,
    stats: Parameters<typeof buildUnitDetail>[0]['stats'], quantity: number,
    description: string, abilities: Parameters<typeof buildUnitDetail>[0]['abilities'],
  ): DetailCard {
    return buildUnitDetail({ detailKey, label, raceId, unitClassId, stats, quantity, description, abilities, getRaceUnitPortrait });
  }

  function previewDetail(detail: DetailCard): void {
    if (detail.kind === 'unit' && pinnedDetails.filter((entry) => entry.kind === 'unit').length >= 2) return;
    hoveredDetail = detail;
  }

  function togglePinnedDetail(detail: DetailCard): void {
    const existingIndex = pinnedDetails.findIndex((entry) => entry.detailKey === detail.detailKey);
    if (existingIndex >= 0) pinnedDetails = pinnedDetails.filter((_, index) => index !== existingIndex);
    else if (pinnedDetails.length === 0) pinnedDetails = [detail];
    else pinnedDetails = [pinnedDetails[0]!, detail];
    hoveredDetail = null;
    abilityTooltip = null;
  }

  function clearDetail(): void {
    hoveredDetail = null;
    abilityTooltip = null;
  }

  export function resetInspection(): void {
    hoveredDetail = null;
    pinnedDetails = [];
    abilityTooltip = null;
  }

  function detailIsHighlighted(detailKey: string): boolean { return highlightedDetailKeys.has(detailKey); }

  function openAbilityDisclosure(event: MouseEvent | FocusEvent, ability: { label: string; description: string }, ownerDetailKey: string): void {
    const target = event.currentTarget;
    if (target instanceof HTMLElement) {
      const disclosure = target.closest('details');
      if (disclosure instanceof HTMLDetailsElement) disclosure.open = true;
    }
    abilityTooltip = { ...ability, ownerDetailKey };
  }

  function activeAbilityTooltipFor(ownerDetailKey: string) {
    return abilityTooltip?.ownerDetailKey === ownerDetailKey ? abilityTooltip : null;
  }

  function getScheduledRaceRosterUnlockIds(raceId: RaceId): TroopUnlockId[] {
    const offered = game.activeRaceUnlockOffer?.troopUnlockIdsByRaceId[raceId] ?? [];
    return [...new Set([...getRaceNativeTroopUnlockIds(raceId), ...offered])];
  }

  function buildScheduledTroopDetail(troopUnlockId: TroopUnlockId, grantedUpgradeIds: UpgradeId[], description: string): DetailCard {
    const [raceId, unitClassId] = parseTroopUnlockId(troopUnlockId);
    const previewState = {
      raceUpgradeIds: [...new Set([...game.raceUpgradeIds, ...grantedUpgradeIds])],
      troopClassUpgradeIds: game.troopClassUpgradeIds,
    };
    const troopDef = resolveTroopCombatant(previewState, createTroopInstance(raceId, unitClassId), 'player');
    return buildUnitDetail({
      detailKey: `scheduled-race:${troopUnlockId}:${grantedUpgradeIds.join(',')}`,
      label: troopDef.label, raceId, unitClassId, stats: troopDef.stats,
      quantity: troopDef.quantity, description, abilities: troopDef.abilities,
      statBreakdowns: troopDef.statBreakdowns, getRaceUnitPortrait,
    });
  }

  function selectScheduledRaceUnlock(raceId: RaceId): void {
    selectedScheduledRaceId = selectedScheduledRaceId === raceId ? null : raceId;
  }

  function confirmScheduledRaceUnlock(): void {
    if (actions.disabled || !selectedScheduledRaceId || !game.activeRaceUnlockOffer?.optionRaceIds.includes(selectedScheduledRaceId)) return;
    actions.claimRace(selectedScheduledRaceId);
    selectedScheduledRaceId = null;
  }

  function chooseTroopClassUnlock(troopUnlockId: TroopUnlockId): void {
    if (!actions.disabled) actions.claimTroop(troopUnlockId);
  }
</script>

{#if game.phase === 'race_unlock' && game.activeRaceUnlockOffer}
<main class="draft-screen">
    <section class="draft-panel opening-shell scheduled-race-shell ui-debug-target" data-ui-name="Scheduled race unlock screen">
      <div class="draft-screen-header">
        <p class="eyebrow">Cycle {game.cycleNumber} Muster</p>
        <h1>Choose a Race</h1>
        <p class="scheduled-unlock-instructions">Shown upgrades and included troops unlock immediately. The roster below shows what this race can unlock later.</p>
        <slot name="session" />
      </div>

      <div class="draft-layout scheduled-race-layout" class:has-detail={!!activeDetail}>
        <aside class="panel draft-focus-panel ui-debug-target" class:empty={!activeDetail} data-ui-name="Scheduled race detail panel" role="presentation" on:mouseleave={clearDetail}>
          {#if activeDetail}
            <div class="detail-panel opening-detail-panel">
              {#if activeDetail.kind !== 'unit'}
                <p class="eyebrow">
                  {getDetailInspectLabel(activeDetail)}
                </p>
              {/if}
              <h2 class="detail-title">{#if activeDetail.iconKind && activeDetail.iconId}<GameIcon kind={activeDetail.iconKind} id={activeDetail.iconId} label={activeDetail.label} />{/if}<span>{activeDetail.label}</span></h2>
              {#if activeDetail.kind === 'unit'}
                {@const abilityOwnerKey = activeDetail.detailKey}
                <div class="unit-overview-strip">
                  <span class={`unit-icon-cluster detail-unit-cluster ${unitIconDensityClass(activeDetail.quantity)}`} style={`--unit-cluster-columns:${unitIconColumns(activeDetail.quantity)}`} aria-label={`${activeDetail.quantity} units in troop`}>
                    {#each unitIconCopies(activeDetail.quantity) as copy}
                      <img class="hover-unit-art" src={activeDetail.portraitUrl} alt="" aria-hidden={copy === 0 ? 'false' : 'true'} />
                    {/each}
                  </span>
                  <StatBreakdownGrid stats={activeDetail.stats} columns={3} compact={true} />
                </div>
                <div class="ability-row detail-ability-row">
                  <span>Abilities</span>
                  <div class="ability-list">
                    {#if activeDetail.abilities.length === 0}
                      <span class="mutator-chip empty">None</span>
                    {:else}
                      {#each activeDetail.abilities as ability}
                        <details class="ability-disclosure">
                          <summary
                            class="mutator-chip ability-chip"
                            on:mouseenter={(event) => openAbilityDisclosure(event, ability, abilityOwnerKey)}
                            on:focus={(event) => openAbilityDisclosure(event, ability, abilityOwnerKey)}
                            on:click|preventDefault={(event) => openAbilityDisclosure(event, ability, abilityOwnerKey)}
                          >
                            <span class="icon-label"><GameIcon kind="ability" id={ability.id} label={ability.label} /><span>{ability.label}</span></span>
                          </summary>
                          <div class="ability-hover-tooltip">
                            <strong>{ability.label}</strong>
                            <p><InlineStatText text={ability.description} /></p>
                          </div>
                        </details>
                      {/each}
                    {/if}
                  </div>
                  {#if activeAbilityTooltipFor(activeDetail.detailKey)}
                    <div class="ability-hover-tooltip">
                      <strong>{activeAbilityTooltipFor(activeDetail.detailKey)?.label}</strong>
                      <p><InlineStatText text={activeAbilityTooltipFor(activeDetail.detailKey)?.description ?? ''} /></p>
                    </div>
                  {/if}
                </div>
              {:else}
                {#if activeDetail.description}
                  <p><InlineStatText text={activeDetail.description} /></p>
                {/if}
                {#if activeDetail.stats && activeDetail.stats.length > 0}
                  <StatBreakdownGrid stats={activeDetail.stats} columns={3} />
                {/if}
              {/if}
            </div>
          {/if}
        </aside>

        <div class="draft-grid race-unlock-grid">
          {#each game.activeRaceUnlockOffer.optionRaceIds as raceId}
            {@const race = getRace(raceId)}
            {@const raceDetail = buildRaceDetail(raceId)}
            {@const grantedUpgradeIds = game.activeRaceUnlockOffer.upgradeIdsByRaceId[raceId] ?? []}
            {@const grantedTroopUnlockIds = game.activeRaceUnlockOffer.troopUnlockIdsByRaceId?.[raceId] ?? []}
            {@const rosterTroopUnlockIds = getScheduledRaceRosterUnlockIds(raceId)}
            <article
              class="draft-card panel race-unlock-card ui-debug-target"
              class:selected={selectedScheduledRaceId === raceId}
              data-ui-name={`Race unlock option ${race.label}`}
            >
              <button
                type="button"
                class="race-card-select-button"
                class:selected={selectedScheduledRaceId === raceId}
                aria-label={`Select ${race.label}`}
                aria-pressed={selectedScheduledRaceId === raceId}
                disabled={actions.disabled}
                on:click={() => selectScheduledRaceUnlock(raceId)}
              ></button>
              <header class="draft-card-header">
                <div class="draft-card-title">
                  <strong>{race.label}</strong>
                  <button
                    type="button"
                    class="sprite-inspect-button"
                    class:selected={detailIsHighlighted(raceDetail.detailKey)}
                    aria-label={`Inspect ${race.label} race modifiers`}
                    on:mouseenter={() => previewDetail(raceDetail)}
                    on:focus={() => previewDetail(raceDetail)}
                    on:mouseleave={clearDetail}
                    on:blur={clearDetail}
                    on:click|stopPropagation={() => selectScheduledRaceUnlock(raceId)}
                  >
                    <img class="race-name-art" src={getRacePortrait(raceId)} alt="" aria-hidden="true" />
                  </button>
                </div>
              </header>

              <div class="draft-section scheduled-included-section">
                <span class="draft-section-label">Included troops</span>
                <div class="draft-icon-row troop-preview-row included-troop-row">
                  {#each grantedTroopUnlockIds as troopUnlockId}
                    {@const [includedRaceId, includedUnitClassId] = parseTroopUnlockId(troopUnlockId)}
                    {@const troopDetail = buildScheduledTroopDetail(
                      troopUnlockId,
                      grantedUpgradeIds,
                      `Included troop unlocked immediately when ${getRace(includedRaceId).label} joins.`,
                    )}
                    <button
                      type="button"
                      class="draft-troop-icon troop-preview included-troop-preview"
                      class:selected={detailIsHighlighted(troopDetail.detailKey)}
                      aria-label={`Inspect included troop ${troopDetail.label}`}
                      on:mouseenter={() => previewDetail(troopDetail)}
                      on:focus={() => previewDetail(troopDetail)}
                      on:mouseleave={clearDetail}
                      on:blur={clearDetail}
                      on:click|stopPropagation={() => togglePinnedDetail(troopDetail)}
                    >
                      <span class={`unit-icon-cluster chip-unit-cluster ${unitIconDensityClass(troopDetail.kind === 'unit' ? troopDetail.quantity : 1)}`} style={`--unit-cluster-columns:${unitIconColumns(troopDetail.kind === 'unit' ? troopDetail.quantity : 1)}`} aria-label={troopDetail.kind === 'unit' ? `${troopDetail.quantity} ${troopDetail.label} units` : troopDetail.label}>
                        {#each unitIconCopies(troopDetail.kind === 'unit' ? troopDetail.quantity : 1) as copy}
                          <img class="unit-button-art" src={getRaceUnitPortrait(includedRaceId, includedUnitClassId)} alt="" aria-hidden={copy === 0 ? 'false' : 'true'} />
                        {/each}
                      </span>
                    </button>
                  {/each}
                </div>
              </div>

              <div class="draft-section">
                <span class="draft-section-label">Granted upgrades</span>
                <div class="unlock-row">
                  {#each grantedUpgradeIds as upgradeId}
                    {@const upgradeDetail = buildUpgradeDetail(upgradeId)}
                    <button
                      type="button"
                      class="list-button upgrade-grant"
                      class:selected={detailIsHighlighted(upgradeDetail.detailKey)}
                      on:mouseenter={() => previewDetail(upgradeDetail)}
                      on:focus={() => previewDetail(upgradeDetail)}
                      on:mouseleave={clearDetail}
                      on:blur={clearDetail}
                      on:click|stopPropagation={() => selectScheduledRaceUnlock(raceId)}
                    >
                      <span class="icon-label"><GameIcon kind="upgrade" id={upgradeId} label={getUpgradeDetails(upgradeId).label} /><span>{getUpgradeDetails(upgradeId).label}</span></span>
                    </button>
                  {/each}
                </div>
              </div>

              <div class="draft-section">
                <span class="draft-section-label">Troop roster</span>
                <div class="draft-icon-row troop-preview-row">
                  {#each rosterTroopUnlockIds as troopUnlockId}
                    {@const [rosterRaceId, rosterUnitClassId] = parseTroopUnlockId(troopUnlockId)}
                    {@const isGrantedTroop = grantedTroopUnlockIds.includes(troopUnlockId)}
                    {@const troopDetail = buildScheduledTroopDetail(
                      troopUnlockId,
                      grantedUpgradeIds,
                      isGrantedTroop
                        ? `Included troop unlocked immediately when ${getRace(rosterRaceId).label} joins.`
                        : `${getRace(rosterRaceId).singularLabel} recruit shown as later unlock potential.`,
                    )}
                    {#if !isGrantedTroop}
                      <button
                        type="button"
                        class="draft-troop-icon troop-preview"
                        class:future={!isNativeTroopUnlockId(troopUnlockId)}
                        class:selected={detailIsHighlighted(troopDetail.detailKey)}
                        aria-label={`Inspect ${troopDetail.label}`}
                        title={getUnitClass(rosterUnitClassId).label}
                        on:mouseenter={() => previewDetail(troopDetail)}
                        on:focus={() => previewDetail(troopDetail)}
                        on:mouseleave={clearDetail}
                        on:blur={clearDetail}
                        on:click|stopPropagation={() => togglePinnedDetail(troopDetail)}
                      >
                        <span class={`unit-icon-cluster chip-unit-cluster ${unitIconDensityClass(troopDetail.kind === 'unit' ? troopDetail.quantity : 1)}`} style={`--unit-cluster-columns:${unitIconColumns(troopDetail.kind === 'unit' ? troopDetail.quantity : 1)}`} aria-label={troopDetail.kind === 'unit' ? `${troopDetail.quantity} ${troopDetail.label} units` : troopDetail.label}>
                          {#each unitIconCopies(troopDetail.kind === 'unit' ? troopDetail.quantity : 1) as copy}
                            <img class="unit-button-art" src={getRaceUnitPortrait(rosterRaceId, rosterUnitClassId)} alt="" aria-hidden={copy === 0 ? 'false' : 'true'} />
                          {/each}
                        </span>
                      </button>
                    {/if}
                  {/each}
                </div>
              </div>
            </article>
          {/each}
        </div>
      </div>
      <div class="opening-actions">
        <button class="primary large" disabled={!selectedScheduledRaceId || actions.disabled} on:click={confirmScheduledRaceUnlock}>
          {actions.waitingLabel ?? `Confirm ${selectedScheduledRaceId ? getRace(selectedScheduledRaceId).label : 'Race'}`}
        </button>
      </div>
    </section>
  </main>
{:else if game.phase === 'troop_class_unlock' && game.activeTroopClassUnlockOffer}
<main class="draft-screen">
    <section class="draft-panel opening-shell ui-debug-target" data-ui-name="Scheduled troop class unlock screen">
      <div class="draft-screen-header">
        <p class="eyebrow">{getRace(game.activeTroopClassUnlockOffer.raceId).label} Muster</p>
        <h1>Choose Troop Class {game.activeTroopClassUnlockOffer.remainingChoices}</h1>
        <p>Pick one troop for the new race. Remaining picks will follow immediately.</p>
        <slot name="session" />
      </div>

      <div class="draft-grid troop-class-unlock-grid">
        {#each game.activeTroopClassUnlockOffer.optionTroopUnlockIds as troopUnlockId}
          {@const [raceId, unitClassId] = parseTroopUnlockId(troopUnlockId)}
          {@const troopDef = resolveTroopCombatant(game, createTroopInstance(raceId, unitClassId), 'player')}
          {@const troopDetail = buildResolvedUnitDetail(
            `scheduled-troop:${troopUnlockId}`,
            troopDef.label,
            raceId,
            unitClassId,
            troopDef.stats,
            troopDef.quantity,
            'Troop class unlock for the newly joined race.',
            troopDef.abilities,
          )}
          <button
            type="button"
            class="draft-option troop-class-choice troop-icon-option"
            aria-label={`Inspect troop unlock ${troopDef.label}`}
            disabled={actions.disabled}
            on:mouseenter={() => previewDetail(troopDetail)}
            on:focus={() => previewDetail(troopDetail)}
            on:mouseleave={clearDetail}
            on:blur={clearDetail}
            on:click={() => chooseTroopClassUnlock(troopUnlockId)}
          >
            <span class={`unit-icon-cluster chip-unit-cluster ${unitIconDensityClass(troopDef.quantity)}`} style={`--unit-cluster-columns:${unitIconColumns(troopDef.quantity)}`} aria-label={`${troopDef.quantity} ${troopDef.label} units`}>
              {#each unitIconCopies(troopDef.quantity) as copy}
                <img class="unit-button-art" src={getRaceUnitPortrait(raceId, unitClassId)} alt="" aria-hidden={copy === 0 ? 'false' : 'true'} />
              {/each}
            </span>
          </button>
        {/each}
      </div>

      {#if activeDetail}
        <aside class="panel floating-detail-panel">
          <h2>{activeDetail.label}</h2>
          {#if activeDetail.kind === 'unit'}
            <div class="unit-overview-strip">
              <span class={`unit-icon-cluster detail-unit-cluster ${unitIconDensityClass(activeDetail.quantity)}`} style={`--unit-cluster-columns:${unitIconColumns(activeDetail.quantity)}`} aria-label={`${activeDetail.quantity} units in troop`}>
                {#each unitIconCopies(activeDetail.quantity) as copy}
                  <img class="hover-unit-art" src={activeDetail.portraitUrl} alt="" aria-hidden={copy === 0 ? 'false' : 'true'} />
                {/each}
              </span>
              <StatBreakdownGrid stats={activeDetail.stats} columns={3} compact={true} />
            </div>
          {:else}
            <p><InlineStatText text={activeDetail.description} /></p>
          {/if}
        </aside>
      {/if}
    </section>
  </main>
{/if}

<style>









  .opening-shell {
    height: 100dvh;
    overflow: hidden;
  }

  .draft-section-label {
    color: var(--ui-color-text-dim);
    font-size: var(--ui-text-label);
    line-height: var(--ui-line-label);
  }

  .unlock-row button,
.draft-option,
.draft-troop-icon,
.sprite-inspect-button {
    border: 1px solid rgba(126, 157, 181, 0.2);
    border-radius: var(--ui-panel-radius-tight);
    background: var(--ui-color-surface-interactive);
    color: var(--ui-color-text);
    padding: var(--ui-space-sm);
    font: inherit;
  }





  .opening-actions {
    justify-content: flex-end;
    padding-top: 0.15rem;
  }





  .opening-shell {
    width: min(1240px, 100%);
  }

  .opening-shell:not(.scheduled-race-shell) {
    height: calc(100dvh - (2 * var(--ui-space-md)));
    grid-template-rows: minmax(0, 1fr) auto;
    overflow: hidden;
  }

  .opening-shell:not(.scheduled-race-shell) .draft-layout {
    overflow: hidden;
  }

  .draft-grid {
    display: grid;
    gap: var(--ui-space-md);
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  }

  .draft-grid {
    min-height: 0;
    overflow: auto;
    align-content: start;
    padding-right: 0.2rem;
  }

  .unlock-row,
  .ability-list {
    display: grid;
    gap: var(--ui-space-sm);
  }

  .ability-list {
    display: flex;
    flex-wrap: wrap;
  }

  .list-button,
  .draft-option {
    text-align: left;
  }

  .list-button {
    display: grid;
    gap: 0.25rem;
    align-items: center;
  }

  .list-button:has(:global(.game-icon)) {
    grid-template-columns: auto minmax(0, 1fr);
    column-gap: 0.45rem;
  }

  .troop-icon-option {
    display: grid;
    place-items: center;
    width: var(--troop-icon-box-size, 3.8rem);
    height: var(--troop-icon-box-size, 3.8rem);
    min-height: 0;
    aspect-ratio: 1;
    justify-self: center;
    padding: 0.45rem;
  }

  .troop-icon-option .unit-button-art {
    width: 2rem;
    height: 2rem;
  }

  .icon-label {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    min-width: 0;
  }

  .icon-label > span {
    min-width: 0;
  }

  .list-button,
  .draft-option,
  .draft-troop-icon {
    transition:
      transform 120ms ease,
      border-color 120ms ease,
      box-shadow 120ms ease,
      background 120ms ease;
  }

  .list-button:hover,
  .draft-option:hover,
  .draft-troop-icon:hover,
  .sprite-inspect-button:hover,
  .mutator-chip:hover {
    transform: none;
    border-color: rgba(213, 178, 116, 0.6);
    box-shadow:
      inset 0 0 0 1px rgba(213, 178, 116, 0.55),
      0 10px 22px rgba(0, 0, 0, 0.22);
  }

  .list-button.selected,
  .draft-option.selected,
  .draft-troop-icon.selected,
  .mutator-chip.selected,
  .sprite-inspect-button.selected {
    background:
      linear-gradient(145deg, rgba(44, 31, 15, 0.96), rgba(17, 22, 30, 0.96)),
      radial-gradient(circle at top left, rgba(212, 173, 115, 0.18), transparent 42%);
    box-shadow:
      inset 0 0 0 2px #d4ad73,
      0 10px 22px rgba(0, 0, 0, 0.22);
  }

  .mutator-chip {
    display: inline-flex;
    align-items: center;
    justify-content: stretch;
    gap: 0.35rem;
    border: 1px solid rgba(124, 153, 176, 0.2);
    border-radius: 999px;
    padding: 0.3rem 0.6rem;
    background: rgba(20, 28, 38, 0.76);
    color: inherit;
    font: inherit;
    line-height: 1.1;
  }

  .mutator-chip :global(.game-icon),
  .list-button :global(.game-icon),
  .detail-title :global(.game-icon) {
    --game-icon-size: 1.05rem;
  }

  .ability-chip :global(.game-icon.raster-icon) {
    --game-icon-raster-scale: 1.45;
  }

  .ability-chip :global(.game-icon) {
    --game-icon-size: 1.58rem;
  }

  .ability-disclosure {
    display: grid;
    gap: 0.3rem;
    flex: 1 1 100%;
    min-width: 0;
  }

  .ability-disclosure > summary {
    width: fit-content;
    list-style: none;
  }

  .ability-disclosure > summary::-webkit-details-marker {
    display: none;
  }

  .ability-disclosure:not([open]):not(:hover):not(:focus-within) > .ability-hover-tooltip {
    display: none;
  }

  .detail-title {
    display: flex;
    align-items: center;
    gap: 0.45rem;
  }

  .detail-title :global(.game-icon) {
    --game-icon-size: 1.35rem;
  }

  .unit-overview-strip {
    display: grid;
    grid-template-columns: minmax(3.1rem, 5.4rem) minmax(0, 1fr);
    align-items: center;
    gap: 0.55rem;
    margin: 0.1rem 0 0.45rem;
    min-width: 0;
  }

  .mutator-chip.empty {
    color: #95a9ba;
  }

  .draft-card {
    display: grid;
    gap: var(--ui-space-sm);
    align-content: start;
  }

  .draft-option {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.9rem;
  }

  .unit-button-art,
  .hover-unit-art,
  .race-name-art {
    image-rendering: pixelated;
    object-fit: contain;
    filter: drop-shadow(0 0 8px rgba(0, 0, 0, 0.28));
  }

  .unit-button-art {
    width: 2.2rem;
    height: 2.2rem;
    flex: 0 0 auto;
    display: block;
    margin: auto;
  }

  .hover-unit-art {
    width: 4rem;
    height: 4rem;
  }

  .detail-unit-cluster .hover-unit-art {
    position: absolute;
    width: var(--unit-cluster-bg-size) !important;
    height: var(--unit-cluster-bg-size) !important;
    margin: 0 !important;
    opacity: 0.72;
    transform: translate(-50%, -50%);
    transform-origin: center bottom;
    z-index: 1;
  }

  .detail-unit-cluster .hover-unit-art {
    width: 100%;
    height: 100%;
  }

  .race-name-art {
    width: 2.6rem;
    height: 2.6rem;
  }

  .draft-card-title {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.8rem;
  }

  .detail-panel p {
    color: #a7b8c8;
  }

  .draft-screen-header {
    display: grid;
    gap: 0.55rem;
    margin-bottom: var(--ui-space-md);
    max-width: 920px;
  }

  .draft-screen-header h1 {
    margin: 0;
    font-size: var(--ui-text-title);
  }

  .draft-screen-header p {
    max-width: 70ch;
    margin: 0;
    color: #a7b8c8;
  }

  .draft-screen-header .scheduled-unlock-instructions {
    max-width: none;
    color: #c8d5df;
    font-size: clamp(0.95rem, 0.9vw, 1.08rem);
    line-height: 1.45;
    white-space: normal;
  }

  .scheduled-race-shell {
    width: min(1780px, 100%);
    max-height: calc(100vh - (2 * var(--ui-space-md)));
    overflow: auto;
  }

  .scheduled-race-layout,
  .scheduled-race-layout.has-detail {
    grid-template-columns: minmax(240px, 288px) minmax(0, 1fr);
  }

  .scheduled-race-layout .draft-grid {
    overflow: visible;
  }

  .race-unlock-grid {
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  }

  .race-unlock-card {
    position: relative;
    display: grid;
    gap: 0.9rem;
    align-content: start;
    cursor: pointer;
    overflow: hidden;
  }

  .race-unlock-card > :not(.race-card-select-button) {
    position: relative;
    z-index: 2;
    pointer-events: none;
  }

  .race-unlock-card button:not(.race-card-select-button) {
    pointer-events: auto;
  }

  .race-card-select-button {
    position: absolute;
    inset: 0;
    z-index: 1;
    border: 0;
    border-radius: inherit;
    background: transparent;
    padding: 0;
  }

  .race-unlock-card:hover,
  .race-unlock-card:focus-within {
    border-color: rgba(213, 178, 116, 0.5);
    box-shadow:
      var(--ui-shadow-panel),
      inset 0 0 0 1px rgba(213, 178, 116, 0.2);
    outline: none;
  }

  .race-card-select-button:focus-visible {
    outline: 2px solid rgba(244, 205, 118, 0.94);
    outline-offset: 3px;
  }

  .race-unlock-card.selected {
    border-color: rgba(231, 190, 105, 0.82);
    background:
      linear-gradient(160deg, rgba(48, 38, 16, 0.92), rgba(24, 22, 16, 0.96)),
      radial-gradient(circle at top right, rgba(243, 204, 105, 0.2), transparent 42%);
    box-shadow:
      0 18px 42px rgba(0, 0, 0, 0.34),
      inset 0 0 0 2px rgba(237, 197, 111, 0.38);
  }

  .race-unlock-card .draft-section {
    display: grid;
    gap: 0.45rem;
    min-width: 0;
  }

  .troop-preview-row {
    grid-template-columns: repeat(auto-fit, minmax(var(--troop-icon-box-size, 3.8rem), 1fr));
    justify-items: center;
  }

  .troop-preview {
    display: grid;
    justify-items: center;
    gap: 0.25rem;
    min-height: 4.6rem;
    padding: 0.45rem;
    border: 1px solid rgba(124, 153, 176, 0.18);
    border-radius: var(--ui-panel-radius-tight);
    color: #edf4fa;
    text-align: center;
    font-size: 0.82rem;
  }

  .included-troop-row {
    justify-content: start;
  }

  .included-troop-preview {
    border-color: rgba(213, 178, 116, 0.56);
    background:
      linear-gradient(135deg, rgba(44, 33, 17, 0.88), rgba(18, 25, 34, 0.88)),
      radial-gradient(circle at 18% 18%, rgba(239, 199, 111, 0.18), transparent 58%);
  }

  .scheduled-race-shell .troop-preview {
    width: var(--troop-icon-box-size, 3.8rem);
    min-height: var(--troop-icon-box-size, 3.8rem);
    aspect-ratio: 1;
    padding: 0.35rem;
    font-size: 0.76rem;
  }

  .scheduled-race-shell .troop-preview .unit-button-art {
    width: 1.65rem;
    height: 1.65rem;
  }

  .troop-preview.future {
    border-style: dashed;
    background: rgba(50, 36, 20, 0.7);
    color: #f5d6a1;
  }

  .troop-preview.empty {
    place-items: center;
    color: #a7b8c8;
  }

  .upgrade-grant {
    border-color: rgba(213, 178, 116, 0.48);
    background: rgba(45, 34, 18, 0.78);
    min-height: 2.35rem;
    padding-block: 0.45rem;
  }

  .troop-class-unlock-grid {
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  }

  .troop-class-choice {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    justify-content: start;
  }

  .troop-class-choice .unit-button-art {
    width: 1.75rem;
    height: 1.75rem;
  }

  .floating-detail-panel {
    position: fixed;
    right: var(--ui-space-md);
    bottom: var(--ui-space-md);
    z-index: 21;
    width: min(360px, calc(100vw - (2 * var(--ui-space-md))));
    max-height: min(44vh, 360px);
    overflow: auto;
  }

  .ability-row {
    display: grid;
    gap: 0.45rem;
  }

  .ability-hover-tooltip {
    display: grid;
    gap: 0.3rem;
    padding: 0.7rem 0.8rem;
    border-radius: 14px;
    border: 1px solid rgba(124, 153, 176, 0.18);
    background: rgba(12, 18, 28, 0.96);
  }

  .large {
    min-width: 220px;
    padding: 0.9rem 1.2rem;
    font-size: 1rem;
  }

  .draft-screen {
    min-height: 100dvh;
    box-sizing: border-box;
    display: grid;
    justify-items: center;
    align-items: start;
    padding: var(--ui-space-md);
  }

  .draft-panel {
    width: min(calc(var(--ui-shell-max-width) + (2 * var(--ui-shell-column))), 100%);
  }

  .draft-layout,
  .draft-focus-panel,
  .detail-panel {
    display: grid;
    gap: var(--ui-space-sm);
    align-content: start;
  }

  .draft-layout {
    min-height: 0;
    grid-template-columns: minmax(264px, 288px) minmax(0, 1fr);
    align-items: start;
    gap: 0.75rem;
  }

  .opening-shell:not(.scheduled-race-shell) .draft-layout {
    align-items: start;
  }

  .draft-section {
    display: grid;
    gap: 0.55rem;
  }

  .draft-focus-panel {
    min-height: 0;
    max-height: none;
    overflow: auto;
  }

  .opening-shell:not(.scheduled-race-shell) .draft-focus-panel,
  .opening-shell:not(.scheduled-race-shell) .draft-grid {
    max-height: 100%;
  }

  .opening-shell:not(.scheduled-race-shell) .draft-focus-panel {
    align-self: start;
  }

  .draft-icon-row {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(96px, 1fr));
    gap: var(--ui-space-sm);
  }

  .draft-troop-icon {
    display: grid;
    justify-items: center;
    gap: var(--ui-space-xs);
    text-align: center;
    padding: var(--ui-space-sm);
  }

  .sprite-inspect-button {
    display: grid;
    place-items: center;
    padding: 0.35rem;
  }

  .draft-grid {
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  }

  .draft-card-header {
    display: grid;
    gap: var(--ui-space-xs);
  }

  .opening-detail-panel {
    min-height: 0;
    align-content: start;
    overflow: auto;
  }

  .detail-panel {
    min-height: 0;
  }

  .opening-detail-panel {
    gap: 0.65rem;
  }

  .opening-detail-panel h2 {
    line-height: 1.08;
  }

  .opening-detail-panel .ability-list {
    max-height: 8rem;
    overflow: auto;
    padding-right: 0.15rem;
  }

  @media (max-width: 560px) {
    .draft-screen-header .scheduled-unlock-instructions {
      white-space: normal;
    }
  }

  .draft-option {
    padding: var(--ui-space-sm);
  }

  .scheduled-race-shell .draft-screen-header {
    max-width: none;
  }

  .scheduled-race-shell .scheduled-race-layout {
    grid-template-columns: minmax(240px, 288px) minmax(0, 1fr);
  }

  .draft-focus-panel.empty {
    visibility: hidden;
    pointer-events: none;
  }

  .scheduled-race-shell .race-unlock-grid {
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  }

  .opening-detail-panel p {
    line-height: 1.35;
  }

  @media (max-width: 1280px) {
    .draft-layout {
      grid-template-columns: 1fr;
    }

    .opening-shell:not(.scheduled-race-shell) .draft-layout {
      grid-template-rows: auto minmax(0, 1fr);
    }

    .opening-shell:not(.scheduled-race-shell) .draft-focus-panel {
      min-height: 0;
      max-height: 15rem;
    }

    .draft-focus-panel.empty {
      display: none;
    }
  }

  @media (max-width: 820px) {
    .draft-icon-row {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .draft-screen {
      padding: 0.75rem;
    }
  }

</style>
