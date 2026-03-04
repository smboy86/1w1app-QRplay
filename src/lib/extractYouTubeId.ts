import type { ExtractErrorReason, ExtractResult } from "./types";

const YT_ID_RE = /^[A-Za-z0-9_-]{11}$/;
const YOUTUBE_HOST_RE = /(^|\.)youtube\.com$/;
const NON_SINGLE_PATH_PREFIXES = new Set([
  "playlist",
  "channel",
  "results",
  "feed",
  "user",
  "c",
  "live",
]);

function normalizeHost(hostname: string): string {
  return hostname.toLowerCase().replace(/^www\./, "").replace(/^m\./, "");
}

function invalidId(): ExtractResult {
  return { ok: false, reason: "INVALID_ID" };
}

function nonSingleVideo(): ExtractResult {
  return { ok: false, reason: "NOT_SINGLE_VIDEO" };
}

function extractFromWatchUrl(url: URL): ExtractResult {
  const id = url.searchParams.get("v");
  if (!id) return nonSingleVideo();
  if (!YT_ID_RE.test(id)) return invalidId();
  return { ok: true, videoId: id };
}

function extractFromPathParts(parts: string[]): ExtractResult {
  if (parts.length !== 2) return nonSingleVideo();

  const id = parts[1];
  if (!YT_ID_RE.test(id)) return invalidId();

  return { ok: true, videoId: id };
}

export function extractYouTubeId(input: string): ExtractResult {
  const raw = input.trim();

  if (!raw) return invalidId();
  if (YT_ID_RE.test(raw)) return { ok: true, videoId: raw };

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return invalidId();
  }

  const host = normalizeHost(url.hostname);

  if (host === "youtu.be") {
    if (url.searchParams.has("list")) return nonSingleVideo();

    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.length !== 1) return nonSingleVideo();

    const id = parts[0];
    if (!YT_ID_RE.test(id)) return invalidId();

    return { ok: true, videoId: id };
  }

  if (!YOUTUBE_HOST_RE.test(host)) {
    return { ok: false, reason: "NOT_YOUTUBE" };
  }

  if (url.searchParams.has("list")) return nonSingleVideo();

  const pathname = url.pathname.replace(/\/+$/, "");
  const parts = pathname.split("/").filter(Boolean);

  if (pathname === "/watch") {
    return extractFromWatchUrl(url);
  }

  if (parts[0] === "embed" || parts[0] === "shorts") {
    return extractFromPathParts(parts);
  }

  if (parts.length === 0) {
    return nonSingleVideo();
  }

  const prefix = parts[0];

  if (NON_SINGLE_PATH_PREFIXES.has(prefix) || prefix.startsWith("@")) {
    return nonSingleVideo();
  }

  return nonSingleVideo();
}

export function mapExtractReasonToMessage(reason: ExtractErrorReason): string {
  switch (reason) {
    case "NOT_YOUTUBE":
      return "YouTube 영상 QR만 지원합니다.";
    case "NOT_SINGLE_VIDEO":
      return "단일 영상 URL/ID만 허용됩니다.";
    case "INVALID_ID":
    default:
      return "올바른 YouTube 영상 주소 또는 ID를 입력해 주세요.";
  }
}
