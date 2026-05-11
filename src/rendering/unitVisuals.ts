import { Texture } from 'pixi.js';
import type { BattleReportDiagnostic, FactionId, UnitTypeId } from '../engine/types';
import { buildColorMap, FACTION_PALETTES, loadImage, recolorImageToCanvas, UNIT_SPRITE_URLS } from './unitVisualAssets';

type DiagnosticSink = (diagnostic: BattleReportDiagnostic) => void;

function recolorImage(image: HTMLImageElement, colorMap: Map<string, [number, number, number]>): Texture {
  return Texture.from(recolorImageToCanvas(image, colorMap));
}

export async function loadFactionUnitTextures(onDiagnostic?: DiagnosticSink): Promise<Record<string, Texture>> {
  const images = await Promise.all(
    (Object.keys(UNIT_SPRITE_URLS) as UnitTypeId[]).map(async (unitTypeId) => {
      try {
        return [unitTypeId, await loadImage(UNIT_SPRITE_URLS[unitTypeId])] as const;
      } catch (error) {
        onDiagnostic?.({
          source: 'assets',
          severity: 'error',
          code: 'unit_sprite_load_failed',
          message: error instanceof Error ? error.message : `Failed to load unit sprite: ${unitTypeId}`,
          textureKey: unitTypeId,
          assetUrl: UNIT_SPRITE_URLS[unitTypeId],
        });
        return [unitTypeId, null] as const;
      }
    }),
  );

  const byUnitType = new Map<UnitTypeId, HTMLImageElement | null>(images);
  const textures: Record<string, Texture> = {};

  (Object.keys(UNIT_SPRITE_URLS) as UnitTypeId[]).forEach((unitTypeId) => {
    const image = byUnitType.get(unitTypeId);
    if (!image) {
      onDiagnostic?.({
        source: 'assets',
        severity: 'warning',
        code: 'unit_sprite_texture_unavailable',
        message: `No base sprite was available for ${unitTypeId}; affected units will use renderer fallback textures.`,
        textureKey: unitTypeId,
        assetUrl: UNIT_SPRITE_URLS[unitTypeId],
      });
      return;
    }

    (Object.keys(FACTION_PALETTES) as FactionId[]).forEach((factionId) => {
      const textureKey = `${factionId}/${unitTypeId}`;
      textures[textureKey] = recolorImage(image, buildColorMap(unitTypeId, factionId));
    });
  });

  return textures;
}
