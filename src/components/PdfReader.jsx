import { useEffect, useRef, useState } from 'react';

const workerUrl = new URL('pdfjs-dist/build/pdf.worker.mjs', import.meta.url).toString();

export default function PdfReader({ pdf }) {
  const canvasRef = useRef(null);
  const [pdfjs, setPdfjs] = useState(null);
  const [doc, setDoc] = useState(null);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [scale, setScale] = useState(1.1);

  useEffect(() => {
    import('pdfjs-dist').then(m => {
      m.GlobalWorkerOptions.workerSrc = workerUrl;
      setPdfjs(m);
    });
  }, []);

  useEffect(() => {
    if (!pdfjs) return;
    let cancelled = false;
    pdfjs.getDocument(pdf).promise.then(d => {
      if (cancelled) return;
      setDoc(d);
      setPages(d.numPages);
      setPage(1);
    });
    return () => { cancelled = true; };
  }, [pdfjs, pdf]);

  useEffect(() => {
    if (!doc || !canvasRef.current) return;
    let cancelled = false;
    doc.getPage(page).then(p => {
      if (cancelled) return;
      const viewport = p.getViewport({ scale });
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      return p.render({ canvasContext: ctx, viewport }).promise;
    });
    return () => { cancelled = true; };
  }, [doc, page, scale]);

  return <div className="reader">
    <div className="readerControls">
      <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page <= 1}>ก่อนหน้า</button>
      <span>{page} / {pages}</span>
      <button onClick={() => setPage(Math.min(pages, page + 1))} disabled={page >= pages}>ถัดไป</button>
      <button onClick={() => setScale(Math.max(0.7, scale - 0.2))}>−</button>
      <button onClick={() => setScale(Math.min(2, scale + 0.2))}>+</button>
    </div>
    <canvas ref={canvasRef} />
  </div>;
}
