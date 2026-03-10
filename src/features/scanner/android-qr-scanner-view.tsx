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
  ScannerFacing,
  ScannerFocusStateEvent,
  ScannerPotentialBarcodesEvent,
  ScannerZoomSuggestionEvent,
} from "./scanner-assist";

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

// Renders the Android-only CameraX and ML Kit scanner view when available.
export function AndroidQrScannerView(props: AndroidQrScannerViewProps) {
  if (!NativeAndroidQrScannerView) {
    return <View {...props} />;
  }

  return <NativeAndroidQrScannerView {...props} />;
}
