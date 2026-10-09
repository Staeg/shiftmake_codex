<script lang="ts">
  import type { GameState, RaceId, UnitClassId, TroopUnlockId, UpgradeId } from '../engine/types';
  import { createTroopInstance } from '../engine/army';
  import { upgradeAffectsTroop } from '../engine/upgrades';
  import { TROOP_CATALOG } from '../engine/unitCatalog';
  import { buildResolvedUnitDetail as buildUnitDetail, buildUpgradeDetail, getUpgradeDetails,
    parseTroopUnlockId, unitIconColumns, unitIconCopies, unitIconDensityClass, type DetailCard } from './detailCards';
  import type { EssenceDraftSession } from './essenceDraftSession';
  import GameIcon from './GameIcon.svelte';

  export let game: GameState;
  export let session: EssenceDraftSession;
  export let disabled = false;
  export let highlighted = false;
  export let cost: number | null;
  export let revealLabel: string;
  export let reveal: () => void;
  export let previewDetail: (detail: DetailCard) => void;
  export let clearDetail: () => void;
  export let getRaceUnitPortrait: (raceId: RaceId, unitClassId: UnitClassId) => string;

  $: essenceDraftActive = !!(game.activeTroopOffer || game.activeUpgradeOffer);
  $: canRerollTroopDraft = !disabled && !game.essenceDraftRerollUsed && !!game.activeTroopOffer;
  $: canRerollUpgradeDraft = !disabled && !game.essenceDraftRerollUsed && !!game.activeUpgradeOffer;

  function buildResolvedUnitDetail(
    detailKey: string, label: string, raceId: RaceId, unitClassId: UnitClassId,
    stats: Parameters<typeof buildUnitDetail>[0]['stats'], quantity: number,
    description: string, abilities: Parameters<typeof buildUnitDetail>[0]['abilities'],
  ): DetailCard {
    return buildUnitDetail({ detailKey, label, raceId, unitClassId, stats, quantity, description, abilities, getRaceUnitPortrait });
  }

  function getAffectedTroopsForUpgrade(upgradeId: UpgradeId, game: GameState) {
    return game.troops.filter(troop => upgradeAffectsTroop(upgradeId, troop));
  }

  function getAffectedDraftTroopsForUpgrade(upgradeId: UpgradeId, game: GameState): TroopUnlockId[] {
    return (game.activeTroopOffer?.optionTroopUnlockIds ?? []).filter(id => {
      const [race, unitClass] = parseTroopUnlockId(id);
      return upgradeAffectsTroop(upgradeId, createTroopInstance(race, unitClass));
    });
  }

  function isUpgradeAffectingDraftTroop(id: TroopUnlockId, upgrade: UpgradeId | null, game: GameState): boolean {
    return !!upgrade && getAffectedDraftTroopsForUpgrade(upgrade, game).includes(id);
  }

  function selectedDraftChoicesHaveSynergy(troop: TroopUnlockId | null, upgrade: UpgradeId | null, game: GameState): boolean {
    return !!troop && !!upgrade && getAffectedDraftTroopsForUpgrade(upgrade, game).includes(troop);
  }
