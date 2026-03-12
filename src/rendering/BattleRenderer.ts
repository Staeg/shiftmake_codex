import {
  Application,
  Assets,
  Container,
  FederatedPointerEvent,
  Graphics,
  Sprite,
  Text,
  Texture,
} from 'pixi.js';
import type { BattleReplay, BattleStep, BattleUnit, HexCoord } from '../engine/types';

import swordsmanUrl from '../assets/sprites/swordsman.svg';
import peasantUrl from '../assets/sprites/peasant.svg';
import archerUrl from '../assets/sprites/archer.svg';
import projectileUrl from '../assets/sprites/projectile.svg';

const UNIT_TEXTURES = {
  soldier: swordsmanUrl,
  champion: swordsmanUrl,
  militia: peasantUrl,
  archer: archerUrl,
  wizard: archerUrl,
} as const;

const HEX_SIZE = 42;
const UNIT_PIXEL_SIZE = 32;
const HEX_MARGIN = 5;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const BASE_PLAYBACK_STEP_MS = 500;

type PixelPoint = { x: number; y: number };
type LayoutResult = {
  positions: Map<string, PixelPoint>;
  densityScales: Map<string, number>;
};

export type UnitPointerInfo = {
  unitId: string;
  x: number;
  y: number;
};

export type RendererInteractionHandlers = {
  onUnitHover?: (info: UnitPointerInfo | null) => void;
  onUnitClick?: (info: UnitPointerInfo) => void;
};

function axialToPixel(coord: HexCoord): PixelPoint {
  const x = HEX_SIZE * (Math.sqrt(3) * coord.q + (Math.sqrt(3) / 2) * coord.r);
  const y = HEX_SIZE * (1.5 * coord.r);
  return { x, y };
}

function getUnitById(units: BattleUnit[], id: string): BattleUnit | undefined {
  return units.find((unit) => unit.id === id);
}

function hexKey(coord: HexCoord): string {
  return `${coord.q},${coord.r}`;
}

function animate(
  durationMs: number,
  onUpdate: (t: number) => void,
  onFinish?: () => void,
  onCancel?: () => void,
): () => void {
  const start = performance.now();
  let cancelled = false;
  let finished = false;

  const frame = (now: number) => {
    if (cancelled || finished) {
      return;
    }
    const elapsed = now - start;
    const t = Math.min(1, elapsed / durationMs);
    onUpdate(t);
    if (t < 1) {
      requestAnimationFrame(frame);
    } else {
      finished = true;
      onFinish?.();
    }
  };

  requestAnimationFrame(frame);

  return () => {
    if (cancelled || finished) {
      return;
    }
    cancelled = true;
    onCancel?.();
  };
}

function distributedOffset(index: number, count: number, maxRadius: number, squashX = 1): PixelPoint {
  if (count <= 1) {
    return { x: 0, y: 0 };
  }

  const ratio = (index + 0.5) / count;
  const radius = Math.sqrt(ratio) * maxRadius;
  const angle = index * GOLDEN_ANGLE;

  return {
    x: Math.round(Math.cos(angle) * radius * squashX),
    y: Math.round(Math.sin(angle) * radius),
  };
}

function densityScaleForHexUnitCount(unitCount: number): number {
  if (unitCount <= 6) {
    return 1;
  }

  const compressed = 1 / (1 + (unitCount - 6) * 0.1);
  return Math.max(0.62, compressed);
}

export class BattleRenderer {
  private app: Application;

  private boardLayer = new Container();

  private unitLayer = new Container();

  private effectLayer = new Container();

  private textures: Record<string, Texture> = {};

  private unitSprites = new Map<string, Sprite>();

  private unitSides = new Map<string, 'player' | 'enemy'>();

  private unitBaseScales = new Map<string, number>();

  private unitAlive = new Map<string, boolean>();

  private selectionRings = new Map<string, Graphics>();

  private replay: BattleReplay | null = null;

  private currentStep = -1;

  private strongHighlightIds = new Set<string>();

  private faintHighlightIds = new Set<string>();

  private stopEffects: Array<() => void> = [];

  private interactionHandlers: RendererInteractionHandlers = {};

  private isAutoPlayback = false;

  private playbackStepMs = 500;

  constructor(container: HTMLElement) {
    this.app = new Application({ background: '#111117', antialias: true, resizeTo: container });
    container.appendChild(this.app.view as HTMLCanvasElement);
    this.app.stage.addChild(this.boardLayer, this.unitLayer, this.effectLayer);
  }

