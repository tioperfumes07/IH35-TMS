import { describe, expect, it, vi } from "vitest";

vi.mock("../../audit/crud-audit.js", () => ({ appendCrudAudit: vi.fn(async () => undefined) }));

const { provisionDriverAdvanceSubAccount, driverAdvanceSubAccountName } = await import("../driver-subaccount-provision.service.js");

const ARGS = { operatingCompanyId: "oc", driverId: "drv-1", driverName: "Domingo Barrientos", actorUserId: "u1" };

function makeClient(opts: { parentId: string | null; alreadyExists?: string | null }) {
  const sqls: { sql: string; params: unknown[] }[] = [];
  const client = {
    query: vi.fn(async (sql: string, params?: unknown[]) => {
      sqls.push({ sql, params: params ?? [] });
      if (sql.includes("WHERE account_name = $1") && sql.includes("parent_account_id IS NULL")) {
        return { rows: opts.parentId ? [{ id: opts.parentId }] : [] }; // resolveCanonicalParentAccount
      }
      if (sql.includes("parent_account_id = $2::uuid") && sql.includes("SELECT id")) {
        return { rows: opts.alreadyExists ? [{ id: opts.alreadyExists }] : [] }; // idempotency check
      }
      if (sql.includes("INSERT INTO catalogs.accounts")) return { rows: [{ id: "new-acct-1" }] };
      return { rows: [] };
    }),
  };
  return { client, sqls };
}

describe("driver advance sub-account provisioning", () => {
  it("names the sub-account exactly like the live precedent: 'Driver Cash Advance- <Name>'", () => {
    expect(driverAdvanceSubAccountName("Domingo Barrientos")).toBe("Driver Cash Advance- Domingo Barrientos");
  });

  it("creates the ASSET sub-account nested under the resolved parent, postable, no hardcoded UUID", async () => {
    const { client, sqls } = makeClient({ parentId: "parent-149" });
    const r = await provisionDriverAdvanceSubAccount(client as never, ARGS);
    expect(r).toMatchObject({ created: true, accountName: "Driver Cash Advance- Domingo Barrientos" });
    const insert = sqls.find((s) => s.sql.includes("INSERT INTO catalogs.accounts"))!;
    // name, parent, postable=true, type Asset, account_number NULL
    expect(insert.params[0]).toBe("Driver Cash Advance- Domingo Barrientos");
    expect(insert.params[1]).toBe("parent-149");
    expect(insert.sql).toContain("'Asset'");
    expect(insert.sql).toContain("true"); // is_postable
    expect(insert.sql).toContain("NULL, $1"); // account_number NULL
    // parent resolved by NAME + type, not a hardcoded uuid
    const parentLookup = sqls[0].sql;
    expect(parentLookup).toContain("account_name = $1");
    expect(parentLookup).toContain("operating_company_id = $3::uuid"); // AF-1 entity scope
    expect(sqls[0].params).toEqual(["Driver Cash Advance", "Asset", "oc"]);
    // INSERT carries operating_company_id (per-entity nesting, no cross-entity leak)
    expect(insert.sql).toContain("operating_company_id");
    expect(insert.params[4]).toBe("oc");
  });

  it("is idempotent — skips when the sub-account already exists (no INSERT)", async () => {
    const { client, sqls } = makeClient({ parentId: "parent-149", alreadyExists: "existing-acct" });
    const r = await provisionDriverAdvanceSubAccount(client as never, ARGS);
    expect(r).toEqual({ created: false, reason: "already_exists", accountId: "existing-acct" });
    expect(sqls.some((s) => s.sql.includes("INSERT INTO catalogs.accounts"))).toBe(false);
  });

  it("graceful no-op when the parent chart lacks 'Driver Cash Advance' (e.g. TRK) — no INSERT, no throw", async () => {
    const { client, sqls } = makeClient({ parentId: null });
    const r = await provisionDriverAdvanceSubAccount(client as never, ARGS);
    expect(r).toEqual({ created: false, reason: "parent_not_found" });
    expect(sqls.some((s) => s.sql.includes("INSERT INTO catalogs.accounts"))).toBe(false);
  });
});
