import { describe, expect, it } from "vitest";

/**
 * Unit tests for the stub-string detection pattern.
 * Filesystem scan is enforced by scripts/verify-no-prod-stubs.mjs (CI guard + pre-push hook).
 */
const STUB_RE =
  /(coming soon|lorem ipsum|phase\s*\d+\s*stub|contract stub|stub mode|\(stub\)|phase\s*\d+\s*placeholder|not yet implemented)/i;

describe("prod-stub-audit — STUB_RE pattern", () => {
  it("matches known forbidden patterns (P8-AUDIT-PROD-STUBS)", () => {
    expect(STUB_RE.test("coming soon")).toBe(true);
    expect(STUB_RE.test("Coming Soon")).toBe(true);
    expect(STUB_RE.test("lorem ipsum dolor")).toBe(true);
    expect(STUB_RE.test("phase 2 stub")).toBe(true);
    expect(STUB_RE.test("not yet implemented")).toBe(true);
    expect(STUB_RE.test("contract stub")).toBe(true);
    expect(STUB_RE.test("Save link (stub)")).toBe(true);
    expect(STUB_RE.test("phase 3 placeholder")).toBe(true);
  });

  it("does not flag legitimate production copy", () => {
    expect(STUB_RE.test("No data available")).toBe(false);
    expect(STUB_RE.test("This feature is being prepared")).toBe(false);
    expect(STUB_RE.test("Gantt-style timeline visualization — V3 additive tab")).toBe(false);
    expect(STUB_RE.test("Export queued for 5 drivers.")).toBe(false);
    expect(STUB_RE.test("archived_at IS NULL")).toBe(false);
  });

  it("(stub) suffix in user-visible toast copy is forbidden", () => {
    const toastWithStub = 'pushToast(`Export queued for ${rows.length} drivers (stub).`, "success")';
    const toastWithout = 'pushToast(`Export queued for ${rows.length} drivers.`, "success")';
    expect(STUB_RE.test(toastWithStub)).toBe(true);
    expect(STUB_RE.test(toastWithout)).toBe(false);
  });
});
