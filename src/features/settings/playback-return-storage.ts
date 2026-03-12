const PLAYBACK_RETURN_STORAGE_KEY = "@qrplay/return-after-playback";

export const DEFAULT_RETURN_AFTER_PLAYBACK = true;

type AsyncStorageModule = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
};

let cachedAsyncStorage: AsyncStorageModule | null | undefined;

// 저장된 문자열이 영상 종료 후 돌아가기 설정값으로 유효한지 판별한다.
function isPlaybackReturnValue(value: string | null): value is "0" | "1" {
  return value === "0" || value === "1";
}

// 현재 앱 바이너리에서 AsyncStorage 네이티브 모듈을 안전하게 가져온다.
function getAsyncStorageModule(): AsyncStorageModule | null {
  if (cachedAsyncStorage !== undefined) {
    return cachedAsyncStorage;
  }

  try {
    const asyncStorageModule = require("@react-native-async-storage/async-storage")
      .default as AsyncStorageModule | undefined;
    cachedAsyncStorage = asyncStorageModule ?? null;
  } catch {
    cachedAsyncStorage = null;
  }

  return cachedAsyncStorage;
}

// 현재 앱 바이너리에 영상 종료 후 돌아가기 설정 저장 모듈이 포함됐는지 확인한다.
export function isPlaybackReturnStorageAvailable(): boolean {
  return getAsyncStorageModule() !== null;
}

// 저장된 영상 종료 후 돌아가기 설정을 읽고 값이 없으면 기본값을 반환한다.
export async function getShouldReturnAfterPlayback(): Promise<boolean> {
  const asyncStorage = getAsyncStorageModule();
  if (!asyncStorage) {
    return DEFAULT_RETURN_AFTER_PLAYBACK;
  }

  try {
    const storedValue = await asyncStorage.getItem(PLAYBACK_RETURN_STORAGE_KEY);
    if (!isPlaybackReturnValue(storedValue)) {
      return DEFAULT_RETURN_AFTER_PLAYBACK;
    }

    return storedValue === "1";
  } catch {
    return DEFAULT_RETURN_AFTER_PLAYBACK;
  }
}

// 다음 재생 세션에도 유지되도록 영상 종료 후 돌아가기 설정을 저장한다.
export async function setShouldReturnAfterPlayback(
  shouldReturnAfterPlayback: boolean,
): Promise<void> {
  const asyncStorage = getAsyncStorageModule();
  if (!asyncStorage) {
    throw new Error("AsyncStorage native module is unavailable.");
  }

  await asyncStorage.setItem(
    PLAYBACK_RETURN_STORAGE_KEY,
    shouldReturnAfterPlayback ? "1" : "0",
  );
}
