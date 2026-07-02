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

  // ---------------------------------------------------------------------------------------------------
  // 5th cross-entity-leak fix: the PRIMARY role→account mapping path (resolveMappedRoleAccount for
  // non-control roles, listMappedRoleAccountIds for control roles) previously scoped ONLY the mapping row
  // (car.operating_company_id) and NOT the resolved account's own entity. On the is_lucia_bypass() poster
  // path catalogs.accounts RLS is DEFEATED, so a role row in entity A pointing at entity B's account would
  // resolve and post cross-entity. The queries now pin `a.operating_company_id = $1::uuid`. Proven at the
  // SQL-contract level (the predicate is what makes the RLS-defeated DB return nothing) + behaviorally
  // (same-entity resolves; cross-entity falls through to null).
  const ENTITY_A = "aaaaaaa1-1111-4111-8111-111111111111";
  const ENTITY_B_ACCOUNT = "bbbbbbb2-2222-4222-8222-222222222222"; // owned by ANOTHER entity
  const SAME_ENTITY_ACCOUNT = "aaaaaaa9-9999-4999-8999-999999999999";
  const mappedSql = (calls: [string, ...unknown[]][]) =>
    calls.find(([sql]) => String(sql).includes("FROM accounting.chart_of_accounts_roles"));

  it("pins the primary mapped-role query to the ACCOUNT's own entity (a.operating_company_id = $1)", async () => {
    // Faithful DB: the mapping row exists AND its account is same-entity → the WHERE (which now pins
    // a.operating_company_id = $1) matches, so a row is returned. revenue_default is a non-control role, so
    // it flows straight through resolveMappedRoleAccount.
    const query = vi.fn(async (sql: string, params?: unknown[]) => {
      if (sql.includes("FROM accounting.chart_of_accounts_roles")) {
        return params?.[0] === ENTITY_A ? { rows: [{ account_id: SAME_ENTITY_ACCOUNT }] } : { rows: [] };
      }
      return { rows: [] };
    });

    const resolved = await resolveRoleAccountOptional({ query }, ENTITY_A, "revenue_default");
    expect(resolved).toBe(SAME_ENTITY_ACCOUNT); // same-entity mapping still resolves (no regression)

    const call = mappedSql(query.mock.calls as [string, ...unknown[]][]);
    const sqlText = String(call?.[0] ?? "");
    expect(sqlText).toContain("car.operating_company_id = $1::uuid");
    expect(sqlText).toContain("a.operating_company_id = $1::uuid"); // the account itself must be this entity
  });

  it("returns null (fail-closed) when the mapped role points at a FOREIGN-entity account (bypass path)", async () => {
    // Faithful DB under the RLS-defeated bypass path: a chart_of_accounts_roles row for ENTITY_A exists, but
    // its account_id points at ENTITY_B_ACCOUNT (owned by another entity). Because the query now requires
    // a.operating_company_id = $1::uuid, the DB returns NOTHING for that JOIN — the leak is closed. We model
    // that by returning no row (the account fails the account-entity predicate), and there is no legacy
    // binding or shape fallback for revenue_default's account here, so the resolver falls through to null.
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("FROM accounting.chart_of_accounts_roles")) {
        // The predicate `a.operating_company_id = $1::uuid` MUST be present — that is what excludes the
        // foreign account at the DB level. Assert it, then simulate the DB returning zero rows.
        expect(sql).toContain("a.operating_company_id = $1::uuid");
        return { rows: [] };
      }
      return { rows: [] };
    });

    const resolved = await resolveRoleAccountOptional({ query }, ENTITY_A, "revenue_default");
    expect(resolved).toBeNull(); // foreign-entity account is NEVER returned; poster will fail closed
    void ENTITY_B_ACCOUNT; // documents the scenario: the mapping's account belongs to this id, not ENTITY_A
  });

  it("pins the CONTROL-role listing query (ar_control) to the account's own entity too", async () => {
    // ar_control resolves via listMappedRoleAccountIds (DISTINCT, no LIMIT) so it can fail-closed on
    // ambiguity. That query must ALSO pin a.operating_company_id = $1::uuid, or a foreign-entity A/R account
    // could be counted/returned under bypass.
    const query = vi.fn(async (sql: string, params?: unknown[]) => {
      if (sql.includes("FROM accounting.chart_of_accounts_roles")) {
        expect(sql).toContain("a.operating_company_id = $1::uuid");
        return params?.[0] === ENTITY_A ? { rows: [{ account_id: SAME_ENTITY_ACCOUNT }] } : { rows: [] };
      }
      return { rows: [] };
    });

    const resolved = await resolveRoleAccountOptional({ query }, ENTITY_A, "ar_control");
    expect(resolved).toBe(SAME_ENTITY_ACCOUNT); // same-entity control mapping resolves (no regression)
  });
});
