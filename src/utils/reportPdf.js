import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

/**
 * Draws a proper structured report PDF — real selectable text and real
 * vector tables, not a screenshot of the screen. The old approach
 * (utils/pdfExport.js, now removed) rendered the on-screen DOM to a
 * canvas with html2canvas and dropped that flattened image into a PDF
 * page by page; the result LOOKED like a document but was actually one
 * big raster image per page — blurry when zoomed, unselectable text, and
 * a table row could get sliced in half wherever a page happened to break,
 * because the image was cut at a fixed pixel height with no idea where a
 * row boundary was. This file replaces that entirely: every number here
 * is drawn as real text through jsPDF, and jspdf-autotable handles
 * pagination at row boundaries on its own.
 *
 * ₦ (U+20A6) isn't in jsPDF's built-in font encoding (same constraint as
 * the thermal printer — see escpos.js's comment on this), so amounts use
 * "N" here instead of the ₦ glyph the screen shows.
 */

const ACCENT = [42, 123, 196]; // #2A7BC4 — the app's actual --accent brand color (theme.css)
const SOFTWARE_CREDIT = 'Software by Gavin\'s Software Solutions (GSS)  ·  ogbejoshua42@gmail.com  ·  0806 377 3201';

function pdfMoney(n) {
  return 'N' + Number(n || 0).toLocaleString('en-NG', { maximumFractionDigits: 0 });
}

function addHeader(doc, shop, title, periodLabel) {
  const pageWidth = doc.internal.pageSize.getWidth();
  let y = 40;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(...ACCENT);
  doc.text(shop.name || 'My Shop', pageWidth / 2, y, { align: 'center' });
  y += 16;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(80, 80, 80);
  const subLines = [
    shop.address,
    [shop.phone && `Tel: ${shop.phone}`, shop.email].filter(Boolean).join('   '),
  ].filter(Boolean);
  subLines.forEach((l) => { doc.text(l, pageWidth / 2, y, { align: 'center' }); y += 12; });

  y += 6;
  doc.setDrawColor(...ACCENT);
  doc.setLineWidth(1.2);
  doc.line(40, y, pageWidth - 40, y);
  y += 20;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(20, 20, 20);
  doc.text(title + (periodLabel ? ` — ${periodLabel}` : ''), 40, y);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(120, 120, 120);
  doc.text(`Printed ${new Date().toLocaleString('en-GB')}`, pageWidth - 40, y, { align: 'right' });

  return y + 18;
}

/** Clean "Label ................ Value" summary rows, bank-statement style. */
function addStatBlock(doc, y, stats) {
  autoTable(doc, {
    startY: y,
    margin: { left: 40, right: 40 },
    body: stats.map((s) => [s.label, s.value]),
    theme: 'plain',
    styles: { font: 'helvetica', fontSize: 10.5, cellPadding: { top: 4, bottom: 4, left: 0, right: 0 } },
    columnStyles: {
      0: { textColor: [70, 70, 70] },
      1: { halign: 'right', fontStyle: 'bold', textColor: [20, 20, 20] },
    },
    didParseCell: (d) => {
      // Thin rule under every row except the last — the summary-box look
      // without a heavy full grid, which reads as more "statement-like".
      if (d.row.index < stats.length - 1) {
        d.cell.styles.lineWidth = { bottom: 0.5 };
        d.cell.styles.lineColor = [225, 225, 225];
      }
    },
  });
  return doc.lastAutoTable.finalY + 20;
}

/** Simple vector bar chart for the summary tab's sales trend — drawn with
 * rects, not an image, so it stays crisp and small in file size. */
function addBarChart(doc, y, series) {
  if (!series || !series.length) return y;
  const pageWidth = doc.internal.pageSize.getWidth();
  const chartWidth = pageWidth - 80;
  const chartHeight = 90;
  const max = Math.max(1, ...series.map((p) => p.sales || 0));
  const barGap = 3;
  const barWidth = Math.max(1, (chartWidth - barGap * (series.length - 1)) / series.length);

  doc.setFontSize(9);
  doc.setTextColor(90, 90, 90);
  doc.text('Sales trend', 40, y);
  y += 8;

  series.forEach((p, i) => {
    const h = Math.max(2, ((p.sales || 0) / max) * chartHeight);
    const x = 40 + i * (barWidth + barGap);
    doc.setFillColor(...(p.sales > 0 ? ACCENT : [225, 225, 225]));
    doc.rect(x, y + (chartHeight - h), barWidth, h, 'F');
  });
  y += chartHeight + 10;

  doc.setFontSize(8);
  doc.setTextColor(120, 120, 120);
  doc.text(series[0]?.label || '', 40, y);
  doc.text(series[series.length - 1]?.label || '', pageWidth - 40, y, { align: 'right' });
  return y + 20;
}

function addTable(doc, y, head, rows) {
  autoTable(doc, {
    startY: y,
    margin: { left: 40, right: 40 },
    head: [head],
    body: rows,
    theme: 'striped',
    headStyles: { fillColor: ACCENT, textColor: 255, fontStyle: 'bold', fontSize: 9 },
    styles: { font: 'helvetica', fontSize: 9, cellPadding: 5 },
    alternateRowStyles: { fillColor: [246, 248, 251] },
  });
  return doc.lastAutoTable.finalY + 20;
}

