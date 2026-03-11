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
import { useIsFocused } from "@react-navigation/native";
import {
  CameraView,
  type BarcodeScanningResult,
  useCameraPermissions,
} from "expo-camera";
import * as SplashScreen from "expo-splash-screen";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useFloatingTabBarMetrics } from "./src/features/floating-tab-bar/floating-tab-bar-context";
import { ANDROID_FLOATING_TAB_BAR_COMPACT_HEIGHT_THRESHOLD } from "./src/features/floating-tab-bar/floating-tab-bar-constants";
import { usePlaybackHistory } from "./src/features/playback-history/playback-history-context";
import { usePlaybackInputResolver } from "./src/features/player/use-playback-input-resolver";
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

const INITIAL_SPLASH_DELAY_MS = 3000;
const FRONT_CAMERA_IDLE_SUGGESTION_DELAY_MS = 2500;
const SCAN_HIGHLIGHT_VISIBLE_MS = 750;
const IS_ANDROID_NATIVE_SCANNER =
  process.env.EXPO_OS === "android" &&
  process.env.EXPO_PUBLIC_ENABLE_ANDROID_NATIVE_SCANNER === "1";

void SplashScreen.preventAutoHideAsync().catch(() => {
  // 빠른 새로고침 중 중복 방지 요청은 무시한다.
});

// 안드로이드가 아닐 때 대체 미리보기에 사용할 expo-camera 확대 비율을 근사 계산한다.
function getExpoFallbackZoom(zoomLevel: number) {
  return Math.min(0.3, Math.max(0, (zoomLevel - 1) * 0.38));
}

// 스캐너 전환 동작에 맞는 반대 카메라 방향을 반환한다.
function getNextFacing(facing: ScannerFacing): ScannerFacing {
  return facing === "back" ? "front" : "back";
}

// 칩 선택에 맞는 허용 오차로 확대 수치를 비교한다.
function isZoomLevelSelected(currentZoomLevel: number, targetZoomLevel: number) {
  return Math.abs(currentZoomLevel - targetZoomLevel) < 0.06;
}

// 첫 번째 탭에서 사용하는 QR 스캐너 흐름을 담당한다.
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
  const router = useRouter();
  const isScreenFocused = useIsFocused();
  const { reservedBottomSpace } = useFloatingTabBarMetrics();
  const { height, width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { redirectProbeElement, resolvePlaybackInput } =
    usePlaybackInputResolver();

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

  // 스캔 세션이 바뀔 때마다 임시 안내 상태를 초기화한다.
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

  // 스캐너 미리보기를 보여주기 전에 저장된 기본 카메라 방향을 불러온다.
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

  // 스캐너 탭이 다시 활성화될 때마다 기본 카메라 방향을 새로 불러온다.
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

  useEffect(() => {
    const timeout = setTimeout(() => {
      void SplashScreen.hideAsync().catch(() => {
        // 스플래시 화면이 이미 내려간 경우 숨김 오류는 무시한다.
      });
    }, INITIAL_SPLASH_DELAY_MS);

    return () => clearTimeout(timeout);
  }, []);

  useEffect(() => {
    if (
      !isScreenFocused ||
      !permission?.granted ||
      !isFrontCamera ||
      isLoadingOverlayVisible
    ) {
      setIsRearCameraSuggestionVisible(false);
      return;
    }

    setIsRearCameraSuggestionVisible(false);
    const timeout = setTimeout(() => {
      setIsRearCameraSuggestionVisible(true);
    }, FRONT_CAMERA_IDLE_SUGGESTION_DELAY_MS);

    return () => clearTimeout(timeout);
  }, [isFrontCamera, isLoadingOverlayVisible, isScreenFocused, permission?.granted]);

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

  // 스캔하거나 다시 재생한 입력을 플레이어 세션으로 처리하고 히스토리를 기록한다.
  const handlePlaybackInput = useCallback(
    async (input: string, historyId?: string) => {
      if (scanLockedRef.current || alertVisibleRef.current) return;

      scanLockedRef.current = true;
      setIsLoadingOverlayVisible(true);

      const result = await resolvePlaybackInput(input);

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
    [recordHistoryResult, resolvePlaybackInput, router, showBlockingAlert],
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

  // 스캔 성공 결과를 처리하고 재생 해석 흐름을 시작한다.
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

  // ML Kit 잠재 바코드 정보로 안내 오버레이를 갱신한다.
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

  // 오버레이가 CameraX와 동기화되도록 네이티브 확대 제안을 반영한다.
  const handleZoomSuggestion = useCallback(
    (event: NativeSyntheticEvent<ScannerZoomSuggestionEvent>) => {
      const nextZoomLevel = Math.max(1, event.nativeEvent.zoomRatio);
      setZoomLevel(nextZoomLevel);
    },
    [],
  );

  // 네이티브 탭 초점 및 고정 초점 정보로 초점 안내를 갱신한다.
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

  // 안드로이드 네이티브 스캐너 뷰에서 발생한 QR 디코드 이벤트를 처리한다.
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

  // 안드로이드가 아닐 때 expo-camera의 QR 디코드 이벤트를 처리한다.
  const handleExpoBarcodeScanned = useCallback(
    ({ data }: BarcodeScanningResult) => {
      handleSuccessfulScan(data, null);
    },
    [handleSuccessfulScan],
  );

  // 스캐너 안내를 초기화하면서 전후면 카메라를 전환한다.
  const handleCameraFacingPress = useCallback(() => {
    const nextFacing = getNextFacing(scannerFacing);
    setScannerFacing(nextFacing);
    setZoomLevel(1);
    resetScannerAssist();
  }, [resetScannerAssist, scannerFacing]);

  // 스캐너 안내 카드를 접힘/펼침 상태로 전환한다.
  const handleScannerHintToggle = useCallback(() => {
    setIsScannerHintCollapsed((current) => !current);
  }, []);

  // 오버레이 칩에서 선택한 전면 카메라 확대 프리셋을 적용한다.
  const handleZoomLevelPress = useCallback((nextZoomLevel: number) => {
    setZoomLevel(nextZoomLevel);
  }, []);

  // 전면 카메라 보조가 필요할 때 후면 카메라로 전환한다.
  const handleRearCameraSwitch = useCallback(() => {
    setScannerFacing("back");
    setZoomLevel(1);
    resetScannerAssist();
  }, [resetScannerAssist]);

  // 오버레이 계산이 카메라와 맞도록 미리보기 크기를 기록한다.
  const handlePreviewLayout = useCallback((event: LayoutChangeEvent) => {
    const { height: nextHeight, width: nextWidth } = event.nativeEvent.layout;
    if (!nextWidth || !nextHeight) return;
    setPreviewLayout({
      height: nextHeight,
      width: nextWidth,
    });
  }, []);

  // 스캔 프레임 내부 터치에 대해 프로그램 방식의 탭 초점 요청을 보낸다.
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
            active={isScreenFocused && !isLoadingOverlayVisible}
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
            active={isScreenFocused && !isLoadingOverlayVisible}
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

      {redirectProbeElement}

      {loadingOverlay}
    </SafeAreaView>
  );
}

// 첫 번째 탭 라우트에서 사용할 스캐너 기능을 내보낸다.
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
});
