import { useEffect, useMemo, useRef, useState } from "react";
import { FieldOverlay } from "./components/FieldOverlay";
import { PdfPageCanvas } from "./components/PdfPageCanvas";
import { SignaturePad } from "./components/SignaturePad";
import {
  cloneField,
  createField,
  fieldToTemplateDefinition,
  instantiateTemplate
} from "./lib/field";
import { exportPdfDocument, importPdfFromFile } from "./lib/pdf";
import { createId } from "./lib/id";
import {
  EMPTY_STORE,
  loadStore,
  persistSignatureAsset,
  resolveSignatureAsset,
  saveStore,
  signaturePersistenceMode
} from "./lib/storage";
import { isTauriApp, saveBytesWithDialog } from "./lib/tauri";
import { buildExportHistoryEntry, matchTemplates } from "./lib/templates";
import type {
  AppStore,
  FieldType,
  PlacedField,
  SignatureDraft,
  SignatureProfile,
  TemplateDefinition,
  TemplateSuggestion,
  WorkingDocument
} from "./types";

type Notice = {
  tone: "info" | "success" | "error";
  message: string;
};

const HISTORY_DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  dateStyle: "short",
  timeStyle: "short"
});

const FIELD_TYPES = [
  { type: "text", label: "Text" },
  { type: "date", label: "Date" },
  { type: "checkbox", label: "Checkbox" },
  { type: "signature", label: "Signature" }
] as const;

const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  text: "text",
  date: "date",
  checkbox: "checkbox",
  signature: "signature"
};

const FIELD_TYPE_ICONS: Record<FieldType, string> = {
  text: "Aa",
  date: "31",
  checkbox: "☑",
  signature: "✦"
};

const FIELD_TYPE_ACTION_HELPERS: Record<FieldType, string> = {
  text: "Add text",
  date: "Add date",
  checkbox: "Add checkbox",
  signature: "Add signature"
};

type AppProps = {
  authEmail?: string | null;
  authProtected?: boolean;
  authBypassed?: boolean;
  onSignOut?: () => Promise<void>;
};

type WorkspacePanel = "insert" | "signatures" | "templates";

