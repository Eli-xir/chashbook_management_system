import type { FiltersState, Head, Transaction } from '../Admin/types';
import { ledgerReport } from './ledgerModel.ts';

export function attachmentTransactions(entries: Transaction[], filters: FiltersState, heads: Head[]) {
  return ledgerReport(entries, filters, 'by-time', heads).rows.map(({ entry }) => entry).filter((entry) => entry.attachments.length);
}

export type EvidenceImage = { url: string; name: string; caption: string };
export async function attachmentPdf(images: EvidenceImage[], title: string, perPage: number): Promise<File> {
  if (!images.length) throw new Error('No images in this selection.');
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
  const columns = perPage <= 2 ? 1 : 2, rows = perPage / columns;
  const width = 186 / columns, height = 253 / rows;
  for (let index = 0; index < images.length; index++) {
    if (index && index % perPage === 0) pdf.addPage();
    if (index % perPage === 0) {
      pdf.setFontSize(11); pdf.text('SOHAIL MALIK ARCHITECTS', 12, 12);
      pdf.setFontSize(9); pdf.text(pdf.splitTextToSize(title, 186).slice(0, 1), 12, 19);
      pdf.text(`Page ${Math.floor(index / perPage) + 1} / ${Math.ceil(images.length / perPage)}`, 12, 289);
    }
    const item = images[index];
    const response = await fetch(item.url, { credentials: 'same-origin' });
    if (!response.ok) throw new Error(`Could not load ${item.name}. Refresh and try again.`);
    const url = URL.createObjectURL(await response.blob());
    try {
      const image = new Image(); image.src = url; await image.decode();
      const scale = Math.min(1, 2400 / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Image export is unavailable in this browser.');
      context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const cell = index % perPage, x = 12 + cell % columns * width, y = 25 + Math.floor(cell / columns) * height;
      const fit = Math.min((width - 4) / canvas.width, (height - 17) / canvas.height);
      pdf.addImage(canvas.toDataURL('image/jpeg', .9), 'JPEG', x + (width - 4 - canvas.width * fit) / 2, y, canvas.width * fit, canvas.height * fit);
      pdf.setFontSize(8); pdf.text(pdf.splitTextToSize(item.caption, width - 4).slice(0, 3), x, y + height - 12);
    } finally { URL.revokeObjectURL(url); }
  }
  return new File([pdf.output('blob')], 'transaction-attachments.pdf', { type: 'application/pdf' });
}
