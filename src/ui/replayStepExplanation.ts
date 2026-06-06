import { formatFixed } from '../engine/fixed';
import { getAbility } from '../engine/unitCatalog';
import type { BattleStep, BattleStepExplanation, RoleIntentId } from '../engine/types';
import { formatAbilityDescription, formatRoleExact } from './inspectText';

export type ReplayStepExplanationSection = {
  title: string;
  lines: string[];
};

export type ReplayStepExplanationView = {
  eyebrow: string;
  title: string;
  activeUnitId: string | null;
  secondaryUnitIds: string[];
  sections: ReplayStepExplanationSection[];
};

function getAbilityDetails(explanation: NonNullable<BattleStepExplanation['ability']>): { label: string; description: string } {
  try {
    const ability = getAbility(explanation.abilityId);
    return {
      label: ability.label,
      description: formatAbilityDescription(ability),
    };
  } catch {
    return {
      label: explanation.abilityLabel ?? explanation.abilityId,
      description: explanation.abilityLabel ? `${explanation.abilityLabel}.` : 'The full ability text was not available for this replay step.',
    };
  }
}

function roleIntentLabel(roleIntent: RoleIntentId): string {
  return {
    'screen-frontline': 'Screen the frontline threat.',
    'fallback-backline': 'Fall through to the backline.',
    'breach-backline': 'Break into the enemy backline.',
    'hold-backline': 'Maintain an existing backline commitment.',
    'retreat-range': 'Retreat to keep distance.',
    'advance-range': 'Advance without collapsing range control.',
  }[roleIntent];
}

function reasonLabel(reasonCode: string): string {
  return {
    'block-access': 'The unit found a frontline or Pusher target that was blocking access to allied backliners.',
    'no-frontline-target': 'No frontline screen target remained, so the unit switched to a backline objective.',
    'maintain-backline-commitment': 'The unit had already committed to the enemy backline and stayed on that plan.',
    'opened-backline-lane': 'A lane into the enemy backline was open, so the unit pushed through.',
    'no-backline-target': 'No enemy backliner was available, so the unit fell back to screening the closest threat.',
    'increase-threat-distance': 'The unit chose the legal retreat hex that pushed threats furthest away.',
    'maintain-firing-lane': 'The unit advanced only if it could still preserve a ranged firing lane.',
  }[reasonCode] ?? 'The engine chose this branch of the role logic for the current board state.';
}

function buildBeatSection(explanation: NonNullable<BattleStepExplanation['beat']>): ReplayStepExplanationSection {
  const lines = [
    'At the start of each beat, every alive unit gains initiative equal to its speed plus any battle-wide initiative bonus.',
    explanation.initiativePurposeHint ?? 'Initiative determines when a unit gets to act.',
    `This beat: speed + ${formatFixed(explanation.initiativeBonus)} bonus.`,
    `Beat number: ${explanation.beat}.`,
  ];

  return {
    title: 'Beat Rule',
    lines,
  };
}

function buildMovementSection(explanation: NonNullable<BattleStepExplanation['movement']>): ReplayStepExplanationSection {
  const lines: string[] = [];
  let title = 'Movement Logic';

  if (explanation.stepKind === 'move') {
    title = explanation.movementPhase === 'withdraw' ? 'Retreat Logic' : explanation.movementPhase === 'ability' ? 'Ability Movement' : 'Positioning Logic';
    lines.push(
      explanation.movementPhase === 'withdraw'
        ? 'This step chose a safer hex before the unit committed to contact again.'
        : 'This step explains why the unit moved to this destination before attacking or engaging.',
    );
  } else {
    title = 'Engagement Logic';
    lines.push('This step explains why the unit committed to footprint contact instead of only repositioning.');
  }

  if (explanation.unitRole) {
    lines.push(formatRoleExact(explanation.unitRole));
  }

  if (explanation.roleIntent) {
    lines.push(`Decision: ${roleIntentLabel(explanation.roleIntent)}`);
  }

  if (explanation.reasonCode) {
    lines.push(`Why this branch: ${reasonLabel(explanation.reasonCode)}`);
  }

  if (explanation.targetRole || explanation.targetHex) {
    const role = explanation.targetRole ? `${explanation.targetRole} target` : 'target';
    const hex = explanation.targetHex ? ` at (${explanation.targetHex.q}, ${explanation.targetHex.r})` : '';
    lines.push(explanation.stepKind === 'engage' ? `Commitment focus: ${role}${hex}.` : `Pressure focus: ${role}${hex}.`);
  }

  if (explanation.destination) {
    lines.push(
      explanation.stepKind === 'engage'
        ? `Contact hex: (${explanation.destination.q}, ${explanation.destination.r}).`
        : `Chosen destination: (${explanation.destination.q}, ${explanation.destination.r}).`,
    );
  }

  if (explanation.keepEnemyInRange) {
    lines.push('This retreat only considers hexes that still leave at least one enemy in range.');
  }

  if (lines.length === 0) {
    lines.push('This movement step did not record additional decision detail.');
  }

  return {
    title,
    lines,
  };
}

