import type { FiltersState, Head, Transaction } from '../Admin/types';
import { ledgerReport } from './ledgerModel.ts';

export function attachmentTransactions(entries: Transaction[], filters: FiltersState, heads: Head[]) {
  return ledgerReport(entries, filters, 'by-time', heads).rows.map(({ entry }) => entry).filter((entry) => entry.attachments.length);
}

// Choose the orientation that prints the source at the largest scale, without cropping.
export function imageOrientation(width: number, height: number, boxWidth: number, boxHeight: number) {
  const upright = Math.min(boxWidth / width, boxHeight / height);
  const rotated = Math.min(boxWidth / height, boxHeight / width);
  return rotated > upright * 1.05;
}

export function expandImageSlots(slots: { height: number; imageHeight: number }[], available: number) {
  const spare = Math.max(0, available - slots.reduce((sum, slot) => sum + slot.height, 0));
  const count = slots.filter((slot) => slot.imageHeight > 0).length;
  return slots.map((slot) => slot.imageHeight + (slot.imageHeight > 0 ? spare / count : 0));
}

export type EvidenceRecord = { entry: Transaction; cells: (string | number)[] };
export async function attachmentPdf(records: { entry: Pick<Transaction, 'attachments'>; cells: (string | number)[] }[], reportDocument: import('./ledgerExport').ReportDocument, perPage: number, loadAttachments: (ids: string[]) => Promise<Record<string, string>>, imagesOnly = false): Promise<File> {
  if (!records.length) throw new Error('No transactions in this selection.');
  const ids = [...new Set(records.flatMap(({ entry }) => entry.attachments.filter((a) => a.kind === 'image').map((a) => a.id)))];
  if (imagesOnly && !ids.length) throw new Error('No images in this selection.');
  const imageSources = ids.length ? await loadAttachments(ids) : {};
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
  const format = (value: string | number) => typeof value === 'number' ? `PKR ${value.toLocaleString('en-PK')}` : value;
  const linesFor = (cells: (string | number)[], amounts = false) => pdf.splitTextToSize(cells.flatMap((value, index) => value === '' || ['Credit', 'Debit', 'Balance'].includes(reportDocument.columns[index]) !== amounts ? [] : [`${reportDocument.columns[index]}: ${format(value)}`]).join('    |    '), 186) as string[];
  pdf.setFontSize(8);
  const subtitleLines = reportDocument.subtitle ? pdf.splitTextToSize(reportDocument.subtitle, 186) as string[] : [];
  const pageTop = imagesOnly ? 12 : 28 + subtitleLines.length * 3.5;
  let y = pageTop;
  const header = () => {
    if (imagesOnly) return;
    pdf.setFontSize(11); pdf.text('SOHAIL MALIK ARCHITECTS', 12, 12);
    pdf.setFontSize(9); pdf.text(pdf.splitTextToSize(reportDocument.title, 186).slice(0, 1), 12, 19);
    pdf.setFontSize(8);
    if (subtitleLines.length) pdf.text(subtitleLines, 12, 25);
  };
  header();
  // Include opening and closing totals, and never drop transactions without media.
  const first = imagesOnly ? undefined : reportDocument.pages[0]?.[0], last = imagesOnly ? undefined : reportDocument.pages.at(-1)?.at(-1);
  if (first) { pdf.text(`${first[0]}: ${format(first.at(-1) ?? 0)}`, 12, y); y += 8; }
  type Block = { text: string[]; amounts: string[]; image: HTMLImageElement | null; imageHeight: number; height: number };
  const blocks: Block[] = [];
  for (const { entry, cells } of records) {
    const images = entry.attachments.filter((attachment) => attachment.kind === 'image');
    if (imagesOnly && !images.length) continue;
    const voiceCount = entry.attachments.filter((attachment) => attachment.kind === 'voice').length;
    for (const [index, attachment] of (images.length ? images : [null]).entries()) {
      const lines = imagesOnly ? [] : linesFor(cells);
      if (!imagesOnly && images.length > 1) lines.push(`Image ${index + 1} of ${images.length}`);
      if (!imagesOnly && voiceCount) lines.push(`${voiceCount} voice note(s) available in the app`);
      if (!entry.attachments.length) lines.push('No attachments');
      const amountLines = imagesOnly ? [] : linesFor(cells, true);
      const amountHeight = amountLines.length * 3.5 + 5;
      const imageBoxHeight = Math.max(40, (276 - pageTop) / perPage - (Math.min(lines.length, 45) * 3.5 + 6) - amountHeight - 3);
      let imageData: HTMLImageElement | null = null;
      if (attachment) {
        try {
          const source = imageSources[attachment.id];
          if (!source) throw new Error('Image was missing from the export response.');
          const image = new Image(); image.src = source; await image.decode();
          imageData = image;
        } catch (cause) {
          throw new Error(`${attachment.name}: ${cause instanceof Error ? cause.message : 'Could not prepare image.'}`);
        }
      }
      // Long descriptions continue on another page instead of being truncated.
      for (let start = 0; start < Math.max(1, lines.length); start += 45) {
        const text = lines.slice(start, start + 45);
        const textHeight = text.length * 3.5 + 6;
        const imageHeight = imageData && start === 0 ? imageBoxHeight : 0;
        const height = textHeight + imageHeight + (start === 0 ? amountHeight : 0);
        blocks.push({ text, amounts: start === 0 ? amountLines : [], image: start === 0 ? imageData : null, imageHeight, height: height + 3 });
      }
    }
  }
  // Pack first, then share unused page height between the actual images on that page.
  // Reserve closing totals on the final page rather than pushing them onto a new sheet.
  for (let cursor = 0; cursor < blocks.length;) {
    const pageBlocks: Block[] = [];
    let used = 0, count = 0;
    while (cursor < blocks.length) {
      const block = blocks[cursor];
      const reserve = cursor === blocks.length - 1 && last ? 18 : 0;
      if (pageBlocks.length && (used + block.height > 276 - y - reserve || block.image && count >= perPage)) break;
      if (!pageBlocks.length && block.height > 276 - y - reserve && block.image) {
        const reduction = block.height - (276 - y - reserve);
        block.imageHeight = Math.max(1, block.imageHeight - reduction);
        block.height = 276 - y - reserve;
      }
      pageBlocks.push(block); used += block.height; if (block.image) count++; cursor++;
    }
    const reserve = cursor === blocks.length && last ? 18 : 0;
    const imageHeights = expandImageSlots(pageBlocks, 276 - y - reserve);
    for (const [index, block] of pageBlocks.entries()) {
      const textHeight = block.text.length * 3.5 + 6;
      const imageHeight = imageHeights[index];
      if (block.text.length) pdf.text(block.text, 12, y + 4);
      if (block.image) {
        const image = block.image;
        const scale = Math.min(1, 2400 / Math.max(image.naturalWidth, image.naturalHeight));
        const width = Math.max(1, Math.round(image.naturalWidth * scale)), height = Math.max(1, Math.round(image.naturalHeight * scale));
        const rotate = imageOrientation(width, height, 186, imageHeight);
        const canvas = document.createElement('canvas');
        canvas.width = rotate ? height : width; canvas.height = rotate ? width : height;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Image export is unavailable in this browser.');
        context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height);
        if (rotate) { context.translate(canvas.width, 0); context.rotate(Math.PI / 2); }
        context.drawImage(image, 0, 0, width, height);
        const fit = Math.min(186 / canvas.width, imageHeight / canvas.height);
        pdf.addImage(canvas.toDataURL('image/jpeg', .9), 'JPEG', 12 + (186 - canvas.width * fit) / 2, y + textHeight, canvas.width * fit, canvas.height * fit);
      }
      if (block.amounts.length) {
        pdf.setFont('helvetica', 'bold'); pdf.text(block.amounts, 12, y + textHeight + imageHeight + 4); pdf.setFont('helvetica', 'normal');
      }
      y += block.height + imageHeight - block.imageHeight;
      pdf.setDrawColor(210); pdf.setLineWidth(.15); pdf.line(12, y - 3, 198, y - 3);
    }
    if (cursor < blocks.length) { pdf.addPage(); header(); y = pageTop; }
  }
  if (last) {
    if (y + 18 > 278) { pdf.addPage(); header(); y = pageTop; }
    pdf.text(`${last[0]}: ${format(last.at(-1) ?? 0)}`, 12, y + 5);
    pdf.text(`Credits: ${format(last[5] ?? '')}    Debits: ${format(last[6] ?? '')}`, 12, y + 11);
  }
  for (let page = 1; !imagesOnly && page <= pdf.getNumberOfPages(); page++) {
    pdf.setPage(page); pdf.setFontSize(8); pdf.text(`Printed: ${reportDocument.printedAt ?? new Date().toLocaleString()}`, 12, 289);
    pdf.text(`Page ${page} / ${pdf.getNumberOfPages()}`, 198, 289, { align: 'right' });
  }
  return new File([pdf.output('blob')], imagesOnly ? 'attachments.pdf' : 'statement-with-attachments.pdf', { type: 'application/pdf' });
}
