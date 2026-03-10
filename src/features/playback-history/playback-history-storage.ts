import type { PlaybackHistoryEntry } from "../../lib/types";

const PLAYBACK_HISTORY_STORAGE_KEY = "@qrplay/playback-history";

type AsyncStorageModule = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
};

let cachedAsyncStorage: AsyncStorageModule | null | undefined;

// Returns the AsyncStorage native module when it is available in the current app binary.
function getAsyncStorageModule(): AsyncStorageModule | null {
  if (cachedAsyncStorage !== undefined) {
    return cachedAsyncStorage;
  }

  try {
    const asyncStorageModule = require("@react-native-async-storage/async-storage")
      .default as AsyncStorageModule | undefined;
    cachedAsyncStorage = asyncStorageModule ?? null;
  } catch {
    cachedAsyncStorage = null;
  }

  return cachedAsyncStorage;
}

// Returns true when a parsed JSON value matches the playback history entry shape.
function isPlaybackHistoryEntry(value: unknown): value is PlaybackHistoryEntry {
  if (!value || typeof value !== "object") {
    return false;
  }

  const entry = value as Partial<PlaybackHistoryEntry>;

  return (
    typeof entry.id === "string" &&
    typeof entry.sourceUrl === "string" &&
    (typeof entry.resolvedUrl === "string" || entry.resolvedUrl === null) &&
    (entry.lastStatus === "success" || entry.lastStatus === "failure") &&
    typeof entry.playCount === "number" &&
    Number.isFinite(entry.playCount) &&
    typeof entry.updatedAt === "number" &&
    Number.isFinite(entry.updatedAt)
  );
}

// Sorts playback history entries so the latest interaction always appears first.
function sortPlaybackHistory(
  entries: PlaybackHistoryEntry[],
): PlaybackHistoryEntry[] {
  return [...entries].sort((left, right) => right.updatedAt - left.updatedAt);
}

// Loads the persisted playback history list from AsyncStorage.
export async function loadStoredPlaybackHistory(): Promise<
  PlaybackHistoryEntry[]
> {
  const asyncStorage = getAsyncStorageModule();
  if (!asyncStorage) {
    return [];
  }

  try {
    const rawHistory = await asyncStorage.getItem(PLAYBACK_HISTORY_STORAGE_KEY);
    if (!rawHistory) {
      return [];
    }

    const parsedHistory = JSON.parse(rawHistory) as unknown;
    if (!Array.isArray(parsedHistory)) {
      return [];
    }

    return sortPlaybackHistory(parsedHistory.filter(isPlaybackHistoryEntry));
  } catch {
    return [];
  }
}

// Persists the latest playback history list into AsyncStorage.
export async function saveStoredPlaybackHistory(
  entries: PlaybackHistoryEntry[],
): Promise<void> {
  const asyncStorage = getAsyncStorageModule();
  if (!asyncStorage) {
    return;
  }

  await asyncStorage.setItem(
    PLAYBACK_HISTORY_STORAGE_KEY,
    JSON.stringify(entries),
  );
}
