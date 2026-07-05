import { describe, expect, it, vi } from "vitest";

vi.mock("../../audit/crud-audit.js", () => ({ appendCrudAudit: vi.fn(async () => undefined) }));

const { upsertDriverEscrowAccountLink, upsertDriverAdvanceAccountLink } = await import("../driver-subaccount-provision.service.js");

function makeClient() {
  const sqls: { sql: string; params: unknown[] }[] = [];
  const client = {
    query: vi.fn(async (sql: string, params: unknown[] = []) => {
      sqls.push({ sql, params });
      return { rows: [] };
    }),
  };
  return { client, sqls };
}

describe("driver <-> account link upserts (store the provisioned ids — no orphans)", () => {
  it("escrow link → accounting.escrow_accounts (holder_type='driver', purpose='driver_bond'), idempotent upsert", async () => {
    const { client, sqls } = makeClient();
    await upsertDriverEscrowAccountLink(client as never, { operatingCompanyId: "oc", driverId: "drv-1", coaAccountId: "coa-esc" });
    const q = sqls[0];
    expect(q.sql).toContain("INSERT INTO accounting.escrow_accounts");
    expect(q.sql).toContain("'driver'");
    expect(q.sql).toContain("'driver_bond'");
    expect(q.sql).toContain("ON CONFLICT (operating_company_id, holder_id, purpose)");
    expect(q.sql).toContain("DO UPDATE SET coa_account_id = EXCLUDED.coa_account_id");
    expect(q.params).toEqual(["oc", "drv-1", "coa-esc"]);
  });

  it("advance link → driver_finance.driver_advance_accounts (PK op_co+driver), idempotent upsert + reactivate", async () => {
    const { client, sqls } = makeClient();
    await upsertDriverAdvanceAccountLink(client as never, {
      operatingCompanyId: "oc",
      driverId: "drv-1",
      coaAccountId: "coa-adv",
      actorUserId: "u1",
    });
    const q = sqls[0];
    expect(q.sql).toContain("INSERT INTO driver_finance.driver_advance_accounts");
    expect(q.sql).toContain("ON CONFLICT (operating_company_id, driver_id)");
    expect(q.sql).toContain("DO UPDATE SET coa_account_id = EXCLUDED.coa_account_id");
    expect(q.sql).toContain("is_active = true");
    expect(q.params).toEqual(["oc", "drv-1", "coa-adv", "u1"]);
  });
});
