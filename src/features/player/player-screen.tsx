import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { WebView, type WebViewMessageEvent } from "react-native-webview";

import { usePlaybackHistory } from "../playback-history/playback-history-context";
import { usePlaybackReturnSetting } from "../settings/playback-return-setting-context";
import { buildYoutubeHtml } from "../../lib/buildYoutubeHtml";
import {
  mapYouTubeError,
  NETWORK_ERROR_MESSAGE,
} from "../../lib/mapYouTubeError";
import type { BridgeMessage, PlayerUiState } from "../../lib/types";

const APP_ORIGIN = "https://qrplay.app.local";
const PLAYER_ASPECT_RATIO = 16 / 9;
const PLAYER_READY_TIMEOUT_MS = 15000;
const PLAYER_HORIZONTAL_PADDING = 16;
const PLAYER_VERTICAL_PADDING = 16;
const TOP_TOOLBAR_BUTTON_SIZE = 38;
const TOP_TOOLBAR_GAP = 10;
const TOP_TOOLBAR_MARGIN = 16;
// "player": WebView 영역만 막고, "app": 영상 재생 중 앱 전체를 막는다.
const PLAYBACK_TOUCH_BLOCK_SCOPE: "player" | "app" = "player";
const UNKNOWN_PLAYBACK_CLOCK = "--:--:--";

type PlaybackTiming = {
  durationSeconds: number | null;
  currentTimeSeconds: number;
};

// 초 단위 재생 시간을 HH:MM:SS 형식 문자열로 변환한다.
function formatPlaybackClock(totalSeconds: number | null): string {
  if (totalSeconds === null || !Number.isFinite(totalSeconds)) {
    return UNKNOWN_PLAYBACK_CLOCK;
  }

  const safeTotalSeconds = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(safeTotalSeconds / 3600);
  const minutes = Math.floor((safeTotalSeconds % 3600) / 60);
  const seconds = safeTotalSeconds % 60;

  return [hours, minutes, seconds]
    .map((value) => String(value).padStart(2, "0"))
    .join(":");
}

// 전체 길이와 현재 위치로 남은 재생 시간을 계산한다.
function getRemainingPlaybackSeconds(
  durationSeconds: number | null,
  currentTimeSeconds: number,
): number | null {
  if (durationSeconds === null || !Number.isFinite(durationSeconds)) {
    return null;
  }

  return Math.max(0, durationSeconds - currentTimeSeconds);
}

// Expo Router 검색 파라미터를 단일 문자열 값으로 정규화한다.
function readSearchParam(value: string | string[] | undefined): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }

  if (Array.isArray(value) && typeof value[0] === "string") {
    const trimmed = value[0].trim();
    return trimmed ? trimmed : null;
  }

  return null;
}

