import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ query: vi.fn(), membership: vi.fn() }));
vi.mock("../../auth/db.js", () => ({ withCurrentUser: async (_id: string, fn: (client: typeof db) => unknown) => fn(db) }));
vi.mock("../../auth/session-middleware.js", () => ({ requireAuth: () => true }));
vi.mock("../../_helpers/company-membership-guard.js", () => ({ assertCompanyMembership: db.membership }));
import { registerInvoiceRoutes } from "../../accounting/invoices.routes.js";
import { registerCreditMemosRoutes } from "../../accounting/credit-memos.routes.js";
import { registerVendorCreditsRoutes } from "../../accounting/vendor-credits.routes.js";
import { registerFactoringRoutes } from "../factoring.routes.js";

const company = "11111111-1111-4111-8111-111111111111";
const userId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const customers = ["22222222-2222-4222-8222-222222222222", "33333333-3333-4333-8333-333333333333"];
const loads = ["44444444-4444-4444-8444-444444444444", "55555555-5555-4555-8555-555555555555"];
const reads: Array<{ sql: string; values: unknown[] }> = [];
const apps: Array<ReturnType<typeof Fastify>> = [];

beforeEach(() => {
  vi.clearAllMocks(); reads.length = 0;
  db.query.mockImplementation(async (sql: string, values: unknown[] = []) => {
    // Routes append pagination parameters later; capture the values AT each actual DB call.
    reads.push({ sql, values: structuredClone(values) });
    if (sql.includes("SELECT COUNT(*)::int AS total")) return { rows: [{ total: 7 }] };
    if (sql.includes("AS open_count")) return { rows: [{ open_count: 7, open_amount_cents: 9000, overdue_count: 2, overdue_amount_cents: 3000 }] };
    if (sql.includes("AS chargeback_total")) return { rows: [{ statement_month: "2026-10", chargeback_total: 9000, factor_fee_total: 700 }] };
    if (sql.includes("FROM views.factoring_")) return { rows: [{ factoring_advance_id: loads[0], _total_count: 601, factor_fee_amount: 1 }] };
    if (sql.includes("i.*,")) return { rows: [{ id: loads[0], customer_id: customers[1] }] };
    return { rows: [] };
  });
});
afterEach(async () => { await Promise.all(apps.splice(0).map(app => app.close())); });
async function appFor(register: (app: ReturnType<typeof Fastify>) => Promise<void>) {
  const app = Fastify(); apps.push(app);
  app.addHook("preHandler", async req => { req.user = { uuid: userId, role: "Owner", email: null } as never; });
  await register(app); return app;
}
function query(params: Record<string, string> = {}) {
  return new URLSearchParams({ operating_company_id: company, ...params }).toString();
}

