// LEAD 443.182 C step 2 — the ONE payment engine: numbering, the payment row, its applications, the JE post (or the
// skip audit), the audit row and the spine event all happen inside recordCustomerPaymentInClientTx, in that order, on
// the caller's client. The application writer and the post-or-skip are shared with the apply service.
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  enabled: true,
  calls: [] as string[],
  post: vi.fn(),
  skip: vi.fn(),
  audit: vi.fn(),
  spine: vi.fn(),
  resolveId: vi.fn(async () => "PMT-2026-00042"),
}));
vi.mock("../../lib/feature-flags/service.js", () => ({ isEnabled: vi.fn(async () => h.enabled) }));
vi.mock("../posting-engine.service.js", () => ({ postSourceTransactionInClientTx: (...a: unknown[]) => { h.calls.push("post"); return h.post(...a); } }));
vi.mock("../posting-flag-skip-audit.js", () => ({ recordPostingFlagSkip: (...a: unknown[]) => { h.calls.push("skip"); return h.skip(...a); } }));
vi.mock("../../audit/crud-audit.js", () => ({ appendCrudAudit: (...a: unknown[]) => { h.calls.push("audit"); return h.audit(...a); } }));
vi.mock("../accounting-spine-emit.js", () => ({ emitAccountingSpineEvent: (...a: unknown[]) => { h.calls.push("spine"); return h.spine(...a); } }));
vi.mock("../display-id.js", async (orig) => ({ ...(await orig<typeof import("../display-id.js")>()), resolvePaymentDisplayId: (...a: unknown[]) => { h.calls.push("number"); return h.resolveId(...(a as [])); } }));

const { recordCustomerPaymentInClientTx, insertPaymentApplicationRowInClientTx, postCustomerPaymentOrRecordSkipInClientTx } = await import("../payments.routes.js");

