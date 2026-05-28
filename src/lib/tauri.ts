import type { AppStore } from "../types";

declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown;
  }
}

export function isTauriApp(): boolean {
  return typeof window !== "undefined" && Boolean(window.__TAURI_INTERNALS__);
}

export async function invokeTauri<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const core = await import("@tauri-apps/api/core");
  return core.invoke<T>(command, args);
}

export async function saveBytesWithDialog(fileName: string, bytes: Uint8Array): Promise<string | null> {
  if (!isTauriApp()) {
    const blob = new Blob([bytes as unknown as BlobPart], {
      type: "application/pdf"
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    URL.revokeObjectURL(url);
    return fileName;
  }

  const dialog = await import("@tauri-apps/plugin-dialog");
  const fs = await import("@tauri-apps/plugin-fs");
  const path = await dialog.save({
    defaultPath: fileName,
    filters: [{ name: "PDF", extensions: ["pdf"] }]
  });

  if (!path) {
    return null;
  }

  await fs.writeFile(path, bytes);
  return path;
}

export async function loadAppStoreViaTauri(): Promise<AppStore | null> {
  if (!isTauriApp()) {
    return null;
  }

  return invokeTauri<AppStore | null>("load_app_store");
}

export async function saveAppStoreViaTauri(store: AppStore): Promise<void> {
  if (!isTauriApp()) {
    return;
  }

  await invokeTauri("save_app_store", { store });
}

export async function saveSignatureAssetViaTauri(assetId: string, dataUrl: string): Promise<string> {
  if (!isTauriApp()) {
    throw new Error("Tauri runtime not available");
  }

  return invokeTauri<string>("save_signature_asset", { assetId, dataUrl });
}

export async function loadSignatureAssetViaTauri(assetRef: string): Promise<string | null> {
  if (!isTauriApp()) {
    return null;
  }

  return invokeTauri<string | null>("load_signature_asset", { assetRef });
}
