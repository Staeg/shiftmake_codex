import type { RiftInstance } from '../engine/types';

import rift1Url from '../../assets/rift sprites/rift1.jpg';
import rift2Url from '../../assets/rift sprites/rift2.jpg';
import rift3Url from '../../assets/rift sprites/rift3.jpg';
import rift4Url from '../../assets/rift sprites/rift4.jpg';

const RIFT_SPRITES = [rift1Url, rift2Url, rift3Url, rift4Url] as const;

export interface RiftVisual {
  imageUrl: string;
  tint: string;
  glow: string;
  rotationDeg: number;
  filter: string;
}

function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;

  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

export function getRiftVisual(rift: Pick<RiftInstance, 'seed' | 'tier'>): RiftVisual {
  const random = createSeededRandom((rift.seed ^ (rift.tier * 224_682_251)) >>> 0);
  const imageUrl = RIFT_SPRITES[Math.floor(random() * RIFT_SPRITES.length)] ?? RIFT_SPRITES[0];
  const hue = Math.floor(random() * 360);
  const saturation = 3.5 + random() * 2.75;
  const brightness = 0.95 + random() * 0.3;
  const contrast = 1.05 + random() * 0.35;
  const rotationDeg = -180 + random() * 360;
  const glowAlpha = 0.28 + random() * 0.18;
  const tint = `hsl(${hue} 93% 64%)`;
  const glow = `hsla(${hue} 100% 68% / ${glowAlpha.toFixed(2)})`;
  const filter = [
    'sepia(1)',
    `saturate(${saturation.toFixed(2)})`,
    `hue-rotate(${hue}deg)`,
    `brightness(${brightness.toFixed(2)})`,
    `contrast(${contrast.toFixed(2)})`,
    'drop-shadow(0 0 1.1rem currentColor)',
  ].join(' ');

  return {
    imageUrl,
    tint,
    glow,
    rotationDeg,
    filter,
  };
}
