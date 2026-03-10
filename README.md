# QRPlay

QRPlay은 Android 중심의 QR 기반 YouTube 단일 영상 재생 앱입니다.  
기본 사용자 흐름은 매우 단순합니다.

`QR 스캔 -> 재생 가능한 URL 해석 -> 영상 재생 -> 종료 후 이전 화면 복귀`

이 문서는 처음 프로젝트를 넘겨받은 사람이 개발, 로컬 실행, EAS 빌드/제출, Google Play 운영까지 한 번에 이해할 수 있도록 작성한 온보딩 문서입니다.  
현재 저장소 기준 핵심 정보는 아래와 같습니다.

- 앱 이름: `QRPlay`
- 앱 버전: `1.1.0`
- Android 패키지명: `com.naldaworks.qrplay`
- Expo 프로젝트 ID: `4ab16a78-ffe1-469c-b34c-1cc8c717bd46`
- 운영 기준 플랫폼: Android
- 화면 방향: 가로(`landscape`)

프로젝트를 처음 볼 때 가장 먼저 보면 좋은 파일은 아래와 같습니다.

- `App.tsx`: QR 스캔, URL 해석, 재생 진입의 메인 흐름
- `app/(tabs)/history.tsx`: 히스토리 목록과 히스토리 재생
- `src/features/player/player-screen.tsx`: 플레이어 화면(모달)
- `src/features/player/use-playback-input-resolver.tsx`: URL 해석 공통 로직
- `src/features/playback-history/playback-history-context.tsx`: 히스토리 상태 관리
- `src/features/playback-history/playback-history-storage.ts`: 히스토리 영속 저장
- `src/features/settings/default-camera-storage.ts`: 기본 카메라 설정 저장
- `app.json`: 앱 메타데이터, 패키지명, 권한, 버전
- `eas.json`: EAS Build / Submit 프로필

## 섹션1 - 개발 및 배포 방법

### 1. 소스 수정

이 프로젝트는 Expo Router 기반 React Native 앱이지만, 현재 운영 기준은 Android입니다.  
`package.json`에는 iOS 스크립트도 남아 있지만, 특별한 지시가 없는 한 Android만 고려해서 작업하면 됩니다.

먼저 개발 환경을 준비합니다.

- Node.js와 npm 설치
- Android Studio 설치
- Android SDK / 에뮬레이터 또는 실제 Android 기기 연결
- Expo 계정 로그인
- EAS CLI 사용 가능 상태 확인

가장 기본적인 시작 순서는 아래와 같습니다.

```bash
npm install
npm run typecheck
```

소스를 수정할 때는 아래 파일 기준으로 접근하면 이해가 빠릅니다.

- QR 스캔 메인 흐름 수정
  - `App.tsx`
- QR 입력값 해석 로직 수정
  - `src/features/player/use-playback-input-resolver.tsx`
  - `src/lib/extractYouTubeId.ts`
  - `src/lib/resolveRedirectUrl.ts`
  - `src/lib/resolveLandingPageYouTube.ts`
- 플레이어 UI / 동작 수정
  - `src/features/player/player-screen.tsx`
- 히스토리 목록 / 재생 / 저장 수정
  - `app/(tabs)/history.tsx`
  - `src/features/playback-history/playback-history-context.tsx`
  - `src/features/playback-history/playback-history-storage.ts`
- 기본 카메라 설정 수정
  - `app/(tabs)/settings.tsx`
  - `src/features/settings/default-camera-storage.ts`

버전 관리는 아래 파일을 함께 맞추는 것이 안전합니다.

- `package.json`
- `app.json`
- `package-lock.json`

중요한 점은 Android `versionCode`는 이 저장소에서 직접 숫자를 고정 관리하지 않고, `eas.json`의 `appVersionSource: "remote"`와 `build.production.autoIncrement: true`를 통해 EAS가 원격으로 증가시킨다는 점입니다.  
즉, 사람이 주로 관리하는 값은 `1.1.0` 같은 사용자 버전 문자열이고, Play Store에 필요한 내부 빌드 번호는 EAS가 자동 증가시킵니다.

수정 후 최소 확인 루틴은 아래 정도를 권장합니다.

```bash
npm run typecheck
```

