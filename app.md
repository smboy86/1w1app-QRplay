Expo 앱 구조

설치는 이 정도면 되옵니다.

npx expo install expo-camera react-native-webview

expo-camera는 카메라/QR 스캔을, react-native-webview는 WebView를 제공하옵니다. 둘 다 Expo 문서에 설치법이 정리되어 있사옵니다.

app.json은 이렇게 권하옵니다.

{
"expo": {
"plugins": [
[
"expo-camera",
{
"cameraPermission": "QR 코드를 읽기 위해 카메라 접근이 필요합니다.",
"recordAudioAndroid": false,
"barcodeScannerEnabled": true
}
]
]
}
}

스캔 전용 앱이라면 recordAudioAndroid는 굳이 켤 까닭이 없사옵니다. expo-camera config plugin도 이를 지원하옵니다.

파일 구조는 이 정도가 무난하옵니다.

App.tsx
src/lib/extractYouTubeId.ts
src/lib/buildYoutubeHtml.ts

앱이 단순하니 굳이 router를 얹지 않아도 되옵니다.

1. YouTube ID 추출기

QR 안에 raw URL이 들어오는 경우를 처리하는 함수이옵니다.

// src/lib/extractYouTubeId.ts
const YT*ID_RE = /^[A-Za-z0-9*-]{11}$/;

export function extractYouTubeId(input: string): string | null {
const raw = input.trim();

if (YT_ID_RE.test(raw)) return raw;

let url: URL;
try {
url = new URL(raw);
} catch {
return null;
}

const host = url.hostname.replace(/^www\./, "").replace(/^m\./, "");

if (host === "youtu.be") {
const id = url.pathname.split("/").filter(Boolean)[0];
return id && YT_ID_RE.test(id) ? id : null;
}

if (host.endsWith("youtube.com")) {
const v = url.searchParams.get("v");
if (v && YT_ID_RE.test(v)) return v;

    const parts = url.pathname.split("/").filter(Boolean);
    if (parts[0] === "embed" || parts[0] === "shorts" || parts[0] === "live") {
      const id = parts[1];
      return id && YT_ID_RE.test(id) ? id : null;
    }

}

return null;
}

여기서는 playlist/channel/search URL은 일부러 통과시키지 않도록 잡는 편이 좋사옵니다. 귀하의 요구가 “1 QR = 1 영상”이기 때문이옵니다.

2. WebView 안에서 쓸 YouTube HTML

핵심은 세 가지이옵니다.

playerVars로 기본 UI 최소화

window.ReactNativeWebView.postMessage(...)로 RN에 이벤트 전달

baseUrl과 origin을 같은 앱 식별 URL로 맞춤

react-native-webview는 static HTML과 baseUrl을 지원하고, RN ↔ WebView 브리지는 onMessage / postMessage로 처리할 수 있사옵니다.

// src/lib/buildYoutubeHtml.ts
export function buildYoutubeHtml(videoId: string, appOrigin: string, autoplay = true) {
const playerVars = {
autoplay: autoplay ? 1 : 0,
controls: 0,
disablekb: 1,
fs: 0,
rel: 0,
playsinline: 1,
enablejsapi: 1,
iv_load_policy: 3,
origin: appOrigin,
hl: "ko"
};

return `

<!doctype html>
<html>
  <head>
    <meta
      name="viewport"
      content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no"
    />
    <style>
      html, body {
        margin: 0;
        padding: 0;
        background: #000;
        width: 100%;
        height: 100%;
        overflow: hidden;
      }
      #player {
        position: fixed;
        inset: 0;
      }
      iframe {
        width: 100%;
        height: 100%;
      }
    </style>
  </head>
  <body>
    <div id="player"></div>

    <script>
      var player = null;

      function send(type, payload) {
        if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: type, payload: payload || null }));
        }
      }

      function onYouTubeIframeAPIReady() {
        player = new YT.Player('player', {
          width: '100%',
          height: '100%',
          videoId: ${JSON.stringify(videoId)},
          playerVars: ${JSON.stringify(playerVars)},
          events: {
            onReady: function (event) {
              window.__YT_PLAY__ = function () { if (player) player.playVideo(); };
              window.__YT_PAUSE__ = function () { if (player) player.pauseVideo(); };
              window.__YT_STOP__ = function () { if (player) player.stopVideo(); };
              window.__YT_DESTROY__ = function () { if (player) player.destroy(); };

              send('ready');

              ${autoplay ? "event.target.playVideo();" : ""}
            },
            onStateChange: function (event) {
              send('state', { state: event.data });

              if (event.data === YT.PlayerState.PLAYING) send('playing');
              if (event.data === YT.PlayerState.PAUSED) send('paused');
              if (event.data === YT.PlayerState.ENDED) send('ended');
              if (event.data === YT.PlayerState.BUFFERING) send('buffering');
              if (event.data === YT.PlayerState.CUED) send('cued');
            },
            onError: function (event) {
              send('error', { code: event.data });
            },
            onAutoplayBlocked: function () {
              send('autoplayBlocked');
            }
          }
        });
      }

      var tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(tag);
    </script>

  </body>
</html>
`;
}
3) App.tsx 골격

아래 구조의 핵심은,

scanner일 때만 CameraView 렌더

player일 때만 WebView 렌더

Pause/Exit 버튼은 플레이어 아래쪽에 둠

ended 이벤트를 받으면 즉시 scanner로 복귀

이옵니다. 이렇게 해야 관련 영상 endscreen이 길게 남지 않사옵니다. YouTube는 related videos를 완전히 끌 수 없으므로, 종료 이벤트를 받는 즉시 player를 내려버리는 것이 최선이옵니다.

