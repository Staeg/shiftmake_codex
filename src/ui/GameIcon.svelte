<script lang="ts">
  import type { AbilityId, MutatorId, UpgradeId } from '../engine/types';
  import { getAbilityIconUrl, getMutatorIconUrl, getUpgradeIconUrl } from './iconAssets';

  export let kind: 'ability' | 'upgrade' | 'mutator';
  export let id: AbilityId | UpgradeId | MutatorId;
  export let label = '';

  $: url =
    kind === 'ability'
      ? getAbilityIconUrl(id)
      : kind === 'upgrade'
        ? getUpgradeIconUrl(id)
        : getMutatorIconUrl(id);
</script>

{#if url}
  <img class="game-icon" src={url} alt="" aria-hidden="true" title={label} />
{/if}

<style>
  .game-icon {
    width: var(--game-icon-size, 1.15rem);
    height: var(--game-icon-size, 1.15rem);
    flex: 0 0 var(--game-icon-size, 1.15rem);
    object-fit: contain;
    image-rendering: pixelated;
    border-radius: 4px;
    filter: drop-shadow(0 1px 1px rgba(0, 0, 0, 0.55));
  }
</style>
