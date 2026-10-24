import Fastify from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ownerAuthorizationRefusal } from "../../lib/owner-authorization-runtime.js";

const state = vi.hoisted(() => ({ role: "Owner", authOpen: true }));
vi.mock("../../auth/session-middleware.js", () => ({
  requireAuth: (req: { user?: unknown }) => {
    req.user = { uuid: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", role: state.role };
    return true;
  },
}));
vi.mock("../../_helpers/company-membership-guard.js", () => ({ assertCompanyMembership: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../../audit/crud-audit.js", () => ({ appendCrudAudit: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../../auth/db.js", () => ({
  withLuciaBypass: vi.fn(async (fn: (c: unknown) => Promise<unknown>) => fn({ query: vi.fn().mockResolvedValue({ rows: [] }) })),
}));
vi.mock("../../lib/owner-authorization-runtime.js", async (orig) => {
  const real = await orig<typeof import("../../lib/owner-authorization-runtime.js")>();
  return {
    ...real,
    assertOwnerAuthorizationOpen: vi.fn((id: string) => {
      if (!state.authOpen) throw new real.OwnerAuthorizationError(id, "status is \"CONSUMED\", not OPEN");
    }),
  };
});
vi.mock("../../fuel/statement-card-credit-repair.service.js", async (orig) => {
  const real = await orig<typeof import("../../fuel/statement-card-credit-repair.service.js")>();
  return { ...real, runStatementCardCreditRepair: vi.fn().mockResolvedValue({ dry_run: true, batches: [], rows: [] }) };
});
vi.mock("../../driver-finance/settlement-header-repair.service.js", async (orig) => {
  const real = await orig<typeof import("../../driver-finance/settlement-header-repair.service.js")>();
  return { ...real, repairStaleSettlementHeadersInClientTx: vi.fn().mockResolvedValue({ dry_run: true, settlements: 5, rows: [] }) };
});

vi.mock("../expense-family-align-repair.service.js", async (orig) => {
  const real = await orig<typeof import("../expense-family-align-repair.service.js")>();
  return { ...real, alignExpenseFamiliesInClientTx: vi.fn().mockResolvedValue({ dry_run: true, misplaced_before: 11, children_moved: 11, misplaced_left: 11, cents_moved: 17, tb_before: { net: "0", n: "1" }, tb_after: { net: "0", n: "1" }, rows: [] }) };
});

import { alignExpenseFamiliesInClientTx } from "../expense-family-align-repair.service.js";
import { runStatementCardCreditRepair } from "../../fuel/statement-card-credit-repair.service.js";
import { repairStaleSettlementHeadersInClientTx } from "../../driver-finance/settlement-header-repair.service.js";
import { assertOwnerAuthorizationOpen } from "../../lib/owner-authorization-runtime.js";
import { registerOwnerDataRepairRoutes } from "../owner-data-repair.routes.js";

const COMPANY = "5c854333-6ea5-4faa-af31-67cb272fef80";
const B = "/api/v1/fuel/statement-discounts/card-credit-repair";
const H = "/api/v1/driver-finance/settlements/header-boundaries-repair";
const F = "/api/v1/accounting/expense-families/align-repair";
const app = Fastify();
beforeAll(async () => { await registerOwnerDataRepairRoutes(app); await app.ready(); });
afterAll(async () => { await app.close(); });
beforeEach(() => { state.role = "Owner"; state.authOpen = true; vi.clearAllMocks(); });

describe("owner-only data repair routes (LEAD 443.260.5)", () => {
  it.each([B, H, F])("%s refuses every role but Owner and runs nothing", async (url) => {
    state.role = "Admin";
    const res = await app.inject({ method: "POST", url, payload: { operating_company_id: COMPANY, dry_run: false } });
    expect(res.statusCode).toBe(403);
    expect(alignExpenseFamiliesInClientTx).not.toHaveBeenCalled();
    expect(runStatementCardCreditRepair).not.toHaveBeenCalled();
    expect(repairStaleSettlementHeadersInClientTx).not.toHaveBeenCalled();
  });

  it("defaults to a dry run and needs no AUTH for it", async () => {
    const res = await app.inject({ method: "POST", url: B, payload: { operating_company_id: COMPANY } });
    expect(res.statusCode).toBe(200);
    expect(assertOwnerAuthorizationOpen).not.toHaveBeenCalled();
    expect(vi.mocked(runStatementCardCreditRepair).mock.calls[0]![1]).toMatchObject({ dryRun: true, maxBatches: 4 });
  });

  it("caps a call at 10 batches (Cloudflare 100 s origin timeout)", async () => {
    const res = await app.inject({ method: "POST", url: B, payload: { operating_company_id: COMPANY, max_batches: 11 } });
    expect(res.statusCode).toBe(400);
  });

  it.each([[B, "AUTH-453"], [H, "AUTH-454"]])("%s real run refuses (409, nothing run) unless %s is OPEN on main", async (url, auth) => {
    state.authOpen = false;
    const res = await app.inject({ method: "POST", url, payload: { operating_company_id: COMPANY, dry_run: false } });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ error: "owner_authorization_not_open", auth_id: auth });
    expect(runStatementCardCreditRepair).not.toHaveBeenCalled();
    expect(repairStaleSettlementHeadersInClientTx).not.toHaveBeenCalled();
  });

  it("the header repair runs with expect = 5 (AUTH-454 scope, Lead 443.260.5 (c))", async () => {
    const res = await app.inject({ method: "POST", url: H, payload: { operating_company_id: COMPANY, dry_run: false } });
    expect(res.statusCode).toBe(200);
    expect(vi.mocked(repairStaleSettlementHeadersInClientTx).mock.calls[0]![1]).toMatchObject({ dryRun: false, expect: 5 });
  });

  it("OWNER RULING 443.288-A: the family align dry run needs no AUTH; a real run needs AUTH-457 OPEN", async () => {
    const dry = await app.inject({ method: "POST", url: F, payload: { operating_company_id: COMPANY } });
    expect(dry.statusCode).toBe(200);
    expect(assertOwnerAuthorizationOpen).not.toHaveBeenCalled();
    expect(vi.mocked(alignExpenseFamiliesInClientTx).mock.calls[0]![1]).toMatchObject({ companyId: COMPANY, dryRun: true });
    state.authOpen = false;
    const real = await app.inject({ method: "POST", url: F, payload: { operating_company_id: COMPANY, dry_run: false } });
    expect(real.statusCode).toBe(409);
    expect(assertOwnerAuthorizationOpen).toHaveBeenCalledWith("AUTH-457");
    expect(alignExpenseFamiliesInClientTx).toHaveBeenCalledTimes(1);
  });
});

describe("ownerAuthorizationRefusal", () => {
  const now = Date.parse("2026-10-23T05:00:00Z");
  const doc = (status: string, exp: string) => `## AUTH-454\nissued_at: x\nstatus: ${status}\nexpires_at: ${exp}\n\n## AUTH-455\nstatus: OPEN\n`;
  it("OPEN and unexpired passes", () => expect(ownerAuthorizationRefusal(doc("OPEN", "2026-10-24T04:20:00Z"), "AUTH-454", now)).toBeNull());
  it("CONSUMED refuses", () => expect(ownerAuthorizationRefusal(doc("CONSUMED", "2026-10-24T04:20:00Z"), "AUTH-454", now)).toMatch(/not OPEN/));
  it("expired refuses", () => expect(ownerAuthorizationRefusal(doc("OPEN", "2026-10-23T04:00:00Z"), "AUTH-454", now)).toMatch(/expired/));
  it("a missing record refuses", () => expect(ownerAuthorizationRefusal(doc("OPEN", "2026-10-24T04:20:00Z"), "AUTH-999", now)).toMatch(/no AUTH-999/));
  it("a block never reads the next record's status", () => expect(ownerAuthorizationRefusal("## AUTH-454\nexpires_at: 2026-10-24T00:00:00Z\n\n## AUTH-455\nstatus: OPEN\n", "AUTH-454", now)).toMatch(/not OPEN/));
});
