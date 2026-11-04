// Row 28 finish (11-03): every override route confirms through recordOverride, validates the catalog code, and REFUSES typed text.
import { describe, expect, it, vi } from "vitest";

const audit = vi.hoisted(() => ({ append: vi.fn(async () => undefined) }));
vi.mock("../../audit/crud-audit.js", () => ({ appendCrudAudit: audit.append }));

const { confirmOverride } = await import("../confirm-override.js");
const { confirmDispatchOverride, dispatchOverrideRequested } = await import("../../dispatch/dispatch-override.js");
const { canOverrideUnitBlock } = await import("../../dispatch/book-load.service.js");
const { createDispatchLoadBodySchema, updateDispatchLoadBodySchema } = await import("../../dispatch/loads.routes.js");
const { closeBodySchema } = await import("../../driver-finance/settlement-payrun-close.routes.js");
const { createBodySchema, expandedInvoiceBodySchema } = await import("../../accounting/invoices.routes.js");
const { patchSchema } = await import("../../compliance/form-425c.routes.js");

const CO = "5c854333-6ea5-4faa-af31-67cb272fef80";
const U = "7c9e6679-7425-40de-944b-e07fc1f90ae7";
const CATALOG: Record<string, { id: string; label_en: string; contexts: string[]; is_active: boolean; role_only: boolean }> = {
  owner_override: { id: "r1", label_en: "Owner override", contexts: ["dispatch", "settlement", "invoice", "425c_carry_forward", "expense"], is_active: true, role_only: true },
  accountant_override: { id: "r2", label_en: "Accountant override", contexts: ["dispatch", "settlement", "invoice", "425c_carry_forward", "expense"], is_active: true, role_only: true },
  hos_reset: { id: "r3", label_en: "HOS / reset", contexts: ["dispatch"], is_active: true, role_only: false },
  carry_forward_actuals_update: { id: "r4", label_en: "Projection updated from current actuals", contexts: ["425c_carry_forward"], is_active: true, role_only: false },
  owner_approved: { id: "r5", label_en: "Owner approved", contexts: ["dispatch", "settlement", "invoice"], is_active: true, role_only: false },
};
function catalogClient() {
  return {
    query: vi.fn(async (_sql: string, values?: unknown[]) => {
      const code = String(values?.[1] ?? "");
      const row = CATALOG[code];
      return { rows: row ? [{ ...row, label_es: "x", reason_code: code }] : [] };
    }),
  };
}
const base = { operatingCompanyId: CO, entityType: "mdata.units", entityId: "u1" };

