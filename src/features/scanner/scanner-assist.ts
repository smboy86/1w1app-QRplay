export type ScanAssistState =
  | "idle"
  | "searching"
  | "move-closer"
  | "center-code"
  | "flatten-angle"
  | "suggest-rear-camera";

export type ScannerFacing = "back" | "front";

export type NormalizedPoint = {
  x: number;
  y: number;
};

export type NormalizedBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type ScannerBarcodeCandidate = {
  bounds: NormalizedBounds;
  cornerPoints: NormalizedPoint[];
  rawValue?: string | null;
};

export type ScannerBarcodeEvent = {
  bounds?: NormalizedBounds | null;
  cornerPoints?: NormalizedPoint[];
  data: string;
};

export type ScannerPotentialBarcodesEvent = {
  autoCorrectionFailures?: number;
  barcodes: ScannerBarcodeCandidate[];
  isFrontFixedFocus?: boolean;
};

export type ScannerZoomSuggestionEvent = {
  source?: "mlkit" | "manual";
  zoomRatio: number;
};

export type ScannerFocusState =
  | "idle"
  | "focusing"
  | "focused"
  | "unsupported"
  | "suggest-rear-camera";

export type ScannerFocusStateEvent = {
  autoCorrectionFailures?: number;
  isFrontFixedFocus?: boolean;
  requestedPoint?: NormalizedPoint | null;
  state: ScannerFocusState;
};

export type HighlightFrame = {
  bounds: NormalizedBounds;
  cornerPoints: NormalizedPoint[];
};

export const FRONT_CAMERA_ZOOM_LEVELS = [1, 1.2, 1.5] as const;

