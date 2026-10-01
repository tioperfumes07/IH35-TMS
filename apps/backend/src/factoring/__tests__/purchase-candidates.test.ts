// ROUND 315 step 3 — Submit to Factor: candidate query shape, owner gate on direct pay, Feed Gate on create.
import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const OCI = "5c854333-6ea5-4faa-af31-67cb272fef80";
const INV_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const INV_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CUST = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const LOAD = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const VENDOR = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const USER = "ffffffff-ffff-4fff-8fff-ffffffffffff";

const calls: Array<{ sql: string; values?: unknown[] }> = [];
const queryMock = vi.fn(async (sql: string, values?: unknown[]) => {
  calls.push({ sql, values });
  if (sql.includes("set_config('app.operating_company_id'")) return { rows: [] };
  if (sql.includes("FROM accounting.invoices i") && sql.includes("LIMIT 2001")) {
    return {
      rows: [
        {
          invoice_id: INV_A, invoice_display_id: "13626", invoice_status: "sent", issue_date: "2026-09-20", due_date: "2026-10-20",
          total_cents: "100000", open_cents: "100000", customer_id: CUST, customer_name: "Acme", customer_po_number: "PO-1",
          customer_wo_number: null, load_id: LOAD, load_number: "13626", settlement_id: null, settlement_display_id: null,
          settlement_is_presettlement: false, settlement_status: null, pickup_at: "2026-09-18 08:00:00+00", delivery_at: "2026-09-19 10:00:00+00",
          has_bol: true, has_pod: false, has_rate_confirmation: true,
        },
      ],
    };
  }
  if (sql.includes("FROM mdata.vendors v") && sql.includes("faro")) return { rows: [{ id: VENDOR, vendor_name: "Faro Factoring", email: null, used: false, dup: false }] };
  if (sql.includes("FROM accounting.invoices i WHERE i.id = $1::uuid") && sql.includes("FOR UPDATE")) {
    return { rows: [{ id: values?.[0], display_id: "13626", status: "sent", factoring_status: "not_factored", factoring_direct_pay_at: null, voided_at: null, on_purchase: false }] };
  }
  if (sql.includes("AS has_load")) {
    const ids = (values?.[1] as string[]) ?? [];
    return { rows: ids.map((id) => ({ id, display_id: id === INV_A ? "13626" : "13637", has_load: id === INV_A, ar_je_posted: true })) };
  }
  return { rows: [] };
});

vi.mock("../../auth/session-middleware.js", () => ({ requireAuth: () => true }));
vi.mock("../../auth/db.js", () => ({
  withCurrentUser: async (_u: string, fn: (c: { query: typeof queryMock }) => Promise<unknown>) => fn({ query: queryMock }),
  withLuciaBypass: async (fn: (c: { query: typeof queryMock }) => Promise<unknown>) => fn({ query: queryMock }),
}));
vi.mock("../../_helpers/company-membership-guard.js", () => ({ assertCompanyMembership: async () => {} }));
vi.mock("../../dispatch/load-billing-lifecycle.service.js", () => ({ syncLoadsForFactoringAdvance: async () => undefined }));
vi.mock("../purchase-send.service.js", () => ({ sendPurchaseToFactor: vi.fn(async () => ({ sent: true })) }));
vi.mock("../factor.service.js", () => ({
  getFactorForCustomer: vi.fn(async () => ({ id: "factor-1", name: "Faro", reserve_rate: "0.015", fee_rate: "0.015" })),
}));
const gateMock = vi.fn();
vi.mock("../../driver-finance/feed-gate/feed-gate.service.js", async () => {
  class FeedGateError extends Error {
    constructor(public code: string, message: string, public details?: unknown) {
      super(message);
    }
  }
  return { FeedGateError, assertSubjectMayCloseOnClient: (...a: unknown[]) => gateMock(...a) };
});

