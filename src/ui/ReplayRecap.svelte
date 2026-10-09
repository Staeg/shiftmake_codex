<script lang="ts">
  import type { BattleReplay, BattleUnit, RaceId, SideId, UnitClassId } from '../engine/types';
  import { formatFixed } from '../engine/fixed';
  import { buildBattleRecap, type BattleRecapTroopEntry } from './battleRecap';

  export let replay: BattleReplay;
  export let snapshot: BattleUnit[];
  export let getRaceUnitPortrait: (raceId: RaceId, unitClassId: UnitClassId) => string;
  export let onClose: () => void;
  export let onInspect: (unitId: string, side: SideId, troopLabel: string) => void;

  let expandedReplayRecapTroopKey: string | null = null;
  let previousReplay: BattleReplay | null = null;
  const replayProfileKey = (side: SideId, troopLabel: string): string => `${side}:${troopLabel}`;

  $: if (previousReplay !== replay) {
    previousReplay = replay;
    expandedReplayRecapTroopKey = null;
  }
  $: recap = buildBattleRecap(replay);
  $: replayRecapSides = [
    { side: 'player' as const, label: 'Player', troops: recap.filter((entry) => entry.side === 'player') },
    { side: 'enemy' as const, label: 'Enemy', troops: recap.filter((entry) => entry.side === 'enemy') },
  ];
  $: profiles = new Map(replay.troopProfiles.map((profile) => [replayProfileKey(profile.side, profile.troopLabel), profile]));
  $: currentUnitById = new Map(snapshot.map((unit) => [unit.id, unit]));

  function getReplayRecapTroopProfile(side: SideId, troopLabel: string) {
    return profiles.get(replayProfileKey(side, troopLabel)) ?? null;
  }

  function getReplayRecapUnitState(unitId: string): BattleUnit | null {
    return currentUnitById.get(unitId) ?? null;
  }

  function getReplayRecapBarWidth(value: number, total: number): string {
    return value > 0 && total > 0 ? `${Math.min(100, value / total * 100)}%` : '0%';
  }

  function getReplayRecapSharedScaleTotal(troops: BattleRecapTroopEntry[]): number {
    return Math.max(
      troops.reduce((sum, troop) => sum + troop.damageDone, 0),
      troops.reduce((sum, troop) => sum + troop.healingDone, 0),
    );
  }

  function toggleReplayRecapTroop(side: SideId, troopLabel: string): void {
    const key = replayProfileKey(side, troopLabel);
    expandedReplayRecapTroopKey = expandedReplayRecapTroopKey === key ? null : key;
  }
</script>