// 해석된 유튜브 세션용 전용 재생 라우트를 렌더링한다.
export function PlayerScreen() {
  const router = useRouter();
  const { height, width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { recordHistoryResult } = usePlaybackHistory();
  const { isPlaybackReturnSettingReady, shouldReturnAfterPlayback } =
    usePlaybackReturnSetting();
  const params = useLocalSearchParams<{
    historyId?: string | string[];
    preserveHistoryPosition?: string | string[];
    resolvedUrl?: string | string[];
    sourceUrl?: string | string[];
    videoId?: string | string[];
  }>();
  const historyId = readSearchParam(params.historyId);
  const preserveHistoryPosition =
    readSearchParam(params.preserveHistoryPosition) === "1";
  const resolvedUrl = readSearchParam(params.resolvedUrl);
  const sourceUrl = readSearchParam(params.sourceUrl);
  const videoId = readSearchParam(params.videoId);
  const [playerUiState, setPlayerUiState] = useState<PlayerUiState>("loading");
  const [isLoadingOverlayVisible, setIsLoadingOverlayVisible] = useState(true);
  const [didPlaybackReachEnd, setDidPlaybackReachEnd] = useState(false);
  const [playbackTiming, setPlaybackTiming] = useState<PlaybackTiming>({
    durationSeconds: null,
    currentTimeSeconds: 0,
  });
  const webViewRef = useRef<WebView>(null);
  const alertVisibleRef = useRef(false);
  const isPlaybackSessionReady =
    historyId !== null && sourceUrl !== null && videoId !== null;
  const html = useMemo(() => {
    if (!videoId) return "";
    return buildYoutubeHtml(videoId, APP_ORIGIN, true);
  }, [videoId]);

  // 내장 WebView 플레이어에 유튜브 브리지 명령을 보낸다.
  const sendPlayerCommand = useCallback(
    (
      fnName:
        | "__YT_PLAY__"
        | "__YT_PAUSE__"
        | "__YT_REPLAY__"
        | "__YT_STOP__",
    ) => {
      webViewRef.current?.injectJavaScript(`
        if (window.${fnName}) {
          window.${fnName}();
        }
        true;
      `);
    },
    [],
  );

  // 플레이어를 띄운 이전 화면으로 안전하게 복귀한다.
  const dismissPlayer = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }

    router.replace("/");
  }, [router]);

  // 이전 화면으로 플레이어 라우트를 닫고 필요하면 먼저 재생을 중지한다.
  const closePlayer = useCallback(
    (shouldStopPlayback = true) => {
      if (shouldStopPlayback) {
        sendPlayerCommand("__YT_STOP__");
      }

      setIsLoadingOverlayVisible(false);
      dismissPlayer();
    },
    [dismissPlayer, sendPlayerCommand],
  );

  // 재생 종료 후 같은 영상을 처음부터 다시 시작한다.
  const replayPlayback = useCallback(() => {
    setDidPlaybackReachEnd(false);
    setPlayerUiState("playing");
    setPlaybackTiming((current) => ({
      ...current,
      currentTimeSeconds: 0,
    }));
    sendPlayerCommand("__YT_REPLAY__");
  }, [sendPlayerCommand]);

  // 재생 실패를 기록하고 차단 알림을 띄운 뒤 확인 후 복귀한다.
  const handlePlaybackFailure = useCallback(
    (message: string) => {
      if (historyId && sourceUrl) {
        recordHistoryResult({
          historyId,
          preserveUpdatedAt: preserveHistoryPosition,
          sourceUrl,
          resolvedUrl,
          status: "failure",
          incrementPlayCount: false,
        });
      }

      if (alertVisibleRef.current) {
        return;
      }

      alertVisibleRef.current = true;
      setPlayerUiState("error");
      setIsLoadingOverlayVisible(false);

      let dismissed = false;
      const dismissAlert = () => {
        if (dismissed) {
          return;
        }

        dismissed = true;
        alertVisibleRef.current = false;
        dismissPlayer();
      };

      Alert.alert(
        "재생 오류",
        message,
        [{ text: "확인", onPress: dismissAlert }],
        {
          cancelable: false,
          onDismiss: dismissAlert,
        },
      );
    },
    [
      dismissPlayer,
      historyId,
      preserveHistoryPosition,
      recordHistoryResult,
      resolvedUrl,
      sourceUrl,
    ],
  );

  useEffect(() => {
    if (isPlaybackSessionReady) {
      return;
    }

    dismissPlayer();
  }, [dismissPlayer, isPlaybackSessionReady]);

  useEffect(() => {
    if (!isPlaybackSessionReady || playerUiState !== "loading") {
      return;
    }

    const timeout = setTimeout(() => {
      handlePlaybackFailure(NETWORK_ERROR_MESSAGE);
    }, PLAYER_READY_TIMEOUT_MS);

    return () => clearTimeout(timeout);
  }, [handlePlaybackFailure, isPlaybackSessionReady, playerUiState]);

  useEffect(() => {
    if (playerUiState !== "loading") {
      setIsLoadingOverlayVisible(false);
    }
  }, [playerUiState]);

  useEffect(() => {
    if (!didPlaybackReachEnd || !isPlaybackReturnSettingReady) {
      return;
    }

    if (shouldReturnAfterPlayback) {
      closePlayer(false);
      return;
    }

    setPlayerUiState("ended");
  }, [
    closePlayer,
    didPlaybackReachEnd,
    isPlaybackReturnSettingReady,
    shouldReturnAfterPlayback,
  ]);

  // 유튜브 iframe의 브리지 이벤트를 네이티브 재생 제어에 반영한다.
  const handlePlayerMessage = useCallback(
    (event: WebViewMessageEvent) => {
      let message: BridgeMessage;

      try {
        message = JSON.parse(event.nativeEvent.data) as BridgeMessage;
      } catch {
        return;
      }

      console.log("[PLAYER] message:", message.type, message.payload ?? null);

      switch (message.type) {
        case "ready":
          // 일부 환경에서는 autoplayBlocked 이벤트 없이 자동 재생을 막는다.
          // 사용자가 수동으로 재생을 누를 수 있도록 로딩 상태를 해제한다.
          setPlayerUiState((state) => (state === "loading" ? "paused" : state));
          return;
        case "playing":
          setDidPlaybackReachEnd(false);
          setPlayerUiState("playing");
          return;
        case "paused":
          setPlayerUiState("paused");
          return;
        case "autoplayBlocked":
          setPlayerUiState("blocked");
          return;
        case "progress":
          setPlaybackTiming((current) => ({
            durationSeconds:
              message.payload.durationSeconds > 0
                ? message.payload.durationSeconds
                : current.durationSeconds,
            currentTimeSeconds: Math.max(0, message.payload.currentTimeSeconds),
          }));
          return;
        case "ended":
          setPlaybackTiming((current) => ({
            ...current,
            currentTimeSeconds:
              current.durationSeconds ?? current.currentTimeSeconds,
          }));
          setPlayerUiState("paused");
          setDidPlaybackReachEnd(true);
          return;
        case "error":
          handlePlaybackFailure(mapYouTubeError(message.payload?.code));
          return;
        case "state":
        default:
          return;
      }
    },
    [handlePlaybackFailure],
  );

  const loadingOverlay = isLoadingOverlayVisible ? (
    <View style={styles.loadingOverlay}>
      <View style={styles.loadingCard}>
        <ActivityIndicator size="large" color="#2563EB" />
        <Text style={styles.loadingTitle}>영상 준비 중</Text>
        <Text style={styles.loadingDescription}>잠시만 기다려 주세요.</Text>
      </View>
    </View>
  ) : null;

  const isPlaying = playerUiState === "playing";
  const isPlaybackCompletionStepVisible = playerUiState === "ended";
  const shouldBlockPlayerAreaTouch =
    isPlaying && PLAYBACK_TOUCH_BLOCK_SCOPE === "player";
  const shouldBlockAppTouch = isPlaying && PLAYBACK_TOUCH_BLOCK_SCOPE === "app";
  const isAndroid = process.env.EXPO_OS === "android";
  const topToolbarTop = Math.max(12, insets.top + 8);
  const topReservedHeight =
    topToolbarTop + TOP_TOOLBAR_BUTTON_SIZE + PLAYER_VERTICAL_PADDING;
  const bottomReservedHeight = Math.max(
    PLAYER_VERTICAL_PADDING,
    insets.bottom + 12,
  );
  const maxPlayerWidth = Math.max(0, width - PLAYER_HORIZONTAL_PADDING * 2);
  const fullWidthPlayerHeight = maxPlayerWidth / PLAYER_ASPECT_RATIO;
  const availablePlayerHeight = Math.max(
    0,
    height - topReservedHeight - bottomReservedHeight,
  );
  const playerHeight = Math.min(fullWidthPlayerHeight, availablePlayerHeight);
  const playerWidth = Math.min(
    maxPlayerWidth,
    Math.max(0, playerHeight * PLAYER_ASPECT_RATIO),
  );
  const playbackControlIconName =
    playerUiState === "ended" ||
    playerUiState === "paused" ||
    playerUiState === "blocked" ||
    playerUiState === "loading"
      ? "play-arrow"
      : "pause";
  const playbackControlLabel =
    playerUiState === "ended" ||
    playerUiState === "paused" ||
    playerUiState === "blocked" ||
    playerUiState === "loading"
      ? "재생"
      : "일시정지";
  const isPlaybackControlDisabled = playerUiState === "loading";
  const remainingPlaybackSeconds = getRemainingPlaybackSeconds(
    playbackTiming.durationSeconds,
    playbackTiming.currentTimeSeconds,
  );
  const remainingDurationLabel = `${formatPlaybackClock(remainingPlaybackSeconds)}`;

  if (!isPlaybackSessionReady) {
    return <View style={styles.blank} />;
  }

  return (
    <View style={styles.container}>
      {!isPlaybackCompletionStepVisible ? (
        <View
          style={[
            styles.topToolbarRow,
            {
              top: topToolbarTop,
              left: TOP_TOOLBAR_MARGIN,
              right: TOP_TOOLBAR_MARGIN,
            },
          ]}
        >
          <View style={styles.topToolbarLeftGroup}>
            <View style={[styles.timeBadge, styles.timeBadgeSecondary]}>
              <Text numberOfLines={1} selectable style={styles.timeBadgeText}>
                {remainingDurationLabel}
              </Text>
            </View>
          </View>

          <View style={styles.topToolbarRightGroup}>
            <Pressable
              accessibilityLabel={playbackControlLabel}
              accessibilityRole="button"
              disabled={isPlaybackControlDisabled}
              onPress={() => {
                if (
                  playerUiState === "paused" ||
                  playerUiState === "blocked"
                ) {
                  sendPlayerCommand("__YT_PLAY__");
                  return;
                }

                sendPlayerCommand("__YT_PAUSE__");
              }}
              style={({ pressed }) => [
                styles.iconButton,
                isPlaybackControlDisabled && styles.iconButtonDisabled,
                pressed && !isPlaybackControlDisabled
                  ? styles.iconButtonPressed
                  : undefined,
              ]}
            >
              <MaterialIcons
                color="#FFFFFF"
                name={playbackControlIconName}
                size={22}
              />
            </Pressable>

            <Pressable
              accessibilityLabel="닫기"
              accessibilityRole="button"
              onPress={() => closePlayer()}
              style={({ pressed }) => [
                styles.iconButton,
                pressed ? styles.iconButtonPressed : undefined,
              ]}
            >
              <MaterialIcons color="#FFFFFF" name="close" size={20} />
            </Pressable>
          </View>
        </View>
      ) : null}

      <View
        style={[
          styles.playerViewport,
          {
            paddingTop: topReservedHeight,
            paddingBottom: bottomReservedHeight,
          },
        ]}
      >
        <View
          style={[
            styles.playerArea,
            {
              height: playerHeight,
              width: playerWidth,
            },
          ]}
        >
          <WebView
            ref={webViewRef}
            originWhitelist={["*"]}
            source={{ html, baseUrl: APP_ORIGIN }}
            onMessage={handlePlayerMessage}
            onError={() => handlePlaybackFailure(NETWORK_ERROR_MESSAGE)}
            onHttpError={() => handlePlaybackFailure(NETWORK_ERROR_MESSAGE)}
            javaScriptEnabled
            scrollEnabled={false}
            domStorageEnabled
            mediaPlaybackRequiresUserAction={false}
            allowsInlineMediaPlayback
            javaScriptCanOpenWindowsAutomatically={false}
            allowsFullscreenVideo={false}
            {...(isAndroid
              ? {
                  setBuiltInZoomControls: false,
                  setDisplayZoomControls: false,
                }
              : {})}
          />

          {shouldBlockPlayerAreaTouch ? (
            <Pressable
              style={styles.playerTouchBlocker}
              onPress={() => {}}
              accessibilityLabel="player-touch-blocker"
            />
          ) : null}
        </View>
      </View>

      {shouldBlockAppTouch ? (
        <Pressable
          style={styles.appTouchBlocker}
          onPress={() => {}}
          accessibilityLabel="app-touch-blocker"
        />
      ) : null}

      {isPlaybackCompletionStepVisible ? (
        <View style={styles.completionOverlay}>
          <View style={styles.completionCard}>
            <Text selectable style={styles.completionTitle}>
              영상 재생이 끝났습니다
            </Text>
            <Text selectable style={styles.completionDescription}>
              다시 보거나 화면을 닫을 수 있습니다.
            </Text>

            <View style={styles.completionActionRow}>
              <Pressable
                accessibilityLabel="다시보기"
                accessibilityRole="button"
                onPress={replayPlayback}
                style={({ pressed }) => [
                  styles.completionAction,
                  pressed ? styles.completionActionPressed : undefined,
                ]}
              >
                <View
                  style={[
                    styles.completionActionIconShell,
                    styles.completionActionPrimary,
                  ]}
                >
                  <MaterialIcons color="#FFFFFF" name="replay" size={28} />
                </View>
                <Text selectable style={styles.completionActionLabel}>
                  다시보기
                </Text>
              </Pressable>

              <Pressable
                accessibilityLabel="닫기"
                accessibilityRole="button"
                onPress={() => closePlayer(false)}
                style={({ pressed }) => [
                  styles.completionAction,
                  pressed ? styles.completionActionPressed : undefined,
                ]}
              >
                <View
                  style={[
                    styles.completionActionIconShell,
                    styles.completionActionSecondary,
                  ]}
                >
                  <MaterialIcons color="#FFFFFF" name="close" size={28} />
                </View>
                <Text selectable style={styles.completionActionLabel}>
                  닫기
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      ) : null}

      {loadingOverlay}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "rgba(2, 6, 23, 0.88)",
  },
  blank: {
    flex: 1,
    backgroundColor: "rgba(2, 6, 23, 0.88)",
  },
  topToolbarRow: {
    position: "absolute",
    zIndex: 25,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  topToolbarLeftGroup: {
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 1,
    gap: TOP_TOOLBAR_GAP,
  },
  topToolbarRightGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: TOP_TOOLBAR_GAP,
  },
  iconButton: {
    width: TOP_TOOLBAR_BUTTON_SIZE,
    height: TOP_TOOLBAR_BUTTON_SIZE,
    borderRadius: TOP_TOOLBAR_BUTTON_SIZE / 2,
    backgroundColor: "rgba(17, 24, 39, 0.78)",
    alignItems: "center",
    justifyContent: "center",
    elevation: 25,
  },
  iconButtonPressed: {
    backgroundColor: "rgba(31, 41, 55, 0.92)",
  },
  iconButtonDisabled: {
    opacity: 0.5,
  },
  timeBadge: {
    minWidth: 100,
    minHeight: TOP_TOOLBAR_BUTTON_SIZE,
    paddingHorizontal: 7,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    elevation: 25,
  },
  timeBadgePrimary: {
    backgroundColor: "rgba(37, 99, 235, 0.92)",
    borderColor: "rgba(191, 219, 254, 0.6)",
  },
  timeBadgeSecondary: {
    backgroundColor: "rgba(17, 24, 39, 0.82)",
    borderColor: "rgba(148, 163, 184, 0.35)",
  },
  timeBadgeText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0.2,
    fontVariant: ["tabular-nums"],
  },
  playerViewport: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: PLAYER_HORIZONTAL_PADDING,
  },
  playerArea: {
    position: "relative",
    alignSelf: "center",
    backgroundColor: "#000000",
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 30,
    elevation: 30,
  },
  loadingCard: {
    minWidth: 220,
    paddingHorizontal: 20,
    paddingVertical: 18,
    borderRadius: 14,
    backgroundColor: "rgba(17, 24, 39, 0.92)",
    alignItems: "center",
  },
  loadingTitle: {
    marginTop: 12,
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "700",
  },
  loadingDescription: {
    marginTop: 6,
    color: "#D1D5DB",
    fontSize: 14,
  },
  playerTouchBlocker: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "transparent",
    zIndex: 20,
    elevation: 20,
  },
  appTouchBlocker: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "transparent",
    zIndex: 25,
    elevation: 25,
  },
  completionOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(2, 6, 23, 0.72)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
    zIndex: 28,
    elevation: 28,
  },
  completionCard: {
    width: "100%",
    maxWidth: 320,
    borderRadius: 24,
    borderCurve: "continuous",
    backgroundColor: "rgba(15, 23, 42, 0.94)",
    paddingHorizontal: 22,
    paddingVertical: 24,
    alignItems: "center",
    gap: 10,
    boxShadow: "0 24px 64px rgba(0, 0, 0, 0.36)",
  },
  completionTitle: {
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "800",
    textAlign: "center",
  },
  completionDescription: {
    color: "#CBD5E1",
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
  },
  completionActionRow: {
    width: "100%",
    marginTop: 10,
    flexDirection: "row",
    justifyContent: "center",
    gap: 18,
  },
  completionAction: {
    minWidth: 96,
    alignItems: "center",
    gap: 10,
    paddingVertical: 6,
    borderRadius: 18,
  },
  completionActionPressed: {
    opacity: 0.85,
  },
  completionActionIconShell: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: "center",
    justifyContent: "center",
  },
  completionActionPrimary: {
    backgroundColor: "#2563EB",
  },
  completionActionSecondary: {
    backgroundColor: "rgba(71, 85, 105, 0.92)",
  },
  completionActionLabel: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },
});
