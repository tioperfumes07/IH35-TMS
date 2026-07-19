/**
 * CHAIN-06 — Invoice → A/R → Faro chain-proof behavioral matrix (mocked service layer).
 *
 * Accounting Core Block 25/67. Scope of THIS file = mocked poster service gates:
 *   JE debit=credit, account role/direction, entity GUC, invoice FK, reserve movements,
 *   plus fail/idempotency/voided/flag-off paths. Live Postgres Leg B/C / kill-switch proofs
 *   remain in chain-06-factoring-ar-tieout.db.test.ts + invoice-ar-killswitch.db.test.ts (CI).
 * This PR does not claim live Neon posting proof.
 *
 * Acceptance scenarios (named for verify-chain-06-invoice-ar-chain-proof.mjs):
 *   normal lifecycle · missing link · duplicate link · wrong entity ·
 *   unbalanced/wrong account · chargeback · voided · planted guard failure (executable)
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  postFactoringAdvanceEvent,
  postFactoringChargebackEvent,
  postFactoringCustomerPaymentEvent,
  postFactoringReleaseEvent,
} from "../poster.service.js";

const {
  mockQuery,
  mockWithLuciaBypass,
  mockWithCurrentUser,
  mockIsEnabled,
  mockCreateJournalEntry,
  mockResolveRoleAccount,
} = vi.hoisted(() => {
  const query = vi.fn();
  const withLuciaBypass = vi.fn(async (fn: (client: { query: typeof query }) => unknown) =>
    fn({ query })
  );
  const withCurrentUser = vi.fn(async (_userId: string, fn: (client: { query: typeof query }) => unknown) =>
    fn({ query })
  );
  return {
    mockQuery: query,
    mockWithLuciaBypass: withLuciaBypass,
    mockWithCurrentUser: withCurrentUser,
    mockIsEnabled: vi.fn(),
    mockCreateJournalEntry: vi.fn(),
    mockResolveRoleAccount: vi.fn(),
  };
});

vi.mock("../../../auth/db.js", () => ({ withLuciaBypass: mockWithLuciaBypass, withCurrentUser: mockWithCurrentUser }));
vi.mock("../../../lib/feature-flags/service.js", () => ({ isEnabled: mockIsEnabled }));
vi.mock("../../journal-entries.service.js", () => ({ createJournalEntryOnClient: mockCreateJournalEntry, enqueueJournalEntrySideEffects: vi.fn(async () => undefined) }));
vi.mock("../../posting-engine.service.js", () => ({ ensureOpenPeriod: vi.fn(async () => undefined) }));
vi.mock("../../accounting-spine-emit.js", () => ({ writeTransactionSourceLink: vi.fn(async () => undefined) }));
vi.mock("../../coa-roles/resolver.service.js", () => ({ resolveRoleAccount: mockResolveRoleAccount }));

const OPCO = "11111111-1111-4111-8111-111111111111";
const OTHER_OPCO = "99999999-9999-4999-8999-999999999999";
const ADVANCE = "22222222-2222-4222-8222-222222222222";
const ACTOR = "33333333-3333-4333-8333-333333333333";
const INVOICE = { id: "aaaaaaaa-0000-4000-8000-000000000001", total_cents: "100000", voided_at: null };
const VOIDED_INVOICE = {
  id: "aaaaaaaa-0000-4000-8000-000000000099",
  total_cents: "50000",
  voided_at: "2026-06-01T00:00:00.000Z",
};

type Posting = { account_id: string; debit_or_credit: "debit" | "credit"; amount_cents: number };

function advanceRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "fac-1",
    display_id: "FAC-CHAIN06-1",
    status: "advanced",
    invoice_total_cents: 100000,
    advance_amount_cents: 90000,
    reserve_amount_cents: 8000,
    factor_fee_cents: 2000,
    release_amount_cents: 0,
    submitted_at: "2026-01-05T00:00:00.000Z",
    advanced_at: "2026-01-07T00:00:00.000Z",
    collected_at: null,
    released_at: null,
    ...overrides,
  };
}

function postingsFromCall(callIndex: number): Posting[] {
  const call = mockCreateJournalEntry.mock.calls[callIndex];
  return (call?.[1]?.postings ?? call?.[0]?.postings ?? []) as Posting[];
}
function leg(postings: Posting[], accountId: string) {
  return postings.find((p) => p.account_id === accountId);
}
function sum(postings: Posting[], dc: "debit" | "credit") {
  return postings.filter((p) => p.debit_or_credit === dc).reduce((s, p) => s + p.amount_cents, 0);
}
function assertBalanced(postings: Posting[]) {
  expect(sum(postings, "debit")).toBe(sum(postings, "credit"));
  expect(sum(postings, "debit")).toBeGreaterThan(0);
}

let invoiceRows: Array<{ id: string; total_cents: string; voided_at: string | null }>;
let alreadyPosted = false;
let updateCalls: Array<{ sql: string; values: unknown[] }>;
let reserveCalls: Array<{ sql: string; values: unknown[] }>;
let advanceLoadSql: string[];

function installDefaults() {
  mockQuery.mockReset();
  mockIsEnabled.mockReset();
  mockCreateJournalEntry.mockReset();
  mockResolveRoleAccount.mockReset();
  invoiceRows = [INVOICE];
  alreadyPosted = false;
  updateCalls = [];
  reserveCalls = [];
  advanceLoadSql = [];

  mockIsEnabled.mockResolvedValue(true);
  mockResolveRoleAccount.mockImplementation(async (_c: unknown, _o: string, role: string) => `acct-${role}`);
  mockCreateJournalEntry.mockResolvedValue({ id: "je-chain-06" });

  mockQuery.mockImplementation(async (sql: string, values?: unknown[]) => {
    if (sql.includes("set_config('app.operating_company_id'")) return { rows: [] };
    if (sql.includes("FROM accounting.factoring_advances") && sql.includes("invoice_total_cents")) {
      advanceLoadSql.push(sql);
      const opco = values?.[1];
      if (opco && opco !== OPCO) return { rows: [] };
      return { rows: [advanceRow()] };
    }
    if (sql.includes("FROM accounting.journal_entries") && sql.includes("memo = $2")) {
      return { rows: alreadyPosted ? [{ id: "je-existing" }] : [] };
    }
    if (sql.includes("SELECT id::text, total_cents::text, voided_at::text") && sql.includes("FROM accounting.invoices")) {
      expect(sql).toContain("factoring_advance_id");
      expect(sql).toContain("operating_company_id");
      return { rows: invoiceRows };
    }
    if (sql.trim().startsWith("UPDATE accounting.invoices")) {
      updateCalls.push({ sql, values: values ?? [] });
      return { rows: [] };
    }
    if (sql.includes("INSERT INTO accounting.factoring_reserve_movements")) {
      reserveCalls.push({ sql, values: values ?? [] });
      return { rows: [] };
    }
    return { rows: [] };
  });
}

beforeEach(() => installDefaults());

describe("CHAIN-06 invoice→A/R→Faro chain-proof behavioral matrix (mocked service gates)", () => {
  it("normal lifecycle: funding -> customer payment -> release; debit=credit; roles/directions; invoice FK", async () => {
    const funded = await postFactoringAdvanceEvent({
      operating_company_id: OPCO,
      factoring_advance_id: ADVANCE,
      actor_user_id: ACTOR,
      funding_figures: {
        invoice_total_cents: 100000,
        reserve_cents: 8000,
        fee_cents: 2000,
        ach_cents: 0,
      },
    });
    expect(funded.posted).toBe(true);
    expect(funded.journal_entry_id).toBe("je-chain-06");

    // Entity GUC + entity-scoped advance load (source factoring_advance linkage).
    expect(mockQuery.mock.calls.some(([sql]) => String(sql).includes("set_config('app.operating_company_id'"))).toBe(
      true
    );
    expect(advanceLoadSql.some((sql) => sql.includes("operating_company_id = $2::uuid"))).toBe(true);

    const fundingJe = mockCreateJournalEntry.mock.calls[0]?.[1];
    expect(fundingJe?.operating_company_id).toBe(OPCO);
    expect(fundingJe?.source).toBe("auto");
    const fundingPostings = postingsFromCall(0);
    assertBalanced(fundingPostings);
    expect(leg(fundingPostings, "acct-factoring_advance_liability")).toMatchObject({
      debit_or_credit: "credit",
      amount_cents: 100000,
    });
    expect(leg(fundingPostings, "acct-cash_clearing")).toMatchObject({
      debit_or_credit: "debit",
      amount_cents: 90000,
    });
    expect(leg(fundingPostings, "acct-factor_reserve_held")).toMatchObject({
      debit_or_credit: "debit",
      amount_cents: 8000,
    });
    expect(leg(fundingPostings, "acct-factor_fee_expense")).toMatchObject({
      debit_or_credit: "debit",
      amount_cents: 2000,
    });
    expect(leg(fundingPostings, "acct-ar_control")).toBeUndefined();
    expect(reserveCalls.some((c) => c.values[2] === "held" && c.values[1] === ADVANCE)).toBe(true);

    mockResolveRoleAccount.mockClear();
    mockCreateJournalEntry.mockClear();

    const paid = await postFactoringCustomerPaymentEvent({
      operating_company_id: OPCO,
      factoring_advance_id: ADVANCE,
      actor_user_id: ACTOR,
      amount_cents: 100000,
    });
    expect(paid.posted).toBe(true);
    const payPostings = postingsFromCall(0);
    assertBalanced(payPostings);
    expect(leg(payPostings, "acct-factoring_advance_liability")).toMatchObject({
      debit_or_credit: "debit",
      amount_cents: 100000,
    });
    expect(leg(payPostings, "acct-ar_control")).toMatchObject({
      debit_or_credit: "credit",
      amount_cents: 100000,
    });
    expect(updateCalls.length).toBeGreaterThan(0);
    expect(updateCalls[0].sql).toContain("amount_paid_cents");
    expect(updateCalls[0].values[0]).toBe(INVOICE.id);

    mockCreateJournalEntry.mockClear();
    reserveCalls = [];
    const released = await postFactoringReleaseEvent({
      operating_company_id: OPCO,
      factoring_advance_id: ADVANCE,
      actor_user_id: ACTOR,
      release_amount_cents: 8000,
    });
    expect(released.posted).toBe(true);
    const releasePostings = postingsFromCall(0);
    assertBalanced(releasePostings);
    expect(leg(releasePostings, "acct-cash_clearing")).toMatchObject({
      debit_or_credit: "debit",
      amount_cents: 8000,
    });
    expect(leg(releasePostings, "acct-factor_reserve_held")).toMatchObject({
      debit_or_credit: "credit",
      amount_cents: 8000,
    });
    expect(leg(releasePostings, "acct-ar_control")).toBeUndefined();
    expect(reserveCalls.some((c) => c.values[2] === "released")).toBe(true);
  });

  it("missing link: advance_not_found when factoring advance is absent for the entity", async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("set_config('app.operating_company_id'")) return { rows: [] };
      if (sql.includes("FROM accounting.factoring_advances")) return { rows: [] };
      return { rows: [] };
    });
    const res = await postFactoringAdvanceEvent({
      operating_company_id: OPCO,
      factoring_advance_id: ADVANCE,
      actor_user_id: ACTOR,
    });
    expect(res).toMatchObject({ posted: false, reason: "advance_not_found" });
    expect(mockCreateJournalEntry).not.toHaveBeenCalled();
  });

  it("duplicate link: already_posted memo idempotency — no second JE on re-run", async () => {
    alreadyPosted = true;
    const res = await postFactoringAdvanceEvent({
      operating_company_id: OPCO,
      factoring_advance_id: ADVANCE,
      actor_user_id: ACTOR,
    });
    expect(res).toMatchObject({ posted: false, reason: "already_posted" });
    expect(mockCreateJournalEntry).not.toHaveBeenCalled();
  });

  it("wrong entity: cross-entity / tenant isolation — other opco cannot load the advance", async () => {
    const res = await postFactoringCustomerPaymentEvent({
      operating_company_id: OTHER_OPCO,
      factoring_advance_id: ADVANCE,
      actor_user_id: ACTOR,
      amount_cents: 100000,
    });
    expect(res).toMatchObject({ posted: false, reason: "advance_not_found" });
    expect(mockCreateJournalEntry).not.toHaveBeenCalled();
  });

  it("unbalanced / wrong account: funding_figures_invalid fail-closed; resolveRoleAccount throw blocks post", async () => {
    await expect(
      postFactoringAdvanceEvent({
        operating_company_id: OPCO,
        factoring_advance_id: ADVANCE,
        actor_user_id: ACTOR,
        funding_figures: {
          invoice_total_cents: 10000,
          reserve_cents: 8000,
          fee_cents: 5000,
          ach_cents: 0,
        },
      })
    ).rejects.toThrow(/factoring_funding_figures_invalid/);

    installDefaults();
    mockResolveRoleAccount.mockRejectedValue(new Error("role_unmapped:ar_control"));
    await expect(
      postFactoringCustomerPaymentEvent({
        operating_company_id: OPCO,
        factoring_advance_id: ADVANCE,
        actor_user_id: ACTOR,
        amount_cents: 100000,
      })
    ).rejects.toThrow(/role_unmapped/);
    expect(mockCreateJournalEntry).not.toHaveBeenCalled();
  });

  it("chargeback: balanced repay + recoursed AR relief; invoices factored", async () => {
    const res = await postFactoringChargebackEvent({
      operating_company_id: OPCO,
      factoring_advance_id: ADVANCE,
      actor_user_id: ACTOR,
      chargeback_amount_cents: 100000,
      default_interest_cents: 0,
      recoursed_ar_cents: 100000,
    });
    expect(res.posted).toBe(true);
    expect(mockCreateJournalEntry.mock.calls.length).toBeGreaterThanOrEqual(2);

    const repay = postingsFromCall(0);
    assertBalanced(repay);
    expect(leg(repay, "acct-factoring_advance_liability")).toMatchObject({
      debit_or_credit: "debit",
      amount_cents: 100000,
    });
    expect(leg(repay, "acct-cash_clearing")).toMatchObject({
      debit_or_credit: "credit",
      amount_cents: 100000,
    });

    const returned = postingsFromCall(1);
    assertBalanced(returned);
    expect(leg(returned, "acct-factoring_recoursed_ar")).toMatchObject({
      debit_or_credit: "debit",
      amount_cents: 100000,
    });
    expect(leg(returned, "acct-ar_control")).toMatchObject({
      debit_or_credit: "credit",
      amount_cents: 100000,
    });
    expect(updateCalls.some((c) => c.sql.includes("'factored'"))).toBe(true);
  });

  it("voided: voided invoices are skipped by customer-payment subledger relief", async () => {
    invoiceRows = [VOIDED_INVOICE, INVOICE];
    const res = await postFactoringCustomerPaymentEvent({
      operating_company_id: OPCO,
      factoring_advance_id: ADVANCE,
      actor_user_id: ACTOR,
      amount_cents: 100000,
    });
    expect(res.posted).toBe(true);
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].values[0]).toBe(INVOICE.id);
    expect(updateCalls[0].values[1]).toBe(100000);
  });

  it("flag OFF default path: no JE when FACTORING_GL_POSTING_ENABLED is disabled", async () => {
    mockIsEnabled.mockResolvedValue(false);
    const res = await postFactoringReleaseEvent({
      operating_company_id: OPCO,
      factoring_advance_id: ADVANCE,
      actor_user_id: ACTOR,
      release_amount_cents: 8000,
    });
    expect(res).toMatchObject({ posted: false, reason: "flag_off" });
    expect(mockCreateJournalEntry).not.toHaveBeenCalled();
  });

  it("parseFeatureFlagDefaultEnabled: INSERT-scoped — comments/SELECT/unrelated/multi-row/column-order", async () => {
    const mod = await import("../../../../../../scripts/verify-chain-06-invoice-ar-chain-proof.mjs");
    const { parseFeatureFlagDefaultEnabled } = mod;
    const FLAG_I = "INVOICE_AR_GL_POSTING_ENABLED";
    const FLAG_F = "FACTORING_GL_POSTING_ENABLED";

    // Comments claiming false must not mask a real INSERT true.
    expect(
      parseFeatureFlagDefaultEnabled(
        `-- default_enabled false\n/* false */\nINSERT INTO lib.feature_flags (flag_key, description, default_enabled)\nVALUES ('${FLAG_F}', 'x', true);`,
        FLAG_F
      )
    ).toBe(true);

    // SELECT decoy false before real lib.feature_flags INSERT true → true (decoy cannot win).
    expect(
      parseFeatureFlagDefaultEnabled(
        `SELECT '${FLAG_I}','decoy',false;\nINSERT INTO lib.feature_flags (flag_key, description, default_enabled)\nVALUES ('${FLAG_I}', 'planted', true);`,
        FLAG_I
      )
    ).toBe(true);
    expect(
      parseFeatureFlagDefaultEnabled(
        `SELECT '${FLAG_F}','decoy',false;\nINSERT INTO lib.feature_flags (flag_key, description, default_enabled)\nVALUES ('${FLAG_F}', 'planted', true);`,
        FLAG_F
      )
    ).toBe(true);

    // Unrelated-table INSERT false does not bind; absent lib.feature_flags → null.
    expect(
      parseFeatureFlagDefaultEnabled(
        `INSERT INTO other.feature_flags (flag_key, description, default_enabled)\nVALUES ('${FLAG_I}', 'wrong table', false);`,
        FLAG_I
      )
    ).toBeNull();
    // Unrelated false must not mask a later real INSERT true.
    expect(
      parseFeatureFlagDefaultEnabled(
        `INSERT INTO staging.flags (flag_key, description, default_enabled)\nVALUES ('${FLAG_I}', 'decoy', false);\nINSERT INTO lib.feature_flags (flag_key, description, default_enabled)\nVALUES ('${FLAG_I}', 'real', true);`,
        FLAG_I
      )
    ).toBe(true);

    // Multi-row VALUES: bind the matching flag_key tuple (not a sibling false).
    expect(
      parseFeatureFlagDefaultEnabled(
        `INSERT INTO lib.feature_flags (flag_key, description, default_enabled)\nVALUES\n  ('OTHER_FLAG', 'sibling', false),\n  ('${FLAG_F}', 'target', true),\n  ('YET_ANOTHER', 'tail', false);`,
        FLAG_F
      )
    ).toBe(true);
    expect(
      parseFeatureFlagDefaultEnabled(
        `INSERT INTO lib.feature_flags (flag_key, description, default_enabled)\nVALUES\n  ('${FLAG_I}', 'off', false),\n  ('OTHER_FLAG', 'on', true);`,
        FLAG_I
      )
    ).toBe(false);

    // Explicit column order: default_enabled before flag_key.
    expect(
      parseFeatureFlagDefaultEnabled(
        `INSERT INTO lib.feature_flags (default_enabled, flag_key, description)\nVALUES (true, '${FLAG_I}', 'reordered');`,
        FLAG_I
      )
    ).toBe(true);
    expect(
      parseFeatureFlagDefaultEnabled(
        `INSERT INTO lib.feature_flags (default_enabled, description, flag_key)\nVALUES (false, 'reordered off', '${FLAG_F}');`,
        FLAG_F
      )
    ).toBe(false);

    // Canonical OFF seed still parses false.
    expect(
      parseFeatureFlagDefaultEnabled(
        `INSERT INTO lib.feature_flags (flag_key, description, default_enabled)\nVALUES ('${FLAG_I}', 'x', false);`,
        FLAG_I
      )
    ).toBe(false);
  });

  it("planted guard failure: executable --selftest + collectFailures plant every critical code", async () => {
    const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../../../");
    const selftest = spawnSync(
      process.execPath,
      ["scripts/verify-chain-06-invoice-ar-chain-proof.mjs", "--selftest"],
      { cwd: repoRoot, encoding: "utf8" }
    );
    expect(selftest.status, selftest.stderr || selftest.stdout).toBe(0);
    expect(selftest.stdout).toMatch(/--selftest PASS/);

    const mod = await import("../../../../../../scripts/verify-chain-06-invoice-ar-chain-proof.mjs");
    const { collectFailures, parseFeatureFlagDefaultEnabled, CRITICAL_PLANTED_VIOLATIONS } = mod;

    // Selftest plant shape: SELECT decoy false MUST NOT mask INSERT true for either money flag.
    const badSqlTrue = `