const { buildCandidateQuery, listPurchaseCandidates } = await import("../purchase-candidates.service.js");
const { registerFactoringPurchaseRoutes } = await import("../purchase.routes.js");
const { FeedGateError } = await import("../../driver-finance/feed-gate/feed-gate.service.js");

describe("candidate query shape", () => {
  it("is every open invoice of the company: sent/partial, live, real, not factored, not direct pay, not on a live purchase line", () => {
    const { sql, values } = buildCandidateQuery(OCI, {});
    expect(values).toEqual([OCI]);
    expect(sql).toContain("i.operating_company_id = $1::uuid");
    expect(sql).toContain("i.voided_at IS NULL");
    expect(sql).toContain("COALESCE(i.is_sample_data, false) = false");
    expect(sql).toContain("i.status::text IN ('sent', 'partial')");
    expect(sql).toContain("COALESCE(i.factoring_status, 'not_factored') = 'not_factored'");
    expect(sql).toContain("i.factoring_direct_pay_at IS NULL");
    expect(sql).toMatch(/NOT EXISTS \(SELECT 1 FROM accounting\.factoring_purchase_lines pl WHERE pl\.invoice_id = i\.id AND pl\.voided_at IS NULL\)/);
    // open/pledge base is the canonical INVOICE_PLEDGE_CENTS_SQL (payments + credit memos net out)
    expect(sql).toContain("accounting.payment_applications");
    // docs: BOL / POD (approved POD or a pod file) / rate confirmation on the load
    expect(sql).toMatch(/fc\.code\s+IN \('bol'\)/);
    expect(sql).toContain("dispatch.pod_documents");
    expect(sql).toMatch(/fc\.code\s+IN \('rate_confirmation', 'rate_con'\)/);
    // settlement / pre-settlement through settlement_lines.load_id, entity-pinned
    expect(sql).toContain("driver_finance.settlement_lines sl");
    expect(sql).toContain("ds.operating_company_id = i.operating_company_id");
    // NOT the old submission-queue subset (no factor-assignment / batch filter)
    expect(sql).not.toContain("assigned_factor.id     IS NOT NULL");
    expect(sql).not.toContain("factoring.batch");
  });

  it("adds customer / date / escaped search filters as parameters", () => {
    const { sql, values } = buildCandidateQuery(OCI, { customer_id: CUST, from: "2026-09-01", to: "2026-09-30", search: "50%_" });
    expect(values).toEqual([OCI, CUST, "2026-09-01", "2026-09-30", "%50\\%\\_%"]);
    expect(sql).toContain("i.customer_id = $2::uuid");
    expect(sql).toContain("i.issue_date >= $3::date");
    expect(sql).toContain("i.issue_date <= $4::date");
    expect(sql).toContain("i.display_id ILIKE $5");
  });

  it("prices the expected split from the customer's factor assignment and flags missing docs", async () => {
    const out = await listPurchaseCandidates({ query: queryMock } as never, OCI, {});
    expect(out.candidates).toHaveLength(1);
    expect(out.candidates[0]).toMatchObject({
      open_cents: 100000,
      expected_escrow_reserve_cents: 1500,
      expected_fee_cents: 1500,
      expected_cash_reserve_cents: 0,
      docs_complete: false,
      missing_docs: ["POD"],
    });
    expect(out.factoring_vendors).toEqual([{ id: VENDOR, vendor_name: "Faro Factoring", email: null, is_default: true }]);
  });
});

