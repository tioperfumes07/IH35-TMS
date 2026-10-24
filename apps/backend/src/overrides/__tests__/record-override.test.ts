import { describe, expect, it, vi } from "vitest";

const audit = vi.hoisted(() => ({ append: vi.fn(async () => undefined) }));
vi.mock("../../audit/crud-audit.js", () => ({ appendCrudAudit: audit.append }));

const { recordOverride } = await import("../record-override.service.js");

const CO = "5c854333-6ea5-4faa-af31-67cb272fef80";
const CATALOG: Record<string, { id: string; label_en: string; label_es: string; contexts: string[]; is_active: boolean; role_only: boolean }> = {
  owner_override: { id: "r-own", label_en: "Owner override", label_es: "Autorización del dueño", contexts: ["factoring", "dispatch"], is_active: true, role_only: true },
  accountant_override: { id: "r-acc", label_en: "Accountant override", label_es: "Autorización del contador", contexts: ["factoring"], is_active: true, role_only: true },
  already_sent: { id: "r-sent", label_en: "Already sent", label_es: "Ya enviado", contexts: ["factoring"], is_active: true, role_only: false },
  hos_reset: { id: "r-hos", label_en: "HOS / reset", label_es: "Horas", contexts: ["dispatch"], is_active: true, role_only: false },
  retired: { id: "r-old", label_en: "Retired", label_es: "Retirado", contexts: ["factoring"], is_active: false, role_only: false },
};
function client() {
  return {
    query: vi.fn(async (_sql: string, values?: unknown[]) => {
      const code = String(values?.[1] ?? "");
      const row = CATALOG[code];
      return { rows: row ? [{ ...row, reason_code: code }] : [] };
    }),
  };
}
const base = { operatingCompanyId: CO, entityType: "factoring_purchase", entityId: "p1" };

describe("443.294 recordOverride — one engine, nothing typed", () => {
  it("Owner confirms with no reason → owner_override, audited", async () => {
    audit.append.mockClear();
    const r = await recordOverride(client() as never, { ...base, context: "factoring", actor: { userId: "u1", role: "Owner" } });
    expect(r).toMatchObject({ ok: true, reason_code: "owner_override", role_override: true });
    expect(audit.append).toHaveBeenCalledWith(expect.anything(), "u1", "override.factoring", expect.objectContaining({ reason_code: "owner_override", actor_role: "Owner", entity_id: "p1" }), "warning", "LEAD-443294-OVERRIDE");
  });
  it("Accountant confirms with no reason → accountant_override", async () => {
    const r = await recordOverride(client() as never, { ...base, context: "factoring", actor: { userId: "u2", role: "Accountant" } });
    expect(r).toMatchObject({ ok: true, reason_code: "accountant_override" });
  });
  it("an employee with no reason is refused (reason_required)", async () => {
    audit.append.mockClear();
    const r = await recordOverride(client() as never, { ...base, context: "factoring", actor: { userId: "u3", role: "Dispatcher" } });
    expect(r).toEqual({ ok: false, error: "reason_required" });
    expect(audit.append).not.toHaveBeenCalled();
  });
  it("an employee picks a catalog reason allowed in the context", async () => {
    const r = await recordOverride(client() as never, { ...base, context: "factoring", reasonCode: "already_sent", actor: { userId: "u3", role: "Dispatcher" } });
    expect(r).toMatchObject({ ok: true, reason_code: "already_sent", role_override: false });
  });
  it("a reason not allowed in this context is refused", async () => {
    const r = await recordOverride(client() as never, { ...base, context: "factoring", reasonCode: "hos_reset", actor: { userId: "u3", role: "Dispatcher" } });
    expect(r).toEqual({ ok: false, error: "reason_not_allowed_in_context" });
  });
  it("an unknown or inactive code is refused", async () => {
    expect(await recordOverride(client() as never, { ...base, context: "factoring", reasonCode: "typed sentence", actor: { userId: "u3", role: "Dispatcher" } })).toEqual({ ok: false, error: "reason_unknown" });
    expect(await recordOverride(client() as never, { ...base, context: "factoring", reasonCode: "retired", actor: { userId: "u3", role: "Dispatcher" } })).toEqual({ ok: false, error: "reason_inactive" });
  });
  it("an employee cannot claim the owner's override code", async () => {
    const r = await recordOverride(client() as never, { ...base, context: "factoring", reasonCode: "owner_override", actor: { userId: "u3", role: "Dispatcher" } });
    expect(r).toEqual({ ok: false, error: "role_only_reason" });
  });
  it("an unknown context is refused", async () => {
    const r = await recordOverride(client() as never, { ...base, context: "payroll" as never, actor: { userId: "u1", role: "Owner" } });
    expect(r).toEqual({ ok: false, error: "unknown_context" });
  });
});