describe("row 28 — dispatch booking overrides (hard-block / HOS / locked-load / unit-repair / DOT)", () => {
  it("Owner / Accountant confirm with no reason; the stored line is the catalog line, never typed", async () => {
    audit.append.mockClear();
    const o = await confirmDispatchOverride(catalogClient() as never, { ...base, actor: { userId: U, role: "Owner" } });
    expect(o).toMatchObject({ ok: true, text: "Owner override [owner_override]", reason_code: "owner_override" });
    const a = await confirmDispatchOverride(catalogClient() as never, { ...base, actor: { userId: U, role: "Accountant" } });
    expect(a).toMatchObject({ ok: true, reason_code: "accountant_override" });
    expect(audit.append).toHaveBeenCalledWith(expect.anything(), U, "override.dispatch", expect.objectContaining({ context: "dispatch", entity_type: "mdata.units" }), "warning", "LEAD-443294-OVERRIDE");
  });
  it("a Manager (HOS gate) must pick a catalog reason; none -> E_OVERRIDE_REASON_REQUIRED 400", async () => {
    const none = await confirmDispatchOverride(catalogClient() as never, { ...base, actor: { userId: U, role: "Manager" } });
    expect(none).toEqual({ ok: false, status: 400, error: "E_OVERRIDE_REASON_REQUIRED" });
    const picked = await confirmDispatchOverride(catalogClient() as never, { ...base, actor: { userId: U, role: "Manager" }, reasonCode: "hos_reset" });
    expect(picked).toMatchObject({ ok: true, text: "HOS / reset [hos_reset]" });
  });
  it("unknown, out-of-context and another role's role_only codes are refused", async () => {
    expect(await confirmDispatchOverride(catalogClient() as never, { ...base, actor: { userId: U, role: "Manager" }, reasonCode: "made_up" })).toMatchObject({ ok: false, status: 422, error: "override_reason_unknown" });
    expect(await confirmDispatchOverride(catalogClient() as never, { ...base, actor: { userId: U, role: "Manager" }, reasonCode: "carry_forward_actuals_update" })).toMatchObject({ ok: false, status: 422, error: "override_reason_not_allowed_in_context" });
    expect(await confirmDispatchOverride(catalogClient() as never, { ...base, actor: { userId: U, role: "Owner" }, reasonCode: "accountant_override" })).toMatchObject({ ok: false, status: 403, error: "override_role_only_reason" });
  });
  it("hard-block (dispatch-blocked / OOS unit) override: Owner / Accountant confirm, Administrator kept, nobody else", () => {
    for (const r of ["Owner", "Accountant", "Administrator"]) expect(canOverrideUnitBlock(r)).toBe(true);
    for (const r of ["Manager", "Dispatcher", "Safety", "Driver"]) expect(canOverrideUnitBlock(r)).toBe(false);
  });
  it("dispatchOverrideRequested: a token, a code, a rule row or an explicit confirm — nothing else", () => {
    expect(dispatchOverrideRequested({})).toBe(false);
    expect(dispatchOverrideRequested({ override_token: "t" })).toBe(true);
    expect(dispatchOverrideRequested({ override_reason_code: "hos_reset" })).toBe(true);
    expect(dispatchOverrideRequested({ override_requested: true })).toBe(true);
    expect(dispatchOverrideRequested({ override_rules: [{ rule_code: "unit_repair_active_wo", reason_code: null }] })).toBe(true);
  });
  const book = {
    operating_company_id: CO,
    customer_id: U,
    save_mode: "draft",
    stops: [],
    charges: [],
  };
  it("the booking + edit bodies REFUSE a typed override_reason and typed rule reasons", () => {
    const typed = createDispatchLoadBodySchema.safeParse({ ...book, override_reason: "Angel's CDL is current per FMCSA" });
    expect(typed.success).toBe(false);
    const typedRule = createDispatchLoadBodySchema.safeParse({ ...book, override_rules: [{ rule_code: "X", reason: "typed reason that is long enough" }] });
    expect(typedRule.success).toBe(false);
    const coded = createDispatchLoadBodySchema.safeParse({ ...book, override_reason_code: "hos_reset", override_rules: [{ rule_code: "X", reason_code: "owner_approved" }] });
    expect(coded.success).toBe(true);
    expect(updateDispatchLoadBodySchema.safeParse({ operating_company_id: CO, override_reason: "typed sentence typed" }).success).toBe(false);
    expect(updateDispatchLoadBodySchema.safeParse({ operating_company_id: CO, override_requested: true, override_reason_code: null }).success).toBe(true);
  });
});

