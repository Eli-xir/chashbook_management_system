import { useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import './PdfPreview.css';

// Render the actual export locally; mobile WebViews may not display PDF iframes.
export function PdfPreview({ file }: { file: File }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(1);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    let task: ReturnType<typeof import('pdfjs-dist')['getDocument']> | undefined;
    setDocument(null); setPage(1); setReady(false); setError('');
    void (async () => {
      const [pdfjs, data] = await Promise.all([import('pdfjs-dist/legacy/build/pdf.mjs'), file.arrayBuffer()]);
      if (cancelled) return;
      pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
      task = pdfjs.getDocument({ data });
      const pdf = await task.promise;
      if (!cancelled) setDocument(pdf);
    })().catch(() => { if (!cancelled) setError('Could not display the preview. You can still download or share the PDF.'); });
    return () => { cancelled = true; void task?.destroy(); };
  }, [file]);

  useEffect(() => {
    if (!document) return;
    let cancelled = false;
    let render: ReturnType<Awaited<ReturnType<PDFDocumentProxy['getPage']>>['render']> | undefined;
    setReady(false); setError('');
    void (async () => {
      const sheet = await document.getPage(page);
      if (cancelled || !canvas.current) return;
      const viewport = sheet.getViewport({ scale: 1200 / sheet.getViewport({ scale: 1 }).width });
      const target = canvas.current;
      target.width = Math.ceil(viewport.width); target.height = Math.ceil(viewport.height);
      render = sheet.render({ canvas: target, viewport });
      await render.promise;
      if (!cancelled) setReady(true);
    })().catch(() => { if (!cancelled) setError('Could not display this page. You can still download or share the PDF.'); });
    return () => { cancelled = true; render?.cancel(); };
  }, [document, page]);

  return <div className="pdf-preview flex-col gap-sm">
    {document && <nav className="flex-row items-center gap-sm" aria-label="PDF pages">
      <button className="btn" disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</button>
      <span>Page {page} / {document.numPages}</span>
      <button className="btn" disabled={page === document.numPages} onClick={() => setPage(page + 1)}>Next</button>
    </nav>}
    {error ? <p role="alert" className="text-error">{error}</p> : !ready && <p role="status">Loading preview…</p>}
    <div className="pdf-preview-sheet"><canvas ref={canvas} hidden={!ready || !!error} aria-label={`PDF page ${page}`} /></div>
  </div>;
}
