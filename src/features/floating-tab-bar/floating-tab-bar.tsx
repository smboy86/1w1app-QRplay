import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  ANDROID_FLOATING_TAB_BAR_COMPACT_BOTTOM_OFFSET,
  ANDROID_FLOATING_TAB_BAR_COMPACT_HEIGHT,
  ANDROID_FLOATING_TAB_BAR_COMPACT_HEIGHT_THRESHOLD,
  ANDROID_FLOATING_TAB_BAR_HORIZONTAL_MARGIN,
  ANDROID_FLOATING_TAB_BAR_MAX_WIDTH,
  ANDROID_FLOATING_TAB_BAR_REGULAR_BOTTOM_OFFSET,
  ANDROID_FLOATING_TAB_BAR_REGULAR_HEIGHT,
} from "./floating-tab-bar-constants";
import { useFloatingTabBarVisibility } from "./floating-tab-bar-context";

const tabBarBackgroundColor = "#050505";
const tabBarDefaultColor = "#F8FAFC";
const tabBarActiveColor = "#FACC15";
const tabBarIndicatorColor = "#3F3300";

type FloatingTabBarItemConfig = {
  iconName: React.ComponentProps<typeof MaterialIcons>["name"];
  label: string;
};

const TAB_ITEM_CONFIG: Record<string, FloatingTabBarItemConfig> = {
  index: {
    iconName: "qr-code-scanner",
    label: "스캔",
  },
  history: {
    iconName: "history",
    label: "히스토리",
  },
  settings: {
    iconName: "settings",
    label: "설정",
  },
};

// Returns the icon and default label used by a known floating-tab route.
function getTabItemConfig(routeName: string): FloatingTabBarItemConfig {
  return TAB_ITEM_CONFIG[routeName] ?? {
    iconName: "radio-button-unchecked",
    label: routeName,
  };
}

// Resolves the label text shown for a tab item from its descriptor options.
function getTabLabel(routeName: string, label: unknown, title: unknown): string {
  if (typeof label === "string") {
    return label;
  }

  if (typeof title === "string") {
    return title;
  }

  return getTabItemConfig(routeName).label;
}

// Renders the Android-only floating tab bar used by the JS tab navigator.
export function FloatingTabBar({
  state,
  descriptors,
  navigation,
}: BottomTabBarProps): React.JSX.Element | null {
  const { isVisible } = useFloatingTabBarVisibility();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isAndroid = process.env.EXPO_OS === "android";

  if (!isAndroid || !isVisible) {
    return null;
  }

  const isCompactHeight = height < ANDROID_FLOATING_TAB_BAR_COMPACT_HEIGHT_THRESHOLD;
  const barHeight = isCompactHeight
    ? ANDROID_FLOATING_TAB_BAR_COMPACT_HEIGHT
    : ANDROID_FLOATING_TAB_BAR_REGULAR_HEIGHT;
  const bottomOffset =
    insets.bottom +
    (isCompactHeight
      ? ANDROID_FLOATING_TAB_BAR_COMPACT_BOTTOM_OFFSET
      : ANDROID_FLOATING_TAB_BAR_REGULAR_BOTTOM_OFFSET);
  const barWidth = Math.min(
    width - ANDROID_FLOATING_TAB_BAR_HORIZONTAL_MARGIN * 2,
    ANDROID_FLOATING_TAB_BAR_MAX_WIDTH,
  );
  const iconSize = isCompactHeight ? 20 : 22;
  const fontSize = isCompactHeight ? 13 : 14;

  return (
    <View pointerEvents="box-none" style={styles.overlay}>
      <View
        style={[
          styles.barShell,
          {
            bottom: bottomOffset,
            height: barHeight,
            width: barWidth,
          },
        ]}
      >
        {state.routes.map((route, index) => {
          const isFocused = state.index === index;
          const { options } = descriptors[route.key];
          const tabItem = getTabItemConfig(route.name);
          const label = getTabLabel(route.name, options.tabBarLabel, options.title);

          return (
            <Pressable
              key={route.key}
              accessibilityRole="button"
              accessibilityState={isFocused ? { selected: true } : {}}
              accessibilityLabel={options.tabBarAccessibilityLabel}
              testID={options.tabBarButtonTestID}
              onLongPress={() => {
                navigation.emit({
                  type: "tabLongPress",
                  target: route.key,
                });
              }}
              onPress={() => {
                const event = navigation.emit({
                  type: "tabPress",
                  target: route.key,
                  canPreventDefault: true,
                });

                if (isFocused || event.defaultPrevented) {
                  return;
                }

                navigation.navigate(route.name, route.params);
              }}
              style={({ pressed }) => [
                styles.item,
                isFocused && styles.activeItem,
                pressed && styles.pressedItem,
              ]}
            >
              <MaterialIcons
                color={isFocused ? tabBarActiveColor : tabBarDefaultColor}
                name={tabItem.iconName}
                size={iconSize}
              />
              <Text
                numberOfLines={1}
                style={[
                  styles.itemLabel,
                  {
                    color: isFocused ? tabBarActiveColor : tabBarDefaultColor,
                    fontSize,
                    fontWeight: isFocused ? "700" : "600",
                  },
                ]}
              >
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "flex-end",
  },
  barShell: {
    position: "absolute",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderCurve: "continuous",
    backgroundColor: "rgba(5, 5, 5, 0.94)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    boxShadow: "0 18px 40px rgba(0, 0, 0, 0.26)",
  },
  item: {
    flex: 1,
    minHeight: 44,
    borderRadius: 999,
    borderCurve: "continuous",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 14,
  },
  activeItem: {
    backgroundColor: tabBarIndicatorColor,
  },
  pressedItem: {
    opacity: 0.85,
  },
  itemLabel: {
    letterSpacing: -0.1,
  },
});
