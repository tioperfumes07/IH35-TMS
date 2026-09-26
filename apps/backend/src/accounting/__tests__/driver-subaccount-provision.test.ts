import { describe, expect, it, vi } from "vitest";

vi.mock("../../audit/crud-audit.js", () => ({ appendCrudAudit: vi.fn(async () => undefined) }));

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
    // ROW-259 (2026-08-03) briefly derived a local sequence number here; ROUND 181 (owner law: no
    // auto numbers without written owner approval) reverted that — a new driver sub-account gets NO
    // auto-generated number, matching the SAME NULL-number contract this file's escrow/reimbursement
    // leaves already use. This test was stale (still asserting ROW-259's lpad()-derived number,
    // which the source code's own ROUND-181 comment documents as intentionally removed) — confirmed
    // failing identically on plain origin/main, unrelated to any change in this commit; fixed forward.
    expect(insert.sql).toContain("NULL,"); // account_number NULL — ROUND 181, no auto numbers on leaves
    expect(insert.sql).toContain("p.account_subtype"); // subtype still inherited from the parent
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
