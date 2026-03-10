import { extractYouTubeId } from "./extractYouTubeId";
import type {
  LandingPageResolveResult,
} from "./types";

const REQUEST_TIMEOUT_MS = 8000;
const MAX_HTML_ENTITY_DECODE_PASSES = 5;
const NEXT_DATA_RE =
  /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/i;
const YT_ID_RE = /^[A-Za-z0-9_-]{11}$/;
const YOUTUBE_URL_RE =
  /https?:\/\/(?:www\.|m\.)?(?:youtube\.com\/[^\s"'<>]+|youtu\.be\/[^\s"'<>]+)/gi;

// Normalizes a hostname so supported-host checks stay consistent across URL shapes.
function normalizeHost(hostname: string): string {
  return hostname.toLowerCase().replace(/^www\./, "").replace(/^m\./, "");
}

// Checks whether a hostname belongs to a supported landing-page provider.
export function isSupportedLandingPageHost(hostname: string | null | undefined): boolean {
  if (!hostname) return false;
  return normalizeHost(hostname) === "site.naver.com";
}

// Builds a canonical watch URL from a confirmed YouTube video id.
function buildCanonicalYouTubeUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

// Downloads landing-page HTML with a timeout so page parsing cannot block forever.
async function fetchLandingPageHtml(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });

    if (!response.ok) {
      return null;
    }

    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

// Decodes nested HTML entities often found inside server-rendered JSON payloads.
function decodeHtmlEntities(input: string): string {
  let current = input;

  for (let pass = 0; pass < MAX_HTML_ENTITY_DECODE_PASSES; pass += 1) {
    const next = current
      .replace(/&amp;/gi, "&")
      .replace(/&quot;/gi, "\"")
      .replace(/&#39;/gi, "'")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">");

    if (next === current) {
      break;
    }

    current = next;
  }

  return current;
}

// Extracts the Next.js data payload embedded in a landing page HTML document.
function extractNextDataPayload(html: string): unknown | null {
  const match = html.match(NEXT_DATA_RE);
  if (!match?.[1]) {
    return null;
  }

  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

// Adds YouTube URL strings found in a text value to the candidate set.
function collectYouTubeUrlCandidates(value: string, target: Set<string>): void {
  const variants = [value, decodeHtmlEntities(value)];

  for (const variant of variants) {
    const trimmed = variant.trim();
    if (!trimmed) {
      continue;
    }

    if (extractYouTubeId(trimmed).ok) {
      target.add(trimmed);
    }

    const matches = trimmed.match(YOUTUBE_URL_RE);
    if (!matches) {
      continue;
    }

    for (const match of matches) {
      target.add(match);
    }
  }
}

// Recursively walks structured page data and collects supported YouTube signals.
function collectLandingPageCandidates(
  value: unknown,
  key: string | null,
  structuredVideoIds: Set<string>,
  urlCandidates: Set<string>,
): void {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return;
    }

    if (key === "videoVid" && YT_ID_RE.test(trimmed)) {
      structuredVideoIds.add(trimmed);
    }

    collectYouTubeUrlCandidates(trimmed, urlCandidates);
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectLandingPageCandidates(item, key, structuredVideoIds, urlCandidates);
    }
    return;
  }

  if (!value || typeof value !== "object") {
    return;
  }

  for (const [childKey, childValue] of Object.entries(value)) {
    collectLandingPageCandidates(
      childValue,
      childKey,
      structuredVideoIds,
      urlCandidates,
    );
  }
}

// Resolves a single playable video id from a set of YouTube URL candidates.
function resolveVideoIdFromUrlCandidates(
  urlCandidates: Set<string>,
): LandingPageResolveResult {
  const videoIds = new Set<string>();

  for (const candidate of urlCandidates) {
    const result = extractYouTubeId(candidate);
    if (!result.ok) {
      continue;
    }

    videoIds.add(result.videoId);
  }

  if (videoIds.size === 0) {
    return { ok: false, reason: "NOT_FOUND" };
  }

  if (videoIds.size > 1) {
    return { ok: false, reason: "MULTIPLE" };
  }

  const [videoId] = Array.from(videoIds);
  return {
    ok: true,
    youtubeUrl: buildCanonicalYouTubeUrl(videoId),
    videoId,
  };
}

// Resolves a supported landing page into a single playable YouTube video target.
export async function resolveLandingPageYouTube(
  input: string,
): Promise<LandingPageResolveResult> {
  const raw = input.trim();
  if (!raw) {
    return { ok: false, reason: "UNSUPPORTED_HOST" };
  }

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return { ok: false, reason: "UNSUPPORTED_HOST" };
  }

  if (
    (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
    !isSupportedLandingPageHost(parsed.hostname)
  ) {
    return { ok: false, reason: "UNSUPPORTED_HOST" };
  }

  let html: string | null;
  try {
    html = await fetchLandingPageHtml(raw);
  } catch {
    return { ok: false, reason: "NETWORK" };
  }

  if (!html) {
    return { ok: false, reason: "NETWORK" };
  }

  const nextDataPayload = extractNextDataPayload(html);
  if (!nextDataPayload || typeof nextDataPayload !== "object") {
    return { ok: false, reason: "INVALID_HTML" };
  }

  const structuredVideoIds = new Set<string>();
  const urlCandidates = new Set<string>();
  collectLandingPageCandidates(
    nextDataPayload,
    null,
    structuredVideoIds,
    urlCandidates,
  );

  if (structuredVideoIds.size === 1) {
    const [videoId] = Array.from(structuredVideoIds);
    return {
      ok: true,
      youtubeUrl: buildCanonicalYouTubeUrl(videoId),
      videoId,
    };
  }

  if (structuredVideoIds.size > 1) {
    return { ok: false, reason: "MULTIPLE" };
  }

  return resolveVideoIdFromUrlCandidates(urlCandidates);
}

// Maps landing-page parsing failures to a user-facing message.
export function mapLandingPageResolveReasonToMessage(
  reason: Exclude<LandingPageResolveResult, { ok: true }>["reason"],
): string {
  switch (reason) {
    case "MULTIPLE":
      return "단일 YouTube 영상만 포함된 페이지만 지원합니다.";
    case "NOT_FOUND":
    case "INVALID_HTML":
    case "UNSUPPORTED_HOST":
    default:
      return "페이지 안에서 재생 가능한 YouTube 영상을 찾지 못했습니다.";
  }
}
