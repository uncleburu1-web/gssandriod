import { buildReceiptEscPos } from './escpos';
import { printToSavedPrinter, isAvailable, getSavedPrinterAddress } from './btPrinter';

// Falls back to these only if the caller doesn't pass real shop info —
// callers (Sales.jsx) pass the logged-in user's own shop details instead,
// so every business's printer shows ITS OWN name/address here, never a
// hardcoded one left over from a single old deployment.
const DEFAULT_SHOP = {
  name: 'My Shop',
  addressLines: [],
  phones: [],
  email: '',
};

/**
 * Prints a sale receipt to the shop's paired Bluetooth thermal printer,
 * using the same compact layout as the desktop app's receipt (GRAND TOTAL /
 * Discount / Total Invoice rows, "Attended by", software-credit footer) —
 * rather than the web app's full-page formal invoice, since a thermal
 * printer can't render that at all. Thermal printers also can't render a
 * logo image the way the web invoice can (see utils/receipt.js there) —
 * shopInput.logoUrl is accepted for consistency but simply isn't used here.
 *
 * This ONLY works inside the installed Android app (where the Bluetooth
 * Serial plugin actually exists) — calling it from a regular browser tab
 * throws a clear error instead of silently doing nothing.
 */
export async function printSaleReceipt(sale, shopInput = {}, extra = {}) {
  if (!isAvailable()) {
    alert('Receipt printing only works in the installed app, not in a browser.');
    return;
  }
  if (!getSavedPrinterAddress()) {
    alert('No printer set up yet.\n\nGo to the Printer Setup page, pick your Bluetooth printer, and try again.');
    return;
  }
  const SHOP = {
    name: shopInput.name || DEFAULT_SHOP.name,
    addressLines: shopInput.addressLines || (shopInput.address ? [shopInput.address] : DEFAULT_SHOP.addressLines),
    phones: shopInput.phones || (shopInput.phone ? [shopInput.phone] : DEFAULT_SHOP.phones),
    email: shopInput.email || DEFAULT_SHOP.email,
  };
  try {
    const builder = buildReceiptEscPos(sale, SHOP, { ...extra, footerNote: shopInput.footerNote });
    await printToSavedPrinter(builder);
  } catch (err) {
    alert(`Could not print receipt: ${err.message || err}`);
  }
}