필요하면 실제 Android 기기 또는 에뮬레이터에서 아래 항목을 수동 확인합니다.

- QR 스캔이 정상 동작하는지
- YouTube 단일 영상 URL/ID가 재생되는지
- 짧은 링크 / 리다이렉트 URL이 풀리는지
- 히스토리 저장과 재생이 정상인지
- 설정 화면에서 기본 카메라 저장이 되는지

### 2. 로컬빌드

이 프로젝트에서 “로컬빌드”는 크게 세 가지 상황으로 나뉩니다.

1. 개발 중 앱을 바로 실행해 보는 경우
2. 안드로이드 네이티브 프로젝트를 다시 동기화해야 하는 경우
3. 로컬에서 직접 APK를 만들어야 하는 경우

가장 일반적인 개발 실행 명령은 아래와 같습니다.

```bash
npm start
npm run android
```

각 명령의 의미는 아래와 같습니다.

- `npm start`
  - Expo 개발 서버를 띄웁니다.
- `npm run android`
  - Android 런타임으로 앱을 실행합니다.
- `npm run android:sync`
  - `expo prebuild --platform android --no-install`
  - 플러그인 설정이나 네이티브 설정이 달라졌을 때 Android 프로젝트 동기화 용도로 사용합니다.
- `npm run android:clean`
  - Android 로컬 빌드 캐시를 정리하고 다시 올릴 때 사용합니다.
- `npm run build:apk`
  - EAS Local Build를 이용해 로컬에서 APK를 생성합니다.

실무적으로는 아래처럼 기억하면 편합니다.

- UI/로직만 수정: `npm start` + `npm run android`
- 플러그인 / 권한 / 네이티브 설정 변경: `npm run android:sync`
- 로컬 Android 상태가 꼬였을 때: `npm run android:clean`
- 기기 공유용 APK가 필요할 때: `npm run build:apk`

주의할 점도 있습니다.

- `build:apk`는 로컬 배포나 내부 확인용 성격이 강합니다.
- Google Play 업로드용 산출물은 일반적으로 `AAB`가 기준이므로, 실제 스토어 배포는 EAS의 `production` 프로필을 사용하세요.
- 저장소에는 `EXPO_PUBLIC_ENABLE_ANDROID_NATIVE_SCANNER` 플래그가 존재합니다. 값이 `1`이면 Android 네이티브 스캐너 뷰를 사용하고, 아니면 `expo-camera` 기반 경로를 사용합니다.

즉, 로컬에서 스캐너 동작이 달라 보이면 아래 환경 변수 유무를 먼저 확인하는 것이 좋습니다.

```bash
EXPO_PUBLIC_ENABLE_ANDROID_NATIVE_SCANNER=1 npm run android
```

### 3. eas 빌드 제출

이 항목은 “EAS Build에 Android 스토어용 빌드를 올리는 단계”를 뜻합니다.  
아직 Play Console 제출 자체는 아니고, 제출 가능한 `AAB`를 Expo 서버에서 만드는 과정입니다.

먼저 현재 설정을 이해해야 합니다.

- `eas.json`의 `production` 프로필은 스토어용 빌드입니다.
- `production-apk` 프로필은 APK 기반 내부 배포용입니다.
- `appVersionSource: "remote"`라서 Android `versionCode`는 EAS가 원격 관리합니다.
- `autoIncrement: true`라서 `production` 빌드 시 `versionCode`가 자동으로 증가합니다.

빌드 전 확인할 것:

- `eas whoami`로 Expo 로그인 상태 확인
- `app.json`의 버전 문자열 확인
- 로컬 변경사항이 의도된 상태인지 확인
- 필요 시 `npm run typecheck`

스토어용 Android AAB 빌드는 아래 명령을 사용합니다.

```bash
npm run build:aab
```

직접 명령을 쓰면 아래와 같습니다.

```bash
npx eas build --platform android --profile production
```

빌드가 시작되면 보통 아래 순서로 진행됩니다.

1. EAS가 `versionCode`를 자동 증가
2. 원격 Android credentials / keystore 확인
3. 프로젝트 압축 및 업로드
4. Expo 서버에서 Android AAB 빌드
5. 빌드 성공 후 Expo 대시보드에서 아티팩트 확인

