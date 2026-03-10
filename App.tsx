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
  Button,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import {
  CameraView,
  type BarcodeScanningResult,
  useCameraPermissions,
} from "expo-camera";
import * as SplashScreen from "expo-splash-screen";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { WebView, type WebViewMessageEvent } from "react-native-webview";

import {
  useFloatingTabBarMetrics,
  useFloatingTabBarVisibility,
} from "./src/features/floating-tab-bar/floating-tab-bar-context";
import { ANDROID_FLOATING_TAB_BAR_COMPACT_HEIGHT_THRESHOLD } from "./src/features/floating-tab-bar/floating-tab-bar-constants";
import { usePlaybackHistory } from "./src/features/playback-history/playback-history-context";
import { buildYoutubeHtml } from "./src/lib/buildYoutubeHtml";
import {
  extractYouTubeId,
  mapExtractReasonToMessage,
} from "./src/lib/extractYouTubeId";
import {
  mapYouTubeError,
  NETWORK_ERROR_MESSAGE,
} from "./src/lib/mapYouTubeError";
import {
  isSupportedLandingPageHost,
  mapLandingPageResolveReasonToMessage,
  resolveLandingPageYouTube,
} from "./src/lib/resolveLandingPageYouTube";
import { resolveFinalUrl } from "./src/lib/resolveRedirectUrl";
import type { BridgeMessage, Mode, PlayerUiState } from "./src/lib/types";

const APP_ORIGIN = "https://qrplay.app.local";
const INITIAL_SPLASH_DELAY_MS = 3000;
const PLAYER_READY_TIMEOUT_MS = 15000;
const REDIRECT_WEBVIEW_TIMEOUT_MS = 9000;
// "player": block only WebView area, "app": block entire app while video is playing.
const PLAYBACK_TOUCH_BLOCK_SCOPE: "player" | "app" = "player";

type ResolvedPlaybackInputResult =
  | { ok: true; sourceUrl: string; finalUrl: string; videoId: string }
  | {
      ok: false;
      sourceUrl: string;
      finalUrl: string | null;
      title: string;
      message: string;
    };

type ActivePlaybackHistory = {
  historyId: string;
  sourceUrl: string;
  resolvedUrl: string | null;
};

void SplashScreen.preventAutoHideAsync().catch(() => {
  // Ignore duplicate prevention requests during fast refresh.
});