describe("mounted money read routes preserve full entity selections", () => {
  it("invoice COUNT, KPI and page share both customer/load arrays before pagination", async () => {
    const app = await appFor(registerInvoiceRoutes);
    const response = await app.inject(`/api/v1/accounting/invoices?${query({ customer_id: customers.join(","), source_load_id: loads.join(","), limit: "1", offset: "2" })}`);
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toMatchObject({ total: 7, limit: 1, offset: 2, has_more: true, kpi: { open_count: 7, open_amount_cents: 9000 } });
    expect(response.json().invoices).toHaveLength(1);
    const cohort = reads.filter(read => read.sql.includes("FROM accounting.invoices i"));
    expect(cohort).toHaveLength(3);
    for (const { sql, values } of cohort) {
      expect(sql).toContain("WHERE i.operating_company_id = $1::uuid");
      expect(sql).toContain("i.customer_id = ANY($2::uuid[])");
      expect(sql).toContain("i.source_load_id = ANY($3::uuid[])");
      expect(sql).toMatch(/i\.customer_id = ANY\(\$2::uuid\[\]\) AND i\.source_load_id/);
      expect(values.slice(0, 3)).toEqual([company, customers, loads]);
      expect(sql).not.toContain(customers[0]!);
    }
    expect(cohort[0]!.values).toEqual([company, customers, loads]);
    expect(cohort[1]!.values).toEqual([company, customers, loads]);
    expect(cohort[2]!.values).toEqual([company, customers, loads, 1, 2]);
    expect(cohort[2]!.sql).toContain("LIMIT $4"); expect(cohort[2]!.sql).toContain("OFFSET $5");
    expect(db.membership).toHaveBeenCalledWith(userId, company);
  });

  it("recourse uses independent scoped EXISTS predicates before its full-cohort window count and page cap", async () => {
    const app = await appFor(registerFactoringRoutes);
    const response = await app.inject(`/api/v1/factoring/recourse-pipeline?${query({ customer_id: customers.join(","), load_id: loads.join(","), date_from: "2026-10-01", date_to: "2026-10-23", limit: "1" })}`);
    expect(response.statusCode, response.body).toBe(200); expect(response.json()).toMatchObject({ total: 601 });
    const read = reads.find(read => read.sql.includes("FROM views.factoring_recourse_at_risk"))!;
    expect(read.values).toEqual([company, customers, loads, "2026-10-01", "2026-10-23", 1]);
    expect(read.sql.match(/AND EXISTS \(SELECT 1 FROM accounting.invoices selected_invoice/g)).toHaveLength(2);
    for (const predicate of ["selected_invoice.operating_company_id = rr.operating_company_id", "selected_invoice.factoring_advance_id = rr.factoring_advance_id", "selected_invoice.customer_id = ANY($2::uuid[])", "selected_invoice.source_load_id = ANY($3::uuid[])", "rr.factored_at >= $4::date", "rr.factored_at < ($5::date", "COUNT(*) OVER()::int AS _total_count", "LIMIT $6"]) expect(read.sql).toContain(predicate);
    expect(read.sql).not.toMatch(/AND inv\.(?:customer_id|load_id) =/);
  });

  it("fees history and monthly aggregate bind the same scoped membership/dates without summing the page", async () => {
    const app = await appFor(registerFactoringRoutes);
    const response = await app.inject(`/api/v1/factoring/chargebacks-fees?${query({ customer_id: customers.join(","), date_from: "2026-10-01", date_to: "2026-10-23" })}`);
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toMatchObject({ history_total: 601, monthly_summary: [{ chargeback_total: 9000, factor_fee_total: 700 }] });
    const cohort = reads.filter(read => read.sql.includes("FROM views.factoring_chargebacks_fees"));
    expect(cohort).toHaveLength(2);
    for (const read of cohort) {
      expect(read.values).toEqual([company, customers, "2026-10-01", "2026-10-23"]);
      // A batch with A + C (C newest) must match A/B: membership cannot use latest inv's label.
      for (const predicate of ["WHERE cf.operating_company_id = $1::uuid", "AND EXISTS (SELECT 1 FROM accounting.invoices selected_invoice", "selected_invoice.operating_company_id = cf.operating_company_id", "selected_invoice.factoring_advance_id = cf.factoring_advance_id", "selected_invoice.status <> 'void'", "selected_invoice.customer_id = ANY($2::uuid[])", "cf.created_at >= $3::date", "cf.created_at < ($4::date"]) expect(read.sql).toContain(predicate);
      expect(read.sql).not.toMatch(/AND inv\.customer_id =/);
      expect(read.sql).not.toMatch(/JOIN accounting\.invoices selected_invoice/); // EXISTS, not fanout.
    }
    expect(cohort[0]!.sql).toContain("LIMIT 500");
    expect(cohort[1]!.sql).toContain("SUM(cf.factor_fee_amount)");
    expect(cohort[1]!.sql).toContain("GROUP BY cf.statement_month");
    expect(cohort[1]!.sql).not.toContain("LIMIT 500");
  });

  const listCases = [
    [registerInvoiceRoutes, "/api/v1/accounting/invoices", "customer_id"],
    [registerInvoiceRoutes, "/api/v1/accounting/invoices", "source_load_id"],
    [registerFactoringRoutes, "/api/v1/factoring/recourse-pipeline", "customer_id"],
    [registerFactoringRoutes, "/api/v1/factoring/recourse-pipeline", "load_id"],
    [registerFactoringRoutes, "/api/v1/factoring/chargebacks-fees", "customer_id"],
    [registerCreditMemosRoutes, "/api/v1/accounting/credit-memos", "customer_id"],
    [registerVendorCreditsRoutes, "/api/v1/accounting/vendor-credits", "vendor_id"],
  ] as const;
  it.each(listCases)("%s %s rejects invalid later %s before any DB read", async (register, path, field) => {
    const app = await appFor(register);
    for (const invalid of [customers[0] + ",invalid", customers[0] + ",", Array.from({ length: 101 }, () => customers[0]).join(",")]) {
      const response = await app.inject(`${path}?${query({ [field]: invalid })}`);
      expect(response.statusCode, response.body).toBe(400);
      expect(db.query).not.toHaveBeenCalled(); expect(db.membership).not.toHaveBeenCalled();
    }
  });

  it.each([
    [registerCreditMemosRoutes, "/api/v1/accounting/credit-memos", "customer_id", "cm", "uuid"],
    [registerVendorCreditsRoutes, "/api/v1/accounting/vendor-credits", "vendor_id", "vc", "text"],
  ] as const)("%s %s accepts both selected IDs upstream", async (register, path, field, alias, cast) => {
    const app = await appFor(register);
    const response = await app.inject(`${path}?${query({ [field]: customers.join(",") })}`);
    expect(response.statusCode, response.body).toBe(200);
    const read = reads.find(read => read.sql.includes(`FROM accounting.${field === "customer_id" ? "credit_memos" : "vendor_credits"} ${alias}`))!;
    expect(read.values).toEqual([company, customers]);
    expect(read.sql).toContain(`${alias}.${field} = ANY($2::${cast}[])`);
    expect(read.sql).toContain(`${alias}.operating_company_id = $1::uuid`);
    expect(read.sql.indexOf(`${alias}.${field} = ANY`)).toBeLessThan(read.sql.indexOf("LIMIT 500"));
  });

  it.each([
    [registerInvoiceRoutes, "/api/v1/accounting/invoices", { customer_id: customers.join(",") }],
    [registerInvoiceRoutes, "/api/v1/accounting/invoices", { customer_id: customers[0], source_load_id: loads.join(",") }],
    [registerCreditMemosRoutes, "/api/v1/accounting/credit-memos", { customer_id: customers.join(","), amount_cents: 100, reason: "other", account_id: loads[0] }],
    [registerVendorCreditsRoutes, "/api/v1/accounting/vendor-credits", { vendor_id: customers.join(","), amount_cents: 100, coa_account_id: loads[0] }],
  ] as const)("%s %s create still rejects CSV entity IDs before any writer", async (register, path, payload) => {
    const app = await appFor(register);
    const response = await app.inject({ method: "POST", url: `${path}?${query()}`, payload });
    expect(response.statusCode, response.body).toBe(400); expect(db.query).not.toHaveBeenCalled();
  });

  it("invoice and load detail route IDs remain singular, not CSV lists", async () => {
    const app = await appFor(registerInvoiceRoutes);
    for (const path of [`/api/v1/accounting/invoices/${customers.join(",")}`, `/api/v1/loads/${loads.join(",")}/invoices`]) {
      const response = await app.inject(`${path}?${query()}`);
      expect(response.statusCode, response.body).toBe(400); expect(db.query).not.toHaveBeenCalled();
    }
  });
});
