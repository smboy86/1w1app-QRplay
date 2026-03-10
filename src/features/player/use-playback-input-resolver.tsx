import React, { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet } from "react-native";
import { WebView } from "react-native-webview";

import {
  extractYouTubeId,
  mapExtractReasonToMessage,
} from "../../lib/extractYouTubeId";
import { NETWORK_ERROR_MESSAGE } from "../../lib/mapYouTubeError";
import {
  isSupportedLandingPageHost,
  mapLandingPageResolveReasonToMessage,
  resolveLandingPageYouTube,
} from "../../lib/resolveLandingPageYouTube";
import { resolveFinalUrl } from "../../lib/resolveRedirectUrl";

const REDIRECT_WEBVIEW_TIMEOUT_MS = 9000;

type RedirectProbeState = {
  key: number;
  sourceUrl: string;
  sourceHost: string | null;
};

export type ResolvedPlaybackInputResult =
  | { ok: true; sourceUrl: string; finalUrl: string; videoId: string }
  | {
      ok: false;
      sourceUrl: string;
      finalUrl: string | null;
      title: string;
      message: string;
    };

// 입력 문자열을 재생 가능한 URL 형태로 정규화한다.
function normalizeScannedInput(input: string) {
  const trimmed = input.trim();
  if (!trimmed) return trimmed;

  if (/^[a-z][a-z\d+\-.]*:\/\//i.test(trimmed)) {
    return trimmed;
  }

  if (/^[\w.-]+\.[a-z]{2,}(?::\d+)?(?:[/?#].*)?$/i.test(trimmed)) {
    return `https://${trimmed}`;
  }

  return trimmed;
}

// 호스트 비교를 위해 모바일/WWW 접두사를 제거한 소문자 호스트를 만든다.
function normalizeHost(hostname: string) {
  return hostname.toLowerCase().replace(/^www\./, "").replace(/^m\./, "");
}

// URL 문자열에서 비교용 호스트를 안전하게 추출한다.
function getHostFromUrl(raw: string) {
  try {
    return normalizeHost(new URL(raw).hostname);
  } catch {
    return null;
  }
}

// 문자열이 HTTP 또는 HTTPS URL인지 판별한다.
function isHttpSchemeUrl(raw: string) {
  return /^https?:\/\//i.test(raw);
}

// intent URL에서 브라우저 대체 URL을 추출한다.
function getIntentFallbackUrl(raw: string) {
  const match = raw.match(/S\.browser_fallback_url=([^;]+)/);
  if (!match?.[1]) return null;

  try {
    const decoded = decodeURIComponent(match[1]);
    return isHttpSchemeUrl(decoded) ? decoded : null;
  } catch {
    return null;
  }
}

// 랜딩 페이지 파싱 실패를 공통 실패 결과로 변환한다.
function createLandingPageFailureResult(
  sourceUrl: string,
  finalUrl: string,
  reason: "UNSUPPORTED_HOST" | "INVALID_HTML" | "NOT_FOUND" | "MULTIPLE",
): ResolvedPlaybackInputResult {
  return {
    ok: false,
    sourceUrl,
    finalUrl,
    title: "지원하지 않는 QR",
    message: mapLandingPageResolveReasonToMessage(reason),
  };
}

// 입력 문자열을 실제 재생 가능한 유튜브 세션으로 해석한다.
async function resolvePlaybackInputInternal(
  input: string,
  startRedirectProbe: (sourceUrl: string) => Promise<string | null>,
): Promise<ResolvedPlaybackInputResult> {
  const sourceUrl = normalizeScannedInput(input);
  let finalUrl: string | null = isHttpSchemeUrl(sourceUrl) ? sourceUrl : null;
  let result = extractYouTubeId(sourceUrl);

  console.log("[PLAYBACK] resolve input:", sourceUrl, result);

  if (!result.ok && result.reason === "NOT_YOUTUBE") {
    const sourceHost = getHostFromUrl(sourceUrl);
    finalUrl = await resolveFinalUrl(sourceUrl);
    console.log("[PLAYBACK] resolved final URL:", finalUrl);

    if (!finalUrl) {
      return {
        ok: false,
        sourceUrl,
        finalUrl: null,
        title: "네트워크 오류",
        message: NETWORK_ERROR_MESSAGE,
      };
    }

    result = extractYouTubeId(finalUrl);

    if (!result.ok && result.reason === "NOT_YOUTUBE") {
      const finalHost = getHostFromUrl(finalUrl);

      if (isSupportedLandingPageHost(finalHost)) {
        const landingPageResult = await resolveLandingPageYouTube(finalUrl);
        console.log("[PLAYBACK] resolved landing page:", landingPageResult);

        if (landingPageResult.ok) {
          return {
            ok: true,
            sourceUrl,
            finalUrl: landingPageResult.youtubeUrl,
            videoId: landingPageResult.videoId,
          };
        }

        if (landingPageResult.reason === "NETWORK") {
          return {
            ok: false,
            sourceUrl,
            finalUrl,
            title: "네트워크 오류",
            message: NETWORK_ERROR_MESSAGE,
          };
        }

        return createLandingPageFailureResult(
          sourceUrl,
          finalUrl,
          landingPageResult.reason,
        );
      }

      const shouldUseWebViewFallback =
        isHttpSchemeUrl(finalUrl) &&
        sourceHost !== null &&
        finalHost === sourceHost;

      if (shouldUseWebViewFallback) {
        const webViewResolvedUrl = await startRedirectProbe(finalUrl);
        console.log("[PLAYBACK] resolved final URL via WebView:", webViewResolvedUrl);
        if (webViewResolvedUrl) {
          finalUrl = webViewResolvedUrl;
          result = extractYouTubeId(finalUrl);
        }
      }
    }
  }

  if (!result.ok) {
    return {
      ok: false,
      sourceUrl,
      finalUrl,
      title: "지원하지 않는 QR",
      message: mapExtractReasonToMessage(result.reason),
    };
  }

  return {
    ok: true,
    sourceUrl,
    finalUrl: finalUrl ?? sourceUrl,
    videoId: result.videoId,
  };
}

// 재생 입력 해석과 리다이렉트 추적 WebView를 함께 제공한다.
export function usePlaybackInputResolver(): {
  redirectProbeElement: React.JSX.Element | null;
  resolvePlaybackInput: (
    input: string,
  ) => Promise<ResolvedPlaybackInputResult>;
} {
  const [redirectProbe, setRedirectProbe] = useState<RedirectProbeState | null>(
    null,
  );
  const redirectProbeCounterRef = useRef(0);
  const redirectProbeResolverRef = useRef<((url: string | null) => void) | null>(
    null,
  );
  const redirectProbeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const redirectProbeLatestUrlRef = useRef<string | null>(null);

  // 현재 리다이렉트 추적을 종료하고 대기 중인 해석 요청을 정리한다.
  const settleRedirectProbe = useCallback((url: string | null) => {
    if (redirectProbeTimeoutRef.current) {
      clearTimeout(redirectProbeTimeoutRef.current);
      redirectProbeTimeoutRef.current = null;
    }

    setRedirectProbe(null);

    const resolver = redirectProbeResolverRef.current;
    redirectProbeResolverRef.current = null;
    redirectProbeLatestUrlRef.current = null;
    resolver?.(url);
  }, []);

  // WebView 기반 리다이렉트 추적을 시작한다.
  const startRedirectProbe = useCallback(
    (sourceUrl: string): Promise<string | null> => {
      if (redirectProbeResolverRef.current) {
        settleRedirectProbe(null);
      }

      return new Promise<string | null>((resolve) => {
        redirectProbeResolverRef.current = resolve;
        redirectProbeLatestUrlRef.current = sourceUrl;

        const nextKey = redirectProbeCounterRef.current + 1;
        redirectProbeCounterRef.current = nextKey;
        setRedirectProbe({
          key: nextKey,
          sourceUrl,
          sourceHost: getHostFromUrl(sourceUrl),
        });

        redirectProbeTimeoutRef.current = setTimeout(() => {
          settleRedirectProbe(null);
        }, REDIRECT_WEBVIEW_TIMEOUT_MS);
      });
    },
    [settleRedirectProbe],
  );

  // WebView에서 감지한 이동 URL로 최종 목적지 후보를 갱신한다.
  const handleRedirectProbeObservedUrl = useCallback(
    (observedUrl?: string) => {
      if (!redirectProbe || !observedUrl) return;

      const trimmed = observedUrl.trim();
      if (!trimmed) return;

      redirectProbeLatestUrlRef.current = trimmed;
      const observedHost = getHostFromUrl(trimmed);

      if (!observedHost || !redirectProbe.sourceHost) return;
      if (observedHost === redirectProbe.sourceHost) return;

      settleRedirectProbe(trimmed);
    },
    [redirectProbe, settleRedirectProbe],
  );

  useEffect(() => {
    return () => {
      if (redirectProbeTimeoutRef.current) {
        clearTimeout(redirectProbeTimeoutRef.current);
      }
      if (redirectProbeResolverRef.current) {
        redirectProbeResolverRef.current(null);
      }
    };
  }, []);

  // 공통 해석 로직으로 재생 입력을 해결한다.
  const resolvePlaybackInput = useCallback(
    (input: string) => {
      return resolvePlaybackInputInternal(input, startRedirectProbe);
    },
    [startRedirectProbe],
  );

  const redirectProbeElement = redirectProbe ? (
    <WebView
      key={`redirect-probe-${redirectProbe.key}`}
      pointerEvents="none"
      source={{ uri: redirectProbe.sourceUrl }}
      originWhitelist={["*"]}
      style={styles.hiddenRedirectWebView}
      onShouldStartLoadWithRequest={(request) => {
        const nextUrl = request.url ?? "";
        if (isHttpSchemeUrl(nextUrl)) {
          handleRedirectProbeObservedUrl(nextUrl);
          return true;
        }

        const fallbackUrl = getIntentFallbackUrl(nextUrl);
        if (fallbackUrl) {
          handleRedirectProbeObservedUrl(fallbackUrl);
        }

        return false;
      }}
      onNavigationStateChange={(state) => {
        handleRedirectProbeObservedUrl(state.url);
      }}
      onLoadEnd={() => {
        handleRedirectProbeObservedUrl(
          redirectProbeLatestUrlRef.current ?? undefined,
        );
      }}
      onError={() => settleRedirectProbe(null)}
      onHttpError={() => settleRedirectProbe(null)}
      javaScriptEnabled
      domStorageEnabled
      javaScriptCanOpenWindowsAutomatically={false}
      setSupportMultipleWindows={false}
    />
  ) : null;

  return {
    redirectProbeElement,
    resolvePlaybackInput,
  };
}

const styles = StyleSheet.create({
  hiddenRedirectWebView: {
    position: "absolute",
    width: 1,
    height: 1,
    opacity: 0,
  },
});