빌드 상태를 확인할 때 자주 쓰는 명령:

```bash
eas build:list --platform android
```

빌드가 성공하면 Expo 대시보드에서 `.aab` 아티팩트를 확인할 수 있습니다.  
이 산출물이 있어야 다음 단계인 `submit`으로 넘어갈 수 있습니다.

### 4. 서브및

이 섹션 제목은 요청사항에 맞춰 그대로 유지합니다.  
실제로는 `EAS Submit` 단계, 즉 “완성된 Android 스토어 빌드를 Google Play에 업로드하는 단계”라고 이해하면 됩니다.

현재 저장소 설정 기준 submit 프로필은 아래처럼 동작합니다.

- 프로필: `submit.production`
- 플랫폼: Android
- 제출 트랙: `internal`
- 릴리스 상태: `completed`

즉, 기본 동작은 Google Play 내부 테스트 트랙으로 업로드하는 흐름입니다.

이미 빌드가 끝난 상태라면 아래 명령으로 최신 production 빌드를 제출할 수 있습니다.

```bash
npm run submit:android
```

직접 명령을 쓰면 아래와 같습니다.

```bash
npx eas submit --platform android --profile production --latest
```

빌드와 제출을 한 번에 처리하려면 아래 명령을 사용합니다.

```bash
npm run release:android
```

직접 명령은 아래와 같습니다.

```bash
npx eas build --platform android --profile production --auto-submit
```

실제 submit 단계에서 필요한 것은 아래입니다.

- Google Play Console 앱 생성
- Android 패키지명 일치
- 서비스 계정 키 연결
- Expo 서버에 submit 권한 연결
- 제출 가능한 production 빌드 존재

한 번 연결이 끝나면 submit 시 보통 아래 흐름을 따릅니다.

1. 사용할 Google Service Account 선택
2. 빌드 선택 또는 `--latest`로 최신 production 빌드 지정
3. internal 트랙 업로드 예약
4. 빌드 완료 후 자동 제출 또는 즉시 제출
5. Play Console 내부 테스트 트랙에서 릴리스 확인

자주 헷갈리는 포인트는 아래입니다.

- APK는 스토어 제출용 기본 산출물로 보기 어렵습니다. 스토어용은 `production` AAB를 기준으로 생각하세요.
- submit은 빌드만으로 끝나지 않습니다. Play Console 설정과 서비스 계정 연동이 되어 있어야 합니다.
- very first upload 상황에서는 Google Play 정책/연동 상태에 따라 수동 업로드가 필요할 수 있습니다.

제출 상태를 추적할 때는 Expo 대시보드 링크를 가장 먼저 보는 것이 빠릅니다.  
CLI로도 조회할 수 있지만, 실제로는 웹 대시보드가 빌드/제출 연결 관계를 보기 편합니다.

### 5. 구글스토어 설정

이 프로젝트를 Google Play에 올리기 위해 실제로 준비해야 하는 항목을 정리하면 아래와 같습니다.

#### 앱 기본 설정

- Play Console에서 앱 생성
- 패키지명 확인: `com.naldaworks.qrplay`
- 앱 이름 확인: `QRPlay`
- 카테고리 / 앱 설명 / 연락처 정보 입력

#### 내부 테스트 트랙

현재 `eas.json`은 `internal` 트랙 제출을 기준으로 잡혀 있습니다.  
처음에는 production 직행보다 internal 테스트 트랙으로 검증하는 것이 안전합니다.

권장 순서는 아래입니다.

1. internal 트랙으로 업로드
2. 테스터 계정 추가
3. 실제 기기에서 설치 / QR 스캔 / 재생 / 히스토리 확인
4. 문제가 없으면 이후 closed / production 확장 검토

#### 서비스 계정 및 API 연동

Google Play API 연동을 위해 서비스 계정이 필요합니다.

- Google Cloud 서비스 계정 생성
- JSON 키 발급
- Play Console API 액세스 연결
- 해당 서비스 계정에 앱 관리 권한 부여
- `eas credentials` 또는 Expo 서버 기준 submit 자격 증명 연결

이 작업이 끝나야 `eas submit`이 Play Console에 자동으로 올릴 수 있습니다.

#### 스토어 등록정보 자료 위치

