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

type ProbeResult = { url: string; redirected: boolean };

async function tryResolveWithFollow(input: string, method: "HEAD" | "GET"): Promise<ProbeResult> {
  const response = await fetchWithTimeout(input, method, "follow");
  const resolvedUrl = isHttpUrl(response.url) ? response.url : input;
  return { url: resolvedUrl, redirected: resolvedUrl !== input };
}

async function tryResolveWithManual(input: string, method: "HEAD" | "GET"): Promise<ProbeResult | null> {
  let current = input;

  for (let hop = 0; hop < MAX_MANUAL_REDIRECT_HOPS; hop += 1) {
    const response = await fetchWithTimeout(current, method, "manual");
    const location = response.headers.get("location");

    if (!location) {
      return { url: current, redirected: current !== input };
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
      return { url: current, redirected: current !== input };
    }

    current = next;
  }

  return { url: current, redirected: current !== input };
}

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

  const candidates = buildResolveCandidates(parsed);
  let fallbackUrl: string | null = null;

  for (const candidate of candidates) {
    for (const method of ["HEAD", "GET"] as const) {
      try {
        const followResult = await tryResolveWithFollow(candidate, method);
        if (followResult.redirected) {
          return {
            ok: true,
            url: followResult.url,
            redirected: followResult.url !== raw,
          };
        }
        fallbackUrl = followResult.url;
      } catch {
        // Try manual strategy.
      }

      try {
        const manualResult = await tryResolveWithManual(candidate, method);
        if (manualResult?.redirected) {
          return {
            ok: true,
            url: manualResult.url,
            redirected: manualResult.url !== raw,
          };
        }
        if (manualResult) {
          fallbackUrl = manualResult.url;
        }
      } catch {
        // Try the next method/candidate.
      }
    }
  }

  if (fallbackUrl) {
    return { ok: true, url: fallbackUrl, redirected: fallbackUrl !== raw };
  }

  return { ok: false, reason: "NETWORK" };
}
