import { describe, expect, it } from "vitest";
import { getFriendlyAuthErrorMessage, isAllowedEmail, isRateLimitAuthErrorMessage, normalizeEmail, parseAllowedEmails } from "./auth";

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

  it("detects rate limit auth messages", () => {
    expect(isRateLimitAuthErrorMessage("email rate limit exceeded")).toBe(true);
  });

  it("maps email rate limit errors to a friendly explanation", () => {
    expect(getFriendlyAuthErrorMessage(new Error("email rate limit exceeded"))).toContain("custom SMTP provider");
  });

  it("maps generic retry windows to a friendlier message", () => {
    expect(getFriendlyAuthErrorMessage(new Error("rate limit exceeded"))).toContain("Wait about a minute");
  });
});
