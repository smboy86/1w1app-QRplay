import { useRouter } from "expo-router";
import { ActivityIndicator, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { WebView } from "react-native-webview";

const privacyPolicyUrl = "https://naver.com";

// Renders the in-app popup that displays the privacy policy URL inside a web view.
export default function PrivacyPolicyModalScreen() {
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  const modalWidth = Math.min(width - 24, 560);
  const modalHeight = Math.min(height * 0.78, 720);

  return (
    <View style={styles.overlay}>
      <Pressable
        onPress={() => {
          router.back();
        }}
        style={styles.backdrop}
      />

      <View style={[styles.modalCard, { width: modalWidth, height: modalHeight }]}>
        <View style={styles.header}>
          <Text selectable style={styles.title}>
            개인정보처리방침
          </Text>

          <Pressable
            accessibilityRole="button"
            onPress={() => {
              router.back();
            }}
            style={({ pressed }) => [
              styles.closeButton,
              pressed ? styles.closeButtonPressed : undefined,
            ]}
          >
            <Text selectable style={styles.closeButtonLabel}>
              X
            </Text>
          </Pressable>
        </View>

        <View style={styles.webviewShell}>
          <WebView
            originWhitelist={["*"]}
            setSupportMultipleWindows={false}
            source={{ uri: privacyPolicyUrl }}
            startInLoadingState
            renderLoading={() => (
              <View style={styles.loadingContainer}>
                <ActivityIndicator color="#173042" size="small" />
              </View>
            )}
            style={styles.webview}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
    backgroundColor: "rgba(10, 19, 31, 0.32)",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  modalCard: {
    borderRadius: 28,
    borderCurve: "continuous",
    backgroundColor: "#FFFFFF",
    overflow: "hidden",
    boxShadow: "0 28px 80px rgba(15, 23, 42, 0.22)",
  },
  header: {
    minHeight: 62,
    paddingHorizontal: 18,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#F7FAFD",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(92, 113, 132, 0.12)",
  },
  title: {
    color: "#173042",
    fontSize: 17,
    fontWeight: "800",
  },
  closeButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#EAF1F8",
    alignItems: "center",
    justifyContent: "center",
  },
  closeButtonPressed: {
    backgroundColor: "#DDE6F0",
  },
  closeButtonLabel: {
    color: "#516170",
    fontSize: 14,
    fontWeight: "800",
  },
  webviewShell: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  webview: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
  },
});
