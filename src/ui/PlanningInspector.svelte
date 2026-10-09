<script lang="ts">
  import type { AbilityDefinition, ExplainedStatKey, RaceId, ResolvedCombatantDefinition, StatBreakdown, TroopInstance, UnitClassId } from '../engine/types';
  import { getSummonedUnitPreviews } from '../engine/unitCatalog';
  import { buildResolvedUnitDetail as buildResolvedUnitDetailModel, buildStatEntries, getDetailInspectLabel,
    unitIconCopies, unitIconColumns, unitIconDensityClass, type DetailCard } from './detailCards';
  import { planningAbilityTooltipFor, type PlanningInspection } from './planningInspection';
  import InlineStatText from './InlineStatText.svelte';
  import StatBreakdownGrid from './StatBreakdownGrid.svelte';
  import GameIcon from './GameIcon.svelte';

  export let inspection: PlanningInspection;
  export let centerMode: 'rifts' | 'troops' | 'contest';
  export let selectedTroop: TroopInstance | null;
  export let selectedTroopDefinition: ResolvedCombatantDefinition | null;
  export let getRaceUnitPortrait: (raceId: RaceId, unitClassId: UnitClassId) => string;
  export let previewDetail: (detail: DetailCard) => void;
  export let togglePinnedDetail: (detail: DetailCard) => void;

  $: activeDetail = $inspection.primary;
  $: secondaryUnitDetail = $inspection.secondary;
  const clearDetail = () => inspection.clearPreview();
  const clearAbilityTooltip = () => inspection.clearAbility();
  const showAbilityTooltip = (ability: { label: string; description: string }, owner: string | null) => inspection.showAbility(ability, owner);
  const togglePinnedAbilityTooltip = (ability: { label: string; description: string }, owner: string | null) => inspection.toggleAbility(ability, owner);

  function openAbilityDisclosure(event: MouseEvent | FocusEvent, ability: { label: string; description: string }, ownerDetailKey: string | null): void {
    const target = event.currentTarget;
    if (target instanceof HTMLElement) {
      const disclosure = target.closest('details');
      if (disclosure instanceof HTMLDetailsElement) disclosure.open = true;
    }
    inspection.showAbility(ability, ownerDetailKey);
  }
  function buildResolvedUnitDetail(
    detailKey: string,
    label: string,
    raceId: RaceId,
    unitClassId: UnitClassId,
    stats: { health: number; damage: number; rate: number; move: number; armor: number; range: number; capacity: number; size?: number },
    quantity: number,
    description: string,
    abilities: AbilityDefinition[],
    statBreakdowns?: Partial<Record<ExplainedStatKey | 'quantity', StatBreakdown>>,
  ): DetailCard {
    return buildResolvedUnitDetailModel({
      detailKey,
      label,
      raceId,
      unitClassId,
      stats,
      quantity,
      description,
      abilities,
      ...(statBreakdowns ? { statBreakdowns } : {}),
      getRaceUnitPortrait,
    });
  }

