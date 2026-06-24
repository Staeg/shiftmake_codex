import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  ABILITIES,
  RACE_UPGRADES,
  RACES,
  MUTATORS,
  TROOP_CLASS_UPGRADES,
  UNIT_CLASSES,
} from '../src/engine/unitCatalog';
import type { AbilityDefinition, AbilityEffectDefinition, AbilityId, UpgradeId } from '../src/engine/types';

type IconKind = 'ability' | 'race_upgrade' | 'troop_class_upgrade' | 'rift_mutator';

interface IconManifestItem {
  id: string;
  slug: string;
  kind: IconKind;
  name: string;
  owner: string | null;
  tier: number | null;
  mechanic: string;
  trigger: string | null;
  target: string | null;
  effects: string[];
  gameplayTags: string[];
  relatedUpgradeContexts: string[];
  sourceAbilityIds: AbilityId[];
  outputPath: string;
}

const OUTPUT_ROOT = 'assets/icons';
const FINAL_ROOT = 'assets/icons/final';

const STYLE_BIBLE = `# Shiftmake Icon Style Bible

Use this as the shared art direction for generated upgrade, ability, and Rift-mutator icons.

## Game Context

Shiftmake is a browser-based, singleplayer turn-based strategy game with light pixel art graphics. The player commands a patchwork army from multiple races and sends troops through Rifts into auto-resolved battles. Icons should feel tactical, readable, and game-system-forward rather than like full illustrations.

## Global Icon Rules

- Produce actual square icons, not trading cards, not banners, not rectangular panels.
- Target asset shape: one isolated 1:1 square icon per mechanic.
- Design for 32x32 first, then 64x64. If it does not read at 32x32, it is too detailed.
- Use a tiny-game-icon style: simple pixel-art-like symbol, crisp edges, clean flat forms.
- Bold central silhouette, high contrast, almost no background detail.
- Transparent background unless the generation tool cannot reliably produce transparency.
- No text, letters, numbers, captions, watermarks, UI labels, or tiny unreadable markings.
- Do not use realistic gore.
- Do not make photorealistic paintings.
- Keep the subject centered with enough padding for a UI frame or hover state.
- Favor symbolic gameplay clarity over literal scene depiction.
- One primary symbol only, plus at most one small secondary accent.
- Avoid full characters, portraits, scenes, landscapes, banners with emblems, detailed UI frames, ornate corners, and multi-object compositions.
- Avoid built-in card frames. The game UI can add frames later.
- Prefer silhouettes like a single shield, arrow, boot, claw, skull, spark, root, fang, portal, or broken armor plate.
- Use chunky shapes and 2-4 main colors per icon.

## Visual Taxonomy

- Damage: sharp angles, sparks, red or hot accents.
- Armor and defense: shields, stone, plates, blue-steel or gray accents.
- Healing: warm light, green or gold accents.
- Speed and initiative: wind streaks, clock-like arcs, lightning, cyan or yellow accents.
- Summons: emerging silhouettes, portal glow, spectral doubles.
- Corpses and death triggers: bones, fading silhouettes, dark violet or sickly green accents.
- Range and precision: arrows, crosshair shapes, long sight lines.
- Debuffs: cracked armor, downward motion, draining color.
- Race synergies: banners, grouped silhouettes, race-coded materials.
- Rift mutators: environmental symbols that affect the whole battle.

## Negative Prompt

text, letters, numbers, caption, logo, watermark, photorealistic, card art, trading card, ornate frame, rectangular panel, banner scene, character portrait, full character, landscape, cluttered background, busy scene, realistic gore, low contrast, cropped subject, multiple unrelated subjects, tiny details that vanish at 32x32
`;

