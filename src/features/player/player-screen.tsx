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
// "player": block only WebView area, "app": block entire app while video is playing.
const PLAYBACK_TOUCH_BLOCK_SCOPE: "player" | "app" = "player";

// Normalizes an Expo Router search param into a single string value.
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

// Renders the dedicated playback route for a resolved YouTube session.
export function PlayerScreen() {
  const router = useRouter();
  const { height, width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { recordHistoryResult } = usePlaybackHistory();
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
  const webViewRef = useRef<WebView>(null);
  const alertVisibleRef = useRef(false);
  const isPlaybackSessionReady =
    historyId !== null && sourceUrl !== null && videoId !== null;
  const html = useMemo(() => {
    if (!videoId) return "";
    return buildYoutubeHtml(videoId, APP_ORIGIN, true);
  }, [videoId]);

  // Sends a YouTube bridge command into the embedded WebView player.
  const sendPlayerCommand = useCallback(
    (fnName: "__YT_PLAY__" | "__YT_PAUSE__" | "__YT_STOP__") => {
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

  // Dismisses the player route back to the previous screen and optionally stops playback first.
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

  // Records a playback failure, shows the blocking alert, and returns after confirmation.
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

      Alert.alert("재생 오류", message, [{ text: "확인", onPress: dismissAlert }], {
        cancelable: false,
        onDismiss: dismissAlert,
      });
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

  // Applies bridge events from the YouTube iframe to the native playback controls.
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
          // Some environments block autoplay without emitting autoplayBlocked.
          // Move out of loading so users can press play manually.
          setPlayerUiState((state) => (state === "loading" ? "paused" : state));
          return;
        case "playing":
          setPlayerUiState("playing");
          return;
        case "paused":
          setPlayerUiState("paused");
          return;
        case "autoplayBlocked":
          setPlayerUiState("blocked");
          return;
        case "ended":
          closePlayer(false);
          return;
        case "error":
          handlePlaybackFailure(mapYouTubeError(message.payload?.code));
          return;
        case "state":
        default:
          return;
      }
    },
    [closePlayer, handlePlaybackFailure],
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
  const shouldBlockPlayerAreaTouch =
    isPlaying && PLAYBACK_TOUCH_BLOCK_SCOPE === "player";
  const shouldBlockAppTouch = isPlaying && PLAYBACK_TOUCH_BLOCK_SCOPE === "app";
  const isAndroid = process.env.EXPO_OS === "android";
  const topToolbarTop = Math.max(12, insets.top + 8);
  const topReservedHeight =
    topToolbarTop + TOP_TOOLBAR_BUTTON_SIZE + PLAYER_VERTICAL_PADDING;
  const bottomReservedHeight = Math.max(PLAYER_VERTICAL_PADDING, insets.bottom + 12);
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
    playerUiState === "paused" || playerUiState === "blocked" || playerUiState === "loading"
      ? "play-arrow"
      : "pause";
  const playbackControlLabel =
    playerUiState === "paused" || playerUiState === "blocked" || playerUiState === "loading"
      ? "재생"
      : "일시정지";
  const isPlaybackControlDisabled = playerUiState === "loading";

  if (!isPlaybackSessionReady) {
    return <View style={styles.blank} />;
  }

  return (
    <View style={styles.container}>
      <View
        style={[
          styles.topToolbar,
          {
            top: topToolbarTop,
            right: TOP_TOOLBAR_MARGIN,
          },
        ]}
      >
        <Pressable
          accessibilityLabel={playbackControlLabel}
          accessibilityRole="button"
          disabled={isPlaybackControlDisabled}
          onPress={() => {
            if (playerUiState === "paused" || playerUiState === "blocked") {
              sendPlayerCommand("__YT_PLAY__");
              return;
            }

            sendPlayerCommand("__YT_PAUSE__");
          }}
          style={({ pressed }) => [
            styles.iconButton,
            isPlaybackControlDisabled && styles.iconButtonDisabled,
            pressed && !isPlaybackControlDisabled ? styles.iconButtonPressed : undefined,
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
  topToolbar: {
    position: "absolute",
    zIndex: 25,
    flexDirection: "row",
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
});
