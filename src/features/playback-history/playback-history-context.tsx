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
  preserveUpdatedAt?: boolean;
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

// 각 재생 히스토리 행에 사용할 고유 ID를 만든다.
function createHistoryEntryId(): string {
  historyEntryCounter += 1;
  return `history-${Date.now()}-${historyEntryCounter}`;
}

// 대기 중인 재생 요청에 사용할 고유 ID를 만든다.
function createReplayRequestId(): string {
  replayRequestCounter += 1;
  return `replay-${Date.now()}-${replayRequestCounter}`;
}

// 히스토리 행을 추가 또는 갱신하고 최근에 갱신된 항목이 위에 오도록 유지한다.
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
    updatedAt:
      input.preserveUpdatedAt && targetEntry
        ? targetEntry.updatedAt
        : Date.now(),
  };
  const nextEntries =
    targetIndex >= 0
      ? entries.map((entry, index) => (index === targetIndex ? nextEntry : entry))
      : [...entries, nextEntry];

  if (!(input.preserveUpdatedAt && targetEntry)) {
    nextEntries.sort((left, right) => right.updatedAt - left.updatedAt);
  }

  return { entries: nextEntries, historyId };
}

// 탭 내비게이터 전반에서 공유하는 재생 히스토리 상태를 제공한다.
export function PlaybackHistoryProvider({
  children,
}: PropsWithChildren): React.JSX.Element {
  const [history, setHistory] = useState<PlaybackHistoryEntry[]>([]);
  const [isHistoryReady, setIsHistoryReady] = useState(false);
  const historyRef = useRef<PlaybackHistoryEntry[]>([]);
  const [pendingReplayRequest, setPendingReplayRequest] =
    useState<ReplayRequest | null>(null);

  // 앱이 재생 히스토리를 읽기 전에 저장된 값을 복원한다.
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

  // 메모리 내 목록이 바뀔 때마다 현재 재생 히스토리를 저장한다.
  useEffect(() => {
    if (!isHistoryReady) {
      return;
    }

    void saveStoredPlaybackHistory(historyRef.current);
  }, [history, isHistoryReady]);

  // 스캔하거나 다시 재생한 URL의 최신 결과를 기록한다.
  function recordHistoryResult(input: RecordHistoryResultInput): string {
    const result = upsertHistoryEntry(historyRef.current, input);
    historyRef.current = result.entries;
    setHistory(result.entries);
    return result.historyId;
  }

  // 스캐너 탭이 기존 플레이어 흐름을 재사용할 수 있도록 재생 요청을 대기열에 넣는다.
  function requestReplay(historyId: string): void {
    const targetEntry = historyRef.current.find((entry) => entry.id === historyId);
    if (!targetEntry) return;

    setPendingReplayRequest({
      requestId: createReplayRequestId(),
      historyId: targetEntry.id,
      sourceUrl: targetEntry.sourceUrl,
    });
  }

  // 스캐너 탭이 처리를 시작하면 재생 요청을 비운다.
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

// 스캐너 탭과 히스토리 탭에서 쓰는 공통 재생 히스토리 API를 반환한다.
export function usePlaybackHistory(): PlaybackHistoryContextValue {
  const context = React.use(PlaybackHistoryContext);
  if (!context) {
    throw new Error("usePlaybackHistory must be used within PlaybackHistoryProvider");
  }

  return context;
}
