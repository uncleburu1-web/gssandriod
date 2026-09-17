/**
 * Minimal ESC/POS command encoder.
 *
 * Why this instead of a specific printer's SDK: ESC/POS is a de-facto
 * standard that the overwhelming majority of cheap Bluetooth thermal
 * receipt printers implement identically, regardless of brand (Xprinter,
 * Goojprt, generic 58mm/80mm, etc.) — so building against the raw command
 * set (rather than one vendor's library) is what makes this work on
 * whatever printer a shop happens to own, not just one specific model.
 *
 * This builds a plain byte array (Uint8Array). It never talks to
 * Bluetooth directly — btPrinter.js sends the bytes this produces.
 */

const ESC = 0x1b;
const GS = 0x1d;

export class ReceiptBuilder {
  constructor() {
    this.bytes = [];
    this._push(ESC, 0x40); // ESC @ — initialize printer (reset any leftover state)
  }

  _push(...vals) {
    this.bytes.push(...vals);
  }

  _text(str) {
    // Thermal printers expect single-byte-per-character text (CP437/similar).
    // Naira sign (₦) isn't in that range, so it's swapped for a plain "N"
    // here — it'll still read as "N1,500" rather than printing as garbage
    // bytes or a blank box, which is what would happen otherwise.
    const ascii = String(str ?? '').replace(/₦/g, 'N');
    for (let i = 0; i < ascii.length; i++) {
      const code = ascii.charCodeAt(i);
      this.bytes.push(code < 256 ? code : 0x3f); // '?' for anything non-encodable
    }
  }

  line(str = '') {
    this._text(str);
    this._push(0x0a); // LF
    return this;
  }

  blank(n = 1) {
    for (let i = 0; i < n; i++) this._push(0x0a);
    return this;
  }

  align(pos) {
    // 0 = left, 1 = center, 2 = right
    this._push(ESC, 0x61, pos);
    return this;
  }

  bold(on) {
    this._push(ESC, 0x45, on ? 1 : 0);
    return this;
  }

  doubleSize(on) {
    // GS ! — width/height multiplier. 0x11 = double both, 0x00 = normal.
    this._push(GS, 0x21, on ? 0x11 : 0x00);
    return this;
  }

  divider(char = '-', width = 32) {
    return this.line(char.repeat(width));
  }

  /** Two-column row — label on the left, value right-aligned, both on one line. */
  row(label, value, width = 32) {
    const l = String(label);
    const v = String(value);
    const padding = Math.max(1, width - l.length - v.length);
    this._text(l + ' '.repeat(padding) + v);
    this._push(0x0a);
    return this;
  }

  cutPaper() {
    this.blank(3);
    this._push(GS, 0x56, 0x00); // GS V 0 — full cut (most printers treat this as partial/tear if no cutter)
    return this;
  }

  toBytes() {
    return this.bytes;
  }

  /** Bluetooth Serial plugin needs a base64 string, not a raw byte array. */
  toBase64() {
    let binary = '';
    for (const b of this.bytes) binary += String.fromCharCode(b);
    return btoa(binary);
  }
}

export function buildReceiptEscPos(sale, shop, { cashReceived, change, footerNote } = {}) {
  const r = new ReceiptBuilder();
  const WIDTH = 32; // standard for 58mm paper; 80mm printers just leave extra margin, which is fine

  const items = sale.items && sale.items.length
    ? sale.items
    : [{ quantity: sale.quantity, item_name: sale.item_name, unit_price: sale.unit_price, total: sale.total }];

  const itemsSubtotal = items.reduce((s, i) => s + (i.subtotal ?? i.total ?? 0), 0);
  const itemsDiscount = items.reduce((s, i) => s + Number(i.discount || 0), 0);

  const money = (n) => 'N' + Number(n || 0).toLocaleString('en-NG', { maximumFractionDigits: 0 });
  const invoiceNo = sale.invoice_number ? `#${sale.invoice_number}` : `#${String(sale.id || '—').slice(0, 8).toUpperCase()}`;
  const dateStr = new Date(sale.date || Date.now()).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });

  r.align(1).doubleSize(true).bold(true).line(shop.name);
  r.doubleSize(false).bold(false);
  shop.addressLines.forEach((l) => r.line(l));
  shop.phones.forEach((p) => r.line(`Tel: ${p}`));
  if (shop.email) r.line(shop.email);

  r.align(0).divider();
  r.row('Invoice', invoiceNo, WIDTH);
  r.row('Date', dateStr, WIDTH);
  r.row('Customer', sale.customer_name || 'Walk-in', WIDTH);

  r.divider();
  items.forEach((item) => {
    r.line(item.item_name);
    r.row(`${item.quantity} x ${money(item.unit_price)}`, money(item.total), WIDTH);
  });

  r.divider();
  r.bold(true).row('GRAND TOTAL', money(itemsSubtotal), WIDTH).bold(false);
  r.row('Discount Amount', money(itemsDiscount), WIDTH);
  r.bold(true).row('TOTAL INVOICE', money(sale.total), WIDTH).bold(false);

  r.divider();
  const paymentLabel = sale.payment_method === 'pos'
    ? 'POS/Card'
    : (sale.payment_method || 'cash')[0].toUpperCase() + (sale.payment_method || 'cash').slice(1);
  r.row(`Payment (${paymentLabel})`, money(sale.total), WIDTH);
  if (sale.payment_method === 'cash' && cashReceived != null) {
    r.row('Received', money(cashReceived), WIDTH);
    r.row('Change', money(change), WIDTH);
  }
  if (sale.status === 'outstanding') {
    r.bold(true).row('Balance due', money(sale.balance_due), WIDTH).bold(false);
  }

  r.divider();
  r.align(1);
  r.line(`Attended by ${sale.staff_name || '-'}`);
  r.line(footerNote || 'Thanks for your patronage!!!');
  r.line('Goods received in good condition.');
  r.divider();
  r.line('Software by Gavin\'s Software Solutions (GSS)');
  r.line('ogbejoshua42@gmail.com . 0806 377 3201');

  r.cutPaper();
  return r;
}
