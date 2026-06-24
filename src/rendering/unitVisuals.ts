import { Texture } from 'pixi.js';
import type { BattleReportDiagnostic, RaceId, UnitClassId } from '../engine/types';
import { buildColorMap, RACE_PALETTES, loadImage, recolorImageToCanvas, UNIT_SPRITE_URLS } from './unitVisualAssets';

type DiagnosticSink = (diagnostic: BattleReportDiagnostic) => void;

function recolorImage(image: HTMLImageElement, colorMap: Map<string, [number, number, number]>): Texture {
  return Texture.from(recolorImageToCanvas(image, colorMap));
}

export async function loadRaceUnitTextures(onDiagnostic?: DiagnosticSink): Promise<Record<string, Texture>> {
  const unitClassIds = Object.keys(UNIT_SPRITE_URLS) as UnitClassId[];
  const images = await Promise.all(
    unitClassIds.map(async (unitClassId) => {
      try {
        return [unitClassId, await loadImage(UNIT_SPRITE_URLS[unitClassId])] as const;
      } catch (error) {
        onDiagnostic?.({
          source: 'assets',
          severity: 'error',
          code: 'unit_sprite_load_failed',
          message: error instanceof Error ? error.message : `Failed to load unit sprite: ${unitClassId}`,
          textureKey: unitClassId,
          assetUrl: UNIT_SPRITE_URLS[unitClassId],
        });
        return [unitClassId, null] as const;
      }
    }),
  );

  const byUnitClass = new Map<UnitClassId, HTMLImageElement | null>(images);
  const textures: Record<string, Texture> = {};

  unitClassIds.forEach((unitClassId) => {
    const image = byUnitClass.get(unitClassId);
    if (!image) {
      onDiagnostic?.({
        source: 'assets',
        severity: 'warning',
        code: 'unit_sprite_texture_unavailable',
        message: `No base sprite was available for ${unitClassId}; affected units will use renderer fallback textures.`,
        textureKey: unitClassId,
        assetUrl: UNIT_SPRITE_URLS[unitClassId],
      });
      return;
    }

    (Object.keys(RACE_PALETTES) as RaceId[]).forEach((raceId) => {
      const textureKey = `${raceId}/${unitClassId}`;
      textures[textureKey] = recolorImage(image, buildColorMap(unitClassId, raceId));
    });
  });

  return textures;
}
