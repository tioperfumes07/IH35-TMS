import { describe, expect, it, vi } from "vitest";

vi.mock("../../audit/crud-audit.js", () => ({ appendCrudAudit: vi.fn(async () => undefined) }));

const { provisionDriverEscrowSubAccount, driverEscrowSubAccountName } = await import("../driver-subaccount-provision.service.js");

const ARGS = { operatingCompanyId: "oc", driverId: "drv-1", driverName: "Domingo Barrientos", actorUserId: "u1" };

function makeClient(opts: { parentId: string | null; alreadyExists?: string | null }) {
  const sqls: { sql: string; params: unknown[] }[] = [];
  const client = {
    query: vi.fn(async (sql: string, params?: unknown[]) => {
      sqls.push({ sql, params: params ?? [] });
      if (sql.includes("WHERE account_name = $1") && sql.includes("parent_account_id IS NULL")) {
        return { rows: opts.parentId ? [{ id: opts.parentId }] : [] };
      }
      if (sql.includes("parent_account_id = $2::uuid") && sql.includes("SELECT id")) {
        return { rows: opts.alreadyExists ? [{ id: opts.alreadyExists }] : [] };
      }
      if (sql.includes("INSERT INTO catalogs.accounts")) return { rows: [{ id: "new-escrow-1" }] };
      return { rows: [] };
    }),
  };
  return { client, sqls };
}

describe("driver escrow sub-account provisioning (STOP-DECISION #1: unprefixed parent)", () => {
  it("names it 'Damage Claim Escrow- <Name>'", () => {
    expect(driverEscrowSubAccountName("Domingo Barrientos")).toBe("Damage Claim Escrow- Domingo Barrientos");
  });

  it("creates a LIABILITY sub-account under the resolved 'Damage Claim Escrow' parent (no hardcoded UUID, postable)", async () => {
    const { client, sqls } = makeClient({ parentId: "parent-escrow" });
    const r = await provisionDriverEscrowSubAccount(client as never, ARGS);
    expect(r).toMatchObject({ created: true, accountName: "Damage Claim Escrow- Domingo Barrientos" });
    const insert = sqls.find((s) => s.sql.includes("INSERT INTO catalogs.accounts"))!;
    expect(insert.params[0]).toBe("Damage Claim Escrow- Domingo Barrientos");
    expect(insert.params[1]).toBe("parent-escrow");
    expect(insert.sql).toContain("'Liability'");
    expect(insert.sql).toContain("true"); // is_postable
    expect(insert.sql).toContain("NULL, $1"); // account_number NULL
    // parent resolved by NAME + Liability type, not a UUID — and NOT the year-prefixed parent
    expect(sqls[0].params).toEqual(["Damage Claim Escrow", "Liability"]);
  });

  it("is idempotent — skips when the escrow sub-account already exists (no INSERT)", async () => {
    const { client, sqls } = makeClient({ parentId: "parent-escrow", alreadyExists: "existing-escrow" });
    const r = await provisionDriverEscrowSubAccount(client as never, ARGS);
    expect(r).toEqual({ created: false, reason: "already_exists", accountId: "existing-escrow" });
    expect(sqls.some((s) => s.sql.includes("INSERT INTO catalogs.accounts"))).toBe(false);
  });

  it("graceful no-op when the chart lacks the escrow parent (e.g. TRK) — no INSERT, no throw", async () => {
    const { client, sqls } = makeClient({ parentId: null });
    const r = await provisionDriverEscrowSubAccount(client as never, ARGS);
    expect(r).toEqual({ created: false, reason: "parent_not_found" });
    expect(sqls.some((s) => s.sql.includes("INSERT INTO catalogs.accounts"))).toBe(false);
  });
});