const REVIEW_CHECKLIST = `# Shiftmake Icon Review Checklist

Use this after generating each batch.

## Per Icon

- Reads clearly at 64x64.
- Still communicates the broad mechanic at 32x32.
- Contains no text, letters, numbers, captions, or watermarking.
- Has a strong central silhouette.
- Has one obvious gameplay category: damage, healing, summon, defense, mobility, initiative, corpse, debuff, race synergy, or Rift environment.
- Is distinct from nearby mechanics in the same unit or race family.
- Does not depend on tiny detail to make sense.

## Batch Review

- Similar mechanics share a visual grammar without becoming identical.
- Tier 3 icons can feel more intense than tier 1 or tier 2 icons, but should not become busier.
- Race upgrades feel related to their race without requiring portraits.
- Troop-class upgrades feel tied to the troop's combat job.
- Base abilities are simple enough to work as reusable iconography.

## Suggested Iteration Notes

- If an icon is beautiful but unclear, regenerate with stronger gameplay tags and fewer decorative details.
- If icons in a family blur together, add a differentiating constraint to only the ambiguous items.
- If the model adds text, repeat the no-text rule in both the main prompt and negative prompt.
`;

function ensureDir(path: string): void {
  mkdirSync(path, { recursive: true });
}

function writeText(path: string, text: string): void {
  ensureDir(dirname(path));
  writeFileSync(path, text, 'utf8');
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function formatTrigger(ability: AbilityDefinition | null): string | null {
  if (!ability) return null;
  const trigger = ability.trigger;
  const details = [trigger.timing];
  if (trigger.chargeEvery) details.push(`charge every ${trigger.chargeEvery} turns`);
  if (trigger.maxUses) details.push(`max ${trigger.maxUses} uses`);
  if (trigger.condition) details.push(`condition ${trigger.condition}`);
  if (trigger.repeatPerDistinctFriendlyTroopClass) details.push('scales per other friendly troop class');
  if (trigger.repeatPerOtherFriendlyUnitOnHex) details.push('scales per other friendly unit on hex');
  if (trigger.fallen) details.push(`near fallen ${trigger.fallen.allegiance} unit`);
  if (trigger.effectApplication?.effectKinds?.length) details.push(`after ${trigger.effectApplication.effectKinds.join('/')} effect`);
  if (trigger.effectApplication?.dispositions?.length) details.push(`after ${trigger.effectApplication.dispositions.join('/')} effect`);
  return details.join('; ');
}

function formatTarget(ability: AbilityDefinition | null): string | null {
  const target = ability?.target;
  if (!target) return null;
  const parts = [target.mode];
  if (target.allegiance) parts.push(target.allegiance);
  if (target.radius !== undefined) parts.push(`radius ${target.radius}`);
  if (target.radiusSource) parts.push(`radius from ${target.radiusSource}`);
  if (target.filters?.onlyClasses?.length) parts.push(`only ${target.filters.onlyClasses.join(', ')}`);
  if (target.filters?.notClasses?.length) parts.push(`not ${target.filters.notClasses.join(', ')}`);
  if (target.filters?.prioritizeClasses?.length) parts.push(`prioritize ${target.filters.prioritizeClasses.join(', ')}`);
  if (target.filters?.unengaged) parts.push('unengaged');
  return parts.join('; ');
}

function formatEffect(effect: AbilityEffectDefinition): string {
  switch (effect.kind) {
    case 'blast':
      return `blast ${effect.amount} damage`;
    case 'bolster':
    case 'haste':
    case 'heal':
    case 'ramp':
      return `${effect.kind} ${effect.amount}${effect.mode === 'percent' ? '%' : ''}`;
    case 'statDelta':
      return `${effect.stat} ${effect.amount > 0 ? '+' : ''}${effect.amount}${effect.mode === 'percent' ? '%' : ''}`;
    case 'rangeset':
      return `set range to ${effect.value}`;
    case 'roleset':
      return `set role to ${effect.role}`;
    case 'initiativeSet':
      return `set initiative to ${effect.value}`;
    case 'initiativeDelta':
      return `initiative ${effect.amount > 0 ? '+' : ''}${effect.amount}`;
    case 'grantAbility':
      return `grant ${effect.abilityId}`;
    case 'strike':
      return `${effect.amount} extra strike${effect.amount === 1 ? '' : 's'}`;
    case 'summon':
      return `summon ${effect.count} ${effect.unitClassId}${effect.count === 1 ? '' : 's'}`;
    case 'redirect':
      return 'redirect into engagement';
  }
}

function abilityTags(ability: AbilityDefinition | null, mechanic: string, effects: string[]): string[] {
  const text = `${ability?.id ?? ''} ${ability?.label ?? ''} ${ability?.shortText ?? ''} ${mechanic} ${effects.join(' ')}`.toLowerCase();
  const tags: string[] = [];
  const addIf = (tag: string, pattern: RegExp) => {
    if (pattern.test(text)) tags.push(tag);
  };

  addIf('damage', /\bdamage\b|\bblast\b|\bstrike\b|\battack\b|\bkill\b|\bramp\b/);
  addIf('armor', /\barmor\b|\bshield\b|\bbrace\b/);
  addIf('speed', /\bspeed\b|\bhaste\b/);
  addIf('initiative', /\binitiative\b|\bturn\b|\bbeat\b|\bcharge\b/);
  addIf('healing', /\bheal|regen|mend|mercy|grace|growth|regrowth/);
  addIf('summon', /\bsummon|wolf|skeleton|elemental|changeling/);
  addIf('corpse', /\bcorpse|fallen|death|dies|die|fading|carrion/);
  addIf('ranged', /\branged|range|arrow|shot|volley|blast|wizard/);
  addIf('melee', /\bmelee|engage|retaliate|taunt|capacity/);
  addIf('debuff', /\breduce|lose|loss|set initiative to 0|harmful|snare|concussive|ensorcel/);
  addIf('movement', /\bmove|retreat|spawn|relocate|diggy|step|quakes/);
  addIf('synergy', /\ballied|friendly|same hex|troop class|pack|combined|united|warcry/);
  addIf('transformation', /\bshapeshift|bear|form|changes sides|changeling/);
  addIf('defense', /\bsurvive|immune|redirect|taunt|shield|armor|damage is split|stoneblood/);
  return unique(tags);
}

function sourceAbilityIdsForEffects(effects: Array<{ kind: string; abilityId?: AbilityId; addAbilityId?: AbilityId }>): AbilityId[] {
  return unique(
    effects
      .flatMap((effect) => [effect.abilityId, effect.addAbilityId])
      .filter((id): id is AbilityId => typeof id === 'string'),
  );
}

function primaryAbility(ids: AbilityId[]): AbilityDefinition | null {
  const id = ids[0];
  return id ? (ABILITIES[id] ?? null) : null;
}

type UpgradeForIcon = (typeof RACE_UPGRADES)[string] | (typeof TROOP_CLASS_UPGRADES)[string];

function formatStatModifier(stat: string, modifier: { flat?: number; multiplier?: number }): string {
  const parts: string[] = [];
  if (modifier.multiplier !== undefined && modifier.multiplier !== 1) {
    const percent = Math.round((modifier.multiplier - 1) * 100);
    parts.push(`${stat} ${percent > 0 ? '+' : ''}${percent}%`);
  }
  if (modifier.flat !== undefined && modifier.flat !== 0) {
    parts.push(`${stat} ${modifier.flat > 0 ? '+' : ''}${modifier.flat}`);
  }
  return parts.join(' and ');
}

function formatDirectUpgradeEffects(upgrade: UpgradeForIcon): string[] {
  return upgrade.effects.flatMap((effect) => {
    if (effect.kind === 'modifyStats') {
      const prefix = 'unitFilter' in effect && effect.unitFilter ? `${effect.unitFilter} ` : '';
      return Object.entries(effect.statModifiers)
        .map(([stat, modifier]) => (modifier ? `${prefix}${formatStatModifier(stat, modifier)}` : null))
        .filter((value): value is string => Boolean(value));
    }
    if (effect.kind === 'addAttribute') {
      return [`add ${effect.attribute} attribute`];
    }
    return [];
  });
}

function formatUpgradeContext(
  kind: 'race_upgrade' | 'troop_class_upgrade',
  upgrade: UpgradeForIcon,
): string {
  const owner =
    kind === 'race_upgrade'
      ? RACES[(upgrade as (typeof RACE_UPGRADES)[string]).raceId]?.label
      : UNIT_CLASSES[(upgrade as (typeof TROOP_CLASS_UPGRADES)[string]).unitClassId]?.label;
  const directEffects = formatDirectUpgradeEffects(upgrade);
  const context = `${upgrade.label}${owner ? ` (${owner}, tier ${upgrade.tier})` : ''}: ${upgrade.description}`;
  return directEffects.length > 0 ? `${context} Direct upgrade effects: ${directEffects.join(', ')}.` : context;
}

function relatedUpgradeContextsForAbility(abilityId: AbilityId): string[] {
  const raceContexts = Object.values(RACE_UPGRADES)
    .filter((upgrade) => sourceAbilityIdsForEffects(upgrade.effects).includes(abilityId))
    .map((upgrade) => formatUpgradeContext('race_upgrade', upgrade));
  const troopClassContexts = Object.values(TROOP_CLASS_UPGRADES)
    .filter((upgrade) => sourceAbilityIdsForEffects(upgrade.effects).includes(abilityId))
    .map((upgrade) => formatUpgradeContext('troop_class_upgrade', upgrade));
  return [...raceContexts, ...troopClassContexts];
}

function makeUpgradeItem(
  kind: 'race_upgrade' | 'troop_class_upgrade',
  upgrade: UpgradeForIcon,
): IconManifestItem {
  const sourceAbilityIds = sourceAbilityIdsForEffects(upgrade.effects);
  const ability = primaryAbility(sourceAbilityIds);
  const owner =
    kind === 'race_upgrade'
      ? RACES[(upgrade as (typeof RACE_UPGRADES)[string]).raceId]?.label
      : UNIT_CLASSES[(upgrade as (typeof TROOP_CLASS_UPGRADES)[string]).unitClassId]?.label;
  const effects = [...formatDirectUpgradeEffects(upgrade), ...(ability ? ability.effects.map(formatEffect) : [])];
  const tags = unique([
    kind === 'race_upgrade' ? 'race-upgrade' : 'troop-class-upgrade',
    ...(owner ? [slugify(owner)] : []),
    ...abilityTags(ability, upgrade.description, effects),
  ]);
  const slug = slugify(upgrade.id);

  return {
    id: upgrade.id,
    slug,
    kind,
    name: upgrade.label,
    owner: owner ?? null,
    tier: upgrade.tier,
    mechanic: upgrade.description,
    trigger: formatTrigger(ability),
    target: formatTarget(ability),
    effects,
    gameplayTags: tags,
    relatedUpgradeContexts: [],
    sourceAbilityIds,
    outputPath: `${FINAL_ROOT}/${kind}/${slug}.png`,
  };
}

function makeAbilityItem(ability: AbilityDefinition): IconManifestItem {
  const slug = slugify(ability.id);
  const effects = ability.effects.map(formatEffect);
  const relatedUpgradeContexts = relatedUpgradeContextsForAbility(ability.id);
  return {
    id: ability.id,
    slug,
    kind: 'ability',
    name: ability.label,
    owner: null,
    tier: null,
    mechanic: ability.shortText,
    trigger: formatTrigger(ability),
    target: formatTarget(ability),
    effects,
    gameplayTags: unique(['base-ability', ...abilityTags(ability, `${ability.shortText} ${relatedUpgradeContexts.join(' ')}`, effects)]),
    relatedUpgradeContexts,
    sourceAbilityIds: [ability.id],
    outputPath: `${FINAL_ROOT}/ability/${slug}.png`,
  };
}

function makeMutatorItem(mutator: (typeof MUTATORS)[string]): IconManifestItem {
  const slug = slugify(mutator.id);
  return {
    id: mutator.id,
    slug,
    kind: 'rift_mutator',
    name: mutator.label,
    owner: 'Rift',
    tier: null,
    mechanic: mutator.description,
    trigger: 'battle-wide environmental rule',
    target: 'all units or the whole battle',
    effects: [],
    gameplayTags: unique(['rift-mutator', ...abilityTags(null, mutator.description, [])]),
    relatedUpgradeContexts: [],
    sourceAbilityIds: [],
    outputPath: `${FINAL_ROOT}/rift_mutator/${slug}.png`,
  };
}

function makePrompt(item: IconManifestItem): string {
  return `Create the next Shiftmake icon in the same style.

${formatPromptContent(item)}

Requirements:
- Output exactly one square icon image, not a contact sheet and not a rectangular card.
- No text, letters, numbers, captions, UI labels, watermarks, or tiny runes that look like writing.
- Design for 32x32 first. Use only a few chunky shapes.
- Light pixel-art inspired fantasy strategy-game symbol.
- Centered subject with a bold silhouette and simple composition.
- Use the gameplay tags to choose the visual metaphor; do not require the exact mechanic name to be visible.
- No ornate frame, no character portrait, no full scene, no banner.

Negative prompt:
text, letters, numbers, caption, logo, watermark, photorealistic, card art, trading card, ornate frame, rectangular panel, banner scene, character portrait, full character, landscape, cluttered background, realistic gore, low contrast, cropped subject, tiny detail`;
}

function formatKind(kind: IconKind): string {
  switch (kind) {
    case 'ability':
      return 'Ability';
    case 'race_upgrade':
      return 'Race upgrade';
    case 'troop_class_upgrade':
      return 'Troop-class upgrade';
    case 'rift_mutator':
      return 'Rift mutator';
  }
}

function formatPromptContent(item: IconManifestItem): string {
  const visualTags = item.gameplayTags.filter(
    (tag) => !['base-ability', 'race-upgrade', 'troop-class-upgrade', 'rift-mutator'].includes(tag),
  );
  const lines = [
    `Name: ${item.name}`,
    `Category: ${formatKind(item.kind)}`,
    item.owner ? `Owner: ${item.owner}` : null,
    item.tier ? `Tier: ${item.tier}` : null,
    `Mechanic: ${item.mechanic}`,
    item.relatedUpgradeContexts.length > 0 ? `Upgrade context: ${item.relatedUpgradeContexts.join(' ')}` : null,
    item.trigger && item.trigger !== 'passive' ? `Trigger: ${item.trigger}` : null,
    item.target ? `Target: ${item.target}` : null,
    item.effects.length > 0 ? `Mechanical effects: ${item.effects.join(', ')}` : null,
    visualTags.length > 0 ? `Visual tags: ${visualTags.join(', ')}` : null,
  ];

  return lines.filter((line): line is string => Boolean(line)).join('\n');
}

function byKindThenOwnerThenName(left: IconManifestItem, right: IconManifestItem): number {
  return (
    left.kind.localeCompare(right.kind) ||
    (left.owner ?? '').localeCompare(right.owner ?? '') ||
    (left.tier ?? 0) - (right.tier ?? 0) ||
    left.name.localeCompare(right.name)
  );
}

function groupBy<T>(values: T[], key: (value: T) => string): Record<string, T[]> {
  return values.reduce<Record<string, T[]>>((groups, value) => {
    const groupKey = key(value);
    groups[groupKey] ??= [];
    groups[groupKey].push(value);
    return groups;
  }, {});
}

const upgradeItems = [
  ...Object.values(RACE_UPGRADES).map((upgrade) => makeUpgradeItem('race_upgrade', upgrade)),
  ...Object.values(TROOP_CLASS_UPGRADES).map((upgrade) => makeUpgradeItem('troop_class_upgrade', upgrade)),
];

const upgradeAbilityIds = new Set<UpgradeId>(upgradeItems.flatMap((item) => item.sourceAbilityIds));
const baseAbilityIds = new Set<AbilityId>(
  Object.values(UNIT_CLASSES)
    .flatMap((unitClass) => unitClass.abilityIds)
    .concat(Object.values(RACES).flatMap((race) => race.abilityIds)),
);
const abilityItems = Object.values(ABILITIES)
  .filter((ability) => baseAbilityIds.has(ability.id) || upgradeAbilityIds.has(ability.id))
  .map(makeAbilityItem);
const mutatorItems = Object.values(MUTATORS).map(makeMutatorItem);
const items = [...upgradeItems, ...abilityItems, ...mutatorItems].sort(byKindThenOwnerThenName);

const manifest = {
  version: 1,
  generatedBy: 'npm run icons:prompts',
  source: 'src/engine/unitCatalog.ts',
  styleBiblePath: `${OUTPUT_ROOT}/icon-style-bible.md`,
  reviewChecklistPath: `${OUTPUT_ROOT}/review-checklist.md`,
  finalAssetRoot: FINAL_ROOT,
  counts: {
    total: items.length,
    abilities: abilityItems.length,
    raceUpgrades: Object.keys(RACE_UPGRADES).length,
    troopClassUpgrades: Object.keys(TROOP_CLASS_UPGRADES).length,
    riftMutators: mutatorItems.length,
  },
  items,
};

const prompts = items
  .map((item) => `## ${item.name}\n\nSave approved image as: \`${item.outputPath}\`\n\n\`\`\`text\n${makePrompt(item)}\n\`\`\``)
  .join('\n\n');

const contactSheetSections = Object.entries(groupBy(items, (item) => `${item.kind}/${item.owner ?? 'general'}`))
  .map(([group, groupItems]) => {
    const compactItems = groupItems.map((item) => ({
      id: item.id,
      name: item.name,
      kind: item.kind,
      owner: item.owner,
      tier: item.tier,
      mechanic: item.mechanic,
      gameplayTags: item.gameplayTags,
    }));
    return `## ${group}

Generate a contact sheet of separate square icons for the following Shiftmake mechanics. Use the shared style bible. Do not put text, labels, letters, or numbers inside the icons.

Strict layout: make a simple grid of equal square cells, one icon per cell. Each cell should contain only a centered, simple 32x32-readable symbol. Do not draw ornate card frames, full characters, banners, scenes, or rectangular panels.

\`\`\`json
${JSON.stringify(compactItems, null, 2)}
\`\`\``;
  })
  .join('\n\n');

writeText(join(OUTPUT_ROOT, 'icon-style-bible.md'), STYLE_BIBLE);
writeText(join(OUTPUT_ROOT, 'review-checklist.md'), REVIEW_CHECKLIST);
writeText(join(OUTPUT_ROOT, 'icon-manifest.generated.json'), `${JSON.stringify(manifest, null, 2)}\n`);
writeText(join(OUTPUT_ROOT, 'prompts', 'individual-prompts.generated.md'), `# Shiftmake Individual Icon Prompts\n\n${prompts}\n`);
writeText(join(OUTPUT_ROOT, 'prompts', 'contact-sheets.generated.md'), `# Shiftmake Contact Sheet Prompts\n\n${contactSheetSections}\n`);

[
  'ability',
  'race_upgrade',
  'troop_class_upgrade',
  'rift_mutator',
].forEach((kind) => writeText(join(FINAL_ROOT, kind, '.gitkeep'), ''));

console.log(`Generated ${items.length} icon manifest items.`);
