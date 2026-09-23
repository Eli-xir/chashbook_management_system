import type { UserOverview } from '../Admin/types';

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
      balance += entry.amount;
      rows.push([new Date(entry.createdAt).toLocaleString(), entry.headPath ?? '', entry.categoryName ?? '', entry.amount, balance]);
    });
    rows.push([start + 20 >= entries.length ? 'Total credits received' : 'Page carried forward', '', '', '', balance]);
    pages.push(rows);
  }
  pages[pages.length - 1].push(
    [`Total received by ${userName}`, '', '', '', overview.totalReceived],
    ['Total Bill Payment', '', '', '', overview.totalBillPayment],
    ['Remaining Payable Balance', '', '', '', overview.remainingPayable],
  );
  return { title: userName, subtitle: 'Credits received', columns: ['Date/time', 'Head', 'Category', 'Credit', 'Balance'], pages };
}
function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
export async function exportLedger(report: ReportDocument, format: 'pdf' | 'excel' | 'print') {
  if (format === 'excel') {
    const { Workbook } = await import('exceljs');
    const book = new Workbook();
    const sheet = book.addWorksheet('Ledger', { pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
    sheet.addRow([report.title]);
    if (report.subtitle) sheet.addRow([report.subtitle]);
    sheet.addRow(report.columns).font = { bold: true };
    const headerRows = sheet.rowCount;
    report.pages.forEach((page, index) => {
      if (index) sheet.getRow(sheet.rowCount).addPageBreak();
      page.forEach((cells) => sheet.addRow(cells));
    });
    sheet.columns.forEach((column, index) => { column.width = index === 3 ? 36 : 22; });
    sheet.eachRow((row) => { row.alignment = { vertical: 'top', wrapText: true }; });
    sheet.views = [{ state: 'frozen', ySplit: headerRows }];
    sheet.pageSetup.printTitlesRow = `1:${headerRows}`;
    const bytes = await book.xlsx.writeBuffer();
    download(new Blob([new Uint8Array(bytes)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'ledger.xlsx');
    return;
  }
  if (format === 'pdf') {
    const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
    const pdf = new jsPDF({ orientation: 'landscape' });
    report.pages.forEach((page, index) => {
      if (index) pdf.addPage();
      pdf.setFontSize(13); pdf.text(report.title, 12, 13);
      pdf.setFontSize(8);
      const subtitle = report.subtitle ? pdf.splitTextToSize(report.subtitle, 270) : [];
      if (subtitle.length) pdf.text(subtitle, 12, 20);
      autoTable(pdf, { startY: 23 + subtitle.length * 3, head: [report.columns], body: page,
        theme: 'grid', styles: { fontSize: 7, cellPadding: 2, overflow: 'linebreak' },
        headStyles: { fillColor: [35, 35, 35] }, margin: { left: 12, right: 12, bottom: 14 } });
    });
    for (let page = 1; page <= pdf.getNumberOfPages(); page++) {
      pdf.setPage(page); pdf.setFontSize(8); pdf.text(`Page ${page} / ${pdf.getNumberOfPages()}`, 260, 202);
    }
    pdf.save('ledger.pdf'); return;
  }
  const escape = (value: string | number) => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
  const frame = document.createElement('iframe');
  frame.title = 'Print ledger'; frame.style.cssText = 'position:fixed;width:0;height:0;border:0';
  frame.onload = () => {
    frame.contentWindow?.addEventListener('afterprint', () => frame.remove(), { once: true });
    frame.contentWindow?.focus(); frame.contentWindow?.print();
    setTimeout(() => frame.remove(), 60000);
  };
  frame.srcdoc = `<!doctype html><html><head><title>Ledger</title><style>
    @page{size:A4 landscape;margin:12mm}body{font:10px Arial;color:#111}h1{font-size:18px}table{border-collapse:collapse;width:100%}th,td{padding:5px;border:1px solid #aaa;text-align:left;overflow-wrap:anywhere}thead{display:table-header-group}tr{break-inside:avoid}.page{break-after:page}.page:last-child{break-after:auto}
    </style></head><body>${report.pages.map((page, index) => `<section class="page"><h1>${escape(report.title)}</h1>${report.subtitle ? `<p>${escape(report.subtitle)}</p>` : ''}<p>Page ${index + 1} / ${report.pages.length}</p><table><thead><tr>${report.columns.map((cell) => `<th>${escape(cell)}</th>`).join('')}</tr></thead><tbody>${page.map((row) => `<tr>${row.map((cell) => `<td>${escape(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table></section>`).join('')}</body></html>`;
  document.body.appendChild(frame);
}

