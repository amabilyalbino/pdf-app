import type * as PdfJsNamespace from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { createId } from "./id";
import { buildExportHistoryEntry, matchTemplates } from "./templates";
import type {
  FillProfile,
  ImportedPdf,
  PageMapping,
  PlacedField,
  SignatureProfile,
  TemplateFingerprint
} from "../types";

let pdfJsPromise: Promise<typeof import("pdfjs-dist")> | null = null;
let pdfLibPromise: Promise<typeof import("pdf-lib")> | null = null;

async function getPdfJs() {
  if (!pdfJsPromise) {
    pdfJsPromise = import("pdfjs-dist").then((module) => {
      module.GlobalWorkerOptions.workerSrc = workerUrl;
      return module;
    });
  }

  return pdfJsPromise;
}

export function preloadPdfRuntime() {
  void getPdfJs();
}

async function getPdfLib() {
  if (!pdfLibPromise) {
    pdfLibPromise = import("pdf-lib");
  }

  return pdfLibPromise;
}

export type LoadedPdfDocument = {
  pageCount: number;
  bytes: Uint8Array;
  pdfjsDocument: PdfJsNamespace.PDFDocumentProxy;
  importedPdf: ImportedPdf;
};

export function clonePdfBytes(bytes: Uint8Array): Uint8Array {
  return bytes.slice();
}

function bufferToBytes(buffer: ArrayBuffer): Uint8Array {
  return clonePdfBytes(new Uint8Array(buffer));
}

export function hasPdfHeader(bytes: Uint8Array): boolean {
  if (bytes.byteLength < 5) {
    return false;
  }

  return (
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46 &&
    bytes[4] === 0x2d
  );
}

export function assertUsablePdfBytes(bytes: Uint8Array): void {
  if (!hasPdfHeader(bytes)) {
    throw new Error(
      "I couldn't read the original PDF for export. Reimport the file and try again."
    );
  }
}

function stableHash(input: string): string {
  let hash = 5381;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 33) ^ input.charCodeAt(index);
  }
  return (hash >>> 0).toString(16);
}

async function extractFingerprint(document: PdfJsNamespace.PDFDocumentProxy): Promise<TemplateFingerprint> {
  const firstPage = await document.getPage(1);
  const firstViewport = firstPage.getViewport({ scale: 1 });
  const pageSizes: Array<{ width: number; height: number }> = new Array(document.numPages);
  pageSizes[0] = {
    width: firstViewport.width,
    height: firstViewport.height
  };

  const firstPageTextPromise = firstPage.getTextContent();

  const remainingPageNumbers = Array.from({ length: Math.max(document.numPages - 1, 0) }, (_, index) => index + 2);
  const workerCount = Math.min(6, remainingPageNumbers.length);
  let nextPageIndex = 0;

  async function collectPageSizes() {
    while (nextPageIndex < remainingPageNumbers.length) {
      const currentIndex = nextPageIndex;
      nextPageIndex += 1;
      const pageNumber = remainingPageNumbers[currentIndex];
      const page = await document.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1 });
      pageSizes[pageNumber - 1] = {
        width: viewport.width,
        height: viewport.height
      };
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => collectPageSizes()));

  const content = await firstPageTextPromise;
  const text = content.items
    .map((item) => ("str" in item ? item.str : ""))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 600);

  return {
    pageCount: document.numPages,
    pageSizes,
    firstPageTextHash: stableHash(text)
  };
}

function derivePageMappings(fingerprint: TemplateFingerprint): PageMapping[] {
  return fingerprint.pageSizes.map((page, pageIndex) => ({
    page: pageIndex,
    width: page.width,
    height: page.height
  }));
}

export async function importPdfFromFile(file: File): Promise<LoadedPdfDocument> {
  const buffer = await file.arrayBuffer();
  return importPdfFromBytes(file.name, bufferToBytes(buffer));
}

export async function importPdfFromBytes(name: string, bytes: Uint8Array): Promise<LoadedPdfDocument> {
  const pdfjsLib = await getPdfJs();
  const sourceBytes = clonePdfBytes(bytes);
  const previewBytes = clonePdfBytes(bytes);
  const loadingTask = pdfjsLib.getDocument({ data: previewBytes });
  const pdfjsDocument = await loadingTask.promise;
  const fingerprint = await extractFingerprint(pdfjsDocument);
  const pageMappings = derivePageMappings(fingerprint);

  return {
    pageCount: pdfjsDocument.numPages,
    bytes: sourceBytes,
    pdfjsDocument,
    importedPdf: {
      id: createId("pdf"),
      name,
      bytes: sourceBytes,
      fingerprint,
      pageMappings
    }
  };
}

