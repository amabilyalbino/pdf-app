import { createId } from "./id";
import {
  isTauriApp,
  loadAppStoreViaTauri,
  loadSignatureAssetViaTauri,
  saveAppStoreViaTauri,
  saveSignatureAssetViaTauri
} from "./tauri";
import type { AppStore, SignatureDraft } from "../types";

const STORAGE_KEY = "ops-pdf-studio-store";
let webStorageScope = "anonymous";

export const EMPTY_STORE: AppStore = {
  templates: [],
  fillProfiles: [],
  signatureProfiles: [],
  exportHistory: [],
  signatureAssets: {}
};

function buildStorageKey() {
  return webStorageScope === "anonymous" ? STORAGE_KEY : `${STORAGE_KEY}:${webStorageScope}`;
}

export function setStorageScope(scope: string | null | undefined) {
  webStorageScope = scope?.trim().toLowerCase() || "anonymous";
}

function normalizeStore(store: Partial<AppStore> | null | undefined): AppStore {
  return {
    templates: store?.templates ?? [],
    fillProfiles: store?.fillProfiles ?? [],
    signatureProfiles: store?.signatureProfiles ?? [],
    exportHistory: store?.exportHistory ?? [],
    signatureAssets: store?.signatureAssets ?? {}
  };
}

export async function loadStore(): Promise<AppStore> {
  if (isTauriApp()) {
    const store = await loadAppStoreViaTauri();
    return normalizeStore(store);
  }

  const scopedStorageKey = buildStorageKey();
  const raw = localStorage.getItem(scopedStorageKey);
  if (!raw) {
    if (webStorageScope !== "anonymous") {
      const legacyRaw = localStorage.getItem(STORAGE_KEY);
      if (legacyRaw) {
        const legacyStore = normalizeStore(JSON.parse(legacyRaw) as Partial<AppStore>);
        localStorage.setItem(scopedStorageKey, JSON.stringify(legacyStore));
        return legacyStore;
      }
    }

    return EMPTY_STORE;
  }

  return normalizeStore(JSON.parse(raw) as Partial<AppStore>);
}

export async function saveStore(store: AppStore): Promise<void> {
  if (isTauriApp()) {
    await saveAppStoreViaTauri(store);
    return;
  }

  localStorage.setItem(buildStorageKey(), JSON.stringify(store));
}

export async function persistSignatureAsset(store: AppStore, draft: SignatureDraft): Promise<{
  assetRef: string;
  nextStore: AppStore;
}> {
  const assetId = createId("signature_asset");

  if (isTauriApp()) {
    const assetRef = await saveSignatureAssetViaTauri(assetId, draft.dataUrl);
    return {
      assetRef,
      nextStore: store
    };
  }

  return {
    assetRef: assetId,
    nextStore: {
      ...store,
      signatureAssets: {
        ...(store.signatureAssets ?? {}),
        [assetId]: draft.dataUrl
      }
    }
  };
}

export async function resolveSignatureAsset(store: AppStore, assetRef: string): Promise<string | null> {
  if (isTauriApp()) {
    return loadSignatureAssetViaTauri(assetRef);
  }

  return store.signatureAssets?.[assetRef] ?? null;
}
