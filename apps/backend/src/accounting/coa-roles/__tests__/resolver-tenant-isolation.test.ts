import { describe, expect, it, vi } from "vitest";
import { resolveRoleAccountOptional } from "../resolver.service.js";

describe("coa-roles resolver tenant isolation", () => {
  it("queries by operating_company_id for mapped role lookup", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("FROM accounting.chart_of_accounts_roles")) {
        return { rows: [{ account_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }] };
      }
      return { rows: [] };
    });

    const accountId = await resolveRoleAccountOptional(
      { query },
      "11111111-1111-4111-8111-111111111111",
      "ar_control"
    );

    expect(accountId).toBe("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    const mappedCall = query.mock.calls.find(([sql]) => String(sql).includes("FROM accounting.chart_of_accounts_roles"));
    expect(String(mappedCall?.[0] ?? "")).toContain("car.operating_company_id = $1::uuid");
    expect(mappedCall?.[1]).toEqual(["11111111-1111-4111-8111-111111111111", "ar_control"]);
  });

  // USMCA cross-entity-leak fix: the legacy catalogs.account_role_bindings lookup must be pinned to the
  // posting entity — the binding must be this entity's row OR a global NULL-entity binding, AND the resolved
  // account must belong to this entity. Proven at the SQL-contract level (params + predicates) because the
  // bypass poster path defeats RLS, so isolation MUST live in the query itself.
  const OPCO = "11111111-1111-4111-8111-111111111111";
  const legacyRoleBindingSql = (calls: [string, ...unknown[]][]) =>
    calls.find(([sql]) => String(sql).includes("FROM catalogs.account_role_bindings"));

  it("pins the legacy role-binding lookup to operating_company_id ($2) on both the binding and the account", async () => {
    // 'fuel_expense' is a non-control role that only resolves via the legacy binding path when there is no
    // chart_of_accounts_roles mapping and no account-shape fallback.
    const query = vi.fn(async (sql: string, params?: unknown[]) => {
      if (sql.includes("FROM catalogs.account_role_bindings")) {
        // Faithfully simulate the DB: only return a row when the binding query is scoped to THIS entity.
        if (params?.[1] === OPCO) return { rows: [{ account_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" }] };
        return { rows: [] };
      }
      return { rows: [] };
    });

    const resolved = await resolveRoleAccountOptional({ query }, OPCO, "undeposited_funds");
    expect(resolved).toBe("cccccccc-cccc-4ccc-8ccc-cccccccccccc"); // TRANSP-unchanged: still resolves

    const bindingCall = legacyRoleBindingSql(query.mock.calls as [string, ...unknown[]][]);
    const sqlText = String(bindingCall?.[0] ?? "");
    expect(sqlText).toContain("arb.operating_company_id = $2::uuid OR arb.operating_company_id IS NULL");
    expect(sqlText).toContain("a.operating_company_id = $2::uuid"); // account must belong to the entity
    expect(bindingCall?.[1]).toEqual(["undeposited_funds", OPCO]); // role_key + operating_company_id
  });

  it("returns null (fail-closed) when the only binding belongs to another entity", async () => {
    const FOREIGN = "22222222-2222-4222-8222-222222222222";
    // DB returns nothing for the foreign entity because the entity-scoped WHERE excludes the TRANSP binding.
    const query = vi.fn(async (sql: string, params?: unknown[]) => {
      if (sql.includes("FROM catalogs.account_role_bindings")) {
        return params?.[1] === OPCO ? { rows: [{ account_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" }] } : { rows: [] };
      }
      return { rows: [] };
    });

    // Same registry, resolving for a DIFFERENT entity -> no leak, resolves to nothing.
    const resolved = await resolveRoleAccountOptional({ query }, FOREIGN, "undeposited_funds");
    expect(resolved).toBeNull();
  });
});
