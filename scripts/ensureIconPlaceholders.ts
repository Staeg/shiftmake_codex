import { copyFileSync, existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { ABILITIES } from '../src/engine/unitCatalog';
import manifest from '../assets/icons/icon-manifest.generated.json';

type IconKind = 'ability' | 'race_upgrade' | 'troop_class_upgrade' | 'rift_mutator';
type IconEffectKind = 'blast' | 'bolster' | 'haste' | 'heal' | 'ramp' | 'strike' | 'summon' | 'redirect';

interface IconManifestItem {
  id: string;
  slug: string;
  kind: IconKind;
  name: string;
  outputPath: string;
}

const items = manifest.items as IconManifestItem[];
const finalRoot = join('assets', 'icons', 'final');

const effectIconCandidates: Partial<Record<IconEffectKind, string[]>> = {
  blast: ['blast', 'blast-5'],
  bolster: ['bolster'],
  haste: ['haste', 'haste-1'],
  heal: ['heal', 'mend-4', 'regen-5'],
  ramp: ['ramp', 'ramp-1'],
  strike: ['strike'],
  summon: ['summon'],
  redirect: ['redirect', 'taunt'],
};

function ensureDir(path: string): void {
  mkdirSync(path, { recursive: true });
}

function stripKnownPrefix(kind: IconKind, slug: string): string {
  if (kind === 'race_upgrade' || kind === 'troop_class_upgrade') {
    return slug.replace(/^[a-z]+-/, '');
  }
  return slug.replace(/-\d+$/, '');
}

function abilityBaseIconCandidates(item: IconManifestItem): string[] {
  if (item.kind !== 'ability') {
    return [];
  }

  const ability = ABILITIES[item.id];
  if (!ability) {
    return [];
  }

  return [
    ...new Set(
      ability.effects.flatMap((effect) => {
        const candidates = effectIconCandidates[effect.kind as IconEffectKind] ?? [];
        return candidates.filter((candidateId) => candidateId !== item.id);
      }),
    ),
  ];
}

function findExistingFinalPng(kind: IconKind, id: string): string | null {
  const pngPath = join(finalRoot, kind, `${id}.png`);
  return existsSync(pngPath) ? pngPath : null;
}

function findExistingFinalSvg(kind: IconKind, id: string): string | null {
  const svgPath = join(finalRoot, kind, `${id}.svg`);
  return existsSync(svgPath) ? svgPath : null;
}

function findFriendlyPng(item: IconManifestItem): string | null {
  const basePng = abilityBaseIconCandidates(item)
    .map((id) => findExistingFinalPng('ability', id))
    .find((path): path is string => Boolean(path));
  if (basePng) return basePng;

  const folder = dirname(item.outputPath);
  const friendlySlug = stripKnownPrefix(item.kind, item.slug);
  const direct = join(folder, `${friendlySlug}.png`);
  if (existsSync(direct)) {
    return direct;
  }

  if (!existsSync(folder)) {
    return null;
  }

  const candidates = readdirSync(folder)
    .filter((file) => file.endsWith('.png'))
    .map((file) => join(folder, file))
    .filter((path) => !items.some((candidate) => candidate.outputPath === path.replaceAll('\\', '/')));

  return candidates.find((path) => basename(path, '.png') === friendlySlug) ?? null;
}

function findFriendlySvg(item: IconManifestItem): string | null {
  return (
    abilityBaseIconCandidates(item)
      .map((id) => findExistingFinalSvg('ability', id))
      .find((path): path is string => Boolean(path)) ?? null
  );
}

function placeholderSvg(item: IconManifestItem): string {
  const hue = Array.from(item.id).reduce((sum, char) => sum + char.charCodeAt(0), 0) % 360;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" role="img" aria-label="${item.name} placeholder">
  <rect width="128" height="128" fill="none"/>
  <path d="M64 8 116 64 64 120 12 64Z" fill="hsl(${hue} 42% 20%)" stroke="hsl(${hue} 65% 70%)" stroke-width="8"/>
  <path d="M64 28 92 64 64 100 36 64Z" fill="hsl(${hue} 58% 42%)"/>
  <circle cx="64" cy="64" r="13" fill="hsl(${hue} 82% 78%)"/>
</svg>
`;
}

let copied = 0;
let created = 0;

items.forEach((item) => {
  ensureDir(dirname(item.outputPath));

  if (!existsSync(item.outputPath)) {
    const friendlyPng = findFriendlyPng(item);
    if (friendlyPng) {
      copyFileSync(friendlyPng, item.outputPath);
      copied += 1;
    }
  }

  if (!existsSync(item.outputPath)) {
    const svgPath = item.outputPath.replace(/\.png$/, '.svg');
    if (!existsSync(svgPath)) {
      const friendlySvg = findFriendlySvg(item);
      if (friendlySvg) {
        copyFileSync(friendlySvg, svgPath);
        copied += 1;
      } else {
        writeFileSync(svgPath, placeholderSvg(item), 'utf8');
        created += 1;
      }
    }
  }
});

console.log(`Icon assets ready. Copied ${copied} friendly PNGs and created ${created} SVG placeholders.`);