// Clamps an arbitrary number into the normalized 0..1 range.
function clampUnitValue(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

// Sanitizes a normalized barcode bounds payload before it reaches the UI.
function normalizeBounds(bounds: NormalizedBounds): NormalizedBounds {
  const x = clampUnitValue(bounds.x);
  const y = clampUnitValue(bounds.y);
  const width = Math.min(clampUnitValue(bounds.width), 1 - x);
  const height = Math.min(clampUnitValue(bounds.height), 1 - y);
  return { x, y, width, height };
}

// Sanitizes a normalized barcode point payload before it reaches the UI.
function normalizePoint(point: NormalizedPoint): NormalizedPoint {
  return {
    x: clampUnitValue(point.x),
    y: clampUnitValue(point.y),
  };
}

// Converts a native scan payload into a highlight-ready overlay model.
export function createHighlightFrame(
  bounds?: NormalizedBounds | null,
  cornerPoints?: NormalizedPoint[] | null,
): HighlightFrame | null {
  if (!bounds) return null;

  const nextBounds = normalizeBounds(bounds);
  const nextCornerPoints = (cornerPoints ?? []).map(normalizePoint);
  return {
    bounds: nextBounds,
    cornerPoints: nextCornerPoints,
  };
}

// Returns the centered scan frame size for the current viewport.
export function getScannerFrameLayout(width: number, height: number) {
  const size = Math.max(180, Math.min(width * 0.4, height * 0.62));
  const left = (width - size) / 2;
  const top = (height - size) / 2;

  return {
    left,
    size,
    top,
  };
}

// Scores a candidate by preferring centered and larger QR bounds.
function scoreCandidate(candidate: ScannerBarcodeCandidate): number {
  const bounds = normalizeBounds(candidate.bounds);
  const centerX = bounds.x + bounds.width / 2;
  const centerY = bounds.y + bounds.height / 2;
  const centerDistance = Math.hypot(centerX - 0.5, centerY - 0.5);
  const area = bounds.width * bounds.height;
  return area * 2 - centerDistance;
}

// Chooses the best potential barcode candidate for guidance decisions.
export function getPrimaryBarcodeCandidate(
  candidates: ScannerBarcodeCandidate[],
): ScannerBarcodeCandidate | null {
  if (!candidates.length) return null;

  return [...candidates].sort((left, right) => {
    return scoreCandidate(right) - scoreCandidate(left);
  })[0] ?? null;
}

// Estimates perspective skew from normalized corner points.
export function getCornerSkew(points: NormalizedPoint[]): number {
  if (points.length < 4) return 0;

  const [topLeft, topRight, bottomRight, bottomLeft] = points.map(normalizePoint);
  const topTilt = Math.abs(topLeft.y - topRight.y);
  const bottomTilt = Math.abs(bottomLeft.y - bottomRight.y);
  const leftTilt = Math.abs(topLeft.x - bottomLeft.x);
  const rightTilt = Math.abs(topRight.x - bottomRight.x);
  return Math.max(topTilt, bottomTilt, leftTilt, rightTilt);
}

// Converts current scanner telemetry into a user-facing assist state.
export function getScanAssistState(
  candidate: ScannerBarcodeCandidate | null,
  isFrontFixedFocus: boolean,
  autoCorrectionFailures: number,
): ScanAssistState {
  if (isFrontFixedFocus && autoCorrectionFailures >= 2) {
    return "suggest-rear-camera";
  }

  if (!candidate) {
    return "searching";
  }

  const bounds = normalizeBounds(candidate.bounds);
  const centerX = bounds.x + bounds.width / 2;
  const centerY = bounds.y + bounds.height / 2;
  const area = bounds.width * bounds.height;
  const skew = getCornerSkew(candidate.cornerPoints);

  if (Math.abs(centerX - 0.5) > 0.2 || Math.abs(centerY - 0.5) > 0.2) {
    return "center-code";
  }

  if (area < 0.12) {
    return "move-closer";
  }

  if (skew > 0.08) {
    return "flatten-angle";
  }

  return "idle";
}

// Maps the current assist state to scanner guidance copy.
export function getScanAssistCopy(
  state: ScanAssistState,
  facing: ScannerFacing,
  focusState: ScannerFocusState,
  isFrontFixedFocus: boolean,
): { description: string; title: string } {
  if (state === "suggest-rear-camera") {
    return {
      title: "후면 카메라를 권장해요",
      description: isFrontFixedFocus
        ? "이 기기의 전면 카메라는 초점 범위가 좁아 QR 인식이 어렵습니다."
        : "전면 카메라는 화각과 초점 제약이 커서 후면 카메라가 더 잘 읽힙니다.",
    };
  }

  if (focusState === "focusing") {
    return {
      title: "초점을 다시 맞추는 중이에요",
      description: "QR이 흔들리지 않게 잠깐만 고정해 주세요.",
    };
  }

  if (state === "center-code") {
    return {
      title: "QR을 프레임 가운데로 옮겨 주세요",
      description: "정중앙에 가까울수록 자동 초점과 인식 속도가 좋아집니다.",
    };
  }

  if (state === "move-closer") {
    return {
      title: "QR을 조금 더 가까이 보여 주세요",
      description: "너무 가까이 붙이지 말고, 프레임 안에서 살짝만 키워 주세요.",
    };
  }

  if (state === "flatten-angle") {
    return {
      title: "카메라와 QR을 정면으로 맞춰 주세요",
      description: "비스듬하면 모서리 왜곡이 커져 인식이 느려질 수 있어요.",
    };
  }

  if (state === "searching") {
    return {
      title: "QR을 찾는 중이에요",
      description:
        facing === "front"
          ? "셀카 모드는 거울처럼 보입니다. 프레임 안에서 천천히 맞춰 주세요."
          : "프레임 안에 QR 하나만 보이도록 맞추면 바로 읽을 수 있어요.",
    };
  }

  return {
    title: "QR을 프레임에 맞춰 주세요",
    description:
      facing === "front"
        ? "셀카 모드에서는 1.2x 또는 1.5x 확대가 더 잘 읽히는 경우가 많아요."
        : "화면을 눌러 초점을 다시 맞추거나 두 손가락으로 확대할 수 있어요.",
  };
}

// Converts a normalized rectangle into absolute overlay coordinates.
export function getAbsoluteBounds(
  bounds: NormalizedBounds,
  width: number,
  height: number,
): NormalizedBounds {
  const nextBounds = normalizeBounds(bounds);
  return {
    x: nextBounds.x * width,
    y: nextBounds.y * height,
    width: nextBounds.width * width,
    height: nextBounds.height * height,
  };
}
