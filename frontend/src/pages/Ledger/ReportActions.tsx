import { useEffect, useMemo, useRef, useState } from 'react';
import { Dialog } from '../Admin/components/Dialog';
import { download, printLedger, ledgerFile, reportHtml, type ReportDocument, type ReportFormat } from './ledgerExport';
import './Ledger.css';

export function ReportActions({ getReport, disabled = false }: { getReport: () => ReportDocument; disabled?: boolean }) {
  const [report, setReport] = useState<ReportDocument | null>(null);
  const [format, setFormat] = useState<ReportFormat>('pdf');
  const [ready, setReady] = useState<{ format: ReportFormat; file: File; pdf: File } | null>(null);
  const [error, setError] = useState('');
  const [sharing, setSharing] = useState(false);
  const [retry, setRetry] = useState(0);
  const [zoom, setZoom] = useState('fit');
  const preview = useRef<HTMLIFrameElement>(null);
  const html = useMemo(() => report ? reportHtml(report) : '', [report]);
  const file = ready?.format === format ? ready.file : null;
  function resizePreview() {
    const frame = preview.current;
    if (frame?.contentDocument?.body) {
      frame.contentDocument.body.style.zoom = String(zoom === 'fit' ? Math.min(1, frame.clientWidth / 826) : Number(zoom));
    }
  }
  useEffect(() => {
    const frame = preview.current;
    if (!frame) return;
    const observer = new ResizeObserver(resizePreview);
    observer.observe(frame);
    resizePreview();
    return () => observer.disconnect();
  }, [report, zoom]);
  useEffect(() => {
    if (!report) return;
    let cancelled = false;
    setReady(null); setError('');
    void Promise.all([ledgerFile(report, 'pdf'), format === 'pdf' ? Promise.resolve(null) : ledgerFile(report, format)]).then(([pdf, selected]) => {
      if (!cancelled) setReady({ format, file: selected ?? pdf, pdf });
    }).catch((error) => {
      if (!cancelled) setError(error instanceof Error ? error.message : 'Could not prepare the file.');
    });
    return () => { cancelled = true; };
  }, [report, format, retry]);

  async function share() {
    if (!file || sharing) return;
    setError('');
    if (!navigator.share || !navigator.canShare?.({ files: [file] })) {
      setError(window.isSecureContext
        ? 'This browser cannot share this file type. Download it and attach it in WhatsApp or email.'
        : 'Direct sharing needs HTTPS on this device. For now, download the file and attach it in WhatsApp or email.');
      return;
    }
    setSharing(true);
    try { await navigator.share({ files: [file], title: report!.title }); }
    catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) setError('Could not share the file. Try again or download it.');
    } finally { setSharing(false); }
  }

  return <>
    <button className="btn" disabled={disabled} onClick={() => {
      setReady(null); setError(''); setZoom('fit'); setReport(getReport());
    }}>Preview / export</button>
    {report && <Dialog className="report-preview" title="Ledger preview" busy={sharing} onClose={() => setReport(null)}>
      <div className="flex-row flex-wrap items-center gap-sm">
        <select aria-label="File format" value={format} disabled={sharing}
          onChange={(event) => setFormat(event.target.value as ReportFormat)}>
          <option value="pdf">PDF</option><option value="excel">Excel</option><option value="csv">CSV</option>
        </select>
        <select aria-label="Preview zoom" value={zoom} onChange={(event) => setZoom(event.target.value)}>
          <option value="fit">Fit width</option><option value="0.75">75%</option><option value="1">100%</option><option value="1.5">150%</option>
        </select>
        <button className="btn" disabled={!file || sharing} onClick={() => { if (file) download(file, file.name); }}>Download</button>
        <button className="btn btn--primary" title="Share through WhatsApp, email or another app" disabled={!file || sharing} onClick={() => void share()}>{sharing ? 'Sharing…' : 'Share…'}</button>
        <button className="btn" disabled={!file || sharing} onClick={() => {
          try { if (ready) printLedger(ready.pdf); }
          catch (error) { setError(error instanceof Error ? error.message : 'Download the PDF to print it.'); }
        }}>Print</button>
        <button className="btn" disabled={sharing} onClick={() => setReport(null)}>Close</button>
      </div>
      {!file && !error && <p role="status" className="hint">Preparing file…</p>}
      {error && <p role="alert" className="text-error">{error} {!file && <button className="btn" onClick={() => setRetry((value) => value + 1)}>Retry</button>}</p>}
      <iframe ref={preview} title={`${report.title} — ledger preview`} srcDoc={html} onLoad={resizePreview} />
    </Dialog>}
  </>;
}
