import React, {
  createContext,
  useCallback,
  useEffect,
  useState,
  type PropsWithChildren,
} from "react";

import {
  DEFAULT_RETURN_AFTER_PLAYBACK,
  getShouldReturnAfterPlayback,
  isPlaybackReturnStorageAvailable,
  setShouldReturnAfterPlayback,
} from "./playback-return-storage";

type PlaybackReturnSettingContextValue = {
  isPlaybackReturnSettingAvailable: boolean;
  isPlaybackReturnSettingReady: boolean;
  isSavingPlaybackReturnSetting: boolean;
  shouldReturnAfterPlayback: boolean;
  updateShouldReturnAfterPlayback: (nextValue: boolean) => Promise<void>;
};

const PlaybackReturnSettingContext =
  createContext<PlaybackReturnSettingContextValue | null>(null);

// 앱 전역에서 공유할 영상 종료 후 돌아가기 설정 상태를 제공한다.
export function PlaybackReturnSettingProvider({
  children,
}: PropsWithChildren): React.JSX.Element {
  const isPlaybackReturnSettingAvailable = isPlaybackReturnStorageAvailable();
  const [shouldReturnAfterPlayback, setShouldReturnAfterPlaybackState] =
    useState(DEFAULT_RETURN_AFTER_PLAYBACK);
  const [isPlaybackReturnSettingReady, setIsPlaybackReturnSettingReady] =
    useState(!isPlaybackReturnSettingAvailable);
  const [isSavingPlaybackReturnSetting, setIsSavingPlaybackReturnSetting] =
    useState(false);

  useEffect(() => {
    let isActive = true;

    if (!isPlaybackReturnSettingAvailable) {
      setShouldReturnAfterPlaybackState(DEFAULT_RETURN_AFTER_PLAYBACK);
      setIsPlaybackReturnSettingReady(true);
      return () => {
        isActive = false;
      };
    }

    setIsPlaybackReturnSettingReady(false);

    void (async () => {
      const savedValue = await getShouldReturnAfterPlayback();

      if (!isActive) {
        return;
      }

      setShouldReturnAfterPlaybackState(savedValue);
      setIsPlaybackReturnSettingReady(true);
    })();

    return () => {
      isActive = false;
    };
  }, [isPlaybackReturnSettingAvailable]);

  // 영상 종료 후 복귀 설정을 낙관적으로 갱신하고 저장 결과를 반영한다.
  const updateShouldReturnAfterPlayback = useCallback(
    async (nextValue: boolean) => {
      if (!isPlaybackReturnSettingAvailable) {
        throw new Error("AsyncStorage native module is unavailable.");
      }

      if (nextValue === shouldReturnAfterPlayback) {
        return;
      }

      const previousValue = shouldReturnAfterPlayback;
      setShouldReturnAfterPlaybackState(nextValue);
      setIsSavingPlaybackReturnSetting(true);

      try {
        await setShouldReturnAfterPlayback(nextValue);
      } catch {
        setShouldReturnAfterPlaybackState(previousValue);
        throw new Error("Failed to persist playback return setting.");
      } finally {
        setIsSavingPlaybackReturnSetting(false);
      }
    },
    [isPlaybackReturnSettingAvailable, shouldReturnAfterPlayback],
  );

  return (
    <PlaybackReturnSettingContext.Provider
      value={{
        isPlaybackReturnSettingAvailable,
        isPlaybackReturnSettingReady,
        isSavingPlaybackReturnSetting,
        shouldReturnAfterPlayback,
        updateShouldReturnAfterPlayback,
      }}
    >
      {children}
    </PlaybackReturnSettingContext.Provider>
  );
}

// 영상 종료 후 돌아가기 설정 컨텍스트를 안전하게 읽어온다.
export function usePlaybackReturnSetting(): PlaybackReturnSettingContextValue {
  const context = React.use(PlaybackReturnSettingContext);
  if (!context) {
    throw new Error(
      "usePlaybackReturnSetting must be used within PlaybackReturnSettingProvider",
    );
  }

  return context;
}
