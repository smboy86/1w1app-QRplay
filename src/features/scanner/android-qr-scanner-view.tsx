import React from "react";
import {
  requireNativeComponent,
  View,
  type NativeSyntheticEvent,
  type StyleProp,
  type ViewProps,
  type ViewStyle,
} from "react-native";

import type {
  ScannerBarcodeEvent,
  ScannerFocusStateEvent,
  ScannerPotentialBarcodesEvent,
  ScannerZoomSuggestionEvent,
} from "./scanner-assist";
import type { ScannerFacing } from "./scanner-types";

type TapFocusRequest = {
  requestId: number;
  x: number;
  y: number;
};

export type AndroidQrScannerViewProps = ViewProps & {
  active?: boolean;
  facing: ScannerFacing;
  onBarcodeScanned?: (
    event: NativeSyntheticEvent<ScannerBarcodeEvent>,
  ) => void;
  onFocusStateChanged?: (
    event: NativeSyntheticEvent<ScannerFocusStateEvent>,
  ) => void;
  onPotentialBarcodes?: (
    event: NativeSyntheticEvent<ScannerPotentialBarcodesEvent>,
  ) => void;
  onZoomSuggestion?: (
    event: NativeSyntheticEvent<ScannerZoomSuggestionEvent>,
  ) => void;
  style?: StyleProp<ViewStyle>;
  tapFocusRequest?: TapFocusRequest | null;
  zoomLevel: number;
};

const NativeAndroidQrScannerView =
  process.env.EXPO_OS === "android"
    ? requireNativeComponent<AndroidQrScannerViewProps>("AndroidQrScannerView")
    : null;

// 사용 가능할 때 안드로이드 전용 CameraX 및 ML Kit 스캐너 뷰를 렌더링한다.
export function AndroidQrScannerView(props: AndroidQrScannerViewProps) {
  if (!NativeAndroidQrScannerView) {
    return <View {...props} />;
  }

  return <NativeAndroidQrScannerView {...props} />;
}