export default function App({
  authProtected = false,
  onSignOut
}: AppProps) {
  const desktopRuntime = isTauriApp();
  const [store, setStore] = useState<AppStore>(EMPTY_STORE);
  const [workingDocument, setWorkingDocument] = useState<WorkingDocument | null>(null);
  const [pdfDocumentProxy, setPdfDocumentProxy] = useState<Awaited<ReturnType<typeof importPdfFromFile>>["pdfjsDocument"] | null>(null);
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<TemplateSuggestion[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [signatureAssetCache, setSignatureAssetCache] = useState<Record<string, string>>({});
  const [workspacePanel, setWorkspacePanel] = useState<WorkspacePanel>("insert");
  const [isTemplatesOpen, setIsTemplatesOpen] = useState(false);
  const [pendingFieldType, setPendingFieldType] = useState<FieldType | null>(null);
  const [pendingSignatureProfileId, setPendingSignatureProfileId] = useState<string | null>(null);
  const [showSignatureCreator, setShowSignatureCreator] = useState(false);
  const [isDragActive, setIsDragActive] = useState(false);
  const [signatureDraft, setSignatureDraft] = useState<SignatureDraft>({
    sourceType: "upload",
    dataUrl: "",
    fileName: ""
  });
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const pageStageRef = useRef<HTMLDivElement | null>(null);
  const pageRefs = useRef<Record<number, HTMLElement | null>>({});
  const dragDepthRef = useRef(0);

  useEffect(() => {
    let active = true;

    async function bootstrap() {
      const nextStore = await loadStore();
      if (!active) {
        return;
      }

      setStore(nextStore);
      setSignatureAssetCache(nextStore.signatureAssets ?? {});
      setLoaded(true);
    }

    bootstrap();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!loaded) {
      return;
    }

    saveStore(store);
  }, [loaded, store]);

  useEffect(() => {
    let cancelled = false;

    async function hydrateAssets() {
      const missingProfiles = store.signatureProfiles.filter((profile) => !signatureAssetCache[profile.assetRef]);
      if (missingProfiles.length === 0) {
        return;
      }

      const resolvedEntries = await Promise.all(
        missingProfiles.map(async (profile) => [profile.assetRef, await resolveSignatureAsset(store, profile.assetRef)] as const)
      );

      if (cancelled) {
        return;
      }

      const nextAssets = resolvedEntries.reduce<Record<string, string>>((accumulator, [assetRef, dataUrl]) => {
        if (dataUrl) {
          accumulator[assetRef] = dataUrl;
        }
        return accumulator;
      }, {});

      if (Object.keys(nextAssets).length > 0) {
        setSignatureAssetCache((current) => ({
          ...current,
          ...nextAssets
        }));
      }
    }

    hydrateAssets();

    return () => {
      cancelled = true;
    };
  }, [signatureAssetCache, store]);

  useEffect(() => {
    const root = pageStageRef.current;
    if (!root || !workingDocument) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((left, right) => right.intersectionRatio - left.intersectionRatio)[0];

        if (!visible) {
          return;
        }

        const page = Number((visible.target as HTMLElement).dataset.page);
        if (Number.isNaN(page)) {
          return;
        }

        setWorkingDocument((current) =>
          current && current.activePage !== page
            ? {
                ...current,
                activePage: page
              }
            : current
        );
      },
      {
        root,
        threshold: [0.45, 0.6, 0.8]
      }
    );

    workingDocument.importedPdf.pageMappings.forEach((mapping) => {
      const element = pageRefs.current[mapping.page];
      if (element) {
        observer.observe(element);
      }
    });

    return () => observer.disconnect();
  }, [workingDocument]);

  const selectedField = useMemo(
    () => workingDocument?.fields.find((field) => field.id === selectedFieldId) ?? null,
    [selectedFieldId, workingDocument]
  );

  const activePageFields = useMemo(
    () => workingDocument?.fields.filter((field) => field.page === workingDocument.activePage) ?? [],
    [workingDocument]
  );

  const signatureFields = useMemo(
    () => workingDocument?.fields.filter((field) => field.type === "signature") ?? [],
    [workingDocument]
  );

  const valueRequiredFields = useMemo(
    () => workingDocument?.fields.filter((field) => field.type === "text" || field.type === "date") ?? [],
    [workingDocument]
  );

  const assignedSignatureFields = useMemo(
    () => signatureFields.filter((field) => Boolean(field.signatureProfileId)),
    [signatureFields]
  );

  const hasAnyFields = (workingDocument?.fields.length ?? 0) > 0;
  const missingSignatureCount = Math.max(signatureFields.length - assignedSignatureFields.length, 0);
  const missingValueCount = valueRequiredFields.filter((field) => !(field.value ?? "").trim()).length;

  const exportBlockers = useMemo(() => {
    const blockers: string[] = [];

    if (!workingDocument) {
      blockers.push("Import a PDF to continue.");
      return blockers;
    }

    if (!hasAnyFields) {
      blockers.push("No fields added yet.");
    }

    if (hasAnyFields) {
      if (missingSignatureCount > 0 && missingValueCount > 0) {
        blockers.push("Complete the missing fields before exporting.");
      } else if (missingSignatureCount > 0) {
        blockers.push("Add a signature before exporting.");
      } else if (missingValueCount > 0) {
        blockers.push(`Add content to ${missingValueCount} field${missingValueCount === 1 ? "" : "s"} before exporting.`);
      }
    }

    return blockers;
  }, [hasAnyFields, missingSignatureCount, missingValueCount, workingDocument]);

  const canExport = workingDocument !== null && hasAnyFields && exportBlockers.length === 0;
  const hasWorkingDocument = Boolean(workingDocument && pdfDocumentProxy);
  const selectedSignatureField = selectedField?.type === "signature" ? selectedField : null;
  const selectedSignatureProfile = selectedSignatureField?.signatureProfileId
    ? store.signatureProfiles.find((profile) => profile.id === selectedSignatureField.signatureProfileId) ?? null
    : null;
  const pendingSignatureProfile = pendingSignatureProfileId
    ? store.signatureProfiles.find((profile) => profile.id === pendingSignatureProfileId) ?? null
    : null;
  const highlightedSignatureProfileId = selectedSignatureProfile?.id ?? pendingSignatureProfileId;
  const sessionOnlySignatures = !desktopRuntime && signaturePersistenceMode === "session";
  const placementLabel =
    pendingFieldType === "signature" && pendingSignatureProfile
      ? `Placing ${pendingSignatureProfile.displayName.toLowerCase()}`
      : pendingFieldType
        ? `Placing ${FIELD_TYPE_LABELS[pendingFieldType]}`
        : null;
  const activePageMapping = workingDocument?.importedPdf.pageMappings[workingDocument.activePage] ?? null;
  const loadedWorkingDocument = hasWorkingDocument ? workingDocument : null;
  const loadedPdfDocument = hasWorkingDocument ? pdfDocumentProxy : null;
  const exportReadinessMessage = !workingDocument
    ? "Import a PDF to continue."
    : !hasAnyFields
      ? "No fields added yet."
      : missingSignatureCount > 0
        ? "Add a signature before exporting."
        : missingValueCount > 0
          ? "Complete missing fields before exporting."
          : "Ready to export.";
  const exportReadinessTone = !workingDocument || !hasAnyFields ? "neutral" : canExport ? "success" : "warning";
  const canvasHelperMessage =
    selectedField
      ? "Edit the selected field using the settings panel."
      : pendingFieldType === "text"
        ? "Text selected — click on the PDF to place a text field."
        : pendingFieldType === "date"
          ? "Date selected — click on the PDF to place a date field."
          : pendingFieldType === "checkbox"
            ? "Checkbox selected — click on the PDF to place a checkbox."
            : pendingFieldType === "signature"
              ? "Signature selected — click on the PDF to place a signature field."
              : "Choose what you want to add, then click on the PDF.";

  function flash(nextNotice: Notice) {
    setNotice(nextNotice);
    window.clearTimeout((flash as unknown as { timeout?: number }).timeout);
    (flash as unknown as { timeout?: number }).timeout = window.setTimeout(() => setNotice(null), 2800);
  }

  async function handlePdfSelection(file: File | null) {
    if (!file) {
      return;
    }

    setIsBusy(true);

    try {
      const loadedPdf = await importPdfFromFile(file);
      const templateSuggestions = matchTemplates(loadedPdf.importedPdf, store.templates);

      setWorkingDocument({
        importedPdf: loadedPdf.importedPdf,
        fields: [],
        activePage: 0
      });
      setPdfDocumentProxy(loadedPdf.pdfjsDocument);
      setSuggestions(templateSuggestions);
      setSelectedFieldId(null);
      setPendingFieldType(null);
      setWorkspacePanel("insert");

      if (templateSuggestions[0] && templateSuggestions[0].score > 0.92) {
        applyTemplate(templateSuggestions[0].templateId, loadedPdf.importedPdf.id);
      }

      flash({
        tone: "success",
        message:
          templateSuggestions.length > 0
            ? `PDF imported. Found ${templateSuggestions.length} matching template(s).`
            : "PDF imported. Now add fields and assign signatures."
      });
    } catch (error) {
      flash({
        tone: "error",
        message: error instanceof Error ? error.message : "I couldn't open this PDF."
      });
    } finally {
      setIsBusy(false);
    }
  }

  useEffect(() => {
    function hasPdfPayload(dataTransfer: DataTransfer | null) {
      if (!dataTransfer) {
        return false;
      }

      const files = Array.from(dataTransfer.files ?? []);
      return files.some((file) => file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf"));
    }

    function extractPdfFile(fileList: FileList | null) {
      const files = Array.from(fileList ?? []);
      return files.find((file) => file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) ?? null;
    }

    function handleDragEnter(event: DragEvent) {
      if (!hasPdfPayload(event.dataTransfer)) {
        return;
      }

      event.preventDefault();
      dragDepthRef.current += 1;
      setIsDragActive(true);
    }

    function handleDragOver(event: DragEvent) {
      if (!hasPdfPayload(event.dataTransfer)) {
        return;
      }

      event.preventDefault();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = "copy";
      }
      setIsDragActive(true);
    }

    function handleDragLeave(event: DragEvent) {
      if (!hasPdfPayload(event.dataTransfer)) {
        return;
      }

      event.preventDefault();
      dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
      if (dragDepthRef.current === 0) {
        setIsDragActive(false);
      }
    }

    function handleDrop(event: DragEvent) {
      if (!hasPdfPayload(event.dataTransfer)) {
        return;
      }

      event.preventDefault();
      dragDepthRef.current = 0;
      setIsDragActive(false);
      const file = extractPdfFile(event.dataTransfer?.files ?? null);
      if (file) {
        void handlePdfSelection(file);
      }
    }

    window.addEventListener("dragenter", handleDragEnter);
    window.addEventListener("dragover", handleDragOver);
    window.addEventListener("dragleave", handleDragLeave);
    window.addEventListener("drop", handleDrop);

    return () => {
      window.removeEventListener("dragenter", handleDragEnter);
      window.removeEventListener("dragover", handleDragOver);
      window.removeEventListener("dragleave", handleDragLeave);
      window.removeEventListener("drop", handleDrop);
    };
  }, [store, workingDocument]);

  function promptImport() {
    fileInputRef.current?.click();
  }

  function clearPendingPlacement() {
    setPendingFieldType(null);
    setPendingSignatureProfileId(null);
  }

  function beginFieldPlacement(type: FieldType) {
    if (!workingDocument) {
      flash({
        tone: "info",
        message: "Import a PDF before adding fields."
      });
      return;
    }

    setWorkspacePanel("insert");
    setPendingFieldType((current) => (current === type ? null : type));
    setPendingSignatureProfileId(null);
    setSelectedFieldId(null);
  }

  function setActivePage(pageIndex: number) {
    if (!workingDocument || workingDocument.activePage === pageIndex) {
      return;
    }

    setWorkingDocument({
      ...workingDocument,
      activePage: pageIndex
    });
  }

  function placeFieldOnPage(pageIndex: number, event: React.MouseEvent<HTMLDivElement>) {
    if (!workingDocument || !pendingFieldType) {
      setActivePage(pageIndex);
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const nextField = createField(pageIndex, pendingFieldType);
    const relativeX = (event.clientX - rect.left) / rect.width;
    const relativeY = (event.clientY - rect.top) / rect.height;

    nextField.x = Math.max(0, Math.min(relativeX - nextField.width / 2, 1 - nextField.width));
    nextField.y = Math.max(0, Math.min(relativeY - nextField.height / 2, 1 - nextField.height));
    if (pendingFieldType === "signature" && pendingSignatureProfileId) {
      nextField.signatureProfileId = pendingSignatureProfileId;
    }

    setWorkingDocument({
      ...workingDocument,
      activePage: pageIndex,
      fields: [...workingDocument.fields, nextField]
    });
    setSelectedFieldId(nextField.id);
    clearPendingPlacement();
  }

  function updateField(nextField: PlacedField) {
    if (!workingDocument) {
      return;
    }

    setWorkingDocument({
      ...workingDocument,
      fields: workingDocument.fields.map((field) => (field.id === nextField.id ? nextField : field))
    });
  }

  function removeField(fieldId: string) {
    if (!workingDocument) {
      return;
    }

    setWorkingDocument({
      ...workingDocument,
      fields: workingDocument.fields.filter((field) => field.id !== fieldId)
    });
    setSelectedFieldId(null);
  }

  function duplicateField(fieldId: string) {
    if (!workingDocument) {
      return;
    }

    const field = workingDocument.fields.find((item) => item.id === fieldId);
    if (!field) {
      return;
    }

    const duplicate = cloneField(field);
    setWorkingDocument({
      ...workingDocument,
      activePage: duplicate.page,
      fields: [...workingDocument.fields, duplicate]
    });
    setSelectedFieldId(duplicate.id);
  }

  function applyTemplate(templateId: string, importedPdfId?: string) {
    const template = store.templates.find((item) => item.id === templateId);
    if (!template || !workingDocument) {
      return;
    }

    const hydratedFields = instantiateTemplate(template);
    setWorkingDocument((current) => {
      if (!current || (importedPdfId && current.importedPdf.id !== importedPdfId)) {
        return current;
      }

      return {
        ...current,
        fields: hydratedFields,
        appliedTemplateId: template.id
      };
    });
    setSelectedFieldId(hydratedFields[0]?.id ?? null);
    flash({
      tone: "success",
      message: `Template "${template.name}" applied.`
    });
  }

  function saveCurrentTemplate() {
    if (!workingDocument || workingDocument.fields.length === 0) {
      flash({
        tone: "info",
        message: "Add at least one field before saving a template."
      });
      return;
    }

    const now = new Date().toISOString();
    const existing = workingDocument.appliedTemplateId
      ? store.templates.find((item) => item.id === workingDocument.appliedTemplateId)
      : null;
    const name = (existing?.name ?? workingDocument.importedPdf.name.replace(/\.pdf$/i, "")).trim() || `Template ${store.templates.length + 1}`;

    const template: TemplateDefinition = {
      id: existing?.id ?? createId("template"),
      name,
      fingerprint: workingDocument.importedPdf.fingerprint,
      pageMappings: workingDocument.importedPdf.pageMappings,
      fieldDefinitions: workingDocument.fields.map(fieldToTemplateDefinition),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    };

    setStore({
      ...store,
      templates: existing
        ? store.templates.map((item) => (item.id === existing.id ? template : item))
        : [template, ...store.templates]
    });
    setWorkingDocument({
      ...workingDocument,
      appliedTemplateId: template.id
    });
    flash({
      tone: "success",
      message: `Template "${name}" saved successfully.`
    });
  }

  function createNextSignatureName() {
    return `Signature ${String(store.signatureProfiles.length + 1).padStart(2, "0")}`;
  }

  function activateSignatureProfile(profileId: string) {
    const profile = store.signatureProfiles.find((item) => item.id === profileId);
    if (!profile) {
      return;
    }

    setShowSignatureCreator(false);
    setWorkspacePanel("signatures");

    if (selectedField && selectedField.type === "signature") {
      updateField({
        ...selectedField,
        signatureProfileId: profile.id
      });
      setPendingSignatureProfileId(null);
      flash({
        tone: "success",
        message: `Signature "${profile.displayName}" applied to the selected field.`
      });
      return;
    }

    if (!workingDocument) {
      flash({
        tone: "info",
        message: "Import a PDF to place the signature."
      });
      return;
    }

    setPendingFieldType("signature");
    setPendingSignatureProfileId(profile.id);
    setSelectedFieldId(null);
    flash({
      tone: "info",
      message: `Click the PDF to place "${profile.displayName}".`
    });
  }

  async function saveSignatureProfile() {
    if (!signatureDraft.dataUrl) {
      flash({
        tone: "info",
        message: "Create or upload the signature before saving."
      });
      return;
    }

    const persisted = await persistSignatureAsset(store, signatureDraft);
    const profile: SignatureProfile = {
      id: createId("signature_profile"),
      displayName: createNextSignatureName(),
      sourceType: signatureDraft.sourceType,
      assetRef: persisted.assetRef,
      createdAt: new Date().toISOString()
    };

    setStore({
      ...persisted.nextStore,
      signatureProfiles: [profile, ...persisted.nextStore.signatureProfiles]
    });
    setSignatureAssetCache((current) => ({
      ...current,
      [persisted.assetRef]: signatureDraft.dataUrl
    }));
    setSignatureDraft({
      sourceType: "upload",
      dataUrl: "",
      fileName: ""
    });
    setShowSignatureCreator(false);
    setWorkspacePanel("signatures");

    if (selectedField && selectedField.type === "signature") {
      updateField({
        ...selectedField,
        signatureProfileId: profile.id
      });
      flash({
        tone: "success",
        message: `Signature "${profile.displayName}" saved and applied to the selected field.`
      });
      return;
    }

    if (workingDocument) {
      setPendingFieldType("signature");
      setPendingSignatureProfileId(profile.id);
      setSelectedFieldId(null);
      flash({
        tone: "success",
        message: `Signature "${profile.displayName}" saved. Click the PDF to place it.`
      });
      return;
    }

    flash({
      tone: "success",
      message: `Signature "${profile.displayName}" saved.`
    });
  }

  function clearSelectedSignatureField() {
    if (!selectedSignatureField) {
      return;
    }

    updateField({
      ...selectedSignatureField,
      signatureProfileId: undefined
    });
    flash({
      tone: "success",
      message: "Signature removed from the selected field."
    });
  }

  async function exportCurrentPdf() {
    if (!workingDocument || !canExport) {
      flash({
        tone: "info",
        message: exportBlockers[0] ?? "Import a PDF before exporting."
      });
      return;
    }

    setIsBusy(true);

    try {
      const selectedTemplate = store.templates.find((template) => template.id === workingDocument.appliedTemplateId);
      const bytes = await exportPdfDocument({
        importedPdf: workingDocument.importedPdf,
        fields: workingDocument.fields,
        pageMappings: workingDocument.importedPdf.pageMappings,
        signatureProfiles: store.signatureProfiles,
        signatureAssets: signatureAssetCache,
        fillProfiles: []
      });

      const outputName = workingDocument.importedPdf.name.replace(/\.pdf$/i, "") + "-filled.pdf";
      const outputPath = await saveBytesWithDialog(outputName, bytes);
      if (!outputPath) {
        return;
      }

      const historyEntry = buildExportHistoryEntry({
        sourcePdfName: workingDocument.importedPdf.name,
        templateId: selectedTemplate?.id,
        templateName: selectedTemplate?.name,
        fields: workingDocument.fields,
        outputName
      });

      setStore({
        ...store,
        exportHistory: [historyEntry, ...store.exportHistory].slice(0, 20)
      });

      flash({
        tone: "success",
        message: isTauriApp() ? `PDF exported to ${outputPath}.` : "PDF exported successfully."
      });
    } catch (error) {
      const fallbackMessage = "Failed to export the PDF.";
      const rawMessage = error instanceof Error ? error.message : fallbackMessage;
      const friendlyMessage = rawMessage.includes("No PDF header found")
        ? "The original PDF became unavailable for export. Reimport the file and try again."
        : rawMessage;

      flash({
        tone: "error",
        message: friendlyMessage || fallbackMessage
      });
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <div className="app-shell">
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0] ?? null;
          event.currentTarget.value = "";
          handlePdfSelection(file);
        }}
      />

      <header className="topbar">
        <div className="topbar__brand">
          <span className="topbar__mark" aria-hidden="true">
            <span className="topbar__mark-core" />
          </span>
          <strong>Ops PDF Studio</strong>
          <span className="topbar__divider" aria-hidden="true" />
          <div className="topbar__document">
            <span className="topbar__filename">{workingDocument ? workingDocument.importedPdf.name : "No document loaded"}</span>
            {workingDocument ? <span className="topbar__meta">{workingDocument.importedPdf.pageMappings.length} pages</span> : null}
          </div>
        </div>
        <div className="topbar__actions">
          <button type="button" className="button button--ghost" onClick={promptImport} disabled={isBusy}>
            Import PDF
          </button>
          <button type="button" className="button button--ghost" onClick={saveCurrentTemplate} disabled={!hasAnyFields}>
            Save Template
          </button>
          <button type="button" className="button" onClick={exportCurrentPdf} disabled={!canExport || isBusy}>
            Export PDF
          </button>
          {authProtected && onSignOut ? (
            <button type="button" className="button button--ghost" onClick={() => void onSignOut()}>
              Sign out
            </button>
          ) : null}
        </div>
      </header>

      {notice ? <div className={`notice notice--${notice.tone}`}>{notice.message}</div> : null}

      <main className={`workspace ${hasWorkingDocument ? "workspace--loaded" : "workspace--empty"}`}>
        {loadedWorkingDocument && loadedPdfDocument ? (
          <>
            <aside className="sidebar sidebar--left">
              <section className="panel panel--focus">
                <div className="panel__header">
                  <h2>Document</h2>
                </div>
                <div className="stack compact">
                  <div className="meta-card meta-card--minimal meta-card--document">
                    <span className="meta-card__icon" aria-hidden="true">
                      📄
                    </span>
                    <div className="meta-card__content">
                      <strong>{loadedWorkingDocument.importedPdf.name}</strong>
                      <span>{loadedWorkingDocument.importedPdf.pageMappings.length} pages</span>
                    </div>
                  </div>
                </div>
              </section>

              <section className={`panel ${workspacePanel === "insert" ? "panel--focus" : ""}`}>
                <div className="panel__header">
                  <h2>Add to PDF</h2>
                </div>
                <div className="field-grid">
                  {FIELD_TYPES.map((item) => (
                    <button
                      key={item.type}
                      type="button"
                      className={`field-type-card ${pendingFieldType === item.type ? "is-active" : ""}`}
                      onClick={() => beginFieldPlacement(item.type)}
                      >
                      <div className="field-type-card__header">
                        <span className="field-type-card__icon" aria-hidden="true">
                          {FIELD_TYPE_ICONS[item.type]}
                        </span>
                        <strong>{item.label}</strong>
                      </div>
                      <span>{pendingFieldType === item.type ? "Selected" : FIELD_TYPE_ACTION_HELPERS[item.type]}</span>
                    </button>
                  ))}
                </div>
              </section>

              <section className={`panel ${workspacePanel === "signatures" ? "panel--focus" : ""}`}>
                <div className="panel__header">
                  <h2>Signatures</h2>
                  <button
                    type="button"
                    className="button button--chip"
                    onClick={() => setShowSignatureCreator((current) => !current)}
                  >
                    {showSignatureCreator ? "Close" : "New signature"}
                  </button>
                </div>
                <p className="helper-copy">
                  {sessionOnlySignatures
                    ? "Saved for this session only."
                    : "Saved signatures are ready to use."}
                </p>
                {showSignatureCreator ? (
                  <div className="stack signature-creator">
                    <div className="signature-creator__header">
                      <h3>Add signature</h3>
                    </div>
                    <div className="segmented">
                      <button
                        type="button"
                        className={signatureDraft.sourceType === "upload" ? "is-active" : ""}
                        onClick={() => setSignatureDraft({ ...signatureDraft, sourceType: "upload" })}
                      >
                        Upload
                      </button>
                      <button
                        type="button"
                        className={signatureDraft.sourceType === "draw" ? "is-active" : ""}
                        onClick={() => setSignatureDraft({ ...signatureDraft, sourceType: "draw" })}
                      >
                        Draw
                      </button>
                    </div>
                    {signatureDraft.sourceType === "upload" ? (
                      <label className="upload-box">
                        <span className="upload-box__title">Upload PNG or JPG</span>
                        <div className="upload-box__row">
                          <span className="upload-box__button">Choose file</span>
                          <span className="upload-box__filename">{signatureDraft.fileName || "No file selected"}</span>
                        </div>
                        <input
                          className="upload-box__input"
                          type="file"
                          accept="image/png,image/jpeg"
                          onChange={async (event) => {
                            const file = event.target.files?.[0];
                            if (!file) {
                              return;
                            }

                            const reader = new FileReader();
                            reader.onload = () => {
                              setSignatureDraft((current) => ({
                                ...current,
                                dataUrl: String(reader.result ?? ""),
                                fileName: file.name
                              }));
                            };
                            reader.readAsDataURL(file);
                          }}
                        />
                        {signatureDraft.dataUrl ? <img src={signatureDraft.dataUrl} alt="Signature preview" /> : null}
                      </label>
                    ) : (
                      <SignaturePad
                        initialDataUrl={signatureDraft.dataUrl}
                        onChange={(dataUrl) => setSignatureDraft((current) => ({ ...current, dataUrl }))}
                      />
                    )}
                    <div className="panel__row-actions">
                      <button type="button" className="button" onClick={saveSignatureProfile}>
                        Save signature
                      </button>
                    </div>
                  </div>
                ) : null}
                <div className={`signature-library ${showSignatureCreator ? "signature-library--compact" : ""}`}>
                  {store.signatureProfiles.map((profile) => (
                    <button
                      key={profile.id}
                      type="button"
                      className={`signature-card ${highlightedSignatureProfileId === profile.id ? "is-selected" : ""}`}
                      onClick={() => activateSignatureProfile(profile.id)}
                    >
                      <div className="signature-card__preview">
                        {signatureAssetCache[profile.assetRef] ? (
                          <img src={signatureAssetCache[profile.assetRef]} alt={profile.displayName} />
                        ) : null}
                      </div>
                      <div className="signature-card__meta">
                        <strong>{profile.displayName}</strong>
                        <span>
                          {selectedSignatureField?.signatureProfileId === profile.id
                            ? "Applied to selected field"
                            : pendingSignatureProfileId === profile.id
                              ? "Click on the page to place"
                              : sessionOnlySignatures
                                ? "Saved for this session"
                                : "Ready to use"}
                        </span>
                      </div>
                    </button>
                  ))}
                  {store.signatureProfiles.length === 0 ? <p className="helper-copy">No saved signatures yet.</p> : null}
                </div>
              </section>

              <details
                className={`panel panel--collapsible ${workspacePanel === "templates" ? "panel--focus" : ""}`}
                open={isTemplatesOpen}
                onToggle={(event) => setIsTemplatesOpen((event.currentTarget as HTMLDetailsElement).open)}
              >
                <summary className="panel__summary">
                  <span>Templates</span>
                  <span className="panel__summary-indicator">{isTemplatesOpen ? "Hide" : "Show"}</span>
                </summary>
                <div className="panel__collapsible-body">
                  {suggestions.length > 0 ? (
                    <div className="stack compact">
                      {suggestions.slice(0, 3).map((suggestion) => (
                        <button
                          key={suggestion.templateId}
                          type="button"
                          className="suggestion-card"
                          onClick={() => applyTemplate(suggestion.templateId)}
                        >
                          <strong>{suggestion.templateName}</strong>
                          <span>{Math.round(suggestion.score * 100)}% match</span>
                        </button>
                      ))}
                    </div>
                  ) : store.templates.length > 0 ? (
                    <div className="stack compact">
                      {store.templates.map((template) => (
                        <button key={template.id} type="button" className="template-card" onClick={() => applyTemplate(template.id)}>
                          <strong>{template.name}</strong>
                          <span>{template.fieldDefinitions.length} field(s)</span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="helper-copy">No saved templates yet.</p>
                  )}
                </div>
              </details>
            </aside>

            <section className="editor-surface">
              <div className="canvas-header">
                <div className="canvas-header__title">
                  <p className="eyebrow">PDF canvas</p>
                  <h2>
                    Page {loadedWorkingDocument.activePage + 1}
                    {activePageMapping ? ` of ${loadedWorkingDocument.importedPdf.pageMappings.length}` : ""}
                  </h2>
                  <p className="canvas-helper">{canvasHelperMessage}</p>
                </div>
                <div className="canvas-header__meta">
                  <span className="canvas-pill">{activePageFields.length} field(s) on this page</span>
                  <span className="canvas-pill">{loadedWorkingDocument.fields.length} total field(s)</span>
                  {placementLabel ? <span className="canvas-status">{placementLabel}</span> : null}
                  {pendingFieldType ? (
                    <button type="button" className="button button--chip" onClick={clearPendingPlacement}>
                      Cancel
                    </button>
                  ) : null}
                </div>
              </div>
              <div className={`export-readiness export-readiness--${exportReadinessTone}`}>
                <span>{exportReadinessMessage}</span>
              </div>

              <div className="page-stage" ref={pageStageRef}>
                {!hasAnyFields ? (
                  <div className="canvas-empty-hint">
                    <strong>Your document is ready.</strong>
                    <span>Choose a tool on the left, then click on the PDF to place your first field.</span>
                  </div>
                ) : null}
                <div className="page-stack">
                  {loadedWorkingDocument.importedPdf.pageMappings.map((mapping) => {
                    const pageFields = loadedWorkingDocument.fields.filter((field) => field.page === mapping.page);
                    const isActivePage = loadedWorkingDocument.activePage === mapping.page;

                    return (
                      <section
                        key={mapping.page}
                        ref={(node) => {
                          pageRefs.current[mapping.page] = node;
                        }}
                        data-page={mapping.page}
                        className={`page-card ${isActivePage ? "is-active" : ""}`}
                        onClick={() => {
                          setActivePage(mapping.page);
                          if (!pendingFieldType) {
                            setSelectedFieldId(null);
                          }
                        }}
                      >
                        <div className="page-card__header">
                          <span>Page {mapping.page + 1}</span>
                          <span>{pageFields.length} field(s)</span>
                        </div>
                        <div className="page-frame">
                          <div className="page-sheet">
                            <PdfPageCanvas
                              documentProxy={loadedPdfDocument}
                              pageIndex={mapping.page}
                              width={mapping.width}
                              height={mapping.height}
                            />
                            <div
                              className={`page-overlay ${pendingFieldType ? "is-placement" : ""}`}
                              onClick={(event) => placeFieldOnPage(mapping.page, event)}
                            >
                              {pageFields.map((field) => (
                                <FieldOverlay
                                  key={field.id}
                                  field={field}
                                  selected={selectedFieldId === field.id}
                                  signatureProfiles={store.signatureProfiles}
                                  signatureAssets={signatureAssetCache}
                                  fillProfiles={[]}
                                  onSelect={() => {
                                    setSelectedFieldId(field.id);
                                    setActivePage(field.page);
                                    setPendingFieldType(null);
                                  }}
                                  onChange={updateField}
                                  onDuplicate={() => duplicateField(field.id)}
                                  onDelete={() => removeField(field.id)}
                                />
                              ))}
                            </div>
                          </div>
                        </div>
                      </section>
                    );
                  })}
                </div>
              </div>
            </section>

            <aside className="sidebar sidebar--right">
              <section className="panel">
                <div className="panel__header">
                  <h2>Field settings</h2>
                </div>
                {selectedField ? (
                  <div className="stack inspector-stack">
                    {selectedField.type === "signature" ? (
                      <div className="stack compact">
                        <div className="inspector-section">
                          <h3 className="inspector-section__title">Selected field</h3>
                          <div className="inspector-chip">Signature</div>
                        </div>
                        <div className="inspector-section">
                          <h3 className="inspector-section__title">Status</h3>
                          <p className="inspector-copy">
                            {selectedField.signatureProfileId ? "Signature applied" : "Needs a signature"}
                          </p>
                        </div>
                        <div className="inspector-section">
                          <h3 className="inspector-section__title">Instruction</h3>
                          <div className="context-banner">
                            <span>
                              {selectedField.signatureProfileId
                                ? "Use the signatures panel to replace or remove it."
                                : "Choose or create a signature in the signatures panel."}
                            </span>
                            {selectedField.signatureProfileId ? (
                              <button type="button" className="button button--chip" onClick={clearSelectedSignatureField}>
                                Remove signature
                              </button>
                            ) : null}
                          </div>
                        </div>
                        <div className="inspector-section">
                          <h3 className="inspector-section__title">Size</h3>
                          <div className="inline-grid">
                            <label className="form-field">
                              <span>Width</span>
                              <input
                                type="number"
                                min={0.04}
                                max={1}
                                step={0.01}
                                value={selectedField.width}
                                onChange={(event) =>
                                  updateField({
                                    ...selectedField,
                                    width: Number(event.target.value)
                                  })
                                }
                              />
                            </label>
                            <label className="form-field">
                              <span>Height</span>
                              <input
                                type="number"
                                min={0.03}
                                max={1}
                                step={0.01}
                                value={selectedField.height}
                                onChange={(event) =>
                                  updateField({
                                    ...selectedField,
                                    height: Number(event.target.value)
                                  })
                                }
                              />
                            </label>
                          </div>
                        </div>
                        <div className="inspector-section">
                          <h3 className="inspector-section__title">Actions</h3>
                          <div className="inline-grid">
                            <button type="button" className="button button--ghost" onClick={() => duplicateField(selectedField.id)}>
                              Duplicate field
                            </button>
                            <button type="button" className="button button--danger" onClick={() => removeField(selectedField.id)}>
                              Delete field
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : selectedField.type === "checkbox" ? (
                      <div className="stack compact">
                        <div className="inspector-section">
                          <h3 className="inspector-section__title">Selected field</h3>
                          <div className="inspector-chip">Checkbox</div>
                        </div>
                        <div className="inspector-section">
                          <h3 className="inspector-section__title">Value</h3>
                          <label className="toggle-row">
                            <input
                              type="checkbox"
                              checked={Boolean(selectedField.checked)}
                              onChange={(event) =>
                                updateField({
                                  ...selectedField,
                                  checked: event.target.checked
                                })
                              }
                            />
                            <span>Checked</span>
                          </label>
                        </div>
                        <div className="inspector-section">
                          <h3 className="inspector-section__title">Size</h3>
                          <div className="inline-grid">
                            <label className="form-field">
                              <span>Width</span>
                              <input
                                type="number"
                                min={0.04}
                                max={1}
                                step={0.01}
                                value={selectedField.width}
                                onChange={(event) =>
                                  updateField({
                                    ...selectedField,
                                    width: Number(event.target.value)
                                  })
                                }
                              />
                            </label>
                            <label className="form-field">
                              <span>Height</span>
                              <input
                                type="number"
                                min={0.03}
                                max={1}
                                step={0.01}
                                value={selectedField.height}
                                onChange={(event) =>
                                  updateField({
                                    ...selectedField,
                                    height: Number(event.target.value)
                                  })
                                }
                              />
                            </label>
                          </div>
                        </div>
                        <div className="inspector-section">
                          <h3 className="inspector-section__title">Actions</h3>
                          <div className="inline-grid">
                            <button type="button" className="button button--ghost" onClick={() => duplicateField(selectedField.id)}>
                              Duplicate field
                            </button>
                            <button type="button" className="button button--danger" onClick={() => removeField(selectedField.id)}>
                              Delete field
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="stack compact">
                        <div className="inspector-section">
                          <h3 className="inspector-section__title">Selected field</h3>
                          <div className="inspector-chip">{selectedField.type === "date" ? "Date" : "Text"}</div>
                        </div>
                        <div className="inspector-section">
                          <h3 className="inspector-section__title">Content</h3>
                          <label className="form-field">
                            <span>Value</span>
                            <input
                              value={selectedField.value ?? ""}
                              onChange={(event) => updateField({ ...selectedField, value: event.target.value })}
                            />
                          </label>
                        </div>
                        <div className="inspector-section">
                          <h3 className="inspector-section__title">Appearance</h3>
                          <div className="inline-grid">
                            <label className="form-field">
                              <span>Font size</span>
                              <input
                                type="number"
                                min={10}
                                max={32}
                                value={selectedField.style.fontSize}
                                onChange={(event) =>
                                  updateField({
                                    ...selectedField,
                                    style: {
                                      ...selectedField.style,
                                      fontSize: Number(event.target.value)
                                    }
                                  })
                                }
                              />
                            </label>
                            <label className="form-field">
                              <span>Text colour</span>
                              <input
                                type="color"
                                value={selectedField.style.color}
                                onChange={(event) =>
                                  updateField({
                                    ...selectedField,
                                    style: {
                                      ...selectedField.style,
                                      color: event.target.value
                                    }
                                  })
                                }
                              />
                            </label>
                          </div>
                          <label className="toggle-row">
                            <input
                              type="checkbox"
                              checked={selectedField.style.bold}
                              onChange={(event) =>
                                updateField({
                                  ...selectedField,
                                  style: {
                                    ...selectedField.style,
                                    bold: event.target.checked
                                  }
                                })
                              }
                            />
                            <span>Bold</span>
                          </label>
                        </div>
                        <div className="inspector-section">
                          <h3 className="inspector-section__title">Size</h3>
                          <div className="inline-grid">
                            <label className="form-field">
                              <span>Width</span>
                              <input
                                type="number"
                                min={0.04}
                                max={1}
                                step={0.01}
                                value={selectedField.width}
                                onChange={(event) =>
                                  updateField({
                                    ...selectedField,
                                    width: Number(event.target.value)
                                  })
                                }
                              />
                            </label>
                            <label className="form-field">
                              <span>Height</span>
                              <input
                                type="number"
                                min={0.03}
                                max={1}
                                step={0.01}
                                value={selectedField.height}
                                onChange={(event) =>
                                  updateField({
                                    ...selectedField,
                                    height: Number(event.target.value)
                                  })
                                }
                              />
                            </label>
                          </div>
                        </div>
                        <div className="inspector-section">
                          <h3 className="inspector-section__title">Actions</h3>
                          <div className="inline-grid">
                            <button type="button" className="button button--ghost" onClick={() => duplicateField(selectedField.id)}>
                              Duplicate field
                            </button>
                            <button type="button" className="button button--danger" onClick={() => removeField(selectedField.id)}>
                              Delete field
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="inspector-empty">
                    <p>Select a field on the PDF to edit its settings.</p>
                    <span>You can move, resize, duplicate or delete fields after selecting them.</span>
                  </div>
                )}
              </section>
            </aside>
          </>
        ) : (
          <section className="empty-state empty-state--editor">
            <div className="empty-state__card">
              <h2>Upload a PDF to start editing</h2>
              <p>
                Add text, dates, checkboxes and signatures directly on your document. The original file stays untouched.
              </p>
              <div className="empty-state__actions">
                <button type="button" className="button" onClick={promptImport}>
                  Upload PDF
                </button>
                <span>or drag and drop a PDF here</span>
              </div>
            </div>
          </section>
        )}
      </main>

      {isDragActive ? (
        <div className="drop-overlay" aria-hidden="true">
          <div className="drop-overlay__card">
            <strong>Drop the PDF here</strong>
            <span>The document will be imported into this local workspace.</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
