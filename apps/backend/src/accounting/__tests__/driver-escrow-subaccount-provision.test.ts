import { describe, expect, it, vi } from "vitest";

vi.mock("../../audit/crud-audit.js", () => ({ appendCrudAudit: vi.fn(async () => undefined) }));

const {
  provisionDriverEscrowSubAccount,
  driverEscrowSubAccountName,
  formatHireDateForName,
  DRIVER_ESCROW_PARENT_NAME,
  DRIVER_ESCROW_GRANDPARENT_NAME,
} = await import("../driver-subaccount-provision.service.js");

type Acct = { id: string; account_name: string; account_type: string; parent_account_id: string | null };

/**
 * Stateful catalogs.accounts mock modelling the two-level escrow hierarchy:
 *   Damage Claim Escrow (top-level Liability) └─ Driver Escrow (sub-parent) └─ per-driver leaf.
 * Seed with whichever accounts should pre-exist; INSERTs append and return a fresh id.
 */
function makeClient(seed: Acct[]) {
  const store: Acct[] = [...seed];
  let seq = 0;
  const sqls: { sql: string; params: unknown[] }[] = [];
  const client = {
    query: vi.fn(async (sql: string, params: unknown[] = []) => {
      sqls.push({ sql, params });
      // resolveCanonicalParentAccount — top-level by name+type
      if (sql.includes("parent_account_id IS NULL")) {
        const [name, type] = params as [string, string];
        const hit = store.find((a) => a.account_name === name && a.account_type === type && a.parent_account_id === null);
        return { rows: hit ? [{ id: hit.id }] : [] };
      }
      // resolveChildAccountId — child by name+parent
      if (sql.includes("parent_account_id = $2::uuid") && sql.includes("SELECT")) {
        const [name, parentId] = params as [string, string];
        const hit = store.find((a) => a.account_name === name && a.parent_account_id === parentId);
        return { rows: hit ? [{ id: hit.id }] : [] };
      }
      // INSERT INTO catalogs.accounts (...) RETURNING id
      if (sql.includes("INSERT INTO catalogs.accounts")) {
        const [account_name, parent_account_id] = params as [string, string];
        const id = `acct-${++seq}`;
        store.push({ id, account_name, account_type: "Liability", parent_account_id });
        return { rows: [{ id }] };
      }
      return { rows: [] };
    }),
  };
  return { client, sqls, store };
}

const ARGS = { operatingCompanyId: "oc", driverId: "drv-1", driverName: "Mecor Perez", actorUserId: "u1", hireDate: "2026-06-12" };

describe("driver escrow sub-account (year-agnostic 'Driver Escrow' parent + name+hire-date)", () => {
  it("constants: sub-parent 'Driver Escrow' nests under top-level 'Damage Claim Escrow'", () => {
    expect(DRIVER_ESCROW_PARENT_NAME).toBe("Driver Escrow");
    expect(DRIVER_ESCROW_GRANDPARENT_NAME).toBe("Damage Claim Escrow");
  });

  it("leaf name = '<Name> — Driver Escrow (hired MM/DD/YYYY)' (hire date in the name, no tz shift)", () => {
    expect(driverEscrowSubAccountName("Mecor Perez", "2026-06-12")).toBe("Mecor Perez — Driver Escrow (hired 06/12/2026)");
    expect(formatHireDateForName("2026-06-12")).toBe("06/12/2026");
    expect(formatHireDateForName(null)).toBe("unknown");
  });

  it("creates the 'Driver Escrow' sub-parent under 'Damage Claim Escrow', then the leaf under it", async () => {
    const grandparent: Acct = { id: "gp-1", account_name: "Damage Claim Escrow", account_type: "Liability", parent_account_id: null };
    const { client, store } = makeClient([grandparent]);
    const r = await provisionDriverEscrowSubAccount(client as never, ARGS);
    expect(r).toMatchObject({ created: true, accountName: "Mecor Perez — Driver Escrow (hired 06/12/2026)" });

    const subParent = store.find((a) => a.account_name === "Driver Escrow");
    expect(subParent).toBeTruthy();
    expect(subParent!.parent_account_id).toBe("gp-1"); // (a) reparented under Damage Claim Escrow

    const leaf = store.find((a) => a.account_name.includes("hired 06/12/2026"));
    expect(leaf!.parent_account_id).toBe(subParent!.id); // leaf under the year-agnostic sub-parent
  });

  it("reuses an existing 'Driver Escrow' sub-parent (does not create a second)", async () => {
    const seed: Acct[] = [
      { id: "gp-1", account_name: "Damage Claim Escrow", account_type: "Liability", parent_account_id: null },
      { id: "sp-1", account_name: "Driver Escrow", account_type: "Liability", parent_account_id: "gp-1" },
    ];
    const { client, store } = makeClient(seed);
    await provisionDriverEscrowSubAccount(client as never, ARGS);
    expect(store.filter((a) => a.account_name === "Driver Escrow")).toHaveLength(1);
    const leaf = store.find((a) => a.account_name.includes("hired 06/12/2026"));
    expect(leaf!.parent_account_id).toBe("sp-1");
  });

  it("idempotent — skips when the leaf already exists (no leaf INSERT)", async () => {
    const seed: Acct[] = [
      { id: "gp-1", account_name: "Damage Claim Escrow", account_type: "Liability", parent_account_id: null },
      { id: "sp-1", account_name: "Driver Escrow", account_type: "Liability", parent_account_id: "gp-1" },
      { id: "leaf-1", account_name: "Mecor Perez — Driver Escrow (hired 06/12/2026)", account_type: "Liability", parent_account_id: "sp-1" },
    ];
    const { client, sqls } = makeClient(seed);
    const r = await provisionDriverEscrowSubAccount(client as never, ARGS);
    expect(r).toEqual({ created: false, reason: "already_exists", accountId: "leaf-1" });
    expect(sqls.some((s) => s.sql.includes("INSERT INTO catalogs.accounts"))).toBe(false);
  });

  it("graceful no-op when the chart lacks 'Damage Claim Escrow' (e.g. TRK) — no INSERT, no throw", async () => {
    const { client, sqls } = makeClient([]);
    const r = await provisionDriverEscrowSubAccount(client as never, ARGS);
    expect(r).toEqual({ created: false, reason: "parent_not_found" });
    expect(sqls.some((s) => s.sql.includes("INSERT INTO catalogs.accounts"))).toBe(false);
  });
});
