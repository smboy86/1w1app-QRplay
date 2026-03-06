import * as SplashScreen from "expo-splash-screen";
import { Stack } from "expo-router";

void SplashScreen.preventAutoHideAsync().catch(() => {
  // Ignore duplicate prevention requests during fast refresh.
});

// Renders the root stack that hosts the native tab navigator.
export default function RootLayout() {
  return (
    <Stack>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
    </Stack>
  );
}
