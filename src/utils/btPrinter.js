/**
 * Thin wrapper around cordova-plugin-bluetooth-serial's callback-style API,
 * turned into promises. This plugin talks classic Bluetooth (SPP), which is
 * what virtually every cheap thermal receipt printer uses — NOT Bluetooth
 * Low Energy, so this deliberately does not use @capacitor-community/bluetooth-le.
 *
 * IMPORTANT — the printer must already be PAIRED with the Android device via
 * the phone's own Bluetooth settings (Settings > Bluetooth > Pair new device)
 * before it will show up in list(). This module only connects to an already-
 * paired device; it doesn't handle first-time pairing/PIN entry itself,
 * since Android's own pairing UI already handles that reliably.
 */

import { ReceiptBuilder } from './escpos';

const STORAGE_KEY = 'benchline_printer_address';

function getPermissionsPlugin() {
  return typeof window !== 'undefined' ? window.cordova?.plugins?.permissions : undefined;
}

/**
 * Android 12+ (API 31+) requires BLUETOOTH_CONNECT to be granted at
 * RUNTIME, not just declared in the manifest — and cordova-plugin-
 * bluetooth-serial predates that model, so it never asks for it itself.
 * This fills that gap using cordova-plugin-android-permissions instead.
 * On Android 11 and below this permission doesn't need a runtime prompt
 * at all, and checkPermission simply resolves as already-granted there.
 */
function ensureBluetoothPermission() {
  return new Promise((resolve) => {
    const perms = getPermissionsPlugin();
    if (!perms) return resolve(true); // running outside the app (or plugin missing) — let the real call surface any error
    const permission = perms.BLUETOOTH_CONNECT || 'android.permission.BLUETOOTH_CONNECT';
    perms.checkPermission(
      permission,
      (status) => {
        if (status.hasPermission) return resolve(true);
        perms.requestPermission(
          permission,
          (status2) => resolve(!!status2.hasPermission),
          () => resolve(false)
        );
      },
      () => resolve(false)
    );
  });
}

function getPlugin() {
  // Injected globally by the Cordova plugin at runtime inside the Android
  // WebView — won't exist at all in a normal desktop browser, which is
  // expected (and checked for) everywhere this is called from.
  return typeof window !== 'undefined' ? window.bluetoothSerial : undefined;
}

export function isAvailable() {
  return !!getPlugin();
}

export function getSavedPrinterAddress() {
  return localStorage.getItem(STORAGE_KEY);
}

export function savePrinterAddress(address) {
  localStorage.setItem(STORAGE_KEY, address);
}

export function clearSavedPrinter() {
  localStorage.removeItem(STORAGE_KEY);
}

export function isBluetoothEnabled() {
  const plugin = getPlugin();
  return new Promise((resolve) => {
    if (!plugin) return resolve(false);
    plugin.isEnabled(() => resolve(true), () => resolve(false));
  });
}

/** List devices already paired via Android's own Bluetooth settings. */
export async function listPairedDevices() {
  const plugin = getPlugin();
  if (!plugin) throw new Error('Bluetooth plugin not available — are you running inside the Android app?');
  const granted = await ensureBluetoothPermission();
  if (!granted) throw new Error('Bluetooth permission was denied. Enable it for this app in Android Settings > Apps > Benchline POS > Permissions.');
  return new Promise((resolve, reject) => {
    plugin.list(
      (devices) => resolve(devices || []),
      (err) => reject(new Error(err || 'Could not list paired Bluetooth devices.'))
    );
  });
}

async function connect(address) {
  const plugin = getPlugin();
  if (!plugin) throw new Error('Bluetooth plugin not available.');
  const granted = await ensureBluetoothPermission();
  if (!granted) throw new Error('Bluetooth permission was denied. Enable it for this app in Android Settings > Apps > Benchline POS > Permissions.');
  return new Promise((resolve, reject) => {
    plugin.connect(
      address,
      () => resolve(),
      (err) => reject(new Error(err || `Could not connect to printer at ${address}.`))
    );
  });
}

function disconnect() {
  const plugin = getPlugin();
  return new Promise((resolve) => {
    if (!plugin) return resolve();
    plugin.disconnect(() => resolve(), () => resolve());
  });
}

function writeBase64(base64Data) {
  const plugin = getPlugin();
  return new Promise((resolve, reject) => {
    if (!plugin) return reject(new Error('Bluetooth plugin not available.'));
    plugin.write(
      { data: base64Data },
      () => resolve(),
      (err) => reject(new Error(err || 'Failed to send data to printer.'))
    );
  });
}

/**
 * Connects to the saved printer, sends the given ESC/POS bytes (as a
 * ReceiptBuilder instance from escpos.js), then disconnects. Every step is
 * wrapped so a failure at any point (printer off, out of range, paper out)
 * surfaces as one clear error rather than leaving a half-open connection.
 */
export async function printToSavedPrinter(receiptBuilder) {
  const address = getSavedPrinterAddress();
  if (!address) {
    throw new Error('No printer set up yet. Go to Printer Setup and select your Bluetooth printer first.');
  }
  if (!isAvailable()) {
    throw new Error('Bluetooth printing only works inside the installed Android app, not in a web browser.');
  }
  try {
    await connect(address);
    await writeBase64(receiptBuilder.toBase64());
  } finally {
    await disconnect();
  }
}

/**
 * Connects to a specific device address (used by the Printer Setup screen
 * to verify a device actually prints before saving it as "the" printer),
 * sends a short test message, then disconnects.
 */
export async function testPrint(address) {
  if (!isAvailable()) {
    throw new Error('Bluetooth printing only works inside the installed Android app.');
  }
  const r = new ReceiptBuilder();
  r.align(1).bold(true).line('Benchline POS').bold(false);
  r.line('Test print successful!');
  r.line(new Date().toLocaleString());
  r.cutPaper();
  try {
    await connect(address);
    await writeBase64(r.toBase64());
  } finally {
    await disconnect();
  }
}
