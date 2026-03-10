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
  Platform,
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
const CONTROL_BUTTON_HEIGHT = 38;
const CONTROL_BUTTON_GAP = 10;
const CONTROL_BUTTON_MAX_WIDTH = 112;
const CONTROL_BUTTON_MIN_WIDTH = 96;
const CONTROL_TOP_PADDING = 12;
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
    resolvedUrl?: string | string[];
    sourceUrl?: string | string[];
    videoId?: string | string[];
  }>();
  const historyId = readSearchParam(params.historyId);
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

  // Dismisses the player route back to the scanner tab and optionally stops playback first.
  const closePlayer = useCallback(
    (shouldStopPlayback = true) => {
      if (shouldStopPlayback) {
        sendPlayerCommand("__YT_STOP__");
      }

      setIsLoadingOverlayVisible(false);
      router.dismissTo("/");
    },
    [router, sendPlayerCommand],
  );

  // Records a playback failure, shows the blocking alert, and returns to the scanner after confirmation.
  const handlePlaybackFailure = useCallback(
    (message: string) => {
      if (historyId && sourceUrl) {
        recordHistoryResult({
          historyId,
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
        router.dismissTo("/");
      };

      Alert.alert("재생 오류", message, [{ text: "확인", onPress: dismissAlert }], {
        cancelable: false,
        onDismiss: dismissAlert,
      });
    },
    [historyId, recordHistoryResult, resolvedUrl, router, sourceUrl],
  );

  useEffect(() => {
    if (isPlaybackSessionReady) {
      return;
    }

    router.dismissTo("/");
  }, [isPlaybackSessionReady, router]);

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

  const primaryButtonLabel =
    playerUiState === "loading"
      ? "로딩 중..."
      : playerUiState === "paused"
        ? "계속 재생"
        : playerUiState === "blocked"
          ? "재생"
          : "일시정지";
  const isPrimaryDisabled = playerUiState === "loading";
  const isPlaying = playerUiState === "playing";
  const shouldBlockPlayerAreaTouch =
    isPlaying && PLAYBACK_TOUCH_BLOCK_SCOPE === "player";
  const shouldBlockAppTouch = isPlaying && PLAYBACK_TOUCH_BLOCK_SCOPE === "app";
  const controlsPaddingBottom = Math.max(12, insets.bottom + 8);
  const controlsTotalHeight =
    CONTROL_TOP_PADDING + controlsPaddingBottom + CONTROL_BUTTON_HEIGHT;
  const maxPlayerWidth = Math.max(0, width - PLAYER_HORIZONTAL_PADDING * 2);
  const fullWidthPlayerHeight = maxPlayerWidth / PLAYER_ASPECT_RATIO;
  const availablePlayerHeight = Math.max(0, height - controlsTotalHeight);
  const playerHeight = Math.min(fullWidthPlayerHeight, availablePlayerHeight);
  const playerWidth = Math.min(
    maxPlayerWidth,
    Math.max(0, playerHeight * PLAYER_ASPECT_RATIO),
  );
  const maxFittingButtonWidth = Math.max(
    0,
    (width - PLAYER_HORIZONTAL_PADDING * 2 - CONTROL_BUTTON_GAP) / 2,
  );
  const controlButtonWidth = Math.min(
    CONTROL_BUTTON_MAX_WIDTH,
    Math.max(CONTROL_BUTTON_MIN_WIDTH, playerWidth * 0.33),
    maxFittingButtonWidth,
  );

  if (!isPlaybackSessionReady) {
    return <View style={styles.blank} />;
  }

  return (
    <View style={styles.container}>
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
          {...(Platform.OS === "android"
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

        <Pressable
          accessibilityRole="button"
          onPress={() => closePlayer()}
          style={({ pressed }) => [
            styles.closeButton,
            {
              top: Math.max(12, insets.top + 8),
            },
            pressed ? styles.closeButtonPressed : undefined,
          ]}
        >
          <Text selectable style={styles.closeButtonLabel}>
            X
          </Text>
        </Pressable>
      </View>

      <View
        style={[
          styles.controls,
          {
            paddingBottom: controlsPaddingBottom,
          },
        ]}
      >
        <Pressable
          disabled={isPrimaryDisabled}
          style={({ pressed }) => [
            styles.primaryButton,
            {
              width: controlButtonWidth,
            },
            isPrimaryDisabled && styles.disabledButton,
            pressed && !isPrimaryDisabled && styles.pressedButton,
          ]}
          onPress={() => {
            if (playerUiState === "paused" || playerUiState === "blocked") {
              sendPlayerCommand("__YT_PLAY__");
              return;
            }

            sendPlayerCommand("__YT_PAUSE__");
          }}
        >
          <Text style={styles.buttonText}>{primaryButtonLabel}</Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [
            styles.secondaryButton,
            {
              width: controlButtonWidth,
            },
            pressed && styles.pressedButton,
          ]}
          onPress={() => closePlayer()}
        >
          <Text style={styles.buttonText}>종료</Text>
        </Pressable>
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
    backgroundColor: "#000000",
  },
  blank: {
    flex: 1,
    backgroundColor: "#000000",
  },
  playerArea: {
    position: "relative",
    alignSelf: "center",
    backgroundColor: "#000000",
  },
  closeButton: {
    position: "absolute",
    right: 16,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(17, 24, 39, 0.78)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 25,
    elevation: 25,
  },
  closeButtonPressed: {
    backgroundColor: "rgba(31, 41, 55, 0.92)",
  },
  closeButtonLabel: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
  },
  controls: {
    flexDirection: "row",
    justifyContent: "center",
    paddingHorizontal: PLAYER_HORIZONTAL_PADDING,
    paddingTop: CONTROL_TOP_PADDING,
    gap: CONTROL_BUTTON_GAP,
  },
  primaryButton: {
    height: CONTROL_BUTTON_HEIGHT,
    borderRadius: 10,
    backgroundColor: "#2563EB",
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryButton: {
    height: CONTROL_BUTTON_HEIGHT,
    borderRadius: 10,
    backgroundColor: "#4B5563",
    alignItems: "center",
    justifyContent: "center",
  },
  pressedButton: {
    opacity: 0.85,
  },
  disabledButton: {
    backgroundColor: "#1D4ED8",
    opacity: 0.65,
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
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
