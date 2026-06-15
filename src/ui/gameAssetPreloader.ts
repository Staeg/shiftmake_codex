import { FACTIONS } from '../engine/unitCatalog';
import type { BattleReportDiagnostic, FactionId } from '../engine/types';
import { getPreloadableGameIconUrls } from '../presentation/iconAssets';
import { getFactionSpriteUrl, loadFactionUnitPortraitUrls, UNIT_SPRITE_URLS, type AssetLoadProgress } from '../rendering/unitVisualAssets';
import { getRiftSpriteUrls } from './riftVisuals';

export type GameAssetPreloadProgress = AssetLoadProgress & {
  active: boolean;
};

export type GameAssetPreloadResult = {
  portraits: Record<string, string>;
  diagnostics: BattleReportDiagnostic[];
};

type ProgressSink = (progress: GameAssetPreloadProgress) => void;

let cachedResult: GameAssetPreloadResult | null = null;
let inFlight: Promise<GameAssetPreloadResult> | null = null;
const IMAGE_PRELOAD_CONCURRENCY = 8;
const IMAGE_PRELOAD_TIMEOUT_MS = 2500;

function uniqueUrls(urls: string[]): string[] {
  return [...new Set(urls.filter((url) => url.length > 0))];
}

function decodeImage(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    let finished = false;
    const timeout = window.setTimeout(() => {
      if (finished) {
        return;
      }
      finished = true;
      reject(new Error(`Timed out preloading image: ${url}`));
    }, IMAGE_PRELOAD_TIMEOUT_MS);
    const finish = (callback: () => void) => {
      if (finished) {
        return;
      }
      finished = true;
      window.clearTimeout(timeout);
      callback();
    };
    image.decoding = 'async';
    image.onload = () => {
      const decode = image.decode?.();
      if (decode) {
        void decode.then(() => finish(resolve)).catch(() => finish(resolve));
      } else {
        finish(resolve);
      }
    };
    image.onerror = () => finish(() => reject(new Error(`Failed to preload image: ${url}`)));
    image.src = url;
  });
}

async function preloadImageUrls(
  urls: string[],
  options: {
    completedOffset: number;
    total: number;
    labelPrefix: string;
    diagnostics: BattleReportDiagnostic[];
    onProgress?: ProgressSink;
  },
): Promise<void> {
  let completed = 0;
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < urls.length) {
      const url = urls[nextIndex];
      nextIndex += 1;
      if (!url) {
        continue;
      }

      try {
        await decodeImage(url);
      } catch (error) {
        options.diagnostics.push({
          source: 'assets',
          severity: 'error',
          code: 'game_asset_preload_failed',
          message: error instanceof Error ? error.message : `Failed to preload image: ${url}`,
          assetUrl: url,
        });
      }
      completed += 1;
      options.onProgress?.({
        active: true,
        completed: options.completedOffset + completed,
        total: options.total,
        label: `${options.labelPrefix} ${completed} / ${urls.length}`,
      });
    }
  }

  await Promise.all(Array.from({ length: Math.min(IMAGE_PRELOAD_CONCURRENCY, urls.length) }, () => worker()));
}

export async function preloadGameAssets(onProgress?: ProgressSink): Promise<GameAssetPreloadResult> {
  if (cachedResult) {
    onProgress?.({ active: false, completed: 1, total: 1, label: 'Game images ready' });
    return cachedResult;
  }
  if (inFlight) {
    return inFlight;
  }

  inFlight = (async () => {
    const diagnostics: BattleReportDiagnostic[] = [];
    const portraitUnitCount = Object.keys(UNIT_SPRITE_URLS).length;
    const factionUrls = (Object.keys(FACTIONS) as FactionId[]).map((factionId) => getFactionSpriteUrl(factionId));
    const imageUrls = uniqueUrls([...factionUrls, ...getRiftSpriteUrls(), ...getPreloadableGameIconUrls()]);
    const rendererChunkCount = 1;
    const total = portraitUnitCount + imageUrls.length + rendererChunkCount;

    onProgress?.({ active: true, completed: 0, total, label: 'Preparing game images' });

    let portraitCompleted = 0;
    const portraits = await loadFactionUnitPortraitUrls((progress) => {
      portraitCompleted = progress.completed;
      onProgress?.({
        active: true,
        completed: progress.completed,
        total,
        label: progress.label,
      });
    }).catch((error) => {
      diagnostics.push({
        source: 'assets',
        severity: 'error',
        code: 'portrait_generation_failed',
        message: error instanceof Error ? error.message : 'Failed to generate unit portraits.',
      });
      return {};
    });

    await preloadImageUrls(imageUrls, {
      completedOffset: portraitCompleted,
      total,
      labelPrefix: 'Loaded interface image',
      diagnostics,
      onProgress,
    });

    try {
      await import('../rendering/BattleRenderer');
    } catch (error) {
      diagnostics.push({
        source: 'assets',
        severity: 'error',
        code: 'replay_renderer_preload_failed',
        message: error instanceof Error ? error.message : 'Failed to preload replay renderer.',
      });
    }
    onProgress?.({
      active: true,
      completed: total,
      total,
      label: 'Prepared replay renderer',
    });

    cachedResult = { portraits, diagnostics };
    onProgress?.({ active: false, completed: total, total, label: 'Game images ready' });
    return cachedResult;
  })();

  try {
    return await inFlight;
  } finally {
    inFlight = null;
  }
}
