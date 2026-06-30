import { describe, expect, it, vi } from "vitest";
import {
  ControlAccountDesignationError,
  CoaRoleResolutionError,
  resolveRoleAccount,
  resolveRoleAccountOptional,
} from "../resolver.service.js";

const OPCO = "91e0bf0a-133f-4ce8-a734-2586cfa66d96";
const QBO45 = "45aaaaaa-1111-4111-8111-aaaaaaaaaaaa";
const OTHER = "99bbbbbb-2222-4222-8222-bbbbbbbbbbbb";

function isMappingQuery(sql: string) {
  return sql.includes("FROM accounting.chart_of_accounts_roles");
}
function isLegacyBindingQuery(sql: string) {
  return sql.includes("FROM catalogs.account_role_bindings");
}
function isSubtypeFallbackQuery(sql: string) {
  return sql.includes("FROM catalogs.accounts") && !isMappingQuery(sql);
}

describe("coa-roles resolver — control account fail-closed (ar_control)", () => {
  it("(a) returns the uniquely designated account when QBO-45 is the sole ar_control mapping", async () => {
    const query = vi.fn(async (sql: string) => {
      if (isMappingQuery(sql)) return { rows: [{ account_id: QBO45 }] };
      return { rows: [] };
    });

    const resolved = await resolveRoleAccount({ query }, OPCO, "ar_control");
    expect(resolved).toBe(QBO45);
  });

  it("(b1) throws when TWO accounts are designated as ar_control (ambiguous mapping)", async () => {
    const query = vi.fn(async (sql: string) => {
      if (isMappingQuery(sql)) return { rows: [{ account_id: QBO45 }, { account_id: OTHER }] };
      return { rows: [] };
    });

    await expect(resolveRoleAccount({ query }, OPCO, "ar_control")).rejects.toBeInstanceOf(
      ControlAccountDesignationError
    );
    await expect(resolveRoleAccountOptional({ query }, OPCO, "ar_control")).rejects.toMatchObject({
      code: "CONTROL_ACCOUNT_NOT_UNIQUELY_DESIGNATED",
      designation_source: "role_mapping",
      candidate_count: 2,
    });
  });

  it("(b2) throws when ZERO designated but the account_subtype fallback is ambiguous (>1 AR subtype match)", async () => {
    const query = vi.fn(async (sql: string) => {
      if (isMappingQuery(sql)) return { rows: [] };
      if (isLegacyBindingQuery(sql)) return { rows: [] };
      if (isSubtypeFallbackQuery(sql)) return { rows: [{ id: QBO45 }, { id: OTHER }] };
      return { rows: [] };
    });

    await expect(resolveRoleAccountOptional({ query }, OPCO, "ar_control")).rejects.toMatchObject({
      code: "CONTROL_ACCOUNT_NOT_UNIQUELY_DESIGNATED",
      designation_source: "account_subtype_fallback",
      candidate_count: 2,
    });
  });

  it("(b3) fails fast (CoaRoleResolutionError) when nothing is designated or matchable at all", async () => {
    const query = vi.fn(async () => ({ rows: [] }));
    await expect(resolveRoleAccount({ query }, OPCO, "ar_control")).rejects.toBeInstanceOf(
      CoaRoleResolutionError
    );
  });

  it("uses the single subtype fallback only when exactly one AR account exists (no silent multi-pick)", async () => {
    const query = vi.fn(async (sql: string) => {
      if (isSubtypeFallbackQuery(sql)) return { rows: [{ id: QBO45 }] };
      return { rows: [] };
    });
    const resolved = await resolveRoleAccountOptional({ query }, OPCO, "ar_control");
    expect(resolved).toBe(QBO45);
  });
});
