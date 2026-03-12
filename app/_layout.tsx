import * as SplashScreen from "expo-splash-screen";
import { Stack } from "expo-router";

import { PlaybackHistoryProvider } from "../src/features/playback-history/playback-history-context";
import { PlaybackReturnSettingProvider } from "../src/features/settings/playback-return-setting-context";

void SplashScreen.preventAutoHideAsync().catch(() => {
  // 빠른 새로고침 중 중복 방지 요청은 무시한다.
});

// 네이티브 탭 내비게이터를 담는 루트 스택을 렌더링한다.
export default function RootLayout() {
  return (
    <PlaybackReturnSettingProvider>
      <PlaybackHistoryProvider>
        <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen
            name="player"
            options={{
              headerShown: false,
              presentation: "transparentModal",
              animation: "fade",
              contentStyle: {
                backgroundColor: "transparent",
              },
            }}
          />
          <Stack.Screen name="settings-detail" options={{ title: "설정" }} />
          <Stack.Screen
            name="privacy-policy-modal"
            options={{
              headerShown: false,
              presentation: "transparentModal",
              animation: "fade",
              contentStyle: {
                backgroundColor: "transparent",
              },
            }}
          />
        </Stack>
      </PlaybackHistoryProvider>
    </PlaybackReturnSettingProvider>
  );
}