describe("Submit to Factor routes", () => {
  const apps: Array<ReturnType<typeof Fastify>> = [];
  beforeEach(() => {
    calls.length = 0;
    queryMock.mockClear();
    gateMock.mockReset();
  });
  afterEach(async () => {
    await Promise.all(apps.splice(0).map((a) => a.close()));
  });

  async function buildApp(role: string) {
    const app = Fastify();
    apps.push(app);
    app.decorateRequest("user", null);
    app.addHook("preHandler", async (req) => {
      (req as unknown as { user: { uuid: string; role: string } }).user = { uuid: USER, role };
    });
    await registerFactoringPurchaseRoutes(app);
    return app;
  }

  it.each(["direct-pay", "undo-direct-pay"])("POST candidates/:id/%s refuses a non-Owner with 403 + the refusal audit row", async (suffix) => {
    const app = await buildApp("Administrator");
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/factoring/purchases/candidates/${INV_A}/${suffix}?operating_company_id=${OCI}`,
      payload: { reason: "customer pays us directly" },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ error: "factoring_purchase_owner_only" });
    expect(calls.some((c) => c.sql.includes("append_event") && c.values?.[0] === "factoring.purchase_refused_non_owner")).toBe(true);
    expect(calls.some((c) => c.sql.includes("UPDATE accounting.invoices"))).toBe(false);
  });

  it("POST candidates/:id/direct-pay marks the invoice for the Owner and writes the audit row", async () => {
    const app = await buildApp("Owner");
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/factoring/purchases/candidates/${INV_A}/direct-pay?operating_company_id=${OCI}`,
      payload: { reason: "customer pays us directly" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ invoice_id: INV_A, factoring_direct_pay: true });
    const upd = calls.find((c) => c.sql.includes("SET factoring_direct_pay_at = now()"));
    expect(upd?.values).toEqual([INV_A, OCI, USER, "customer pays us directly"]);
    expect(calls.some((c) => c.sql.includes("append_event") && c.values?.[0] === "accounting.invoice_factoring_direct_pay_marked")).toBe(true);
  });

  it("GET candidates returns the list (any member may look)", async () => {
    const app = await buildApp("Accountant");
    const res = await app.inject({ method: "GET", url: `/api/v1/factoring/purchases/candidates?operating_company_id=${OCI}` });
    expect(res.statusCode).toBe(200);
    expect(res.json().candidates[0].invoice_id).toBe(INV_A);
  });

  it("POST /factoring/purchases runs the Feed Gate first and refuses red invoices per invoice (no draft written)", async () => {
    gateMock.mockImplementation(async (_c: unknown, _o: string, kind: string, id: string) => {
      expect(kind).toBe("invoice");
      if (id === INV_B) {
        throw new FeedGateError("feed_gate_blocked", "1 red", {
          intake_id: "intake-b",
          reds: [{ check_key: "invoice.lines_carry_income_account", check_group: "revenue", subject_label: "Line", missing: "no income account", fix_link: `/accounting/invoices/${INV_B}` }],
        });
      }
      return { intake: { id: `intake-${id}` }, checks: [] };
    });
    const app = await buildApp("Owner");
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/factoring/purchases?operating_company_id=${OCI}`,
      payload: { factoring_company_vendor_id: VENDOR, purchase_date: "2026-10-01", lines: [{ invoice_id: INV_A }, { invoice_id: INV_B }] },
    });
    expect(res.statusCode).toBe(409);
    const body = res.json();
    expect(body.error).toBe("feed_gate_blocked");
    expect(body.details).toHaveLength(1);
    expect(body.details[0]).toMatchObject({ invoice_id: INV_B, passed: false, intake_id: "intake-b" });
    // INV_B also has no load (purchase pre-check) on top of the gate's own red
    expect(body.details[0].reds.map((r: { check_key: string }) => r.check_key)).toEqual(["purchase.invoice_has_load", "invoice.lines_carry_income_account"]);
    expect(calls.some((c) => c.sql.includes("INSERT INTO accounting.factoring_purchases"))).toBe(false);
  });

  it("POST /factoring/purchases from a non-Owner is refused before the Feed Gate runs", async () => {
    const app = await buildApp("Manager");
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/factoring/purchases?operating_company_id=${OCI}`,
      payload: { factoring_company_vendor_id: VENDOR, purchase_date: "2026-10-01", lines: [{ invoice_id: INV_A }] },
    });
    expect(res.statusCode).toBe(403);
    expect(gateMock).not.toHaveBeenCalled();
  });
});
