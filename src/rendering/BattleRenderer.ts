import {
  Application,
  Assets,
  ColorMatrixFilter,
  Container,
  FederatedPointerEvent,
  Graphics,
  Rectangle,
  Sprite,
  Texture,
} from 'pixi.js';
import type { BattleReplay, BattleStep, BattleUnit, HexCoord } from '../engine/types';
import { footprintCenter, hexKey } from '../engine/hex';

import projectileUrl from '../assets/sprites/projectile.svg';
import { getAbilityFallbackIcon, type AbilityFallbackIcon, type AbilityFallbackIconShape } from '../presentation/iconAssets';
import { loadRaceUnitTextures } from './unitVisuals';
import { BASE_STEP_MS } from './renderingConstants';
import type { BattleReportDiagnostic } from '../engine/types';

const HEX_SIZE = 30;
const UNIT_PIXEL_SIZE = 32;
const HEX_MARGIN = 5;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const BASE_EFFECT_MS = 1000;
const AUTO_ATTACK_EFFECT_MS = 640;
const BASE_DEATH_FADE_MS = 2000;
const HIT_FLASH_RED = 0xff1f24;
const HIT_FLASH_PEAK = 0.9;
const VIEWPORT_PADDING = 18;
const UNIT_VIEWPORT_PADDING = 22;
const DEFAULT_FIT_SCALE = 1.2;
const MIN_ZOOM_FACTOR = 0.6;
const MAX_ZOOM_FACTOR = 3;
const ZOOM_STEP_FACTOR = 1.18;
const AUTO_ZOOM_EPSILON = 0.0001;
const DRAG_THRESHOLD_PX = 6;
const OUTLINE_GOLD = { r: 0.95, g: 0.69, b: 0.17 };
const HEX_EDGE_DIRS: HexCoord[] = [
  { q: 1, r: 0 },
  { q: 0, r: 1 },
  { q: -1, r: 1 },
  { q: -1, r: 0 },
  { q: 0, r: -1 },
  { q: 1, r: -1 },
];

type PixelPoint = { x: number; y: number };
type LayoutResult = {
  positions: Map<string, PixelPoint>;
  densityScales: Map<string, number>;
};
type Bounds = { minX: number; maxX: number; minY: number; maxY: number };
type EffectIndicatorKind = 'positive' | 'negative' | 'neutral';
export type ReplayStepNavigationKind = 'auto' | 'manual-step' | 'event-select' | 'reset';

export type UnitPointerInfo = {
  unitId: string;
  x: number;
  y: number;
};

export type RendererInteractionHandlers = {
  onUnitHover?: (info: UnitPointerInfo | null) => void;
  onUnitClick?: (info: UnitPointerInfo) => void;
};

export type RendererDiagnosticHandler = (diagnostic: BattleReportDiagnostic) => void;

function axialToPixel(coord: HexCoord): PixelPoint {
  const x = HEX_SIZE * (Math.sqrt(3) * coord.q + (Math.sqrt(3) / 2) * coord.r);
  const y = HEX_SIZE * (1.5 * coord.r);
  return { x, y };
}

function sharedHexVertex(a: HexCoord, b: HexCoord, c: HexCoord): PixelPoint {
  const pa = axialToPixel(a);
  const pb = axialToPixel(b);
  const pc = axialToPixel(c);
  return {
    x: (pa.x + pb.x + pc.x) / 3,
    y: (pa.y + pb.y + pc.y) / 3,
  };
}

function getUnitById(units: BattleUnit[], id: string): BattleUnit | undefined {
  return units.find((unit) => unit.id === id);
}


