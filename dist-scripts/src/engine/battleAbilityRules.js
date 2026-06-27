function resolveAbilityTargetRadius(actor, target) {
  if (!target) {
    return 0;
  }
  if (target.radiusSource === "selfRange") {
    return actor.resolvedStats.range;
  }
  return target.radius ?? 0;
}
function resolveFallenTriggerRadius(actor, trigger) {
  if (!trigger.fallen) {
    return 0;
  }
  if (trigger.fallen.radiusSource === "selfRange") {
    return actor.resolvedStats.range;
  }
  return trigger.fallen.radius;
}
function effectDisposition(effect) {
  return effect.disposition ?? "neutral";
}
function matchesFallenTrigger(unit, fallenUnit, allegiance) {
  if (unit.id && fallenUnit.id && unit.id === fallenUnit.id) {
    return false;
  }
  if (allegiance === "all") {
    return true;
  }
  return allegiance === "ally" ? unit.side === fallenUnit.side : unit.side !== fallenUnit.side;
}
function filterTargetCandidates(candidates, filters) {
  if (!filters) {
    return candidates;
  }
  return candidates.filter((unit) => {
    const visibleClasses = /* @__PURE__ */ new Set([unit.unitClassTag, ...unit.attributes]);
    if (filters.onlyClasses?.length && !filters.onlyClasses.some((classTag) => visibleClasses.has(classTag))) return false;
    if (filters.notClasses?.some((classTag) => visibleClasses.has(classTag))) return false;
    if (filters.unengaged && (unit.engagedWith?.size ?? 0) > 0) return false;
    return true;
  });
}
function prioritizeCandidates(candidates, filters) {
  if (!filters?.prioritizeClasses?.length) {
    return candidates;
  }
  const prioritized = candidates.filter((unit) => {
    const visibleClasses = /* @__PURE__ */ new Set([unit.unitClassTag, ...unit.attributes]);
    return filters.prioritizeClasses.some((classTag) => visibleClasses.has(classTag));
  });
  return prioritized.length > 0 ? prioritized : candidates;
}
export {
  effectDisposition,
  filterTargetCandidates,
  matchesFallenTrigger,
  prioritizeCandidates,
  resolveAbilityTargetRadius,
  resolveFallenTriggerRadius
};
//# sourceMappingURL=battleAbilityRules.js.map