  async init(): Promise<void> {
    this.textures.soldier = await Assets.load(UNIT_TEXTURES.soldier);
    this.textures.champion = await Assets.load(UNIT_TEXTURES.champion);
    this.textures.militia = await Assets.load(UNIT_TEXTURES.militia);
    this.textures.archer = await Assets.load(UNIT_TEXTURES.archer);
    this.textures.wizard = await Assets.load(UNIT_TEXTURES.wizard);
    this.textures.projectile = await Assets.load(projectileUrl);
  }

  setInteractionHandlers(handlers: RendererInteractionHandlers): void {
    this.interactionHandlers = handlers;
  }

  setPlaybackTiming(autoPlay: boolean, speedMs: number): void {
    this.isAutoPlayback = autoPlay;
    this.playbackStepMs = speedMs;
  }

  destroy(): void {
    this.clearEffects();
    this.app.destroy(true, { children: true, texture: false, baseTexture: false });
  }

  setReplay(replay: BattleReplay): void {
    this.replay = replay;
    this.currentStep = -1;
    this.clearLayers();
    this.drawBoard(replay.mapRadius);
    this.mountUnitSprites(replay.initial.units);
    this.renderSnapshot(replay.initial.units);
  }

  setHighlights(strongIds: string[], faintIds: string[]): void {
    this.strongHighlightIds = new Set(strongIds);
    this.faintHighlightIds = new Set(faintIds.filter((id) => !this.strongHighlightIds.has(id)));
    this.applyHighlights();
  }

  showStep(stepIndex: number): void {
    if (!this.replay) {
      return;
    }

    const normalized = Math.max(-1, Math.min(stepIndex, this.replay.steps.length - 1));
    const previous = this.currentStep;
    this.currentStep = normalized;

    const snapshot = normalized < 0 ? this.replay.initial.units : this.replay.steps[normalized]?.snapshot.units ?? [];

    if (normalized !== previous) {
      this.clearEffects();
    }

    this.renderSnapshot(snapshot);

    if (normalized >= 0 && normalized !== previous) {
      const step = this.replay.steps[normalized] as BattleStep;
      const prevUnits =
        previous < 0 ? this.replay.initial.units : this.replay.steps[previous]?.snapshot.units ?? this.replay.initial.units;
      this.playStepEffect(step, prevUnits, snapshot);
    }

    this.applyHighlights();
  }

  private pointerInfo(unitId: string, event: FederatedPointerEvent): UnitPointerInfo {
    return {
      unitId,
      x: event.global.x,
      y: event.global.y,
    };
  }

  private clearEffects(): void {
    this.stopEffects.forEach((stop) => stop());
    this.stopEffects = [];
    this.effectLayer.removeChildren();
  }

  private clearLayers(): void {
    this.clearEffects();
    this.boardLayer.removeChildren();
    this.unitLayer.removeChildren();
    this.unitSprites.clear();
    this.unitSides.clear();
    this.unitBaseScales.clear();
    this.unitAlive.clear();
    this.selectionRings.clear();
  }

  private drawBoard(radius: number): void {
    const root = new Container();
    root.position.set(this.app.screen.width / 2, this.app.screen.height / 2);

    for (let q = -radius; q <= radius; q += 1) {
      const rMin = Math.max(-radius, -q - radius);
      const rMax = Math.min(radius, -q + radius);
      for (let r = rMin; r <= rMax; r += 1) {
        const center = axialToPixel({ q, r });
        const hex = new Graphics();
        hex.lineStyle(1, 0x2a3036, 1);
        hex.beginFill(0x171c20, 0.85);

        for (let i = 0; i < 6; i += 1) {
          const angle = (Math.PI / 180) * (60 * i - 30);
          const x = center.x + HEX_SIZE * Math.cos(angle);
          const y = center.y + HEX_SIZE * Math.sin(angle);
          if (i === 0) {
            hex.moveTo(x, y);
          } else {
            hex.lineTo(x, y);
          }
        }
        hex.closePath();
        hex.endFill();
        root.addChild(hex);
      }
    }

    this.boardLayer.addChild(root);
  }