</script>

      <div class="panel overworld-detail-panel ui-debug-target" data-ui-name="Detail panel">
        {#if activeDetail}
          <div class="detail-panel overworld-detail-panel" role="presentation" on:mouseleave={clearDetail}>
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
                      {#each ability.summoned as summon}
                        <button
                          type="button"
                          class="mutator-chip summon-preview-chip"
                          aria-label={`Inspect summoned ${summon.label}`}
                          on:mouseenter={() => previewDetail(summon.detail)}
                          on:focus={() => previewDetail(summon.detail)}
                          on:mouseleave={clearDetail}
                          on:blur={clearDetail}
                          on:click={() => togglePinnedDetail(summon.detail)}
                        >
                          <span class="icon-label"><img class="summon-chip-art" src={summon.detail.portraitUrl} alt="" aria-hidden="true" /><span>{summon.label}</span></span>
                        </button>
                      {/each}
                    {/each}
                  {/if}
                </div>
                {#if planningAbilityTooltipFor($inspection, activeDetail.detailKey)}
                  <div class="ability-hover-tooltip">
                    <strong>{planningAbilityTooltipFor($inspection, activeDetail.detailKey)?.label}</strong>
                    <p><InlineStatText text={planningAbilityTooltipFor($inspection, activeDetail.detailKey)?.description ?? ''} /></p>
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
          {#if secondaryUnitDetail}
            <div class="detail-panel overworld-detail-panel secondary-unit-detail" role="presentation">
              <h2 class="detail-title"><span>{secondaryUnitDetail.label}</span></h2>
              <div class="unit-overview-strip">
                <span class={`unit-icon-cluster detail-unit-cluster ${unitIconDensityClass(secondaryUnitDetail.quantity)}`} style={`--unit-cluster-columns:${unitIconColumns(secondaryUnitDetail.quantity)}`} aria-label={`${secondaryUnitDetail.quantity} units in troop`}>
                  {#each unitIconCopies(secondaryUnitDetail.quantity) as copy}
                    <img class="hover-unit-art" src={secondaryUnitDetail.portraitUrl} alt="" aria-hidden={copy === 0 ? 'false' : 'true'} />
                  {/each}
                </span>
                <StatBreakdownGrid stats={secondaryUnitDetail.stats} columns={3} compact={true} />
              </div>
              <div class="ability-row detail-ability-row">
                <span>Abilities</span>
                <div class="ability-list">
                  {#if secondaryUnitDetail.abilities.length === 0}
                    <span class="mutator-chip empty">None</span>
                  {:else}
                    {#each secondaryUnitDetail.abilities as ability}
                      <button
                        type="button"
                        class="mutator-chip ability-chip"
                        on:mouseenter={() => showAbilityTooltip(ability, secondaryUnitDetail.detailKey)}
                        on:focus={() => showAbilityTooltip(ability, secondaryUnitDetail.detailKey)}
                        on:mouseleave={clearAbilityTooltip}
                        on:blur={clearAbilityTooltip}
                        on:click={() => togglePinnedAbilityTooltip(ability, secondaryUnitDetail.detailKey)}
                      >
                        <span class="icon-label"><GameIcon kind="ability" id={ability.id} label={ability.label} /><span>{ability.label}</span></span>
                      </button>
                    {/each}
                  {/if}
                </div>
                {#if planningAbilityTooltipFor($inspection, secondaryUnitDetail.detailKey)}
                  <div class="ability-hover-tooltip">
                    <strong>{planningAbilityTooltipFor($inspection, secondaryUnitDetail.detailKey)?.label}</strong>
                    <p><InlineStatText text={planningAbilityTooltipFor($inspection, secondaryUnitDetail.detailKey)?.description ?? ''} /></p>
                  </div>
                {/if}
              </div>
            </div>
          {/if}
        {:else if centerMode === 'troops' && selectedTroop && selectedTroopDefinition}
          <h2>{selectedTroopDefinition.label}</h2>
          <div class="unit-overview-strip">
            <span class={`unit-icon-cluster detail-unit-cluster ${unitIconDensityClass(selectedTroopDefinition.quantity)}`} style={`--unit-cluster-columns:${unitIconColumns(selectedTroopDefinition.quantity)}`} aria-label={`${selectedTroopDefinition.quantity} units in troop`}>
              {#each unitIconCopies(selectedTroopDefinition.quantity) as copy}
                <img class="hover-unit-art" src={getRaceUnitPortrait(selectedTroop.raceId, selectedTroop.unitClassId)} alt="" aria-hidden={copy === 0 ? 'false' : 'true'} />
              {/each}
            </span>
              <StatBreakdownGrid
                stats={buildStatEntries(selectedTroopDefinition.stats, selectedTroopDefinition.statBreakdowns, true, selectedTroopDefinition.quantity)}
              columns={3}
              compact={true}
            />
          </div>
          <div class="ability-row">
            <span>Abilities</span>
            <div class="ability-list">
              {#if selectedTroopDefinition.abilities.length === 0}
                <span class="mutator-chip empty">None</span>
              {:else}
                {#each selectedTroopDefinition.abilities as ability}
                  {@const selectedSummons = getSummonedUnitPreviews(ability, selectedTroop.raceId).map((preview) => buildResolvedUnitDetail(
                    `selected-summon:${selectedTroop.id}:${ability.id}:${preview.unitClassId}:${preview.grantedAbilityIds.join(',')}`,
                    preview.troop.label,
                    preview.troop.raceId,
                    preview.troop.unitClassId,
                    preview.troop.stats,
                    preview.troop.quantity,
                    `${preview.count > 1 ? `${preview.count} units. ` : ''}${preview.consumesCorpse ? 'Requires a corpse. ' : ''}Summoned by ${ability.label}.`,
                    preview.troop.abilities,
                  ))}
                  <button
                    class="mutator-chip ability-chip"
                    on:mouseenter={() => showAbilityTooltip(ability, `selected-troop:${selectedTroop.id}`)}
                    on:focus={() => showAbilityTooltip(ability, `selected-troop:${selectedTroop.id}`)}
                    on:mouseleave={clearAbilityTooltip}
                    on:blur={clearAbilityTooltip}
                    on:click={() => togglePinnedAbilityTooltip(ability, `selected-troop:${selectedTroop.id}`)}
                  >
                    <span class="icon-label"><GameIcon kind="ability" id={ability.id} label={ability.label} /><span>{ability.label}</span></span>
                  </button>
                  {#each selectedSummons as summonDetail}
                    <button
                      type="button"
                      class="mutator-chip summon-preview-chip"
                      aria-label={`Inspect summoned ${summonDetail.label}`}
                      on:mouseenter={() => previewDetail(summonDetail)}
                      on:focus={() => previewDetail(summonDetail)}
                      on:mouseleave={clearDetail}
                      on:blur={clearDetail}
                      on:click={() => togglePinnedDetail(summonDetail)}
                    >
                      <span class="icon-label"><img class="summon-chip-art" src={summonDetail.portraitUrl} alt="" aria-hidden="true" /><span>{summonDetail.label}</span></span>
                    </button>
                  {/each}
                {/each}
              {/if}
            </div>
            {#if planningAbilityTooltipFor($inspection, `selected-troop:${selectedTroop.id}`)}
              <div class="ability-hover-tooltip">
                <strong>{planningAbilityTooltipFor($inspection, `selected-troop:${selectedTroop.id}`)?.label}</strong>
                <p><InlineStatText text={planningAbilityTooltipFor($inspection, `selected-troop:${selectedTroop.id}`)?.description ?? ''} /></p>
              </div>
            {/if}
          </div>
        {:else}
          <h2>No Focus Item</h2>
          <p>
            {centerMode === 'rifts'
              ? 'Hover or select a troop, enemy, or mutator from the Rift board to inspect it here.'
              : centerMode === 'troops'
                ? 'Choose a Rift or troop to inspect its roster, stats, and assignments.'
                : 'Hover or select an opponent troop, race, or upgrade to inspect it here.'}
          </p>
        {/if}
      </div>


<style>















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

  .mutator-chip:hover {
    transform: none;
    border-color: rgba(213, 178, 116, 0.6);
    box-shadow:
      inset 0 0 0 1px rgba(213, 178, 116, 0.55),
      0 10px 22px rgba(0, 0, 0, 0.22);
  }

  .mutator-chip.selected {
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

  .summon-preview-chip {
    border-color: rgba(215, 221, 230, 0.34);
    background: rgba(28, 34, 42, 0.82);
    color: #d7dde6;
  }

  .summon-chip-art {
    width: 1.05rem;
    height: 1.05rem;
    object-fit: contain;
    image-rendering: pixelated;
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

  .secondary-unit-detail {
    border-color: rgba(124, 153, 176, 0.16);
    background: rgba(12, 18, 28, 0.72);
  }

  .mutator-chip.empty {
    color: #95a9ba;
  }

  .hover-unit-art {
    image-rendering: pixelated;
    object-fit: contain;
    filter: drop-shadow(0 0 8px rgba(0, 0, 0, 0.28));
  }

  .hover-unit-art {
    width: 4rem;
    height: 4rem;
  }

  .unit-tile:has(.unit-icon-cluster) {
    justify-content: stretch;
    justify-items: stretch;
    place-items: stretch;
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

  .detail-panel p {
    color: #a7b8c8;
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

  .detail-panel {
    display: grid;
    gap: var(--ui-space-sm);
    align-content: start;
  }

  .overworld-detail-panel {
    min-height: 0;
    align-content: start;
    overflow: auto;
  }

  .detail-panel {
    min-height: 0;
  }

  .overworld-detail-panel h2 {
    line-height: 1.08;
  }

  .overworld-detail-panel .ability-list {
    max-height: 8rem;
    overflow: auto;
    padding-right: 0.15rem;
  }

  .draft-focus-panel.empty {
    visibility: hidden;
    pointer-events: none;
  }

  .overworld-detail-panel p {
    line-height: 1.35;
  }

  @media (max-width: 1280px) {

    .draft-focus-panel.empty {
      display: none;
    }
  }

</style>
