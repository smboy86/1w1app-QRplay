import { Platform } from "react-native";

const REPORT_ENDPOINT =
  "https://script.google.com/macros/s/AKfycbyiWPsuQoOxj7Vo_byzM4Zu9Ii2mwScfZOg8HxOsyv0B4fhfekd9l06Sp8FdRzct3gE/exec";

type UnsupportedQrSourceReport = {
  sourceUrl: string;
  finalUrl: string | null;
};

function getHost(raw: string | null): string {
  if (!raw) return "";

  try {
    return new URL(raw).hostname.toLowerCase();
  } catch {
    return "";
  }
}

// 지원하지 않는 QR 출처를 관리자 확인용 Apps Script로 조용히 전송한다.
export function reportUnsupportedQrSource({
  finalUrl,
  sourceUrl,
}: UnsupportedQrSourceReport): void {
  void fetch(REPORT_ENDPOINT, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      app: "qrplay",
      finalHost: getHost(finalUrl),
      finalUrl,
      occurredAt: new Date().toISOString(),
      platform: Platform.OS,
      sourceHost: getHost(sourceUrl),
      sourceUrl,
    }),
  }).catch(() => {
    // 사용자 흐름을 막지 않기 위해 전송 실패는 화면에 표시하지 않는다.
  });
}
