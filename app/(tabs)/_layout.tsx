import { Tabs } from "expo-router";
import { NativeTabs } from "expo-router/unstable-native-tabs";

import { FloatingTabBar } from "../../src/features/floating-tab-bar/floating-tab-bar";
import { FloatingTabBarProvider } from "../../src/features/floating-tab-bar/floating-tab-bar-context";

const tabBarBackgroundColor = "#050505";
const tabBarDefaultColor = "#F8FAFC";
const tabBarActiveColor = "#FACC15";
const tabBarIndicatorColor = "#3F3300";
const isAndroid = process.env.EXPO_OS === "android";

// 앱 탭 내비게이터를 렌더링하고 안드로이드 플로팅 탭 바를 적용한다.
export default function TabLayout() {
  return (
    <FloatingTabBarProvider>
      {isAndroid ? (
        <Tabs
          screenOptions={{
            headerShown: false,
            tabBarStyle: {
              position: "absolute",
              height: 0,
            },
          }}
          tabBar={(props) => <FloatingTabBar {...props} />}
        >
          <Tabs.Screen name="index" options={{ title: "스캔" }} />
          <Tabs.Screen name="history" options={{ title: "히스토리" }} />
          <Tabs.Screen name="settings" options={{ title: "설정" }} />
        </Tabs>
      ) : (
        <NativeTabs
          backgroundColor={tabBarBackgroundColor}
          tintColor={tabBarActiveColor}
          iconColor={{
            default: tabBarDefaultColor,
            selected: tabBarActiveColor,
          }}
          labelStyle={{
            default: {
              color: tabBarDefaultColor,
              fontSize: 12,
              fontWeight: "600",
            },
            selected: {
              color: tabBarActiveColor,
              fontSize: 12,
              fontWeight: "700",
            },
          }}
          indicatorColor={tabBarIndicatorColor}
          rippleColor="rgba(250, 204, 21, 0.16)"
        >
          <NativeTabs.Trigger name="index">
            <NativeTabs.Trigger.Icon
              sf="qrcode.viewfinder"
              md="qr_code_scanner"
            />
            <NativeTabs.Trigger.Label>스캔</NativeTabs.Trigger.Label>
          </NativeTabs.Trigger>

          <NativeTabs.Trigger name="history" role="history">
            <NativeTabs.Trigger.Icon
              sf="clock.arrow.circlepath"
              md="history"
            />
            <NativeTabs.Trigger.Label>히스토리</NativeTabs.Trigger.Label>
          </NativeTabs.Trigger>

          <NativeTabs.Trigger name="settings">
            <NativeTabs.Trigger.Icon sf="gearshape" md="settings" />
            <NativeTabs.Trigger.Label>설정</NativeTabs.Trigger.Label>
          </NativeTabs.Trigger>
        </NativeTabs>
      )}
    </FloatingTabBarProvider>
  );
}