</script>

          <div class="panel essence-draft-panel footer-essence-draft-panel ui-debug-target" data-ui-name="Bottom essence draft panel" class:soft-highlight={highlighted}>
            {#if !essenceDraftActive && !$session.confirmedTroop && !$session.confirmedUpgrade}
              <p class="draft-helper-copy">
                Preparing the mandatory draft...
              </p>
              <div class="actions-grid">
                <button type="button" class="primary reveal-draft-button" class:soft-highlight={highlighted} disabled={disabled || cost === null || game.essence < cost} on:click={reveal}>
                  <span>{revealLabel}</span>
                  {#if cost}
                    <span class="essence-cost"><i class="resource-icon essence"></i><strong>{cost}</strong></span>
                  {/if}
                </button>
              </div>
            {:else}
              <div class="essence-draft-groups" class:has-synergy={selectedDraftChoicesHaveSynergy($session.selectedTroop, $session.selectedUpgrade, game)}>
                <div
                  class="draft-offer-block"
                  class:locked={!game.activeTroopOffer && !!$session.confirmedTroop}
                  class:reroll-replace-preview={$session.hoveredReroll === 'troop' && canRerollTroopDraft}
                >
                  <span class="assignment-label">Choose one troop</span>
                  {#if game.activeTroopOffer}
                    <div class="option-list troop-draft-option-list">
                      {#each game.activeTroopOffer.optionTroopUnlockIds as troopUnlockId}
                        {@const [raceId, unitClassId] = parseTroopUnlockId(troopUnlockId)}
                        {@const troopDef = TROOP_CATALOG[troopUnlockId]}
                        {@const troopDetail = buildResolvedUnitDetail(
                          `offer:${troopUnlockId}`,
                          troopDef.label,
                          raceId,
                          unitClassId,
                          troopDef.stats,
                          troopDef.quantity,
                          'Draftable troop unlock.',
                          troopDef.abilities,
                        )}
                        <button
                          class="draft-option troop-icon-option"
                          data-tutorial-target="draft-troop-option" disabled={disabled}
                          class:selected={$session.selectedTroop === troopUnlockId}
                          class:upgrade-affected={isUpgradeAffectingDraftTroop(troopUnlockId, $session.hoveredUpgrade ?? $session.selectedUpgrade, game)}
                          aria-label={`Inspect troop unlock ${troopDef.label}`}
                          on:mouseenter={() => previewDetail(troopDetail)}
                          on:focus={() => previewDetail(troopDetail)}
                          on:mouseleave={clearDetail}
                          on:blur={clearDetail}
                          on:click={() => session.selectTroop(troopUnlockId, troopDetail)}
                        >
                          <span class={`unit-icon-cluster chip-unit-cluster ${unitIconDensityClass(troopDef.quantity)}`} style={`--unit-cluster-columns:${unitIconColumns(troopDef.quantity)}`} aria-label={`${troopDef.quantity} ${troopDef.label} units`}>
                            {#each unitIconCopies(troopDef.quantity) as copy}
                              <img class="unit-button-art" src={getRaceUnitPortrait(raceId, unitClassId)} alt="" aria-hidden={copy === 0 ? 'false' : 'true'} />
                            {/each}
                          </span>
                          {#if isUpgradeAffectingDraftTroop(troopUnlockId, $session.hoveredUpgrade ?? $session.selectedUpgrade, game)}
                            <span class="upgrade-plus-badge" aria-hidden="true">+</span>
                          {/if}
                        </button>
                      {/each}
                    </div>
                    <button
                      type="button"
                      class="draft-reroll-button"
                      class:reroll-hovered={$session.hoveredReroll === 'troop' && canRerollTroopDraft}
                      class:reroll-other-hovered={$session.hoveredReroll === 'upgrade' && canRerollTroopDraft}
                      disabled={!canRerollTroopDraft}
                      aria-label="Reroll troop draft options"
                      title="Reroll troop options"
                      on:mouseenter={() => session.hoverReroll('troop')}
                      on:focus={() => session.hoverReroll('troop')}
                      on:mouseleave={() => session.hoverReroll(null)}
                      on:blur={() => session.hoverReroll(null)}
                      on:click={() => session.reroll('troop')}
                    >
                      <svg class="recycle-icon" viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M7.2 7.4a6.5 6.5 0 0 1 10 .7" />
                        <path d="M17.1 3.9v4.4h-4.4" />
                        <path d="M16.8 16.6a6.5 6.5 0 0 1-10-.7" />
                        <path d="M6.9 20.1v-4.4h4.4" />
                      </svg>
                    </button>
                    <button type="button" class="primary" data-tutorial-target="confirm-draft-troop" disabled={disabled || !$session.selectedTroop} on:click={() => session.confirmTroop()}>Confirm Troop</button>
                  {:else if $session.confirmedTroop}
                    {@const [raceId, unitClassId] = parseTroopUnlockId($session.confirmedTroop)}
                    <div class="locked-draft-card locked-draft-icon-card" aria-label={`Confirmed troop ${TROOP_CATALOG[$session.confirmedTroop].label}`}>
                      <span class={`unit-icon-cluster chip-unit-cluster ${unitIconDensityClass(TROOP_CATALOG[$session.confirmedTroop].quantity)}`} style={`--unit-cluster-columns:${unitIconColumns(TROOP_CATALOG[$session.confirmedTroop].quantity)}`} aria-label={`${TROOP_CATALOG[$session.confirmedTroop].quantity} ${TROOP_CATALOG[$session.confirmedTroop].label} units`}>
                        {#each unitIconCopies(TROOP_CATALOG[$session.confirmedTroop].quantity) as copy}
                          <img class="unit-button-art" src={getRaceUnitPortrait(raceId, unitClassId)} alt="" aria-hidden={copy === 0 ? 'false' : 'true'} />
                        {/each}
                      </span>
                      <span class="confirmed-check" aria-hidden="true"></span>
                    </div>
                  {/if}
                </div>

                <div
                  class="draft-offer-block"
                  class:locked={!game.activeUpgradeOffer && !!$session.confirmedUpgrade}
                  class:reroll-replace-preview={$session.hoveredReroll === 'upgrade' && canRerollUpgradeDraft}
                >
                  <span class="assignment-label">Choose one upgrade</span>
                  {#if game.activeUpgradeOffer}
                    <div class="unlock-row">
                      {#each game.activeUpgradeOffer.optionUpgradeIds as upgradeId}
                        {@const upgradeDetail = buildUpgradeDetail(upgradeId)}
                        {@const affectedTroops = getAffectedTroopsForUpgrade(upgradeId, game)}
                        {@const affectedDraftTroops = getAffectedDraftTroopsForUpgrade(upgradeId, game)}
                        <button
                          class="list-button draft-upgrade-option"
                          data-tutorial-target="draft-upgrade-option" disabled={disabled}
                          class:selected={$session.selectedUpgrade === upgradeId}
                          on:mouseenter={() => { session.hoverUpgrade(upgradeId); previewDetail(upgradeDetail); }}
                          on:focus={() => { session.hoverUpgrade(upgradeId); previewDetail(upgradeDetail); }}
                          on:mouseleave={() => { session.hoverUpgrade(null); clearDetail(); }}
                          on:blur={() => { session.hoverUpgrade(null); clearDetail(); }}
                          on:click={() => session.selectUpgrade(upgradeId, upgradeDetail)}
                        >
                          <span class="icon-label"><GameIcon kind="upgrade" id={upgradeId} label={getUpgradeDetails(upgradeId).label} /><span>{getUpgradeDetails(upgradeId).label}</span></span>
                          {#if affectedTroops.length > 0 || affectedDraftTroops.length > 0}
                            <span class="affected-troop-strip" aria-label="Affected troops">
                              {#each affectedTroops as troop}
                                <img src={getRaceUnitPortrait(troop.raceId, troop.unitClassId)} alt="" aria-hidden="true" />
                              {/each}
                              {#each affectedDraftTroops as troopUnlockId}
                                {@const [raceId, unitClassId] = parseTroopUnlockId(troopUnlockId)}
                                <img
                                  class="draft-affected"
                                  class:selected-draft-target={$session.selectedTroop === troopUnlockId}
                                  src={getRaceUnitPortrait(raceId, unitClassId)}
                                  alt=""
                                  aria-hidden="true"
                                />
                              {/each}
                            </span>
                          {/if}
                        </button>
                      {/each}
                    </div>
                    <button
                      type="button"
                      class="draft-reroll-button"
                      class:reroll-hovered={$session.hoveredReroll === 'upgrade' && canRerollUpgradeDraft}
                      class:reroll-other-hovered={$session.hoveredReroll === 'troop' && canRerollUpgradeDraft}
                      disabled={!canRerollUpgradeDraft}
                      aria-label="Reroll upgrade draft options"
                      title="Reroll upgrade options"
                      on:mouseenter={() => session.hoverReroll('upgrade')}
                      on:focus={() => session.hoverReroll('upgrade')}
                      on:mouseleave={() => session.hoverReroll(null)}
                      on:blur={() => session.hoverReroll(null)}
                      on:click={() => session.reroll('upgrade')}
                    >
                      <svg class="recycle-icon" viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M7.2 7.4a6.5 6.5 0 0 1 10 .7" />
                        <path d="M17.1 3.9v4.4h-4.4" />
                        <path d="M16.8 16.6a6.5 6.5 0 0 1-10-.7" />
                        <path d="M6.9 20.1v-4.4h4.4" />
                      </svg>
                    </button>
                    <button type="button" class="primary" data-tutorial-target="confirm-draft-upgrade" disabled={disabled || !$session.selectedUpgrade} on:click={() => session.confirmUpgrade()}>Confirm Upgrade</button>
                  {:else if $session.confirmedUpgrade}
                    <div class="locked-draft-card locked-draft-icon-card" aria-label={`Confirmed upgrade ${getUpgradeDetails($session.confirmedUpgrade).label}`}>
                      <GameIcon kind="upgrade" id={$session.confirmedUpgrade} label={getUpgradeDetails($session.confirmedUpgrade).label} />
                      <span class="confirmed-check" aria-hidden="true"></span>
                    </div>
                  {/if}
                </div>
              </div>
            {/if}
          </div>

<style>







  .assignment-label {
    color: var(--ui-color-text-dim);
    font-size: var(--ui-text-label);
    line-height: var(--ui-line-label);
  }

  .essence-cost {
    display: inline-flex;
    align-items: center;
    gap: 0.28rem;
    margin-left: 0.35rem;
    color: #d3b0ff;
  }

  .essence-cost strong {
    color: #b86cff;
    font-family: var(--ui-font-mono);
    font-weight: 700;
  }

  .resource-icon {
    display: inline-block;
    width: 0.8rem;
    height: 0.8rem;
    border-radius: 50%;
  }

  .resource-icon.essence {
    background: radial-gradient(circle at 30% 30%, #fff2ff, #c99bff 45%, #683f93 100%);
    box-shadow: 0 0 10px rgba(201, 155, 255, 0.55);
  }

  .actions-grid {
    display: flex;
    flex-wrap: nowrap;
    gap: var(--ui-space-sm);
    align-items: center;
  }

  .actions-grid button,
.unlock-row button,
.draft-option {
    border: 1px solid rgba(126, 157, 181, 0.2);
    border-radius: var(--ui-panel-radius-tight);
    background: var(--ui-color-surface-interactive);
    color: var(--ui-color-text);
    padding: var(--ui-space-sm);
    font: inherit;
  }



  @keyframes rifts-button-attention {
    0%,
    100% {
      box-shadow:
        0 0 0 0 rgba(244, 205, 118, 0.16),
        inset 0 0 0 1px rgba(244, 205, 118, 0.14);
    }
    50% {
      box-shadow:
        0 0 0 3px rgba(244, 205, 118, 0.14),
        0 0 16px rgba(244, 205, 118, 0.18),
        inset 0 0 0 1px rgba(244, 205, 118, 0.34);
    }
  }



  @keyframes tutorial-target-pulse {
    0%,
    100% {
      outline-color: rgba(119, 185, 255, 0.56);
      filter: drop-shadow(0 0 4px rgba(103, 179, 255, 0.36));
    }

    50% {
      outline-color: rgba(151, 207, 255, 0.96);
      filter: drop-shadow(0 0 12px rgba(103, 179, 255, 0.7));
    }
  }





  .unlock-row,
  .option-list {
    display: grid;
    gap: var(--ui-space-sm);
  }

  .option-list {
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  }

  .troop-draft-option-list {
    grid-template-columns: repeat(3, var(--troop-icon-box-size, 3.8rem));
    justify-content: space-between;
    gap: 0.35rem;
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

  .draft-offer-block .list-button {
    grid-template-columns: minmax(0, 1fr) auto;
  }

  .draft-offer-block .list-button:has(:global(.game-icon)) {
    grid-template-columns: auto minmax(0, 1fr) auto;
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
  .draft-option {
    transition:
      transform 120ms ease,
      border-color 120ms ease,
      box-shadow 120ms ease,
      background 120ms ease;
  }

  .list-button:hover,
  .draft-option:hover {
    transform: none;
    border-color: rgba(213, 178, 116, 0.6);
    box-shadow:
      inset 0 0 0 1px rgba(213, 178, 116, 0.55),
      0 10px 22px rgba(0, 0, 0, 0.22);
  }

  .list-button.selected,
  .draft-option.selected {
    background:
      linear-gradient(145deg, rgba(44, 31, 15, 0.96), rgba(17, 22, 30, 0.96)),
      radial-gradient(circle at top left, rgba(212, 173, 115, 0.18), transparent 42%);
    box-shadow:
      inset 0 0 0 2px #d4ad73,
      0 10px 22px rgba(0, 0, 0, 0.22);
  }

  .list-button :global(.game-icon) {
    --game-icon-size: 1.05rem;
  }

  @keyframes rift-force-group-now {
    0%,
    100% {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  @keyframes rift-force-group-now-loses {
    0%,
    56.8% {
      opacity: 1;
      transform: translateY(0) scale(1);
      filter: none;
    }
    100% {
      opacity: 0;
      transform: translateY(0.35rem) scale(0.86);
      filter: grayscale(1) brightness(0.68);
    }
  }

  @keyframes rift-force-group-now-loses-late {
    0%,
    59.5% {
      opacity: 1;
      transform: translateY(0) scale(1);
      filter: none;
    }
    100% {
      opacity: 0;
      transform: translateY(0.35rem) scale(0.86);
      filter: grayscale(1) brightness(0.68);
    }
  }

  @keyframes rift-force-group-late {
    0%,
    32.4% {
      opacity: 0;
      transform: translateY(-0.15rem) scale(0.9);
    }
    39.2%,
    100% {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  @keyframes rift-force-group-late-loses {
    0%,
    32.4% {
      opacity: 0;
      transform: translateY(-0.15rem) scale(0.9);
      filter: none;
    }
    39.2%,
    59.5% {
      opacity: 1;
      transform: translateY(0) scale(1);
      filter: none;
    }
    100% {
      opacity: 0;
      transform: translateY(0.35rem) scale(0.86);
      filter: grayscale(1) brightness(0.68);
    }
  }

  @keyframes rift-mini-phase-late {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  .draft-option {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.9rem;
  }

  @keyframes conflict-pulse {
    0%,
    100% {
      box-shadow: inset 0 0 0 1px rgba(238, 243, 246, 0.16);
    }
    45% {
      box-shadow:
        inset 0 0 0 3px rgba(255, 96, 96, 0.74),
        0 0 24px rgba(255, 80, 80, 0.34);
    }
  }

  .unit-button-art {
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

  @keyframes incoming-archive-row-expand {
    from {
      height: 0;
      margin-top: 0;
      margin-bottom: 0;
    }
    to {
      height: calc(var(--battle-log-row-height, 3.35rem));
      margin-top: 0;
      margin-bottom: 0;
    }
  }

  @keyframes incoming-archive-card-fly {
    0% {
      width: var(--flight-from-width, 8rem);
      height: var(--flight-from-height, 3rem);
      opacity: 1;
      transform: translate(var(--flight-from-x), var(--flight-from-y));
      filter: brightness(1.18) saturate(1.12);
    }
    58% {
      width: var(--flight-from-width, 8rem);
      height: var(--flight-from-height, 3rem);
    }
    82% {
      width: var(--flight-to-width, 15rem);
      height: var(--flight-to-height, 3.35rem);
      transform: translate(var(--flight-to-x), var(--flight-to-y));
      filter: brightness(1.12) saturate(1.08);
    }
    100% {
      width: var(--flight-to-width, 15rem);
      height: var(--flight-to-height, 3.35rem);
      opacity: 1;
      transform: translate(var(--flight-to-x), var(--flight-to-y));
      filter: none;
    }
  }

  @keyframes incoming-flight-mini-fade {
    0%,
    54% {
      opacity: 1;
    }
    86%,
    100% {
      opacity: 0;
    }
  }

  @keyframes incoming-flight-archive-fade {
    0%,
    54% {
      opacity: 0;
    }
    86%,
    100% {
      opacity: 1;
    }
  }

  .draft-offer-block {
    display: grid;
    gap: 0.45rem;
  }

  .draft-helper-copy {
    color: var(--ui-color-text-dim);
    font-size: 0.82rem;
    line-height: 1.35;
  }

  .draft-offer-block {
    padding-top: var(--ui-space-xs);
  }

  .essence-draft-panel.soft-highlight {
    border-color: rgba(211, 176, 255, 0.72);
    box-shadow:
      0 0 0 2px rgba(211, 176, 255, 0.2),
      0 0 28px rgba(155, 95, 220, 0.34),
      var(--ui-shadow-panel);
  }

  .essence-draft-panel {
    gap: 0.55rem;
  }

  .footer-essence-draft-panel {
    grid-column: 1;
    grid-row: 2;
    width: fit-content;
    max-width: 100%;
    justify-self: start;
    align-self: end;
    padding: 0.6rem 0.7rem;
    border-radius: 12px;
    --troop-icon-box-size: 2.9rem;
  }

  .essence-draft-groups {
    position: relative;
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 0.7rem;
    align-items: stretch;
  }

  .footer-essence-draft-panel .essence-draft-groups {
    grid-template-columns: max-content max-content;
    gap: 0.45rem;
    align-items: start;
  }

  .footer-essence-draft-panel .draft-offer-block {
    min-width: 0;
    gap: 0.25rem;
    padding-top: 0;
    justify-items: stretch;
  }

  .footer-essence-draft-panel .troop-draft-option-list {
    grid-template-columns: repeat(3, minmax(2.75rem, var(--troop-icon-box-size, 3rem)));
    justify-content: start;
    gap: 0.15rem;
  }

  .footer-essence-draft-panel .troop-icon-option {
    padding: 0.3rem;
  }

  .footer-essence-draft-panel .unlock-row {
    gap: 1px;
    justify-items: start;
  }

  .footer-essence-draft-panel .draft-upgrade-option {
    display: inline-flex;
    width: fit-content;
    max-width: min(31rem, calc(100vw - 2.4rem));
    min-height: 2.25rem;
    padding: 0.32rem 0.44rem;
    align-items: center;
    justify-content: flex-start;
    gap: 0.16rem;
  }

  .footer-essence-draft-panel .draft-upgrade-option .icon-label {
    width: auto;
    line-height: 1.15;
  }

  .footer-essence-draft-panel .draft-upgrade-option .icon-label > span {
    overflow-wrap: anywhere;
    white-space: normal;
  }

  .footer-essence-draft-panel .affected-troop-strip {
    flex: 0 0 auto;
    max-width: 4.5rem;
  }

  .footer-essence-draft-panel .affected-troop-strip img {
    width: 1.15rem;
    height: 1.15rem;
  }

  .footer-essence-draft-panel .primary {
    min-height: 2.15rem;
    padding: 0.35rem 0.55rem;
  }

  .draft-reroll-button {
    position: relative;
    z-index: 2;
    justify-self: center;
    display: grid;
    place-items: center;
    width: 2rem;
    height: 2rem;
    padding: 0;
    border: 1px solid rgba(124, 153, 176, 0.26);
    border-radius: 999px;
    background:
      radial-gradient(circle at 50% 42%, rgba(244, 205, 118, 0.12), transparent 58%),
      rgba(11, 18, 27, 0.82);
    color: #c6d5df;
    cursor: pointer;
    transition:
      border-color 140ms ease,
      color 140ms ease,
      filter 140ms ease,
      opacity 140ms ease,
      transform 140ms ease;
  }

  .draft-reroll-button:hover,
  .draft-reroll-button:focus-visible,
  .draft-reroll-button.reroll-hovered {
    border-color: rgba(244, 205, 118, 0.66);
    color: #f4d886;
    transform: translateY(-1px);
    outline: none;
  }

  .draft-reroll-button:disabled {
    cursor: default;
    opacity: 0.34;
    transform: none;
  }

  .draft-reroll-button.reroll-other-hovered {
    border-color: rgba(175, 83, 83, 0.56);
    color: #78808a;
    filter: grayscale(1) brightness(0.68);
    opacity: 0.58;
  }

  .draft-reroll-button.reroll-other-hovered::before,
  .draft-reroll-button.reroll-other-hovered::after {
    position: absolute;
    left: 50%;
    top: 50%;
    width: 1.55rem;
    height: 0.18rem;
    border-radius: 999px;
    background: #d84646;
    box-shadow: 0 0 8px rgba(216, 70, 70, 0.46);
    content: '';
    transform-origin: center;
  }

  .draft-reroll-button.reroll-other-hovered::before {
    transform: translate(-50%, -50%) rotate(45deg);
  }

  .draft-reroll-button.reroll-other-hovered::after {
    transform: translate(-50%, -50%) rotate(-45deg);
  }

  .recycle-icon {
    width: 1.18rem;
    height: 1.18rem;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .draft-reroll-button.reroll-hovered .recycle-icon,
  .draft-reroll-button:hover:not(:disabled) .recycle-icon,
  .draft-reroll-button:focus-visible:not(:disabled) .recycle-icon {
    animation: recycle-spin 760ms linear infinite;
  }

  @media (prefers-reduced-motion: reduce) {
    .draft-reroll-button.reroll-hovered .recycle-icon,
    .draft-reroll-button:hover:not(:disabled) .recycle-icon,
    .draft-reroll-button:focus-visible:not(:disabled) .recycle-icon {
      animation: none;
    }
  }

  @keyframes recycle-spin {
    to {
      transform: rotate(360deg);
    }
  }

  .draft-offer-block.reroll-replace-preview {
    position: relative;
  }

  .draft-offer-block.reroll-replace-preview > :not(.assignment-label):not(.draft-reroll-button) {
    animation: draft-replace-fade 900ms ease-in-out infinite;
    filter: brightness(0.52) saturate(0.72);
  }

  .draft-offer-block.reroll-replace-preview > .assignment-label {
    color: rgba(166, 176, 185, 0.72);
  }

  .draft-offer-block.reroll-replace-preview::after {
    position: absolute;
    inset: 1.55rem 0 2.25rem;
    border-radius: var(--ui-panel-radius-tight);
    background: rgba(3, 6, 10, 0.34);
    box-shadow: inset 0 0 0 1px rgba(216, 70, 70, 0.14);
    content: '';
    pointer-events: none;
  }

  @media (prefers-reduced-motion: reduce) {
    .draft-offer-block.reroll-replace-preview > :not(.assignment-label):not(.draft-reroll-button) {
      animation: none;
      opacity: 0.48;
    }
  }

  @keyframes draft-replace-fade {
    0%,
    100% {
      opacity: 0.58;
    }

    50% {
      opacity: 0.34;
    }
  }

  .draft-offer-block.locked {
    border-color: rgba(111, 190, 146, 0.38);
    background: rgba(19, 42, 32, 0.58);
  }

  .locked-draft-card {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 0.5rem;
    padding: 0.45rem 0.55rem;
    border: 1px solid rgba(111, 190, 146, 0.34);
    border-radius: var(--ui-panel-radius-tight);
    background: rgba(9, 20, 16, 0.46);
    color: #d8f4df;
  }

  .locked-draft-icon-card {
    grid-template-columns: auto auto;
    width: fit-content;
    min-height: 2.35rem;
    justify-content: start;
  }

  .locked-draft-icon-card .chip-unit-cluster {
    width: var(--troop-icon-box-size, 2.9rem);
    height: var(--troop-icon-box-size, 2.9rem);
  }

  .confirmed-check {
    position: relative;
    display: inline-block;
    width: 1rem;
    height: 1rem;
    border-radius: 50%;
    background: rgba(64, 190, 112, 0.2);
    border: 1px solid rgba(133, 240, 168, 0.72);
    box-shadow: 0 0 10px rgba(64, 190, 112, 0.28);
  }

  .confirmed-check::after {
    position: absolute;
    left: 0.28rem;
    top: 0.15rem;
    width: 0.32rem;
    height: 0.56rem;
    border-right: 2px solid #9cf4b0;
    border-bottom: 2px solid #9cf4b0;
    content: '';
    transform: rotate(45deg);
  }

  .draft-option.upgrade-affected {
    position: relative;
  }

  .upgrade-plus-badge {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    content: '+';
    color: rgba(154, 255, 180, 0.72);
    font-size: 2.6rem;
    font-weight: 900;
    line-height: 1;
    pointer-events: none;
    text-shadow: 0 0 12px rgba(70, 211, 111, 0.44);
  }

  .draft-upgrade-option {
    align-content: start;
  }

  .affected-troop-strip .draft-affected {
    border-color: rgba(128, 196, 255, 0.58);
    filter: grayscale(1) brightness(0.62);
    opacity: 0.42;
    transition:
      filter 120ms ease,
      opacity 120ms ease;
  }

  .affected-troop-strip .draft-affected.selected-draft-target {
    filter: none;
    opacity: 1;
  }

  .essence-draft-panel .primary {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.25rem;
  }

  .reveal-draft-button.soft-highlight {
    box-shadow:
      inset 0 0 0 2px rgba(238, 216, 255, 0.72),
      0 0 24px rgba(184, 108, 255, 0.5);
  }

  @keyframes copy-indicator-pop {
    from {
      opacity: 0;
      transform: translateY(0.18rem) scale(0.96);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  @keyframes available-unit-bob {
    0%,
    100% {
      translate: 0 0;
    }
    50% {
      translate: 0 -5px;
    }
  }

  @keyframes assignment-arrow-flow {
    to {
      stroke-dashoffset: -24;
    }
  }

  @keyframes assignment-attention-pulse {
    0%,
    100% {
      border-color: rgba(211, 176, 255, 0.54);
      box-shadow:
        0 0 0 1px rgba(211, 176, 255, 0.14),
        0 0 14px rgba(155, 95, 220, 0.2),
        var(--ui-shadow-panel);
    }
    50% {
      border-color: rgba(238, 216, 255, 0.94);
      box-shadow:
        0 0 0 3px rgba(211, 176, 255, 0.28),
        0 0 32px rgba(184, 108, 255, 0.5),
        var(--ui-shadow-panel);
    }
  }

  .draft-option {
    padding: var(--ui-space-sm);
  }

  :global(.troops-mode) .unlock-row {
    gap: 0.45rem;
  }

  :global(.troops-mode) .footer-essence-draft-panel .unlock-row {
    gap: 1px;
  }

  :global(.troops-mode) .list-button {
    padding: 0.55rem 0.65rem;
  }

  :global(.troops-mode) .unit-button-art {
    width: 2.2rem;
    height: 2.2rem;
  }

  .affected-troop-strip {
    display: inline-flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 0.2rem;
  }

  .affected-troop-strip img {
    width: 1.35rem;
    height: 1.35rem;
    image-rendering: pixelated;
    object-fit: contain;
  }

  @media (max-width: 820px) {

    .essence-draft-groups {
      grid-template-columns: 1fr;
    }

    .footer-essence-draft-panel .essence-draft-groups {
      grid-template-columns: 1fr;
    }

    .footer-essence-draft-panel {
      width: calc(100vw - 1.5rem);
      max-width: calc(100vw - 1.5rem);
      justify-self: stretch;
    }

    .footer-essence-draft-panel .draft-offer-block {
      width: 100%;
    }

    .footer-essence-draft-panel .troop-draft-option-list {
      grid-template-columns: repeat(3, minmax(2.75rem, 1fr));
      width: 100%;
    }

    .footer-essence-draft-panel .unlock-row {
      width: 100%;
    }

    .footer-essence-draft-panel .draft-upgrade-option {
      width: 100%;
      max-width: none;
    }

    .footer-essence-draft-panel {
      grid-column: 1;
    }
  }

</style>
