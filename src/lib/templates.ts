import { createId } from "./id";
import type { ExportHistoryEntry, ImportedPdf, PlacedField, TemplateDefinition, TemplateSuggestion } from "../types";

export function matchTemplates(importedPdf: ImportedPdf, templates: TemplateDefinition[]): TemplateSuggestion[] {
  return templates
    .map((template) => {
      let score = 0;
      if (template.fingerprint.pageCount === importedPdf.fingerprint.pageCount) {
        score += 0.5;
      }

      const pageSizeMatches = template.fingerprint.pageSizes.filter((page, pageIndex) => {
        const current = importedPdf.fingerprint.pageSizes[pageIndex];
        if (!current) {
          return false;
        }

        return Math.abs(current.width - page.width) < 2 && Math.abs(current.height - page.height) < 2;
      }).length;

      score += (pageSizeMatches / Math.max(importedPdf.fingerprint.pageCount, 1)) * 0.35;

      if (template.fingerprint.firstPageTextHash === importedPdf.fingerprint.firstPageTextHash) {
        score += 0.15;
      }

      return {
        templateId: template.id,
        templateName: template.name,
        score,
        reason:
          score > 0.9
            ? "Same page count, matching dimensions, and similar opening text."
            : "Similar structure and page size."
      };
    })
    .filter((suggestion) => suggestion.score >= 0.4)
    .sort((left, right) => right.score - left.score);
}

export function buildExportHistoryEntry(options: {
  sourcePdfName: string;
  templateId?: string;
  templateName?: string;
  fields: PlacedField[];
  outputName: string;
}): ExportHistoryEntry {
  return {
    id: createId("export"),
    createdAt: new Date().toISOString(),
    sourcePdfName: options.sourcePdfName,
    templateId: options.templateId,
    templateName: options.templateName,
    signatureProfileIds: options.fields
      .map((field) => field.signatureProfileId)
      .filter((value): value is string => Boolean(value)),
    outputName: options.outputName
  };
}
