import { useEffect, useState } from 'react';
import type { AdminUser, CreditUser, FiltersState, Head, Transaction } from '../Admin/types';
import { HomeCard } from '../Admin/components/HomeCard';
import { Dialog } from '../Admin/components/Dialog';
import { AttachmentInput } from '../Admin/components/AttachmentInput';
import { matchesUser } from '../Admin/utils/userProfile';
import { Ledger } from './Ledger';
import { ledgerReport, money } from './ledgerModel';
import { attachmentPdf } from './attachmentReport';
import { download, printLedger } from './ledgerExport';
import './AttachmentsPage.css';

const ignoreDirty = () => {};
const unchanged = async () => {};
const empty: FiltersState = { dateFrom: '', dateTo: '', userScope: 'all', direction: 'both' };
export function AttachmentsPage({ users, creditUsers, transactions, heads, initialScope = '' }: {
  initialScope?: string; users: AdminUser[]; creditUsers: CreditUser[]; transactions: Transaction[]; heads: Head[];
}) {
  const [scope, setScope] = useState(initialScope);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<FiltersState>({ ...empty, userScope: initialScope || 'all' });
  const [opened, setOpened] = useState<string | null>(null);
  const [imageIndex, setImageIndex] = useState<number | null>(null);
  const [zoom, setZoom] = useState(1);
  const [perPage, setPerPage] = useState(4);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [pdf, setPdf] = useState<File | null>(null);
  const [pdfUrl, setPdfUrl] = useState('');
  useEffect(() => {
    if (!pdf) { setPdfUrl(''); return; }
    const url = URL.createObjectURL(pdf); setPdfUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [pdf]);
  const people = [
    ...users.filter((user) => user.role !== 'admin').map((user) => ({ ...user, id: user.user_id, type: 'user' as const })),
    ...creditUsers.map((user) => ({ ...user, id: `credit:${user.credit_user_id}`, type: 'external' as const })),
  ];
  const selected = people.find((user) => user.id === filters.userScope);
  const rows = ledgerReport(transactions, filters, 'by-time', heads).rows.map(({ entry }) => entry);
  const entry = rows.find((item) => item.id === opened);
  const images = (entry ? [entry] : rows).flatMap((item) => item.attachments.filter((attachment) => attachment.kind === 'image').map((attachment) => ({
    ...attachment, caption: `${new Date(item.createdAt).toLocaleString()} · ${money(item.amount)} · ${item.description || attachment.name}`,
  })));
  const photo = imageIndex === null ? null : images[imageIndex];
  
  async function prepare() {
    setBusy(true); setError('');
    try { setPdf(await attachmentPdf(images, `Attachments · ${selected?.user_name ?? ''}`, perPage)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not prepare images.'); }
    finally { setBusy(false); }
  }
  async function share() {
    if (!pdf) return;
    if (!navigator.canShare?.({ files: [pdf] })) { setError('Download the PDF and attach it in WhatsApp or email. Direct file sharing is unavailable in this browser.'); return; }
    try { await navigator.share({ files: [pdf], title: 'Transaction attachments' }); }
    catch (cause) { if (!(cause instanceof DOMException && cause.name === 'AbortError')) setError('Could not share the file. Download it instead.'); }
  }
  const exportControls = <div className="flex-row flex-wrap items-center gap-sm">
    <label className="field"><span>Images per A4 page</span><select value={perPage} disabled={busy} onChange={(event) => setPerPage(Number(event.target.value))}>
      {[1, 2, 4, 6].map((count) => <option key={count}>{count}</option>)}</select></label>
    <button className="btn" disabled={busy || !images.length} onClick={() => void prepare()}>{busy ? 'Preparing…' : 'Preview / export images'}</button>
  </div>;
  return <section className="evidence-page flex-col gap-md">
    <header className="flex-row items-center gap-sm">
      {scope && <button className="btn" disabled={busy} onClick={() => { setScope(''); setOpened(null); setError(''); }}>← Users</button>}
      <h1>{selected ? `Attachments · ${selected.user_name}` : 'Attachments'}</h1>
    </header>
    {!scope ? <>
      <input type="search" aria-label="Search attachment users" placeholder="Search name, contact or description" value={search} onChange={(event) => setSearch(event.target.value)} />
      <div className="home-cards">{people.filter((user) => matchesUser(user, search)).map((user, index) => <HomeCard key={user.id}
        title={user.user_name} description={user.description} detail={user.is_active ? undefined : 'Inactive'} accountType={user.type}
        tone={(['blue', 'gold', 'green', 'purple'] as const)[index % 4]} actions={<span className="hint">{user.type === 'external' ? 'External user' : 'User'}</span>}
        icon={<svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M5 3h14v18H5zM8 7h8M8 11h8M8 15h4" /></svg>}
        onClick={() => { setScope(user.id); setFilters({ ...empty, userScope: user.id }); setOpened(null); }} />)}</div>
      {!people.some((user) => matchesUser(user, search)) && <p>No matching users.</p>}
    </> : <>
      <Ledger filters={filters} onFilterChange={(next) => { setFilters(next); setOpened(null); setImageIndex(null); }}
        revision={0} heads={heads} users={users} onDirtyChange={ignoreDirty} onChanged={unchanged}
        attachmentReview={{ onOpen: (item) => { setOpened(item.id); setError(''); } }} />
      {exportControls}
      <div className="evidence-images">{!entry && images.map((image, index) => <figure key={image.id}>
        <button onClick={() => { setImageIndex(index); setZoom(1); }} aria-label={`Open ${image.name}`}><img loading="lazy" src={image.url} alt={image.name} /></button>
        <figcaption>{image.caption}</figcaption>
      </figure>)}</div>
      {rows.filter((item) => item.attachments.some((a) => a.kind === 'voice')).map((item) => <div key={item.id}>
        <p>{new Date(item.createdAt).toLocaleString()} · {money(item.amount)} · {item.description}</p>
        <AttachmentInput kind="voice" items={item.attachments.filter((a) => a.kind === 'voice')} />
      </div>)}
      {!images.length && !entry && <p role="status">No images in this selection.</p>}
    </>}
    {error && !entry && !pdf && <p className="text-error" role="alert">{error}</p>}
    {entry && <Dialog className="evidence-gallery" title={`${new Date(entry.createdAt).toLocaleString()} · ${money(entry.amount)}`} busy={busy} onClose={() => { setOpened(null); setImageIndex(null); }}>
      {entry.description && <p>{entry.description}</p>}
      {!entry.attachments.length && <p>No attachments for this transaction.</p>}
      {exportControls}
      {error && !pdf && <p className="text-error" role="alert">{error}</p>}
      <div className="evidence-images">{images.map((image, index) => <button key={image.id} onClick={() => { setImageIndex(index); setZoom(1); }} aria-label={`Open ${image.name}`}>
        <img loading="lazy" src={image.url} alt={image.name} /></button>)}</div>
      {entry.attachments.some((a) => a.kind === 'voice') && <AttachmentInput kind="voice" items={entry.attachments.filter((a) => a.kind === 'voice')} />}
      <button className="btn" disabled={busy} onClick={() => setOpened(null)}>Close</button>
    </Dialog>}
    {photo && <Dialog className="evidence-lightbox" title={photo.name} onClose={() => setImageIndex(null)}>
      <div className="flex-row flex-wrap items-center gap-sm">
        <button className="btn" disabled={imageIndex === 0} onClick={() => { setImageIndex(imageIndex! - 1); setZoom(1); }}>← Previous</button>
        <span>{imageIndex! + 1} / {images.length}</span>
        <button className="btn" disabled={imageIndex === images.length - 1} onClick={() => { setImageIndex(imageIndex! + 1); setZoom(1); }}>Next →</button>
        <select aria-label="Image zoom" value={zoom} onChange={(event) => setZoom(Number(event.target.value))}><option value="1">Fit</option><option value="2">200%</option><option value="3">300%</option></select>
        <button className="btn" onClick={() => setImageIndex(null)}>Close image</button>
      </div>
      <div className="evidence-full-image"><img src={photo.url} alt={photo.name} style={{ width: `${zoom * 100}%`, maxHeight: zoom === 1 ? '75dvh' : undefined }} /></div>
    </Dialog>}
    {pdf && <Dialog className="report-preview" title="Attachment pages" onClose={() => setPdf(null)}>
      <div className="flex-row flex-wrap gap-sm">
        <button className="btn" onClick={() => download(pdf, pdf.name)}>Download PDF</button>
        <button className="btn" onClick={() => void share()}>Share…</button>
        <button className="btn" onClick={() => { try { printLedger(pdf); } catch (cause) { setError((cause as Error).message); } }}>Print</button>
        <button className="btn" onClick={() => setPdf(null)}>Close</button>
      </div>
      {error && <p className="text-error" role="alert">{error}</p>}
      {pdfUrl && <iframe title="Attachment PDF preview" src={pdfUrl} />}
    </Dialog>}
  </section>;
}
