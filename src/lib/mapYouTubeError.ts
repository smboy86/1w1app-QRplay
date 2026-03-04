export const NETWORK_ERROR_MESSAGE =
  "네트워크가 불안정하거나 오프라인 상태입니다. 연결을 확인한 후 다시 시도해 주세요.";

export function mapYouTubeError(code?: number): string {
  switch (code) {
    case 2:
      return "유효하지 않은 영상 요청입니다.";
    case 5:
      return "HTML5 플레이어 오류가 발생했습니다.";
    case 100:
      return "삭제되었거나 비공개 처리된 영상입니다.";
    case 101:
    case 150:
      return "임베드 재생이 허용되지 않은 영상입니다.";
    case 153:
      return "앱 식별(origin) 정보가 누락되어 재생할 수 없습니다.";
    default:
      return "재생할 수 없는 영상입니다.";
  }
}