function hexCorners(center: PixelPoint, radius = HEX_SIZE): PixelPoint[] {
  return Array.from({ length: 6 }, (_, i) => {
    const angle = (Math.PI / 180) * (60 * i - 30);
    return {
      x: center.x + radius * Math.cos(angle),
      y: center.y + radius * Math.sin(angle),
    };
  });
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

function mixChannel(from: number, to: number, t: number): number {
  return Math.round(from + (to - from) * t);
}

function mixColor(from: number, to: number, t: number): number {
  const clamped = Math.max(0, Math.min(1, t));
  const fromR = (from >> 16) & 0xff;
  const fromG = (from >> 8) & 0xff;
  const fromB = from & 0xff;
  const toR = (to >> 16) & 0xff;
  const toG = (to >> 8) & 0xff;
  const toB = to & 0xff;
  return (mixChannel(fromR, toR, clamped) << 16) | (mixChannel(fromG, toG, clamped) << 8) | mixChannel(fromB, toB, clamped);
}

function densityScaleForHexUnitCount(unitCount: number): number {
  if (unitCount <= 6) {
    return 1;
  }

  const compressed = 1 / (1 + (unitCount - 6) * 0.1);
  return Math.max(0.62, compressed);
}

function footprintPixelBounds(occupiedHexes: HexCoord[]): Bounds {
  const bounds: Bounds = {
    minX: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY,
    minY: Number.POSITIVE_INFINITY,
    maxY: Number.NEGATIVE_INFINITY,
  };
  occupiedHexes.forEach((hex) => {
    hexCorners(axialToPixel(hex), HEX_SIZE - 1).forEach((corner) => {
      bounds.minX = Math.min(bounds.minX, corner.x);
      bounds.maxX = Math.max(bounds.maxX, corner.x);
      bounds.minY = Math.min(bounds.minY, corner.y);
      bounds.maxY = Math.max(bounds.maxY, corner.y);
    });
  });
  if (occupiedHexes.length === 0) {
    return { minX: -HEX_SIZE, maxX: HEX_SIZE, minY: -HEX_SIZE, maxY: HEX_SIZE };
  }
  return bounds;
}

function unitFootprintVisualTransform(unit: BattleUnit): { scaleX: number; scaleY: number; offset: PixelPoint } {
  const occupiedHexes = unit.occupiedHexes.length > 0 ? unit.occupiedHexes : [unit.position];
  if (unit.stats.size <= 1 || occupiedHexes.length <= 1) {
    return { scaleX: 1.32, scaleY: 1.46, offset: { x: 0, y: -HEX_SIZE * 0.03 } };
  }
  const center = axialToPixel(footprintCenter(occupiedHexes));
  const bounds = footprintPixelBounds(occupiedHexes);
  const fitWidth = Math.max(UNIT_PIXEL_SIZE, 2 * Math.min(center.x - bounds.minX, bounds.maxX - center.x));
  const fitHeight = Math.max(UNIT_PIXEL_SIZE, 2 * Math.min(center.y - bounds.minY, bounds.maxY - center.y));
  const fittedSize = Math.min(fitWidth, fitHeight) * 0.94;
  let scale = Math.min(5.8, Math.max(1, fittedSize / UNIT_PIXEL_SIZE));
  const offset: PixelPoint = { x: 0, y: 0 };

  if ((unit.stats.size === 2 || unit.stats.size === 4) && unit.footprintOrientation === 'north') {
    offset.y = -HEX_SIZE * (unit.stats.size === 2 ? 0.18 : 0.12);
    scale *= unit.stats.size === 2 ? 0.97 : 0.98;
  }

  return { scaleX: scale, scaleY: scale, offset };
}

function unitVisualPosition(unit: BattleUnit, position: PixelPoint): PixelPoint {
  const offset = unitFootprintVisualTransform(unit).offset;
  return { x: position.x + offset.x, y: position.y + offset.y };
}

export class BattleRenderer {
  private app: Application;

  private container: HTMLElement;

  private worldLayer = new Container();

  private terrainLayer = new Container();

  private boardLayer = new Container();

  private footprintLayer = new Container();

  private unitLayer = new Container();

  private effectLayer = new Container();

  private textures: Record<string, Texture> = {};

  private unitSprites = new Map<string, Sprite>();

  private tutorialUnitTargetLayer: HTMLDivElement;

  private tutorialUnitTargets = new Map<string, HTMLSpanElement>();

  private unitBaseScales = new Map<string, number>();

  private unitAlive = new Map<string, boolean>();

  private unitOutlines = new Map<string, Container<Sprite>>();

  private targetMarkers = new Map<string, Graphics>();

  private unitFootprints = new Map<string, Graphics>();

  private replay: BattleReplay | null = null;

  private layoutCache = new WeakMap<BattleUnit[], LayoutResult>();

  private troopProfileMap = new Map<string, import('../engine/types').ReplayTroopProfile>();

  private currentStep = -1;

  private strongHighlightIds = new Set<string>();

  private faintHighlightIds = new Set<string>();

  private fadingUnitIds = new Set<string>();

  private stopEffects: Array<() => void> = [];

  private interactionHandlers: RendererInteractionHandlers = {};

  private onDiagnostic: RendererDiagnosticHandler | null = null;

  private isAutoPlayback = false;

  private playbackRateMs = BASE_STEP_MS;

  private hexInspectionVisible = false;

  private boardBounds: Bounds = { minX: 0, maxX: 0, minY: 0, maxY: 0 };

  private baseFitZoom = 1;

  private zoom = 1;

  private minZoom = 1;

  private maxZoom = 1;

  private cameraOffset: PixelPoint = { x: 0, y: 0 };

  private dragPointerId: number | null = null;

  private dragStartGlobal: PixelPoint | null = null;

  private dragStartOffset: PixelPoint = { x: 0, y: 0 };

  private didDragDuringPointer = false;

  private resizeObserver: ResizeObserver | null = null;

  private pendingViewportRefreshFrame: number | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
    this.app = new Application({ background: '#111117', antialias: true, resizeTo: container });
    const canvas = this.app.view as HTMLCanvasElement;
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    container.appendChild(canvas);
    this.tutorialUnitTargetLayer = document.createElement('div');
    this.tutorialUnitTargetLayer.className = 'battle-tutorial-unit-targets';
    this.tutorialUnitTargetLayer.setAttribute('aria-hidden', 'true');
    container.appendChild(this.tutorialUnitTargetLayer);
    this.worldLayer.addChild(this.terrainLayer, this.boardLayer, this.footprintLayer, this.unitLayer, this.effectLayer);
    this.applyHexInspectionVisibility();
    this.app.stage.addChild(this.worldLayer);
    this.app.stage.eventMode = 'static';
    this.syncStageHitArea();
    this.app.stage.on('pointerdown', this.handlePointerDown);
    this.app.stage.on('pointermove', this.handlePointerMove);
    this.app.stage.on('pointerup', this.handlePointerUp);
    this.app.stage.on('pointerupoutside', this.handlePointerUp);
    this.setCanvasCursor('grab');
    this.resizeObserver = new ResizeObserver(() => {
      if (this.pendingViewportRefreshFrame !== null) {
        cancelAnimationFrame(this.pendingViewportRefreshFrame);
      }

      this.pendingViewportRefreshFrame = requestAnimationFrame(() => {
        this.pendingViewportRefreshFrame = null;
        this.refreshViewport();
      });
    });
    this.resizeObserver.observe(this.container);
  }

  async init(): Promise<void> {
    this.textures = await loadRaceUnitTextures((diagnostic) => this.reportDiagnostic(diagnostic));
    try {
      this.textures.projectile = await Assets.load(projectileUrl);
    } catch (error) {
      this.textures.projectile = Texture.WHITE;
      this.reportDiagnostic({
        source: 'assets',
        severity: 'error',
        code: 'projectile_asset_load_failed',
        message: error instanceof Error ? error.message : 'Failed to load projectile asset.',
        assetUrl: projectileUrl,
      });
    }
  }

  setInteractionHandlers(handlers: RendererInteractionHandlers): void {
    this.interactionHandlers = handlers;
  }

  setDiagnosticHandler(handler: RendererDiagnosticHandler | null): void {
    this.onDiagnostic = handler;
  }

  setPlaybackTiming(autoPlay: boolean, rateMs: number): void {
    const nextRateMs = Number.isFinite(rateMs) && rateMs > 0 ? rateMs : BASE_STEP_MS;
    this.isAutoPlayback = autoPlay;
    this.playbackRateMs = nextRateMs;
  }

  setHexInspectionVisible(visible: boolean): void {
    if (this.hexInspectionVisible === visible) {
      return;
    }
    this.hexInspectionVisible = visible;
    this.applyHexInspectionVisibility();
  }

  setTerrainVisible(visible: boolean): void {
    this.terrainLayer.visible = visible;
  }

  destroy(): void {
    this.clearEffects();
    if (this.pendingViewportRefreshFrame !== null) {
      cancelAnimationFrame(this.pendingViewportRefreshFrame);
      this.pendingViewportRefreshFrame = null;
    }
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.app.stage.off('pointerdown', this.handlePointerDown);
    this.app.stage.off('pointermove', this.handlePointerMove);
    this.app.stage.off('pointerup', this.handlePointerUp);
    this.app.stage.off('pointerupoutside', this.handlePointerUp);
    this.tutorialUnitTargetLayer.remove();
    this.app.destroy(true, { children: true, texture: false, baseTexture: false });
  }

  setReplay(replay: BattleReplay): void {
    this.replay = replay;
    this.layoutCache = new WeakMap();
    this.troopProfileMap = new Map(replay.troopProfiles.map((p) => [`${p.side}:${p.troopLabel}`, p]));
    this.currentStep = -1;
    this.clearLayers();
    const mapHexes = this.mapHexesForReplay(replay);
    this.drawTerrain(mapHexes);
    this.drawBoard(mapHexes);
    this.resetCameraToFit();
    this.mountUnitSprites(replay.initial.units);
    this.renderSnapshot(replay.initial.units);
    this.fitCameraToVisibleUnits();
  }

  zoomIn(): void {
    this.setZoom(this.zoom * ZOOM_STEP_FACTOR);
  }

  zoomOut(): void {
    this.setZoom(this.zoom / ZOOM_STEP_FACTOR);
  }

  resetZoom(): void {
    if (!this.replay) {
      return;
    }

    this.zoom = this.clampZoom(this.baseFitZoom / ZOOM_STEP_FACTOR);
    this.cameraOffset = { x: 0, y: 0 };
    this.applyCameraTransform();
  }

  refreshViewport(): void {
    this.syncStageHitArea();

    if (!this.replay) {
      this.applyCameraTransform();
      return;
    }

    const previousBaseZoom = this.baseFitZoom || 1;
    const relativeZoom = this.zoom / previousBaseZoom;

    this.recalculateZoomBounds();
    this.zoom = this.clampZoom(this.baseFitZoom * relativeZoom);
    this.clampCameraOffset();
    this.applyCameraTransform();
    this.fitCameraToVisibleUnits();
  }

  setHighlights(strongIds: string[], faintIds: string[]): void {
    const strongUnchanged =
      strongIds.length === this.strongHighlightIds.size && strongIds.every((id) => this.strongHighlightIds.has(id));
    const faintFiltered = faintIds.filter((id) => !this.strongHighlightIds.has(id));
    const faintUnchanged =
      faintFiltered.length === this.faintHighlightIds.size && faintFiltered.every((id) => this.faintHighlightIds.has(id));
    if (strongUnchanged && faintUnchanged) {
      return;
    }
    this.strongHighlightIds = new Set(strongIds);
    this.faintHighlightIds = new Set(faintFiltered);
    this.applyHighlights();
  }

  showStep(stepIndex: number, navigationKind: ReplayStepNavigationKind = 'event-select'): void {
    if (!this.replay) {
      return;
    }

    const normalized = Math.max(-1, Math.min(stepIndex, this.replay.steps.length - 1));
    const previous = this.currentStep;
    this.currentStep = normalized;

    const snapshot = normalized < 0 ? this.replay.initial.units : this.replay.steps[normalized]?.snapshot.units ?? [];

    if (normalized !== previous && (navigationKind === 'event-select' || navigationKind === 'reset')) {
      this.clearEffects();
    }

    this.renderSnapshot(snapshot);
    this.fitCameraToVisibleUnits();
    this.applyHighlights();

    if (normalized >= 0 && normalized !== previous) {
      const step = this.replay.steps[normalized] as BattleStep;
      const prevUnits =
        navigationKind === 'event-select' || navigationKind === 'reset'
          ? normalized <= 0
            ? this.replay.initial.units
            : this.replay.steps[normalized - 1]?.snapshot.units ?? this.replay.initial.units
          : previous < 0
            ? this.replay.initial.units
            : this.replay.steps[previous]?.snapshot.units ?? this.replay.initial.units;
      this.playStepEffect(step, prevUnits, snapshot);
    }
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
    this.terrainLayer.removeChildren();
    this.boardLayer.removeChildren();
    this.footprintLayer.removeChildren();
    this.unitLayer.removeChildren();
    this.unitSprites.clear();
    this.tutorialUnitTargetLayer.replaceChildren();
    this.tutorialUnitTargets.clear();
    this.unitBaseScales.clear();
    this.unitAlive.clear();
    this.fadingUnitIds.clear();
    this.unitOutlines.clear();
    this.targetMarkers.clear();
    this.unitFootprints.clear();
  }

  private reportDiagnostic(diagnostic: BattleReportDiagnostic): void {
    this.onDiagnostic?.({
      replayId: this.replay?.id ?? null,
      step: this.currentStep,
      ...diagnostic,
    });
  }

  private applyHexInspectionVisibility(): void {
    this.boardLayer.visible = this.hexInspectionVisible;
    this.footprintLayer.visible = this.hexInspectionVisible;
  }

  private mapHexesForReplay(replay: BattleReplay): HexCoord[] {
    if (replay.mapHexes.length > 0) {
      return replay.mapHexes;
    }
    const hexes: HexCoord[] = [];
    for (let q = -replay.mapRadius; q <= replay.mapRadius; q += 1) {
      const rMin = Math.max(-replay.mapRadius, -q - replay.mapRadius);
      const rMax = Math.min(replay.mapRadius, -q + replay.mapRadius);
      for (let r = rMin; r <= rMax; r += 1) {
        hexes.push({ q, r });
      }
    }
    return hexes;
  }

  private drawHex(graphics: Graphics, center: PixelPoint, fill: number, fillAlpha: number, stroke: number, strokeAlpha: number, radius = HEX_SIZE): void {
    graphics.lineStyle(1, stroke, strokeAlpha);
    graphics.beginFill(fill, fillAlpha);
    for (let i = 0; i < 6; i += 1) {
      const angle = (Math.PI / 180) * (60 * i - 30);
      const x = center.x + radius * Math.cos(angle);
      const y = center.y + radius * Math.sin(angle);
      if (i === 0) {
        graphics.moveTo(x, y);
      } else {
        graphics.lineTo(x, y);
      }
    }
    graphics.closePath();
    graphics.endFill();
  }

  private static terrainHash(q: number, r: number): number {
    return Math.abs(q * 1013 + r * 607 + q * r * 31 + 17);
  }

  private drawTerrain(mapHexes: HexCoord[]): void {
    const BASE_FILLS = [0x18201a, 0x1b1e1c, 0x181d1f, 0x1e1c18] as const;
    const DETAIL_FILLS = [0x223022, 0x262826, 0x1e272c, 0x2a2720] as const;

    const root = new Container();
    mapHexes.forEach((coord) => {
      const center = axialToPixel(coord);
      const seed = BattleRenderer.terrainHash(coord.q, coord.r);
      const typeIndex = seed % 4;
      const base = BASE_FILLS[typeIndex]!;
      const detail = DETAIL_FILLS[typeIndex]!;
      const g = new Graphics();

      g.lineStyle(0);
      g.beginFill(base, 1);
      for (let i = 0; i < 6; i += 1) {
        const angle = (Math.PI / 180) * (60 * i - 30);
        const x = center.x + HEX_SIZE * Math.cos(angle);
        const y = center.y + HEX_SIZE * Math.sin(angle);
        if (i === 0) {
          g.moveTo(x, y);
        } else {
          g.lineTo(x, y);
        }
      }
      g.closePath();
      g.endFill();

      const dotCount = 4 + (seed % 3);
      for (let d = 0; d < dotCount; d += 1) {
        const h = BattleRenderer.terrainHash(coord.q + d * 7, coord.r + d * 11);
        const angle = (h % 360) * (Math.PI / 180);
        const dist = ((h >> 4) % 80) / 100 * (HEX_SIZE * 0.56);
        const dotR = 0.8 + (h % 3) * 0.45;
        const alpha = 0.28 + (h % 35) / 100;
        g.beginFill(detail, alpha);
        g.drawCircle(center.x + Math.cos(angle) * dist, center.y + Math.sin(angle) * dist, dotR);
        g.endFill();
      }

      root.addChild(g);
    });

    this.terrainLayer.addChild(root);
  }

  private drawBoard(mapHexes: HexCoord[]): void {
    const root = new Container();
    this.boardBounds = this.computeBoardBounds(mapHexes);

    mapHexes.forEach((coord) => {
      const hex = new Graphics();
      this.drawHex(hex, axialToPixel(coord), 0x171c20, 0.85, 0x2a3036, 1);
      root.addChild(hex);
    });

    this.boardLayer.addChild(root);
  }

  private mountUnitSprites(units: BattleUnit[]): void {
    units.forEach((unit) => {
      if (this.unitSprites.has(unit.id)) {
        return;
      }
      const textureKey = `${unit.raceId}/${unit.unitClassId}`;
      const texture = this.textures[textureKey] ?? Texture.WHITE;
      if (!this.textures[textureKey]) {
        this.reportDiagnostic({
          source: 'renderer',
          severity: 'warning',
          code: 'unit_texture_fallback_used',
          message: `No texture was loaded for ${textureKey}; using renderer fallback texture.`,
          textureKey,
        });
      }
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
        if (this.didDragDuringPointer) {
          return;
        }
        this.interactionHandlers.onUnitClick?.(this.pointerInfo(unit.id, event));
      });

      const textureSize = Math.max(texture.width, texture.height, 1);
      const baseScale = UNIT_PIXEL_SIZE / textureSize;
      sprite.scale.set(unit.side === 'enemy' ? -baseScale : baseScale, baseScale);
      sprite.alpha = 1;
      sprite.tint = 0xffffff;

      this.unitLayer.addChild(sprite);
      this.unitSprites.set(unit.id, sprite);
      this.unitBaseScales.set(unit.id, baseScale);

      const footprint = new Graphics();
      footprint.visible = false;
      this.footprintLayer.addChild(footprint);
      this.unitFootprints.set(unit.id, footprint);

      const tutorialTarget = document.createElement('span');
      tutorialTarget.className = 'battle-tutorial-unit-target';
      tutorialTarget.dataset.tutorialTarget = 'battlefield-unit';
      tutorialTarget.dataset.unitId = unit.id;
      const profile = this.troopProfileMap.get(`${unit.side}:${unit.troopLabel}`);
      if ((profile?.abilities.length ?? 0) > 0) {
        tutorialTarget.dataset.tutorialHasAbilities = 'true';
      }
      this.tutorialUnitTargetLayer.appendChild(tutorialTarget);
      this.tutorialUnitTargets.set(unit.id, tutorialTarget);

      const outline = this.createUnitOutline(texture);
      this.unitLayer.addChildAt(outline, Math.max(0, this.unitLayer.getChildIndex(sprite)));
      this.unitOutlines.set(unit.id, outline);

      const targetMarker = new Graphics();
      this.drawTargetMarker(targetMarker);
      targetMarker.visible = false;
      this.unitLayer.addChild(targetMarker);
      this.targetMarkers.set(unit.id, targetMarker);
    });
  }

  private createUnitOutline(texture: Texture): Container<Sprite> {
    const outline = new Container<Sprite>();
    const offsets: PixelPoint[] = [
      { x: 0, y: -3 },
      { x: 3, y: 0 },
      { x: 0, y: 3 },
      { x: -3, y: 0 },
      { x: 2.2, y: -2.2 },
      { x: 2.2, y: 2.2 },
      { x: -2.2, y: 2.2 },
      { x: -2.2, y: -2.2 },
    ];

    offsets.forEach((offset) => {
      const copy = new Sprite(texture);
      copy.anchor.set(0.5, 0.5);
      copy.position.set(offset.x, offset.y);
      const solidGold = new ColorMatrixFilter();
      solidGold.matrix = [
        0,
        0,
        0,
        0,
        OUTLINE_GOLD.r,
        0,
        0,
        0,
        0,
        OUTLINE_GOLD.g,
        0,
        0,
        0,
        0,
        OUTLINE_GOLD.b,
        0,
        0,
        0,
        1,
        0,
      ];
      copy.filters = [solidGold];
      copy.alpha = 0.98;
      outline.addChild(copy);
    });

    outline.alpha = 0;
    outline.visible = false;
    return outline;
  }

  private drawTargetMarker(marker: Graphics): void {
    const targetRed = 0xff6056;
    const darkRed = 0x6f1d1b;
    marker.clear();
    marker.lineStyle(2, darkRed, 0.46);
    marker.drawCircle(0, 0, 4.3);
    marker.moveTo(-9, 0);
    marker.lineTo(-5, 0);
    marker.moveTo(5, 0);
    marker.lineTo(9, 0);
    marker.moveTo(0, -9);
    marker.lineTo(0, -5);
    marker.moveTo(0, 5);
    marker.lineTo(0, 9);

    marker.lineStyle(0.95, targetRed, 0.98);
    marker.drawCircle(0, 0, 4.3);
    marker.moveTo(-9, 0);
    marker.lineTo(-5, 0);
    marker.moveTo(5, 0);
    marker.lineTo(9, 0);
    marker.moveTo(0, -9);
    marker.lineTo(0, -5);
    marker.moveTo(0, 5);
    marker.lineTo(0, 9);
  }

  private drawUnitFootprint(graphics: Graphics, unit: BattleUnit): void {
    const occupiedHexes = unit.occupiedHexes.length > 0 ? unit.occupiedHexes : [unit.position];
    const fill = unit.side === 'player' ? 0x3f8ed8 : 0xd85f54;
    const stroke = unit.side === 'player' ? 0x9ccaf6 : 0xf3aaa3;
    const occupiedKeys = new Set(occupiedHexes.map(hexKey));
    graphics.clear();
    occupiedHexes.forEach((hex) => {
      this.drawHex(graphics, axialToPixel(hex), fill, unit.stats.size > 1 ? 0.19 : 0.16, fill, 0, HEX_SIZE + 0.35);
    });
    occupiedHexes.forEach((hex) => {
      const corners = hexCorners(axialToPixel(hex), HEX_SIZE + 0.35);
      HEX_EDGE_DIRS.forEach((dir, index) => {
        const neighborKey = hexKey({ q: hex.q + dir.q, r: hex.r + dir.r });
        if (occupiedKeys.has(neighborKey)) {
          return;
        }
        const start = corners[index]!;
        const end = corners[(index + 1) % 6]!;
        graphics.lineStyle(unit.stats.size > 1 ? 1.6 : 1, stroke, unit.stats.size > 1 ? 0.38 : 0.22);
        graphics.moveTo(start.x, start.y);
        graphics.lineTo(end.x, end.y);
      });
    });
    graphics.visible = true;
    graphics.alpha = 1;
  }

  private setOutlineScale(outline: Container<Sprite>, xScale: number, yScale: number): void {
    outline.children.forEach((copy) => {
      copy.scale.set(xScale, yScale);
    });
  }

  private computeDisplayLayout(units: BattleUnit[]): LayoutResult {
    const cached = this.layoutCache.get(units);
    if (cached) {
      return cached;
    }
    const result = this.buildDisplayLayout(units);
    this.layoutCache.set(units, result);
    return result;
  }

  private buildDisplayLayout(units: BattleUnit[]): LayoutResult {
    const aliveUnits = units.filter((unit) => unit.alive);
    if (aliveUnits.every((unit) => unit.occupiedHexes.length > 0)) {
      const positions = new Map<string, PixelPoint>();
      const densityScales = new Map<string, number>();
      aliveUnits.forEach((unit) => {
        positions.set(unit.id, axialToPixel(footprintCenter(unit.occupiedHexes)));
        densityScales.set(unit.id, 1);
      });
      return { positions, densityScales };
    }

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

      groupUnits.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
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
      const outline = this.unitOutlines.get(unit.id);
      const targetMarker = this.targetMarkers.get(unit.id);
      const footprint = this.unitFootprints.get(unit.id);
      if (!sprite || !outline || !targetMarker) {
        return;
      }

      if (!unit.alive) {
        sprite.visible = false;
        sprite.alpha = 0;
        outline.visible = false;
        targetMarker.visible = false;
        if (footprint) {
          footprint.visible = false;
        }
        return;
      }

      if (footprint) {
        this.drawUnitFootprint(footprint, unit);
      }
      const pos = layout.positions.get(unit.id) ?? axialToPixel(unit.position);
      const baseScale = this.unitBaseScales.get(unit.id) ?? 1;
      const densityScale = layout.densityScales.get(unit.id) ?? 1;
      const visualTransform = unitFootprintVisualTransform(unit);
      const xScale = (unit.side === 'enemy' ? -1 : 1) * baseScale * densityScale * visualTransform.scaleX;
      const yScale = baseScale * densityScale * visualTransform.scaleY;

      sprite.position.set(pos.x + visualTransform.offset.x, pos.y + visualTransform.offset.y);
      outline.position.set(sprite.x, sprite.y);
      targetMarker.position.set(sprite.x, sprite.y);
      targetMarker.scale.set(densityScale);

      sprite.tint = 0xffffff;
      sprite.visible = true;
      sprite.alpha = 1;
      sprite.scale.set(xScale, yScale);
      this.setOutlineScale(outline, xScale, yScale);
    });
    this.syncTutorialUnitTargets();
  }

  private syncTutorialUnitTargets(): void {
    this.tutorialUnitTargets.forEach((target, unitId) => {
      const sprite = this.unitSprites.get(unitId);
      if (!sprite || !this.unitAlive.get(unitId)) {
        target.hidden = true;
        return;
      }

      const bounds = sprite.getBounds();
      target.hidden = false;
      target.style.left = `${bounds.x}px`;
      target.style.top = `${bounds.y}px`;
      target.style.width = `${bounds.width}px`;
      target.style.height = `${bounds.height}px`;
    });
  }

  private effectDurationMs(): number {
    return this.scalePlaybackDuration(BASE_EFFECT_MS);
  }

  private attackEffectDurationMs(): number {
    return this.scalePlaybackDuration(this.isAutoPlayback ? AUTO_ATTACK_EFFECT_MS : BASE_EFFECT_MS);
  }

  private deathFadeDurationMs(): number {
    return this.scalePlaybackDuration(BASE_DEATH_FADE_MS);
  }

  private scalePlaybackDuration(durationMs: number): number {
    if (!this.isAutoPlayback) {
      return durationMs;
    }
    return Math.max(1, Math.round(durationMs * (this.playbackRateMs / BASE_STEP_MS)));
  }

  private playStepEffect(step: BattleStep, prevUnits: BattleUnit[], nextUnits: BattleUnit[]): void {
    const prevLayout = this.computeDisplayLayout(prevUnits);
    const nextLayout = this.computeDisplayLayout(nextUnits);

    if (step.kind === 'death') {
      step.targetIds.forEach((targetId) => {
        const fallen = getUnitById(prevUnits, targetId) ?? getUnitById(nextUnits, targetId);
        if (!fallen) {
          return;
        }
        const position = unitVisualPosition(fallen, prevLayout.positions.get(fallen.id) ?? nextLayout.positions.get(fallen.id) ?? axialToPixel(fallen.position));
        const densityScale = prevLayout.densityScales.get(fallen.id) ?? nextLayout.densityScales.get(fallen.id) ?? 1;
        this.stopEffects.push(this.fadeOutUnit(fallen, position, densityScale, this.deathFadeDurationMs()));
      });
      return;
    }

    if (step.kind === 'buff') {
      const effect = typeof step.metadata?.effect === 'string' ? step.metadata.effect : null;
      const actorId = step.actorIds[0] ?? null;

      if (actorId) {
        this.stopEffects.push(this.jumpUnit(actorId, Math.round(this.effectDurationMs() * 0.6)));
      }

      if (effect === 'summon') {
        step.targetIds.forEach((targetId) => {
          this.stopEffects.push(this.showSummonBurst(targetId, step));
        });
        return;
      }

      const indicatorKind = this.buffEffectIndicatorKind(step);
      step.targetIds.forEach((targetId) => {
        this.stopEffects.push(this.showBuffIndicator(targetId, this.abilityIconForStep(step, indicatorKind)));
      });
      return;
    }

    if (step.kind === 'attack') {
      const actorId = step.actorIds[0] ?? '';
      const actor = getUnitById(prevUnits, actorId) ?? getUnitById(nextUnits, actorId);
      if (!actor) {
        return;
      }

      const durationMs = this.attackEffectDurationMs();
      this.stopEffects.push(this.jumpUnit(actor.id, durationMs));

      const actorPos = unitVisualPosition(actor, prevLayout.positions.get(actor.id) ?? nextLayout.positions.get(actor.id) ?? axialToPixel(actor.position));
      const targets = step.targetIds
        .map((targetId) => getUnitById(prevUnits, targetId) ?? getUnitById(nextUnits, targetId))
        .filter((unit): unit is BattleUnit => Boolean(unit));
      const attackMode = step.metadata?.mode;
      const didDealDamage = typeof step.metadata?.damage === 'number' && step.metadata.damage > 0;
      const hitFlashDurationMs = this.scalePlaybackDuration(420);

      targets.forEach((target) => {
        const targetPos = unitVisualPosition(target, prevLayout.positions.get(target.id) ?? nextLayout.positions.get(target.id) ?? axialToPixel(target.position));
        if (target.alive) {
          this.stopEffects.push(
            this.holdUnitAtAttackPose(
              target,
              targetPos,
              prevLayout.densityScales.get(target.id),
              didDealDamage ? durationMs + hitFlashDurationMs : durationMs,
            ),
          );
        }
        if (attackMode === 'ranged') {
          this.stopEffects.push(this.fireProjectile(actorPos, targetPos, durationMs));
        } else if (attackMode === 'melee') {
          this.stopEffects.push(
            this.thrustMeleeSword(
              actorPos,
              targetPos,
              prevLayout.densityScales.get(actor.id) ?? nextLayout.densityScales.get(actor.id) ?? 1,
              durationMs,
            ),
          );
        }
        if (didDealDamage) {
          this.stopEffects.push(this.flashUnitHit(target.id, durationMs, hitFlashDurationMs));
        }
        this.stopEffects.push(this.shakeUnit(target.id, durationMs, durationMs));
      });
      return;
    }

    if (step.kind === 'heal') {
      step.targetIds.forEach((targetId) => {
        this.stopEffects.push(this.showEffectIndicator(targetId, this.abilityIconForStep(step, 'heal')));
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

      const start = unitVisualPosition(previousUnit, prevLayout.positions.get(previousUnit.id) ?? axialToPixel(previousUnit.position));
      const end = unitVisualPosition(nextUnit, nextLayout.positions.get(nextUnit.id) ?? axialToPixel(nextUnit.position));
      const routedAround =
        typeof step.metadata?.routedAroundBlockedQ === 'number' && typeof step.metadata.routedAroundBlockedR === 'number'
          ? { q: step.metadata.routedAroundBlockedQ, r: step.metadata.routedAroundBlockedR }
          : null;
      const waypoint = routedAround ? sharedHexVertex(previousUnit.position, nextUnit.position, routedAround) : null;

      this.stopEffects.push(
        animate(this.scalePlaybackDuration(waypoint ? 420 : 320), (t) => {
          const segmentT = waypoint ? (t < 0.5 ? t / 0.5 : (t - 0.5) / 0.5) : t;
          const from = waypoint && t >= 0.5 ? waypoint : start;
          const to = waypoint && t < 0.5 ? waypoint : end;
          sprite.x = from.x + (to.x - from.x) * segmentT;
          sprite.y = from.y + (to.y - from.y) * segmentT;
          this.syncUnitAdornments(actorId as string, sprite.x, sprite.y);
        }),
      );
    }
  }

  private fadeOutUnit(unit: BattleUnit, position: PixelPoint, densityScale = 1, durationMs: number): () => void {
    const sprite = this.unitSprites.get(unit.id);
    const outline = this.unitOutlines.get(unit.id);
    const targetMarker = this.targetMarkers.get(unit.id);
    const footprint = this.unitFootprints.get(unit.id);
    if (!sprite) {
      return () => {};
    }

    const baseScale = this.unitBaseScales.get(unit.id) ?? 1;
    const visualTransform = unitFootprintVisualTransform(unit);
    const xScale = (unit.side === 'enemy' ? -1 : 1) * baseScale * densityScale * visualTransform.scaleX;
    const yScale = baseScale * densityScale * visualTransform.scaleY;
    const driftDirection = unit.side === 'enemy' ? 1 : -1;
    const driftX = UNIT_PIXEL_SIZE * 1.2 * driftDirection;
    const launchHeight = UNIT_PIXEL_SIZE * 4.2;
    const spin = driftDirection * Math.PI * 0.85;

    this.fadingUnitIds.add(unit.id);
    sprite.visible = true;
    sprite.alpha = 1;
    sprite.tint = 0xffffff;
    sprite.rotation = 0;
    sprite.position.set(position.x, position.y);
    sprite.scale.set(xScale, yScale);
    if (outline) {
      outline.visible = false;
      outline.alpha = 0;
      this.setOutlineScale(outline, xScale, yScale);
    }
    if (targetMarker) {
      targetMarker.visible = false;
      targetMarker.alpha = 0;
    }
    if (footprint) {
      footprint.visible = false;
    }
    this.syncUnitAdornments(unit.id, sprite.x, sprite.y);

    const cleanup = () => {
      this.fadingUnitIds.delete(unit.id);
      sprite.visible = false;
      sprite.alpha = 0;
      sprite.rotation = 0;
      this.syncUnitAdornments(unit.id, sprite.x, sprite.y);
    };

    const stop = animate(
      durationMs,
      (t) => {
        const launch = 1 - Math.pow(1 - t, 3);
        const fade = t < 0.08 ? 1 : 1 - (t - 0.08) / 0.92;
        sprite.alpha = Math.max(0, fade);
        sprite.x = position.x + driftX * launch;
        sprite.y = position.y - launchHeight * launch;
        sprite.rotation = spin * launch;
        sprite.scale.set(xScale * (1 - 0.24 * launch), yScale * (1 - 0.24 * launch));
        this.syncUnitAdornments(unit.id, sprite.x, sprite.y);
      },
      cleanup,
      cleanup,
    );

    return () => {
      stop();
    };
  }

  private syncUnitAdornments(unitId: string, x: number, y: number): void {
    this.unitOutlines.get(unitId)?.position.set(x, y);
    this.targetMarkers.get(unitId)?.position.set(x, y);
  }

  private flashUnitHit(unitId: string, delayMs: number, durationMs: number): () => void {
    const sprite = this.unitSprites.get(unitId);
    if (!sprite) {
      return () => {};
    }

    const originalTint = sprite.tint;
    let delayHandle: ReturnType<typeof window.setTimeout> | null = null;
    let stopFlash: (() => void) | null = null;
    let cleaned = false;

    const cleanup = () => {
      if (cleaned) {
        return;
      }
      cleaned = true;
      if (delayHandle !== null) {
        window.clearTimeout(delayHandle);
        delayHandle = null;
      }
      sprite.tint = originalTint;
    };

    delayHandle = window.setTimeout(() => {
      delayHandle = null;
      stopFlash = animate(
        durationMs,
        (t) => {
          const wave = Math.sin(Math.PI * t);
          sprite.tint = mixColor(0xffffff, HIT_FLASH_RED, wave * HIT_FLASH_PEAK);
        },
        cleanup,
        cleanup,
      );
    }, delayMs);

    return () => {
      if (stopFlash) {
        stopFlash();
        return;
      }
      cleanup();
    };
  }

  private holdUnitAtAttackPose(unit: BattleUnit, position: PixelPoint, densityScale = 1, durationMs: number): () => void {
    const sprite = this.unitSprites.get(unit.id);
    const outline = this.unitOutlines.get(unit.id);
    const targetMarker = this.targetMarkers.get(unit.id);
    if (!sprite) {
      return () => {};
    }

    const postState = {
      visible: sprite.visible,
      alpha: sprite.alpha,
      x: sprite.x,
      y: sprite.y,
      scaleX: sprite.scale.x,
      scaleY: sprite.scale.y,
      outlineVisible: outline?.visible ?? false,
      outlineAlpha: outline?.alpha ?? 0,
      markerVisible: targetMarker?.visible ?? false,
      markerAlpha: targetMarker?.alpha ?? 0,
    };
    const baseScale = this.unitBaseScales.get(unit.id) ?? 1;
    const visualTransform = unitFootprintVisualTransform(unit);
    const xScale = (unit.side === 'enemy' ? -1 : 1) * baseScale * densityScale * visualTransform.scaleX;
    const yScale = baseScale * densityScale * visualTransform.scaleY;

    sprite.visible = true;
    sprite.alpha = 1;
    sprite.position.set(position.x, position.y);
    sprite.scale.set(xScale, yScale);
    if (outline) {
      this.setOutlineScale(outline, xScale, yScale);
    }
    this.syncUnitAdornments(unit.id, sprite.x, sprite.y);

    let cleaned = false;
    const cleanup = () => {
      if (cleaned) {
        return;
      }
      cleaned = true;
      sprite.visible = postState.visible;
      sprite.alpha = postState.alpha;
      sprite.position.set(postState.x, postState.y);
      sprite.scale.set(postState.scaleX, postState.scaleY);
      if (outline) {
        outline.visible = postState.outlineVisible;
        outline.alpha = postState.outlineAlpha;
        outline.position.set(sprite.x, sprite.y);
      }
      if (targetMarker) {
        targetMarker.visible = postState.markerVisible;
        targetMarker.alpha = postState.markerAlpha;
        targetMarker.position.set(sprite.x, sprite.y);
      }
    };

    const stop = animate(durationMs, () => {}, cleanup, cleanup);

    return () => {
      stop();
    };
  }

  private buffEffectIndicatorKind(step: BattleStep): EffectIndicatorKind {
    if (step.metadata?.expired === true) {
      return 'negative';
    }

    const amount = step.metadata?.amount;
    if (typeof amount === 'number' && amount < 0) {
      return 'negative';
    }

    const effect = typeof step.metadata?.effect === 'string' ? step.metadata.effect : null;
    const value = step.metadata?.value;
    if ((effect === 'readinessSet' || effect === 'rangeset') && typeof value === 'number' && value <= 0) {
      return 'negative';
    }

    return 'positive';
  }

  private fireProjectile(from: PixelPoint, to: PixelPoint, durationMs: number): () => void {
    const container = new Container();
    const trailGlow = new Graphics();
    const trail = new Graphics();
    const sprite = new Sprite(this.textures.projectile);
    sprite.anchor.set(0.5, 0.5);
    sprite.width = 14;
    sprite.height = 14;
    sprite.position.set(from.x, from.y);
    sprite.rotation = Math.atan2(to.y - from.y, to.x - from.x);
    container.addChild(trailGlow, trail, sprite);
    this.effectLayer.addChild(container);

    const deltaX = to.x - from.x;
    const deltaY = to.y - from.y;
    const projectileAngle = Math.atan2(deltaY, deltaX);
    const trailWidth = 2;
    const glowWidth = 5;
    const trailLength = 9;
    const trailPoints: PixelPoint[] = [{ x: from.x, y: from.y }];

    const drawTrail = (alpha: number) => {
      trailGlow.clear();
      trail.clear();

      if (trailPoints.length < 2 || alpha <= 0) {
        return;
      }

      for (let index = 1; index < trailPoints.length; index += 1) {
        const start = trailPoints[index - 1] as PixelPoint;
        const end = trailPoints[index] as PixelPoint;
        const segmentAlpha = alpha * (index / trailPoints.length);
        const glowAlpha = Math.min(1, segmentAlpha * 0.32);
        const trailAlpha = Math.min(1, segmentAlpha * 0.9);

        trailGlow.lineStyle(glowWidth, 0xffc76b, glowAlpha);
        trailGlow.moveTo(start.x, start.y);
        trailGlow.lineTo(end.x, end.y);

        trail.lineStyle(trailWidth, 0xffefb3, trailAlpha);
        trail.moveTo(start.x, start.y);
        trail.lineTo(end.x, end.y);
      }
    };

    let cleaned = false;
    const cleanup = () => {
      if (cleaned) {
        return;
      }
      cleaned = true;
      if (container.parent) {
        container.parent.removeChild(container);
      }
      trailGlow.destroy();
      trail.destroy();
      sprite.destroy();
      container.destroy();
    };

    const stop = animate(
      durationMs,
      (t) => {
        const currentX = from.x + deltaX * t;
        const currentY = from.y + deltaY * t;

        sprite.rotation = projectileAngle;
        sprite.x = currentX;
        sprite.y = currentY;
        sprite.alpha = 1;

        trailPoints.push({ x: currentX, y: currentY });
        while (trailPoints.length > trailLength) {
          trailPoints.shift();
        }

        drawTrail(1);
      },
      cleanup,
      cleanup,
    );

    return () => {
      stop();
    };
  }

  private thrustMeleeSword(from: PixelPoint, to: PixelPoint, densityScale: number, durationMs: number): () => void {
    const deltaX = to.x - from.x;
    const deltaY = to.y - from.y;
    const distance = Math.max(1, Math.hypot(deltaX, deltaY));
    const angle = Math.atan2(deltaY, deltaX);
    const dirX = deltaX / distance;
    const dirY = deltaY / distance;
    const hiltOffset = UNIT_PIXEL_SIZE * 0.45;
    const bladeLength = UNIT_PIXEL_SIZE * 0.76;
    const tipReach = Math.hypot(bladeLength, hiltOffset);
    const targetIconRadius = UNIT_PIXEL_SIZE * 0.42;
    const localTipAngle = Math.atan2(-hiltOffset, bladeLength);
    const endRotation = angle - localTipAngle;
    const clockwiseWindup = endRotation - Math.PI / 2;
    const counterClockwiseWindup = endRotation + Math.PI / 2;
    const startRotation = Math.sin(clockwiseWindup) <= Math.sin(counterClockwiseWindup) ? clockwiseWindup : counterClockwiseWindup;
    const lungeDistance = Math.max(0, distance - tipReach);
    const overshootDistance = Math.max(0, tipReach - distance - targetIconRadius);
    const endPivot = {
      x: from.x + dirX * (lungeDistance + overshootDistance),
      y: from.y + dirY * (lungeDistance + overshootDistance),
    };

    const sword = new Graphics();
    sword.rotation = startRotation;
    sword.position.set(from.x, from.y);
    this.effectLayer.addChild(sword);
    this.effectLayer.setChildIndex(sword, this.effectLayer.children.length - 1);

    const drawSword = (alpha: number) => {
      sword.clear();
      sword.lineStyle(5, 0x3a2419, alpha);
      sword.moveTo(-5, -hiltOffset);
      sword.lineTo(0, -hiltOffset);
      sword.lineStyle(3, 0xd8dde7, alpha);
      sword.moveTo(0, -hiltOffset);
      sword.lineTo(bladeLength, -hiltOffset);
      sword.lineStyle(1, 0xffffff, alpha * 0.9);
      sword.moveTo(2, -hiltOffset - 0.9);
      sword.lineTo(Math.max(3, bladeLength - 4), -hiltOffset - 0.9);
      sword.lineStyle(2, 0xb47737, alpha);
      sword.moveTo(1, -hiltOffset - 5);
      sword.lineTo(1, -hiltOffset + 5);
      sword.lineStyle(1.5, 0xf6df84, alpha);
      sword.moveTo(Math.max(1, bladeLength - 4), -hiltOffset - 3);
      sword.lineTo(bladeLength, -hiltOffset);
      sword.lineTo(Math.max(1, bladeLength - 4), -hiltOffset + 3);
    };

    drawSword(1);

    let cleaned = false;
    const cleanup = () => {
      if (cleaned) {
        return;
      }
      cleaned = true;
      if (sword.parent) {
        sword.parent.removeChild(sword);
      }
      sword.destroy();
    };

    const stop = animate(
      durationMs,
      (t) => {
        const windup = t < 0.16 ? t / 0.16 : 1;
        const swingT = t < 0.16 ? 0 : (t - 0.16) / 0.84;
        const swing = 1 - Math.pow(1 - swingT, 3);
        const travel = swingT <= 0 ? 0 : 1 - Math.pow(1 - swingT, 2);
        const arcLift = 3 * Math.sin(Math.PI * windup) + 5 * Math.sin(Math.PI * travel);
        sword.rotation = startRotation + (endRotation - startRotation) * swing;
        sword.position.set(from.x + (endPivot.x - from.x) * travel, from.y + (endPivot.y - from.y) * travel - arcLift);
        drawSword(t < 0.84 ? 1 : 1 - (t - 0.84) / 0.16);
      },
      cleanup,
      cleanup,
    );

    return () => {
      stop();
    };
  }

  private drawFallbackAbilityIcon(icon: AbilityFallbackIcon, size = 20): Graphics {
    const graphic = new Graphics();
    const fill = icon.tone === 'positive' ? 0x4279c9 : icon.tone === 'negative' ? 0xb83e43 : 0x8d98a6;
    const stroke = icon.tone === 'positive' ? 0xb7d7ff : icon.tone === 'negative' ? 0xffc2c4 : 0xe2e7ed;
    const drawShape = (shape: AbilityFallbackIconShape) => {
      graphic.clear();
      graphic.lineStyle(2, stroke, 0.95);
      graphic.beginFill(fill, 0.94);
      if (shape === 'heart') {
        graphic.moveTo(0, size * 0.42);
        graphic.bezierCurveTo(-size * 0.56, size * 0.05, -size * 0.34, -size * 0.42, 0, -size * 0.16);
        graphic.bezierCurveTo(size * 0.34, -size * 0.42, size * 0.56, size * 0.05, 0, size * 0.42);
      } else if (shape === 'self') {
        graphic.moveTo(0, size * 0.42);
        graphic.lineTo(-size * 0.46, -size * 0.34);
        graphic.lineTo(size * 0.46, -size * 0.34);
        graphic.closePath();
      } else if (shape === 'single') {
        graphic.endFill();
        graphic.drawCircle(0, 0, size * 0.42);
        graphic.beginFill(fill, 0.94);
        graphic.drawCircle(0, 0, size * 0.13);
      } else if (shape === 'aoe') {
        graphic.drawCircle(0, 0, size * 0.42);
      } else {
        graphic.drawRoundedRect(-size * 0.42, -size * 0.12, size * 0.84, size * 0.24, 2);
        graphic.drawRoundedRect(-size * 0.12, -size * 0.42, size * 0.24, size * 0.84, 2);
      }
      graphic.endFill();
    };
    drawShape(icon.shape);
    return graphic;
  }

  private abilityIconForStep(step: BattleStep, fallbackEffect?: string | null): AbilityFallbackIcon {
    const sourceAbilityId = typeof step.metadata?.sourceAbilityId === 'string' ? step.metadata.sourceAbilityId : null;
    if (sourceAbilityId && sourceAbilityId !== 'battle-resolution') {
      return getAbilityFallbackIcon(sourceAbilityId);
    }
    if (fallbackEffect === 'heal') {
      return { shape: 'heart', tone: 'positive' };
    }
    if (fallbackEffect === 'summon') {
      return { shape: 'plus', tone: 'neutral' };
    }
    return { shape: fallbackEffect === 'buff' ? 'aoe' : 'heart', tone: fallbackEffect === 'negative' ? 'negative' : 'positive' };
  }

  private showSummonBurst(unitId: string, step: BattleStep): () => void {
    const sprite = this.unitSprites.get(unitId);
    if (!sprite) {
      return () => {};
    }

    const smoke = new Graphics();
    smoke.position.set(sprite.x, sprite.y);
    this.effectLayer.addChild(smoke);

    const icon = this.drawFallbackAbilityIcon(this.abilityIconForStep(step, 'summon'), 18);
    icon.position.set(sprite.x, sprite.y - UNIT_PIXEL_SIZE * 0.66);
    this.effectLayer.addChild(icon);

    const startRadius = 10;
    const endRadius = 34;
    const startY = icon.y;

    let cleaned = false;
    const cleanup = () => {
      if (cleaned) {
        return;
      }
      cleaned = true;
      [smoke, icon].forEach((node) => {
        if (node.parent) {
          node.parent.removeChild(node);
        }
        node.destroy();
      });
    };

    const stop = animate(
      this.scalePlaybackDuration(620),
      (t) => {
        const radius = startRadius + (endRadius - startRadius) * t;
        smoke.clear();
        [0, 1, 2, 3].forEach((index) => {
          const angle = index * Math.PI * 0.5 + t * 0.5;
          const drift = radius * (0.25 + index * 0.08);
          smoke.beginFill(0xc7cbd1, 0.22 * (1 - t));
          smoke.drawCircle(Math.cos(angle) * drift, Math.sin(angle) * drift * 0.65, 8 + 9 * t);
          smoke.endFill();
        });

        icon.y = startY - 12 * t;
        icon.alpha = 1 - t;
        icon.scale.set(1 + 0.12 * Math.sin(Math.PI * t));
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

    const startX = sprite.x;
    const startY = sprite.y;
    const jumpHeight = Math.max(2, Math.round(UNIT_PIXEL_SIZE * 0.16));

    let cleaned = false;
    const cleanup = () => {
      if (cleaned) {
        return;
      }
      cleaned = true;
      sprite.position.set(startX, startY);
      this.syncUnitAdornments(unitId, sprite.x, sprite.y);
    };

    const stop = animate(
      Math.round(durationMs * 0.7),
      (t) => {
        const lift = Math.sin(Math.PI * t);
        sprite.position.set(startX, startY - jumpHeight * lift);
        this.syncUnitAdornments(unitId, sprite.x, sprite.y);
      },
      cleanup,
      cleanup,
    );

    return () => {
      stop();
    };
  }

  private shakeUnit(unitId: string, durationMs: number, delayMs = 0): () => void {
    const sprite = this.unitSprites.get(unitId);
    if (!sprite) {
      return () => {};
    }

    const startX = sprite.x;
    const startY = sprite.y;
    const amplitude = Math.max(2, Math.round(UNIT_PIXEL_SIZE * 0.1));
    const oscillations = 2;

    let cleaned = false;
    const cleanup = () => {
      if (cleaned) {
        return;
      }
      cleaned = true;
      sprite.position.set(startX, startY);
      this.syncUnitAdornments(unitId, sprite.x, sprite.y);
    };

    let delayHandle: ReturnType<typeof window.setTimeout> | null = null;
    let stopShake: (() => void) | null = null;

    const startShake = () => {
      delayHandle = null;
      stopShake = animate(
        Math.round(durationMs * 0.75),
        (t) => {
          const damping = 1 - t;
          const wave = Math.sin(Math.PI * 2 * oscillations * t);
          sprite.position.set(startX + wave * amplitude * damping, startY);
          this.syncUnitAdornments(unitId, sprite.x, sprite.y);
        },
        cleanup,
        cleanup,
      );
    };

    if (delayMs > 0) {
      delayHandle = window.setTimeout(startShake, delayMs);
    } else {
      startShake();
    }

    return () => {
      if (delayHandle !== null) {
        window.clearTimeout(delayHandle);
        delayHandle = null;
      }
      if (stopShake) {
        stopShake();
      } else {
        cleanup();
      }
    };
  }

  private showEffectIndicator(unitId: string, icon: AbilityFallbackIcon): () => void {
    const sprite = this.unitSprites.get(unitId);
    if (!sprite) {
      return () => {};
    }

    const indicator = this.drawFallbackAbilityIcon(icon, 20);
    indicator.position.set(sprite.x, sprite.y - UNIT_PIXEL_SIZE * 0.62);
    this.effectLayer.addChild(indicator);

    const startY = indicator.y;
    const floatDistance = icon.tone === 'negative' ? 22 : -22;

    let cleaned = false;
    const cleanup = () => {
      if (cleaned) {
        return;
      }
      cleaned = true;
      if (indicator.parent) {
        indicator.parent.removeChild(indicator);
      }
      indicator.destroy();
    };

    const stop = animate(
      this.scalePlaybackDuration(800),
      (t) => {
        indicator.y = startY + floatDistance * t;
        indicator.alpha = t < 0.3 ? 1 : 1 - (t - 0.3) / 0.7;
        indicator.scale.set(1 + 0.15 * Math.sin(Math.PI * t));
      },
      cleanup,
      cleanup,
    );

    return () => {
      stop();
    };
  }

  private showBuffIndicator(unitId: string, icon: AbilityFallbackIcon): () => void {
    const sprite = this.unitSprites.get(unitId);
    if (!sprite) {
      return () => {};
    }

    const indicator = this.drawFallbackAbilityIcon(icon, 20);
    indicator.position.set(sprite.x, sprite.y - UNIT_PIXEL_SIZE * 0.55);
    this.effectLayer.addChild(indicator);

    const halo = new Graphics();
    const haloColor = icon.tone === 'positive' ? 0x4279c9 : icon.tone === 'negative' ? 0xb83e43 : 0x8d98a6;
    halo.lineStyle(2, haloColor, 0.85);
    halo.drawCircle(0, 0, 12);
    halo.position.set(sprite.x, sprite.y);
    this.effectLayer.addChild(halo);

    const startY = indicator.y;
    const floatDistance = icon.tone === 'negative' ? 12 : -12;

    let cleaned = false;
    const cleanup = () => {
      if (cleaned) {
        return;
      }
      cleaned = true;
      [indicator, halo].forEach((node) => {
        if (node.parent) {
          node.parent.removeChild(node);
        }
        node.destroy();
      });
    };

    const stop = animate(
      this.scalePlaybackDuration(540),
      (t) => {
        indicator.y = startY + floatDistance * t;
        indicator.alpha = 1 - t;
        indicator.scale.set(1 + 0.12 * Math.sin(Math.PI * t));

        halo.clear();
        halo.lineStyle(2, haloColor, 0.85 * (1 - t));
        halo.drawCircle(0, 0, 12 + 8 * t);
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
      const outline = this.unitOutlines.get(unitId);
      const targetMarker = this.targetMarkers.get(unitId);
      const footprint = this.unitFootprints.get(unitId);
      const alive = this.unitAlive.get(unitId) ?? false;
      if (!alive) {
        if (this.fadingUnitIds.has(unitId)) {
          if (outline) {
            outline.visible = false;
          }
          if (targetMarker) {
            targetMarker.visible = false;
          }
          if (footprint) {
            footprint.visible = false;
          }
          return;
        }
        sprite.visible = false;
        if (outline) {
          outline.visible = false;
        }
        if (targetMarker) {
          targetMarker.visible = false;
        }
        if (footprint) {
          footprint.visible = false;
        }
        return;
      }

      const isStrong = this.strongHighlightIds.has(unitId);
      const isFaint = !isStrong && this.faintHighlightIds.has(unitId);

      sprite.tint = 0xffffff;
      sprite.alpha = 1;

      if (outline) {
        outline.visible = isStrong;
        outline.alpha = isStrong ? 1 : 0;
        outline.position.set(sprite.x, sprite.y);
      }

      if (targetMarker) {
        targetMarker.visible = isFaint;
        targetMarker.alpha = isFaint ? 0.84 : 0;
        targetMarker.position.set(sprite.x, sprite.y);
      }
    });
  }

  private visibleUnitWorldBounds(): Bounds | null {
    const bounds: Bounds = {
      minX: Number.POSITIVE_INFINITY,
      maxX: Number.NEGATIVE_INFINITY,
      minY: Number.POSITIVE_INFINITY,
      maxY: Number.NEGATIVE_INFINITY,
    };
    let hasVisibleUnit = false;

    this.unitSprites.forEach((sprite, unitId) => {
      if (!this.unitAlive.get(unitId) || !sprite.visible || sprite.alpha <= 0) {
        return;
      }

      const halfWidth = Math.abs(sprite.scale.x) * sprite.texture.width * 0.5;
      const halfHeight = Math.abs(sprite.scale.y) * sprite.texture.height * 0.5;
      bounds.minX = Math.min(bounds.minX, sprite.x - halfWidth);
      bounds.maxX = Math.max(bounds.maxX, sprite.x + halfWidth);
      bounds.minY = Math.min(bounds.minY, sprite.y - halfHeight);
      bounds.maxY = Math.max(bounds.maxY, sprite.y + halfHeight);
      hasVisibleUnit = true;
    });

    return hasVisibleUnit ? bounds : null;
  }

  private fitCameraToVisibleUnits(): void {
    const unitBounds = this.visibleUnitWorldBounds();
    if (!unitBounds) {
      return;
    }

    const availableWidth = Math.max(1, this.app.screen.width - UNIT_VIEWPORT_PADDING * 2);
    const availableHeight = Math.max(1, this.app.screen.height - UNIT_VIEWPORT_PADDING * 2);
    const boundsWidth = Math.max(1, unitBounds.maxX - unitBounds.minX);
    const boundsHeight = Math.max(1, unitBounds.maxY - unitBounds.minY);
    const fitZoom = this.clampZoom(Math.min(availableWidth / boundsWidth, availableHeight / boundsHeight));
    const nextZoom = fitZoom > this.zoom ? this.largestSteppedZoomThatFits(fitZoom) : fitZoom;
    const shouldRecenter = !this.boundsFitViewport(unitBounds);

    if (Math.abs(nextZoom - this.zoom) <= AUTO_ZOOM_EPSILON && !shouldRecenter) {
      return;
    }

    this.zoom = nextZoom;
    this.centerCameraOnBounds(unitBounds);
    this.clampCameraOffset();
    this.applyCameraTransform();
  }

  private boundsFitViewport(bounds: Bounds): boolean {
    const minX = this.worldLayer.x + bounds.minX * this.zoom;
    const maxX = this.worldLayer.x + bounds.maxX * this.zoom;
    const minY = this.worldLayer.y + bounds.minY * this.zoom;
    const maxY = this.worldLayer.y + bounds.maxY * this.zoom;

    return (
      minX >= UNIT_VIEWPORT_PADDING &&
      maxX <= this.app.screen.width - UNIT_VIEWPORT_PADDING &&
      minY >= UNIT_VIEWPORT_PADDING &&
      maxY <= this.app.screen.height - UNIT_VIEWPORT_PADDING
    );
  }

  private largestSteppedZoomThatFits(fitZoom: number): number {
    let nextZoom = this.zoom;

    while (nextZoom * ZOOM_STEP_FACTOR <= fitZoom + AUTO_ZOOM_EPSILON) {
      nextZoom *= ZOOM_STEP_FACTOR;
    }

    if (fitZoom > nextZoom + AUTO_ZOOM_EPSILON && fitZoom / nextZoom < ZOOM_STEP_FACTOR) {
      return fitZoom;
    }

    return this.clampZoom(nextZoom);
  }

  private centerCameraOnBounds(bounds: Bounds): void {
    const boardCenterX = (this.boardBounds.minX + this.boardBounds.maxX) / 2;
    const boardCenterY = (this.boardBounds.minY + this.boardBounds.maxY) / 2;
    const boundsCenterX = (bounds.minX + bounds.maxX) / 2;
    const boundsCenterY = (bounds.minY + bounds.maxY) / 2;
    this.cameraOffset = {
      x: (boardCenterX - boundsCenterX) * this.zoom,
      y: (boardCenterY - boundsCenterY) * this.zoom,
    };
  }

  private computeBoardBounds(mapHexes: HexCoord[]): Bounds {
    const hexExtentX = HEX_SIZE * Math.cos(Math.PI / 6);
    const hexExtentY = HEX_SIZE;
    const bounds: Bounds = {
      minX: Number.POSITIVE_INFINITY,
      maxX: Number.NEGATIVE_INFINITY,
      minY: Number.POSITIVE_INFINITY,
      maxY: Number.NEGATIVE_INFINITY,
    };

    mapHexes.forEach((hex) => {
      const center = axialToPixel(hex);
      bounds.minX = Math.min(bounds.minX, center.x - hexExtentX);
      bounds.maxX = Math.max(bounds.maxX, center.x + hexExtentX);
      bounds.minY = Math.min(bounds.minY, center.y - hexExtentY);
      bounds.maxY = Math.max(bounds.maxY, center.y + hexExtentY);
    });

    if (mapHexes.length === 0) {
      return { minX: -hexExtentX, maxX: hexExtentX, minY: -hexExtentY, maxY: hexExtentY };
    }

    return bounds;
  }

  private resetCameraToFit(): void {
    this.recalculateZoomBounds();
    this.zoom = this.clampZoom(this.baseFitZoom / ZOOM_STEP_FACTOR);
    this.cameraOffset = { x: 0, y: 0 };
    this.applyCameraTransform();
  }

  private recalculateZoomBounds(): void {
    const availableWidth = Math.max(1, this.app.screen.width - VIEWPORT_PADDING * 2);
    const availableHeight = Math.max(1, this.app.screen.height - VIEWPORT_PADDING * 2);
    const boardWidth = Math.max(1, this.boardBounds.maxX - this.boardBounds.minX);
    const boardHeight = Math.max(1, this.boardBounds.maxY - this.boardBounds.minY);

    this.baseFitZoom = Math.min(availableWidth / boardWidth, availableHeight / boardHeight) * DEFAULT_FIT_SCALE;
    this.minZoom = this.baseFitZoom * MIN_ZOOM_FACTOR;
    this.maxZoom = this.baseFitZoom * MAX_ZOOM_FACTOR;
  }

  private setZoom(nextZoom: number): void {
    this.zoom = this.clampZoom(nextZoom);
    this.clampCameraOffset();
    this.applyCameraTransform();
  }

  private clampZoom(zoom: number): number {
    return Math.max(this.minZoom, Math.min(this.maxZoom, zoom));
  }

  private applyCameraTransform(): void {
    const boardCenterX = (this.boardBounds.minX + this.boardBounds.maxX) / 2;
    const boardCenterY = (this.boardBounds.minY + this.boardBounds.maxY) / 2;
    this.worldLayer.scale.set(this.zoom);
    this.worldLayer.position.set(
      this.app.screen.width / 2 + this.cameraOffset.x - boardCenterX * this.zoom,
      this.app.screen.height / 2 + this.cameraOffset.y - boardCenterY * this.zoom,
    );
    this.syncTutorialUnitTargets();
  }

  private clampCameraOffset(): void {
    const boardWidth = this.boardBounds.maxX - this.boardBounds.minX;
    const boardHeight = this.boardBounds.maxY - this.boardBounds.minY;
    const availableWidth = Math.max(1, this.app.screen.width - VIEWPORT_PADDING * 2);
    const availableHeight = Math.max(1, this.app.screen.height - VIEWPORT_PADDING * 2);
    const maxOffsetX = Math.max(0, (boardWidth * this.zoom - availableWidth) / 2);
    const maxOffsetY = Math.max(0, (boardHeight * this.zoom - availableHeight) / 2);

    this.cameraOffset.x = Math.max(-maxOffsetX, Math.min(maxOffsetX, this.cameraOffset.x));
    this.cameraOffset.y = Math.max(-maxOffsetY, Math.min(maxOffsetY, this.cameraOffset.y));
  }

  private syncStageHitArea(): void {
    this.app.stage.hitArea = new Rectangle(0, 0, this.app.screen.width, this.app.screen.height);
  }

  private setCanvasCursor(cursor: string): void {
    (this.app.view as HTMLCanvasElement).style.cursor = cursor;
  }

  private handlePointerDown = (event: FederatedPointerEvent): void => {
    this.dragPointerId = event.pointerId;
    this.dragStartGlobal = { x: event.global.x, y: event.global.y };
    this.dragStartOffset = { ...this.cameraOffset };
    this.didDragDuringPointer = false;
  };

  private handlePointerMove = (event: FederatedPointerEvent): void => {
    if (this.dragPointerId !== event.pointerId || !this.dragStartGlobal) {
      return;
    }

    const deltaX = event.global.x - this.dragStartGlobal.x;
    const deltaY = event.global.y - this.dragStartGlobal.y;
    if (!this.didDragDuringPointer && Math.hypot(deltaX, deltaY) < DRAG_THRESHOLD_PX) {
      return;
    }

    this.didDragDuringPointer = true;
    this.cameraOffset = {
      x: this.dragStartOffset.x + deltaX,
      y: this.dragStartOffset.y + deltaY,
    };
    this.clampCameraOffset();
    this.applyCameraTransform();
    this.setCanvasCursor('grabbing');
  };

  private handlePointerUp = (event: FederatedPointerEvent): void => {
    if (this.dragPointerId !== event.pointerId) {
      return;
    }

    this.dragPointerId = null;
    this.dragStartGlobal = null;
    this.dragStartOffset = { ...this.cameraOffset };
    this.setCanvasCursor('grab');

    if (this.didDragDuringPointer) {
      window.setTimeout(() => {
        this.didDragDuringPointer = false;
      }, 0);
    }
  };
}
