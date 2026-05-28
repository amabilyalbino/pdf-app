import { describe, expect, it } from "vitest";
import { assertUsablePdfBytes, clonePdfBytes, hasPdfHeader } from "./pdf";

describe("pdf byte helpers", () => {
  it("keeps a safe clone even if the original buffer is transferred away", () => {
    const original = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);
    const cloned = clonePdfBytes(original);

    structuredClone(original.buffer, { transfer: [original.buffer] });

    expect(original.byteLength).toBe(0);
    expect(cloned.byteLength).toBeGreaterThan(0);
    expect(hasPdfHeader(cloned)).toBe(true);
  });

  it("throws a friendly error when bytes do not look like a PDF", () => {
    expect(() => assertUsablePdfBytes(new Uint8Array([1, 2, 3, 4]))).toThrow(
      "I couldn't read the original PDF for export. Reimport the file and try again."
    );
  });
});