  private mountUnitSprites(units: BattleUnit[]): void {
    units.forEach((unit) => {
      if (this.unitSprites.has(unit.id)) {
        return;
      }
      const texture = this.textures[unit.unitTypeId] ?? Texture.WHITE;
      const sprite = new Sprite(texture);
      sprite.anchor.set(0.5, 0.5);
      sprite.eventMode = 'static';
      sprite.cursor = 'pointer';

      sprite.on('pointerover', (event: FederatedPointerEvent) => {
        this.interactionHandlers.onUnitHover?.(this.pointerInfo(unit.id, event));
      });
      sprite.on('pointermove', (event: FederatedPointerEvent) => {
        this.interactionHandlers.onUnitHover?.(this.pointerInfo(unit.id, event));
      });
      sprite.on('pointerout', () => {
        this.interactionHandlers.onUnitHover?.(null);
      });
      sprite.on('pointertap', (event: FederatedPointerEvent) => {
        this.interactionHandlers.onUnitClick?.(this.pointerInfo(unit.id, event));
      });

      const textureSize = Math.max(texture.width, texture.height, 1);
      const baseScale = UNIT_PIXEL_SIZE / textureSize;
      sprite.scale.set(baseScale);
      sprite.alpha = 1;

      this.unitLayer.addChild(sprite);
      this.unitSprites.set(unit.id, sprite);
      this.unitSides.set(unit.id, unit.side);
      this.unitBaseScales.set(unit.id, baseScale);

      const ring = new Graphics();
      ring.lineStyle(2, 0xf7c85d, 1);
      ring.drawCircle(0, 0, 14);
      ring.visible = false;
      this.unitLayer.addChild(ring);
      this.selectionRings.set(unit.id, ring);
    });
  }

  private toScreen(point: PixelPoint): PixelPoint {
    return {
      x: this.app.screen.width / 2 + point.x,
      y: this.app.screen.height / 2 + point.y,
    };
  }

  private computeDisplayLayout(units: BattleUnit[]): LayoutResult {
    const aliveUnits = units.filter((unit) => unit.alive);
    const byHex = new Map<string, Set<'player' | 'enemy'>>();
    const byHexCount = new Map<string, number>();
    const byHexAndSide = new Map<string, BattleUnit[]>();

    aliveUnits.forEach((unit) => {
      const cellKey = hexKey(unit.position);

      byHexCount.set(cellKey, (byHexCount.get(cellKey) ?? 0) + 1);

      const sideSet = byHex.get(cellKey) ?? new Set<'player' | 'enemy'>();
      sideSet.add(unit.side);
      byHex.set(cellKey, sideSet);

      const groupKey = `${cellKey}|${unit.side}`;
      const group = byHexAndSide.get(groupKey) ?? [];
      group.push(unit);
      byHexAndSide.set(groupKey, group);
    });

    const positions = new Map<string, PixelPoint>();
    const densityScales = new Map<string, number>();

    byHexAndSide.forEach((groupUnits, groupKey) => {
      const [cellKey, sideRaw] = groupKey.split('|');
      const [qRaw, rRaw] = (cellKey ?? '0,0').split(',');
      const q = Number(qRaw);
      const r = Number(rRaw);
      const side = (sideRaw === 'enemy' ? 'enemy' : 'player') as 'player' | 'enemy';
      const center = axialToPixel({ q, r });

      const occupiedSides = byHex.get(cellKey ?? '0,0');
      const hasBothSides = (occupiedSides?.size ?? 0) > 1;

      const unitCountOnHex = byHexCount.get(cellKey ?? '0,0') ?? groupUnits.length;
      const densityScale = densityScaleForHexUnitCount(unitCountOnHex);
      const usableRadius = Math.max(6, HEX_SIZE - HEX_MARGIN - UNIT_PIXEL_SIZE * 0.35);
      const sideBiasX = hasBothSides ? (side === 'player' ? -usableRadius * 0.4 : usableRadius * 0.4) : 0;
      const squashX = hasBothSides ? 0.62 : 1;

      groupUnits.sort((a, b) => a.id.localeCompare(b.id));
      groupUnits.forEach((unit, index) => {
        const offset = distributedOffset(index, groupUnits.length, usableRadius, squashX);
        positions.set(unit.id, {
          x: center.x + sideBiasX + offset.x,
          y: center.y + offset.y,
        });
        densityScales.set(unit.id, densityScale);
      });
    });

    return { positions, densityScales };
  }

