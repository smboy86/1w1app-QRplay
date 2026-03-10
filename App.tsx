import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Button,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  type GestureResponderEvent,
  type LayoutChangeEvent,
  type NativeSyntheticEvent,
  useWindowDimensions,
  View,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import {
  CameraView,
  type BarcodeScanningResult,
  useCameraPermissions,
} from "expo-camera";
import * as SplashScreen from "expo-splash-screen";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";

import { useFloatingTabBarMetrics } from "./src/features/floating-tab-bar/floating-tab-bar-context";
import { ANDROID_FLOATING_TAB_BAR_COMPACT_HEIGHT_THRESHOLD } from "./src/features/floating-tab-bar/floating-tab-bar-constants";
import { usePlaybackHistory } from "./src/features/playback-history/playback-history-context";
import { AndroidQrScannerView } from "./src/features/scanner/android-qr-scanner-view";
import {
  FRONT_CAMERA_ZOOM_LEVELS,
  createHighlightFrame,
  getAbsoluteBounds,
  getPrimaryBarcodeCandidate,
  getScanAssistCopy,
  getScanAssistState,
  getScannerFrameLayout,
  type HighlightFrame,
  type ScanAssistState,
  type ScannerBarcodeCandidate,
  type ScannerFocusState,
  type ScannerFocusStateEvent,
  type ScannerPotentialBarcodesEvent,
  type ScannerZoomSuggestionEvent,
} from "./src/features/scanner/scanner-assist";
import type { ScannerFacing } from "./src/features/scanner/scanner-types";
import {
  DEFAULT_SCANNER_FACING,
  getDefaultScannerFacing,
} from "./src/features/settings/default-camera-storage";
import {
  extractYouTubeId,
  mapExtractReasonToMessage,
} from "./src/lib/extractYouTubeId";
import { NETWORK_ERROR_MESSAGE } from "./src/lib/mapYouTubeError";
import {
  isSupportedLandingPageHost,
  mapLandingPageResolveReasonToMessage,
  resolveLandingPageYouTube,
} from "./src/lib/resolveLandingPageYouTube";
import { resolveFinalUrl } from "./src/lib/resolveRedirectUrl";

const INITIAL_SPLASH_DELAY_MS = 3000;
const REDIRECT_WEBVIEW_TIMEOUT_MS = 9000;
const FRONT_CAMERA_IDLE_SUGGESTION_DELAY_MS = 2500;
const SCAN_HIGHLIGHT_VISIBLE_MS = 750;
const IS_ANDROID_NATIVE_SCANNER =
  process.env.EXPO_OS === "android" &&
  process.env.EXPO_PUBLIC_ENABLE_ANDROID_NATIVE_SCANNER === "1";

type ResolvedPlaybackInputResult =
  | { ok: true; sourceUrl: string; finalUrl: string; videoId: string }
  | {
      ok: false;
      sourceUrl: string;
      finalUrl: string | null;
      title: string;
      message: string;
    };

void SplashScreen.preventAutoHideAsync().catch(() => {
  // Ignore duplicate prevention requests during fast refresh.
});

