import type { ScannerFacing } from "../scanner/scanner-types";

const DEFAULT_CAMERA_STORAGE_KEY = "@qrplay/default-camera-facing";
export const DEFAULT_SCANNER_FACING: ScannerFacing = "back";
type AsyncStorageModule = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
};

let cachedAsyncStorage: AsyncStorageModule | null | undefined;

// Returns true when a raw storage value matches one of the supported camera facings.
function isScannerFacing(value: string | null): value is ScannerFacing {
  return value === "front" || value === "back";
}

// Returns the AsyncStorage native module when it is available in the current app binary.
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

// Returns true when the current app binary includes the AsyncStorage native module.
export function isDefaultCameraStorageAvailable(): boolean {
  return getAsyncStorageModule() !== null;
}

// Reads the saved default camera facing and falls back to the rear camera when unset.
export async function getDefaultScannerFacing(): Promise<ScannerFacing> {
  const asyncStorage = getAsyncStorageModule();
  if (!asyncStorage) {
    return DEFAULT_SCANNER_FACING;
  }

  try {
    const storedFacing = await asyncStorage.getItem(DEFAULT_CAMERA_STORAGE_KEY);
    return isScannerFacing(storedFacing) ? storedFacing : DEFAULT_SCANNER_FACING;
  } catch {
    return DEFAULT_SCANNER_FACING;
  }
}

// Persists the selected default camera facing for the next scanner session.
export async function setDefaultScannerFacing(
  facing: ScannerFacing,
): Promise<void> {
  const asyncStorage = getAsyncStorageModule();
  if (!asyncStorage) {
    throw new Error("AsyncStorage native module is unavailable.");
  }

  await asyncStorage.setItem(DEFAULT_CAMERA_STORAGE_KEY, facing);
}
