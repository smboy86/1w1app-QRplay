import { NativeTabs } from "expo-router/unstable-native-tabs";

const tabBarBackgroundColor = "#050505";
const tabBarDefaultColor = "#F8FAFC";
const tabBarActiveColor = "#FACC15";
const tabBarIndicatorColor = "#3F3300";

// Renders the three-tab native navigation used by the app.
export default function TabLayout() {
  return (
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
  );
}