// App.tsx
import React, { useMemo, useRef, useState } from "react";
import {
Alert,
Button,
Platform,
Pressable,
SafeAreaView,
StyleSheet,
Text,
View
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { WebView, WebViewMessageEvent } from "react-native-webview";

import { extractYouTubeId } from "./src/lib/extractYouTubeId";
import { buildYoutubeHtml } from "./src/lib/buildYoutubeHtml";

const APP_ORIGIN = "https://com.example.kidqrplayer";

type Mode = "scanner" | "player";
type PlayerUiState = "idle" | "playing" | "paused" | "blocked";

export default function App() {
const [permission, requestPermission] = useCameraPermissions();
const [mode, setMode] = useState<Mode>("scanner");
const [videoId, setVideoId] = useState<string | null>(null);
const [playerUiState, setPlayerUiState] = useState<PlayerUiState>("idle");
const [sessionKey, setSessionKey] = useState(0);

const scanLockedRef = useRef(false);
const webViewRef = useRef<WebView>(null);

const html = useMemo(() => {
return videoId ? buildYoutubeHtml(videoId, APP_ORIGIN, true) : "";
}, [videoId, sessionKey]);

const resetToScanner = () => {
setMode("scanner");
setVideoId(null);
setPlayerUiState("idle");
setSessionKey((v) => v + 1);
scanLockedRef.current = false;
};

const handleBarcodeScanned = ({ data }: { data: string }) => {
if (scanLockedRef.current) return;
scanLockedRef.current = true;

    const id = extractYouTubeId(data);

    if (!id) {
      Alert.alert("재생할 수 없는 QR", "직접 영상 링크 형식만 허용하옵니다.");
      scanLockedRef.current = false;
      return;
    }

    setVideoId(id);
    setMode("player");

};

const sendPlayerCommand = (globalFnName: string) => {
webViewRef.current?.injectJavaScript(`       if (window.${globalFnName}) window.${globalFnName}();
      true;
    `);
};

const handlePlayerMessage = (event: WebViewMessageEvent) => {
try {
const msg = JSON.parse(event.nativeEvent.data);

      switch (msg.type) {
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
          Alert.alert("재생 오류", mapYouTubeError(msg.payload?.code));
          resetToScanner();
          return;
      }
    } catch {
      // ignore malformed bridge messages
    }

};

if (!permission) {
return <View style={styles.center} />;
}

if (!permission.granted) {
return (
<SafeAreaView style={styles.center}>
<Text style={styles.message}>카메라 권한이 필요하옵니다.</Text>
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
          <Text style={styles.scannerTitle}>QR을 비춰 주소서</Text>
          <Text style={styles.scannerDesc}>
            스캔되면 영상 1개만 재생하고, 끝나면 자동으로 카메라로 돌아가옵니다.
          </Text>
        </View>
      </SafeAreaView>
    );

}

return (
<SafeAreaView style={styles.container}>
<View style={styles.playerArea}>
<WebView
key={sessionKey}
ref={webViewRef}
originWhitelist={["*"]}
source={{ html, baseUrl: APP_ORIGIN }}
onMessage={handlePlayerMessage}
javaScriptEnabled
scrollEnabled={false}
domStorageEnabled
mediaPlaybackRequiresUserAction={false}
allowsInlineMediaPlayback
javaScriptCanOpenWindowsAutomatically={false}
{...(Platform.OS === "android"
? {
setBuiltInZoomControls: false,
setDisplayZoomControls: false,
allowsFullscreenVideo: false
}
: {})}
/>
</View>

      <View style={styles.controls}>
        <Pressable
          style={styles.primaryButton}
          onPress={() => {
            if (playerUiState === "paused" || playerUiState === "blocked") {
              sendPlayerCommand("__YT_PLAY__");
            } else {
              sendPlayerCommand("__YT_PAUSE__");
            }
          }}
        >
          <Text style={styles.buttonText}>
            {playerUiState === "paused"
              ? "계속 재생"
              : playerUiState === "blocked"
              ? "재생"
              : "일시정지"}
          </Text>
        </Pressable>

        <Pressable
          style={styles.secondaryButton}
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

function mapYouTubeError(code?: number) {
switch (code) {
case 100:
return "삭제되었거나 비공개 영상이옵니다.";
case 101:
case 150:
return "임베드 재생이 허용되지 않은 영상이옵니다.";
case 153:
return "앱 식별(Referer/origin) 구성이 누락되었사옵니다.";
case 5:
return "HTML5 플레이어 오류가 발생했사옵니다.";
default:
return "재생할 수 없는 영상이옵니다.";
}
}

const styles = StyleSheet.create({
container: {
flex: 1,
backgroundColor: "#000"
},
center: {
flex: 1,
justifyContent: "center",
alignItems: "center",
padding: 24
},
message: {
fontSize: 16,
marginBottom: 12
},
scannerHint: {
position: "absolute",
left: 16,
right: 16,
bottom: 24,
backgroundColor: "rgba(0,0,0,0.55)",
borderRadius: 12,
padding: 16
},
scannerTitle: {
color: "#fff",
fontSize: 20,
fontWeight: "700"
},
scannerDesc: {
color: "#fff",
marginTop: 8,
lineHeight: 20
},
playerArea: {
width: "100%",
aspectRatio: 16 / 9,
backgroundColor: "#000"
},
controls: {
flexDirection: "row",
padding: 16
},
primaryButton: {
flex: 1,
backgroundColor: "#2563eb",
borderRadius: 12,
paddingVertical: 16,
alignItems: "center",
marginRight: 8
},
secondaryButton: {
flex: 1,
backgroundColor: "#4b5563",
borderRadius: 12,
paddingVertical: 16,
alignItems: "center",
marginLeft: 8
},
buttonText: {
color: "#fff",
fontSize: 16,
fontWeight: "700"
}
});