describe("row 28 — settlement net-pay floor, invoice credit limit, 425C carry-forward", () => {
  it("settlement close: override_floor takes a catalog reason_code and REFUSES a typed reason", () => {
    const body = { operating_company_id: CO };
    expect(closeBodySchema.safeParse({ ...body, override_floor: { pct: 0, cents: 0, reason: "driver terminated, pay the full check" } }).success).toBe(false);
    expect(closeBodySchema.safeParse({ ...body, override_floor: { pct: 0, cents: 0, reason_code: "owner_approved" } }).success).toBe(true);
    expect(closeBodySchema.safeParse({ ...body, override_floor: { pct: 0, cents: 0, reason_code: null } }).success).toBe(true);
    expect(closeBodySchema.safeParse({ ...body, override_floor: { pct: 0, cents: 0, reason_code: "Not A Code" } }).success).toBe(false);
  });
  it("settlement floor confirms through recordOverride, context settlement", async () => {
    audit.append.mockClear();
    const r = await confirmOverride(catalogClient() as never, { context: "settlement", ...base, entityType: "driver_finance.driver_settlements", actor: { userId: U, role: "Accountant" } });
    expect(r).toMatchObject({ ok: true, reason_code: "accountant_override" });
    expect(audit.append).toHaveBeenCalledWith(expect.anything(), U, "override.settlement", expect.anything(), "warning", "LEAD-443294-OVERRIDE");
  });
  it("invoice credit limit: both create bodies take override_reason_code and REFUSE the typed reason", () => {
    const inv = { customer_id: U, override_credit_limit: true };
    expect(createBodySchema.safeParse({ ...inv, override_credit_limit_reason: "customer pays Friday for sure" }).success).toBe(false);
    expect(createBodySchema.safeParse({ ...inv, override_reason_code: "owner_approved" }).success).toBe(true);
    const exp = { customer_id: U, bill_to_entity_type: "customer", override_credit_limit: true };
    expect(expandedInvoiceBodySchema.safeParse({ ...exp, override_credit_limit_reason: "typed reason here ok" }).success).toBe(false);
    expect(expandedInvoiceBodySchema.safeParse({ ...exp, override_reason_code: null }).success).toBe(true);
  });
  it("invoice credit limit confirms through recordOverride, context invoice", async () => {
    audit.append.mockClear();
    const r = await confirmOverride(catalogClient() as never, { context: "invoice", ...base, entityType: "mdata.customers", actor: { userId: U, role: "Manager" }, reasonCode: "owner_approved" });
    expect(r).toMatchObject({ ok: true, text: "Owner approved [owner_approved]" });
    expect(audit.append).toHaveBeenCalledWith(expect.anything(), U, "override.invoice", expect.anything(), "warning", "LEAD-443294-OVERRIDE");
  });
  it("425C carry-forward: the 30-char typed reason is REFUSED; a catalog code (context 425c_carry_forward) is validated", async () => {
    const body = { operating_company_id: CO };
    expect(patchSchema.safeParse({ ...body, projection_override_reason: "x".repeat(40) }).success).toBe(false);
    expect(patchSchema.safeParse({ ...body, projection_override_reason_code: "carry_forward_actuals_update", projection_override_confirmed: true }).success).toBe(true);
    expect(await confirmOverride(catalogClient() as never, { context: "425c_carry_forward", ...base, entityType: "compliance.form_425c_reports", actor: { userId: U, role: "Owner" } })).toMatchObject({ ok: true, reason_code: "owner_override" });
    expect(await confirmOverride(catalogClient() as never, { context: "425c_carry_forward", ...base, entityType: "compliance.form_425c_reports", actor: { userId: U, role: "Manager" }, reasonCode: "carry_forward_actuals_update" })).toMatchObject({ ok: true, text: "Projection updated from current actuals [carry_forward_actuals_update]" });
    expect(await confirmOverride(catalogClient() as never, { context: "425c_carry_forward", ...base, actor: { userId: U, role: "Manager" }, reasonCode: "hos_reset" })).toMatchObject({ ok: false, error: "override_reason_not_allowed_in_context" });
  });
  it("a trusted engine's own attestation line (systemReason) passes without a catalog pick; a route can never set it", async () => {
    const r = await confirmOverride(catalogClient() as never, { context: "dispatch", ...base, actor: { userId: U, role: "Owner" }, systemReason: "Settlement Creator R-186.1 automatic owner attestation" });
    expect(r).toMatchObject({ ok: true, reason_code: null });
    expect(createDispatchLoadBodySchema.safeParse({ ...base, operating_company_id: CO, customer_id: U, save_mode: "draft", stops: [], charges: [], systemReason: "x".repeat(20) }).success).toBe(true); // unknown key is stripped, never read
  });
});
