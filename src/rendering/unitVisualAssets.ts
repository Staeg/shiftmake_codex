import type { RaceId, UnitClassId } from '../engine/types';

import archerUrl from '../../assets/unit sprites/archer.png';
import avengerUrl from '../../assets/unit sprites/avenger.png';
import beastmasterUrl from '../../assets/unit sprites/beastmaster.png';
import championUrl from '../../assets/unit sprites/champion.png';
import druidUrl from '../../assets/unit sprites/druid.png';
import dwarfRaceUrl from '../../assets/race sprites/dwarf-placeholder.svg';
import elfRaceUrl from '../../assets/race sprites/elf-placeholder.svg';
import elementalUrl from '../../assets/unit sprites/elemental.png';
import elementalistUrl from '../../assets/unit sprites/elementalist.png';
import faeRaceUrl from '../../assets/race sprites/fae-placeholder.svg';
import goblinRaceUrl from '../../assets/race sprites/goblin-placeholder.svg';
import humanRaceUrl from '../../assets/race sprites/human-placeholder.svg';
import knightUrl from '../../assets/unit sprites/knight.png';
import militiaUrl from '../../assets/unit sprites/militia.png';
import necromancerUrl from '../../assets/unit sprites/necromancer.png';
import orcRaceUrl from '../../assets/race sprites/orc-placeholder.svg';
import priestUrl from '../../assets/unit sprites/priest.png';
import rangerUrl from '../../assets/unit sprites/ranger.png';
import shamanUrl from '../../assets/unit sprites/shaman.png';
import skeletonUrl from '../../assets/unit sprites/skeleton.png';
import soldierUrl from '../../assets/unit sprites/soldier.png';
import trollRaceUrl from '../../assets/race sprites/troll-placeholder.svg';
import wizardUrl from '../../assets/unit sprites/wizard.png';
import wolfUrl from '../../assets/unit sprites/wolf.png';

type PaletteRole = 'primary' | 'secondary' | 'glow';
type PaletteRamp = [number, number, number];
type UnitPaletteRules = Partial<Record<PaletteRole, string[]>>;
type RacePaletteProfile = Record<PaletteRole, PaletteRamp>;
export type AssetLoadProgress = {
  completed: number;
  total: number;
  label: string;
};

export const UNIT_SPRITE_URLS: Record<UnitClassId, string> = {
  archer: archerUrl,
  avenger: avengerUrl,
  beastmaster: beastmasterUrl,
  champion: championUrl,
  druid: druidUrl,
  elemental: elementalUrl,
  elementalist: elementalistUrl,
  knight: knightUrl,
  militia: militiaUrl,
  necromancer: necromancerUrl,
  priest: priestUrl,
  ranger: rangerUrl,
  shaman: shamanUrl,
  skeleton: skeletonUrl,
  soldier: soldierUrl,
  wizard: wizardUrl,
  wolf: wolfUrl,
};

const RACE_SPRITE_URLS: Record<RaceId, string> = {
  human: humanRaceUrl,
  elf: elfRaceUrl,
  goblin: goblinRaceUrl,
  troll: trollRaceUrl,
  dwarf: dwarfRaceUrl,
  orc: orcRaceUrl,
  fae: faeRaceUrl,
};

export const RACE_PALETTES: Record<RaceId, RacePaletteProfile> = {
  human: {
    primary: [0x4e2331, 0x935066, 0xe29b8b],
    secondary: [0x6c4f1f, 0xc08c37, 0xf5d37c],
    glow: [0x24415a, 0x4d82a8, 0xb9def6],
  },
  elf: {
    primary: [0x18362d, 0x2f7d64, 0x8de0b4],
    secondary: [0x45626d, 0x8aa8b5, 0xe2f5f2],
    glow: [0x1f5b5e, 0x4ab6ae, 0xc5fff5],
  },
  goblin: {
    primary: [0x3a2808, 0x8c5c12, 0xd4a030],
    secondary: [0x5f2c1d, 0xb35731, 0xf2a06b],
    glow: [0x403a0a, 0x908812, 0xe8e030],
  },
  troll: {
    primary: [0x2a224a, 0x6259af, 0xb6b0f1],
    secondary: [0x6c431d, 0xb77734, 0xf1c97a],
    glow: [0x1d5364, 0x2d9aaa, 0x9de8e2],
  },
  dwarf: {
    primary: [0x1f3342, 0x536b7a, 0xb9cad1],
    secondary: [0x5a321e, 0xb46a32, 0xf0b66a],
    glow: [0x46515a, 0xa8b4bd, 0xf2f7f8],
  },
  orc: {
    primary: [0x3a1515, 0x8f2f2b, 0xe15b45],
    secondary: [0x4a3d2c, 0xa89062, 0xe8d3a2],
    glow: [0x5a1f10, 0xd96428, 0xffb15a],
  },
  fae: {
    primary: [0x40153e, 0x9a3d91, 0xf0a4df],
    secondary: [0x1f4c5a, 0x52aebf, 0xc8f7ff],
    glow: [0x5a2a66, 0xd87cf0, 0xffe6ff],
  },
};

