import { Image, ScrollView, StyleSheet, Text, View } from "react-native";

// 애니메이션 마스코트와 안내 문구가 있는 간단한 인앱 설정 화면을 렌더링한다.
export default function SettingsDetailScreen() {
  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.contentContainer}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.backgroundOrbPrimary} />
      <View style={styles.backgroundOrbSecondary} />

      <View style={styles.messageCard}>
        <View style={styles.mascotFrame}>
          <Image
            source={require("../assets/icon-mascot.gif")}
            style={styles.mascot}
          />
        </View>

        <Text selectable style={styles.message}>
          복잡한 설정 없이 사용가능합니다
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  contentContainer: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingVertical: 32,
    backgroundColor: "#EEF4FA",
  },
  backgroundOrbPrimary: {
    position: "absolute",
    top: 40,
    right: -30,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: "rgba(255, 214, 102, 0.24)",
  },
  backgroundOrbSecondary: {
    position: "absolute",
    bottom: 70,
    left: -70,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: "rgba(96, 161, 255, 0.14)",
  },
  messageCard: {
    width: "100%",
    maxWidth: 420,
    borderRadius: 36,
    borderCurve: "continuous",
    backgroundColor: "rgba(255, 255, 255, 0.88)",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingVertical: 34,
    gap: 20,
    boxShadow: "0 24px 64px rgba(41, 71, 102, 0.12)",
  },
  mascotFrame: {
    width: 224,
    height: 224,
    borderRadius: 34,
    borderCurve: "continuous",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  mascot: {
    width: 196,
    height: 196,
    backgroundColor: "#FFFFFF",
  },
  message: {
    width: "100%",
    flexShrink: 1,
    color: "#183042",
    fontSize: 18,
    lineHeight: 26,
    fontWeight: "700",
    textAlign: "center",
  },
});