function normalizeScannedInput(input: string) {
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

function normalizeHost(hostname: string) {
  return hostname.toLowerCase().replace(/^www\./, "").replace(/^m\./, "");
}

function getHostFromUrl(raw: string) {
  try {
    return normalizeHost(new URL(raw).hostname);
  } catch {
    return null;
  }
}

function isHttpSchemeUrl(raw: string) {
  return /^https?:\/\//i.test(raw);
}

function getIntentFallbackUrl(raw: string) {
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

// Approximates the expo-camera zoom scale for non-Android fallback previews.
function getExpoFallbackZoom(zoomLevel: number) {
  return Math.min(0.3, Math.max(0, (zoomLevel - 1) * 0.38));
}

// Returns the next camera facing while preserving the front-camera default.
function getNextFacing(facing: ScannerFacing): ScannerFacing {
  return facing === "back" ? "front" : "back";
}

// Compares floating zoom levels with a tolerance suitable for chip selection.
function isZoomLevelSelected(currentZoomLevel: number, targetZoomLevel: number) {
  return Math.abs(currentZoomLevel - targetZoomLevel) < 0.06;
}

// Hosts the QR scanner flow used by the first tab.
function ScannerScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [scannerFacing, setScannerFacing] =
    useState<ScannerFacing>(DEFAULT_SCANNER_FACING);
  const [isDefaultCameraFacingReady, setIsDefaultCameraFacingReady] =
    useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [scanAssistState, setScanAssistState] =
    useState<ScanAssistState>("searching");
  const [scannerFocusState, setScannerFocusState] =
    useState<ScannerFocusState>("idle");
  const [isFrontFixedFocus, setIsFrontFixedFocus] = useState(false);
  const [autoCorrectionFailures, setAutoCorrectionFailures] = useState(0);
  const [highlightFrame, setHighlightFrame] = useState<HighlightFrame | null>(
    null,
  );
  const [tapFocusRequest, setTapFocusRequest] = useState<{
    requestId: number;
    x: number;
    y: number;
  } | null>(null);
  const [previewLayout, setPreviewLayout] = useState({ width: 0, height: 0 });
  const [isLoadingOverlayVisible, setIsLoadingOverlayVisible] = useState(false);
  const [isRearCameraSuggestionVisible, setIsRearCameraSuggestionVisible] =
    useState(false);
  const [isScannerHintCollapsed, setIsScannerHintCollapsed] = useState(false);
  const [redirectProbe, setRedirectProbe] = useState<{
    key: number;
    sourceUrl: string;
    sourceHost: string | null;
  } | null>(null);
  const router = useRouter();
  const { reservedBottomSpace } = useFloatingTabBarMetrics();
  const { height, width } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const {
    consumeReplayRequest,
    isHistoryReady,
    pendingReplayRequest,
    recordHistoryResult,
  } = usePlaybackHistory();

  const highlightOpacity = useRef(new Animated.Value(0)).current;
  const highlightScale = useRef(new Animated.Value(0.92)).current;
  const scanLockedRef = useRef(false);
  const alertVisibleRef = useRef(false);
  const lastPrimaryCandidateRef = useRef<ScannerBarcodeCandidate | null>(null);
  const redirectProbeCounterRef = useRef(0);
  const redirectProbeResolverRef = useRef<((url: string | null) => void) | null>(
    null,
  );
  const redirectProbeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const redirectProbeLatestUrlRef = useRef<string | null>(null);
  const tapFocusRequestCounterRef = useRef(0);
  const isCompactHeight =
    height < ANDROID_FLOATING_TAB_BAR_COMPACT_HEIGHT_THRESHOLD;
  const cameraFacingButtonTop = Math.max(
    isCompactHeight ? 12 : 16,
    insets.top + 8,
  );
  const scannerHintBottom = Math.max(24, reservedBottomSpace);
  const isFrontCamera = scannerFacing === "front";
  const effectivePreviewLayout = {
    width: previewLayout.width || width,
    height: previewLayout.height || height,
  };
  const scanFrameLayout = getScannerFrameLayout(
    effectivePreviewLayout.width,
    effectivePreviewLayout.height,
  );
  const shouldShowRearCameraCta =
    isFrontCamera &&
    (isRearCameraSuggestionVisible || scanAssistState === "suggest-rear-camera");
  const scanAssistCopy = getScanAssistCopy(
    scanAssistState,
    scannerFacing,
    scannerFocusState,
    isFrontFixedFocus,
  );
  const highlightBounds = highlightFrame
    ? getAbsoluteBounds(
        highlightFrame.bounds,
        effectivePreviewLayout.width,
        effectivePreviewLayout.height,
      )
    : null;

  // Resets transient guidance state whenever the scan session changes.
  const resetScannerAssist = useCallback(() => {
    lastPrimaryCandidateRef.current = null;
    setAutoCorrectionFailures(0);
    setHighlightFrame(null);
    setIsFrontFixedFocus(false);
    setIsRearCameraSuggestionVisible(false);
    setScanAssistState("searching");
    setScannerFocusState("idle");
    setTapFocusRequest(null);
  }, []);

  useFocusEffect(
    useCallback(() => {
      setIsLoadingOverlayVisible(false);
      scanLockedRef.current = false;
      alertVisibleRef.current = false;
      resetScannerAssist();
    }, [resetScannerAssist]),
  );

  // Loads the persisted default camera facing before the scanner preview is shown.
  useEffect(() => {
    let isActive = true;

    void (async () => {
      const savedFacing = await getDefaultScannerFacing();

      if (!isActive) {
        return;
      }

      setScannerFacing(savedFacing);
      setIsDefaultCameraFacingReady(true);
    })();

    return () => {
      isActive = false;
    };
  }, []);

  // Refreshes the default camera facing whenever the scanner tab regains focus.
  useFocusEffect(
    useCallback(() => {
      if (!isDefaultCameraFacingReady) {
        return undefined;
      }

      let isActive = true;

      void (async () => {
        const savedFacing = await getDefaultScannerFacing();

        if (!isActive) {
          return;
        }

        setScannerFacing(savedFacing);
      })();

      return () => {
        isActive = false;
      };
    }, [isDefaultCameraFacingReady]),
  );

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

  useEffect(() => {
    if (!permission?.granted || !isFrontCamera || isLoadingOverlayVisible) {
      setIsRearCameraSuggestionVisible(false);
      return;
    }

    setIsRearCameraSuggestionVisible(false);
    const timeout = setTimeout(() => {
      setIsRearCameraSuggestionVisible(true);
    }, FRONT_CAMERA_IDLE_SUGGESTION_DELAY_MS);

    return () => clearTimeout(timeout);
  }, [isFrontCamera, isLoadingOverlayVisible, permission?.granted]);

  useEffect(() => {
    if (!highlightFrame) {
      highlightOpacity.setValue(0);
      highlightScale.setValue(0.92);
      return;
    }

    highlightOpacity.setValue(0);
    highlightScale.setValue(0.92);

    Animated.parallel([
      Animated.timing(highlightOpacity, {
        duration: 220,
        toValue: 1,
        useNativeDriver: true,
      }),
      Animated.spring(highlightScale, {
        damping: 13,
        mass: 0.8,
        stiffness: 160,
        toValue: 1,
        useNativeDriver: true,
      }),
    ]).start();

    const timeout = setTimeout(() => {
      setHighlightFrame(null);
    }, SCAN_HIGHLIGHT_VISIBLE_MS);

    return () => clearTimeout(timeout);
  }, [highlightFrame, highlightOpacity, highlightScale]);

  // Processes scanned or replayed input into a player session and logs history.
  const handlePlaybackInput = useCallback(
    async (input: string, historyId?: string) => {
      if (scanLockedRef.current || alertVisibleRef.current) return;

      scanLockedRef.current = true;
      setIsLoadingOverlayVisible(true);

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

      setIsLoadingOverlayVisible(false);
      router.push({
        pathname: "/player",
        params: {
          historyId: nextHistoryId,
          resolvedUrl: result.finalUrl,
          sourceUrl: result.sourceUrl,
          videoId: result.videoId,
        },
      });
    },
    [recordHistoryResult, router, showBlockingAlert, startRedirectProbe],
  );

  useEffect(() => {
    if (!pendingReplayRequest) return;
    if (scanLockedRef.current || alertVisibleRef.current) return;

    consumeReplayRequest(pendingReplayRequest.requestId);
    void handlePlaybackInput(
      pendingReplayRequest.sourceUrl,
      pendingReplayRequest.historyId,
    );
  }, [consumeReplayRequest, handlePlaybackInput, pendingReplayRequest]);

  // Handles a successful scan payload and starts the playback resolution flow.
  const handleSuccessfulScan = useCallback(
    (data: string, nextHighlightFrame: HighlightFrame | null) => {
      setIsRearCameraSuggestionVisible(false);
      if (nextHighlightFrame) {
        setHighlightFrame(nextHighlightFrame);
      }
      void handlePlaybackInput(data);
    },
    [handlePlaybackInput],
  );

  // Updates the guide overlay from ML Kit potential barcode telemetry.
  const handlePotentialBarcodes = useCallback(
    (
      event: NativeSyntheticEvent<ScannerPotentialBarcodesEvent>,
    ) => {
      const {
        autoCorrectionFailures: nextAutoCorrectionFailures = 0,
        barcodes,
        isFrontFixedFocus: nextIsFrontFixedFocus = false,
      } = event.nativeEvent;
      const primaryCandidate = getPrimaryBarcodeCandidate(barcodes);
      lastPrimaryCandidateRef.current = primaryCandidate;
      setAutoCorrectionFailures(nextAutoCorrectionFailures);
      setIsFrontFixedFocus(nextIsFrontFixedFocus);
      setScanAssistState(
        getScanAssistState(
          primaryCandidate,
          nextIsFrontFixedFocus,
          nextAutoCorrectionFailures,
        ),
      );
    },
    [],
  );

  // Applies native zoom suggestions so the overlay stays in sync with CameraX.
  const handleZoomSuggestion = useCallback(
    (event: NativeSyntheticEvent<ScannerZoomSuggestionEvent>) => {
      const nextZoomLevel = Math.max(1, event.nativeEvent.zoomRatio);
      setZoomLevel(nextZoomLevel);
    },
    [],
  );

  // Updates focus guidance from native tap-to-focus and fixed-focus telemetry.
  const handleFocusStateChanged = useCallback(
    (
      event: NativeSyntheticEvent<ScannerFocusStateEvent>,
    ) => {
      const {
        autoCorrectionFailures: nextAutoCorrectionFailures = 0,
        isFrontFixedFocus: nextIsFrontFixedFocus = false,
        state,
      } = event.nativeEvent;

      setAutoCorrectionFailures(nextAutoCorrectionFailures);
      setIsFrontFixedFocus(nextIsFrontFixedFocus);
      setScannerFocusState(state);
      setScanAssistState(
        getScanAssistState(
          lastPrimaryCandidateRef.current,
          nextIsFrontFixedFocus,
          nextAutoCorrectionFailures,
        ),
      );
    },
    [],
  );

  // Handles decoded QR events emitted by the Android native scanner view.
  const handleNativeBarcodeScanned = useCallback(
    (
      event: NativeSyntheticEvent<{
        bounds?: HighlightFrame["bounds"] | null;
        cornerPoints?: HighlightFrame["cornerPoints"];
        data: string;
      }>,
    ) => {
      const { bounds, cornerPoints, data } = event.nativeEvent;
      handleSuccessfulScan(
        data,
        createHighlightFrame(bounds, cornerPoints ?? []),
      );
    },
    [handleSuccessfulScan],
  );

  // Handles decoded QR events from expo-camera on non-Android fallbacks.
  const handleExpoBarcodeScanned = useCallback(
    ({ data }: BarcodeScanningResult) => {
      handleSuccessfulScan(data, null);
    },
    [handleSuccessfulScan],
  );

  // Flips between front and rear cameras while resetting scanner guidance.
  const handleCameraFacingPress = useCallback(() => {
    const nextFacing = getNextFacing(scannerFacing);
    setScannerFacing(nextFacing);
    setZoomLevel(1);
    resetScannerAssist();
  }, [resetScannerAssist, scannerFacing]);

  // Toggles the scanner guide card between collapsed and expanded states.
  const handleScannerHintToggle = useCallback(() => {
    setIsScannerHintCollapsed((current) => !current);
  }, []);

  // Applies a front-camera zoom preset chosen from the overlay chips.
  const handleZoomLevelPress = useCallback((nextZoomLevel: number) => {
    setZoomLevel(nextZoomLevel);
  }, []);

  // Switches to the rear camera when the front camera needs help.
  const handleRearCameraSwitch = useCallback(() => {
    setScannerFacing("back");
    setZoomLevel(1);
    resetScannerAssist();
  }, [resetScannerAssist]);

  // Records preview dimensions so overlay math stays aligned to the camera.
  const handlePreviewLayout = useCallback((event: LayoutChangeEvent) => {
    const { height: nextHeight, width: nextWidth } = event.nativeEvent.layout;
    if (!nextWidth || !nextHeight) return;
    setPreviewLayout({
      height: nextHeight,
      width: nextWidth,
    });
  }, []);

  // Sends a programmatic tap-to-focus request for presses inside the scan frame.
  const handleFocusFramePress = useCallback(
    (event: GestureResponderEvent) => {
      if (!IS_ANDROID_NATIVE_SCANNER || !effectivePreviewLayout.width) return;

      tapFocusRequestCounterRef.current += 1;
      const normalizedX =
        (scanFrameLayout.left + event.nativeEvent.locationX) /
        effectivePreviewLayout.width;
      const normalizedY =
        (scanFrameLayout.top + event.nativeEvent.locationY) /
        effectivePreviewLayout.height;

      setScannerFocusState("focusing");
      setTapFocusRequest({
        requestId: tapFocusRequestCounterRef.current,
        x: normalizedX,
        y: normalizedY,
      });
    },
    [effectivePreviewLayout.height, effectivePreviewLayout.width, scanFrameLayout.left, scanFrameLayout.top],
  );

  const loadingOverlay = isLoadingOverlayVisible ? (
    <View style={styles.loadingOverlay}>
      <View style={styles.loadingCard}>
        <ActivityIndicator size="large" color="#60A5FA" />
        <Text style={styles.loadingTitle}>영상 준비 중</Text>
        <Text style={styles.loadingDescription}>QR 결과를 확인하고 있어요.</Text>
      </View>
    </View>
  ) : null;

  if (!isDefaultCameraFacingReady || !isHistoryReady) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.blank} />
        <View style={styles.loadingOverlay}>
          <View style={styles.loadingCard}>
            <ActivityIndicator size="large" color="#60A5FA" />
            <Text style={styles.loadingTitle}>앱 준비 중</Text>
            <Text style={styles.loadingDescription}>
              {!isDefaultCameraFacingReady
                ? "저장된 기본 카메라 설정을 불러오고 있어요."
                : "저장된 QR 히스토리를 불러오고 있어요."}
            </Text>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  if (!permission) {
    return <View style={styles.blank} />;
  }

  if (!permission.granted) {
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

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.previewArea} onLayout={handlePreviewLayout}>
        {IS_ANDROID_NATIVE_SCANNER ? (
          <AndroidQrScannerView
            active={!isLoadingOverlayVisible}
            facing={scannerFacing}
            onBarcodeScanned={handleNativeBarcodeScanned}
            onFocusStateChanged={handleFocusStateChanged}
            onPotentialBarcodes={handlePotentialBarcodes}
            onZoomSuggestion={handleZoomSuggestion}
            style={StyleSheet.absoluteFill}
            tapFocusRequest={tapFocusRequest}
            zoomLevel={zoomLevel}
          />
        ) : (
          <CameraView
            facing={scannerFacing}
            mirror={isFrontCamera}
            barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
            onBarcodeScanned={handleExpoBarcodeScanned}
            style={StyleSheet.absoluteFill}
            zoom={getExpoFallbackZoom(zoomLevel)}
          />
        )}

        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          <View
            style={[
              styles.scannerMask,
              {
                height: scanFrameLayout.top,
                left: 0,
                right: 0,
                top: 0,
              },
            ]}
          />
          <View
            style={[
              styles.scannerMask,
              {
                bottom: 0,
                left: 0,
                right: 0,
                top: scanFrameLayout.top + scanFrameLayout.size,
              },
            ]}
          />
          <View
            style={[
              styles.scannerMask,
              {
                height: scanFrameLayout.size,
                left: 0,
                top: scanFrameLayout.top,
                width: scanFrameLayout.left,
              },
            ]}
          />
          <View
            style={[
              styles.scannerMask,
              {
                height: scanFrameLayout.size,
                left: scanFrameLayout.left + scanFrameLayout.size,
                right: 0,
                top: scanFrameLayout.top,
              },
            ]}
          />

          {highlightBounds ? (
            <Animated.View
              style={[
                styles.scanHighlight,
                {
                  height: highlightBounds.height,
                  left: highlightBounds.x,
                  opacity: highlightOpacity,
                  top: highlightBounds.y,
                  transform: [{ scale: highlightScale }],
                  width: highlightBounds.width,
                },
              ]}
            />
          ) : null}
        </View>

        <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
          <Pressable
            onPress={handleFocusFramePress}
            style={[
              styles.scanFrameTouchable,
              {
                height: scanFrameLayout.size,
                left: scanFrameLayout.left,
                top: scanFrameLayout.top,
                width: scanFrameLayout.size,
              },
            ]}
          >
            <View style={styles.scanFrame}>
              <View style={[styles.scanFrameCorner, styles.scanFrameCornerTopLeft]} />
              <View style={[styles.scanFrameCorner, styles.scanFrameCornerTopRight]} />
              <View style={[styles.scanFrameCorner, styles.scanFrameCornerBottomLeft]} />
              <View style={[styles.scanFrameCorner, styles.scanFrameCornerBottomRight]} />
            </View>
          </Pressable>

          <View
            pointerEvents="box-none"
            style={[
              styles.topControls,
              {
                top: cameraFacingButtonTop,
              },
            ]}
          >
            <Pressable
              onPress={handleCameraFacingPress}
              style={({ pressed }) => [
                styles.cameraFacingButton,
                pressed && styles.pressedButton,
              ]}
            >
              <View style={styles.cameraFacingButtonInner}>
                <Text style={styles.cameraFacingButtonIcon}>⟳</Text>
                <Text style={styles.cameraFacingButtonText}>
                  {scannerFacing === "back" ? "전면 카메라" : "후면 카메라"}
                </Text>
              </View>
            </Pressable>

            <View style={styles.hardwareBadge}>
              <Text style={styles.hardwareBadgeLabel}>
                {scannerFocusState === "focusing"
                  ? "초점 조정 중"
                  : isFrontFixedFocus
                    ? "전면 고정 초점"
                    : "탭 초점 · 핀치 확대"}
              </Text>
            </View>
          </View>

          <View
            style={[
              styles.scannerHint,
              {
                bottom: scannerHintBottom,
              },
            ]}
          >
            <Pressable
              accessibilityLabel={
                isScannerHintCollapsed ? "스캔 안내 펼치기" : "스캔 안내 접기"
              }
              accessibilityRole="button"
              onPress={handleScannerHintToggle}
              style={({ pressed }) => [
                styles.scannerHintToggle,
                pressed && styles.pressedButton,
              ]}
            >
              <MaterialIcons
                color="#E2E8F0"
                name={isScannerHintCollapsed ? "expand-more" : "expand-less"}
                size={22}
              />
            </Pressable>
            <View style={styles.scannerHeadingRow}>
              <Text style={styles.scannerEyebrow}>
                {isFrontCamera ? "셀카 스캔 보조" : "후면 스캔"}
              </Text>
              <Text style={styles.scannerStatus}>
                {autoCorrectionFailures > 0
                  ? `자동 보정 ${autoCorrectionFailures}회`
                  : "QR 1개만 비춰 주세요"}
              </Text>
            </View>
            {isScannerHintCollapsed ? null : (
              <>
                <Text style={styles.scannerTitle}>{scanAssistCopy.title}</Text>
                <Text style={styles.scannerDescription}>
                  {scanAssistCopy.description}
                </Text>

                {isFrontCamera ? (
                  <View style={styles.zoomChipRow}>
                    {FRONT_CAMERA_ZOOM_LEVELS.map((level) => (
                      <Pressable
                        key={level}
                        onPress={() => handleZoomLevelPress(level)}
                        style={({ pressed }) => [
                          styles.zoomChip,
                          isZoomLevelSelected(zoomLevel, level) &&
                            styles.zoomChipActive,
                          pressed && styles.pressedButton,
                        ]}
                      >
                        <Text
                          style={[
                            styles.zoomChipLabel,
                            isZoomLevelSelected(zoomLevel, level) &&
                              styles.zoomChipLabelActive,
                          ]}
                        >
                          {level.toFixed(1)}x
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                ) : null}

                <Text style={styles.focusHint}>
                  {IS_ANDROID_NATIVE_SCANNER
                    ? "프레임을 눌러 초점을 다시 맞추고, 두 손가락으로 확대할 수 있어요."
                    : "QR이 잘 안 읽히면 프레임 안에서 가운데 정렬과 거리를 먼저 조정해 주세요."}
                </Text>

                {shouldShowRearCameraCta ? (
                  <Pressable
                    onPress={handleRearCameraSwitch}
                    style={({ pressed }) => [
                      styles.rearCameraButton,
                      pressed && styles.pressedButton,
                    ]}
                  >
                    <Text style={styles.rearCameraButtonText}>
                      후면 카메라로 전환
                    </Text>
                  </Pressable>
                ) : null}
              </>
            )}
          </View>
        </View>
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

// Exports the scanner feature for the first tab route.
export default function App() {
  return <ScannerScreen />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#020617",
  },
  previewArea: {
    flex: 1,
    backgroundColor: "#000000",
    overflow: "hidden",
  },
  blank: {
    flex: 1,
    backgroundColor: "#020617",
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#020617",
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
  scannerMask: {
    position: "absolute",
    backgroundColor: "rgba(2, 6, 23, 0.56)",
  },
  scanFrameTouchable: {
    position: "absolute",
  },
  scanFrame: {
    flex: 1,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.22)",
    backgroundColor: "rgba(255, 255, 255, 0.03)",
  },
  scanFrameCorner: {
    position: "absolute",
    width: 32,
    height: 32,
    borderColor: "#F8FAFC",
  },
  scanFrameCornerTopLeft: {
    top: -1,
    left: -1,
    borderTopWidth: 4,
    borderLeftWidth: 4,
    borderTopLeftRadius: 28,
  },
  scanFrameCornerTopRight: {
    top: -1,
    right: -1,
    borderTopWidth: 4,
    borderRightWidth: 4,
    borderTopRightRadius: 28,
  },
  scanFrameCornerBottomLeft: {
    bottom: -1,
    left: -1,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderBottomLeftRadius: 28,
  },
  scanFrameCornerBottomRight: {
    right: -1,
    bottom: -1,
    borderBottomWidth: 4,
    borderRightWidth: 4,
    borderBottomRightRadius: 28,
  },
  scanHighlight: {
    position: "absolute",
    borderRadius: 22,
    borderWidth: 3,
    borderColor: "#22D3EE",
    backgroundColor: "rgba(34, 211, 238, 0.12)",
  },
  topControls: {
    position: "absolute",
    left: 16,
    right: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  cameraFacingButton: {
    borderRadius: 999,
    backgroundColor: "rgba(2, 6, 23, 0.74)",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  cameraFacingButtonInner: {
    flexDirection: "row",
    alignItems: "center",
  },
  cameraFacingButtonIcon: {
    marginRight: 6,
    color: "#E0F2FE",
    fontSize: 24,
    fontWeight: "700",
  },
  cameraFacingButtonText: {
    color: "#F8FAFC",
    fontSize: 14,
    fontWeight: "700",
  },
  hardwareBadge: {
    borderRadius: 999,
    backgroundColor: "rgba(15, 23, 42, 0.74)",
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  hardwareBadgeLabel: {
    color: "#BAE6FD",
    fontSize: 13,
    fontWeight: "600",
  },
  scannerHint: {
    position: "absolute",
    left: 16,
    right: 16,
    borderRadius: 24,
    backgroundColor: "rgba(2, 6, 23, 0.78)",
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 16,
    gap: 12,
  },
  scannerHintToggle: {
    position: "absolute",
    top: 12,
    right: 12,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(15, 23, 42, 0.7)",
  },
  scannerHeadingRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    paddingRight: 40,
  },
  scannerEyebrow: {
    color: "#7DD3FC",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.7,
    textTransform: "uppercase",
  },
  scannerStatus: {
    color: "#CBD5E1",
    fontSize: 12,
    fontWeight: "600",
  },
  scannerTitle: {
    color: "#FFFFFF",
    fontSize: 22,
    fontWeight: "700",
  },
  scannerDescription: {
    color: "#E2E8F0",
    fontSize: 15,
    lineHeight: 22,
  },
  zoomChipRow: {
    flexDirection: "row",
    gap: 10,
  },
  zoomChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(148, 163, 184, 0.4)",
    backgroundColor: "rgba(15, 23, 42, 0.7)",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  zoomChipActive: {
    borderColor: "#7DD3FC",
    backgroundColor: "rgba(8, 47, 73, 0.92)",
  },
  zoomChipLabel: {
    color: "#F8FAFC",
    fontSize: 14,
    fontWeight: "700",
  },
  zoomChipLabelActive: {
    color: "#BAE6FD",
  },
  focusHint: {
    color: "#CBD5E1",
    fontSize: 13,
    lineHeight: 19,
  },
  rearCameraButton: {
    borderRadius: 18,
    backgroundColor: "#38BDF8",
    paddingHorizontal: 16,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  rearCameraButtonText: {
    color: "#082F49",
    fontSize: 15,
    fontWeight: "800",
  },
  pressedButton: {
    opacity: 0.86,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(2, 6, 23, 0.62)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 30,
    elevation: 30,
  },
  loadingCard: {
    minWidth: 240,
    paddingHorizontal: 22,
    paddingVertical: 20,
    borderRadius: 24,
    backgroundColor: "rgba(15, 23, 42, 0.94)",
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
  hiddenRedirectWebView: {
    position: "absolute",
    width: 1,
    height: 1,
    opacity: 0,
    top: -100,
    left: -100,
  },
});
