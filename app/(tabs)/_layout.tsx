import { NativeTabs } from "expo-router/unstable-native-tabs";

// Renders the three-tab native navigation used by the app.
export default function TabLayout() {
  return (
    <NativeTabs tintColor="#2563EB">
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
