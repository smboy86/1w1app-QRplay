# QRPlay MVP PRD

## 1. Goal
- Build a child-safe QR YouTube player with the fixed flow:
  - `QR scan -> play one video -> return to scanner on end/error`
- Target framework:
  - React Native + Expo SDK 55 (`blank-typescript`)
- Target platforms:
  - iOS + Android (same feature scope)

## 2. Scope
### In Scope (MVP)
- QR scanner with camera permission handling
- Parse direct YouTube URL/ID
- Allow only single-video URL/ID formats
- Play video via WebView + YouTube IFrame API
- Minimal controls: play/pause and exit
- Return to scanner on video end/error
- Unit tests for parser and error mapping

### Out of Scope (MVP)
- Backend content mapping (`kidqr://...` lookup API)
- Playlist/channel/search browsing
- Admin CMS, account/login
- Background/offline playback

## 3. Functional Requirements
- FR-1: Show camera permission request when not granted.
- FR-2: Scanner mode reads only QR.
- FR-3: Parse only single YouTube video IDs.
- FR-4: Allowed formats:
  - Raw 11-char video ID
  - `youtu.be/{id}`
  - `youtube.com/watch?v={id}`
  - `youtube.com/embed/{id}`
  - `youtube.com/shorts/{id}`
- FR-5: Reject non-single-video URLs (playlist/channel/search/live page) and return to scanner.
- FR-6: Player built on `react-native-webview` + YouTube IFrame API.
- FR-7: On `ENDED`, unmount player and return to scanner immediately.
- FR-8: Provide only play/pause and exit controls.
- FR-9: Map YouTube errors (5/100/101/150/153) to user-facing messages.

## 4. Non-Functional Requirements
- NFR-1: Prevent duplicate scan triggers by lock.
- NFR-2: Minimize YouTube UI with player params:
  - `controls=0`, `disablekb=1`, `fs=0`, `rel=0`, `playsinline=1`, `enablejsapi=1`, `iv_load_policy=3`
- NFR-3: Reset WebView by changing `key` each session.
- NFR-4: Provide clear offline/network failure message.

## 5. State Model
- `scanner`
- `playerLoading`
- `playing`
- `paused`
- `blocked` (autoplay blocked)
- `error` (show message, then scanner)

## 6. Technical Design
### Files
- `App.tsx`
- `src/lib/types.ts`
- `src/lib/extractYouTubeId.ts`
- `src/lib/buildYoutubeHtml.ts`
- `src/lib/mapYouTubeError.ts`
- `src/lib/extractYouTubeId.test.ts`
- `src/lib/mapYouTubeError.test.ts`

### Contracts
- `ExtractResult`:
  - `{ ok: true, videoId }`
  - `{ ok: false, reason: "NOT_YOUTUBE" | "NOT_SINGLE_VIDEO" | "INVALID_ID" }`
- WebView bridge message types:
  - `ready`, `playing`, `paused`, `ended`, `autoplayBlocked`, `error`, `state`

## 7. Error Handling
- Camera permission denied:
  - show permission helper UI + retry button
- Unsupported QR data:
  - show validation alert + keep scanner active
- YouTube embed blocked (101/150):
  - show error + return to scanner
- Network unstable/offline:
  - show network error + return to scanner

## 8. Test Plan
### Unit Tests
- `extractYouTubeId`
  - valid IDs/URLs
  - invalid domain
  - playlist/channel/search/live page rejection
- `mapYouTubeError`
  - known code mapping
  - fallback message

### Manual Tests (iOS/Android)
- first-launch permission denied/allow flow
- normal scan -> play -> ended -> scanner
- pause/resume/exit controls
- embed-disabled video handling
- duplicate scan prevention
- offline playback failure handling

## 9. Definition of Done
- Single-video QR always plays.
- Non-single-video URL never plays.
- Ended event returns to scanner quickly (target within ~1s perceived).
- iOS/Android both pass manual checklist.
- Unit tests pass.
- This PRD and implementation stay aligned.
