import React, {
  createContext,
  useEffect,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";

import type {
  HistoryStatus,
  PlaybackHistoryEntry,
  ReplayRequest,
} from "../../lib/types";
import {
  loadStoredPlaybackHistory,
  saveStoredPlaybackHistory,
} from "./playback-history-storage";

type RecordHistoryResultInput = {
  historyId?: string;
  sourceUrl: string;
  resolvedUrl: string | null;
  status: HistoryStatus;
  incrementPlayCount: boolean;
};

type PlaybackHistoryContextValue = {
  history: PlaybackHistoryEntry[];
  isHistoryReady: boolean;
  pendingReplayRequest: ReplayRequest | null;
  recordHistoryResult: (input: RecordHistoryResultInput) => string;
  requestReplay: (historyId: string) => void;
  consumeReplayRequest: (requestId: string) => void;
};

const PlaybackHistoryContext = createContext<PlaybackHistoryContextValue | null>(
  null,
);

let historyEntryCounter = 0;
let replayRequestCounter = 0;

// Creates a unique id for each playback history row.
function createHistoryEntryId(): string {
  historyEntryCounter += 1;
  return `history-${Date.now()}-${historyEntryCounter}`;
}

// Creates a unique id for a queued replay request.
function createReplayRequestId(): string {
  replayRequestCounter += 1;
  return `replay-${Date.now()}-${replayRequestCounter}`;
}

// Upserts a history row and keeps the most recently touched items at the top.
function upsertHistoryEntry(
  entries: PlaybackHistoryEntry[],
  input: RecordHistoryResultInput,
): { entries: PlaybackHistoryEntry[]; historyId: string } {
  const sourceUrl = input.sourceUrl.trim();
  const targetIndex =
    input.historyId !== undefined
      ? entries.findIndex((entry) => entry.id === input.historyId)
      : entries.findIndex((entry) => entry.sourceUrl === sourceUrl);
  const targetEntry = targetIndex >= 0 ? entries[targetIndex] : null;
  const historyId = targetEntry?.id ?? createHistoryEntryId();
  const nextEntry: PlaybackHistoryEntry = {
    id: historyId,
    sourceUrl,
    resolvedUrl: input.resolvedUrl ?? targetEntry?.resolvedUrl ?? null,
    lastStatus: input.status,
    playCount:
      (targetEntry?.playCount ?? 0) + (input.incrementPlayCount ? 1 : 0),
    updatedAt: Date.now(),
  };
  const nextEntries =
    targetIndex >= 0
      ? entries.map((entry, index) => (index === targetIndex ? nextEntry : entry))
      : [...entries, nextEntry];

  nextEntries.sort((left, right) => right.updatedAt - left.updatedAt);

  return { entries: nextEntries, historyId };
}

// Provides shared playback history state across the tab navigator.
export function PlaybackHistoryProvider({
  children,
}: PropsWithChildren): React.JSX.Element {
  const [history, setHistory] = useState<PlaybackHistoryEntry[]>([]);
  const [isHistoryReady, setIsHistoryReady] = useState(false);
  const historyRef = useRef<PlaybackHistoryEntry[]>([]);
  const [pendingReplayRequest, setPendingReplayRequest] =
    useState<ReplayRequest | null>(null);

  // Restores the persisted playback history before the app starts reading it.
  useEffect(() => {
    let isActive = true;

    void (async () => {
      const storedHistory = await loadStoredPlaybackHistory();

      if (!isActive) {
        return;
      }

      historyRef.current = storedHistory;
      setHistory(storedHistory);
      setIsHistoryReady(true);
    })();

    return () => {
      isActive = false;
    };
  }, []);

  // Persists the current playback history whenever the in-memory list changes.
  useEffect(() => {
    if (!isHistoryReady) {
      return;
    }

    void saveStoredPlaybackHistory(historyRef.current);
  }, [history, isHistoryReady]);

  // Records the latest result for a scanned or replayed URL.
  function recordHistoryResult(input: RecordHistoryResultInput): string {
    const result = upsertHistoryEntry(historyRef.current, input);
    historyRef.current = result.entries;
    setHistory(result.entries);
    return result.historyId;
  }

  // Queues a replay request so the scanner tab can reuse its existing player flow.
  function requestReplay(historyId: string): void {
    const targetEntry = historyRef.current.find((entry) => entry.id === historyId);
    if (!targetEntry) return;

    setPendingReplayRequest({
      requestId: createReplayRequestId(),
      historyId: targetEntry.id,
      sourceUrl: targetEntry.sourceUrl,
    });
  }

  // Clears a replay request after the scanner tab starts handling it.
  function consumeReplayRequest(requestId: string): void {
    setPendingReplayRequest((current) => {
      if (!current || current.requestId !== requestId) {
        return current;
      }

      return null;
    });
  }

  return (
    <PlaybackHistoryContext.Provider
      value={{
        history,
        isHistoryReady,
        pendingReplayRequest,
        recordHistoryResult,
        requestReplay,
        consumeReplayRequest,
      }}
    >
      {children}
    </PlaybackHistoryContext.Provider>
  );
}

// Returns the shared playback history API for scanner and history tabs.
export function usePlaybackHistory(): PlaybackHistoryContextValue {
  const context = React.use(PlaybackHistoryContext);
  if (!context) {
    throw new Error("usePlaybackHistory must be used within PlaybackHistoryProvider");
  }

  return context;
}
