import Fastify from "fastify";
import { afterEach, expect, it, vi } from "vitest";
const db = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("../../auth/db.js", () => ({ withCurrentUser: async (_id: string, fn: (c: typeof db) => unknown) => fn(db) }));
vi.mock("../../auth/session-middleware.js", () => ({ requireAuth: () => true }));
vi.mock("../../_helpers/company-membership-guard.js", () => ({ assertCompanyMembership: vi.fn() }));
import { registerCashAdvancesRoutes } from "../../cash-advances/cash-advances.routes.js";
import { registerLiabilitiesRoutes } from "../../liabilities/liabilities.routes.js";
import { listPendingCashAdvanceRequests } from "../../driver-finance/cash-advance-requests.service.js";
import { listBillPayments } from "../bills.service.js";
import { registerFactoringRoutes } from "../../factoring/factoring.routes.js";

const company = "11111111-1111-4111-8111-111111111111";
const ids = ["22222222-2222-4222-8222-222222222222", "33333333-3333-4333-8333-333333333333"];
afterEach(() => vi.clearAllMocks());

it("cash advances and liabilities aggregate the entire selected driver cohort before any list cap", async () => {
  db.query.mockResolvedValue({ rows: [{ total_outstanding: 123, total_active_debt: 456 }] });
  const app = Fastify();
  app.addHook("preHandler", async (req) => { req.user = { uuid: company, role: "Owner" } as never; });
  await registerCashAdvancesRoutes(app);
  await registerLiabilitiesRoutes(app);
  try {
    for (const path of ["cash-advances/dashboard/kpis", "cash-advances", "liabilities/dashboard/kpis", `liabilities/by-driver/${ids.join(",")}`]) {
      const before = db.query.mock.calls.length;
      const response = await app.inject(`/api/v1/${path}?operating_company_id=${company}&driver_id=${ids.join(",")}`);
      expect(response.statusCode).toBe(200);
      const reads = db.query.mock.calls.slice(before).filter(([sql]) => !sql.includes("set_config"));
      expect(reads).toHaveLength(1);
      expect(reads[0][0]).toContain("driver_id = ANY($2::uuid[])");
      expect(reads[0][1]).toEqual([company, ids]);
      if (path.includes("kpis")) expect(reads[0][0]).not.toContain("LIMIT");
    }
    const invalid = await app.inject(`/api/v1/cash-advances?operating_company_id=${company}&driver_id=${ids[0]},bad`);
    expect(invalid.statusCode).toBe(400);
  } finally { await app.close(); }
});

it("pending requests bind both drivers before LIMIT, and bill payments resolve native plus legacy vendor identity", async () => {
  db.query.mockResolvedValue({ rows: [] });
  await listPendingCashAdvanceRequests(db, company, { driverId: ids.join(",") });
  expect(db.query.mock.calls[0][0]).toContain("r.driver_id = ANY($2::uuid[])");
  expect(db.query.mock.calls[0][1]).toEqual([company, ids]);
  await listBillPayments(company, company, { vendorId: ids.join(","), limit: 25, offset: 0 });
  const [sql, values] = db.query.mock.calls.find(([sql]) => sql.includes("FROM accounting.bill_payments bp"))!;
  expect(values[1]).toEqual(ids);
  expect(sql).toContain("bp.vendor_id = ANY($2::text[])");
  expect(sql).toContain("selected_vendor.operating_company_id = bp.operating_company_id");
  expect(sql).toContain("selected_vendor.qbo_vendor_id = bp.vendor_id");
});

it("factoring cohort membership checks every linked invoice, not only the latest displayed invoice", async () => {
  db.query.mockResolvedValue({ rows: [] });
  const app = Fastify();
  app.addHook("preHandler", async (req) => { req.user = { uuid: company, role: "Owner" } as never; });
  await registerFactoringRoutes(app);
  try {
    for (const path of ["recourse-pipeline", "chargebacks-fees"]) {
      const response = await app.inject(`/api/v1/factoring/${path}?operating_company_id=${company}&customer_id=${ids.join(",")}`);
      expect(response.statusCode).toBe(200);
    }
    const reads = db.query.mock.calls.filter(([sql]) => sql.includes("FROM views.factoring_recourse_at_risk") || sql.includes("FROM views.factoring_chargebacks_fees"));
    expect(reads).toHaveLength(3);
    for (const [sql, values] of reads) {
      expect(sql).toContain("AND EXISTS (SELECT 1 FROM accounting.invoices selected_invoice");
      expect(sql).toContain("selected_invoice.customer_id = ANY($2::uuid[])");
      expect(values[1]).toEqual(ids);
      expect(sql).not.toContain("AND inv.customer_id = ANY");
    }
  } finally { await app.close(); }
});
