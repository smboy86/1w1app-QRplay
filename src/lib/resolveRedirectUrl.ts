const REQUEST_TIMEOUT_MS = 6000;
const MAX_MANUAL_REDIRECT_HOPS = 5;

type RedirectResolveErrorReason = "NOT_URL" | "UNSUPPORTED_PROTOCOL" | "NETWORK";
export type RedirectResolveResult =
  | { ok: true; url: string; redirected: boolean }
  | { ok: false; reason: RedirectResolveErrorReason };

function isHttpUrl(raw: string): boolean {
  try {
    const parsed = new URL(raw);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function normalizeHost(hostname: string): string {
  return hostname.toLowerCase().replace(/^www\./, "").replace(/^m\./, "");
}

async function fetchWithTimeout(
  input: string,
  method: "HEAD" | "GET",
  redirect: RequestRedirect,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    return await fetch(input, {
      method,
      redirect,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

function buildResolveCandidates(url: URL): string[] {
  if (url.protocol !== "http:") {
    return [url.toString()];
  }

  const httpsUrl = new URL(url.toString());
  httpsUrl.protocol = "https:";
  return [httpsUrl.toString(), url.toString()];
}

function selectFallback(current: string | null, next: string): string {
  if (!current) return next;
  if (current === next) return current;

  const currentProtocol = (() => {
    try {
      return new URL(current).protocol;
    } catch {
      return "";
    }
  })();

  const nextProtocol = (() => {
    try {
      return new URL(next).protocol;
    } catch {
      return "";
    }
  })();

  if (currentProtocol === "http:" && nextProtocol === "https:") {
    return next;
  }

  return current;
}

function getLocationHeader(
  headers: Pick<Headers, "get"> | undefined,
): string | null {
  if (!headers?.get) return null;
  return headers.get("location") ?? headers.get("Location");
}

async function tryResolveWithFollow(
  input: string,
  method: "HEAD" | "GET",
): Promise<string | null> {
  const response = await fetchWithTimeout(input, method, "follow");

  const location = getLocationHeader(response.headers);
  if (location) {
    try {
      const redirected = new URL(location, input).toString();
      if (isHttpUrl(redirected)) return redirected;
    } catch {
      // Fall through to response.url.
    }
  }

  if (isHttpUrl(response.url)) {
    return response.url;
  }

  return null;
}

async function tryResolveWithManual(
  input: string,
  method: "HEAD" | "GET",
): Promise<string | null> {
  let current = input;

  for (let hop = 0; hop < MAX_MANUAL_REDIRECT_HOPS; hop += 1) {
    const response = await fetchWithTimeout(current, method, "manual");
    const location = getLocationHeader(response.headers);

    if (!location) {
      if (isHttpUrl(response.url) && response.url !== current) {
        current = response.url;
      }
      return current;
    }

    let nextUrl: URL;
    try {
      nextUrl = new URL(location, current);
    } catch {
      return null;
    }

    const next = nextUrl.toString();
    if (!isHttpUrl(next)) {
      return null;
    }

    if (next === current) {
      return current;
    }

    current = next;
  }

  return current;
}

async function tryResolveWithXmlHttpRequest(
  input: string,
  method: "HEAD" | "GET",
): Promise<string | null> {
  if (typeof XMLHttpRequest !== "function") {
    return null;
  }

  return await new Promise<string>((resolve, reject) => {
    let settled = false;

    const onResolve = (value: string) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    const onReject = () => {
      if (settled) return;
      settled = true;
      reject(new Error("XHR_FAILED"));
    };

    const xhr = new XMLHttpRequest();
    xhr.timeout = REQUEST_TIMEOUT_MS;
    xhr.open(method, input, true);

    xhr.onload = () => {
      const location = xhr.getResponseHeader("location") ?? xhr.getResponseHeader("Location");
      if (location) {
        try {
          const nextUrl = new URL(location, input).toString();
          if (isHttpUrl(nextUrl)) {
            onResolve(nextUrl);
            return;
          }
        } catch {
          // Fall through to responseURL.
        }
      }

      if (isHttpUrl(xhr.responseURL)) {
        onResolve(xhr.responseURL);
        return;
      }

      onResolve(input);
    };
    xhr.onerror = onReject;
    xhr.ontimeout = onReject;
    xhr.onabort = onReject;

    try {
      xhr.send();
    } catch {
      onReject();
    }
  });
}

export async function resolveFinalUrl(shortUrl: string): Promise<string | null> {
  const raw = shortUrl.trim();
  if (!raw) return null;

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return null;
  }

  const sourceHost = normalizeHost(parsed.hostname);
  const candidates = buildResolveCandidates(parsed);
  let fallbackUrl: string | null = null;
  let bestSameHostRedirect: string | null = null;

  const evaluateResolvedUrl = (
    resolvedUrl: string,
    candidate: string,
  ): string | null => {
    if (resolvedUrl === candidate) {
      fallbackUrl = selectFallback(fallbackUrl, resolvedUrl);
      return null;
    }

    try {
      const resolvedHost = normalizeHost(new URL(resolvedUrl).hostname);
      if (resolvedHost !== sourceHost) {
        return resolvedUrl;
      }
    } catch {
      // Ignore malformed resolved urls.
    }

    bestSameHostRedirect = selectFallback(bestSameHostRedirect, resolvedUrl);
    return null;
  };

  for (const candidate of candidates) {
    for (const method of ["HEAD", "GET"] as const) {
      try {
        const followUrl = await tryResolveWithFollow(candidate, method);
        if (followUrl) {
          const finalUrl = evaluateResolvedUrl(followUrl, candidate);
          if (finalUrl) return finalUrl;
        }
      } catch {
        // Try manual strategy.
      }

      try {
        const manualUrl = await tryResolveWithManual(candidate, method);
        if (manualUrl) {
          const finalUrl = evaluateResolvedUrl(manualUrl, candidate);
          if (finalUrl) return finalUrl;
        }
      } catch {
        // Try XHR strategy.
      }

      try {
        const xhrUrl = await tryResolveWithXmlHttpRequest(candidate, method);
        if (xhrUrl) {
          const finalUrl = evaluateResolvedUrl(xhrUrl, candidate);
          if (finalUrl) return finalUrl;
        }
      } catch {
        // Try the next method/candidate.
      }
    }
  }

  return bestSameHostRedirect ?? fallbackUrl;
}

// Backward-compatible wrapper kept for existing callers/tests.
export async function resolveRedirectUrl(input: string): Promise<RedirectResolveResult> {
  const raw = input.trim();

  if (!raw) return { ok: false, reason: "NOT_URL" };

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return { ok: false, reason: "NOT_URL" };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, reason: "UNSUPPORTED_PROTOCOL" };
  }

  const url = await resolveFinalUrl(raw);
  if (!url) {
    return { ok: false, reason: "NETWORK" };
  }

  return { ok: true, url, redirected: url !== raw };
}
