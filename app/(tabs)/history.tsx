import { StyleSheet, Text, View } from "react-native";

// Renders the placeholder screen for future QR playback history.
export default function HistoryScreen() {
  return (
    <View style={styles.container}>
      <Text selectable style={styles.title}>
        히스토리 화면
      </Text>
      <Text selectable style={styles.description}>
        추후 저장된 QR 재생 목록이 여기에 표시됩니다.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#000000",
    paddingHorizontal: 24,
  },
  title: {
    color: "#FFFFFF",
    fontSize: 24,
    fontWeight: "700",
  },
  description: {
    marginTop: 10,
    color: "#9CA3AF",
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
  },
});