  private renderSnapshot(units: BattleUnit[]): void {
    this.mountUnitSprites(units);
    const layout = this.computeDisplayLayout(units);

    this.unitAlive.clear();
    units.forEach((unit) => {
      this.unitAlive.set(unit.id, unit.alive);
    });

    units.forEach((unit) => {
      const sprite = this.unitSprites.get(unit.id);
      const ring = this.selectionRings.get(unit.id);
      if (!sprite || !ring) {
        return;
      }

      if (!unit.alive) {
        sprite.visible = false;
        sprite.alpha = 0;
        ring.visible = false;
        return;
      }

      const pos = layout.positions.get(unit.id) ?? axialToPixel(unit.position);
      const screen = this.toScreen(pos);
      const baseScale = this.unitBaseScales.get(unit.id) ?? 1;
      const densityScale = layout.densityScales.get(unit.id) ?? 1;

      sprite.position.set(screen.x, screen.y);
      ring.position.set(sprite.x, sprite.y);
      ring.scale.set(densityScale);

      sprite.tint = unit.side === 'player' ? 0x8ec8ff : 0xff9d9d;
      sprite.visible = true;
      sprite.alpha = 1;
      sprite.scale.set(baseScale * densityScale);
    });
  }

  private scaledDurationMs(baseMs: number): number {
    const ratio = this.playbackStepMs / BASE_PLAYBACK_STEP_MS;
    return Math.max(16, Math.round(baseMs * ratio));
  }

  private effectDurationMs(): number {
    return this.scaledDurationMs(1000);
  }

  private playStepEffect(step: BattleStep, prevUnits: BattleUnit[], nextUnits: BattleUnit[]): void {
    const prevLayout = this.computeDisplayLayout(prevUnits);
    const nextLayout = this.computeDisplayLayout(nextUnits);

    if (step.kind === 'attack') {
      const actorId = step.actorIds[0] ?? '';
      const actor = getUnitById(nextUnits, actorId);
      if (!actor) {
        return;
      }

      const durationMs = this.effectDurationMs();
      this.stopEffects.push(this.jumpUnit(actor.id, durationMs));

      const actorPos = nextLayout.positions.get(actor.id) ?? axialToPixel(actor.position);
      const targets = step.targetIds
        .map((targetId) => getUnitById(nextUnits, targetId))
        .filter((unit): unit is BattleUnit => Boolean(unit));

      targets.forEach((target) => {
        const targetPos = nextLayout.positions.get(target.id) ?? axialToPixel(target.position);
        if ((step.metadata?.mode as string) === 'ranged') {
          this.stopEffects.push(this.fireProjectile(actorPos, targetPos, durationMs));
        }
        this.stopEffects.push(this.shakeUnit(target.id, durationMs));
      });
      return;
    }

    if (step.kind === 'heal') {
      const amount = (step.metadata?.amount as number | undefined) ?? 0;
      step.targetIds.forEach((targetId) => {
        this.stopEffects.push(this.showHealPopup(targetId, amount));
      });
      return;
    }

    if (step.kind === 'move') {
      const actorId = step.actorIds[0];
      const previousUnit = getUnitById(prevUnits, actorId ?? '');
      const nextUnit = getUnitById(nextUnits, actorId ?? '');
      const sprite = actorId ? this.unitSprites.get(actorId) : undefined;
      if (!previousUnit || !nextUnit || !nextUnit.alive || !sprite) {
        return;
      }

      const start = prevLayout.positions.get(previousUnit.id) ?? axialToPixel(previousUnit.position);
      const end = nextLayout.positions.get(nextUnit.id) ?? axialToPixel(nextUnit.position);
      const startScreen = this.toScreen(start);
      const endScreen = this.toScreen(end);

      this.stopEffects.push(
        animate(this.scaledDurationMs(220), (t) => {
          sprite.x = startScreen.x + (endScreen.x - startScreen.x) * t;
          sprite.y = startScreen.y + (endScreen.y - startScreen.y) * t;
          const ring = this.selectionRings.get(actorId as string);
          if (ring) {
            ring.position.set(sprite.x, sprite.y);
          }
        }),
      );
    }
  }

  private fireProjectile(from: PixelPoint, to: PixelPoint, durationMs: number): () => void {
    const start = this.toScreen(from);
    const end = this.toScreen(to);

    const sprite = new Sprite(this.textures.projectile);
    sprite.anchor.set(0.5, 0.5);
    sprite.width = 14;
    sprite.height = 14;
    sprite.position.set(start.x, start.y);
    sprite.rotation = Math.atan2(end.y - start.y, end.x - start.x);
    this.effectLayer.addChild(sprite);

    let cleaned = false;
    const cleanup = () => {
      if (cleaned) {
        return;
      }
      cleaned = true;
      if (sprite.parent) {
        sprite.parent.removeChild(sprite);
      }
      sprite.destroy();
    };

    const stop = animate(
      durationMs,
      (t) => {
        sprite.x = start.x + (end.x - start.x) * t;
        sprite.y = start.y + (end.y - start.y) * t;
        sprite.alpha = 1 - t;
      },
      cleanup,
      cleanup,
    );

    return () => {
      stop();
    };
  }