function normalizeScannedInput(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return trimmed;

  if (/^[a-z][a-z\d+\-.]*:\/\//i.test(trimmed)) {
    return trimmed;
  }

  if (/^[\w.-]+\.[a-z]{2,}(?::\d+)?(?:[/?#].*)?$/i.test(trimmed)) {
    return `https://${trimmed}`;
  }

  return trimmed;
}

function normalizeHost(hostname: string): string {
  return hostname.toLowerCase().replace(/^www\./, "").replace(/^m\./, "");
}

function getHostFromUrl(raw: string): string | null {
  try {
    return normalizeHost(new URL(raw).hostname);
  } catch {
    return null;
  }
}

function isHttpSchemeUrl(raw: string): boolean {
  return /^https?:\/\//i.test(raw);
}

function getIntentFallbackUrl(raw: string): string | null {
  const match = raw.match(/S\.browser_fallback_url=([^;]+)/);
  if (!match?.[1]) return null;

  try {
    const decoded = decodeURIComponent(match[1]);
    return isHttpSchemeUrl(decoded) ? decoded : null;
  } catch {
    return null;
  }
}

// Builds a consistent failure payload for unsupported landing-page parsing results.
function createLandingPageFailureResult(
  sourceUrl: string,
  finalUrl: string,
  reason: "UNSUPPORTED_HOST" | "INVALID_HTML" | "NOT_FOUND" | "MULTIPLE",
): ResolvedPlaybackInputResult {
  return {
    ok: false,
    sourceUrl,
    finalUrl,
    title: "지원하지 않는 QR",
    message: mapLandingPageResolveReasonToMessage(reason),
  };
}

// Resolves scanned or replayed input into a playable YouTube video session.
async function resolvePlaybackInput(
  input: string,
  startRedirectProbe: (sourceUrl: string) => Promise<string | null>,
): Promise<ResolvedPlaybackInputResult> {
  const sourceUrl = normalizeScannedInput(input);
  let finalUrl: string | null = isHttpSchemeUrl(sourceUrl) ? sourceUrl : null;
  let result = extractYouTubeId(sourceUrl);

  console.log("[PLAYBACK] resolve input:", sourceUrl, result);

  if (!result.ok && result.reason === "NOT_YOUTUBE") {
    const sourceHost = getHostFromUrl(sourceUrl);
    finalUrl = await resolveFinalUrl(sourceUrl);
    console.log("[PLAYBACK] resolved final URL:", finalUrl);

    if (!finalUrl) {
      return {
        ok: false,
        sourceUrl,
        finalUrl: null,
        title: "네트워크 오류",
        message: NETWORK_ERROR_MESSAGE,
      };
    }

    result = extractYouTubeId(finalUrl);

    if (!result.ok && result.reason === "NOT_YOUTUBE") {
      const finalHost = getHostFromUrl(finalUrl);

      if (isSupportedLandingPageHost(finalHost)) {
        const landingPageResult = await resolveLandingPageYouTube(finalUrl);
        console.log("[PLAYBACK] resolved landing page:", landingPageResult);

        if (landingPageResult.ok) {
          return {
            ok: true,
            sourceUrl,
            finalUrl: landingPageResult.youtubeUrl,
            videoId: landingPageResult.videoId,
          };
        }

        if (landingPageResult.reason === "NETWORK") {
          return {
            ok: false,
            sourceUrl,
            finalUrl,
            title: "네트워크 오류",
            message: NETWORK_ERROR_MESSAGE,
          };
        }

        return createLandingPageFailureResult(
          sourceUrl,
          finalUrl,
          landingPageResult.reason,
        );
      }

      const shouldUseWebViewFallback =
        isHttpSchemeUrl(finalUrl) &&
        sourceHost !== null &&
        finalHost === sourceHost;

      if (shouldUseWebViewFallback) {
        const webViewResolvedUrl = await startRedirectProbe(finalUrl);
        console.log("[PLAYBACK] resolved final URL via WebView:", webViewResolvedUrl);
        if (webViewResolvedUrl) {
          finalUrl = webViewResolvedUrl;
          result = extractYouTubeId(finalUrl);
        }
      }
    }
  }

  if (!result.ok) {
    return {
      ok: false,
      sourceUrl,
      finalUrl,
      title: "지원하지 않는 QR",
      message: mapExtractReasonToMessage(result.reason),
    };
  }

  return {
    ok: true,
    sourceUrl,
    finalUrl: finalUrl ?? sourceUrl,
    videoId: result.videoId,
  };
}

// Hosts the scanner and player flow used by the first tab.
function ScannerPlayerScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [mode, setMode] = useState<Mode>("scanner");
  const [scannerFacing, setScannerFacing] = useState<"back" | "front">("front");
  const [videoId, setVideoId] = useState<string | null>(null);
  const [playerUiState, setPlayerUiState] = useState<PlayerUiState>("idle");
  const [isLoadingOverlayVisible, setIsLoadingOverlayVisible] = useState(false);
  const [sessionKey, setSessionKey] = useState(0);
  const [redirectProbe, setRedirectProbe] = useState<{
    key: number;
    sourceUrl: string;
    sourceHost: string | null;
  } | null>(null);
  const { reservedBottomSpace } = useFloatingTabBarMetrics();
  const { setVisible } = useFloatingTabBarVisibility();
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const {
    consumeReplayRequest,
    pendingReplayRequest,
    recordHistoryResult,
  } = usePlaybackHistory();

  const scanLockedRef = useRef(false);
  const alertVisibleRef = useRef(false);
  const webViewRef = useRef<WebView>(null);
  const redirectProbeCounterRef = useRef(0);
  const redirectProbeResolverRef = useRef<((url: string | null) => void) | null>(
    null,
  );
  const redirectProbeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const redirectProbeLatestUrlRef = useRef<string | null>(null);
  const activePlaybackHistoryRef = useRef<ActivePlaybackHistory | null>(null);

  const html = useMemo(() => {
    if (!videoId) return "";
    return buildYoutubeHtml(videoId, APP_ORIGIN, true);
  }, [videoId, sessionKey]);
  const isCompactHeight =
    height < ANDROID_FLOATING_TAB_BAR_COMPACT_HEIGHT_THRESHOLD;
  const cameraFacingButtonTop = Math.max(isCompactHeight ? 12 : 16, insets.top + 8);
  const scannerHintBottom = Math.max(24, reservedBottomSpace);

  useEffect(() => {
    if (process.env.EXPO_OS !== "android") {
      return;
    }

    setVisible(mode !== "player");

    return () => {
      setVisible(true);
    };
  }, [mode, setVisible]);

  const showBlockingAlert = useCallback(
    (title: string, message: string, onClose?: () => void) => {
      setIsLoadingOverlayVisible(false);
      if (alertVisibleRef.current) return;

      alertVisibleRef.current = true;
      let closed = false;

      const close = () => {
        if (closed) return;
        closed = true;
        alertVisibleRef.current = false;
        onClose?.();
      };

      Alert.alert(title, message, [{ text: "확인", onPress: close }], {
        cancelable: false,
        onDismiss: close,
      });
    },
    [],
  );

  const resetToScanner = useCallback((keepScanLocked = false) => {
    activePlaybackHistoryRef.current = null;
    setMode("scanner");
    setVideoId(null);
    setPlayerUiState("idle");
    setIsLoadingOverlayVisible(false);
    setSessionKey((value) => value + 1);
    scanLockedRef.current = keepScanLocked;
  }, []);

  const settleRedirectProbe = useCallback((url: string | null) => {
    if (redirectProbeTimeoutRef.current) {
      clearTimeout(redirectProbeTimeoutRef.current);
      redirectProbeTimeoutRef.current = null;
    }

    setRedirectProbe(null);

    const resolver = redirectProbeResolverRef.current;
    redirectProbeResolverRef.current = null;
    redirectProbeLatestUrlRef.current = null;
    resolver?.(url);
  }, []);

  const startRedirectProbe = useCallback(
    (sourceUrl: string): Promise<string | null> => {
      if (redirectProbeResolverRef.current) {
        settleRedirectProbe(null);
      }

      return new Promise<string | null>((resolve) => {
        redirectProbeResolverRef.current = resolve;
        redirectProbeLatestUrlRef.current = sourceUrl;

        const nextKey = redirectProbeCounterRef.current + 1;
        redirectProbeCounterRef.current = nextKey;
        setRedirectProbe({
          key: nextKey,
          sourceUrl,
          sourceHost: getHostFromUrl(sourceUrl),
        });

        redirectProbeTimeoutRef.current = setTimeout(() => {
          settleRedirectProbe(null);
        }, REDIRECT_WEBVIEW_TIMEOUT_MS);
      });
    },
    [settleRedirectProbe],
  );

  const handleRedirectProbeObservedUrl = useCallback(
    (observedUrl?: string) => {
      if (!redirectProbe || !observedUrl) return;

      const trimmed = observedUrl.trim();
      if (!trimmed) return;

      redirectProbeLatestUrlRef.current = trimmed;
      const observedHost = getHostFromUrl(trimmed);

      if (!observedHost || !redirectProbe.sourceHost) return;
      if (observedHost === redirectProbe.sourceHost) return;

      settleRedirectProbe(trimmed);
    },
    [redirectProbe, settleRedirectProbe],
  );

  useEffect(() => {
    const timeout = setTimeout(() => {
      void SplashScreen.hideAsync().catch(() => {
        // Ignore hide errors when the splash screen is already dismissed.
      });
    }, INITIAL_SPLASH_DELAY_MS);

    return () => clearTimeout(timeout);
  }, []);

  useEffect(() => {
    return () => {
      if (redirectProbeTimeoutRef.current) {
        clearTimeout(redirectProbeTimeoutRef.current);
      }
      if (redirectProbeResolverRef.current) {
        redirectProbeResolverRef.current(null);
      }
    };
  }, []);

  const handlePlaybackFailure = useCallback(
    (message: string) => {
      if (activePlaybackHistoryRef.current) {
        recordHistoryResult({
          historyId: activePlaybackHistoryRef.current.historyId,
          sourceUrl: activePlaybackHistoryRef.current.sourceUrl,
          resolvedUrl: activePlaybackHistoryRef.current.resolvedUrl,
          status: "failure",
          incrementPlayCount: false,
        });
        activePlaybackHistoryRef.current = null;
      }

      if (mode !== "player") return;
      console.log("[PLAYER] playback failure:", message);
      setPlayerUiState("error");
      resetToScanner(true);
      showBlockingAlert("재생 오류", message, () => {
        scanLockedRef.current = false;
      });
    },
    [mode, recordHistoryResult, resetToScanner, showBlockingAlert],
  );

  useEffect(() => {
    if (mode !== "player" || playerUiState !== "loading") return;

    const timeout = setTimeout(() => {
      handlePlaybackFailure(NETWORK_ERROR_MESSAGE);
    }, PLAYER_READY_TIMEOUT_MS);

    return () => clearTimeout(timeout);
  }, [handlePlaybackFailure, mode, playerUiState]);

  useEffect(() => {
    if (mode === "player" && playerUiState !== "loading") {
      setIsLoadingOverlayVisible(false);
    }
  }, [mode, playerUiState]);

  // Processes scanned or replayed input into a player session and logs history.
  const handlePlaybackInput = useCallback(
    async (input: string, historyId?: string) => {
      if (scanLockedRef.current || alertVisibleRef.current) return;

      scanLockedRef.current = true;
      setIsLoadingOverlayVisible(true);
      activePlaybackHistoryRef.current = null;

      const result = await resolvePlaybackInput(input, startRedirectProbe);

      if (!result.ok) {
        recordHistoryResult({
          historyId,
          sourceUrl: result.sourceUrl,
          resolvedUrl: result.finalUrl,
          status: "failure",
          incrementPlayCount: false,
        });
        showBlockingAlert(result.title, result.message, () => {
          scanLockedRef.current = false;
        });
        return;
      }

      const nextHistoryId = recordHistoryResult({
        historyId,
        sourceUrl: result.sourceUrl,
        resolvedUrl: result.finalUrl,
        status: "success",
        incrementPlayCount: true,
      });

      activePlaybackHistoryRef.current = {
        historyId: nextHistoryId,
        sourceUrl: result.sourceUrl,
        resolvedUrl: result.finalUrl,
      };
      setVideoId(result.videoId);
      setPlayerUiState("loading");
      setMode("player");
    },
    [recordHistoryResult, showBlockingAlert, startRedirectProbe],
  );

  useEffect(() => {
    if (!pendingReplayRequest) return;
    if (mode !== "scanner") return;
    if (scanLockedRef.current || alertVisibleRef.current) return;

    consumeReplayRequest(pendingReplayRequest.requestId);
    void handlePlaybackInput(
      pendingReplayRequest.sourceUrl,
      pendingReplayRequest.historyId,
    );
  }, [consumeReplayRequest, handlePlaybackInput, mode, pendingReplayRequest]);

  const handleBarcodeScanned = ({ data }: BarcodeScanningResult) => {
    void handlePlaybackInput(data);
  };

  const handlePlayerMessage = (event: WebViewMessageEvent) => {
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
        resetToScanner();
        return;
      case "error":
        handlePlaybackFailure(mapYouTubeError(message.payload?.code));
        return;
      case "state":
      default:
        return;
    }
  };

  const sendPlayerCommand = (
    fnName: "__YT_PLAY__" | "__YT_PAUSE__" | "__YT_STOP__",
  ) => {
    webViewRef.current?.injectJavaScript(`
      if (window.${fnName}) {
        window.${fnName}();
      }
      true;
    `);
  };

  const loadingOverlay = isLoadingOverlayVisible ? (
    <View style={styles.loadingOverlay}>
      <View style={styles.loadingCard}>
        <ActivityIndicator size="large" color="#2563EB" />
        <Text style={styles.loadingTitle}>영상 준비 중</Text>
        <Text style={styles.loadingDescription}>잠시만 기다려 주세요.</Text>
      </View>
    </View>
  ) : null;

  if (!permission && mode === "scanner") {
    return <View style={styles.blank} />;
  }

  if (mode === "scanner" && !permission?.granted) {
    if (isLoadingOverlayVisible) {
      return (
        <SafeAreaView style={styles.container}>
          <View style={styles.blank} />
          {loadingOverlay}
        </SafeAreaView>
      );
    }

    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.permissionTitle}>카메라 권한이 필요해요</Text>
        <Text style={styles.permissionDescription}>
          QR 코드를 인식해 영상을 재생하려면 카메라 접근을 허용해 주세요.
        </Text>
        <Button title="권한 허용" onPress={requestPermission} />
      </SafeAreaView>
    );
  }

  if (mode === "scanner") {
    return (
      <SafeAreaView style={styles.container}>
        <CameraView
          style={StyleSheet.absoluteFill}
          facing={scannerFacing}
          barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
          onBarcodeScanned={handleBarcodeScanned}
        />

        <Pressable
          style={({ pressed }) => [
            styles.cameraFacingButton,
            {
              top: cameraFacingButtonTop,
            },
            pressed && styles.pressedButton,
          ]}
          onPress={() =>
            setScannerFacing((value) => (value === "back" ? "front" : "back"))
          }
        >
          <View style={styles.cameraFacingButtonInner}>
            <Text style={styles.cameraFacingButtonIcon}>⟳</Text>
            <Text style={styles.cameraFacingButtonText}>
              {scannerFacing === "back" ? "전면 카메라" : "후면 카메라"}
            </Text>
          </View>
        </Pressable>

        <View
          style={[
            styles.scannerHint,
            {
              bottom: scannerHintBottom,
            },
          ]}
        >
          <Text style={styles.scannerTitle}>QR을 비춰 주세요</Text>
          <Text style={styles.scannerDescription}>
            한 번에 하나의 영상만 재생하며, 종료되면 자동으로 스캔 화면으로
            돌아옵니다.
          </Text>
        </View>

        {redirectProbe ? (
          <WebView
            key={`redirect-probe-${redirectProbe.key}`}
            source={{ uri: redirectProbe.sourceUrl }}
            originWhitelist={["*"]}
            style={styles.hiddenRedirectWebView}
            onShouldStartLoadWithRequest={(request) => {
              const nextUrl = request.url ?? "";
              if (isHttpSchemeUrl(nextUrl)) {
                handleRedirectProbeObservedUrl(nextUrl);
                return true;
              }

              const fallbackUrl = getIntentFallbackUrl(nextUrl);
              if (fallbackUrl) {
                handleRedirectProbeObservedUrl(fallbackUrl);
              }

              return false;
            }}
            onNavigationStateChange={(state) => {
              handleRedirectProbeObservedUrl(state.url);
            }}
            onLoadEnd={() => {
              handleRedirectProbeObservedUrl(
                redirectProbeLatestUrlRef.current ?? undefined,
              );
            }}
            onError={() => settleRedirectProbe(null)}
            onHttpError={() => settleRedirectProbe(null)}
            javaScriptEnabled
            domStorageEnabled
            javaScriptCanOpenWindowsAutomatically={false}
            setSupportMultipleWindows={false}
          />
        ) : null}

        {loadingOverlay}
      </SafeAreaView>
    );
  }

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

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.playerArea}>
        <WebView
          key={sessionKey}
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
      </View>

      <View style={styles.controls}>
        <Pressable
          disabled={isPrimaryDisabled}
          style={({ pressed }) => [
            styles.primaryButton,
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
            pressed && styles.pressedButton,
          ]}
          onPress={() => {
            sendPlayerCommand("__YT_STOP__");
            resetToScanner();
          }}
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
    </SafeAreaView>
  );
}

