import { describe, expect, it } from "vitest";

import { mapYouTubeError } from "./mapYouTubeError";

describe("mapYouTubeError", () => {
  it("maps known youtube errors", () => {
    expect(mapYouTubeError(5)).toBe("HTML5 플레이어 오류가 발생했습니다.");
    expect(mapYouTubeError(100)).toBe("삭제되었거나 비공개 처리된 영상입니다.");
    expect(mapYouTubeError(101)).toBe("임베드 재생이 허용되지 않은 영상입니다.");
    expect(mapYouTubeError(150)).toBe("임베드 재생이 허용되지 않은 영상입니다.");
    expect(mapYouTubeError(153)).toBe("앱 식별(origin) 정보가 누락되어 재생할 수 없습니다.");
  });

  it("maps unknown error to fallback message", () => {
    expect(mapYouTubeError(999)).toBe("재생할 수 없는 영상입니다.");
    expect(mapYouTubeError(undefined)).toBe("재생할 수 없는 영상입니다.");
  });
});
