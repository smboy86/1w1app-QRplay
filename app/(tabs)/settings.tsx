import { useCallback, useState } from "react";
import { useFocusEffect, useRouter } from "expo-router";
import {
  Alert,
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";

import { SERVICE_CONTACT_EMAIL } from "../../src/config/app-links";
import { useFloatingTabBarMetrics } from "../../src/features/floating-tab-bar/floating-tab-bar-context";
import { usePlaybackReturnSetting } from "../../src/features/settings/playback-return-setting-context";
import {
  DEFAULT_SCANNER_FACING,
  getDefaultScannerFacing,
  isDefaultCameraStorageAvailable,
  setDefaultScannerFacing,
} from "../../src/features/settings/default-camera-storage";
import type { ScannerFacing } from "../../src/features/scanner/scanner-types";

const appVersion = require("../../app.json").expo.version as string;
const contactMailUrl = `mailto:${SERVICE_CONTACT_EMAIL}?subject=${encodeURIComponent("QRPlay 문의")}&body=${encodeURIComponent(
  `앱 버전: ${appVersion}\n\n문의 내용을 입력해주세요.`,
)}`;

type SettingsRowProps = {
  label: string;
  value?: string;
  onPress?: () => void;
};

type SettingsSwitchRowProps = {
  currentValueLabel: string;
  description: string;
  disabled?: boolean;
  isEnabled: boolean;
  label: string;
  onValueChange: (nextValue: boolean) => void;
};

// 지원되는 외부 대상 화면을 열고 처리할 수 없으면 오류를 보여준다.
async function openExternalTarget(target: string) {
  try {
    await Linking.openURL(target);
  } catch {
    Alert.alert(
      "열 수 없습니다",
      "연결할 수 있는 앱 또는 화면을 찾지 못했습니다.",
    );
  }
}

// 세로 설정 목록 안의 단일 행을 렌더링한다.
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

// 탭 가능한 컨테이너와 현재 값 라벨을 갖춘 스위치형 설정 행을 렌더링한다.
function SettingsSwitchRow({
  currentValueLabel,
  description,
  disabled,
  isEnabled,
  label,
  onValueChange,
}: SettingsSwitchRowProps) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: isEnabled, disabled }}
      disabled={disabled}
      onPress={() => onValueChange(!isEnabled)}
      style={({ pressed }) => [
        styles.row,
        styles.switchRow,
        disabled ? styles.rowDisabled : undefined,
        pressed && !disabled ? styles.rowPressed : undefined,
      ]}
    >
      <View style={styles.switchLabelBlock}>
        <Text selectable style={styles.rowLabel}>
          {label}
        </Text>
        <Text selectable style={styles.rowCaption}>
          {description}
        </Text>
      </View>

      <View style={styles.rowRight}>
        <Text selectable style={styles.rowValue}>
          {currentValueLabel}
        </Text>
        <Switch
          disabled={disabled}
          ios_backgroundColor="#D8E1EA"
          onValueChange={onValueChange}
          trackColor={{
            false: "#D8E1EA",
            true: "#6FC58A",
          }}
          value={isEnabled}
        />
      </View>
    </Pressable>
  );
}

