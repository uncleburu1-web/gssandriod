import jsPDF from 'jspdf';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

/**
 * iPhone/iPad receipt printing.
 *
 * iOS doesn't let apps talk to ordinary Bluetooth (SPP) thermal printers —
 * that's an Apple restriction, not something this app can work around — so
 * the Android path in btPrinter.js has no iOS equivalent. Instead the very
 * same receipt (taken from the ReceiptBuilder's recorded lines, so there is
 * only ONE copy of the receipt layout) is drawn as a narrow 80 mm PDF and
 * handed to iOS's share sheet, which has "Print" (AirPrint), "Save to
 * Files", WhatsApp, Mail, etc.
 */

const PAGE_W = 226.77;        // 80 mm in points
const COLS = 32;              // same column count the thermal receipt is laid out in
const FONT_SIZE = 10;         // Courier is 0.6em wide -> 6pt per character...
const BLOCK_W = COLS * FONT_SIZE * 0.6; // ...so 32 columns = 192pt
const X0 = (PAGE_W - BLOCK_W) / 2;
const LEADING = 12.5;
const BIG_FONT_SIZE = 16;     // the shop-name line (printer "double size")
const BIG_LEADING = 19;
const MARGIN_TOP = 16;
const MARGIN_BOTTOM = 20;

/** Lays the recorded receipt lines out, then draws them on a page exactly tall enough. */
export function buildReceiptPdfBase64(builder) {
  const entries = builder.entries || [];

  // Pass 1: measure. Long lines (e.g. a long shop name or item name) wrap
  // here the same way the printer would wrap them, so page height is right.
  const probe = new jsPDF({ unit: 'pt', format: [PAGE_W, 1000] });
  const ops = [];
  let y = MARGIN_TOP;
  entries.forEach((e) => {
    if (e.kind === 'blank') {
      y += LEADING * e.count;
      return;
    }
    const size = e.big ? BIG_FONT_SIZE : FONT_SIZE;
    const lead = e.big ? BIG_LEADING : LEADING;
    probe.setFont('courier', e.bold || e.big ? 'bold' : 'normal');
    probe.setFontSize(size);
    const wrapped = e.text === '' ? [''] : probe.splitTextToSize(e.text, BLOCK_W);
    wrapped.forEach((chunk) => {
      ops.push({ text: chunk, y: y + size, size, bold: e.bold || e.big, align: e.align });
      y += lead;
    });
  });

  // The printer's trailing paper-feed (cutPaper) is just blank space here.
  // (Kept taller than the page is wide: jsPDF treats a "portrait" page that is
  // wider than it is tall as a mistake and swaps the two.)
  const height = Math.max(300, y + MARGIN_BOTTOM);

  // Pass 2: draw.
  const doc = new jsPDF({ unit: 'pt', format: [PAGE_W, height] });
  doc.setTextColor(0, 0, 0);
  ops.forEach((op) => {
    doc.setFont('courier', op.bold ? 'bold' : 'normal');
    doc.setFontSize(op.size);
    if (op.align === 1) doc.text(op.text, PAGE_W / 2, op.y, { align: 'center' });
    else if (op.align === 2) doc.text(op.text, X0 + BLOCK_W, op.y, { align: 'right' });
    else doc.text(op.text, X0, op.y);
  });

  return doc.output('datauristring').split(',')[1];
}

/** Builds the receipt PDF and opens the iOS share sheet (Print / Save / Send). */
export async function shareReceiptPdf(builder, sale) {
  const base64 = buildReceiptPdfBase64(builder);
  const ref = sale.invoice_number || String(sale.id || 'receipt').slice(0, 8);
  const fileName = `Receipt-${ref}.pdf`.replace(/[^\w.-]+/g, '_');
  const written = await Filesystem.writeFile({ path: fileName, data: base64, directory: Directory.Cache });
  await Share.share({ title: `Receipt ${ref}`, url: written.uri });
}
