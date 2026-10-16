/**
 * LEAD 443.168 H — OWNER LAW B (2026-09-12, permanent): "it should never automatch, it suggests and we accept it or change the
 * transactions". A Plaid category rule only SUGGESTS: autoCategorize writes suggested_* and never status 'categorized',
 * categorization_gl_account_id / coa_account_id, nor a GL posting — on sync (no actor) or apply-historical (actor) alike.
 * Fails on the old code (it set status = 'categorized' + categorization_gl_account_id and posted when an actor was present).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const sqls: string[] = [];
const query = vi.fn(async (sql: string) => {
  sqls.push(sql);
  if (sql.includes("FROM banking.transaction_categories")) {
    return { rows: [{ id: "rule-1", plaid_category_pattern: "FOOD_AND_DRINK", description_pattern: null, coa_account_id: "acct-meals", priority: 1 }] };
  }
  return { rows: [], rowCount: 1 };
});
vi.mock("../../../auth/db.js", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, withLuciaBypass: vi.fn(async (fn: (c: unknown) => unknown) => fn({ query })), withCurrentUser: vi.fn(async (_u: string, fn: (c: unknown) => unknown) => fn({ query })) };
});
const post = vi.fn();
vi.mock("../../../banking/bank-feed-gl-posting.service.js", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, maybePostBankCategorizationToGl: post };
});

describe("Plaid autoCategorize is suggest-only (443.168 H, Law B)", () => {
  beforeEach(() => { sqls.length = 0; query.mockClear(); post.mockClear(); });

  it("writes the suggestion, never the categorization or a GL posting — even with an actor (apply-historical)", async () => {
    const { autoCategorize } = await import("../plaid.service.js");
    const matched = await autoCategorize(
      { id: "bt-1", operating_company_id: "co-1", plaid_category: ["FOOD_AND_DRINK"], description: "HOLIDAY INN", is_credit: false },
      { actorUserUuid: "owner-1" }
    );
    expect(matched?.id).toBe("rule-1");
    const update = sqls.find((s) => s.includes("UPDATE banking.bank_transactions")) ?? "";
    expect(update).toContain("suggested_account_id = $2::uuid");
    expect(update).not.toMatch(/status = 'categorized'/);
    expect(update).not.toMatch(/categorization_gl_account_id = \$/);
    expect(update).not.toMatch(/coa_account_id = \$/);
    expect(post).not.toHaveBeenCalled();
  });
});
