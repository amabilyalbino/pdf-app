export type FieldType = "text" | "date" | "checkbox" | "signature";

export type SignatureSourceType = "upload" | "draw";

export type FieldStyle = {
  fontSize: number;
  fontFamily: string;
  color: string;
  align: "left" | "center" | "right";
  bold: boolean;
};

export type FieldDefinition = {
  id: string;
  name: string;
  page: number;
  type: FieldType;
  x: number;
  y: number;
  width: number;
  height: number;
  style: FieldStyle;
  bindingKey?: string;
  defaultValue?: string;
};

export type PageMapping = {
  page: number;
  width: number;
  height: number;
};

export type TemplateFingerprint = {
  pageCount: number;
  pageSizes: Array<{ width: number; height: number }>;
  firstPageTextHash: string;
};

export type TemplateDefinition = {
  id: string;
  name: string;
  fingerprint: TemplateFingerprint;
  pageMappings: PageMapping[];
  fieldDefinitions: FieldDefinition[];
  createdAt: string;
  updatedAt: string;
};

export type SignatureProfile = {
  id: string;
  displayName: string;
  sourceType: SignatureSourceType;
  assetRef: string;
  createdAt: string;
};

export type FillProfile = {
  id: string;
  name: string;
  values: Record<string, string>;
  createdAt: string;
  updatedAt: string;
};

export type ExportHistoryEntry = {
  id: string;
  createdAt: string;
  sourcePdfName: string;
  templateId?: string;
  templateName?: string;
  signatureProfileIds: string[];
  outputName: string;
};

export type AppStore = {
  templates: TemplateDefinition[];
  fillProfiles: FillProfile[];
  signatureProfiles: SignatureProfile[];
  exportHistory: ExportHistoryEntry[];
  signatureAssets?: Record<string, string>;
};

export type PlacedField = FieldDefinition & {
  value?: string;
  checked?: boolean;
  signatureProfileId?: string;
};

export type ImportedPdf = {
  id: string;
  name: string;
  bytes: Uint8Array;
  fingerprint: TemplateFingerprint;
  pageMappings: PageMapping[];
};

export type WorkingDocument = {
  importedPdf: ImportedPdf;
  fields: PlacedField[];
  appliedTemplateId?: string;
  activePage: number;
};

export type TemplateSuggestion = {
  templateId: string;
  templateName: string;
  score: number;
  reason: string;
};

export type ExportJob = {
  sourcePdfPath?: string;
  templateId?: string;
  fieldValues: PlacedField[];
  signatureSelections: string[];
  outputPath?: string;
};

export type SignatureDraft = {
  sourceType: SignatureSourceType;
  dataUrl: string;
};
