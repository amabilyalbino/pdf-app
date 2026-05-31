import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist/types/src/display/api";

type PdfPageCanvasProps = {
  documentProxy: PDFDocumentProxy;
  pageIndex: number;
  width: number;
  height: number;
};

export function PdfPageCanvas({ documentProxy, pageIndex, width, height }: PdfPageCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [shouldRender, setShouldRender] = useState(pageIndex === 0);

  useEffect(() => {
    setShouldRender(pageIndex === 0);
  }, [documentProxy, pageIndex]);

  useEffect(() => {
    if (shouldRender) {
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (!entry?.isIntersecting) {
          return;
        }

        setShouldRender(true);
        observer.disconnect();
      },
      {
        rootMargin: "600px 0px"
      }
    );

    observer.observe(canvas);

    return () => observer.disconnect();
  }, [shouldRender]);

  useEffect(() => {
    if (!shouldRender) {
      return;
    }

    let cancelled = false;

    async function renderPage() {
      const page = await documentProxy.getPage(pageIndex + 1);
      const viewport = page.getViewport({ scale: 1.75 });
      const canvas = canvasRef.current;
      if (!canvas || cancelled) {
        return;
      }

      const context = canvas.getContext("2d");
      if (!context) {
        return;
      }

      canvas.width = viewport.width;
      canvas.height = viewport.height;

      await page.render({
        canvasContext: context,
        viewport
      }).promise;
    }

    renderPage();

    return () => {
      cancelled = true;
    };
  }, [documentProxy, pageIndex, shouldRender]);

  return (
    <canvas
      ref={canvasRef}
      className="pdf-canvas"
      style={{
        aspectRatio: `${width} / ${height}`
      }}
    />
  );
}