<div class="replay-recap-backdrop">
  <button class="replay-recap-dismiss" type="button" aria-label="Close battle recap" on:click={onClose}></button>
  <section class="panel replay-recap-modal" role="dialog" aria-modal="true" aria-labelledby="battle-recap-title">
    <div class="replay-recap-header">
      <div>
        <p class="eyebrow">Battle Recap</p>
        <h2 id="battle-recap-title">Damage And Healing By Troop</h2>
        <p>Click a troop to open its units. Clicking a unit focuses it on the battlefield and rewinds if needed.</p>
      </div>
      <button class="replay-recap-close" type="button" aria-label="Close battle recap" on:click={onClose}>Close</button>
    </div>

    <div class="replay-recap-sides">
      {#each replayRecapSides as sideGroup}
        <section class="replay-recap-side">
          <div class="alive-side-header" class:enemy={sideGroup.side === 'enemy'}>
            <span>{sideGroup.label}</span>
            <strong>{sideGroup.troops.length}</strong>
          </div>

          {#if sideGroup.troops.length === 0}
            <p class="replay-recap-empty">No troops recorded.</p>
          {:else}
            {@const sharedScaleTotal = getReplayRecapSharedScaleTotal(sideGroup.troops)}
            <div class="replay-recap-list">
              {#each sideGroup.troops as troop}
                {@const troopProfile = getReplayRecapTroopProfile(troop.side, troop.troopLabel)}
                <div class="replay-recap-group">
                  <button
                    type="button"
                    class="replay-recap-row troop"
                    class:expanded={expandedReplayRecapTroopKey === replayProfileKey(troop.side, troop.troopLabel)}
                    on:click={() => toggleReplayRecapTroop(troop.side, troop.troopLabel)}
                  >
                    {#if troopProfile}
                      <img class="replay-recap-art" src={getRaceUnitPortrait(troopProfile.raceId, troopProfile.unitClassId)} alt="" aria-hidden="true" />
                    {/if}
                    <div class="replay-recap-main">
                      <strong>{troop.troopLabel}</strong>
                      <small>{expandedReplayRecapTroopKey === replayProfileKey(troop.side, troop.troopLabel) ? 'Hide units' : 'Show units'}</small>
                      <div class="replay-recap-bars">
                        <div class="replay-recap-bar damage">
                          <span style={`width: ${getReplayRecapBarWidth(troop.damageDone, sharedScaleTotal)}`}></span>
                        </div>
                        <div class="replay-recap-bar healing">
                          <span style={`width: ${getReplayRecapBarWidth(troop.healingDone, sharedScaleTotal)}`}></span>
                        </div>
                      </div>
                    </div>
                    <div class="replay-recap-stats">
                      <span>Dmg {formatFixed(troop.damageDone)}</span>
                      <span>Heal {formatFixed(troop.healingDone)}</span>
                      <span>Kills {troop.kills}</span>
                    </div>
                  </button>

                  {#if expandedReplayRecapTroopKey === replayProfileKey(troop.side, troop.troopLabel)}
                    <div class="replay-recap-units">
                      {#each troop.units as unit}
                        {@const unitState = getReplayRecapUnitState(unit.unitId)}
                        <button type="button" class="replay-recap-row unit" aria-label={`Inspect ${unit.unitLabel}`} on:click={() => onInspect(unit.unitId, troop.side, troop.troopLabel)}>
                          {#if troopProfile}
                            <img class="replay-recap-art small" src={getRaceUnitPortrait(troopProfile.raceId, troopProfile.unitClassId)} alt="" aria-hidden="true" />
                          {/if}
                          <div class="replay-recap-main">
                            <strong>{unit.unitLabel}</strong>
                            <small>{unitState?.alive ? 'Alive at this step' : 'Dead at this step'}</small>
                            <div class="replay-recap-bars">
                              <div class="replay-recap-bar damage">
                                <span style={`width: ${getReplayRecapBarWidth(unit.damageDone, sharedScaleTotal)}`}></span>
                              </div>
                              <div class="replay-recap-bar healing">
                                <span style={`width: ${getReplayRecapBarWidth(unit.healingDone, sharedScaleTotal)}`}></span>
                              </div>
                            </div>
                          </div>
                          <div class="replay-recap-stats">
                            <span>Dmg {formatFixed(unit.damageDone)}</span>
                            <span>Heal {formatFixed(unit.healingDone)}</span>
                            <span>Kills {unit.kills}</span>
                          </div>
                        </button>
                      {/each}
                    </div>
                  {/if}
                </div>
              {/each}
            </div>
          {/if}
        </section>
      {/each}
    </div>
  </section>
</div>

<style>
  .replay-recap-backdrop {
    position: fixed;
    inset: 0;
    z-index: 12;
    display: grid;
    place-items: center;
    padding: var(--ui-space-md);
  }

  .replay-recap-dismiss {
    position: absolute;
    inset: 0;
    border: 0;
    background: rgba(3, 7, 12, 0.68);
    backdrop-filter: blur(8px);
  }

  .replay-recap-modal {
    position: relative;
    z-index: 1;
    width: min(880px, 100%);
    max-height: min(88dvh, 760px);
    overflow: hidden;
    gap: var(--ui-space-sm);
  }

  .replay-recap-header {
    display: flex;
    align-items: start;
    justify-content: space-between;
    gap: 0.85rem;
  }

  .replay-recap-header h2 {
    margin: 0.15rem 0 0.25rem;
    font-size: 1.2rem;
  }

  .replay-recap-header p:last-child {
    margin: 0;
    color: #9db2c4;
  }

  .replay-recap-close {
    padding: 0.45rem 0.75rem;
    border-radius: 999px;
    border: 1px solid rgba(196, 214, 227, 0.22);
    background: rgba(12, 18, 28, 0.52);
    color: #f4f7fb;
    font: inherit;
  }

  .replay-recap-sides {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--ui-space-md);
    min-height: 0;
    overflow: auto;
  }

  .replay-recap-side {
    display: grid;
    gap: 0.55rem;
    align-content: start;
    min-height: 0;
  }

  .replay-recap-list,
  .replay-recap-units {
    display: grid;
    gap: 0.4rem;
  }

  .replay-recap-group {
    display: grid;
    gap: 0.4rem;
  }

  .replay-recap-row {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 0.55rem;
    width: 100%;
    padding: 0.55rem 0.65rem;
    border-radius: 14px;
    border: 1px solid rgba(124, 153, 176, 0.15);
    background: rgba(20, 28, 38, 0.7);
    color: #f4f7fb;
    text-align: left;
    font: inherit;
  }

  .replay-recap-row.troop.expanded,
  .replay-recap-row:hover,
  .replay-recap-row:focus-visible {
    border-color: rgba(213, 178, 116, 0.55);
    background: rgba(36, 28, 18, 0.75);
  }

  .replay-recap-row.unit {
    margin-left: 0.75rem;
    width: calc(100% - 0.75rem);
    background: rgba(14, 21, 31, 0.88);
  }

  .replay-recap-main {
    display: grid;
    gap: 0.18rem;
    min-width: 0;
  }

  .replay-recap-art {
    width: 2.2rem;
    height: 2.2rem;
    object-fit: contain;
    image-rendering: pixelated;
    filter: drop-shadow(0 0 8px rgba(0, 0, 0, 0.28));
  }

  .replay-recap-art.small {
    width: 1.9rem;
    height: 1.9rem;
  }

  .replay-recap-bars {
    display: grid;
    gap: 0.28rem;
    margin-top: 0.18rem;
  }

  .replay-recap-bar {
    height: 0.4rem;
    overflow: hidden;
    border-radius: 999px;
    background: rgba(116, 140, 161, 0.22);
  }

  .replay-recap-bar span {
    display: block;
    height: 100%;
    min-width: 0;
    border-radius: inherit;
  }

  .replay-recap-bar.damage span {
    background: linear-gradient(90deg, rgba(224, 123, 91, 0.9), rgba(255, 185, 122, 0.92));
  }

  .replay-recap-bar.healing span {
    background: linear-gradient(90deg, rgba(82, 198, 140, 0.9), rgba(147, 240, 183, 0.95));
  }

  .replay-recap-main small {
    color: #9db2c4;
  }

  .replay-recap-stats {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 0.45rem;
    color: #d8e1e9;
    font-size: 0.82rem;
  }

  .replay-recap-empty {
    margin: 0;
    color: #8fa3b5;
  }
  .eyebrow {
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--ui-color-accent);
    font-size: var(--ui-text-label);
    line-height: var(--ui-line-label);
  }

  .alive-side-header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.75rem;
    padding-bottom: 0.45rem;
    border-bottom: 1px solid rgba(126, 157, 181, 0.16);
  }

  .alive-side-header span {
    color: #c9d8e5;
    font-size: 0.95rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .alive-side-header strong {
    font-size: 1.5rem;
  }

  .alive-side-header.enemy strong {
    color: #ffb8b8;
  }

  .panel {
    box-sizing: border-box;
    min-width: 0;
    display: grid;
    gap: var(--ui-panel-gap);
    padding: var(--ui-panel-padding);
    border-radius: var(--ui-panel-radius);
    border: var(--ui-border-subtle);
    background:
      linear-gradient(160deg, var(--ui-color-surface-strong), rgba(10, 15, 24, 0.94)),
      radial-gradient(circle at top right, rgba(95, 135, 170, 0.12), transparent 35%);
    box-shadow: var(--ui-shadow-panel);
  }

  .panel * {
    min-width: 0;
  }


  @media (max-width: 1280px) {
    .replay-recap-sides { grid-template-columns: 1fr; }
  }
</style>