const UNIT_RECOLOR_RULES: Record<UnitClassId, UnitPaletteRules> = {
  soldier: {
    primary: ['#6E3541', '#89484E', '#A84543', '#BA5349'],
    secondary: ['#92A463'],
  },
  champion: {
    primary: ['#5D5068', '#59465D', '#7B5149', '#AB5F45'],
    secondary: ['#EEF6F6'],
  },
  avenger: {
    primary: ['#572C38', '#8E3F3A', '#CD5044'],
    secondary: ['#C9B077', '#EBE0A9'],
  },
  druid: {
    primary: ['#3F775D', '#60A251', '#9DD249'],
    secondary: ['#743A5D', '#B94864'],
    glow: ['#F9FCE9'],
  },
  knight: {
    primary: ['#665E7C', '#767090', '#A3A0B7'],
    secondary: ['#F0D260'],
  },
  militia: {
    primary: ['#592A40', '#7D2947', '#BD525F', '#E57370'],
    secondary: ['#4D8488'],
  },
  archer: {
    primary: ['#571743', '#71374C', '#B1434B'],
    secondary: ['#688174', '#8A998A', '#B9CCC6'],
  },
  beastmaster: {
    primary: ['#69323F', '#934554', '#D67B61'],
    secondary: ['#7D6241', '#C19557', '#F0D99D'],
  },
  wizard: {
    primary: ['#47304E', '#7D5B82'],
    secondary: ['#DB9253', '#FBCF7C'],
    glow: ['#558398', '#63ADC7', '#63F1D1'],
  },
  priest: {
    primary: ['#5B4A64', '#8A6C94', '#D8BDD8'],
    secondary: ['#A47D44', '#D7AF63', '#F5E2B5'],
    glow: ['#D7E7F0', '#EFFAFB'],
  },
  ranger: {
    primary: ['#3C4C33', '#668055', '#A6C17A'],
    secondary: ['#5B4046', '#9D6264', '#D89A7B'],
  },
  necromancer: {
    primary: ['#3A304A', '#62557D', '#AEA4C8'],
    secondary: ['#6B5A44', '#A68A62', '#E1D0A3'],
    glow: ['#548F8D', '#8ED4CD', '#D8FBF5'],
  },
  shaman: {
    primary: ['#583844', '#783646', '#D34945'],
    secondary: ['#373E69', '#4AA0C8', '#82E1E0'],
    glow: ['#BFF9E7', '#E2FEE8'],
  },
  elemental: {
    primary: ['#5A445C', '#7A627D', '#B8A2B9'],
    secondary: ['#5C6F64', '#89A391', '#C7E2D0'],
    glow: ['#6FAFB6', '#ACEEF1', '#E7FFFF'],
  },
  elementalist: {
    primary: ['#4D385E', '#775A91', '#B899D8'],
    secondary: ['#875D46', '#D69463', '#F7D39B'],
    glow: ['#6EC1C3', '#A9F3ED', '#F0FFFF'],
  },
  skeleton: {
    primary: ['#726F6A', '#A49E93', '#E0D7C7'],
    secondary: ['#5C434A', '#88626C', '#C799A4'],
  },
  wolf: {
    primary: ['#524E58', '#7F7A89', '#C8C4D0'],
    secondary: ['#83603F', '#B89159', '#E6CAA0'],
  },
};

function hexToRgb(hex: string): [number, number, number] {
  const raw = hex.replace('#', '');
  return [
    Number.parseInt(raw.slice(0, 2), 16),
    Number.parseInt(raw.slice(2, 4), 16),
    Number.parseInt(raw.slice(4, 6), 16),
  ];
}

