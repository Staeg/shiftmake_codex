import { deserializeGameState } from "./game";
import { decodeBase64Url, encodeBase64Url, hashString, stableStringify } from "../shared/reportEncoding";
const REPORT_PREFIX = "SMCR1.";
const REPORT_VERSION = 1;
const APP_VERSION = "0.1.0";
function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function hasStoredReplayPayload(value) {
  if (!isObject(value) || value.version !== 1 || !isObject(value.input)) {
    return false;
  }
  return typeof value.input.seed === "number" && Array.isArray(value.input.mutatorIds) && Array.isArray(value.input.playerCombatants) && Array.isArray(value.input.enemyCombatants);
}
function hasReplayPayloadMap(value) {
  if (!isObject(value)) {
    return false;
  }
  return Object.values(value).every((entry) => hasStoredReplayPayload(entry));
}
function hasUiContext(value) {
  if (!isObject(value)) {
    return false;
  }
  return typeof value.screen === "string" && typeof value.centerMode === "string" && ("selectedRiftId" in value ? typeof value.selectedRiftId === "string" || value.selectedRiftId === null : false) && ("selectedTroopId" in value ? typeof value.selectedTroopId === "string" || value.selectedTroopId === null : false) && ("selectedReplayId" in value ? typeof value.selectedReplayId === "string" || value.selectedReplayId === null : false) && ("currentReplayStep" in value ? typeof value.currentReplayStep === "number" || value.currentReplayStep === null : false) && ("systemMessage" in value ? typeof value.systemMessage === "string" || value.systemMessage === null : false) && Array.isArray(value.validationMessages);
}
function buildCampaignReportPayload(options) {
  const reportBase = stableStringify({
    game: options.game,
    replayPayloadIds: Object.keys(options.replayPayloads).sort(),
    missingReplayIds: [...options.missingReplayIds].sort(),
    uiContext: options.uiContext
  });
  const reportId = `cr-${hashString(reportBase)}`;
  return {
    version: REPORT_VERSION,
    reportId,
    createdAt: options.createdAt ?? (/* @__PURE__ */ new Date()).toISOString(),
    app: {
      name: "shiftmake",
      version: APP_VERSION,
      ...options.buildMode ? { buildMode: options.buildMode } : {}
    },
    game: options.game,
    replayPayloads: { ...options.replayPayloads },
    missingReplayIds: [...options.missingReplayIds],
    uiContext: {
      ...options.uiContext,
      validationMessages: [...options.uiContext.validationMessages]
    },
    summary: {
      campaignSeed: options.game.campaignSeed,
      cycleNumber: options.game.cycleNumber,
      phase: options.game.phase,
      victoryPoints: options.game.victoryPoints,
      troopCount: options.game.troops.length,
      riftCount: options.game.openRifts.length,
      replayIndexCount: options.game.replayIndex.length,
      replayPayloadCount: Object.keys(options.replayPayloads).length,
      missingReplayCount: options.missingReplayIds.length
    }
  };
}
function encodeCampaignReport(payload) {
  return `${REPORT_PREFIX}${encodeBase64Url(JSON.stringify(payload))}`;
}
function decodeCampaignReport(value) {
  const trimmed = value.trim();
  if (!trimmed.startsWith(REPORT_PREFIX)) {
    return { ok: false, error: "invalid_prefix" };
  }
  let parsed;
  try {
    parsed = JSON.parse(decodeBase64Url(trimmed.slice(REPORT_PREFIX.length)));
  } catch {
    return { ok: false, error: "invalid_json" };
  }
  if (!isObject(parsed)) {
    return { ok: false, error: "invalid_shape" };
  }
  if (parsed.version !== REPORT_VERSION) {
    return { ok: false, error: "unsupported_version" };
  }
  const gameResult = deserializeGameState(JSON.stringify(parsed.game));
  if (!gameResult.ok || !gameResult.state) {
    return { ok: false, error: "invalid_game_state" };
  }
  if (!hasReplayPayloadMap(parsed.replayPayloads) || !Array.isArray(parsed.missingReplayIds) || !parsed.missingReplayIds.every((entry) => typeof entry === "string")) {
    return { ok: false, error: "invalid_shape" };
  }
  if (!hasUiContext(parsed.uiContext)) {
    return { ok: false, error: "invalid_shape" };
  }
  if (typeof parsed.reportId !== "string" || typeof parsed.createdAt !== "string" || !isObject(parsed.summary)) {
    return { ok: false, error: "invalid_shape" };
  }
  return { ok: true, payload: { ...parsed, game: gameResult.state } };
}
function campaignReportDecodeErrorMessage(error) {
  switch (error) {
    case "invalid_prefix":
      return "Campaign report must start with SMCR1.";
    case "invalid_json":
      return "Campaign report data could not be decoded.";
    case "unsupported_version":
      return "This campaign report version is not supported by this build.";
    case "invalid_game_state":
      return "Campaign report is missing a supported campaign save state.";
    case "invalid_shape":
      return "Campaign report is missing required campaign report data.";
    default:
      return "Campaign report could not be imported.";
  }
}
export {
  buildCampaignReportPayload,
  campaignReportDecodeErrorMessage,
  decodeCampaignReport,
  encodeCampaignReport
};
//# sourceMappingURL=campaignReport.js.map
