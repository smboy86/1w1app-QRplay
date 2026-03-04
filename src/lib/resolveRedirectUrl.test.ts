import { afterEach, describe, expect, it, vi } from "vitest";

import { resolveRedirectUrl } from "./resolveRedirectUrl";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("resolveRedirectUrl", () => {
  it("rejects non-url input", async () => {
    const result = await resolveRedirectUrl("not a url");
    expect(result).toEqual({ ok: false, reason: "NOT_URL" });
  });

  it("follows redirects using HEAD", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    } as Response);

    vi.stubGlobal("fetch", fetchMock);

    const result = await resolveRedirectUrl("https://bit.ly/example");

    expect(result).toEqual({
      ok: true,
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      redirected: true,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://bit.ly/example",
      expect.objectContaining({
        method: "HEAD",
        redirect: "follow",
      })
    );
  });

  it("falls back to GET when HEAD request fails", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("HEAD blocked"))
      .mockRejectedValueOnce(new Error("HEAD manual blocked"))
      .mockResolvedValueOnce({
        url: "https://youtu.be/dQw4w9WgXcQ",
      } as Response);

    vi.stubGlobal("fetch", fetchMock);

    const result = await resolveRedirectUrl("https://short.example/abc");

    expect(result).toEqual({
      ok: true,
      url: "https://youtu.be/dQw4w9WgXcQ",
      redirected: true,
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://short.example/abc",
      expect.objectContaining({
        method: "GET",
        redirect: "follow",
      })
    );
  });

  it("uses manual location header when follow mode keeps original url", async () => {
    const redirectedLocation = "https://www.youtube.com/watch?v=Pi18ANpsUWA&list=PL123&index=1";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        url: "https://gilbut.co/c/23014481SH",
      } as Response)
      .mockResolvedValueOnce({
        url: "https://gilbut.co/c/23014481SH",
        headers: {
          get: (name: string) => (name.toLowerCase() === "location" ? redirectedLocation : null),
        },
      } as unknown as Response)
      .mockResolvedValueOnce({
        url: redirectedLocation,
        headers: {
          get: () => null,
        },
      } as unknown as Response);

    vi.stubGlobal("fetch", fetchMock);

    const result = await resolveRedirectUrl("https://gilbut.co/c/23014481SH");

    expect(result).toEqual({
      ok: true,
      url: redirectedLocation,
      redirected: true,
    });
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://gilbut.co/c/23014481SH",
      expect.objectContaining({
        method: "HEAD",
        redirect: "follow",
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://gilbut.co/c/23014481SH",
      expect.objectContaining({
        method: "HEAD",
        redirect: "manual",
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      redirectedLocation,
      expect.objectContaining({
        method: "HEAD",
        redirect: "manual",
      })
    );
  });

  it("tries https first when input is http", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    } as Response);

    vi.stubGlobal("fetch", fetchMock);

    const result = await resolveRedirectUrl("http://gilbut.co/c/23014318ff");

    expect(result).toEqual({
      ok: true,
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      redirected: true,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://gilbut.co/c/23014318ff",
      expect.objectContaining({
        method: "HEAD",
        redirect: "follow",
      })
    );
  });

  it("returns network failure when both HEAD and GET fail", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("HEAD blocked"))
      .mockRejectedValueOnce(new Error("HEAD manual blocked"))
      .mockRejectedValueOnce(new Error("GET blocked"))
      .mockRejectedValueOnce(new Error("GET blocked"));

    vi.stubGlobal("fetch", fetchMock);

    const result = await resolveRedirectUrl("https://short.example/unreachable");

    expect(result).toEqual({ ok: false, reason: "NETWORK" });
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
});
