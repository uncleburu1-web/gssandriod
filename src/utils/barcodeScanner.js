import { BarcodeScanner } from '@capacitor-mlkit/barcode-scanning';

/**
 * Scans one barcode with the phone's camera via Google ML Kit's
 * ready-to-use scanner UI (no custom camera screen to build or maintain).
 * Returns the decoded string, or null if the user backed out of the
 * scanner without reading anything. Throws for anything that stops
 * scanning outright — no camera, permission refused, or (rarely) the
 * on-device scanner module missing — so callers can show that as a
 * normal, retryable error instead of a silent no-op or a crash.
 */
export async function scanBarcode() {
  const { supported } = await BarcodeScanner.isSupported();
  if (!supported) {
    throw new Error('This device cannot scan barcodes.');
  }

  const { camera } = await BarcodeScanner.requestPermissions();
  if (camera !== 'granted' && camera !== 'limited') {
    throw new Error('Camera permission is needed to scan a barcode.');
  }

  // scan() needs the Google Barcode Scanner module from Play Services.
  // Nearly every real device already has it bundled; this only kicks in
  // installation for the rare one that doesn't, rather than just failing.
  const { available } = await BarcodeScanner.isGoogleBarcodeScannerModuleAvailable();
  if (!available) {
    await BarcodeScanner.installGoogleBarcodeScannerModule();
  }

  const { barcodes } = await BarcodeScanner.scan();
  return barcodes.length > 0 ? barcodes[0].rawValue : null;
}
