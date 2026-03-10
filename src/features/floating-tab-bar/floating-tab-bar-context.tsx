import React, { createContext, useState, type PropsWithChildren } from "react";
import { useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  ANDROID_FLOATING_TAB_BAR_COMPACT_BOTTOM_OFFSET,
  ANDROID_FLOATING_TAB_BAR_COMPACT_HEIGHT,
  ANDROID_FLOATING_TAB_BAR_COMPACT_HEIGHT_THRESHOLD,
  ANDROID_FLOATING_TAB_BAR_CONTENT_GAP,
  ANDROID_FLOATING_TAB_BAR_REGULAR_BOTTOM_OFFSET,
  ANDROID_FLOATING_TAB_BAR_REGULAR_HEIGHT,
} from "./floating-tab-bar-constants";

type FloatingTabBarVisibilityContextValue = {
  isVisible: boolean;
  setVisible: (next: boolean) => void;
};

type FloatingTabBarMetrics = {
  barHeight: number;
  bottomOffset: number;
  reservedBottomSpace: number;
};

const FloatingTabBarVisibilityContext =
  createContext<FloatingTabBarVisibilityContextValue | null>(null);
const FloatingTabBarMetricsContext = createContext<FloatingTabBarMetrics | null>(
  null,
);

// Provides shared floating-tab visibility state and layout metrics for Android tab screens.
export function FloatingTabBarProvider({
  children,
}: PropsWithChildren): React.JSX.Element {
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [isVisible, setVisible] = useState(true);
  const isAndroid = process.env.EXPO_OS === "android";
  const isCompactHeight =
    isAndroid && height < ANDROID_FLOATING_TAB_BAR_COMPACT_HEIGHT_THRESHOLD;
  const barHeight = isAndroid
    ? isCompactHeight
      ? ANDROID_FLOATING_TAB_BAR_COMPACT_HEIGHT
      : ANDROID_FLOATING_TAB_BAR_REGULAR_HEIGHT
    : 0;
  const bottomOffset = isAndroid
    ? insets.bottom +
      (isCompactHeight
        ? ANDROID_FLOATING_TAB_BAR_COMPACT_BOTTOM_OFFSET
        : ANDROID_FLOATING_TAB_BAR_REGULAR_BOTTOM_OFFSET)
    : 0;
  const reservedBottomSpace = isAndroid
    ? barHeight + bottomOffset + ANDROID_FLOATING_TAB_BAR_CONTENT_GAP
    : 0;

  return (
    <FloatingTabBarVisibilityContext.Provider value={{ isVisible, setVisible }}>
      <FloatingTabBarMetricsContext.Provider
        value={{ barHeight, bottomOffset, reservedBottomSpace }}
      >
        {children}
      </FloatingTabBarMetricsContext.Provider>
    </FloatingTabBarVisibilityContext.Provider>
  );
}

// Returns the current floating-tab visibility controller for Android tab screens.
export function useFloatingTabBarVisibility(): FloatingTabBarVisibilityContextValue {
  const context = React.use(FloatingTabBarVisibilityContext);
  if (!context) {
    throw new Error(
      "useFloatingTabBarVisibility must be used within FloatingTabBarProvider",
    );
  }

  return context;
}

// Returns the current floating-tab size metrics used to reserve bottom space.
export function useFloatingTabBarMetrics(): FloatingTabBarMetrics {
  const context = React.use(FloatingTabBarMetricsContext);
  if (!context) {
    throw new Error(
      "useFloatingTabBarMetrics must be used within FloatingTabBarProvider",
    );
  }

  return context;
}
