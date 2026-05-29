import { describe, expect, it } from "vitest";
import { isAllowedEmail, normalizeEmail, parseAllowedEmails } from "./auth";

describe("auth helpers", () => {
  it("normalizes emails", () => {
    expect(normalizeEmail("  Ops.Manager@Example.com ")).toBe("ops.manager@example.com");
  });

  it("parses and deduplicates allowed emails", () => {
    expect(parseAllowedEmails("ops@example.com, OPS@example.com, finance@example.com")).toEqual([
      "ops@example.com",
      "finance@example.com"
    ]);
  });

  it("rejects access when the allowlist is empty", () => {
    expect(isAllowedEmail("ops@example.com", [])).toBe(false);
  });

  it("checks allowed emails case-insensitively", () => {
    expect(isAllowedEmail("OPS@example.com", ["ops@example.com"])).toBe(true);
  });
});
