import { afterEach, describe, expect, it, vi } from "vitest";

import { resolveFinalUrl, resolveRedirectUrl } from "./resolveRedirectUrl";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("resolveFinalUrl", () => {
  it("returns null for non-url input", async () => {
    const result = await resolveFinalUrl("not a url");
    expect(result).toBeNull();
  });

  it("returns follow redirect result from HEAD when available", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      headers: { get: () => null },
    } as unknown as Response);

    vi.stubGlobal("fetch", fetchMock);

    const result = await resolveFinalUrl("https://bit.ly/example");

    expect(result).toBe("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://bit.ly/example",
      expect.objectContaining({
        method: "HEAD",
        redirect: "follow",
      }),
    );
  });

  it("falls back to GET follow when HEAD flow fails", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("HEAD follow blocked"))
      .mockRejectedValueOnce(new Error("HEAD manual blocked"))
      .mockResolvedValueOnce({
        url: "https://youtu.be/dQw4w9WgXcQ",
        headers: { get: () => null },
      } as unknown as Response);

    vi.stubGlobal("fetch", fetchMock);

    const result = await resolveFinalUrl("https://short.example/abc");

    expect(result).toBe("https://youtu.be/dQw4w9WgXcQ");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://short.example/abc",
      expect.objectContaining({
        method: "GET",
        redirect: "follow",
      }),
    );
  });

  it("uses manual location header when follow keeps original url", async () => {
    const redirectedLocation = "https://www.youtube.com/watch?v=Pi18ANpsUWA&list=PL123&index=1";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        url: "https://gilbut.co/c/23014481SH",
        headers: { get: () => null },
      } as unknown as Response)
      .mockResolvedValueOnce({
        url: "https://gilbut.co/c/23014481SH",
        headers: {
          get: (name: string) =>
            name.toLowerCase() === "location" ? redirectedLocation : null,
        },
      } as unknown as Response)
      .mockResolvedValueOnce({
        url: redirectedLocation,
        headers: { get: () => null },
      } as unknown as Response);

    vi.stubGlobal("fetch", fetchMock);

    const result = await resolveFinalUrl("https://gilbut.co/c/23014481SH");

    expect(result).toBe(redirectedLocation);
  });

  it("continues resolving after same-host redirect and returns external final url", async () => {
    const source = "http://gilbut.co/c/23014318ff";
    const sameHostHttps = "https://gilbut.co/c/23014318ff";
    const finalYoutube =
      "https://www.youtube.com/watch?v=ehcHwY-3IP0&list=PLbaarg_Pbkcu1ehFk1jKnUq7J-9h9iVtl&index=1";

    const fetchMock = vi.fn().mockImplementation(
      async (input: string, init?: RequestInit) => {
        const method = init?.method;
        const redirect = init?.redirect;

        if (input === sameHostHttps && method === "HEAD" && redirect === "follow") {
          return {
            url: sameHostHttps,
            headers: { get: () => null },
          } as unknown as Response;
        }

        if (input === sameHostHttps && method === "HEAD" && redirect === "manual") {
          return {
            url: sameHostHttps,
            headers: { get: () => null },
          } as unknown as Response;
        }

        if (input === source && method === "HEAD" && redirect === "follow") {
          return {
            url: sameHostHttps,
            headers: { get: () => null },
          } as unknown as Response;
        }

        if (input === source && method === "HEAD" && redirect === "manual") {
          return {
            url: source,
            headers: {
              get: (name: string) =>
                name.toLowerCase() === "location" ? finalYoutube : null,
            },
          } as unknown as Response;
        }

        return {
          url: input,
          headers: { get: () => null },
        } as unknown as Response;
      },
    );

    vi.stubGlobal("fetch", fetchMock);

    const result = await resolveFinalUrl(source);
    expect(result).toBe(finalYoutube);
  });

  it("uses XMLHttpRequest fallback when fetch cannot expose redirected url", async () => {
    const fetchMock = vi.fn().mockImplementation(async (input: string) => {
      return {
        url: input,
        headers: { get: () => null },
      } as unknown as Response;
    });

    class MockXMLHttpRequest {
      timeout = 0;
      responseURL = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      ontimeout: (() => void) | null = null;
      onabort: (() => void) | null = null;

      open(_method: string, _url: string, _async: boolean) {}

      send() {
        this.onload?.();
      }

      getResponseHeader(_name: string) {
        return null;
      }
    }

    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("XMLHttpRequest", MockXMLHttpRequest as unknown as typeof XMLHttpRequest);

    const result = await resolveFinalUrl("http://gilbut.co/c/23014318ff");

    expect(result).toBe("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
  });

  it("returns null when all strategies fail", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("HEAD follow blocked"))
      .mockRejectedValueOnce(new Error("HEAD manual blocked"))
      .mockRejectedValueOnce(new Error("GET follow blocked"))
      .mockRejectedValueOnce(new Error("GET manual blocked"));

    vi.stubGlobal("fetch", fetchMock);

    const result = await resolveFinalUrl("https://short.example/unreachable");

    expect(result).toBeNull();
  });
});

describe("resolveRedirectUrl", () => {
  it("returns NOT_URL for invalid input", async () => {
    const result = await resolveRedirectUrl("not a url");
    expect(result).toEqual({ ok: false, reason: "NOT_URL" });
  });

  it("wraps resolved final url", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      headers: { get: () => null },
    } as unknown as Response);

    vi.stubGlobal("fetch", fetchMock);

    const result = await resolveRedirectUrl("https://bit.ly/example");
    expect(result).toEqual({
      ok: true,
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      redirected: true,
    });
  });
});
