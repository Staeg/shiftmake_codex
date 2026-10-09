<script lang="ts" context="module">
  import type { TroopId, UpgradeId } from '../engine/types';
  import type { DetailCard } from './detailCards';
  export interface RiftInspection {
    preview(detail: DetailCard): void;
    clear(): void;
    pin(detail: DetailCard): void;
    highlightedKeys: Set<string>;
  }
  export interface RiftPlanning {
    editable: boolean;
    submitted: boolean;
    selectedRiftId: string | null;
    selectedTroopId: TroopId | null;
    hintRiftId: string | null;
    upgradeId: UpgradeId | null;
    holdingTroopIds: Set<TroopId>;
    selectTroop(troopId: TroopId, detail: DetailCard): void;
  }
</script>
<script lang="ts">
  import type { GameState, RiftResolutionRecord, RaceId, UnitClassId,
    ResolvedCombatantDefinition } from '../engine/types';
  import { canAssignTroopToRift } from '../engine/game';
  import { upgradeAffectsTroop } from '../engine/upgrades';
  import { getMutator } from '../engine/unitCatalog';
  import { buildMutatorDetail, buildResolvedUnitDetail, buildRiftTierDetail,
    riftTierTooltip, formatRiftTierLabel, formatRiftDisplayId,
    unitIconCopies, unitIconColumns, unitIconDensityClass } from './detailCards';
  import { getRiftVisual } from './riftVisuals';
  import { getRiftBattleAnimationView, getAnimationLeftCombatantGroups,
    getAnimationRightCombatantGroups, getRecordForBattlePhase, phaseResultSource,
    healthToneForAnimationSide, resultForBattleSource } from './riftBattlePresentation';
  import { RIFT_BATTLE_LATE_PHASE_DELAY_MS } from './cyclePresentationSession';
  import { isCurrentTroopDropTarget as isCurrentDropTarget,
    type TroopAssignmentInteraction, type TroopDragState } from './troopAssignmentInteraction';
  import GameIcon from './GameIcon.svelte';
  import RiftBattleMiniReplay from './RiftBattleMiniReplay.svelte';

  export let game: GameState;
  export let records: readonly RiftResolutionRecord[] = [];
  export let resolving = false;
  export let planning: RiftPlanning;
  export let inspection: RiftInspection;
  export let interaction: TroopAssignmentInteraction;
  export let opponentName = 'Rival';
  export let portraits: Record<string, string> = {};
  export let getRaceUnitPortrait: (raceId: RaceId, unitClassId: UnitClassId) => string;

  $: discoveredRifts = game.openRifts.filter(rift => rift.state === 'discovered');
  const previewDetail = (detail: DetailCard) => inspection.preview(detail);
  const clearDetail = () => inspection.clear();
  const togglePinnedDetail = (detail: DetailCard) => inspection.pin(detail);

  function combatantDetail(detailKey: string, combatant: ResolvedCombatantDefinition, description: string): DetailCard {
    return buildResolvedUnitDetail({ detailKey, label: combatant.label,
      raceId: combatant.raceId, unitClassId: combatant.unitClassId,
      stats: combatant.stats, quantity: combatant.quantity, description,
      abilities: combatant.abilities, statBreakdowns: combatant.statBreakdowns, getRaceUnitPortrait });
  }

  function controllerLabel(controller: string | undefined): string {
    if (controller === 'playerOne' || controller === 'human') return 'Held By You';
    if (controller === 'playerTwo' || controller === 'ai') return `Held By ${opponentName}`;
    return 'Neutral Guardians';
  }

  function dropMessage(game: GameState, drag: TroopDragState | null, riftId: string): string | null {
    if (!drag?.active || drag.dropTarget?.kind !== 'rift' || drag.dropTarget.riftId !== riftId) return null;
    const result = canAssignTroopToRift(game, drag.troopId, riftId);
    return result.ok ? null : result.issues[0]?.message ?? 'This troop cannot be assigned here.';
  }

  function upgradeAffected(game: GameState, troopId: TroopId, upgradeId: UpgradeId | null): boolean {
    const troop = game.troops.find(entry => entry.id === troopId);
    return !!upgradeId && !!troop && upgradeAffectsTroop(upgradeId, troop);
  }
