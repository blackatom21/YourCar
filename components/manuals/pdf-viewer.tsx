"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";

/**
 * In-app PDF page viewer. iOS Safari ignores `#page=N`, so we render the cited
 * page ourselves with pdf.js. Range requests mean only the needed bytes of a
 * large manual are downloaded.
 */
export function PdfViewer({ url, initialPage, pageCount }: { url: string; initialPage: number; pageCount: number | null }) {
  const router = useRouter();
  const search = useSearchParams();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const renderRef = useRef<RenderTask | null>(null);
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(initialPage);
  const [zoom, setZoom] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [rendering, setRendering] = useState(true);
  const total = doc?.numPages ?? pageCount ?? 0;

  useEffect(() => {
    let cancelled = false;
    let loaded: PDFDocumentProxy | null = null;
    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/legacy/build/pdf.worker.min.mjs", import.meta.url).toString();
        loaded = await pdfjs.getDocument({ url, disableAutoFetch: true, rangeChunkSize: 256 * 1024 }).promise;
        if (!cancelled) setDoc(loaded);
      } catch (e) {
        if (!cancelled) setError(`Couldn't open the PDF: ${(e as Error).message}`);
      }
    })();
    return () => {
      cancelled = true;
      void loaded?.loadingTask.destroy();
    };
  }, [url]);

  useEffect(() => {
    if (!doc || !canvasRef.current || !boxRef.current) return;
    let cancelled = false;
    const canvas = canvasRef.current;
    const box = boxRef.current;
    (async () => {
      try {
        const p = await doc.getPage(Math.min(Math.max(1, page), doc.numPages));
        if (cancelled) return;
        const base = p.getViewport({ scale: 1 });
        const scale = (box.clientWidth * zoom) / base.width;
        const dpr = Math.min(window.devicePixelRatio || 1, 3);
        const viewport = p.getViewport({ scale: scale * dpr });
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        canvas.style.width = `${Math.floor(viewport.width / dpr)}px`;
        canvas.style.height = `${Math.floor(viewport.height / dpr)}px`;
        const task = p.render({ canvas, viewport });
        renderRef.current = task;
        await task.promise;
      } catch (e) {
        if (!cancelled && (e as Error).name !== "RenderingCancelledException") setError((e as Error).message);
      } finally {
        if (!cancelled) setRendering(false);
      }
    })();
    return () => {
      cancelled = true;
      renderRef.current?.cancel();
    };
  }, [doc, page, zoom]);

  const go = (n: number) => {
    if (!total) return;
    const next = Math.min(Math.max(1, n), total);
    if (next !== page) setRendering(true);
    setPage(next);
    const params = new URLSearchParams(search.toString());
    params.set("page", String(next));
    router.replace(`?${params}`, { scroll: false });
  };

  const btn = "min-h-11 min-w-11 rounded-lg border border-zinc-300 px-3 text-sm font-medium disabled:opacity-40 dark:border-zinc-700";

  return (
    <div className="flex flex-col gap-3">
      <div className="sticky top-14 z-10 flex flex-wrap items-center gap-2 bg-background/95 py-2 backdrop-blur">
        <button className={btn} onClick={() => go(page - 1)} disabled={page <= 1} aria-label="Previous page">
          ←
        </button>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const v = Number(new FormData(e.currentTarget).get("p"));
            if (v) go(v);
          }}
          className="flex items-center gap-1 text-sm"
        >
          <input
            name="p"
            key={page}
            defaultValue={page}
            inputMode="numeric"
            aria-label="Page number"
            className="w-16 rounded-lg border border-zinc-300 px-2 py-2 text-center dark:border-zinc-700 dark:bg-zinc-900"
          />
          <span className="text-zinc-500">/ {total || "…"}</span>
        </form>
        <button className={btn} onClick={() => go(page + 1)} disabled={!!total && page >= total} aria-label="Next page">
          →
        </button>
        <div className="ml-auto flex gap-1">
          <button className={btn} onClick={() => {
              setRendering(true);
              setZoom((z) => Math.max(1, z - 0.5));
            }} disabled={zoom <= 1} aria-label="Zoom out">
            −
          </button>
          <button className={btn} onClick={() => {
              setRendering(true);
              setZoom((z) => Math.min(4, z + 0.5));
            }} aria-label="Zoom in">
            +
          </button>
        </div>
      </div>
      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}
      <div ref={boxRef} className="relative w-full overflow-auto rounded-lg border border-zinc-200 bg-white dark:border-zinc-800">
        {rendering && <div className="absolute inset-x-0 top-0 h-1 animate-pulse bg-amber-500" />}
        <canvas ref={canvasRef} data-testid="pdf-page" data-page={page} className="block" />
      </div>
      <a href={url} target="_blank" rel="noopener noreferrer" className="text-center text-sm text-zinc-500 underline">
        Open the full PDF in your browser
      </a>
    </div>
  );
}
