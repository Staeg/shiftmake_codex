<script lang="ts" context="module">
  import type { TroopUnlockId } from '../engine/types';
  export interface OpeningUnlockActions {
    label: string;
    disabled: boolean;
    tutorialLocked: boolean;
    begin(): void;
    claim(troopUnlockId: TroopUnlockId): void;
    unclaim(troopUnlockId: TroopUnlockId): void;
  }
</script>

<script lang="ts">
  import type { GameState, RaceId, UnitClassId, TroopUnlockId } from '../engine/types';
  import { canClaimOpeningTroop as canClaim, getOpeningRaceOptionIds, getOpeningRaceStarterTroopUnlockIds } from '../engine/game';
  import { RACES, TROOP_CATALOG, getRace, getRaceNativeTroopUnlockIds } from '../engine/unitCatalog';
  import { buildRaceDetail, buildResolvedUnitDetail as buildUnitDetail, getDetailInspectLabel,
    parseTroopUnlockId, unitIconColumns, unitIconCopies, unitIconDensityClass, type DetailCard } from './detailCards';
  import GameIcon from './GameIcon.svelte';
  import InlineStatText from './InlineStatText.svelte';
  import StatBreakdownGrid from './StatBreakdownGrid.svelte';

  export let game: GameState;
  export let actions: OpeningUnlockActions;
  export let getRacePortrait: (raceId: RaceId) => string;
  export let getRaceUnitPortrait: (raceId: RaceId, unitClassId: UnitClassId) => string;

  let hoveredDetail: DetailCard | null = null;
  let pinnedDetails: DetailCard[] = [];
  let abilityTooltip: { label: string; description: string; ownerDetailKey: string } | null = null;

  $: selectedOpeningTroopUnlockIds = new Set(game.troops.map((troop) => `${troop.raceId}/${troop.unitClassId}` as TroopUnlockId));
  $: starterGroups = getOpeningRaceOptionIds(game).map((raceId) => ({
    raceId, label: RACES[raceId].label,
    starterTroopUnlockId: getOpeningRaceStarterTroopUnlockIds(game)[raceId],
    options: getRaceNativeTroopUnlockIds(raceId),
  }));
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

  function restoreOpeningRaceDetail(event: MouseEvent, raceDetail: DetailCard): void {
    const card = (event.currentTarget as HTMLElement).closest('.opening-race-card');
    const nextTarget = event.relatedTarget;
    if (pinnedDetails.length === 0 && card && nextTarget instanceof Node && card.contains(nextTarget)) {
      hoveredDetail = raceDetail;
      abilityTooltip = null;
      return;
    }
    clearDetail();
  }

  function canClaimOpeningTroop(troopUnlockId: TroopUnlockId): boolean { return canClaim(game, troopUnlockId); }

  function toggleOpeningRace(troopUnlockId: TroopUnlockId): void {
    if (selectedOpeningTroopUnlockIds.has(troopUnlockId)) {
      pinnedDetails = pinnedDetails.filter((detail) => detail.detailKey !== `opening:${troopUnlockId}`);
      actions.unclaim(troopUnlockId);
    } else if (canClaimOpeningTroop(troopUnlockId)) {
      actions.claim(troopUnlockId);
      pinnedDetails = [];
      hoveredDetail = null;
    }
  }
</script>