SELECT 'INVOICE_AR_GL_POSTING_ENABLED','decoy',false;
INSERT INTO lib.feature_flags (flag_key, description, default_enabled)
VALUES ('INVOICE_AR_GL_POSTING_ENABLED', 'planted', true);
`;
    const badSqlFactorTrue = `
SELECT 'FACTORING_GL_POSTING_ENABLED','decoy',false;
INSERT INTO lib.feature_flags (flag_key, description, default_enabled)
VALUES ('FACTORING_GL_POSTING_ENABLED', 'planted', true);
`;
    expect(parseFeatureFlagDefaultEnabled(badSqlTrue, "INVOICE_AR_GL_POSTING_ENABLED")).toBe(true);
    expect(parseFeatureFlagDefaultEnabled(badSqlFactorTrue, "FACTORING_GL_POSTING_ENABLED")).toBe(true);

    const planted = collectFailures({
      poster: `
export async function postFactoringAdvanceEvent() {
  const arAccountId = await resolveRoleAccount(client, opco, "ar_control");
}
export async function postFactoringCustomerPaymentEvent() {
  const liabilityAccountId = await resolveRoleAccount(client, opco, "factoring_advance_liability");
  await createJournalEntry({ postings });
}
export async function postFactoringReleaseEvent() {
  await createJournalEntry({ postings });
}
export async function postFactoringChargebackEvent() {
  await createJournalEntry({ postings });
}
`,
      postingEngine: `async function buildInvoiceLines() {}`,
      postingRoutes: ``,
      journalEntries: ``,
      featureFlags: `FACTORING_GL_POSTING_ENABLED\nINVOICE_AR_GL_POSTING_ENABLED`,
      factoringRoutes: ``,
      invoicesRoutes: ``,
      invoiceArFlagMigration: badSqlTrue,
      factoringFlagMigration: badSqlFactorTrue,
      arSubledgerGuard: ``,
      tieoutGuard: `legB_fundingTouchesAr\nlegC_liabilityRoundTrip`,
      securedBorrowingGuard: ``,
      chainProofTest: ``,
      tieoutDbTest: `Leg B\nLeg C`,
      invoiceKillswitchDbTest: `INVOICE_AR_GL_POSTING_ENABLED`,
    });

    for (const code of CRITICAL_PLANTED_VIOLATIONS) {
      expect(planted, `missing planted violation ${code}`).toEqual(expect.arrayContaining([code]));
    }
    // Explicit default-ON codes for both money flags (SELECT decoy must not suppress).
    expect(planted).toEqual(expect.arrayContaining([
      "invoice_ar_flag_default_enabled_true",
      "invoice_ar_flag_must_default_off",
      "factoring_flag_default_enabled_true",
      "factoring_flag_must_default_off",
    ]));
  });
});