이 저장소에는 Google Play 등록용 자료가 이미 어느 정도 정리돼 있습니다.

- 스토어 설명 초안
  - `docs/play-store/store-listing-ko.md`
- 앱 아이콘
  - `docs/play-store/assets/app-icon-512.png`
- 피처 그래픽
  - `docs/play-store/assets/feature-graphic-1024x500.png`
- 휴대전화 / 태블릿 스크린샷
  - `docs/play-store/assets/phone/*`
  - `docs/play-store/assets/tablet-7/*`
  - `docs/play-store/assets/tablet-10/*`

즉, 스토어 등록정보를 수정해야 할 때는 먼저 `docs/play-store/store-listing-ko.md`를 보고, 이미지가 바뀌면 해당 `assets` 폴더를 함께 갱신하면 됩니다.

#### 개인정보처리방침 및 문의

스토어 등록 시 필요한 정보도 프로젝트에 반영되어 있습니다.

- 개인정보처리방침 URL
  - `https://smboy86.github.io/1w1app-QRplay/privacy-policy/`
- 문의 이메일
  - `smboy86@naver.com`

설정 화면과 개인정보처리방침 모달도 이 정보를 기준으로 동작합니다.

#### 운영 체크리스트

스토어 배포 전 마지막 확인용 체크리스트입니다.

- 앱 버전(`app.json`)이 올바른지
- production AAB 빌드가 성공했는지
- internal 트랙 submit이 성공했는지
- Play Console 테스터 설치가 되는지
- 카메라 권한과 QR 스캔이 정상인지
- YouTube 단일 영상 재생이 정상인지
- 히스토리 저장 / 재생이 정상인지
- 개인정보처리방침 링크가 열리는지

## 섹션2 - 개발 스택 및 주요기능

### 1. QR코드 리드 및 URL 분석 후 재생

이 프로젝트의 핵심 기능은 “QR 코드에서 읽은 값을 최종적으로 재생 가능한 단일 YouTube 영상으로 바꾸는 것”입니다.  
단순히 QR 문자열을 읽는 앱이 아니라, URL 해석과 검증, 재생 정책이 함께 들어 있는 플레이어 앱입니다.

#### 사용 스택

- `Expo`
- `React Native`
- `Expo Router`
- `expo-camera`
- `react-native-webview`
- `YouTube IFrame Player API`
- TypeScript

#### 실제 동작 흐름

1. 스캐너 화면에서 QR 코드 인식
2. 읽은 문자열을 URL 또는 YouTube ID 형태로 정규화
3. 직접 YouTube 단일 영상인지 먼저 판별
4. 직접 재생 불가면 최종 리다이렉트 URL 해석
5. 여전히 비 YouTube면 지원 랜딩 페이지(`site.naver.com`) 파싱 시도
6. 필요한 경우 숨은 WebView로 리다이렉트 추적
7. 최종적으로 단일 YouTube 영상 ID를 얻으면 플레이어 열기
8. 플레이어 종료 / 오류 시 이전 화면으로 복귀

즉, 이 앱의 핵심은 아래 두 가지입니다.

- “YouTube 단일 영상인지 엄격하게 판별”
- “짧은 링크 / 랜딩 페이지 / 리다이렉트까지 포함해 재생 가능한 URL을 최대한 찾아냄”

#### 어떤 입력을 지원하는가

직접 파싱 가능한 입력 예시는 아래와 같습니다.

- 11자리 YouTube 영상 ID
- `youtu.be/{id}`
- `youtube.com/watch?v={id}`
- `youtube.com/embed/{id}`
- `youtube.com/shorts/{id}`

반대로 아래 형태는 원칙적으로 지원 대상이 아닙니다.

- 재생목록
- 채널
- 검색 결과
- 단일 영상이 아닌 URL
- 임베드가 차단된 영상

#### 기술적으로 중요한 포인트

이 프로젝트는 단순한 `camera -> webview` 조합이 아닙니다.  
가운데 URL 해석 계층이 하나 더 있습니다.

- `src/lib/extractYouTubeId.ts`
  - 단일 YouTube 영상 여부 판별
- `src/lib/resolveRedirectUrl.ts`
  - 짧은 링크 / 리다이렉트 URL의 최종 주소 해석
