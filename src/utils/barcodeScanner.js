import { BarcodeScanner, BarcodeFormat } from '@capacitor-mlkit/barcode-scanning';

// Every extra format ML Kit has to check a frame against costs scanning
// speed — these seven cover essentially anything a shop's stock carries,
// so we don't pay for QR/Aztec/PDF417/etc detection nobody here needs.
const RETAIL_FORMATS = [
  BarcodeFormat.Ean13,
  BarcodeFormat.Ean8,
  BarcodeFormat.UpcA,
  BarcodeFormat.UpcE,
  BarcodeFormat.Code128,
  BarcodeFormat.Code39,
  BarcodeFormat.Itf,
];

// startScan() renders the native camera preview BEHIND the WebView, and
// the WebView only shows it through where the page has stopped rendering
// entirely — background:transparent on a single nested div isn't enough,
// because ancestors (e.g. body's own opaque background) still paint over
// it. Toggling this class is what actually punches the hole: see
// `body.scanner-active` / `.scanner-overlay` in theme.css, where the
// overlay is the one thing explicitly set back to visibility:visible.
const SCANNER_ACTIVE_CLASS = 'scanner-active';

async function ensureReady() {
  const { supported } = await BarcodeScanner.isSupported();
  if (!supported) {
    throw new Error('This device cannot scan barcodes.');
  }

  const { camera } = await BarcodeScanner.requestPermissions();
  if (camera !== 'granted' && camera !== 'limited') {
    throw new Error('Camera permission is needed to scan a barcode.');
  }

  // Needs the Google Barcode Scanner module from Play Services. Nearly
  // every real device already has it bundled; this only kicks in
  // installation for the rare one that doesn't, rather than just
  // failing. iOS has no equivalent step — ML Kit ships the model
  // in-app there, so this is a no-op on iOS (isGoogleBarcodeScannerModuleAvailable
  // resolves `available: true` on iOS per the plugin's own docs).
  const { available } = await BarcodeScanner.isGoogleBarcodeScannerModuleAvailable();
  if (!available) {
    await BarcodeScanner.installGoogleBarcodeScannerModule();
  }
}

/**
 * Scans one barcode with the phone's camera via Google ML Kit's
 * ready-to-use scanner UI (no custom camera screen to build or maintain).
 * Returns the decoded string, or null if the user backed out of the
 * scanner without reading anything. Throws for anything that stops
 * scanning outright — no camera, permission refused, or (rarely) the
 * on-device scanner module missing — so callers can show that as a
 * normal, retryable error instead of a silent no-op or a crash.
 *
 * This is the right tool for a ONE-OFF read (e.g. Inventory's "scan a
 * barcode to fill in this field") — it opens, reads once, and closes
 * itself. For a POS checkout scanning many items in a row, use
 * startContinuousScan()/stopContinuousScan() below instead; scan()'s
 * dialog has no "keep going" mode.
 */
export async function scanBarcode() {
  await ensureReady();
  const { barcodes } = await BarcodeScanner.scan({ formats: RETAIL_FORMATS });
  return barcodes.length > 0 ? barcodes[0].rawValue : null;
}

// The one listener a continuous scan session owns, so stopContinuousScan()
// always has something concrete to remove — see below.
let activeListener = null;

/**
 * POS-style continuous scanning: the camera stays live and onBarcode(code)
 * fires for every distinct read, until stopContinuousScan() is called —
 * unlike scan() above, which shows a one-shot dialog and closes itself
 * after a single read. This needs the plugin's lower-level,
 * build-your-own-UI API (startScan() + the 'barcodeScanned' listener),
 * not scan()'s ready-made dialog.
 *
 * While this runs, the native camera preview renders BEHIND the app's
 * WebView. This function makes that visible itself, by adding
 * SCANNER_ACTIVE_CLASS to <body> (see theme.css: body.scanner-active
 * goes visibility:hidden, and .scanner-overlay is set back to
 * visibility:visible) — the caller (see ScannerOverlay in Sales.jsx)
 * just needs to keep rendering under that `.scanner-overlay` class name
 * for the hole to line up with its UI.
 *
 * Deliberately does no debouncing here — a steady barcode can fire this
 * callback many times a second while it's in frame. The caller decides
 * what "the same item is still sitting in view" vs. "a second item was
 * scanned" means for its own UI (see handleBarcodeDetected in Sales.jsx).
 */
export async function startContinuousScan(onBarcode) {
  await ensureReady();
  activeListener = await BarcodeScanner.addListener('barcodeScanned', (event) => {
    // The plugin's docs don't pin down whether `barcode` on this event
    // is a raw string or a Barcode object (scan()'s result is
    // unambiguously the latter) — handle both rather than assume, since
    // this can't be verified without a real device to test against.
    const raw = event?.barcode;
    const code = (raw && typeof raw === 'object') ? raw.rawValue : raw;
    if (code) onBarcode(code);
  });
  document.body.classList.add(SCANNER_ACTIVE_CLASS);
  try {
    await BarcodeScanner.startScan({ formats: RETAIL_FORMATS });
  } catch (err) {
    // Never leave the page invisible if the camera itself failed to start.
    document.body.classList.remove(SCANNER_ACTIVE_CLASS);
    if (activeListener) {
      await activeListener.remove();
      activeListener = null;
    }
    throw err;
  }
}

/** Stops the camera and detection stream started by startContinuousScan(). */
export async function stopContinuousScan() {
  // Removed first and unconditionally, so the page is never left
  // invisible even if the listener/stopScan calls below throw.
  document.body.classList.remove(SCANNER_ACTIVE_CLASS);
  if (activeListener) {
    await activeListener.remove();
    activeListener = null;
  }
  await BarcodeScanner.stopScan();
}