function colorToRgb(color: number): [number, number, number] {
  return [(color >> 16) & 0xff, (color >> 8) & 0xff, color & 0xff];
}

function luminance([r, g, b]: [number, number, number]): number {
  return r * 0.299 + g * 0.587 + b * 0.114;
}

function sampleRamp(ramp: PaletteRamp, index: number, count: number): [number, number, number] {
  if (count <= 1) {
    return colorToRgb(ramp[1]);
  }

  const t = index / (count - 1);
  if (t <= 0.5) {
    const localT = t / 0.5;
    const start = colorToRgb(ramp[0]);
    const end = colorToRgb(ramp[1]);
    return [
      Math.round(start[0] + (end[0] - start[0]) * localT),
      Math.round(start[1] + (end[1] - start[1]) * localT),
      Math.round(start[2] + (end[2] - start[2]) * localT),
    ];
  }

  const localT = (t - 0.5) / 0.5;
  const start = colorToRgb(ramp[1]);
  const end = colorToRgb(ramp[2]);
  return [
    Math.round(start[0] + (end[0] - start[0]) * localT),
    Math.round(start[1] + (end[1] - start[1]) * localT),
    Math.round(start[2] + (end[2] - start[2]) * localT),
  ];
}

export function buildColorMap(unitClassId: UnitClassId, raceId: RaceId): Map<string, [number, number, number]> {
  const map = new Map<string, [number, number, number]>();
  const rules = UNIT_RECOLOR_RULES[unitClassId] ?? {};
  const palette = RACE_PALETTES[raceId];

  (Object.keys(rules) as PaletteRole[]).forEach((role) => {
    const sourceColors = [...(rules[role] ?? [])].sort((left, right) => luminance(hexToRgb(left)) - luminance(hexToRgb(right)));
    sourceColors.forEach((hex, index) => {
      map.set(hex.toUpperCase(), sampleRamp(palette[role], index, sourceColors.length));
    });
  });

  return map;
}

export function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Failed to load unit sprite: ${url}`));
    image.src = url;
  });
}

export function recolorImageToCanvas(image: HTMLImageElement, colorMap: Map<string, [number, number, number]>): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;

  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Unable to create 2D context for unit sprite recolor.');
  }

  context.imageSmoothingEnabled = false;
  context.drawImage(image, 0, 0);

  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const { data } = imageData;

  for (let index = 0; index < data.length; index += 4) {
    const alpha = data[index + 3];
    if (alpha === 0) {
      continue;
    }

    const key = `#${data[index].toString(16).padStart(2, '0')}${data[index + 1].toString(16).padStart(2, '0')}${data[index + 2]
      .toString(16)
      .padStart(2, '0')}`.toUpperCase();
    const replacement = colorMap.get(key);
    if (!replacement) {
      continue;
    }

    data[index] = replacement[0];
    data[index + 1] = replacement[1];
    data[index + 2] = replacement[2];
  }

  context.putImageData(imageData, 0, 0);
  return canvas;
}

export async function loadRaceUnitPortraitUrls(onProgress?: (progress: AssetLoadProgress) => void): Promise<Record<string, string>> {
  const unitClassIds = Object.keys(UNIT_SPRITE_URLS) as UnitClassId[];
  let completed = 0;
  onProgress?.({ completed, total: unitClassIds.length, label: 'Preparing unit portraits' });
  const images = await Promise.all(
    unitClassIds.map(async (unitClassId) => {
      const image = await loadImage(UNIT_SPRITE_URLS[unitClassId]);
      completed += 1;
      onProgress?.({ completed, total: unitClassIds.length, label: `Loaded ${unitClassId}` });
      return [unitClassId, image] as const;
    }),
  );

  const byUnitClass = new Map<UnitClassId, HTMLImageElement>(images);
  const portraits: Record<string, string> = {};

  unitClassIds.forEach((unitClassId) => {
    const image = byUnitClass.get(unitClassId);
    if (!image) {
      return;
    }

    (Object.keys(RACE_PALETTES) as RaceId[]).forEach((raceId) => {
      const portraitKey = `${raceId}/${unitClassId}`;
      portraits[portraitKey] = recolorImageToCanvas(image, buildColorMap(unitClassId, raceId)).toDataURL();
    });
  });

  return portraits;
}

export function getRaceSpriteUrl(raceId: RaceId): string {
  return RACE_SPRITE_URLS[raceId];
}