// Exports the scanner-player feature for the first tab route.
export default function App() {
  return <ScannerPlayerScreen />;
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
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#000000",
    paddingHorizontal: 24,
  },
  permissionTitle: {
    color: "#FFFFFF",
    fontSize: 22,
    fontWeight: "700",
    marginBottom: 10,
    textAlign: "center",
  },
  permissionDescription: {
    color: "#D1D5DB",
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
    marginBottom: 16,
  },
  scannerHint: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 24,
    borderRadius: 14,
    backgroundColor: "rgba(0, 0, 0, 0.62)",
    padding: 16,
  },
  cameraFacingButton: {
    position: "absolute",
    top: 16,
    left: 16,
    borderRadius: 10,
    backgroundColor: "rgba(0, 0, 0, 0.62)",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  cameraFacingButtonInner: {
    flexDirection: "row",
    alignItems: "center",
  },
  cameraFacingButtonIcon: {
    marginRight: 6,
    color: "#FFFFFF",
    fontSize: 30,
    fontWeight: "700",
  },
  cameraFacingButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },
  scannerTitle: {
    color: "#FFFFFF",
    fontSize: 22,
    fontWeight: "700",
  },
  scannerDescription: {
    color: "#F3F4F6",
    marginTop: 8,
    fontSize: 15,
    lineHeight: 22,
  },
  playerArea: {
    position: "relative",
    width: "100%",
    aspectRatio: 16 / 9,
    backgroundColor: "#000000",
  },
  controls: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 18,
    gap: 12,
  },
  primaryButton: {
    flex: 1,
    borderRadius: 14,
    backgroundColor: "#2563EB",
    paddingVertical: 16,
    alignItems: "center",
  },
  secondaryButton: {
    flex: 1,
    borderRadius: 14,
    backgroundColor: "#4B5563",
    paddingVertical: 16,
    alignItems: "center",
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
    fontSize: 17,
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
  hiddenRedirectWebView: {
    position: "absolute",
    width: 1,
    height: 1,
    opacity: 0,
    top: -100,
    left: -100,
  },
});
