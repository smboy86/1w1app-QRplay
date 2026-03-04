import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Alert,
  Button,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  CameraView,
  type BarcodeScanningResult,
  useCameraPermissions,
} from "expo-camera";
import { WebView, type WebViewMessageEvent } from "react-native-webview";

import { buildYoutubeHtml } from "./src/lib/buildYoutubeHtml";
import {
  extractYouTubeId,
  mapExtractReasonToMessage,
} from "./src/lib/extractYouTubeId";
import {
  mapYouTubeError,
  NETWORK_ERROR_MESSAGE,
} from "./src/lib/mapYouTubeError";
import { resolveRedirectUrl } from "./src/lib/resolveRedirectUrl";
import type { BridgeMessage, Mode, PlayerUiState } from "./src/lib/types";

const APP_ORIGIN = "https://qrplay.app.local";
const PLAYER_READY_TIMEOUT_MS = 15000;

export default function App() {
  const [permission, requestPermission] = useCameraPermissions();
  const [mode, setMode] = useState<Mode>("scanner");
  const [videoId, setVideoId] = useState<string | null>(null);
  const [playerUiState, setPlayerUiState] = useState<PlayerUiState>("idle");
  const [sessionKey, setSessionKey] = useState(0);

  const scanLockedRef = useRef(false);
  const alertVisibleRef = useRef(false);
  const webViewRef = useRef<WebView>(null);

  const html = useMemo(() => {
    if (!videoId) return "";
    return buildYoutubeHtml(videoId, APP_ORIGIN, true);
  }, [videoId, sessionKey]);

  const showBlockingAlert = useCallback(
    (title: string, message: string, onClose?: () => void) => {
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
    setMode("scanner");
    setVideoId(null);
    setPlayerUiState("idle");
    setSessionKey((value) => value + 1);
    scanLockedRef.current = keepScanLocked;
  }, []);

  const handlePlaybackFailure = useCallback(
    (message: string) => {
      if (mode !== "player") return;
      console.log("[PLAYER] playback failure:", message);
      setPlayerUiState("error");
      resetToScanner(true);
      showBlockingAlert("재생 오류", message, () => {
        scanLockedRef.current = false;
      });
    },
    [mode, resetToScanner, showBlockingAlert],
  );

  useEffect(() => {
    if (mode !== "player" || playerUiState !== "loading") return;

    const timeout = setTimeout(() => {
      handlePlaybackFailure(NETWORK_ERROR_MESSAGE);
    }, PLAYER_READY_TIMEOUT_MS);

    return () => clearTimeout(timeout);
  }, [handlePlaybackFailure, mode, playerUiState]);

  const handleBarcodeScanned = async ({ data }: BarcodeScanningResult) => {
    if (scanLockedRef.current || alertVisibleRef.current) return;
    scanLockedRef.current = true;
    console.log("[QR] scanned data:", data);

    let result = extractYouTubeId(data);

    if (!result.ok && result.reason === "NOT_YOUTUBE") {
      const redirectResult = await resolveRedirectUrl(data);

      if (!redirectResult.ok && redirectResult.reason === "NETWORK") {
        showBlockingAlert("네트워크 오류", NETWORK_ERROR_MESSAGE, () => {
          scanLockedRef.current = false;
        });
        return;
      }

      if (redirectResult.ok) {
        console.log("[QR] resolved redirect URL:", redirectResult.url);
        result = extractYouTubeId(redirectResult.url);
      }
    }

    if (!result.ok) {
      showBlockingAlert(
        "지원하지 않는 QR",
        mapExtractReasonToMessage(result.reason),
        () => {
          scanLockedRef.current = false;
        },
      );
      return;
    }

    setVideoId(result.videoId);
    setPlayerUiState("loading");
    setMode("player");
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

  if (!permission) {
    return <View style={styles.blank} />;
  }

  if (!permission.granted) {
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
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
          onBarcodeScanned={handleBarcodeScanned}
        />

        <View style={styles.scannerHint}>
          <Text style={styles.scannerTitle}>QR을 비춰 주세요 2222</Text>
          <Text style={styles.scannerDescription}>
            한 번에 하나의 영상만 재생하며, 종료되면 자동으로 스캔 화면으로
            돌아옵니다.
          </Text>
        </View>
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
    </SafeAreaView>
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
});
