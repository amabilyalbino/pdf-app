import { useEffect, useMemo, useRef, useState } from "react";
import { FieldOverlay } from "./components/FieldOverlay";
import { PdfPageCanvas } from "./components/PdfPageCanvas";
import { SignaturePad } from "./components/SignaturePad";
import {
  applyFillProfileValue,
  cloneField,
  createField,
  fieldToTemplateDefinition,
  instantiateTemplate
} from "./lib/field";
import { exportPdfDocument, importPdfFromFile } from "./lib/pdf";
import { createId } from "./lib/id";
import { EMPTY_STORE, loadStore, persistSignatureAsset, resolveSignatureAsset, saveStore } from "./lib/storage";
import { isTauriApp, saveBytesWithDialog } from "./lib/tauri";
import { buildExportHistoryEntry, matchTemplates } from "./lib/templates";
import type {
  AppStore,
  FieldType,
  FillProfile,
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

export default function App() {
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
  const [selectedFillProfileId, setSelectedFillProfileId] = useState<string | null>(null);
  const [pendingFieldType, setPendingFieldType] = useState<FieldType | null>(null);
  const [pendingSignatureProfileId, setPendingSignatureProfileId] = useState<string | null>(null);
  const [showSignatureCreator, setShowSignatureCreator] = useState(false);
  const [isDragActive, setIsDragActive] = useState(false);
  const [signatureDraft, setSignatureDraft] = useState<SignatureDraft>({
    sourceType: "upload",
    dataUrl: ""
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
      setSelectedFillProfileId(nextStore.fillProfiles[0]?.id ?? null);
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

  const selectedFillProfile = useMemo(
    () => store.fillProfiles.find((profile) => profile.id === selectedFillProfileId) ?? null,
    [selectedFillProfileId, store.fillProfiles]
  );

  const activePageFields = useMemo(
    () => workingDocument?.fields.filter((field) => field.page === workingDocument.activePage) ?? [],
    [workingDocument]
  );

  const signatureFields = useMemo(
    () => workingDocument?.fields.filter((field) => field.type === "signature") ?? [],
    [workingDocument]
  );

  const assignedSignatureFields = useMemo(
    () => signatureFields.filter((field) => Boolean(field.signatureProfileId)),
    [signatureFields]
  );

  const exportBlockers = useMemo(() => {
    const blockers: string[] = [];

    if (!workingDocument) {
      blockers.push("Import a PDF to continue.");
      return blockers;
    }

    if (signatureFields.length > assignedSignatureFields.length) {
      blockers.push("Assign a signature to every signature field before exporting.");
    }

    return blockers;
  }, [assignedSignatureFields.length, signatureFields.length, workingDocument]);

  const canExport = workingDocument !== null && exportBlockers.length === 0;
  const hasAnyFields = (workingDocument?.fields.length ?? 0) > 0;
  const recentExports = useMemo(() => store.exportHistory.slice(0, 4), [store.exportHistory]);
  const selectedSignatureField = selectedField?.type === "signature" ? selectedField : null;
  const selectedSignatureProfile = selectedSignatureField?.signatureProfileId
    ? store.signatureProfiles.find((profile) => profile.id === selectedSignatureField.signatureProfileId) ?? null
    : null;
  const pendingSignatureProfile = pendingSignatureProfileId
    ? store.signatureProfiles.find((profile) => profile.id === pendingSignatureProfileId) ?? null
    : null;
  const highlightedSignatureProfileId = selectedSignatureProfile?.id ?? pendingSignatureProfileId;

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

    const name = window.prompt("Template name", workingDocument.importedPdf.name.replace(/\.pdf$/i, ""));
    if (!name) {
      return;
    }

    const now = new Date().toISOString();
    const existing = workingDocument.appliedTemplateId
      ? store.templates.find((item) => item.id === workingDocument.appliedTemplateId)
      : null;

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

  function createFillProfile() {
    const name = window.prompt("Fill profile name", "Default profile");
    if (!name) {
      return;
    }

    const seedEntries =
      workingDocument?.fields
        .filter((field) => field.bindingKey)
        .map((field) => [field.bindingKey as string, field.value ?? ""]) ?? [];

    const now = new Date().toISOString();
    const profile: FillProfile = {
      id: createId("fill_profile"),
      name,
      values: Object.fromEntries(seedEntries),
      createdAt: now,
      updatedAt: now
    };

    setStore({
      ...store,
      fillProfiles: [profile, ...store.fillProfiles]
    });
    setSelectedFillProfileId(profile.id);
  }

  function updateFillProfileValue(profileId: string, key: string, value: string) {
    setStore({
      ...store,
      fillProfiles: store.fillProfiles.map((profile) =>
        profile.id === profileId
          ? {
              ...profile,
              values: {
                ...profile.values,
                [key]: value
              },
              updatedAt: new Date().toISOString()
            }
          : profile
      )
    });
  }

  function applySelectedFillProfile() {
    if (!workingDocument || !selectedFillProfile) {
      return;
    }

    const nextFields = workingDocument.fields.map((field) => applyFillProfileValue(field, selectedFillProfile.values));
    setWorkingDocument({
      ...workingDocument,
      fields: nextFields
    });

    flash({
      tone: "success",
      message: `Profile "${selectedFillProfile.name}" applied to linked fields.`
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
      dataUrl: ""
    });
    setShowSignatureCreator(false);

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
        fillProfiles: selectedFillProfile ? [selectedFillProfile] : []
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

      <header className="masthead">
        <div className="masthead__brand">
          <strong>Ops PDF Studio</strong>
          <span>{workingDocument ? workingDocument.importedPdf.name : "No document loaded"}</span>
        </div>
        <div className="masthead__status">
          <span>{desktopRuntime ? "Desktop app" : "Web preview"}</span>
          <span>Local data</span>
          <span>Page {workingDocument ? workingDocument.activePage + 1 : "0"}</span>
          <span>{workingDocument ? `${workingDocument.importedPdf.pageMappings.length} pages` : "Local mode"}</span>
          {pendingFieldType === "signature" && pendingSignatureProfile ? (
            <span>placing {pendingSignatureProfile.displayName.toLowerCase()}</span>
          ) : null}
          {pendingFieldType && pendingFieldType !== "signature" ? <span>placing {FIELD_TYPE_LABELS[pendingFieldType]}</span> : null}
        </div>
        <div className="masthead__actions">
          <button type="button" className="button button--ghost" onClick={promptImport} disabled={isBusy}>
            Import PDF
          </button>
          <button type="button" className="button button--ghost" onClick={saveCurrentTemplate} disabled={!workingDocument}>
            Save template
          </button>
          <button type="button" className="button" onClick={exportCurrentPdf} disabled={!canExport || isBusy}>
            Export PDF
          </button>
        </div>
      </header>

      {notice ? <div className={`notice notice--${notice.tone}`}>{notice.message}</div> : null}

      <main className="workspace">
        <aside className="sidebar sidebar--library">
          <section className="panel panel--summary">
            <div className="panel__header">
              <h2>Document</h2>
            </div>
            {workingDocument ? (
              <div className="stack compact">
                <div className="meta-card meta-card--minimal">
                  <strong>{workingDocument.importedPdf.name}</strong>
                  <span>{workingDocument.importedPdf.pageMappings.length} pages</span>
                </div>
                <div className="meta-card meta-card--minimal">
                  <strong>{desktopRuntime ? "Ready for local use" : "Preview mode"}</strong>
                  <span>
                    {desktopRuntime
                      ? "Signatures stay protected on this computer and the original PDF is never overwritten."
                      : "Use the desktop build to deliver the final experience to the ops manager."}
                  </span>
                </div>
                {suggestions.length > 0 ? (
                  <div className="stack compact">
                    <p className="section-label">Suggested templates</p>
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
                ) : (
                  <p className="helper-copy">No matching template yet.</p>
                )}
                <div className={`meta-status ${canExport ? "is-ready" : "is-warn"}`}>
                  {canExport ? "Ready to export" : exportBlockers[0] ?? "Set up the document first."}
                </div>
              </div>
            ) : (
              <div className="empty-state empty-state--document">
                <p>Drag a PDF into the window or import it with the button.</p>
                <span className="helper-copy">
                  Built for local use: import, fill, sign, and export a new PDF without changing the original.
                </span>
                <button type="button" className="button" onClick={promptImport}>
                  Choose file
                </button>
              </div>
            )}
          </section>

          <section className="panel">
            <div className="panel__header">
              <h2>Fields</h2>
            </div>
            <div className="field-grid">
              {FIELD_TYPES.map((item) => (
                <button
                  key={item.type}
                  type="button"
                  className={`field-type-card ${pendingFieldType === item.type ? "is-active" : ""}`}
                  onClick={() => beginFieldPlacement(item.type)}
                >
                  <strong>{item.label}</strong>
                  <span>{pendingFieldType === item.type ? "click on the page" : item.type}</span>
                </button>
              ))}
            </div>
            <p className="helper-copy">Choose a field and click directly on the page. For signatures, just select a saved signature and click on the PDF.</p>
          </section>

          <section className="panel">
            <div className="panel__header">
              <h2>Recent exports</h2>
            </div>
            <div className="stack compact">
              {recentExports.map((entry) => (
                <div key={entry.id} className="history-card">
                  <strong>{entry.outputName}</strong>
                  <span>{entry.sourcePdfName}</span>
                  <span>{HISTORY_DATE_FORMATTER.format(new Date(entry.createdAt))}</span>
                </div>
              ))}
              {recentExports.length === 0 ? (
                <p className="helper-copy">Your latest exported PDFs will appear here.</p>
              ) : null}
            </div>
          </section>
        </aside>

        <section className="editor">
          {workingDocument && pdfDocumentProxy ? (
            <>
              <div className="editor__toolbar">
                <div className="editor__toolbar-head">
                  <p className="eyebrow">Canvas</p>
                  <h2 className="editor__toolbar-title">
                    {pendingFieldType
                      ? pendingFieldType === "signature" && pendingSignatureProfile
                        ? `Click the document to place ${pendingSignatureProfile.displayName.toLowerCase()}.`
                        : `Click the document to place the ${FIELD_TYPE_LABELS[pendingFieldType]}.`
                      : "Scroll the document. The tools stay fixed while you work."}
                  </h2>
                </div>
                <div className="editor__toolbar-info">
                  <span>Page {workingDocument.activePage + 1}</span>
                  <span>{activePageFields.length} field(s) on this page</span>
                  <span>{workingDocument.fields.length} total</span>
                  {pendingFieldType ? (
                    <button type="button" className="button button--chip" onClick={clearPendingPlacement}>
                      Cancel
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="page-stage" ref={pageStageRef}>
                <div className="page-stack">
                  {workingDocument.importedPdf.pageMappings.map((mapping) => {
                    const pageFields = workingDocument.fields.filter((field) => field.page === mapping.page);
                    const isActivePage = workingDocument.activePage === mapping.page;

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
                              documentProxy={pdfDocumentProxy}
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
                                  fillProfiles={selectedFillProfile ? [selectedFillProfile] : []}
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
            </>
          ) : (
              <div className="hero-empty">
                <div className="hero-empty__card">
                  <p className="eyebrow">Desktop workflow</p>
                  <h2>Open, fill, sign, and export PDFs in one focused window.</h2>
                  <p>
                    Drag the file here or import it manually. Signatures stay saved on this computer, and the app always creates a new PDF at the end.
                  </p>
                  <div className="hero-empty__grid">
                    <div className="guide-step is-active">
                      <strong>1. Bring in the PDF</strong>
                      <span>Import with the button or drop the file into the window.</span>
                    </div>
                    <div className="guide-step">
                      <strong>2. Fill and sign</strong>
                      <span>Add visual fields and use a saved signature with one click.</span>
                    </div>
                    <div className="guide-step">
                      <strong>3. Export a new file</strong>
                      <span>The original stays untouched and your recent history remains in the app.</span>
                    </div>
                  </div>
                  <div className="hero-empty__actions">
                    <button type="button" className="button" onClick={promptImport}>
                      Import first PDF
                    </button>
                  </div>
                </div>
              </div>
          )}
        </section>

        <aside className="sidebar sidebar--inspector">
          <section className="panel">
            <div className="panel__header">
              <h2>Signatures</h2>
            </div>
            {selectedSignatureField ? (
              <div className="context-banner">
                <strong>Selected signature field</strong>
                <span>
                  {selectedSignatureProfile
                    ? "Click a different signature below to replace it."
                    : "Choose a saved signature or create a new one for this field."}
                </span>
                {selectedSignatureProfile ? (
                  <button type="button" className="button button--chip" onClick={clearSelectedSignatureField}>
                    Remove from this field
                  </button>
                ) : null}
              </div>
            ) : pendingSignatureProfile ? (
              <div className="context-banner">
                <strong>{pendingSignatureProfile.displayName} ready</strong>
                <span>Click the PDF to place the signature.</span>
                <button type="button" className="button button--chip" onClick={clearPendingPlacement}>
                  Cancel placement
                </button>
              </div>
            ) : (
              <p className="helper-copy">Click a saved signature to place it on the PDF, or create a new one.</p>
            )}
            {showSignatureCreator ? (
              <div className="stack signature-creator">
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
                    <span>Upload PNG or JPG</span>
                    <input
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
                            dataUrl: String(reader.result ?? "")
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
            <div className="panel__row-actions">
              <button
                type="button"
                className="button button--chip"
                onClick={() => setShowSignatureCreator((current) => !current)}
              >
                {showSignatureCreator ? "Close" : "New signature"}
              </button>
            </div>
            <div className="signature-library">
              {store.signatureProfiles.map((profile) => (
                <button
                  key={profile.id}
                  type="button"
                  className={`signature-card ${
                    highlightedSignatureProfileId === profile.id ? "is-selected" : ""
                  }`}
                  onClick={() => activateSignatureProfile(profile.id)}
                >
                  {signatureAssetCache[profile.assetRef] ? (
                    <img src={signatureAssetCache[profile.assetRef]} alt={profile.displayName} />
                  ) : null}
                  <div className="signature-card__meta">
                    <strong>{profile.displayName}</strong>
                    <span>
                      {selectedSignatureField?.signatureProfileId === profile.id
                        ? "Applied to field"
                        : pendingSignatureProfileId === profile.id
                          ? "Click the PDF to place"
                          : "Click to use"}
                    </span>
                  </div>
                </button>
              ))}
              {store.signatureProfiles.length === 0 ? <p className="helper-copy">No saved signatures yet.</p> : null}
            </div>
          </section>

          <section className="panel">
            <div className="panel__header">
              <h2>Inspector</h2>
            </div>
            {selectedField ? (
              <div className="stack">
                <label className="form-field">
                  <span>Internal name</span>
                  <input
                    value={selectedField.name}
                    onChange={(event) => updateField({ ...selectedField, name: event.target.value })}
                  />
                </label>
                {selectedField.type !== "signature" ? (
                  <label className="form-field">
                    <span>Binding key</span>
                    <input
                      value={selectedField.bindingKey ?? ""}
                      placeholder="company_name"
                      onChange={(event) =>
                        updateField({
                          ...selectedField,
                          bindingKey: event.target.value || undefined
                        })
                      }
                    />
                  </label>
                ) : null}
                {selectedField.type === "signature" ? (
                  <div className="context-banner">
                    <strong>Visual signature</strong>
                    <span>
                      {selectedField.signatureProfileId
                        ? "Use the library on the right to replace or remove this signature."
                        : "Choose a signature from the library on the right to fill this field."}
                    </span>
                  </div>
                ) : null}
                {selectedField.type !== "checkbox" && selectedField.type !== "signature" ? (
                  <label className="form-field">
                    <span>Default value</span>
                    <input
                      value={selectedField.value ?? ""}
                      onChange={(event) => updateField({ ...selectedField, value: event.target.value })}
                    />
                  </label>
                ) : null}
                {selectedField.type !== "checkbox" && selectedField.type !== "signature" ? (
                  <div className="inline-grid">
                    <label className="form-field">
                      <span>Font</span>
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
                      <span>Color</span>
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
                ) : null}
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
            ) : (
              <p className="helper-copy">Select a field on the page to edit its properties, binding, and signature.</p>
            )}
          </section>

          <section className="panel">
            <div className="panel__header">
              <h2>Profiles</h2>
              <button type="button" className="button button--chip" onClick={createFillProfile}>
                New profile
              </button>
            </div>
            {store.fillProfiles.length > 0 ? (
              <div className="stack compact">
                <select
                  value={selectedFillProfileId ?? ""}
                  onChange={(event) => setSelectedFillProfileId(event.target.value)}
                >
                  {store.fillProfiles.map((profile) => (
                    <option key={profile.id} value={profile.id}>
                      {profile.name}
                    </option>
                  ))}
                </select>
                {selectedFillProfile ? (
                  <>
                    {Array.from(
                      new Set(
                        [
                          ...Object.keys(selectedFillProfile.values),
                          ...(workingDocument?.fields
                            .map((field) => field.bindingKey)
                            .filter((value): value is string => Boolean(value)) ?? [])
                        ].sort()
                      )
                    ).map((key) => (
                      <label key={key} className="form-field">
                        <span>{key}</span>
                        <input
                          value={selectedFillProfile.values[key] ?? ""}
                          onChange={(event) => updateFillProfileValue(selectedFillProfile.id, key, event.target.value)}
                        />
                      </label>
                    ))}
                    <button type="button" className="button button--chip" onClick={applySelectedFillProfile}>
                      Apply profile
                    </button>
                  </>
                ) : null}
              </div>
            ) : (
              <p className="helper-copy">Save recurring data once and reuse it later.</p>
            )}
          </section>

          <section className="panel">
            <div className="panel__header">
              <h2>Templates</h2>
            </div>
            <div className="stack compact">
              {store.templates.map((template) => (
                <button key={template.id} type="button" className="template-card" onClick={() => applyTemplate(template.id)}>
                  <strong>{template.name}</strong>
                  <span>{template.fieldDefinitions.length} field(s)</span>
                </button>
              ))}
              {store.templates.length === 0 ? <p className="helper-copy">Saved templates will appear here.</p> : null}
            </div>
          </section>
        </aside>
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