function buildAbilitySection(explanation: NonNullable<BattleStepExplanation['ability']>): ReplayStepExplanationSection {
  const ability = getAbilityDetails(explanation);
  const lines = [ability.description];
  if (explanation.effect) {
    lines.push(`Resolved effect key: ${explanation.effect}.`);
  }
  return {
    title: `Ability: ${ability.label}`,
    lines,
  };
}

function buildDamageSection(explanation: NonNullable<BattleStepExplanation['damage']>): ReplayStepExplanationSection {
  const lines = [`Base damage: ${formatFixed(explanation.baseDamage)}.`];
  let running = explanation.baseDamage;

  if (explanation.heartseekerMultiplier && explanation.heartseekerMultiplier !== 1) {
    running *= explanation.heartseekerMultiplier;
    lines.push(`Heartseeker: x${formatFixed(explanation.heartseekerMultiplier)} -> ${formatFixed(running)}.`);
  }

  if (explanation.distanceBonus) {
    running += explanation.distanceBonus;
    lines.push(`Distance bonus: +${formatFixed(explanation.distanceBonus)} -> ${formatFixed(running)}.`);
  }


  if (explanation.armorInteraction === 'ignored') {
    lines.push('Armor was ignored for this damage instance.');
  } else {
    const armorBefore = explanation.armorBefore ?? 0;
    const armorReduction = explanation.armorReduction ?? 0;
    const armorApplied = explanation.armorApplied ?? armorBefore;
    lines.push(`Armor before modifiers: ${formatFixed(armorBefore)}.`);
    if (armorReduction > 0) {
      lines.push(`Protection reduction: -${formatFixed(armorReduction)} effective armor.`);
    }
    lines.push(`Armor applied: ${formatFixed(armorApplied)}.`);
    lines.push(`After armor: ${formatFixed(explanation.attackDamageBeforeArmor)} - ${formatFixed(armorApplied)} = ${formatFixed(Math.max(explanation.attackDamageBeforeArmor - armorApplied, 0))}.`);
  }

  if (explanation.rangedMultiplier && explanation.rangedMultiplier !== 1) {
    lines.push(`Ranged battle multiplier: x${formatFixed(explanation.rangedMultiplier)}.`);
  }

  lines.push(`Final damage dealt: ${formatFixed(explanation.finalDamage)}.`);

  return {
    title: `${explanation.mode[0]!.toUpperCase()}${explanation.mode.slice(1)} Damage`,
    lines,
  };
}

export function buildReplayStepExplanationView(step: BattleStep): ReplayStepExplanationView {
  const explanation = step.metadata?.explanation;
  const sections: ReplayStepExplanationSection[] = [];

  if (explanation?.beat) {
    sections.push(buildBeatSection(explanation.beat));
  }
  if (explanation?.movement) {
    sections.push(buildMovementSection(explanation.movement));
  }
  if (explanation?.ability) {
    sections.push(buildAbilitySection(explanation.ability));
  }
  if (explanation?.damage) {
    sections.push(buildDamageSection(explanation.damage));
  }

  if (sections.length === 0) {
    sections.push(buildDefaultSection(step));
  }

  return {
    eyebrow: `${step.kind.toUpperCase()} EXPLANATION`,
    title: step.message,
    activeUnitId: typeof step.metadata?.activeUnitId === 'string' ? step.metadata.activeUnitId : step.actorIds[0] ?? step.targetIds[0] ?? null,
    secondaryUnitIds: Array.isArray(step.metadata?.secondaryUnitIds)
      ? step.metadata.secondaryUnitIds
      : [...new Set([...step.actorIds, ...step.targetIds].filter((id) => id !== (step.actorIds[0] ?? step.targetIds[0])))],
    sections,
  };
}

function buildDefaultSection(step: BattleStep): ReplayStepExplanationSection {
  if (step.kind === 'heal') {
    return {
      title: 'Healing',
      lines: [
        'This event restored HP to the target unit.',
        'Healing cannot raise a unit above its maximum health.',
      ],
    };
  }

  if (step.kind === 'death') {
    return {
      title: 'Death Resolution',
      lines: [
        'The target unit was reduced to 0 HP and removed from play.',
        'Any on-kill, corpse, or follow-up effects resolve after this death step.',
      ],
    };
  }

  if (step.kind === 'engage') {
    return {
      title: 'Engagement Logic',
      lines: [
        'This step marks the moment the acting unit tied enemies up through footprint contact.',
        'Once engaged, those units can no longer behave like free-moving backliners until the contact changes.',
      ],
    };
  }

  if (step.kind === 'move') {
    return {
      title: 'Positioning Logic',
      lines: [
        'This step records a change in hex before the unit resolved its next attack or engagement.',
        'The exact destination is chosen from the acting unit’s current role logic or a movement effect.',
      ],
    };
  }

  if (step.kind === 'buff') {
    return {
      title: 'Effect Resolution',
      lines: [
        'This step applied a stat or state change to the target unit.',
        'Hovering the surrounding events usually reveals the ability or damage sequence that caused it.',
      ],
    };
  }

  if (step.kind === 'attack') {
    return {
      title: 'Attack Resolution',
      lines: [
        'This step resolved an attack against the listed targets.',
        'Damage, armor, and attack modifiers are tracked when the replay records their breakdown.',
      ],
    };
  }

  return {
    title: 'Event Detail',
    lines: ['This replay event did not need a more specific explanation.'],
  };
}