// Column headers + row-mapping per tab, matching the on-screen tables in
// Reports.jsx exactly. Numeric columns are right-aligned by convention
// (autoTable respects \t-free plain strings; alignment set via columnStyles
// would need per-index config, so numbers are pre-formatted and tables
// here are small enough that plain left/right text reads fine either way —
// kept simple rather than over-engineered per-column alignment maps).
const TABLE_TABS = {
  'by-item': {
    head: ['Item', 'Category', 'Total sold', 'Gross sale amt', 'Cost price', 'Gross profit', 'Discount', 'Margin'],
    rows: (d) => d.rows.map((r) => [r.item_name, r.category, r.total_sold, pdfMoney(r.gross_sale_amt), pdfMoney(r.cost_price), pdfMoney(r.gross_profit), pdfMoney(r.discount), `${r.margin}%`]),
  },
  'best-selling': {
    head: ['Rank', 'Item', 'Total sold', 'Gross sale amt'],
    rows: (d) => d.rows.map((r) => [`#${r.rank}`, r.item_name, r.total_sold, pdfMoney(r.gross_sale_amt)]),
  },
  'by-category': {
    head: ['Category', 'Total sold', 'Gross sale amt', 'Gross profit'],
    rows: (d) => d.rows.map((r) => [r.category, r.total_sold, pdfMoney(r.gross_sale_amt), pdfMoney(r.gross_profit)]),
  },
  'by-staff': {
    head: ['Staff', 'Number of sales', 'Gross sale amt', 'Gross profit'],
    rows: (d) => d.rows.map((r) => [r.staff_name, r.number_of_sales, pdfMoney(r.gross_sale_amt), pdfMoney(r.gross_profit)]),
  },
  'payment-method': {
    head: ['Method', 'Sales', 'Total'],
    rows: (d) => d.rows.map((r) => [{ cash: 'Cash', transfer: 'Transfer', pos: 'POS/Card' }[r.payment_method] || r.payment_method, r.count, pdfMoney(r.total)]),
  },
  'by-customer': {
    head: ['Customer', 'Number of sales', 'Total spent', 'Outstanding balance'],
    rows: (d) => d.rows.map((r) => [r.customer_name, r.number_of_sales, pdfMoney(r.total_spent), pdfMoney(r.outstanding_balance)]),
  },
  tax: {
    head: ['Tax rate', 'Taxable sales', 'Tax collected', 'Count'],
    rows: (d) => d.rows.map((r) => [`${r.tax_rate}%`, pdfMoney(r.taxable_sales), pdfMoney(r.tax_collected), r.count]),
  },
  expiring: {
    head: ['Item', 'Batch', 'Qty left', 'Expiry', 'Days left'],
    rows: (d) => d.rows.map((r) => [r.item_name, r.batch_number, r.quantity_remaining, r.expiry_date, r.is_expired ? 'Expired' : `${r.days_left}d`]),
  },
  valuation: {
    head: ['Item', 'Category', 'In stock', 'Cost', 'Inventory value', 'Selling value', 'Potential profit', 'Margin'],
    rows: (d) => d.rows.map((r) => [r.item_name, r.category, r.in_stock, pdfMoney(r.cost), pdfMoney(r.inventory_value), pdfMoney(r.total_selling_price_value), pdfMoney(r.potential_profit), `${r.margin}%`]),
  },
};

export async function exportReportPdf({ tab, tabLabel, data, shop, periodLabel, fileNameBase }) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  let y = addHeader(doc, shop, tabLabel, periodLabel);

  if (tab === 'summary') {
    y = addStatBlock(doc, y, [
      { label: 'Total sales', value: pdfMoney(data.total_sales) },
      { label: 'Product sales', value: pdfMoney(data.product_sales) },
      { label: 'Service revenue', value: pdfMoney(data.service_revenue) },
      { label: 'Gross profit', value: pdfMoney(data.gross_profit) },
      { label: 'Number of sales', value: String(data.number_of_sales ?? 0) },
      { label: 'Items sold', value: String(data.items_sold ?? 0) },
    ]);
    addBarChart(doc, y, data.series);
  } else if (tab === 'tax') {
    y = addStatBlock(doc, y, [{ label: 'Total tax collected', value: pdfMoney(data.total_tax_collected) }]);
    if (data.rows.length) addTable(doc, y, TABLE_TABS.tax.head, TABLE_TABS.tax.rows(data));
  } else if (tab === 'valuation') {
    y = addStatBlock(doc, y, [
      { label: 'Total inventory value', value: pdfMoney(data.total_inventory_value) },
      { label: 'Total selling price value', value: pdfMoney(data.total_selling_price_value) },
      { label: 'Potential profit', value: pdfMoney(data.potential_profit) },
      { label: 'Margin', value: `${data.margin}%` },
    ]);
    if (data.rows.length) addTable(doc, y, TABLE_TABS.valuation.head, TABLE_TABS.valuation.rows(data));
  } else if (TABLE_TABS[tab]) {
    const cfg = TABLE_TABS[tab];
    if (data.rows.length) addTable(doc, y, cfg.head, cfg.rows(data));
  }

  // Footer credit + page numbers on every page.
  const pageCount = doc.internal.getNumberOfPages();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(140, 140, 140);
    doc.text(SOFTWARE_CREDIT, pageWidth / 2, pageHeight - 24, { align: 'center' });
    doc.text(`Page ${i} of ${pageCount}`, pageWidth / 2, pageHeight - 14, { align: 'center' });
  }

  const base64 = doc.output('datauristring').split(',')[1];
  const fileName = `${fileNameBase}.pdf`;
  const written = await Filesystem.writeFile({ path: fileName, data: base64, directory: Directory.Cache });
  await Share.share({ title: fileNameBase, url: written.uri, dialogTitle: 'Save or print this report' });
}