  private jumpUnit(unitId: string, durationMs: number): () => void {
    const sprite = this.unitSprites.get(unitId);
    if (!sprite) {
      return () => {};
    }

    const ring = this.selectionRings.get(unitId);
    const startX = sprite.x;
    const startY = sprite.y;
    const jumpHeight = Math.max(2, Math.round(UNIT_PIXEL_SIZE * 0.16));

    const syncRing = () => {
      if (ring) {
        ring.position.set(sprite.x, sprite.y);
      }
    };

    let cleaned = false;
    const cleanup = () => {
      if (cleaned) {
        return;
      }
      cleaned = true;
      sprite.position.set(startX, startY);
      syncRing();
    };

    const stop = animate(
      Math.round(durationMs * 0.7),
      (t) => {
        const lift = Math.sin(Math.PI * t);
        sprite.position.set(startX, startY - jumpHeight * lift);
        syncRing();
      },
      cleanup,
      cleanup,
    );

    return () => {
      stop();
    };
  }

  private shakeUnit(unitId: string, durationMs: number): () => void {
    const sprite = this.unitSprites.get(unitId);
    if (!sprite) {
      return () => {};
    }

    const ring = this.selectionRings.get(unitId);
    const startX = sprite.x;
    const startY = sprite.y;
    const amplitude = Math.max(2, Math.round(UNIT_PIXEL_SIZE * 0.1));
    const oscillations = 2;

    const syncRing = () => {
      if (ring) {
        ring.position.set(sprite.x, sprite.y);
      }
    };

    let cleaned = false;
    const cleanup = () => {
      if (cleaned) {
        return;
      }
      cleaned = true;
      sprite.position.set(startX, startY);
      syncRing();
    };

    const stop = animate(
      Math.round(durationMs * 0.75),
      (t) => {
        const damping = 1 - t;
        const wave = Math.sin(Math.PI * 2 * oscillations * t);
        sprite.position.set(startX + wave * amplitude * damping, startY);
        syncRing();
      },
      cleanup,
      cleanup,
    );

    return () => {
      stop();
    };
  }

  private showHealPopup(unitId: string, amount: number): () => void {
    const sprite = this.unitSprites.get(unitId);
    if (!sprite) {
      return () => {};
    }

    const label = `+${Math.round(amount)}`;
    const text = new Text(label, {
      fontSize: 13,
      fontWeight: 'bold',
      fill: 0x55dd77,
      stroke: 0x112211,
      strokeThickness: 3,
    });
    text.anchor.set(0.5, 1);
    text.position.set(sprite.x, sprite.y - UNIT_PIXEL_SIZE * 0.6);
    this.effectLayer.addChild(text);

    const startY = text.y;
    const floatDistance = 22;

    let cleaned = false;
    const cleanup = () => {
      if (cleaned) {
        return;
      }
      cleaned = true;
      if (text.parent) {
        text.parent.removeChild(text);
      }
      text.destroy();
    };

    const stop = animate(
      this.scaledDurationMs(800),
      (t) => {
        text.y = startY - floatDistance * t;
        text.alpha = t < 0.3 ? 1 : 1 - (t - 0.3) / 0.7;
      },
      cleanup,
      cleanup,
    );

    return () => {
      stop();
    };
  }

  private applyHighlights(): void {
    this.unitSprites.forEach((sprite, unitId) => {
      const ring = this.selectionRings.get(unitId);
      const alive = this.unitAlive.get(unitId) ?? false;
      if (!alive) {
        sprite.visible = false;
        if (ring) {
          ring.visible = false;
        }
        return;
      }

      const side = this.unitSides.get(unitId) ?? 'player';
      const baseTint = side === 'player' ? 0x8ec8ff : 0xff9d9d;
      const faintTint = side === 'player' ? 0xb9e4ff : 0xffc8b2;

      const isStrong = this.strongHighlightIds.has(unitId);
      const isFaint = !isStrong && this.faintHighlightIds.has(unitId);

      if (isStrong) {
        sprite.tint = 0xfff2a2;
      } else if (isFaint) {
        sprite.tint = faintTint;
      } else {
        sprite.tint = baseTint;
      }

      if (ring) {
        if (isStrong) {
          ring.visible = true;
          ring.alpha = 0.95;
          ring.tint = 0xf7c85d;
        } else if (isFaint) {
          ring.visible = true;
          ring.alpha = 0.32;
          ring.tint = 0x9ec8ff;
        } else {
          ring.visible = false;
        }
      }
    });
  }
}