function formatFieldValue(field: PlacedField, fillProfiles: FillProfile[]): string {
  if (field.type === "date" && field.value) {
    const [year, month, day] = field.value.split("-");
    if (year && month && day) {
      return `${day}/${month}/${year}`;
    }
  }

  if (field.value) {
    return field.value;
  }

  if (field.bindingKey) {
    const match = fillProfiles.find((profile) => profile.values[field.bindingKey ?? ""]);
    if (match) {
      return match.values[field.bindingKey];
    }
  }

  return field.defaultValue ?? "";
}

function calculatePdfCoordinates(field: PlacedField, page: PageMapping): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  const width = field.width * page.width;
  const height = field.height * page.height;
  return {
    x: field.x * page.width,
    y: page.height - field.y * page.height - height,
    width,
    height
  };
}

function hexToRgb(color: string): { red: number; green: number; blue: number } {
  const normalized = color.replace("#", "");
  const value = normalized.length === 3
    ? normalized
        .split("")
        .map((char) => `${char}${char}`)
        .join("")
    : normalized;

  const parsed = Number.parseInt(value, 16);
  return {
    red: ((parsed >> 16) & 255) / 255,
    green: ((parsed >> 8) & 255) / 255,
    blue: (parsed & 255) / 255
  };
}

export async function exportPdfDocument(options: {
  importedPdf: ImportedPdf;
  fields: PlacedField[];
  pageMappings: PageMapping[];
  signatureProfiles: SignatureProfile[];
  signatureAssets: Record<string, string>;
  fillProfiles: FillProfile[];
}): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await getPdfLib();
  assertUsablePdfBytes(options.importedPdf.bytes);
  const pdfDocument = await PDFDocument.load(clonePdfBytes(options.importedPdf.bytes));
  const font = await pdfDocument.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDocument.embedFont(StandardFonts.HelveticaBold);
  const checkboxColor = rgb(0.11, 0.11, 0.12);

  for (const field of options.fields) {
    const page = pdfDocument.getPage(field.page);
    const pageMapping = options.pageMappings[field.page];
    const coordinates = calculatePdfCoordinates(field, pageMapping);

    if (field.type === "checkbox") {
      page.drawRectangle({
        x: coordinates.x,
        y: coordinates.y,
        width: coordinates.width,
        height: coordinates.height,
        borderColor: checkboxColor,
        borderWidth: 1.15
      });

      if (!field.checked) {
        continue;
      }

      page.drawLine({
        start: {
          x: coordinates.x + coordinates.width * 0.22,
          y: coordinates.y + coordinates.height * 0.48
        },
        end: {
          x: coordinates.x + coordinates.width * 0.44,
          y: coordinates.y + coordinates.height * 0.24
        },
        thickness: 1.4,
        color: checkboxColor
      });

      page.drawLine({
        start: {
          x: coordinates.x + coordinates.width * 0.42,
          y: coordinates.y + coordinates.height * 0.24
        },
        end: {
          x: coordinates.x + coordinates.width * 0.8,
          y: coordinates.y + coordinates.height * 0.76
        },
        thickness: 1.4,
        color: checkboxColor
      });
      continue;
    }

    if (field.type === "signature") {
      if (!field.signatureProfileId) {
        continue;
      }

      const profile = options.signatureProfiles.find((item) => item.id === field.signatureProfileId);
      const asset = profile ? options.signatureAssets[profile.assetRef] : null;
      if (!asset) {
        continue;
      }

      const [, mimePart, base64Part] = asset.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/) ?? [];
      if (!mimePart || !base64Part) {
        continue;
      }

      const imageBytes = Uint8Array.from(atob(base64Part), (char) => char.charCodeAt(0));
      const image =
        mimePart.includes("png")
          ? await pdfDocument.embedPng(imageBytes)
          : await pdfDocument.embedJpg(imageBytes);

      page.drawImage(image, coordinates);
      continue;
    }

    const value = formatFieldValue(field, options.fillProfiles);
    if (!value.trim()) {
      continue;
    }

    const color = hexToRgb(field.style.color);
    page.drawText(value, {
      x: coordinates.x + 4,
      y: coordinates.y + Math.max(4, coordinates.height / 3.2),
      maxWidth: coordinates.width - 8,
      size: field.style.fontSize,
      font: field.style.bold ? fontBold : font,
      color: rgb(color.red, color.green, color.blue),
      lineHeight: field.style.fontSize + 2
    });
  }

  return pdfDocument.save();
}

export { buildExportHistoryEntry, matchTemplates };
