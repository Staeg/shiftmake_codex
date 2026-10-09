import { writable } from 'svelte/store';
import type { AbilityDefinition } from '../engine/types';
import type { DetailCard } from './detailCards';
import { formatAbilityDescription } from './inspectText';

export interface PlanningAbilityTooltip {
  label: string;
  description: string;
  ownerDetailKey: string | null;
}

type InspectableAbility = AbilityDefinition | { label: string; description: string };

function abilityTooltip(ability: InspectableAbility, ownerDetailKey: string | null): PlanningAbilityTooltip {
  return { label: ability.label, description: 'shortText' in ability ? formatAbilityDescription(ability) : ability.description,
    ownerDetailKey };
}

function derive(hovered: DetailCard | null, pinned: readonly DetailCard[],
  hoveredAbility: PlanningAbilityTooltip | null, pinnedAbility: PlanningAbilityTooltip | null) {
  const primary = pinned[0] ?? hovered;
  const secondary = pinned[1]?.kind === 'unit' ? pinned[1]
    : pinned[0]?.kind === 'unit' && hovered?.kind === 'unit' && hovered.detailKey !== pinned[0].detailKey ? hovered : null;
  return { hovered, pinned, primary, secondary, hoveredAbility, pinnedAbility,
    highlightedKeys: new Set([...pinned.map(detail => detail.detailKey), ...(hovered ? [hovered.detailKey] : [])]) };
}

export function createPlanningInspection() {
  let state = derive(null, [], null, null);
  const store = writable(state);
  function update(hovered = state.hovered, pinned = state.pinned,
    hoveredAbility = state.hoveredAbility, pinnedAbility = state.pinnedAbility): void {
    state = derive(hovered, pinned, hoveredAbility, pinnedAbility);
    store.set(state);
  }
  return {
    subscribe: store.subscribe,
    preview(detail: DetailCard): boolean {
      if (detail.kind === 'unit' && state.pinned.filter(entry => entry.kind === 'unit').length >= 2) return false;
      update(detail);
      return true;
    },
    togglePin(detail: DetailCard): void {
      const existing = state.pinned.findIndex(entry => entry.detailKey === detail.detailKey);
      const pinned = existing >= 0 ? state.pinned.filter((_, index) => index !== existing)
        : state.pinned.length === 0 ? [detail] : [state.pinned[0]!, detail];
      update(null, pinned, null, null);
    },
    replacePin(detail: DetailCard | null): void { update(null, detail ? [detail] : [], null, null); },
    clearDetails(): void { update(null, []); },
    clearPreview(): void { update(null, state.pinned, null); },
    reset(): void { update(null, [], null, null); },
    showAbility(ability: InspectableAbility, ownerDetailKey: string | null): void {
      update(state.hovered, state.pinned, abilityTooltip(ability, ownerDetailKey));
    },
    clearAbility(): void { update(state.hovered, state.pinned, null); },
    toggleAbility(ability: InspectableAbility, ownerDetailKey: string | null): void {
      const tooltip = abilityTooltip(ability, ownerDetailKey);
      const pinned = state.pinnedAbility?.ownerDetailKey === ownerDetailKey && state.pinnedAbility.label === tooltip.label
        ? null : tooltip;
      update(state.hovered, state.pinned, null, pinned);
    },
  };
}

export type PlanningInspection = ReturnType<typeof createPlanningInspection>;
export type PlanningInspectionState = Parameters<Parameters<PlanningInspection['subscribe']>[0]>[0];

export function planningAbilityTooltipFor(state: PlanningInspectionState, ownerDetailKey: string | null): PlanningAbilityTooltip | null {
  const tooltip = state.pinnedAbility ?? state.hoveredAbility;
  return tooltip?.ownerDetailKey === ownerDetailKey ? tooltip : null;
}