<main class="draft-screen">
    <section class="draft-panel opening-shell ui-debug-target" data-ui-name="Opening unlock screen">
      <slot name="session" />
      <div class="draft-layout">
        <aside class="panel draft-focus-panel ui-debug-target" data-ui-name="Opening detail panel" role="presentation" on:mouseleave={clearDetail}>
          {#if activeDetail}
            <div class="detail-panel opening-detail-panel">
              {#if activeDetail.kind !== 'unit'}
                <p class="eyebrow">{getDetailInspectLabel(activeDetail)}</p>
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
              {:else if activeDetail.description}
                <p><InlineStatText text={activeDetail.description} /></p>
                {#if activeDetail.stats && activeDetail.stats.length > 0}
                  <StatBreakdownGrid stats={activeDetail.stats} columns={3} />
                {/if}
              {:else if activeDetail.stats && activeDetail.stats.length > 0}
                <StatBreakdownGrid stats={activeDetail.stats} columns={3} />
              {/if}
            </div>
          {:else}
            <div class="detail-panel opening-detail-panel opening-empty-detail">
              <h2>Choose Two Starting Races</h2>
              <p>Each race brings its included starter troop. Other native troops are shown as later unlock potential.</p>
            </div>
          {/if}
        </aside>

        <div class="draft-grid">
          {#each starterGroups as group}
            {@const raceDetail = buildRaceDetail(group.raceId)}
            {@const starterTroopUnlockId = group.starterTroopUnlockId}
            {@const starterSelected = selectedOpeningTroopUnlockIds.has(starterTroopUnlockId)}
            {@const starterIncompatible = !starterSelected && !canClaimOpeningTroop(starterTroopUnlockId)}
            {@const [starterRaceId, starterUnitClassId] = parseTroopUnlockId(starterTroopUnlockId)}
            {@const starterTroopDef = TROOP_CATALOG[starterTroopUnlockId]}
            {@const starterTroopDetail = buildResolvedUnitDetail(
              `opening:${starterTroopUnlockId}`,
              starterTroopDef.label,
              starterRaceId,
              starterUnitClassId,
              starterTroopDef.stats,
              starterTroopDef.quantity,
              `Included starting troop for ${getRace(starterRaceId).label}. Other native recruits can be unlocked later.`,
              starterTroopDef.abilities,
            )}
            <article
              class="draft-card panel opening-race-card ui-debug-target"
              class:selected={starterSelected}
              class:incompatible={starterIncompatible}
              data-ui-name={`Opening race card ${group.label}`}
              on:mouseenter={() => previewDetail(raceDetail)}
              on:mouseleave={clearDetail}
            >
              <button
                type="button"
                class="opening-card-select-button"
                aria-label={`Choose ${group.label} with ${starterTroopDef.label}`}
                aria-pressed={starterSelected}
                disabled={starterIncompatible}
                on:focus={() => previewDetail(raceDetail)}
                on:blur={clearDetail}
                on:click={() => toggleOpeningRace(starterTroopUnlockId)}
              ></button>
              <header class="draft-card-header">
                <div class="draft-card-title">
                  <strong>{group.label}</strong>
                  <button
                    type="button"
                    class="sprite-inspect-button ui-debug-target"
                    data-ui-name={`Inspect race ${group.label}`}
                    class:selected={detailIsHighlighted(raceDetail.detailKey)}
                    aria-label={`Inspect ${group.label} race modifiers`}
                    on:mouseenter={() => previewDetail(raceDetail)}
                    on:focus={() => previewDetail(raceDetail)}
                    on:mouseleave={(event) => restoreOpeningRaceDetail(event, raceDetail)}
                    on:blur={clearDetail}
                    on:click|stopPropagation={() => toggleOpeningRace(starterTroopUnlockId)}
                  >
                    <img class="race-name-art" src={getRacePortrait(group.raceId)} alt="" aria-hidden="true" />
                  </button>
                </div>
              </header>

              <div class="draft-section opening-included-section">
                <span class="draft-section-label">Included starter</span>
                <button
                  type="button"
                  class="draft-troop-icon opening-starter-tile ui-debug-target"
                  class:selected={detailIsHighlighted(starterTroopDetail.detailKey)}
                  class:incompatible={starterIncompatible}
                  data-ui-name={`Opening included troop ${starterTroopDef.label}`}
                  aria-label={`Inspect ${starterTroopDef.label}`}
                  aria-pressed={pinnedDetails.some((detail) => detail.detailKey === starterTroopDetail.detailKey)}
                  on:mouseenter={() => previewDetail(starterTroopDetail)}
                  on:focus={() => previewDetail(starterTroopDetail)}
                  on:mouseleave={(event) => restoreOpeningRaceDetail(event, raceDetail)}
                  on:blur={clearDetail}
                  on:click|stopPropagation={() => togglePinnedDetail(starterTroopDetail)}
                  disabled={starterIncompatible}
                >
                  <span class={`unit-icon-cluster chip-unit-cluster ${unitIconDensityClass(starterTroopDef.quantity)}`} style={`--unit-cluster-columns:${unitIconColumns(starterTroopDef.quantity)}`} aria-label={`${starterTroopDef.quantity} ${starterTroopDef.label} units`}>
                    {#each unitIconCopies(starterTroopDef.quantity) as copy}
                      <img class="unit-button-art" src={getRaceUnitPortrait(starterRaceId, starterUnitClassId)} alt="" aria-hidden={copy === 0 ? 'false' : 'true'} />
                    {/each}
                  </span>
                </button>
              </div>

              <div class="draft-section opening-future-section">
                <span class="draft-section-label">Future unlocks</span>
                <div class="draft-icon-row opening-future-grid">
                  {#each group.options as troopUnlockId}
                    {@const [raceId, unitClassId] = parseTroopUnlockId(troopUnlockId)}
                    {@const troopDef = TROOP_CATALOG[troopUnlockId]}
                    {@const troopDetail = buildResolvedUnitDetail(
                      `opening:${troopUnlockId}`,
                      troopDef.label,
                      raceId,
                      unitClassId,
                      troopDef.stats,
                      troopDef.quantity,
                      getRace(raceId).description,
                      troopDef.abilities,
                    )}
                    {@const isIncludedStarter = troopUnlockId === group.starterTroopUnlockId}
                    {#if !isIncludedStarter}
                      <button
                        type="button"
                        class="draft-troop-icon troop-preview opening-future-tile ui-debug-target"
                        class:selected={detailIsHighlighted(troopDetail.detailKey)}
                        data-ui-name={`Opening future troop ${troopDef.label}`}
                        aria-label={`Inspect future unlock ${troopDef.label}`}
                        on:mouseenter={() => previewDetail(troopDetail)}
                        on:focus={() => previewDetail(troopDetail)}
                        on:mouseleave={(event) => restoreOpeningRaceDetail(event, raceDetail)}
                        on:blur={clearDetail}
                        on:click|stopPropagation={() => togglePinnedDetail(troopDetail)}
                      >
                        <span class={`unit-icon-cluster chip-unit-cluster ${unitIconDensityClass(troopDef.quantity)}`} style={`--unit-cluster-columns:${unitIconColumns(troopDef.quantity)}`} aria-label={`${troopDef.quantity} ${troopDef.label} units`}>
                          {#each unitIconCopies(troopDef.quantity) as copy}
                            <img class="unit-button-art" src={getRaceUnitPortrait(raceId, unitClassId)} alt="" aria-hidden={copy === 0 ? 'false' : 'true'} />
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
      <div class="opening-actions actions-grid">
        <button
          type="button"
          class="primary large ui-debug-target"
          class:tutorial-scene-locked={actions.tutorialLocked}
          data-ui-name="Begin campaign button"
          on:click={actions.begin}
          disabled={game.troops.length !== 2 || actions.disabled}
        >
          {actions.label}
        </button>
      </div>
    </section>
  </main>

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

  .actions-grid {
    display: flex;
    flex-wrap: nowrap;
    gap: var(--ui-space-sm);
    align-items: center;
  }

  .actions-grid button,
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

  button.tutorial-scene-locked {
    cursor: not-allowed;
    filter: grayscale(1);
    opacity: 0.48;
  }





  .opening-shell {
    width: min(1240px, 100%);
  }

  .opening-shell:not(.scheduled-race-shell) {
    height: calc(100dvh - (2 * var(--ui-space-md)));
    grid-template-rows: minmax(0, 1fr) auto;
    overflow: hidden;
  }

  .opening-shell:not(.scheduled-race-shell):has(:global(.opening-session-header)) {
    grid-template-rows: auto minmax(0, 1fr) auto;
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

  .ability-list {
    display: grid;
    gap: var(--ui-space-sm);
  }

  .ability-list {
    display: flex;
    flex-wrap: wrap;
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

  .draft-troop-icon {
    transition:
      transform 120ms ease,
      border-color 120ms ease,
      box-shadow 120ms ease,
      background 120ms ease;
  }

  .draft-troop-icon:hover, .sprite-inspect-button:hover, .mutator-chip:hover {
    transform: none;
    border-color: rgba(213, 178, 116, 0.6);
    box-shadow:
      inset 0 0 0 1px rgba(213, 178, 116, 0.55),
      0 10px 22px rgba(0, 0, 0, 0.22);
  }

  .draft-troop-icon.selected, .mutator-chip.selected, .sprite-inspect-button.selected {
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

  .mutator-chip :global(.game-icon), .detail-title :global(.game-icon) {
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

  .opening-race-card {
    position: relative;
    cursor: pointer;
    transition:
      border-color 160ms ease,
      background 160ms ease,
      box-shadow 160ms ease,
      transform 160ms ease;
  }

  .opening-race-card > :not(.opening-card-select-button) {
    position: relative;
    z-index: 2;
    pointer-events: none;
  }

  .opening-race-card button:not(.opening-card-select-button) {
    pointer-events: auto;
  }

  .opening-card-select-button {
    position: absolute;
    inset: 0;
    z-index: 1;
    border: 0;
    border-radius: inherit;
    background: transparent;
    padding: 0;
  }

  .opening-race-card:hover, .opening-race-card:focus-visible {
    border-color: rgba(213, 178, 116, 0.44);
    box-shadow:
      var(--ui-shadow-panel),
      inset 0 0 0 1px rgba(213, 178, 116, 0.18);
  }

  .opening-card-select-button:focus-visible {
    outline: 2px solid rgba(244, 205, 118, 0.94);
    outline-offset: 3px;
  }

  .opening-race-card.selected {
    border-color: rgba(231, 190, 105, 0.82);
    background:
      linear-gradient(160deg, rgba(48, 38, 16, 0.92), rgba(24, 22, 16, 0.96)),
      radial-gradient(circle at top right, rgba(243, 204, 105, 0.2), transparent 42%);
    box-shadow:
      0 18px 42px rgba(0, 0, 0, 0.34),
      inset 0 0 0 2px rgba(237, 197, 111, 0.38);
  }

  .opening-race-card.incompatible {
    cursor: not-allowed;
    opacity: 0.68;
  }

  .opening-included-section {
    margin-top: 0.1rem;
  }

  .opening-starter-tile {
    grid-template-columns: minmax(0, 1fr);
    justify-items: stretch;
    align-items: stretch;
    min-height: 4.2rem;
    text-align: left;
    border-color: rgba(213, 178, 116, 0.48);
    background:
      linear-gradient(135deg, rgba(44, 33, 17, 0.88), rgba(18, 25, 34, 0.88)),
      radial-gradient(circle at 18% 18%, rgba(239, 199, 111, 0.18), transparent 58%);
  }

  .opening-starter-tile.selected {
    border-color: rgba(244, 205, 118, 0.9);
    background:
      linear-gradient(135deg, rgba(64, 46, 18, 0.95), rgba(31, 26, 17, 0.97)),
      radial-gradient(circle at 20% 15%, rgba(248, 218, 139, 0.26), transparent 58%);
  }

  .opening-future-section {
    margin-top: 0.35rem;
  }

  .opening-future-grid {
    grid-template-columns: repeat(auto-fit, var(--troop-icon-box-size, 3.8rem));
    justify-content: start;
  }

  .opening-future-tile {
    grid-template-columns: minmax(0, 1fr);
    justify-items: stretch;
    align-items: stretch;
    min-height: 0;
    border-style: dashed;
    background: rgba(16, 25, 35, 0.68);
    color: #c4d2df;
  }

  .opening-starter-tile .chip-unit-cluster, .opening-future-tile .chip-unit-cluster {
    --unit-cluster-icon-size: min(2.85rem, 78%);
  }

  .unit-button-art, .hover-unit-art, .race-name-art {
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

  .troop-preview.empty {
    place-items: center;
    color: #a7b8c8;
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

  .draft-layout, .draft-focus-panel, .detail-panel {
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

  .opening-shell:not(.scheduled-race-shell) .draft-focus-panel, .opening-shell:not(.scheduled-race-shell) .draft-grid {
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

  .draft-troop-icon.incompatible {
    cursor: not-allowed;
    border-color: rgba(126, 157, 181, 0.12);
    background: rgba(20, 28, 38, 0.42);
    color: rgba(167, 184, 200, 0.58);
    filter: grayscale(0.85);
    opacity: 0.56;
  }

  .draft-troop-icon.incompatible:hover {
    transform: none;
    border-color: rgba(126, 157, 181, 0.12);
    box-shadow: none;
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

  .opening-empty-detail {
    align-content: center;
    min-height: 100%;
  }

  .opening-detail-panel h2 {
    line-height: 1.08;
  }

  .opening-detail-panel .ability-list {
    max-height: 8rem;
    overflow: auto;
    padding-right: 0.15rem;
  }

  .draft-focus-panel.empty {
    visibility: hidden;
    pointer-events: none;
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
