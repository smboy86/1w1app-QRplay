import { Alert, Image, Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

const appVersion = require("../../app.json").expo.version as string;
const privacyPolicyUrl = "https://naver.com";
const contactMailUrl =
  `mailto:?subject=${encodeURIComponent("QRPlay 문의")}&body=${encodeURIComponent(
    `앱 버전: ${appVersion}\n\n문의 내용을 입력해주세요.`,
  )}`;

type SettingsRowProps = {
  label: string;
  value?: string;
  onPress?: () => void;
};

// Opens a supported external target and shows an error if it cannot be handled.
async function openExternalTarget(target: string) {
  try {
    await Linking.openURL(target);
  } catch {
    Alert.alert("열 수 없습니다", "연결할 수 있는 앱 또는 화면을 찾지 못했습니다.");
  }
}

// Opens the Android app settings page for this application.
async function openAppSettings() {
  try {
    await Linking.openSettings();
  } catch {
    Alert.alert("열 수 없습니다", "기기 설정 화면을 열지 못했습니다.");
  }
}

// Renders a single row inside the vertical settings list.
function SettingsRow({ label, value, onPress }: SettingsRowProps) {
  return (
    <Pressable
      accessibilityRole={onPress ? "button" : undefined}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        pressed && onPress ? styles.rowPressed : undefined,
      ]}
    >
      <Text selectable style={styles.rowLabel}>
        {label}
      </Text>

      <View style={styles.rowRight}>
        {value ? (
          <Text selectable style={styles.rowValue}>
            {value}
          </Text>
        ) : null}
        {onPress ? (
          <View style={styles.chevronBubble}>
            <Text selectable style={styles.chevron}>
              &gt;
            </Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

// Renders the redesigned settings home screen for the third tab.
export default function SettingsScreen() {
  return (
    <View style={styles.screen}>
      <View style={styles.backgroundOrbPrimary} />
      <View style={styles.backgroundOrbSecondary} />

      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.introCard}>
          <View style={styles.iconShell}>
            <Image source={require("../../assets/icon.png")} style={styles.icon} />
          </View>

          <View style={styles.introTextBlock}>
            <Text selectable style={styles.eyebrow}>
              QRPlay
            </Text>
            <Text selectable style={styles.title}>
              앱 소개
            </Text>
            <Text selectable style={styles.description}>
              아이와 함께하는 QR플레이북
            </Text>
          </View>
        </View>

        <View style={styles.listCard}>
          <SettingsRow label="설정" onPress={() => void openAppSettings()} />
          <View style={styles.divider} />
          <SettingsRow
            label="개인정보처리방침"
            onPress={() => void openExternalTarget(privacyPolicyUrl)}
          />
          <View style={styles.divider} />
          <SettingsRow label="앱 버전" value={appVersion} />
          <View style={styles.divider} />
          <SettingsRow
            label="제작자에게 문의하기"
            onPress={() => void openExternalTarget(contactMailUrl)}
          />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#EEF4FA",
  },
  backgroundOrbPrimary: {
    position: "absolute",
    top: -90,
    right: -30,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: "rgba(255, 214, 102, 0.34)",
  },
  backgroundOrbSecondary: {
    position: "absolute",
    bottom: 40,
    left: -90,
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: "rgba(96, 161, 255, 0.14)",
  },
  contentContainer: {
    paddingHorizontal: 20,
    paddingTop: 28,
    paddingBottom: 42,
    gap: 18,
  },
  introCard: {
    borderRadius: 32,
    borderCurve: "continuous",
    backgroundColor: "rgba(255, 255, 255, 0.86)",
    padding: 24,
    flexDirection: "row",
    alignItems: "center",
    gap: 18,
    boxShadow: "0 24px 60px rgba(41, 71, 102, 0.12)",
  },
  iconShell: {
    width: 88,
    height: 88,
    borderRadius: 28,
    borderCurve: "continuous",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0 10px 24px rgba(58, 79, 97, 0.12)",
  },
  icon: {
    width: 68,
    height: 68,
    borderRadius: 20,
  },
  introTextBlock: {
    flex: 1,
    gap: 6,
  },
  eyebrow: {
    alignSelf: "flex-start",
    borderRadius: 999,
    backgroundColor: "#F3E27B",
    overflow: "hidden",
    paddingHorizontal: 10,
    paddingVertical: 5,
    color: "#4F4200",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.4,
  },
  title: {
    color: "#102333",
    fontSize: 28,
    fontWeight: "800",
    letterSpacing: -0.7,
  },
  description: {
    color: "#526171",
    fontSize: 16,
    lineHeight: 23,
    fontWeight: "500",
  },
  listCard: {
    borderRadius: 30,
    borderCurve: "continuous",
    backgroundColor: "rgba(255, 255, 255, 0.88)",
    overflow: "hidden",
    boxShadow: "0 20px 56px rgba(41, 71, 102, 0.10)",
  },
  row: {
    minHeight: 72,
    paddingHorizontal: 22,
    paddingVertical: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  rowPressed: {
    backgroundColor: "rgba(16, 35, 51, 0.05)",
  },
  rowLabel: {
    flex: 1,
    color: "#173042",
    fontSize: 16,
    fontWeight: "700",
  },
  rowRight: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 10,
  },
  rowValue: {
    color: "#6A7887",
    fontSize: 15,
    fontWeight: "700",
    textAlign: "right",
    fontVariant: ["tabular-nums"],
  },
  chevronBubble: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#F3F7FB",
    alignItems: "center",
    justifyContent: "center",
  },
  chevron: {
    color: "#8A98A7",
    fontSize: 16,
    fontWeight: "800",
    marginTop: -1,
  },
  divider: {
    height: 1,
    backgroundColor: "rgba(92, 113, 132, 0.12)",
    marginLeft: 22,
  },
});
