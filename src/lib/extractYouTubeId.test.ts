import { describe, expect, it } from "vitest";

import { extractYouTubeId } from "./extractYouTubeId";

describe("extractYouTubeId", () => {
  it("accepts raw YouTube video id", () => {
    expect(extractYouTubeId("dQw4w9WgXcQ")).toEqual({ ok: true, videoId: "dQw4w9WgXcQ" });
  });

  it("accepts youtu.be url", () => {
    expect(extractYouTubeId("https://youtu.be/dQw4w9WgXcQ?t=30")).toEqual({
      ok: true,
      videoId: "dQw4w9WgXcQ",
    });
  });

  it("accepts watch url", () => {
    expect(extractYouTubeId("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toEqual({
      ok: true,
      videoId: "dQw4w9WgXcQ",
    });
  });

  it("accepts embed url", () => {
    expect(extractYouTubeId("https://youtube.com/embed/dQw4w9WgXcQ")).toEqual({
      ok: true,
      videoId: "dQw4w9WgXcQ",
    });
  });

  it("accepts shorts url", () => {
    expect(extractYouTubeId("https://youtube.com/shorts/dQw4w9WgXcQ")).toEqual({
      ok: true,
      videoId: "dQw4w9WgXcQ",
    });
  });

  it("rejects non-youtube host", () => {
    expect(extractYouTubeId("https://vimeo.com/1234")).toEqual({
      ok: false,
      reason: "NOT_YOUTUBE",
    });
  });

  it("accepts watch url even when playlist params are present", () => {
    expect(
      extractYouTubeId("https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PL1234567890")
    ).toEqual({
      ok: true,
      videoId: "dQw4w9WgXcQ",
    });
  });

  it("rejects playlist page url", () => {
    expect(extractYouTubeId("https://www.youtube.com/playlist?list=PL1234567890")).toEqual({
      ok: false,
      reason: "NOT_SINGLE_VIDEO",
    });
  });

  it("rejects channel url", () => {
    expect(extractYouTubeId("https://www.youtube.com/channel/UC123456789")).toEqual({
      ok: false,
      reason: "NOT_SINGLE_VIDEO",
    });
  });

  it("rejects search url", () => {
    expect(extractYouTubeId("https://www.youtube.com/results?search_query=abc")).toEqual({
      ok: false,
      reason: "NOT_SINGLE_VIDEO",
    });
  });

  it("rejects live page url", () => {
    expect(extractYouTubeId("https://www.youtube.com/live")).toEqual({
      ok: false,
      reason: "NOT_SINGLE_VIDEO",
    });
  });

  it("rejects invalid id", () => {
    expect(extractYouTubeId("https://youtu.be/invalid")).toEqual({
      ok: false,
      reason: "INVALID_ID",
    });
  });
});
