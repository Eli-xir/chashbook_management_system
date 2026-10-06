import { useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import './PdfPreview.css';

// Render nearby pages only, keeping long attachment reports usable on phones.
function PdfPage({ document, page }: { document: PDFDocumentProxy; page: number }) {
  const container = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(false);
  const [ratio, setRatio] = useState(210 / 297);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { rootMargin: '600px' });
    if (container.current) observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    let render: ReturnType<Awaited<ReturnType<PDFDocumentProxy['getPage']>>['render']> | undefined;
    const target = canvas.current;
    setReady(false); setError('');
    void (async () => {
      const sheet = await document.getPage(page);
      if (cancelled || !target) return;
      const size = sheet.getViewport({ scale: 1 });
      setRatio(size.width / size.height);
      const width = Math.min(1200, (container.current?.clientWidth || 600) * Math.min(window.devicePixelRatio || 1, 2));
      const viewport = sheet.getViewport({ scale: width / size.width });
      target.width = Math.ceil(viewport.width); target.height = Math.ceil(viewport.height);
      render = sheet.render({ canvas: target, viewport });
      await render.promise;
      if (!cancelled) setReady(true);
    })().catch(() => { if (!cancelled) setError('Could not display this page. You can still download or share the PDF.'); });
    return () => {
      cancelled = true; render?.cancel();
      if (target) { target.width = 0; target.height = 0; }
    };
  }, [document, page, visible]);
  return <div ref={container} className="pdf-preview-sheet" style={{ aspectRatio: ratio }}>
    <canvas ref={canvas} hidden={!visible || !ready || !!error} aria-label={`PDF page ${page}`} />
    {error ? <p role="alert" className="text-error">{error}</p> : visible && !ready && <p role="status">Loading page {page}…</p>}
  </div>;
}

// Render the actual export locally; mobile WebViews may not display PDF iframes.
export function PdfPreview({ file }: { file: File }) {
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let cancelled = false;
    let task: ReturnType<typeof import('pdfjs-dist')['getDocument']> | undefined;
    setDocument(null); setError('');
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
  return <div className="pdf-preview flex-col gap-sm">
    {error ? <p role="alert" className="text-error">{error}</p> : !document && <p role="status">Loading preview…</p>}
    {document && Array.from({ length: document.numPages }, (_, index) =>
      <PdfPage key={index} document={document} page={index + 1} />)}
  </div>;
}
