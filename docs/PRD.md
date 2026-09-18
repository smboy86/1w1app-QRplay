# QRPlay Android PRD

## 1. Goal
- Build an Android-focused QR YouTube player with the fixed flow:
  - `QR scan -> resolve one playable video -> play -> return to scanner on end/error`
- Keep the existing direct YouTube and redirect handling intact.
- Add support for supported landing pages that contain a YouTube target without redirecting.

## 2. Scope
### In Scope
- Android QR scanner with camera permission handling
- Direct single-video YouTube URL/ID parsing
- Redirect resolution for QR destinations that bounce to a final URL
- `site.naver.com` landing-page HTML parsing when the page itself contains the YouTube target
- Single-video playback via `react-native-webview` + YouTube IFrame API
- Session-only playback history for original and resolved URLs

### Out of Scope
- iOS-specific implementation changes
- Generic web scraping for arbitrary domains
- Playlist/channel/search browsing
- Candidate selection UI when multiple videos are present
- Backend content mapping or remote storage

## 3. Functional Requirements
- FR-1: Scanner mode reads QR codes only and prevents duplicate scans while resolving.
- FR-2: Accept direct single-video YouTube inputs:
  - Raw 11-char video ID
  - `youtu.be/{id}`
  - `youtube.com/watch?v={id}`
  - `youtube.com/embed/{id}`
  - `youtube.com/shorts/{id}`
- FR-3: If the scanned URL is not directly playable, resolve its final URL using existing redirect logic.
- FR-4: If the resolved URL still points to `site.naver.com`, fetch the landing-page HTML and parse `__NEXT_DATA__`.
- FR-5: Walk all string fields inside `__NEXT_DATA__` recursively.
- FR-6: Treat `videoVid` as the strongest signal and convert it to a canonical YouTube watch URL.
- FR-7: If no valid `videoVid` exists, inspect embedded YouTube URLs and allow playback only when they resolve to exactly one unique video ID.
- FR-8: If multiple unique YouTube video IDs are found, reject the QR and show a single-video-only message.
- FR-9: If no playable YouTube target is found in the page, reject the QR with an unsupported-page message.
- FR-10: If HTML fetch fails, show the existing network error message.
- FR-11: Supported landing-page parsing must skip the hidden redirect `WebView` probe.

## 4. Technical Design
- Scanner resolution order:
  - Direct YouTube parse
  - Redirect resolution
  - Supported landing-page parse
  - Existing player entry
- Internal contract:
  - `resolveLandingPageYouTube(url)` -> `{ ok: true, youtubeUrl, videoId } | { ok: false, reason }`
  - `reason` in `"UNSUPPORTED_HOST" | "NETWORK" | "INVALID_HTML" | "NOT_FOUND" | "MULTIPLE"`
- History behavior:
  - `sourceUrl` keeps the original scanned landing-page URL
  - `resolvedUrl` stores the extracted playable YouTube URL
- WebView player bridge remains unchanged:
  - `ready`, `playing`, `paused`, `ended`, `autoplayBlocked`, `error`, `state`

## 5. Error Handling And Validation
- Camera permission denied:
  - Show permission helper UI with retry
- QR input that cannot be interpreted as a URL or playable video ID:
  - Show `재생할 수 없는 QR코드 입니다`
- QR input that can be interpreted as a URL/domain but is not currently supported:
  - Show `현재 앱 내에서 지원하지 않는 QR코드 출처로 확인되었습니다. 매니저에게 해당 내용을 전달하고, 빠르게 지원할 수 있도록 최선을 다하겠습니다. 사용해주셔서 감사합니다`
- Unsupported-source reporting by email:
  - Show the unsupported-source alert and then fire-and-forget a report to the Google Apps Script endpoint
  - Do not expose report delivery success or failure in the app UI
- YouTube embed blocked or playback failure:
  - Keep existing playback error handling

## 6. Test Plan
- Static verification:
  - `npm run typecheck`
- Android manual verification:
  - Existing direct YouTube QR still plays
  - Redirect-based QR still resolves and plays
  - `https://m.site.naver.com/1QyHZ` resolves to video `oS4Rm61pJ9k`
  - Unparseable QR input shows the unplayable-QR alert
  - Unsupported URL/domain QR shows the unsupported-source alert
  - Unsupported URL/domain QR sends a best-effort report without blocking the alert flow
  - History replay re-resolves the original landing-page URL and plays the same video
