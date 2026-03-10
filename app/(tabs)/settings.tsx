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
import {
  DEFAULT_SCANNER_FACING,
  getDefaultScannerFacing,
  isDefaultCameraStorageAvailable,
  setDefaultScannerFacing,
} from "../../src/features/settings/default-camera-storage";
import type { ScannerFacing } from "../../src/features/scanner/scanner-types";

const appVersion = require("../../app.json").expo.version as string;
const contactMailUrl =
  `mailto:${SERVICE_CONTACT_EMAIL}?subject=${encodeURIComponent("QRPlay 문의")}&body=${encodeURIComponent(
    `앱 버전: ${appVersion}\n\n문의 내용을 입력해주세요.`,
  )}`;

type SettingsRowProps = {
  label: string;
  value?: string;
  onPress?: () => void;
};

type SettingsSwitchRowProps = {
  currentValueLabel: string;
  disabled?: boolean;
  isEnabled: boolean;
  label: string;
  onValueChange: (nextValue: boolean) => void;
};

// Opens a supported external target and shows an error if it cannot be handled.
async function openExternalTarget(target: string) {
  try {
    await Linking.openURL(target);
  } catch {
    Alert.alert("열 수 없습니다", "연결할 수 있는 앱 또는 화면을 찾지 못했습니다.");
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

// Renders a switch-based settings row with a tappable container and current value label.
function SettingsSwitchRow({
  currentValueLabel,
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
          전면 활성화 · 끄면 후면
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

// Renders the redesigned settings home screen for the third tab.
export default function SettingsScreen() {
  const router = useRouter();
  const { reservedBottomSpace } = useFloatingTabBarMetrics();
  const isDefaultCameraStorageReady = isDefaultCameraStorageAvailable();
  const [defaultCameraFacing, setDefaultCameraFacingState] =
    useState<ScannerFacing>(DEFAULT_SCANNER_FACING);
  const [isSavingDefaultCameraFacing, setIsSavingDefaultCameraFacing] =
    useState(false);

  // Refreshes the saved default camera facing whenever the settings tab becomes active.
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

  // Updates and persists the default scanner camera when the settings switch is toggled.
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
        Alert.alert("저장할 수 없습니다", "기본 카메라 설정을 저장하지 못했습니다.");
      } finally {
        setIsSavingDefaultCameraFacing(false);
      }
    },
    [defaultCameraFacing],
  );

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
          <SettingsRow
            label="설정"
            onPress={() => {
              router.push("/settings-detail");
            }}
          />
          <View style={styles.divider} />
          <SettingsSwitchRow
            currentValueLabel={defaultCameraFacing === "front" ? "전면" : "후면"}
            disabled={
              isSavingDefaultCameraFacing || !isDefaultCameraStorageReady
            }
            isEnabled={defaultCameraFacing === "front"}
            label="기본 카메라 설정"
            onValueChange={(nextValue) => {
              void handleDefaultCameraToggle(nextValue);
            }}
          />
          {!isDefaultCameraStorageReady ? (
            <Text selectable style={[styles.rowCaption, styles.storageWarning]}>
              현재 설치된 안드로이드 앱에는 저장 모듈이 없어 재설치가 필요합니다.
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