- `src/lib/resolveLandingPageYouTube.ts`
  - `site.naver.com` 랜딩 페이지 내부에서 YouTube 영상 정보 추출
- `src/features/player/use-playback-input-resolver.tsx`
  - 위 로직들을 묶어서 실제 재생 가능한 입력으로 정리하는 공통 훅

이 공통 훅은 스캐너 화면과 히스토리 화면이 함께 사용합니다.  
즉, “처음 QR을 읽었을 때의 해석 방식”과 “히스토리에서 다시 눌렀을 때의 해석 방식”이 분리되지 않고 같은 로직을 공유합니다.

#### 플레이어 구조

플레이어는 `react-native-webview` 안에 YouTube IFrame Player를 올려서 제어합니다.

- 재생
- 일시정지
- 종료
- 종료 감지
- 오류 감지

또한 현재 구조에서는 플레이어가 모달 형태로 뜨기 때문에, 히스토리 화면에서 재생해도 사용자가 보고 있던 리스트 위치가 유지됩니다.

관련 파일:

- `src/features/player/player-screen.tsx`
- `src/lib/buildYoutubeHtml.ts`
- `src/lib/mapYouTubeError.ts`
- `src/lib/types.ts`

### 2. 히스토리 기능 (영속적인 데이터 저장 및 관리)

히스토리 기능은 단순 UI가 아니라 “앱을 껐다 켜도 남아 있는 영속 데이터”입니다.  
즉, 사용자가 어떤 QR을 성공 또는 실패로 재생했는지, 몇 번 실행했는지를 AsyncStorage에 저장하고 다시 복원합니다.

#### 사용 스택

- `@react-native-async-storage/async-storage`
- React Context
- Expo Router 탭 구조

#### 저장되는 정보

히스토리 엔트리에는 아래 값이 들어갑니다.

- `id`
- `sourceUrl`
- `resolvedUrl`
- `lastStatus`
- `playCount`
- `updatedAt`

이 구조 덕분에 아래가 가능합니다.

- 원래 스캔한 QR 주소 유지
- 실제로 재생된 최종 주소 기록
- 성공 / 실패 상태 표시
- 재생 횟수 누적
- 최근 사용 시각 기준 정렬

#### 동작 방식

1. 앱 시작 시 저장된 히스토리 복원
2. QR 스캔 또는 재생 실패/성공 시 히스토리 업데이트
3. 메모리 상태 변경 시 AsyncStorage에 재저장
4. 히스토리 탭에서 목록으로 표시
5. 히스토리 항목 터치 시 현재 화면 위에서 같은 플레이어로 재생

특히 최근 변경으로 히스토리 화면에서 재생할 때는 스캔 탭으로 이동하지 않고, 현재 화면 위에 플레이어 모달이 열리도록 바뀌었습니다.  
그래서 사용자가 길게 스크롤한 상태에서도 재생 후 같은 위치로 돌아오기가 쉽습니다.

#### 관련 파일 역할

- `src/features/playback-history/playback-history-storage.ts`
  - AsyncStorage 읽기 / 쓰기
- `src/features/playback-history/playback-history-context.tsx`
  - 히스토리 상태, 갱신, replay 관련 공통 API
- `app/(tabs)/history.tsx`
  - 히스토리 UI, 재생 진입
- `app/_layout.tsx`
  - `PlaybackHistoryProvider` 주입

#### 기본 카메라 설정도 같은 방식으로 저장됨

히스토리와 별개로 설정 화면의 “기본 카메라 설정”도 AsyncStorage에 저장됩니다.

- 기본값은 전면 카메라
- 사용자가 전면 / 후면을 바꾸면 다음 실행에도 유지
- 저장 모듈이 없는 바이너리에서는 경고를 띄우고 저장을 막음

관련 파일:

- `src/features/settings/default-camera-storage.ts`
- `app/(tabs)/settings.tsx`

즉, 이 프로젝트의 영속 저장은 크게 두 축으로 보면 됩니다.

- 히스토리 데이터 저장
- 기본 카메라 설정 저장

둘 다 AsyncStorage 기반이며, 앱을 다시 실행해도 유지되는 사용자 경험을 만드는 핵심 요소입니다.
