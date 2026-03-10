export type Mode = "scanner" | "player";

export type PlayerUiState = "idle" | "loading" | "playing" | "paused" | "blocked" | "error";

export type BridgeMessage =
  | { type: "ready"; payload: null }
  | { type: "playing"; payload: null }
  | { type: "paused"; payload: null }
  | { type: "ended"; payload: null }
  | { type: "autoplayBlocked"; payload: null }
  | { type: "error"; payload: { code?: number } }
  | { type: "state"; payload: { state: number } };

export type ExtractErrorReason = "NOT_YOUTUBE" | "NOT_SINGLE_VIDEO" | "INVALID_ID";

export type ExtractResult =
  | { ok: true; videoId: string }
  | { ok: false; reason: ExtractErrorReason };

export type LandingPageResolveReason =
  | "UNSUPPORTED_HOST"
  | "NETWORK"
  | "INVALID_HTML"
  | "NOT_FOUND"
  | "MULTIPLE";

export type LandingPageResolveResult =
  | { ok: true; youtubeUrl: string; videoId: string }
  | { ok: false; reason: LandingPageResolveReason };

export type HistoryStatus = "success" | "failure";

export type PlaybackHistoryEntry = {
  id: string;
  sourceUrl: string;
  resolvedUrl: string | null;
  lastStatus: HistoryStatus;
  playCount: number;
  updatedAt: number;
};

export type ReplayRequest = {
  requestId: string;
  historyId: string;
  sourceUrl: string;
};
