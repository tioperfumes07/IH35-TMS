import { describe, expect, it, vi } from "vitest";

vi.mock("../../audit/crud-audit.js", () => ({ appendCrudAudit: vi.fn(async () => undefined) }));
// ROUND 389.3 RULING 2 — the advance parent is the account bound to the advance_recovery ROLE (1245).
const { mockResolveRoleAccountOptional } = vi.hoisted(() => ({ mockResolveRoleAccountOptional: vi.fn() }));
vi.mock("../coa-roles/resolver.service.js", () => ({ resolveRoleAccountOptional: mockResolveRoleAccountOptional }));

const {
  provisionDriverAdvanceSubAccount,
  driverAdvanceSubAccountName,
  ensureDriverReimbursementParent,
  ensureDriverReimbursementSubParent,
  provisionDriverReimbursementSubAccount,
  resolveDriverReimbursementSubAccountId,
  driverReimbursementSubAccountName,
  DRIVER_REIMBURSEMENT_PARENT_NAME,
  DRIVER_REIMBURSEMENT_PARENT_ACCOUNT_NUMBER,
  DRIVER_REIMBURSEMENT_SUB_PARENT_NAME,
  DRIVER_REIMBURSEMENT_SUB_PARENT_ACCOUNT_NUMBER,
} = await import("../driver-subaccount-provision.service.js");

const ARGS = { operatingCompanyId: "oc", driverId: "drv-1", driverName: "Domingo Barrientos", actorUserId: "u1" };

