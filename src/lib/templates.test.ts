import { describe, expect, it } from "vitest";
import { buildExportHistoryEntry, matchTemplates } from "./templates";
import type { ImportedPdf, TemplateDefinition } from "../types";

function makeImportedPdf(): ImportedPdf {
  return {
    id: "pdf_1",
    name: "employment-form.pdf",
    bytes: new Uint8Array([1, 2, 3]),
    fingerprint: {
      pageCount: 2,
      pageSizes: [
        { width: 612, height: 792 },
        { width: 612, height: 792 }
      ],
      firstPageTextHash: "same-text"
    },
    pageMappings: [
      { page: 0, width: 612, height: 792 },
      { page: 1, width: 612, height: 792 }
    ]
  };
}

function makeTemplate(overrides?: Partial<TemplateDefinition>): TemplateDefinition {
  return {
    id: "template_1",
    name: "Employment Form",
    fingerprint: {
      pageCount: 2,
      pageSizes: [
        { width: 612, height: 792 },
        { width: 612, height: 792 }
      ],
      firstPageTextHash: "same-text"
    },
    pageMappings: [
      { page: 0, width: 612, height: 792 },
      { page: 1, width: 612, height: 792 }
    ],
    fieldDefinitions: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides
  };
}

describe("template matching", () => {
  it("ranks the closest template first", () => {
    const importedPdf = makeImportedPdf();
    const templates = [
      makeTemplate({
        id: "template_2",
        name: "Different",
        fingerprint: {
          pageCount: 1,
          pageSizes: [{ width: 500, height: 700 }],
          firstPageTextHash: "other"
        }
      }),
      makeTemplate()
    ];

    const [first] = matchTemplates(importedPdf, templates);

    expect(first.templateId).toBe("template_1");
    expect(first.score).toBeGreaterThan(0.9);
  });

  it("records signature usage in export history", () => {
    const entry = buildExportHistoryEntry({
      sourcePdfName: "nda.pdf",
      templateName: "NDA",
      fields: [
        {
          id: "field_1",
          name: "signature-director",
          page: 0,
          type: "signature",
          x: 0.1,
          y: 0.1,
          width: 0.2,
          height: 0.1,
          style: {
            fontSize: 14,
            fontFamily: "Avenir",
            color: "#000000",
            align: "left",
            bold: false
          },
          signatureProfileId: "sig_1"
        }
      ],
      outputName: "nda-filled.pdf"
    });

    expect(entry.signatureProfileIds).toEqual(["sig_1"]);
    expect(entry.outputName).toBe("nda-filled.pdf");
  });
});