const sql: Array<{ sql: string; values: unknown[] }> = [];
const client = {
  query: vi.fn(async (q: string, values: unknown[] = []) => {
    sql.push({ sql: q, values });
    if (/INSERT INTO accounting\.payments \(/.test(q)) { h.calls.push("payment"); return { rows: [{ id: "p1", display_id: "PMT-2026-00042", amount_unapplied_cents: 1000 }] }; }
    if (/INSERT INTO accounting\.payment_applications/.test(q)) { h.calls.push("application"); return { rows: [{ id: `pa${sql.length}` }] }; }
    if (/SELECT amount_unapplied_cents FROM accounting\.payments/.test(q)) { h.calls.push("refresh"); return { rows: [{ amount_unapplied_cents: 250 }] }; }
    return { rows: [] };
  }),
};
const row = {
  operating_company_id: "oci", customer_id: "c1", payment_method: "ach", payment_date: "2026-10-16", reference: "R1", amount_cents: 1000,
  deposited_to_account_id: "bank", notes: null, created_by_user_id: "u1", is_sample_data: false,
};
const doc = (over: Record<string, unknown> = {}) => ({
  row, requested_display_id: undefined, applications: [{ invoice_id: "i1", amount_cents: 500 }, { invoice_id: "i2", amount_cents: 250 }],
  validate_application: vi.fn(async () => null), skip_context: { route: "POST /x" },
  audit: { action: "accounting.payment_recorded", module: "M" }, spine: { event_type: "payment.created" as const, entity_type: "payment" }, ...over,
});

describe("443.182 C step 2 — the one payment engine", () => {
  beforeEach(() => { sql.length = 0; h.calls.length = 0; h.enabled = true; vi.clearAllMocks(); });

  it("numbers, writes the payment, writes each application, posts, refreshes, audits, emits — in that order", async () => {
    const after = vi.fn(async () => { h.calls.push("after-insert"); });
    const beforeAudit = vi.fn(async () => { h.calls.push("before-audit"); });
    const r = await recordCustomerPaymentInClientTx(client, doc({ after_payment_insert: after, before_audit: beforeAudit }) as never);
    expect(h.calls).toEqual(["number", "payment", "after-insert", "application", "application", "post", "refresh", "before-audit", "audit", "spine"]);
    expect(r).toEqual({ code: 201, data: { id: "p1", display_id: "PMT-2026-00042", amount_unapplied_cents: 250, applications_count: 2 } });
    expect(h.post).toHaveBeenCalledWith(client, { operating_company_id: "oci", source_transaction_type: "customer_payment", source_transaction_id: "p1", posting_purpose: "initial_post" }, { userId: "u1" });
    expect(h.audit.mock.calls[0]!.slice(1)).toEqual(["u1", "accounting.payment_recorded", { resource_type: "accounting.payments", resource_id: "p1", operating_company_id: "oci", customer_id: "c1", display_id: "PMT-2026-00042", applications_count: 2 }, "info", "M"]);
    expect(h.spine.mock.calls[0]![1]).toEqual({ operating_company_id: "oci", actor_user_id: "u1", event_type: "payment.created", entity_id: "p1", entity_type: "payment", source_table: "accounting.payments" });
  });

  it("flag OFF: no post, the skip audit carries payment_id + the form's context", async () => {
    h.enabled = false;
    await recordCustomerPaymentInClientTx(client, doc() as never);
    expect(h.post).not.toHaveBeenCalled();
    expect(h.skip.mock.calls[0]![2]).toEqual({ flagKey: "CUSTOMER_PAYMENT_GL_POSTING_ENABLED", postingDomain: "customer_payment", operatingCompanyId: "oci", context: { payment_id: "p1", route: "POST /x" } });
  });

  it("a refused application THROWS (Lead 03:22Z atomic) so the caller's transaction rolls the whole payment back", async () => {
    const validate = vi.fn(async (a: { invoice_id: string }) => (a.invoice_id === "i2" ? { code: 409 as const, error: "invoice_not_open_for_payment" } : null));
    await expect(recordCustomerPaymentInClientTx(client, doc({ validate_application: validate }) as never)).rejects.toMatchObject({
      name: "PaymentApplicationRefusedError", code: 409, error: "invoice_not_open_for_payment",
    });
    expect(h.calls.filter((c) => c === "application")).toHaveLength(1);
    expect(h.post).not.toHaveBeenCalled();
  });

  it("the application writer: invoice target writes invoice_id, a bill target writes NULL; amount_applied = cents / 100", async () => {
    await insertPaymentApplicationRowInClientTx(client, { operating_company_id: "oci", payment_id: "p1", target_kind: "invoice", target_id: "i1", amount_cents: 1234, user_id: "u1" });
    await insertPaymentApplicationRowInClientTx(client, { operating_company_id: "oci", payment_id: "p1", target_kind: "bill", target_id: "b1", amount_cents: 500, user_id: "u1" });
    expect(sql[0]!.sql).toMatch(/VALUES \(\$1::uuid, \$2::uuid, \$3::uuid, \$4, \$3::uuid/);
    expect(sql[1]!.sql).toMatch(/VALUES \(\$1::uuid, \$2::uuid, NULL, \$4, \$3::uuid/);
    expect(sql[0]!.values).toEqual(["oci", "p1", "i1", "invoice", 1234, 12.34, "u1"]);
    expect(sql[1]!.values).toEqual(["oci", "p1", "b1", "bill", 500, 5, "u1"]);
    expect(sql[0]!.sql).toContain("ON CONFLICT (payment_id, target_kind, target_id)");
  });

  it("post-or-skip returns whether it posted", async () => {
    expect(await postCustomerPaymentOrRecordSkipInClientTx(client, { operating_company_id: "oci", payment_id: "p1", user_id: "u1", skip_context: {} })).toBe(true);
    h.enabled = false;
    expect(await postCustomerPaymentOrRecordSkipInClientTx(client, { operating_company_id: "oci", payment_id: "p1", user_id: "u1", skip_context: {} })).toBe(false);
  });
});
