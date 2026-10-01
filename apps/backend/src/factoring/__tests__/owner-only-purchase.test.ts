import { describe, expect, it } from "vitest";
import { checkFactoringPurchaseOwner, requireFactoringPurchaseOwner } from "../owner-only-purchase.js";

const OCI = "5c854333-6ea5-4faa-af31-67cb272fef80";

function fakeClient(dbRole: string | null) {
  const calls: Array<{ sql: string; values?: unknown[] }> = [];
  return {
    calls,
    query: async (sql: string, values?: unknown[]) => {
      calls.push({ sql, values });
      if (/FROM identity\.users/.test(sql)) return { rows: dbRole ? [{ role: dbRole }] : [] };
      return { rows: [] };
    },
  };
}

describe("ROUND 315 owner-only factoring purchase gate", () => {
  it("admits the Owner with no audit row", async () => {
    const c = fakeClient(null);
    expect(await checkFactoringPurchaseOwner(c as never, { operatingCompanyId: OCI, userUuid: "u", role: "Owner", action: "create" })).toBe(true);
    expect(c.calls.some((x) => /append_event/.test(x.sql))).toBe(false);
  });

  it.each(["Administrator", "Accountant", "Manager", ""])("refuses %s and writes the refusal audit row", async (role) => {
    const c = fakeClient(null);
    expect(await checkFactoringPurchaseOwner(c as never, { operatingCompanyId: OCI, userUuid: "u", role, action: "release", targetId: "a1" })).toBe(false);
    const audit = c.calls.find((x) => /append_event/.test(x.sql));
    expect(audit?.values?.[0]).toBe("factoring.purchase_refused_non_owner");
    expect(JSON.parse(String(audit?.values?.[2]))).toMatchObject({ action: "release", target_id: "a1", actor_role: role });
  });

  it("resolves the role from identity.users when the caller has none (service / system actor)", async () => {
    expect(await checkFactoringPurchaseOwner(fakeClient("Owner") as never, { operatingCompanyId: OCI, userUuid: "u", action: "bank_match" })).toBe(true);
    expect(await checkFactoringPurchaseOwner(fakeClient(null) as never, { operatingCompanyId: OCI, userUuid: null, action: "bank_match" })).toBe(false);
  });

  it("route form sends 403 factoring_purchase_owner_only", async () => {
    let code = 0;
    let body: unknown = null;
    const reply = { code: (n: number) => ({ send: (b: unknown) => { code = n; body = b; } }) };
    expect(await requireFactoringPurchaseOwner(reply as never, fakeClient(null) as never, { operatingCompanyId: OCI, userUuid: "u", role: "Accountant", action: "create" })).toBe(false);
    expect(code).toBe(403);
    expect(body).toMatchObject({ error: "factoring_purchase_owner_only" });
  });
});