function makeClient(opts: { parentId: string | null; alreadyExists?: string | null }) {
  const sqls: { sql: string; params: unknown[] }[] = [];
  mockResolveRoleAccountOptional.mockReset();
  mockResolveRoleAccountOptional.mockResolvedValue(opts.parentId);
  const client = {
    query: vi.fn(async (sql: string, params?: unknown[]) => {
      sqls.push({ sql, params: params ?? [] });
      // ROUND 389.3 — the per-driver number allocator: no existing number for this driver, highest used is 006.
      if (sql.includes("max(substring(account_number")) return { rows: [{ n: 6 }] };
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

describe("driver advance sub-account provisioning (ROUND 389.3 ruling 2: 1245-00-nnn)", () => {
  it("names the sub-account in the escrow shape: '<Name> — Driver Cash Advance'", () => {
    expect(driverAdvanceSubAccountName("Domingo Barrientos")).toBe("Domingo Barrientos — Driver Cash Advance");
  });

  it("creates the ASSET sub-account under the advance_recovery role parent, numbered <parent>-00-<driver nnn>", async () => {
    const { client, sqls } = makeClient({ parentId: "parent-1245" });
    const r = await provisionDriverAdvanceSubAccount(client as never, ARGS);
    expect(r).toMatchObject({ created: true, accountName: "Domingo Barrientos — Driver Cash Advance" });
    expect(mockResolveRoleAccountOptional).toHaveBeenCalledWith(client, "oc", "advance_recovery");
    expect(sqls.some((q) => q.sql.includes("parent_account_id IS NULL"))).toBe(false); // never a name lookup
    const insert = sqls.find((q) => q.sql.includes("INSERT INTO catalogs.accounts"))!;
    expect(insert.params[0]).toBe("Domingo Barrientos — Driver Cash Advance");
    expect(insert.params[1]).toBe("parent-1245");
    expect(insert.sql).toContain("p.account_number || '-00-' || $6"); // 1245-00-nnn from the parent's own number
    expect(insert.params[5]).toBe("007"); // next driver number after the highest used (006), zero-padded
    expect(insert.sql).toContain("'Asset'");
    expect(insert.sql).toContain("p.account_subtype");
    expect(insert.params[4]).toBe("oc"); // entity-pinned
  });

  it("uses the driver number it is given (hire allocates ONE number for advance and escrow)", async () => {
    const { client, sqls } = makeClient({ parentId: "parent-1245" });
    await provisionDriverAdvanceSubAccount(client as never, { ...ARGS, nnn: "001" });
    expect(sqls.find((q) => q.sql.includes("INSERT INTO catalogs.accounts"))!.params[5]).toBe("001");
    expect(sqls.some((q) => q.sql.includes("max(substring(account_number"))).toBe(false);
  });

  it("is idempotent — skips when the sub-account already exists (no INSERT)", async () => {
    const { client, sqls } = makeClient({ parentId: "parent-1245", alreadyExists: "existing-acct" });
    const r = await provisionDriverAdvanceSubAccount(client as never, ARGS);
    expect(r).toEqual({ created: false, reason: "already_exists", accountId: "existing-acct" });
    expect(sqls.some((q) => q.sql.includes("INSERT INTO catalogs.accounts"))).toBe(false);
  });

  it("graceful no-op when the entity has no advance_recovery binding (e.g. TRK) — no INSERT, no throw", async () => {
    const { client, sqls } = makeClient({ parentId: null });
    const r = await provisionDriverAdvanceSubAccount(client as never, ARGS);
    expect(r).toEqual({ created: false, reason: "parent_not_found" });
    expect(sqls.some((q) => q.sql.includes("INSERT INTO catalogs.accounts"))).toBe(false);
  });
});


// R-185 (Claude-Lead ruling, owner-approved 2026-09-25) — "one cost, one payable": driver-paid
// expense reimbursements post Dr item / Cr 2175-<driver>. Owner ruling 2026-09-25 ("already been
// asked and answered ... same format") requires the SAME two-level numbered shape as the escrow
// family: 2175 (parent) -> 2175-00 (sub-parent) -> 2175-00-NNN (per-driver leaf, zero-padded
// sequence), leaves named "<Driver Name> — Driver Reimbursements".
function makeReimbursementClient(opts: {
  parentId: string | null;
  subParentId?: string | null;
  alreadyExists?: string | null;
  existingLeafNumbers?: string[];
}) {
  const sqls: { sql: string; params: unknown[] }[] = [];
  const client = {
    query: vi.fn(async (sql: string, params?: unknown[]) => {
      sqls.push({ sql, params: params ?? [] });
      if (sql.includes("WHERE account_name = $1") && sql.includes("parent_account_id IS NULL")) {
        return { rows: opts.parentId ? [{ id: opts.parentId }] : [] }; // resolveCanonicalParentAccount (2175)
      }
      if (sql.includes("account_number LIKE $2")) {
        // nextDriverReimbursementLeafNumber
        return { rows: (opts.existingLeafNumbers ?? []).map((n) => ({ account_number: n })) };
      }
      if (sql.includes("parent_account_id = $2::uuid") && sql.includes("SELECT id")) {
        // resolveChildAccountId — distinguish sub-parent lookup (name = "Driver Reimbursements")
        // from leaf lookup (name = "<Driver> — Driver Reimbursements") by the account_name param.
        const name = params?.[0];
        if (name === DRIVER_REIMBURSEMENT_SUB_PARENT_NAME) {
          return { rows: opts.subParentId !== undefined && opts.subParentId !== null ? [{ id: opts.subParentId }] : [] };
        }
        return { rows: opts.alreadyExists ? [{ id: opts.alreadyExists }] : [] };
      }
      if (sql.includes("INSERT INTO catalogs.accounts")) {
        // Distinguish which level is being inserted by the account_number/account_name params.
        if (params?.[0] === DRIVER_REIMBURSEMENT_PARENT_ACCOUNT_NUMBER) return { rows: [{ id: "new-2175-parent" }] };
        if (params?.[0] === DRIVER_REIMBURSEMENT_SUB_PARENT_ACCOUNT_NUMBER) return { rows: [{ id: "new-2175-00-subparent" }] };
        return { rows: [{ id: "new-reimb-leaf-1" }] };
      }
      return { rows: [] };
    }),
  };
  return { client, sqls };
}

const REIMB_ARGS = { operatingCompanyId: "oc", driverId: "drv-9", driverName: "Pedro Abraham Lopez Collado", actorUserId: "u1" };

describe("driver reimbursement (2175) sub-account provisioning — R-185", () => {
  it("names the leaf account '<Driver Name> — Driver Reimbursements' — mirrors escrow's naming shape", () => {
    expect(driverReimbursementSubAccountName("Pedro Abraham Lopez Collado")).toBe(
      "Pedro Abraham Lopez Collado — Driver Reimbursements"
    );
  });

  it("ensureDriverReimbursementParent creates 2175 with a REAL account_number when it doesn't exist yet", async () => {
    const { client, sqls } = makeReimbursementClient({ parentId: null });
    const id = await ensureDriverReimbursementParent(client as never, { operatingCompanyId: "oc", actorUserId: "u1" });
    expect(id).toBe("new-2175-parent");
    const insert = sqls.find((s) => s.sql.includes("INSERT INTO catalogs.accounts") && s.params[0] === "2175")!;
    expect(insert.params[0]).toBe(DRIVER_REIMBURSEMENT_PARENT_ACCOUNT_NUMBER); // "2175" — a REAL number
    expect(insert.params[1]).toBe(DRIVER_REIMBURSEMENT_PARENT_NAME);
    expect(insert.sql).toContain("'Liability'");
    expect(insert.sql).toContain("false"); // is_postable=false — only the per-driver leaves post
    expect(insert.sql).not.toContain("parent_account_id = $2"); // top-level: no parent
  });

  it("ensureDriverReimbursementParent resolves the existing parent without a second INSERT", async () => {
    const { client, sqls } = makeReimbursementClient({ parentId: "existing-2175" });
    const id = await ensureDriverReimbursementParent(client as never, { operatingCompanyId: "oc", actorUserId: "u1" });
    expect(id).toBe("existing-2175");
    expect(sqls.some((s) => s.sql.includes("INSERT INTO catalogs.accounts") && s.params[0] === "2175")).toBe(false);
  });

  it("ensureDriverReimbursementSubParent creates 2175-00 under the 2175 parent when it doesn't exist yet", async () => {
    const { client, sqls } = makeReimbursementClient({ parentId: "existing-2175", subParentId: null });
    const id = await ensureDriverReimbursementSubParent(client as never, { operatingCompanyId: "oc", actorUserId: "u1" });
    expect(id).toBe("new-2175-00-subparent");
    const insert = sqls.find((s) => s.params[0] === DRIVER_REIMBURSEMENT_SUB_PARENT_ACCOUNT_NUMBER)!;
    expect(insert.params[1]).toBe(DRIVER_REIMBURSEMENT_SUB_PARENT_NAME);
    expect(insert.params[2]).toBe("existing-2175"); // nested under the 2175 parent
    expect(insert.sql).toContain("'Liability'");
    expect(insert.sql).toContain("false"); // header only, not postable
  });

  it("ensureDriverReimbursementSubParent resolves the existing sub-parent without a second INSERT", async () => {
    const { client, sqls } = makeReimbursementClient({ parentId: "existing-2175", subParentId: "existing-2175-00" });
    const id = await ensureDriverReimbursementSubParent(client as never, { operatingCompanyId: "oc", actorUserId: "u1" });
    expect(id).toBe("existing-2175-00");
    expect(sqls.some((s) => s.sql.includes("INSERT INTO catalogs.accounts"))).toBe(false);
  });

  it("provisionDriverReimbursementSubAccount creates the per-driver leaf as 2175-00-001 (first leaf), postable", async () => {
    const { client, sqls } = makeReimbursementClient({ parentId: "existing-2175", subParentId: "existing-2175-00", existingLeafNumbers: [] });
    const r = await provisionDriverReimbursementSubAccount(client as never, REIMB_ARGS);
    expect(r).toMatchObject({ created: true, accountName: "Pedro Abraham Lopez Collado — Driver Reimbursements" });
    const insert = sqls.find((s) => s.sql.includes("INSERT INTO catalogs.accounts") && s.params[1] === "Pedro Abraham Lopez Collado — Driver Reimbursements")!;
    expect(insert.params[0]).toBe("2175-00-001"); // owner ruling: sequential, zero-padded, mirrors 2100-00-NNN
    expect(insert.params[2]).toBe("existing-2175-00"); // nested under the sub-parent, not the top parent
    expect(insert.sql).toContain("'Liability'");
    expect(insert.sql).toContain("true"); // is_postable=true
  });

  it("provisionDriverReimbursementSubAccount continues the sequence from the highest existing leaf number", async () => {
    const { client, sqls } = makeReimbursementClient({
      parentId: "existing-2175",
      subParentId: "existing-2175-00",
      existingLeafNumbers: ["2175-00-001", "2175-00-002", "2175-00-007"],
    });
    await provisionDriverReimbursementSubAccount(client as never, REIMB_ARGS);
    const insert = sqls.find((s) => s.sql.includes("INSERT INTO catalogs.accounts") && s.params[1] === "Pedro Abraham Lopez Collado — Driver Reimbursements")!;
    expect(insert.params[0]).toBe("2175-00-008"); // max(001,002,007)+1, never reuses a number
  });

  it("provisionDriverReimbursementSubAccount is idempotent — skips when the leaf already exists", async () => {
    const { client, sqls } = makeReimbursementClient({ parentId: "existing-2175", subParentId: "existing-2175-00", alreadyExists: "existing-leaf" });
    const r = await provisionDriverReimbursementSubAccount(client as never, REIMB_ARGS);
    expect(r).toEqual({ created: false, reason: "already_exists", accountId: "existing-leaf" });
    expect(sqls.some((s) => s.sql.includes("INSERT INTO catalogs.accounts"))).toBe(false);
  });

  it("resolveDriverReimbursementSubAccountId is read-only and returns null when the parent doesn't exist yet", async () => {
    const { client, sqls } = makeReimbursementClient({ parentId: null });
    const id = await resolveDriverReimbursementSubAccountId(client as never, { operatingCompanyId: "oc", driverName: "Anyone" });
    expect(id).toBeNull();
    expect(sqls.some((s) => s.sql.includes("INSERT"))).toBe(false);
  });

  it("resolveDriverReimbursementSubAccountId returns null when the sub-parent doesn't exist yet", async () => {
    const { client } = makeReimbursementClient({ parentId: "existing-2175", subParentId: null });
    const id = await resolveDriverReimbursementSubAccountId(client as never, { operatingCompanyId: "oc", driverName: "Anyone" });
    expect(id).toBeNull();
  });

  it("resolveDriverReimbursementSubAccountId resolves the existing leaf under the existing sub-parent", async () => {
    const { client } = makeReimbursementClient({ parentId: "existing-2175", subParentId: "existing-2175-00", alreadyExists: "leaf-77" });
    const id = await resolveDriverReimbursementSubAccountId(client as never, { operatingCompanyId: "oc", driverName: "Pedro Abraham Lopez Collado" });
    expect(id).toBe("leaf-77");
  });
});
