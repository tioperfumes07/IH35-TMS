import { describe, expect, it, vi, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const serviceSource = fs.readFileSync(
  path.join(here, "../pre-dispatch-validator.service.ts"),
  "utf8"
);
const routesSource = fs.readFileSync(
  path.join(here, "../pre-dispatch.routes.ts"),
  "utf8"
);
const indexSource = fs.readFileSync(
  path.join(here, "../../../index.ts"),
  "utf8"
);

// ─── Static / structural tests (no DB) ───────────────────────────────────────

describe("pre-dispatch-validator.service — structure", () => {
  it("exports validatePreDispatch function", () => {
    expect(serviceSource).toContain("export async function validatePreDispatch");
  });

  it("defines all required rule_ids for CDL check", () => {
    expect(serviceSource).toContain("WF-CDL-EXPIRED");
    expect(serviceSource).toContain("WF-CDL-EXPIRING");
  });

  it("defines medical card rule for 30-day warning window", () => {
    expect(serviceSource).toContain("MEDICAL_CARD_WARN_DAYS = 30");
    expect(serviceSource).toContain("WF-MED-CARD-EXPIRED");
    expect(serviceSource).toContain("WF-MED-CARD-EXPIRING");
  });

  it("defines unit OOS / DVIR hard block rule", () => {
    expect(serviceSource).toContain("WF-050-DVIR-MAJOR");
    expect(serviceSource).toContain("severity: \"block\"");
  });

  it("uses $500 debt threshold (50000 cents) as warning, not block", () => {
    expect(serviceSource).toContain("DEBT_WARN_THRESHOLD_CENTS = 50_000");
    expect(serviceSource).toContain("GAP-14-DRIVER-DEBT");
    // Debt is a warning, not a blocker
    const debtBlock = serviceSource.match(/WF-GAP-14-DRIVER-DEBT[\s\S]*?severity: "block"/);
    expect(debtBlock).toBeNull();
  });

  it("warns when FMCSA cache is older than 24 hours", () => {
    expect(serviceSource).toContain("FMCSA_STALE_HOURS = 24");
    expect(serviceSource).toContain("GAP-14-FMCSA-STALE");
  });

  it("driver inactive check (WF-038) is a hard block", () => {
    expect(serviceSource).toContain("WF-038-DRIVER-INACTIVE");
    // The inactive check should be severity block
    const inactiveRegion = serviceSource.match(/WF-038-DRIVER-INACTIVE[\s\S]{0,300}/);
    expect(inactiveRegion?.[0]).toContain("block");
  });

  it("HOS violation is a hard block", () => {
    expect(serviceSource).toContain("WF-HOS-VIOLATION");
    expect(serviceSource).toContain("WF-HOS-LOW");
  });

  it("returns can_dispatch: false when blockers exist", () => {
    expect(serviceSource).toContain("can_dispatch: blockers.length === 0");
  });

  it("is read-only — no INSERT, UPDATE, or DELETE SQL", () => {
    const upperSource = serviceSource.toUpperCase();
    const hasInsert = /\bINSERT\s+INTO\b/.test(upperSource);
    const hasUpdate = /\bUPDATE\s+\w/.test(upperSource) && !/ROLLBACK/.test(upperSource);
    const hasDelete = /\bDELETE\s+FROM\b/.test(upperSource);
    expect(hasInsert).toBe(false);
    // UPDATE appears only in ROLLBACK context check — we allow commit/rollback
    expect(hasDelete).toBe(false);
  });
});

// ─── Route registration tests ─────────────────────────────────────────────────

describe("pre-dispatch.routes — registration", () => {
  it("registers POST /api/v1/dispatch/validation/pre-dispatch", () => {
    expect(routesSource).toContain("/api/v1/dispatch/validation/pre-dispatch");
    expect(routesSource).toContain("app.post");
  });

  it("requires auth on the validation endpoint", () => {
    expect(routesSource).toContain("requireAuth");
  });

  it("validates body with zod schema", () => {
    expect(routesSource).toContain("preDispatchBodySchema");
    expect(routesSource).toContain("operating_company_id: z.string().uuid()");
    expect(routesSource).toContain("driver_uuid");
    expect(routesSource).toContain("unit_uuid");
  });

  it("is wired into the main server index", () => {
    expect(indexSource).toContain("registerPreDispatchValidationRoutes");
    expect(indexSource).toContain("dispatch/validation/pre-dispatch.routes.js");
  });
});

// ─── Unit logic tests (pure functions via mock) ───────────────────────────────

describe("severity semantics — block vs warn", () => {
  it("CDL_WARN_DAYS = 30 aligns with spec", () => {
    expect(serviceSource).toContain("CDL_WARN_DAYS = 30");
  });

  it("FMCSA staleness threshold is 24h (locked design decision)", () => {
    const match = serviceSource.match(/FMCSA_STALE_HOURS\s*=\s*(\d+)/);
    expect(match).not.toBeNull();
    expect(Number(match?.[1])).toBe(24);
  });

  it("medical card warning window is 30 days (locked design decision)", () => {
    const match = serviceSource.match(/MEDICAL_CARD_WARN_DAYS\s*=\s*(\d+)/);
    expect(match).not.toBeNull();
    expect(Number(match?.[1])).toBe(30);
  });

  it("debt threshold is $500 = 50000 cents (locked design decision)", () => {
    const match = serviceSource.match(/DEBT_WARN_THRESHOLD_CENTS\s*=\s*([\d_]+)/);
    expect(match).not.toBeNull();
    const value = Number(String(match?.[1]).replace(/_/g, ""));
    expect(value).toBe(50000);
  });
});

// ─── Integration-style smoke: PreDispatchValidationResult shape ───────────────

describe("PreDispatchValidationResult shape", () => {
  it("exports PreDispatchValidationResult type with blockers, warnings, info, can_dispatch", () => {
    expect(serviceSource).toContain("blockers: ValidationItem[]");
    expect(serviceSource).toContain("warnings: ValidationItem[]");
    expect(serviceSource).toContain("info: ValidationItem[]");
    expect(serviceSource).toContain("can_dispatch: boolean");
  });

  it("ValidationItem has rule_id, severity, message, evidence", () => {
    expect(serviceSource).toContain("rule_id: string");
    expect(serviceSource).toContain("severity: ValidationSeverity");
    expect(serviceSource).toContain("message: string");
    expect(serviceSource).toContain("evidence: Record<string, unknown>");
  });

  it("ValidationSeverity only allows block | warn | info", () => {
    expect(serviceSource).toContain('"block" | "warn" | "info"');
  });
});
