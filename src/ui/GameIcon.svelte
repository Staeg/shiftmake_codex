<script lang="ts">
  import type { AbilityId, MutatorId, UpgradeId } from '../engine/types';
  import { getAbilityFallbackIcon, getAbilityIconUrl, getMutatorIconUrl, getUpgradeIconUrl } from '../presentation/iconAssets';

  export let kind: 'ability' | 'upgrade' | 'mutator';
  export let id: AbilityId | UpgradeId | MutatorId;
  export let label = '';

  $: url =
    kind === 'ability'
      ? getAbilityIconUrl(id)
      : kind === 'upgrade'
        ? getUpgradeIconUrl(id)
        : getMutatorIconUrl(id);
  $: isRasterIcon = url ? !url.endsWith('.svg') : false;
  $: fallbackIcon = kind === 'ability' && !url ? getAbilityFallbackIcon(id) : null;
</script>

{#if url}
  <img class:raster-icon={isRasterIcon} class="game-icon" src={url} alt="" aria-hidden="true" title={label} />
{:else if fallbackIcon}
  <span
    class={`game-icon fallback-ability-icon ${fallbackIcon.shape} ${fallbackIcon.tone}`}
    aria-hidden="true"
    title={label}
  ></span>
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

  .raster-icon {
    transform: scale(var(--game-icon-raster-scale, 1));
    transform-origin: center;
  }

  .fallback-ability-icon {
    --icon-fill: #8ea8c9;
    --icon-stroke: #dce8f6;
    --icon-shadow: rgba(77, 132, 197, 0.48);
    position: relative;
    display: inline-grid;
    place-items: center;
    background: transparent;
    filter: drop-shadow(0 0 5px var(--icon-shadow)) drop-shadow(0 1px 1px rgba(0, 0, 0, 0.55));
  }

  .fallback-ability-icon.positive {
    --icon-fill: #4279c9;
    --icon-stroke: #b7d7ff;
    --icon-shadow: rgba(75, 140, 224, 0.58);
  }

  .fallback-ability-icon.negative {
    --icon-fill: #b83e43;
    --icon-stroke: #ffc2c4;
    --icon-shadow: rgba(202, 68, 75, 0.58);
  }

  .fallback-ability-icon.neutral {
    --icon-fill: #8d98a6;
    --icon-stroke: #e2e7ed;
    --icon-shadow: rgba(177, 187, 199, 0.42);
  }

  .fallback-ability-icon::before,
  .fallback-ability-icon::after {
    content: '';
    display: block;
    box-sizing: border-box;
  }

  .fallback-ability-icon.heart::before {
    width: 64%;
    height: 64%;
    background: var(--icon-fill);
    border: 1.5px solid var(--icon-stroke);
    transform: rotate(45deg);
    border-radius: 20% 20% 4px 20%;
  }

  .fallback-ability-icon.heart::after {
    position: absolute;
    width: 38%;
    height: 38%;
    left: 26%;
    top: 16%;
    border-radius: 50%;
    background: var(--icon-fill);
    box-shadow: 0.34rem 0 var(--icon-fill);
  }

  .fallback-ability-icon.self::before {
    width: 72%;
    height: 72%;
    background: var(--icon-fill);
    border: 1.5px solid var(--icon-stroke);
    clip-path: polygon(50% 92%, 8% 16%, 92% 16%);
  }

  .fallback-ability-icon.single::before {
    width: 76%;
    height: 76%;
    border: 2px solid var(--icon-stroke);
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.04);
  }

  .fallback-ability-icon.single::after {
    position: absolute;
    width: 22%;
    height: 22%;
    border-radius: 50%;
    background: var(--icon-fill);
  }

  .fallback-ability-icon.aoe::before {
    width: 76%;
    height: 76%;
    border: 1.5px solid var(--icon-stroke);
    border-radius: 50%;
    background: var(--icon-fill);
  }

  .fallback-ability-icon.plus::before,
  .fallback-ability-icon.plus::after {
    position: absolute;
    border-radius: 999px;
    background: var(--icon-fill);
    border: 1px solid var(--icon-stroke);
  }

  .fallback-ability-icon.plus::before {
    width: 72%;
    height: 25%;
  }

  .fallback-ability-icon.plus::after {
    width: 25%;
    height: 72%;
  }
</style>
