import { Capacitor } from '@capacitor/core';

// Which native shell (if any) the web code is running inside. Capacitor
// reports 'android', 'ios', or 'web' (a normal browser tab) — centralised
// here so the Android-only and iOS-only code paths all ask the same way.
export const platform = Capacitor.getPlatform();
export const isAndroid = platform === 'android';
export const isIos = platform === 'ios';
