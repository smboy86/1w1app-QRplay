import * as SplashScreen from "expo-splash-screen";
import { Stack } from "expo-router";

import { PlaybackHistoryProvider } from "../src/features/playback-history/playback-history-context";

void SplashScreen.preventAutoHideAsync().catch(() => {
  // Ignore duplicate prevention requests during fast refresh.
});

// Renders the root stack that hosts the native tab navigator.
export default function RootLayout() {
  return (
    <PlaybackHistoryProvider>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="player" options={{ headerShown: false }} />
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
  );
}