</script>

        <div class="rift-grid">
          {#each discoveredRifts as rift}
            {@const riftVisual = getRiftVisual(rift)}
            {@const battleAnimation = getRiftBattleAnimationView(records, rift)}
            <article
              class="rift-card ui-debug-target"
              class:contest-neutral={game.gameMode === 'contest' && (!rift.controller || rift.controller === 'neutral')}
              class:contest-human-held={game.gameMode === 'contest' && (rift.controller === 'playerOne' || rift.controller === 'human')}
              class:contest-ai-held={game.gameMode === 'contest' && (rift.controller === 'playerTwo' || rift.controller === 'ai')}
              class:archive-highlighted={planning.selectedRiftId === rift.id}
              class:assignment-hint-rift={planning.hintRiftId === rift.id}
              class:drop-target-unavailable={!!$interaction.drag && !planning.submitted && !resolving && !canAssignTroopToRift(game, $interaction.drag.troopId, rift.id).ok}
              data-ui-name={`Rift card ${formatRiftDisplayId(rift.id)}`}
              data-rift-id={rift.id}
              data-assignment-hint-rift={rift.id}
              data-tutorial-target="rift-card"
              class:drop-target-active={$interaction.drag?.active && isCurrentDropTarget($interaction.drag.dropTarget, 'rift', rift.id)}
              class:drop-target-blocked={planning.submitted || !!dropMessage(game, $interaction.drag, rift.id)}
              data-rift-drop-target={planning.editable ? rift.id : undefined}
              on:dragover={interaction.allowNativeDrop}
              on:drop={(event) => interaction.finishNativeDrop(event, { kind: 'rift', riftId: rift.id })}
            >
              <div
                class="title-button rift-title-card"
                style={`--rift-tint:${riftVisual.tint}; --rift-glow:${riftVisual.glow}; --rift-rotation:${riftVisual.rotationDeg}deg;`}
              >
                <header class="rift-title-line">
                  <button
                    type="button"
                    class="rift-tier-pill rift-info-pill ui-debug-target"
                    data-ui-name={`Tier ${rift.tier} info on ${formatRiftDisplayId(rift.id)}`}
                    aria-label={riftTierTooltip(rift.tier, game.gameMode)}
                    on:mouseenter={() => previewDetail(buildRiftTierDetail(rift, game.gameMode))}
                    on:focus={() => previewDetail(buildRiftTierDetail(rift, game.gameMode))}
                    on:mouseleave={clearDetail}
                    on:blur={clearDetail}
                    on:click={() => togglePinnedDetail(buildRiftTierDetail(rift, game.gameMode))}
                  >{formatRiftTierLabel(rift.tier)}</button>
                  {#if game.gameMode === 'contest'}
                    <span class="control-pill">{controllerLabel(rift.controller)}</span>
                  {/if}
                  {#if rift.mutatorIds.length === 0}
                    <span class="mutator-chip empty rift-mutator-chip">None</span>
                  {:else}
                    {#each rift.mutatorIds as mutatorId}
                      <button
                        class="mutator-chip rift-mutator-chip ui-debug-target"
                        data-ui-name={`Mutator ${getMutator(mutatorId).label} on ${formatRiftDisplayId(rift.id)}`}
                        data-tutorial-target="rift-mutator"
                        on:mouseenter={() => previewDetail(buildMutatorDetail(mutatorId))}
                        on:focus={() => previewDetail(buildMutatorDetail(mutatorId))}
                        on:mouseleave={clearDetail}
                        on:blur={clearDetail}
                        on:click={() => togglePinnedDetail(buildMutatorDetail(mutatorId))}
                      >
                        <span class="icon-label"><GameIcon kind="mutator" id={mutatorId} label={getMutator(mutatorId).label} /><span>{getMutator(mutatorId).label}</span></span>
                      </button>
                    {/each}
                  {/if}
                </header>
                <div class="rift-visual-shell inline">
                  <div class="rift-visual-frame">
                    <img
                      class="rift-visual-image"
                      src={riftVisual.imageUrl}
                      alt=""
                      aria-hidden="true"
                      style={`filter:${riftVisual.filter};`}
                    />
                  </div>
                </div>
              </div>

              <div class="rift-battle-lane">
                <div class="assigned-strip enemy-strip rift-force-side rift-force-left">
                  {#each getAnimationLeftCombatantGroups(game, records, rift, battleAnimation) as group (group.key)}
                    <div class={`rift-force-combatant-group ${group.phaseClass} ${group.lossClass ?? ''}`}>
                      {#each group.combatants as enemy}
                        {@const enemyDetail = combatantDetail(`enemy:${rift.id}:${enemy.combatantId}`, enemy, 'Enemy troop')}
                        <button
                          class="unit-tile enemy-tile ui-debug-target"
                          data-ui-name={`Enemy troop ${enemy.label} on ${formatRiftDisplayId(rift.id)}`}
                          data-tutorial-target="rift-enemy"
                          class:selected={inspection.highlightedKeys.has(enemyDetail.detailKey)}
                          on:mouseenter={() => previewDetail(enemyDetail)}
                          on:focus={() => previewDetail(enemyDetail)}
                          on:mouseleave={clearDetail}
                          on:blur={clearDetail}
                          on:click={() => togglePinnedDetail(enemyDetail)}
                        >
                          <span class={`unit-icon-cluster tile-unit-cluster ${unitIconDensityClass(enemy.quantity)}`} style={`--unit-cluster-columns:${unitIconColumns(enemy.quantity)}`} aria-label={`${enemy.quantity} ${enemy.label} units`}>
                            {#each unitIconCopies(enemy.quantity) as copy}
                              <img class="unit-tile-art" src={getRaceUnitPortrait(enemy.raceId, enemy.unitClassId)} alt="" aria-hidden={copy === 0 ? 'false' : 'true'} />
                            {/each}
                          </span>
                        </button>
                      {/each}
                    </div>
                  {/each}
                </div>

                <div class="rift-battle-center">
                  {#if battleAnimation}
                    <div class="rift-battle-animation" aria-hidden="true">
                      {#each battleAnimation.phases as phase (phase.key)}
                        {@const phaseRecord = getRecordForBattlePhase(records, phase)}
                        {@const phasePerspective = phaseResultSource(phase)}
                        <div class={`rift-battle-phase ${phase.delayClass}`} data-flight-replay-id={phaseRecord?.replay.id}>
                          {#if phaseRecord}
                            <RiftBattleMiniReplay
                              replay={phaseRecord.replay}
                              leftSource={phase.leftSource}
                              rightSource={phase.rightSource}
                              leftHealthTone={healthToneForAnimationSide(phase.left)}
                              rightHealthTone={healthToneForAnimationSide(phase.right)}
                              result={resultForBattleSource(phaseRecord.outcome, phasePerspective.source)}
                              opponentOutcome={phasePerspective.opponentOutcome}
                              delayMs={phase.delayClass === 'phase-late' ? RIFT_BATTLE_LATE_PHASE_DELAY_MS : 0}
                              {portraits}
                            />
                          {/if}
                        </div>
                      {/each}
                    </div>
                  {/if}
                </div>

                <div class="assigned-strip rift-force-side rift-force-right">
                  {#if $interaction.drag?.active && $interaction.drag.dropTarget?.kind === 'rift' && $interaction.drag.dropTarget.riftId === rift.id && !dropMessage(game, $interaction.drag, rift.id)}
                    <div class="unit-tile drop-preview-tile">
                      <img class="unit-tile-art" src={$interaction.drag.portraitUrl} alt="" aria-hidden="true" />
                    </div>
                  {/if}
                  {#each getAnimationRightCombatantGroups(game, records, rift, battleAnimation) as group (group.key)}
                    <div class={`rift-force-combatant-group ${group.phaseClass} ${group.lossClass ?? ''}`}>
                    {#each group.combatants as combatant}
                    {@const troopId = combatant.troopInstanceId}
                    {@const assignedDetail = combatantDetail(`rift-right:${rift.id}:${combatant.combatantId}`, combatant, group.participant ? `${group.participant.label} force` : 'Assigned to this Rift')}
                    <button
                      class="unit-tile assigned-summary-tile draggable-troop-tile ui-debug-target"
                      data-ui-name={`${group.participant?.label ?? 'Assigned'} troop ${combatant.label} on ${formatRiftDisplayId(rift.id)}`}
                      class:enemy-tile={group.participant?.kind === 'opponent' || group.participant?.kind === 'neutral'}
                      class:selected={(troopId !== null && planning.selectedTroopId === troopId) || inspection.highlightedKeys.has(assignedDetail.detailKey)}
                      class:dragging-source={troopId !== null && $interaction.drag?.troopId === troopId && $interaction.drag.active}
                      class:upgrade-affected={troopId !== null && upgradeAffected(game, troopId, planning.upgradeId)}
                      class:holding={troopId !== null && planning.holdingTroopIds.has(troopId)}
                      class:conflict-pulse={troopId !== null && ($interaction.conflict?.troopId === troopId || $interaction.conflict?.conflictTroopId === troopId)}
                      class:readonly-plan={planning.submitted && troopId !== null && !group.participant}
                      aria-label={troopId !== null && !group.participant && planning.editable ? `Drag ${combatant.label} to another Rift or Available Troops` : `Inspect ${combatant.label}`}
                      on:pointerdown={(event) => {
                        if (troopId !== null && !group.participant && planning.editable) {
                          interaction.startPointer(
                            event,
                            troopId,
                            rift.id,
                            combatant.label,
                            getRaceUnitPortrait(combatant.raceId, combatant.unitClassId),
                          );
                        }
                      }}
                      on:mousedown={(event) => {
                        if (troopId !== null && !group.participant && planning.editable) {
                          interaction.startMouse(
                            event,
                            troopId,
                            rift.id,
                            combatant.label,
                            getRaceUnitPortrait(combatant.raceId, combatant.unitClassId),
                          );
                        }
                      }}
                      on:mouseenter={() => previewDetail(assignedDetail)}
                      on:focus={() => previewDetail(assignedDetail)}
                      on:mouseleave={clearDetail}
                      on:blur={clearDetail}
                      on:click={() => (troopId !== null && !group.participant ? planning.selectTroop(troopId, assignedDetail) : togglePinnedDetail(assignedDetail))}
                    >
                      <span class={`unit-icon-cluster tile-unit-cluster ${unitIconDensityClass(combatant.quantity)}`} style={`--unit-cluster-columns:${unitIconColumns(combatant.quantity)}`} aria-label={`${combatant.quantity} ${combatant.label} units`}>
                        {#each unitIconCopies(combatant.quantity) as copy}
                          <img class="unit-tile-art" src={getRaceUnitPortrait(combatant.raceId, combatant.unitClassId)} alt="" aria-hidden={copy === 0 ? 'false' : 'true'} />
                        {/each}
                      </span>
                    </button>
                    {/each}
                    </div>
                  {/each}
                </div>
              </div>

              {#if dropMessage(game, $interaction.drag, rift.id)}
                <p class="drop-conflict-message">{dropMessage(game, $interaction.drag, rift.id)}</p>
              {:else if $interaction.conflict?.riftId === rift.id}
                <p class="drop-conflict-message">{$interaction.conflict.message}</p>
              {/if}

            </article>
          {/each}
        </div>

<style>








.rift-grid {
    display: grid;
    gap: var(--ui-space-md);
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  }
.rift-grid {
    align-content: start;
    align-items: start;
  }
.assigned-strip {
    display: grid;
    gap: var(--ui-space-sm);
  }
.assigned-strip {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
.title-button {
    text-align: left;
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
.unit-tile {
    transition:
      transform 120ms ease,
      border-color 120ms ease,
      box-shadow 120ms ease,
      background 120ms ease;
  }
.unit-tile:hover,
.mutator-chip:hover {
    transform: none;
    border-color: rgba(213, 178, 116, 0.6);
    box-shadow:
      inset 0 0 0 1px rgba(213, 178, 116, 0.55),
      0 10px 22px rgba(0, 0, 0, 0.22);
  }
.title-button.selected,
.mutator-chip.selected,
.unit-tile.selected {
    background:
      linear-gradient(145deg, rgba(44, 31, 15, 0.96), rgba(17, 22, 30, 0.96)),
      radial-gradient(circle at top left, rgba(212, 173, 115, 0.18), transparent 42%);
    box-shadow:
      inset 0 0 0 2px #d4ad73,
      0 10px 22px rgba(0, 0, 0, 0.22);
  }
.readonly-plan {
    cursor: help;
    opacity: 0.78;
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
.mutator-chip :global(.game-icon) {
    --game-icon-size: 1.05rem;
  }
.mutator-chip.empty {
    color: #95a9ba;
  }
.rift-card {
    display: grid;
    gap: var(--ui-space-sm);
    align-content: start;
  }
.rift-card {
    padding: 0.75rem;
    border-radius: 20px;
    border: 1px solid rgba(126, 157, 181, 0.16);
    background:
      linear-gradient(160deg, rgba(18, 27, 38, 0.94), rgba(10, 15, 24, 0.94)),
      radial-gradient(circle at top right, rgba(95, 135, 170, 0.12), transparent 35%);
  }
.rift-card.contest-neutral {
    border-color: rgba(126, 157, 181, 0.22);
  }
.rift-card.contest-human-held {
    border-color: rgba(111, 190, 146, 0.45);
    box-shadow: inset 0 0 0 1px rgba(111, 190, 146, 0.14);
  }
.rift-card.contest-ai-held {
    border-color: rgba(221, 106, 94, 0.48);
    box-shadow: inset 0 0 0 1px rgba(221, 106, 94, 0.16);
  }
.rift-card.archive-highlighted {
    border-color: rgba(244, 205, 118, 0.92);
    box-shadow:
      0 0 0 2px rgba(244, 205, 118, 0.2),
      0 0 28px rgba(244, 205, 118, 0.26),
      var(--ui-shadow-panel);
  }
.rift-card.assignment-hint-rift {
    border-color: rgba(150, 220, 184, 0.8);
    box-shadow:
      0 0 0 2px rgba(150, 220, 184, 0.18),
      0 0 26px rgba(76, 190, 135, 0.28),
      var(--ui-shadow-panel);
  }
.rift-battle-lane {
    position: relative;
    display: grid;
    grid-template-columns: minmax(0, 4fr) minmax(3.5rem, 2fr) minmax(0, 4fr);
    align-items: stretch;
    min-height: 3.65rem;
    overflow: hidden;
    border: 1px solid rgba(213, 178, 116, 0.24);
    border-radius: 14px;
    background:
      radial-gradient(circle at center, rgba(239, 202, 124, 0.12), transparent 58%),
      linear-gradient(90deg, rgba(45, 75, 62, 0.34), rgba(16, 21, 29, 0.82) 48%, rgba(83, 36, 38, 0.34));
    box-shadow: inset 0 0 20px rgba(0, 0, 0, 0.2);
  }
.rift-force-side.assigned-strip {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    align-content: center;
    gap: 0.28rem;
    min-width: 0;
    padding: 0.45rem;
  }
.rift-force-combatant-group {
    display: contents;
  }
.rift-force-combatant-group.phase-now,
.rift-force-combatant-group.phase-late {
    display: flex;
    flex-wrap: wrap;
    gap: 0.28rem;
  }
.rift-force-combatant-group.phase-now {
    animation: rift-force-group-now 2.812s ease-in-out both;
  }
.rift-force-combatant-group.phase-late {
    opacity: 0;
    animation: rift-force-group-late 2.812s ease-in-out both;
  }
.rift-force-combatant-group.force-loses-now.phase-now {
    animation-name: rift-force-group-now-loses;
  }
.rift-force-combatant-group.force-loses-late.phase-now {
    animation-name: rift-force-group-now-loses-late;
  }
.rift-force-combatant-group.force-loses-late.phase-late {
    animation-name: rift-force-group-late-loses;
  }
.rift-force-left {
    justify-content: flex-start;
  }
.rift-force-right {
    justify-content: flex-end;
  }
.rift-battle-lane .unit-tile {
    flex: 0 0 auto;
    width: 2.55rem;
    height: 2.55rem;
    min-height: 2.55rem;
    padding: 0.25rem;
  }
.rift-battle-lane .unit-tile-art {
    width: 1.85rem;
    height: 1.85rem;
  }
.rift-battle-center {
    position: relative;
    display: grid;
    place-items: center;
    min-width: 0;
  }
.rift-battle-animation {
    position: absolute;
    inset: 0;
    display: grid;
    pointer-events: none;
  }
.rift-battle-phase {
    grid-area: 1 / 1;
    position: relative;
    min-width: 0;
    min-height: 0;
    opacity: 1;
  }
.rift-battle-phase.phase-late {
    opacity: 0;
    animation: rift-mini-phase-late 1ms linear 0.925s both;
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
@media (prefers-reduced-motion: reduce) {.rift-battle-phase,
.rift-force-side {
      animation-duration: 1ms;
      animation-delay: 0ms;
    }}
.title-button {
    width: 100%;
  }
.rift-title-card {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 0.5rem;
    align-items: center;
  }
.rift-title-line {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.3rem;
    min-width: 0;
  }
.rift-tier-pill {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 1.9rem;
    padding: 0.16rem 0.56rem;
    border-radius: 999px;
    border: 1px solid rgba(213, 178, 116, 0.3);
    background: rgba(31, 24, 16, 0.8);
    color: #f5f0de;
    font-size: 0.88rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
.rift-info-pill {
    font: inherit;
    cursor: help;
  }
.rift-info-pill:hover,
.rift-info-pill:focus-visible {
    border-color: rgba(231, 190, 105, 0.72);
    color: #fff6e5;
    box-shadow: 0 0 0 2px rgba(213, 178, 116, 0.12);
  }
.control-pill {
    display: inline-flex;
    align-items: center;
    min-height: 1.65rem;
    padding: 0.18rem 0.5rem;
    border-radius: 999px;
    border: 1px solid rgba(124, 153, 176, 0.22);
    background: rgba(7, 10, 16, 0.68);
    color: #dce7f2;
    font-size: 0.72rem;
    text-transform: uppercase;
  }
.rift-mutator-chip {
    flex: 0 1 auto;
    justify-content: center;
    text-align: center;
    min-height: 1.9rem;
    min-width: 0;
    max-width: 8.5rem;
    padding-inline: 0.5rem;
    font-size: 0.76rem;
  }
.rift-visual-shell {
    position: relative;
    display: grid;
    place-items: center;
    overflow: hidden;
    border-radius: 18px;
    background:
      radial-gradient(circle at center, var(--rift-glow), transparent 60%),
      linear-gradient(180deg, rgba(13, 22, 31, 0.92), rgba(8, 12, 18, 0.98));
  }
.rift-visual-shell::before {
    content: '';
    position: absolute;
    inset: 10%;
    border-radius: 50%;
    filter: blur(18px);
    background: radial-gradient(circle, var(--rift-tint), transparent 68%);
    opacity: 0.46;
    pointer-events: none;
  }
.rift-visual-frame {
    position: relative;
    z-index: 1;
    display: grid;
    width: min(100%, 11rem);
    height: min(100%, 11rem);
    place-items: center;
    color: var(--rift-tint);
    transform: rotate(var(--rift-rotation));
  }
.rift-visual-image {
    width: 72%;
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
  }
.rift-visual-shell.inline {
    width: 3.8rem;
    height: 3.8rem;
    min-height: 3.8rem;
    border-radius: 14px;
  }
.unit-tile {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.9rem;
  }
.unit-tile {
    position: relative;
    width: var(--troop-icon-box-size, 3.8rem);
    height: var(--troop-icon-box-size, 3.8rem);
    min-height: 0;
    aspect-ratio: 1;
    display: grid;
    place-items: stretch;
    justify-content: center;
    padding: 0.45rem;
    border: 1px solid rgba(126, 157, 181, 0.2);
    border-radius: 14px;
    background: rgba(22, 31, 42, 0.82);
    color: inherit;
    overflow: hidden;
  }
.draggable-troop-tile {
    justify-content: stretch;
    cursor: grab;
    touch-action: none;
    user-select: none;
  }
.draggable-troop-tile:active {
    cursor: grabbing;
  }
.unit-tile.selected {
    border-color: rgba(237, 197, 111, 0.82);
    box-shadow:
      inset 0 0 0 2px rgba(237, 197, 111, 0.45),
      0 0 0 1px rgba(237, 197, 111, 0.2);
  }
.unit-tile:focus-visible {
    outline: 2px dotted rgba(244, 247, 251, 0.86);
    outline-offset: 3px;
  }
.dragging-source {
    opacity: 0.45;
    filter: grayscale(0.35);
  }
.unit-tile.holding {
    cursor: help;
    border-color: rgba(120, 207, 241, 0.58);
    background:
      linear-gradient(145deg, rgba(24, 54, 68, 0.9), rgba(20, 31, 40, 0.96)),
      radial-gradient(circle at 30% 15%, rgba(137, 220, 255, 0.18), transparent 52%);
  }
.unit-tile.upgrade-affected::after {
    content: '+';
    position: absolute;
    top: -0.35rem;
    right: -0.35rem;
    width: 1.35rem;
    height: 1.35rem;
    display: grid;
    place-items: center;
    border-radius: 50%;
    background: rgba(128, 229, 161, 0.28);
    border: 1px solid rgba(156, 244, 185, 0.72);
    color: #c8ffd5;
    font-weight: 900;
  }
.conflict-pulse {
    animation: conflict-pulse 680ms ease-out 0s 2;
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
.assigned-summary-tile {
    border-color: rgba(185, 195, 203, 0.54);
    background:
      linear-gradient(145deg, rgba(78, 84, 92, 0.9), rgba(32, 37, 44, 0.96)),
      radial-gradient(circle at 30% 15%, rgba(234, 239, 242, 0.18), transparent 52%);
    box-shadow: inset 0 0 0 1px rgba(238, 243, 246, 0.16);
  }
.unit-tile.assigned-summary-tile.selected {
    border-color: rgba(218, 190, 140, 0.72);
    background:
      linear-gradient(145deg, rgba(86, 93, 102, 0.94), rgba(35, 40, 47, 0.98)),
      radial-gradient(circle at 28% 12%, rgba(246, 249, 250, 0.22), transparent 54%);
    box-shadow:
      inset 0 0 0 2px rgba(218, 190, 140, 0.45),
      0 10px 22px rgba(0, 0, 0, 0.24);
  }
.drop-target-active {
    border-color: rgba(218, 190, 140, 0.78);
    box-shadow:
      inset 0 0 0 2px rgba(218, 190, 140, 0.42),
      0 0 28px rgba(218, 190, 140, 0.18);
  }
.rift-card.drop-target-unavailable {
    border-color: rgba(129, 139, 148, 0.34);
    background:
      linear-gradient(150deg, rgba(34, 39, 45, 0.78), rgba(13, 17, 23, 0.88)),
      radial-gradient(circle at top right, rgba(132, 144, 154, 0.1), transparent 48%);
    box-shadow: inset 0 0 0 2px rgba(104, 114, 124, 0.28);
  }
.rift-card.drop-target-unavailable > :not(.drop-conflict-message) {
    filter: grayscale(1) brightness(0.48);
    opacity: 0.38;
  }
.drop-target-blocked {
    border-color: rgba(255, 102, 102, 0.8);
    box-shadow:
      inset 0 0 0 2px rgba(255, 102, 102, 0.38),
      0 0 28px rgba(255, 80, 80, 0.18);
  }
.drop-preview-tile {
    border-style: dashed;
    border-color: rgba(218, 190, 140, 0.78);
    background: rgba(73, 57, 29, 0.62);
  }
.drop-conflict-message {
    margin-top: 0.35rem;
    padding: 0.35rem 0.5rem;
    border-radius: var(--ui-panel-radius-tight);
    background: rgba(82, 20, 20, 0.78);
    color: #ffd5d5;
    font-size: 0.75rem;
  }
.enemy-tile {
    justify-content: stretch;
  }
.unit-tile-art {
    image-rendering: pixelated;
    object-fit: contain;
    filter: drop-shadow(0 0 8px rgba(0, 0, 0, 0.28));
  }
.unit-tile-art {
    width: 2.2rem;
    height: 2.2rem;
    flex: 0 0 auto;
    display: block;
    margin: auto;
  }
.unit-tile:has(.unit-icon-cluster),
.rift-battle-lane .unit-tile:has(.unit-icon-cluster) {
    justify-content: stretch;
    justify-items: stretch;
    place-items: stretch;
  }
.enemy-strip {
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 0.35rem;
  }
.enemy-strip .unit-tile {
    gap: 0.4rem;
    place-items: stretch;
    padding: 0.4rem 0.3rem;
  }
.enemy-strip .unit-tile-art {
    width: 1.8rem;
    height: 1.8rem;
  }
.rift-grid {
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  }
.rift-card {
    padding: var(--ui-space-sm);
  }
@media (max-width: 560px) {.rift-title-card {
      grid-template-columns: minmax(0, 1fr);
    }
.rift-title-line {
      order: 2;
    }
.rift-title-card .rift-visual-shell.inline {
      order: 1;
      justify-self: end;
    }}
@media (max-width: 820px) {.assigned-strip {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }}
</style>