// 세 번째 탭용으로 재구성한 설정 홈 화면을 렌더링한다.
export default function SettingsScreen() {
  const router = useRouter();
  const { reservedBottomSpace } = useFloatingTabBarMetrics();
  const {
    isPlaybackReturnSettingAvailable,
    isPlaybackReturnSettingReady,
    isSavingPlaybackReturnSetting,
    shouldReturnAfterPlayback,
    updateShouldReturnAfterPlayback,
  } = usePlaybackReturnSetting();
  const isDefaultCameraStorageReady = isDefaultCameraStorageAvailable();
  const [defaultCameraFacing, setDefaultCameraFacingState] =
    useState<ScannerFacing>(DEFAULT_SCANNER_FACING);
  const [isSavingDefaultCameraFacing, setIsSavingDefaultCameraFacing] =
    useState(false);

  // 설정 탭이 활성화될 때마다 저장된 기본 카메라 방향을 새로 불러온다.
  useFocusEffect(
    useCallback(() => {
      let isActive = true;

      void (async () => {
        if (!isDefaultCameraStorageReady) {
          setDefaultCameraFacingState(DEFAULT_SCANNER_FACING);
          return;
        }

        const savedFacing = await getDefaultScannerFacing();

        if (!isActive) {
          return;
        }

        setDefaultCameraFacingState(savedFacing);
      })();

      return () => {
        isActive = false;
      };
    }, [isDefaultCameraStorageReady]),
  );

  // 설정 스위치를 바꿀 때 기본 스캐너 카메라를 갱신하고 저장한다.
  const handleDefaultCameraToggle = useCallback(
    async (isFrontCameraEnabled: boolean) => {
      const nextFacing: ScannerFacing = isFrontCameraEnabled ? "front" : "back";

      if (nextFacing === defaultCameraFacing) {
        return;
      }

      const previousFacing = defaultCameraFacing;
      setDefaultCameraFacingState(nextFacing);
      setIsSavingDefaultCameraFacing(true);

      try {
        await setDefaultScannerFacing(nextFacing);
      } catch {
        setDefaultCameraFacingState(previousFacing);
        Alert.alert(
          "저장할 수 없습니다",
          "기본 카메라 설정을 저장하지 못했습니다.",
        );
      } finally {
        setIsSavingDefaultCameraFacing(false);
      }
    },
    [defaultCameraFacing],
  );

  // 설정 스위치를 바꿀 때 영상 종료 후 복귀 동작을 갱신하고 저장한다.
  const handlePlaybackReturnToggle = useCallback(
    async (nextValue: boolean) => {
      if (nextValue === shouldReturnAfterPlayback) {
        return;
      }

      try {
        await updateShouldReturnAfterPlayback(nextValue);
      } catch {
        Alert.alert(
          "저장할 수 없습니다",
          "영상재생 후 돌아가기 설정을 저장하지 못했습니다.",
        );
      }
    },
    [shouldReturnAfterPlayback, updateShouldReturnAfterPlayback],
  );

  const isStorageWarningVisible =
    !isDefaultCameraStorageReady || !isPlaybackReturnSettingAvailable;

  return (
    <View style={styles.screen}>
      <View style={styles.backgroundOrbPrimary} />
      <View style={styles.backgroundOrbSecondary} />

      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={[
          styles.contentContainer,
          {
            paddingBottom: Math.max(42, reservedBottomSpace + 24),
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.introCard}>
          <View style={styles.iconShell}>
            <Image
              source={require("../../assets/icon.png")}
              style={styles.icon}
            />
          </View>

          <View style={styles.introTextBlock}>
            <Text selectable style={styles.eyebrow}>
              QRPlay
            </Text>
            <Text selectable style={styles.title}>
              앱 소개
            </Text>
            <Text selectable style={styles.description}>
              누구나 함께하는 QR플레이북
            </Text>
          </View>
        </View>

        <View style={styles.listCard}>
          <SettingsRow
            label="설정"
            onPress={() => {
              router.push("/settings-detail");
            }}
          />
          <View style={styles.divider} />
          <SettingsSwitchRow
            currentValueLabel={
              defaultCameraFacing === "front" ? "전면" : "후면"
            }
            description="전면 활성화 · 끄면 후면"
            disabled={
              isSavingDefaultCameraFacing || !isDefaultCameraStorageReady
            }
            isEnabled={defaultCameraFacing === "front"}
            label="기본 카메라 설정"
            onValueChange={(nextValue) => {
              void handleDefaultCameraToggle(nextValue);
            }}
          />
          <View style={styles.divider} />
          <SettingsSwitchRow
            currentValueLabel={shouldReturnAfterPlayback ? "자동" : "직접 선택"}
            description="활성화 시 재생이 끝나면 바로 이전 화면으로 돌아갑니다"
            disabled={
              isSavingPlaybackReturnSetting ||
              !isPlaybackReturnSettingReady ||
              !isPlaybackReturnSettingAvailable
            }
            isEnabled={shouldReturnAfterPlayback}
            label="영상재생 후 돌아가기"
            onValueChange={(nextValue) => {
              void handlePlaybackReturnToggle(nextValue);
            }}
          />
          {isStorageWarningVisible ? (
            <Text selectable style={[styles.rowCaption, styles.storageWarning]}>
              현재 설치된 안드로이드 앱에는 저장 모듈이 없어 재설치가
              필요합니다.
            </Text>
          ) : null}
          <View style={styles.divider} />
          <SettingsRow
            label="개인정보처리방침"
            onPress={() => {
              router.push("/privacy-policy-modal");
            }}
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
  switchRow: {
    minHeight: 88,
  },
  switchLabelBlock: {
    flex: 1,
    gap: 6,
    paddingRight: 12,
  },
  rowCaption: {
    color: "#7B8795",
    fontSize: 13,
    fontWeight: "600",
  },
  storageWarning: {
    paddingHorizontal: 22,
    paddingBottom: 18,
    color: "#8A5A00",
  },
  rowRight: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 10,
  },
  rowDisabled: {
    opacity: 0.72,
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
