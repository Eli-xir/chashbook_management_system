import { PdfPreview } from './PdfPreview';
import { useState } from 'react';
import type { Attachment } from '../Admin/types';
import { Dialog } from '../Admin/components/Dialog';
import { cashbookApi } from '../../data/cashbookApi';
import { attachmentPdf } from './attachmentReport';
import { printLedger } from './ledgerExport';
import { DownloadButton } from './DownloadButton';

// The same clean export for a statement, one transaction, or one image.
export function AttachmentExport({ items, perPage = 2 }: { items: Attachment[]; perPage?: number }) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function prepare() {
    setBusy(true); setError('');
    try {
      setFile(await attachmentPdf([{ entry: { attachments: items }, cells: [] }],
        { title: '', subtitle: '', columns: [], pages: [] }, perPage, cashbookApi.attachmentImages, true));
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not prepare attachments.'); }
    finally { setBusy(false); }
  }
  async function share() {
    if (!file) return;
    if (!navigator.canShare?.({ files: [file] })) { setError('Download the PDF and attach it in WhatsApp or email.'); return; }
    try { await navigator.share({ files: [file] }); }
    catch (cause) { if (!(cause instanceof DOMException && cause.name === 'AbortError')) setError('Could not share the file. Download it instead.'); }
  }
  return <>
    <button type="button" className="btn" disabled={busy || !items.some((item) => item.kind === 'image')} onClick={() => void prepare()}>{busy ? 'Preparing…' : 'Attachments only'}</button>
    {error && !file && <p role="alert" className="text-error">{error}</p>}
    {file && <Dialog className="report-preview" title="Attachments only" onClose={() => setFile(null)}>
      <div className="flex-row flex-wrap gap-sm">
        <DownloadButton file={file} label="Download PDF" />
        <button className="btn" onClick={() => void share()}>Share…</button>
        <button className="btn" onClick={() => { try { printLedger(file); } catch (cause) { setError((cause as Error).message); } }}>Print</button>
        <button className="btn" onClick={() => setFile(null)}>Close</button>
      </div>
      {error && <p role="alert" className="text-error">{error}</p>}
      <PdfPreview file={file} />
    </Dialog>}
  </>;
}
