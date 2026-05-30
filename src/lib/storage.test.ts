import { describe, expect, it } from "vitest";
import type { AppStore } from "../types";
import { sanitizeStoreForWebPersistence, shouldPersistSensitiveSignatureData, stripSensitiveSignatureData } from "./storage";

const STORE_WITH_SIGNATURES: AppStore = {
  templates: [],
  fillProfiles: [],
  signatureProfiles: [
    {
      id: "sig_1",
      displayName: "Signature 01",
      sourceType: "upload",
      assetRef: "asset_1",
      createdAt: "2026-01-01T00:00:00.000Z"
    }
  ],
  exportHistory: [],
  signatureAssets: {
    asset_1: "data:image/png;base64,AAA"
  }
};

describe("storage security policy", () => {
  it("removes signature assets from web persistence snapshots by default", () => {
    expect(sanitizeStoreForWebPersistence(STORE_WITH_SIGNATURES)).toEqual({
      ...STORE_WITH_SIGNATURES,
      signatureProfiles: [],
      signatureAssets: {}
    });
  });

  it("keeps non-signature data untouched when stripping sensitive values", () => {
    expect(stripSensitiveSignatureData(STORE_WITH_SIGNATURES).exportHistory).toEqual(STORE_WITH_SIGNATURES.exportHistory);
    expect(stripSensitiveSignatureData(STORE_WITH_SIGNATURES).templates).toEqual(STORE_WITH_SIGNATURES.templates);
  });

  it("defaults to non-persistent signature storage on the web build", () => {
    expect(shouldPersistSensitiveSignatureData()).toBe(false);
  });
});
