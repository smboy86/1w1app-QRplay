import { useRouter } from "expo-router";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { useFloatingTabBarMetrics } from "../../src/features/floating-tab-bar/floating-tab-bar-context";
import { usePlaybackHistory } from "../../src/features/playback-history/playback-history-context";

// Formats the last interaction time for a history card subtitle.
function formatHistoryTimestamp(timestamp: number): string {
  return new Date(timestamp).toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Renders the redesigned playback history list for the second tab.
export default function HistoryScreen() {
  const router = useRouter();
  const { reservedBottomSpace } = useFloatingTabBarMetrics();
  const { history, isHistoryReady, requestReplay } = usePlaybackHistory();
  const totalCount = history.length;

  return (
    <View style={styles.screen}>
      <View style={styles.backgroundOrbPrimary} />
      <View style={styles.backgroundOrbSecondary} />

      <FlatList
        data={history}
        keyExtractor={(item) => item.id}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={[
          styles.contentContainer,
          {
            paddingBottom: Math.max(40, reservedBottomSpace + 24),
          },
        ]}
        showsVerticalScrollIndicator={false}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text selectable style={styles.title}>
              QR스캔 히스토리
            </Text>
            <Text selectable style={styles.description}>
              최근 QR 재생 주소를 순서대로 모아두었습니다. 카드를 터치하면 스캔
              탭에서 같은 재생 방식으로 다시 실행됩니다.
            </Text>
          </View>
        }
        ListEmptyComponent={
          isHistoryReady ? (
            <View style={styles.emptyCard}>
              <View style={styles.emptyIconShell}>
                <View style={styles.emptyIconCore} />
              </View>
              <Text selectable style={styles.emptyTitle}>
                아직 저장된 재생 기록이 없습니다
              </Text>
              <Text selectable style={styles.emptyDescription}>
                QR을 한 번 재생하면 이 탭에 성공/실패 상태와 재생 횟수가 함께
                쌓입니다.
              </Text>
            </View>
          ) : (
            <View style={styles.emptyCard}>
              <ActivityIndicator size="large" color="#4E8EF7" />
              <Text selectable style={styles.emptyTitle}>
                히스토리 불러오는 중
              </Text>
              <Text selectable style={styles.emptyDescription}>
                저장된 QR 재생 기록을 읽고 있어요.
              </Text>
            </View>
          )
        }
        renderItem={({ item, index }) => {
          const isSuccess = item.lastStatus === "success";
          const orderNumber = totalCount - index;

          return (
            <Pressable
              onPress={() => {
                requestReplay(item.id);
                router.navigate("/");
              }}
              style={({ pressed }) => [
                styles.card,
                isSuccess ? styles.cardSuccess : styles.cardFailure,
                pressed && styles.cardPressed,
              ]}
            >
              <View
                style={[
                  styles.cardAccent,
                  isSuccess
                    ? styles.cardAccentSuccess
                    : styles.cardAccentFailure,
                ]}
              />

              <View style={styles.leadingColumn}>
                <View style={styles.sequencePill}>
                  <Text selectable style={styles.sequenceLabel}>
                    No.
                  </Text>
                  <Text selectable style={styles.sequenceValue}>
                    {orderNumber}
                  </Text>
                </View>

                <View
                  style={[
                    styles.statusBadge,
                    isSuccess
                      ? styles.statusBadgeSuccess
                      : styles.statusBadgeFailure,
                  ]}
                >
                  <View
                    style={[
                      styles.statusDot,
                      isSuccess
                        ? styles.statusDotSuccess
                        : styles.statusDotFailure,
                    ]}
                  />
                  <Text
                    selectable
                    style={[
                      styles.statusText,
                      isSuccess
                        ? styles.statusTextSuccess
                        : styles.statusTextFailure,
                    ]}
                  >
                    {isSuccess ? "성공" : "실패"}
                  </Text>
                </View>
              </View>

              <View style={styles.urlColumn}>
                <Text selectable style={styles.urlLabel}>
                  QR Read URL
                </Text>
                <Text
                  selectable
                  numberOfLines={1}
                  ellipsizeMode="tail"
                  style={styles.urlValue}
                >
                  {item.sourceUrl}
                </Text>
                <Text selectable style={styles.urlMeta}>
                  탭해서 다시 재생 · {formatHistoryTimestamp(item.updatedAt)}
                </Text>
              </View>

              <View style={styles.countBubble}>
                <Text selectable style={styles.countValue}>
                  {item.playCount}
                </Text>
                <Text selectable style={styles.countLabel}>
                  회
                </Text>
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#ECF2F8",
  },
  backgroundOrbPrimary: {
    position: "absolute",
    top: -120,
    right: -60,
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: "rgba(255, 209, 102, 0.36)",
  },
  backgroundOrbSecondary: {
    position: "absolute",
    bottom: 60,
    left: -80,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: "rgba(111, 214, 190, 0.18)",
  },
  contentContainer: {
    paddingHorizontal: 18,
    paddingTop: 26,
    paddingBottom: 40,
  },
  separator: {
    height: 14,
  },
  header: {
    marginBottom: 22,
    gap: 8,
  },
  eyebrow: {
    alignSelf: "flex-start",
    borderRadius: 999,
    backgroundColor: "rgba(255, 255, 255, 0.62)",
    color: "#516170",
    overflow: "hidden",
    paddingHorizontal: 12,
    paddingVertical: 6,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  title: {
    color: "#102333",
    fontSize: 34,
    fontWeight: "800",
    letterSpacing: -0.8,
  },
  description: {
    color: "#536271",
    fontSize: 15,
    lineHeight: 22,
  },
  emptyCard: {
    borderRadius: 30,
    borderCurve: "continuous",
    backgroundColor: "rgba(255, 255, 255, 0.78)",
    paddingHorizontal: 24,
    paddingVertical: 32,
    alignItems: "center",
    gap: 10,
    boxShadow: "0 20px 50px rgba(61, 82, 99, 0.10)",
  },
  emptyIconShell: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "rgba(95, 169, 255, 0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  emptyIconCore: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#8CB8FF",
  },
  emptyTitle: {
    color: "#183141",
    fontSize: 20,
    fontWeight: "700",
    textAlign: "center",
  },
  emptyDescription: {
    color: "#647786",
    fontSize: 14,
    lineHeight: 21,
    textAlign: "center",
  },
  card: {
    minHeight: 116,
    borderRadius: 30,
    borderCurve: "continuous",
    backgroundColor: "rgba(255, 255, 255, 0.78)",
    paddingHorizontal: 18,
    paddingVertical: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    overflow: "hidden",
    boxShadow: "0 18px 44px rgba(61, 82, 99, 0.10)",
  },
  cardSuccess: {
    borderWidth: 1,
    borderColor: "rgba(140, 219, 185, 0.44)",
  },
  cardFailure: {
    borderWidth: 1,
    borderColor: "rgba(255, 177, 177, 0.44)",
  },
  cardPressed: {
    transform: [{ scale: 0.985 }],
    opacity: 0.94,
  },
  cardAccent: {
    position: "absolute",
    top: -16,
    right: -12,
    width: 120,
    height: 120,
    borderRadius: 60,
  },
  cardAccentSuccess: {
    backgroundColor: "rgba(96, 214, 165, 0.18)",
  },
  cardAccentFailure: {
    backgroundColor: "rgba(255, 143, 143, 0.14)",
  },
  leadingColumn: {
    width: 82,
    gap: 10,
    alignItems: "flex-start",
  },
  sequencePill: {
    borderRadius: 22,
    borderCurve: "continuous",
    backgroundColor: "rgba(241, 247, 252, 0.96)",
    paddingHorizontal: 12,
    paddingVertical: 10,
    minWidth: 72,
    gap: 2,
  },
  sequenceLabel: {
    color: "#728391",
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  sequenceValue: {
    color: "#143041",
    fontSize: 21,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
  statusBadge: {
    minHeight: 34,
    borderRadius: 999,
    borderCurve: "continuous",
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  statusBadgeSuccess: {
    backgroundColor: "rgba(38, 186, 120, 0.12)",
  },
  statusBadgeFailure: {
    backgroundColor: "rgba(241, 91, 91, 0.12)",
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  statusDotSuccess: {
    backgroundColor: "#169A62",
  },
  statusDotFailure: {
    backgroundColor: "#D64949",
  },
  statusText: {
    fontSize: 13,
    fontWeight: "700",
  },
  statusTextSuccess: {
    color: "#15734D",
  },
  statusTextFailure: {
    color: "#B43E3E",
  },
  urlColumn: {
    flex: 1,
    gap: 5,
  },
  urlLabel: {
    color: "#7B8C99",
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  urlValue: {
    color: "#0F2839",
    fontSize: 16,
    fontWeight: "700",
    lineHeight: 22,
  },
  urlMeta: {
    color: "#627482",
    fontSize: 13,
    lineHeight: 18,
  },
  countBubble: {
    minWidth: 66,
    borderRadius: 24,
    borderCurve: "continuous",
    backgroundColor: "rgba(248, 251, 255, 0.92)",
    paddingHorizontal: 12,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  countValue: {
    color: "#102333",
    fontSize: 24,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
  countLabel: {
    color: "#70808F",
    fontSize: 12,
    fontWeight: "700",
  },
});
