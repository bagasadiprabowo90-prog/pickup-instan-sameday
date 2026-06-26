import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import type { RawPage } from "./parse-shipping-pdf";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export async function extractPdfPages(data: ArrayBuffer): Promise<RawPage[]> {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(data) }).promise;
  const pages: RawPage[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    pages.push({
      width: viewport.width,
      height: viewport.height,
      items: content.items
        .filter((it): it is typeof it & { str: string; transform: number[] } => "str" in it)
        .map((it) => ({
          str: it.str,
          x: Math.round(it.transform[4]),
          y: Math.round(it.transform[5]),
        })),
    });
  }
  return pages;
}
