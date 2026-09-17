import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

/**
 * Renders `element` to a PDF and opens Android's native share sheet for it
 * (Save to Files / Drive, send via WhatsApp/email, or print through any
 * printing service installed on the device — Android has no working
 * `window.print()` inside a WebView, so this is the working substitute).
 *
 * Temporarily adds the `exporting-pdf` class to <body> so the print-only
 * report header becomes visible and the app chrome (sidebar, topbar, tab
 * strip) hides for the snapshot — see the matching CSS block in theme.css
 * right after the @media print rules — then removes it again once the
 * snapshot is taken, whether or not export succeeded.
 */
export async function exportElementAsPdf(elementId, fileNameBase) {
  const el = document.getElementById(elementId);
  if (!el) throw new Error('Nothing to export yet — wait for the report to finish loading.');

  document.body.classList.add('exporting-pdf');
  try {
    const canvas = await html2canvas(el, { scale: 2, backgroundColor: '#ffffff', useCORS: true });
    const imgData = canvas.toDataURL('image/jpeg', 0.92);

    const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const imgWidth = pageWidth;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    let heightLeft = imgHeight;
    let position = 0;
    pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;
    while (heightLeft > 0) {
      position -= pageHeight;
      pdf.addPage();
      pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
    }

    const base64 = pdf.output('datauristring').split(',')[1];
    const fileName = `${fileNameBase}.pdf`;
    const written = await Filesystem.writeFile({ path: fileName, data: base64, directory: Directory.Cache });
    await Share.share({ title: fileNameBase, url: written.uri, dialogTitle: 'Save or print this report' });
  } finally {
    document.body.classList.remove('exporting-pdf');
  }
}
