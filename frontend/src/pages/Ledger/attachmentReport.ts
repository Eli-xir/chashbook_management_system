import type { FiltersState, Head, Transaction } from '../Admin/types';
import { ledgerReport } from './ledgerModel.ts';

export function attachmentTransactions(entries: Transaction[], filters: FiltersState, heads: Head[]) {
  return ledgerReport(entries, filters, 'by-time', heads).rows.map(({ entry }) => entry).filter((entry) => entry.attachments.length);
}

export type EvidenceRecord = { entry: Transaction; cells: (string | number)[] };
export async function attachmentPdf(records: EvidenceRecord[], reportDocument: import('./ledgerExport').ReportDocument, perPage: number, loadAttachment: (id: string) => Promise<Blob>): Promise<File> {
  if (!records.length) throw new Error('No transactions in this selection.');
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
  const format = (value: string | number) => typeof value === 'number' ? `PKR ${value.toLocaleString('en-PK')}` : value;
  const linesFor = (cells: (string | number)[]) => cells.flatMap((value, index) => value === '' ? [] : pdf.splitTextToSize(`${reportDocument.columns[index]}: ${format(value)}`, 67) as string[]);
  let y = 28;
  const header = () => {
    pdf.setFontSize(11); pdf.text('SOHAIL MALIK ARCHITECTS', 12, 12);
    pdf.setFontSize(9); pdf.text(pdf.splitTextToSize(reportDocument.title, 186).slice(0, 1), 12, 19);
    pdf.setFontSize(8);
  };
  header();
  // Include opening and closing totals, and never drop transactions without media.
  const first = reportDocument.pages[0]?.[0], last = reportDocument.pages.at(-1)?.at(-1);
  if (first) { pdf.text(`${first[0]}: ${format(first.at(-1) ?? 0)}`, 12, y); y += 8; }
  for (const { entry, cells } of records) {
    const images = entry.attachments.filter((attachment) => attachment.kind === 'image');
    const voiceCount = entry.attachments.filter((attachment) => attachment.kind === 'voice').length;
    for (const [index, attachment] of (images.length ? images : [null]).entries()) {
      const lines = linesFor(cells);
      if (images.length > 1) lines.push(`Image ${index + 1} of ${images.length}`);
      if (voiceCount) lines.push(`${voiceCount} voice note(s) available in the app`);
      if (!entry.attachments.length) lines.push('No attachments');
      let imageData: { data: string; width: number; height: number } | null = null;
      if (attachment) {
        let url = '';
        try {
          url = URL.createObjectURL(await loadAttachment(attachment.id));
          const image = new Image(); image.src = url; await image.decode();
          const scale = Math.min(1, 2400 / Math.max(image.naturalWidth, image.naturalHeight));
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
          const context = canvas.getContext('2d');
          if (!context) throw new Error('Image export is unavailable in this browser.');
          context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height);
          context.drawImage(image, 0, 0, canvas.width, canvas.height);
          imageData = { data: canvas.toDataURL('image/jpeg', .9), width: canvas.width, height: canvas.height };
        } catch (cause) {
          throw new Error(`${attachment.name}: ${cause instanceof Error ? cause.message : 'Could not prepare image.'}`);
        } finally { if (url) URL.revokeObjectURL(url); }
      }
      // Long descriptions continue on another page instead of being truncated.
      for (let start = 0; start < lines.length; start += 65) {
        const text = lines.slice(start, start + 65);
        const height = Math.max(imageData && start === 0 ? 245 / perPage : 20, text.length * 3.5 + 8);
        if (y + height > 276) { pdf.addPage(); header(); y = 28; }
        pdf.text(text, 12, y + 4);
        if (imageData && start === 0) {
          const fit = Math.min(110 / imageData.width, (height - 5) / imageData.height);
          pdf.addImage(imageData.data, 'JPEG', 88, y, imageData.width * fit, imageData.height * fit);
        }
        y += height;
        pdf.setDrawColor(210); pdf.setLineWidth(.15); pdf.line(12, y, 198, y); y += 3;
      }
    }
  }
  if (last) {
    if (y + 18 > 278) { pdf.addPage(); header(); y = 28; }
    pdf.text(`${last[0]}: ${format(last.at(-1) ?? 0)}`, 12, y + 5);
    pdf.text(`Credits: ${format(last[5] ?? '')}    Debits: ${format(last[6] ?? '')}`, 12, y + 11);
  }
  for (let page = 1; page <= pdf.getNumberOfPages(); page++) {
    pdf.setPage(page); pdf.setFontSize(8); pdf.text(`Page ${page} / ${pdf.getNumberOfPages()}`, 12, 289);
  }
  return new File([pdf.output('blob')], 'statement-with-attachments.pdf', { type: 'application/pdf' });
}
