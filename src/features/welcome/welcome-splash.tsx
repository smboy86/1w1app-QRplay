import { useEffect, useRef, useState } from "react";
import { Animated, Image, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import * as SplashScreen from "expo-splash-screen";

// 시작 이미지를 준비한 뒤 캐릭터와 환영 문구를 움직이고 앱으로 전환한다.
export function WelcomeSplash({ onComplete }: { onComplete: () => void }) {
  const { height } = useWindowDimensions();
  const [backgroundReady, setBackgroundReady] = useState(false);
  const [mascotReady, setMascotReady] = useState(false);
  const sway = useRef(new Animated.Value(0)).current;
  const greeting = useRef(new Animated.Value(0)).current;
  const welcome = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!backgroundReady || !mascotReady) return;
    void SplashScreen.hideAsync().catch(() => {});
    const animation = Animated.sequence([
      Animated.parallel([
        Animated.sequence([
          Animated.timing(sway, { toValue: -1, duration: 300, useNativeDriver: true }),
          Animated.timing(sway, { toValue: 1, duration: 500, useNativeDriver: true }),
          Animated.timing(sway, { toValue: -0.7, duration: 450, useNativeDriver: true }),
          Animated.timing(sway, { toValue: 0, duration: 350, useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.timing(greeting, { toValue: 1, duration: 450, useNativeDriver: true }),
          Animated.timing(welcome, { toValue: 1, duration: 650, useNativeDriver: true }),
        ]),
      ]),
      // 캐릭터 움직임 1.6초 + 문구 유지 1.65초 + 퇴장 0.25초로 총 3.5초를 표시한다.
      Animated.delay(1650),
      Animated.timing(opacity, { toValue: 0, duration: 250, useNativeDriver: true }),
    ]);
    animation.start(({ finished }) => { if (finished) onComplete(); });
    return () => animation.stop();
  }, [backgroundReady, mascotReady, sway, greeting, welcome, opacity, onComplete]);

  return (
    <View style={styles.screen}>
      <Animated.View style={[styles.content, { opacity }]}>
        <Image source={require("../../../assets/welcome-background.png")} style={StyleSheet.absoluteFill} resizeMode="cover" onLoad={() => setBackgroundReady(true)} onError={() => setBackgroundReady(true)} />
        <Animated.Image
          source={require("../../../assets/welcome-mascot.png")}
          resizeMode="contain"
          onLoad={() => setMascotReady(true)}
          onError={() => setMascotReady(true)}
          style={{ width: height * 0.58, height: height * 0.58, transform: [
            { rotate: sway.interpolate({ inputRange: [-1, 1], outputRange: ["-4deg", "4deg"] }) },
            { translateY: sway.interpolate({ inputRange: [-1, 0, 1], outputRange: [-5, 0, -5] }) },
          ] }}
        />
        <Animated.View style={{ opacity: greeting }}><Text style={[styles.greeting, { fontSize: Math.min(28, height * 0.065) }]}>안녕하세요,</Text></Animated.View>
        <Animated.View style={{ opacity: welcome, transform: [{ translateY: welcome.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }] }}>
          <Text style={[styles.welcome, { fontSize: Math.min(26, height * 0.06) }]}>큐알플레이에 오신것을 환영합니다</Text>
        </Animated.View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#D9EAFB" },
  content: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 24 },
  greeting: { color: "#102C72", fontWeight: "800", textAlign: "center", marginTop: 4 },
  welcome: { color: "#102C72", fontWeight: "700", textAlign: "center", marginTop: 4 },
});
