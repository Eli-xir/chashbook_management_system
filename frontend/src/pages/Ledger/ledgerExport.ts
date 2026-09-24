import type { UserOverview } from '../Admin/types';
import { roundMoney } from './ledgerModel';
import logoUrl from '../../assets/logo.jpeg';
import type { CellInput } from 'jspdf-autotable';

export interface ReportDocument {
  title: string; subtitle: string; columns: string[]; pages: (string | number)[][][];
}
export function creditDocument(overview: UserOverview, userName: string): ReportDocument {
  // Input is the userOverview response, which contains received credits only.
  const entries = [...overview.credits].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const pages: ReportDocument['pages'] = [];
  let balance = 0;
  for (let start = 0; start < Math.max(1, entries.length); start += 20) {
    const rows: (string | number)[][] = [[start ? 'Page brought forward' : 'Opening balance', '', '', '', balance]];
    entries.slice(start, start + 20).forEach((entry) => {
      balance = roundMoney(balance + entry.amount);
      rows.push([new Date(entry.createdAt).toLocaleString(), entry.headPath ?? '', entry.description ?? '', entry.amount, balance]);
    });
    rows.push([start + 20 >= entries.length ? 'Total credits received' : 'Page carried forward', '', '', '', balance]);
    pages.push(rows);
  }
  pages[pages.length - 1].push(
    ['Total received', '', '', '', overview.totalReceived],
    ['Total paid', '', '', '', overview.totalBillPayment],
    ['Remaining balance', '', '', '', overview.balance],
  );
  return { title: userName, subtitle: 'Credits received', columns: ['Date/time', 'Head', 'Description', 'Credit', 'Received to date'], pages };
}
export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = url; link.download = name;
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
export type ReportFormat = 'pdf' | 'excel' | 'csv';
const columnWidths = (report: ReportDocument) => report.columns.length === 8 ? [24, 17, 17, 29, 30, 23, 23, 23] : [30, 65, 27, 30, 34];
const numeric = (value: string | number) => typeof value === 'number' ? `PKR ${value.toLocaleString('en-PK', { maximumFractionDigits: 2 })}` : value;
function labelSpan(report: ReportDocument, row: (string | number)[]) {
  if (row[1] !== '' || row[report.columns.indexOf('Head')] !== '') return 1;
  const firstAmount = row.findIndex((value) => typeof value === 'number');
  return firstAmount > 1 ? firstAmount : 1;
}
let logoData: Promise<string> | undefined;
function loadLogo() {
  return logoData ??= fetch(logoUrl).then((response) => {
    if (!response.ok) throw new Error('Could not load the report logo.');
    return response.blob();
  }).then((blob) => new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error('Could not read the report logo.'));
    reader.readAsDataURL(blob);
  })).catch((error) => { logoData = undefined; throw error; });
}
export async function ledgerFile(report: ReportDocument, format: ReportFormat): Promise<File> {
  const name = `${report.title.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-').slice(0, 80) || 'Ledger'}-ledger`;
  if (format === 'csv') {
    const cell = (value: string | number) => {
      const text = typeof value === 'string' && /^\s*[=+\-@]/.test(value) ? `'${value}` : String(value);
      return `"${text.replace(/"/g, '""')}"`;
    };
    const csv = [report.columns, ...report.pages.flat()].map((row) => row.map(cell).join(',')).join('\r\n');
    return new File(['\uFEFF', csv, '\r\n'], `${name}.csv`, { type: 'text/csv;charset=utf-8' });
  }
  const logo = await loadLogo();
  if (format === 'excel') {
    const { Workbook } = await import('exceljs');
    const book = new Workbook();
    const sheet = book.addWorksheet('Ledger', { pageSetup: { orientation: 'portrait', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 }, headerFooter: { oddFooter: 'Page &P of &N', oddHeader: '' } });
    const last = report.columns.length;
    sheet.mergeCells(1, 2, 1, last); sheet.getCell(1, 2).value = 'SOHAIL MALIK ARCHITECTS';
    sheet.mergeCells(2, 2, 2, last); sheet.getCell(2, 2).value = `ACCOUNT STATEMENT · ${report.title}`;
    sheet.mergeCells(3, 2, 3, last); sheet.getCell(3, 2).value = report.subtitle || 'Ledger';
    sheet.addImage(book.addImage({ base64: logo, extension: 'jpeg' }), { tl: { col: 0, row: 0 }, ext: { width: 72, height: 72 } });
    sheet.getRow(1).font = { bold: true, size: 14 }; sheet.getRow(2).font = { bold: true, size: 12 };
    sheet.addRow([]);
    const header = sheet.addRow(report.columns);
    header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    header.eachCell((cell) => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF252525' } }; });
    const headerRows = sheet.rowCount;
    report.pages.forEach((page, index) => {
      if (index) sheet.getRow(sheet.rowCount).addPageBreak();
      page.forEach((cells) => {
        const row = sheet.addRow(cells), span = labelSpan(report, cells);
        if (span > 1) {
          sheet.mergeCells(row.number, 1, row.number, span);
          row.font = { bold: true };
          row.eachCell((cell) => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F1E5' } }; });
        }
        row.eachCell((cell) => { if (typeof cell.value === 'number') { cell.numFmt = '"PKR" #,##0.##;[Red]-"PKR" #,##0.##'; cell.alignment = { horizontal: 'right', vertical: 'top' }; } });
      });
    });
    sheet.columns.forEach((column, index) => { column.width = columnWidths(report)[index] * .6; });
    sheet.eachRow((row) => { row.eachCell((cell) => { cell.alignment = { ...cell.alignment, vertical: 'top', wrapText: true }; }); });
    sheet.views = [{ state: 'frozen', ySplit: headerRows }];
    sheet.pageSetup.printTitlesRow = `1:${headerRows}`;
    const bytes = await book.xlsx.writeBuffer();
    return new File([new Uint8Array(bytes)], `${name}.xlsx`, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }
  {
    const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
    const pdf = new jsPDF({ orientation: 'portrait', format: 'a4' });
    pdf.setProperties({ title: `${report.title} — Account statement`, author: 'Sohail Malik Architects' });
    const titleLines = pdf.splitTextToSize(report.title, 138);
    const subtitleLines = report.subtitle ? pdf.splitTextToSize(report.subtitle, 186) : [];
    const tableTop = 43 + Math.max(0, titleLines.length - 1) * 5 + subtitleLines.length * 3.5;
    const widths = columnWidths(report);
    report.pages.forEach((page, index) => {
      if (index) pdf.addPage();
      const body: CellInput[][] = page.map((row) => {
        const span = labelSpan(report, row);
        return row.flatMap((value, column): CellInput[] => {
          if (column > 0 && column < span) return [];
          return [{ content: String(numeric(value)), colSpan: column === 0 ? span : 1,
            styles: { halign: typeof value === 'number' ? 'right' : 'left',
              ...(span > 1 ? { fontStyle: 'bold', fillColor: [247, 244, 234] as [number, number, number] } : {}) } }];
        });
      });
      autoTable(pdf, { startY: tableTop, head: [report.columns], body,
        theme: 'grid', styles: { font: 'helvetica', fontSize: 7, cellPadding: 2, overflow: 'linebreak', lineColor: [222, 222, 216], lineWidth: .15 },
        headStyles: { fillColor: [37, 37, 37], textColor: [255, 255, 255], fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [250, 250, 248] }, rowPageBreak: 'avoid',
        columnStyles: Object.fromEntries(widths.map((width, column) => [column, { cellWidth: width }])),
        margin: { top: tableTop, left: 12, right: 12, bottom: 18 },
        willDrawPage: () => {
          pdf.addImage(logo, 'JPEG', 12, 10, 24, 24);
          pdf.setTextColor(40); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(10); pdf.text('SOHAIL MALIK ARCHITECTS', 42, 15);
          pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8); pdf.setTextColor(110); pdf.text('ACCOUNT STATEMENT', 42, 21);
          pdf.setTextColor(30); pdf.setFontSize(13); pdf.text(titleLines, 42, 28);
          pdf.setFontSize(7); pdf.setTextColor(100);
          if (subtitleLines.length) pdf.text(subtitleLines, 12, tableTop - subtitleLines.length * 3.5 - 3);
          pdf.setDrawColor(190, 156, 50); pdf.setLineWidth(.6); pdf.line(12, tableTop - 2, 198, tableTop - 2);
        } });
    });
    for (let page = 1; page <= pdf.getNumberOfPages(); page++) {
      pdf.setPage(page); pdf.setDrawColor(220); pdf.setLineWidth(.2); pdf.line(12, 281, 198, 281);
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7); pdf.setTextColor(110);
      pdf.text('Sohail Malik Architects', 12, 286);
      pdf.text(`Page ${page} of ${pdf.getNumberOfPages()}`, 198, 286, { align: 'right' });
    }
    return new File([pdf.output('blob')], `${name}.pdf`, { type: 'application/pdf' });
  }
}
export function printLedger(file: File) {
  const viewer = window.open('', '_blank');
  if (!viewer) throw new Error('Allow pop-ups to open the printable PDF, or download it.');
  const url = URL.createObjectURL(file);
  viewer.opener = null;
  viewer.addEventListener('load', () => { try { viewer.focus(); viewer.print(); } catch { /* The PDF viewer also provides its own Print control. */ } }, { once: true });
  viewer.location.replace(url);
  setTimeout(() => URL.revokeObjectURL(url), 300000);
}

export function reportHtml(report: ReportDocument) {
  const escape = (value: string | number) => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Ledger</title><style>
    @page{size:A4 portrait;margin:0}*{box-sizing:border-box}body{margin:0;padding:16px;background:#e8e8e5;font:11px Arial;color:#252525}.page{width:794px;min-height:1123px;padding:45px;margin:0 auto 20px;background:white;display:flex;flex-direction:column;break-after:page}.page:last-child{break-after:auto}.brand{display:flex;align-items:center;gap:20px}.brand img{width:90px;height:90px;object-fit:contain}.brand strong{font-size:15px;letter-spacing:1px}.eyebrow{color:#777;font-size:10px;letter-spacing:1px;margin-top:10px}h1{font-size:22px;margin:8px 0}.subtitle{color:#666;line-height:1.5}.rule{height:2px;background:#bea032;margin:16px 0}table{border-collapse:collapse;width:100%;table-layout:fixed;font-size:10px}th,td{padding:8px 6px;border:1px solid #deded8;text-align:left;overflow-wrap:anywhere;vertical-align:top}th{background:#252525;color:white;font-weight:600}thead{display:table-header-group}tr{break-inside:avoid}tbody tr:nth-child(even){background:#fafaf8}.summary{background:#f7f4ea!important;font-weight:bold}.number{text-align:right;font-variant-numeric:tabular-nums}footer{margin-top:auto;padding-top:28px;color:#777;font-size:10px;display:flex;justify-content:space-between}footer span{border-top:1px solid #ddd;padding-top:10px;flex:1}footer span:last-child{text-align:right}@media print{body{padding:0;background:white}.page{margin:0;width:210mm;min-height:297mm}}
    </style></head><body>${report.pages.map((page, index) => `<section class="page"><header class="brand"><img src="${escape(new URL(logoUrl, window.location.href).href)}" alt="Sohail Malik Architects"><div><strong>SOHAIL MALIK ARCHITECTS</strong><div class="eyebrow">ACCOUNT STATEMENT</div><h1>${escape(report.title)}</h1></div></header>${report.subtitle ? `<p class="subtitle">${escape(report.subtitle)}</p>` : ''}<div class="rule"></div><table><colgroup>${columnWidths(report).map((width) => `<col style="width:${width / 186 * 100}%">`).join('')}</colgroup><thead><tr>${report.columns.map((cell) => `<th>${escape(cell)}</th>`).join('')}</tr></thead><tbody>${page.map((row) => { const span = labelSpan(report, row); return `<tr class="${span > 1 ? 'summary' : ''}">${row.map((cell, column) => column > 0 && column < span ? '' : `<td${column === 0 && span > 1 ? ` colspan="${span}"` : ''} class="${typeof cell === 'number' ? 'number' : ''}">${escape(numeric(cell))}</td>`).join('')}</tr>`; }).join('')}</tbody></table><footer><span>Sohail Malik Architects</span><span>Page ${index + 1} of ${report.pages.length}</span></footer></section>`).join('')}</body></html>`;
}

