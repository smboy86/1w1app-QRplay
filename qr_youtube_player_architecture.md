
# QRSchool / QRPlay
## QR 기반 유튜브 단일 영상 플레이어 앱 설계 문서

---

# 1. 프로젝트 개요

본 앱은 **QR 코드를 통해 유튜브 영상을 재생하는 유아용 콘텐츠 플레이어**이다.

기본 흐름

```
QR 스캔 → 영상 1개 재생 → 영상 종료 → 다시 QR 스캔
```

목표

- 아이가 다른 콘텐츠로 이동하지 못하도록 제한
- QR 기반 교재 / 콘텐츠 연동
- 단순하고 반복 가능한 UX
- 보호자 및 교육 환경에 적합한 인터페이스

---

# 2. 주요 UX 흐름

1. 앱 실행
2. QR 코드 스캔 화면 표시
3. QR 코드 인식
4. 유튜브 영상 1개 재생
5. 재생 종료 또는 종료 버튼
6. 자동으로 QR 스캔 화면 복귀

UX 핵심 원칙

- **1 QR = 1 콘텐츠**
- 영상 종료 후 **자동 스캐너 복귀**
- **불필요한 플레이어 기능 최소화**

---

# 3. 주요 기능

## QR 스캔 기능

- 카메라로 QR 코드 인식
- QR 데이터 파싱
- 유효한 콘텐츠인지 검증

사용 모듈

```
expo-camera
```

---

## 영상 재생 기능

- 유튜브 영상 **1개만 재생**
- 자동 재생 시도
- 영상 종료 이벤트 감지

사용 기술

```
YouTube IFrame Player API
react-native-webview
```

---

## 제어 기능

앱에서 제공하는 기능

- 재생
- 일시정지
- 종료

YouTube 기본 UI

- 대부분 숨김 처리

---

# 4. 기술 스택

## Framework

```
React Native
Expo
```

## 주요 라이브러리

```
expo-camera
react-native-webview
```

## 플레이어

```
YouTube IFrame Player API
```

---

# 5. 시스템 구조

앱 상태 구조

```
scanner
playerLoading
playing
paused
error
```

앱 모드

```
Scanner Mode
QR 코드 인식

Player Mode
WebView 내부 유튜브 플레이어
```

구조 다이어그램

```
QR Scan
   ↓
영상 ID 추출
   ↓
YouTube Player 로드
   ↓
영상 재생
   ↓
영상 종료
   ↓
Scanner 모드 복귀
```

---

# 6. QR 데이터 구조

권장 방식

```
QR → 내부 콘텐츠 ID
```

예시

```
kidqr://content/animal001
```

서버 응답

```json
{
  "videoId": "youtubeVideoId",
  "embeddable": true,
  "madeForKids": true
}
```

장점

- 유튜브 링크 직접 노출 방지
- 콘텐츠 검증 가능
- 서버 기반 콘텐츠 제어 가능

---

# 7. 플레이어 정책

YouTube Player 파라미터

```
controls=0
disablekb=1
fs=0
rel=0
playsinline=1
enablejsapi=1
iv_load_policy=3
```

종료 처리

```
영상 종료 → Scanner Mode 복귀
```

주의 사항

- 플레이어 위 overlay 사용 금지
- YouTube 정책 준수

---

# 8. 주요 Expo 모듈

## expo-camera

기능

- QR 코드 스캔

---

## react-native-webview

기능

- 유튜브 플레이어 임베드

---

## WebView Bridge

React Native ↔ WebView 메시지 통신

```
window.ReactNativeWebView.postMessage()
```

---

# 9. 오류 처리

YouTube 오류 코드

```
100  : 삭제된 영상
101  : 임베드 금지
150  : 임베드 금지
153  : Referer 문제
5    : HTML5 오류
```

오류 발생 시 처리

```
영상 종료
Scanner 모드 복귀
```

---

# 10. 앱 네이밍

추천 이름

```
QRSchool
QRPlay
QRKids
```

유아용 서비스 추천

```
QRPlay
```

---

# 11. AI 코딩 에이전트 구현 목표

AI 에이전트가 구현해야 할 기능

1. Expo 프로젝트 생성
2. QR 스캐너 구현
3. YouTube 플레이어 WebView 구현
4. 영상 종료 이벤트 처리
5. Scanner 모드 자동 복귀
6. 기본 플레이어 UI 최소화
7. 오류 처리 로직 구현

---

# 12. 목표 앱 동작

최종 동작

```
앱 실행
↓
QR 스캔
↓
영상 재생
↓
영상 종료
↓
자동 QR 스캔 복귀
```

핵심 원칙

```
한 번에 하나의 영상
QR 기반 콘텐츠 접근
단순한 UX
아이 친화적 인터페이스
```

