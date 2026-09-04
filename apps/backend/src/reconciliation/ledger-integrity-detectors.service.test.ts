import { describe, expect, it } from "vitest";
import {
  checkAskMyAccountantForCompany,
  checkDriverCashAdvanceTieOutForCompany,
  checkExpenseNoGlDeltaForCompany,
  checkExtendedSubledgerTieOutForCompany,
  checkFutureDatedEntriesForCompany,
  checkMinimumPostingLinesForCompany,
  checkNoGlDeltaForCompany,
  checkOrphanPostingsForCompany,
  checkPerEntryBalanceForCompany,
  checkReversalIntegrityForCompany,
  checkSampleDataFlagExplicitForCompany,
  checkSubledgerTieOutForCompany,
  checkTestNamedAccountForCompany,
  checkVoidMetadataCompletenessForCompany,
  checkVoidReversalIntegrityForCompany,
  runLedgerIntegrityTick,
} from "./ledger-integrity-detectors.service.js";

const COMPANY = "5c854333-6ea5-4faa-af31-67cb272fef80";
const AR_ACCOUNT = "11f4641f-6d83-4958-9f8b-0de94c107a70";
const AP_ACCOUNT = "34d5f1f7-385f-450c-b324-927fff09d31f";
const ASK_ACCOUNT = "c6f629ab-0c65-4aa1-a798-9c77e62a06d2";

type Call = { sql: string; values?: unknown[] };

// Role- and account-aware mock: routes each query by SQL shape AND bind values, so the AR leg and the
// AP leg of checkSubledgerTieOutForCompany (which both hit chart_of_accounts_roles /
// journal_entry_postings, just with different bind values) never accidentally answer each other's query.
function makeClient(opts: {
  controlAccounts?: Partial<Record<"ar_control" | "ap_control", string>>;
  glCentsByAccount?: Record<string, string>;
  arSubCents?: string;
  apSubCents?: string;
  askAccounts?: Array<{ account_id: string; account_number: string; account_name: string }>;
  openFindingId?: string | null;
  unbalanced?: { count: number; ids: string[] };
  noGlDeltaInvoices?: { count: number; ids: string[] };
  noGlDeltaBills?: { count: number; ids: string[] };
  futureDated?: { count: number; furthest: string | null; ids: string[] };
  voidedInPlace?: { count: number; ids: string[] };
  brokenReversalPointers?: { count: number; ids: string[] };
}) {
  const calls: Call[] = [];
  const controlAccounts = opts.controlAccounts ?? {};
  const glCentsByAccount = opts.glCentsByAccount ?? {};
  return {
    calls,
    async query(sql: string, values?: unknown[]) {
      calls.push({ sql, values });

      if (sql.includes("WITH je AS") && sql.includes("FROM accounting.journal_entries j")) {
        const unbalanced = opts.unbalanced ?? { count: 0, ids: [] };
        return { rows: [{ unbalanced_count: String(unbalanced.count), unbalanced_ids: unbalanced.ids }] };
      }
      if (sql.includes("FROM accounting.invoices i") && sql.includes("NOT EXISTS")) {
        const d = opts.noGlDeltaInvoices ?? { count: 0, ids: [] };
        return { rows: [{ count: String(d.count), ids: d.ids }] };
      }
      if (sql.includes("FROM accounting.bills b") && sql.includes("NOT EXISTS")) {
        const d = opts.noGlDeltaBills ?? { count: 0, ids: [] };
        return { rows: [{ count: String(d.count), ids: d.ids }] };
      }
      if (sql.includes("entry_date > CURRENT_DATE")) {
        const d = opts.futureDated ?? { count: 0, furthest: null, ids: [] };
        return { rows: [{ count: String(d.count), furthest: d.furthest, ids: d.ids }] };
      }
      if (sql.includes("voided_at IS NOT NULL")) {
        const d = opts.voidedInPlace ?? { count: 0, ids: [] };
        return { rows: [{ count: String(d.count), ids: d.ids }] };
      }
      if (sql.includes("rb.reverses_je_id IS DISTINCT FROM je.id")) {
        const d = opts.brokenReversalPointers ?? { count: 0, ids: [] };
        return { rows: [{ count: String(d.count), ids: d.ids }] };
      }
      if (sql.includes("FROM accounting.chart_of_accounts_roles")) {
        const role = values?.[1] as "ar_control" | "ap_control" | undefined;
        const accountId = role ? controlAccounts[role] : undefined;
        return { rows: accountId ? [{ account_id: accountId }] : [] };
      }
      if (sql.includes("system_purpose = 'ask_my_accountant'")) {
        return { rows: opts.askAccounts ?? [] };
      }
      if (sql.includes("FROM catalogs.account_role_bindings") || sql.includes("FROM catalogs.accounts")) {
        return { rows: [] }; // legacy binding / subtype fallback — not exercised by these tests
      }
      if (sql.includes("FROM accounting.journal_entry_postings")) {
        const accountId = values?.[1] as string | undefined;
        const cents = accountId ? glCentsByAccount[accountId] : undefined;
        return { rows: [{ cents: cents ?? "0" }] };
      }
      if (sql.includes("FROM accounting.invoices")) {
        return { rows: [{ cents: opts.arSubCents ?? "0" }] };
      }
      if (sql.includes("FROM accounting.bills")) {
        return { rows: [{ cents: opts.apSubCents ?? "0" }] };
      }
      if (sql.includes("SELECT id::text") && sql.includes("FROM _system.reconciliation_findings")) {
        return { rows: opts.openFindingId ? [{ id: opts.openFindingId }] : [] };
      }
      return { rows: [] };
    },
  };
}

describe("ledger-integrity-detectors.service — INV-3 subledger tie-out", () => {
  it("files a subledger_tie_out_diff finding for AR when GL and open-invoice subledger disagree", async () => {
    const client = makeClient({
      controlAccounts: { ar_control: AR_ACCOUNT },
      glCentsByAccount: { [AR_ACCOUNT]: "500000" },
      arSubCents: "300000",
    });

    await checkSubledgerTieOutForCompany(client as never, COMPANY, "run-1");

    const inserts = client.calls.filter((c) => c.sql.includes("INSERT INTO _system.reconciliation_findings"));
    expect(inserts).toHaveLength(1); // AP control never resolves (no mapping) — that leg is skipped entirely
    const [, findingType, severity] = inserts[0].values as [string, string, string, ...unknown[]];
    expect(findingType).toBe("subledger_tie_out_diff");
    expect(severity).toBe("critical");
    const localValue = JSON.parse((inserts[0].values as unknown[])[5] as string);
    expect(localValue).toMatchObject({ ledger: "ar", gl_cents: 500000, subledger_cents: 300000, diff_cents: 200000 });
  });

  it("files a subledger_tie_out_diff finding for AP when GL and open-bill subledger disagree", async () => {
    const client = makeClient({
      controlAccounts: { ap_control: AP_ACCOUNT },
      glCentsByAccount: { [AP_ACCOUNT]: "209500" },
      apSubCents: "182000",
    });

    await checkSubledgerTieOutForCompany(client as never, COMPANY, "run-1");

    const inserts = client.calls.filter((c) => c.sql.includes("INSERT INTO _system.reconciliation_findings"));
    expect(inserts).toHaveLength(1);
    const localValue = JSON.parse((inserts[0].values as unknown[])[5] as string);
    expect(localValue).toMatchObject({ ledger: "ap", gl_cents: 209500, subledger_cents: 182000, diff_cents: 27500 });
  });

  it("auto-resolves an open AR tie-out finding once GL and subledger agree", async () => {
    const client = makeClient({
      controlAccounts: { ar_control: AR_ACCOUNT },
      glCentsByAccount: { [AR_ACCOUNT]: "300000" },
      arSubCents: "300000",
      openFindingId: "finding-1",
    });

    await checkSubledgerTieOutForCompany(client as never, COMPANY, "run-1");

    expect(client.calls.some((c) => c.sql.includes("INSERT INTO _system.reconciliation_findings"))).toBe(false);
    const resolveCall = client.calls.find((c) => c.sql.includes("status = 'resolved'"));
    expect(resolveCall).toBeDefined();
    expect(resolveCall!.values).toEqual(["finding-1"]);
  });

  it("skips both legs when neither control account can be resolved (never claims a false zero diff)", async () => {
    const client = makeClient({});

    await checkSubledgerTieOutForCompany(client as never, COMPANY, "run-1");

    expect(client.calls.some((c) => c.sql.includes("INSERT INTO _system.reconciliation_findings"))).toBe(false);
    expect(client.calls.some((c) => c.sql.includes("FROM accounting.journal_entry_postings"))).toBe(false);
  });
});

describe("ledger-integrity-detectors.service — 9000 Ask My Accountant suspense", () => {
  it("files an ask_my_accountant_suspense_nonzero finding when the real (non-sample) net balance is nonzero", async () => {
    const client = makeClient({
      askAccounts: [{ account_id: ASK_ACCOUNT, account_number: "9000", account_name: "Ask My Accountant" }],
      glCentsByAccount: { [ASK_ACCOUNT]: "121000" },
    });

    await checkAskMyAccountantForCompany(client as never, COMPANY, "run-1");

    const insert = client.calls.find((c) => c.sql.includes("INSERT INTO _system.reconciliation_findings"));
    expect(insert).toBeDefined();
    const values = insert!.values as unknown[];
    expect(values[1]).toBe("ask_my_accountant_suspense_nonzero");
    expect(values[2]).toBe("important");
    expect(JSON.parse(values[5] as string)).toMatchObject({ net_cents: 121000 });
  });

  it("auto-resolves an open suspense finding once the 9000 balance nets to zero", async () => {
    const client = makeClient({
      askAccounts: [{ account_id: ASK_ACCOUNT, account_number: "9000", account_name: "Ask My Accountant" }],
      glCentsByAccount: { [ASK_ACCOUNT]: "0" },
      openFindingId: "finding-2",
    });

    await checkAskMyAccountantForCompany(client as never, COMPANY, "run-1");

    expect(client.calls.some((c) => c.sql.includes("INSERT INTO _system.reconciliation_findings"))).toBe(false);
    const resolveCall = client.calls.find((c) => c.sql.includes("status = 'resolved'"));
    expect(resolveCall).toBeDefined();
    expect(resolveCall!.values).toEqual(["finding-2"]);
  });

  it("does nothing for a company that never seeded a 9000 anchor account", async () => {
    const client = makeClient({ askAccounts: [] });

    await checkAskMyAccountantForCompany(client as never, COMPANY, "run-1");

    expect(client.calls.some((c) => c.sql.includes("FROM accounting.journal_entry_postings"))).toBe(false);
    expect(client.calls.some((c) => c.sql.includes("INSERT"))).toBe(false);
  });
});

describe("ledger-integrity-detectors.service — INV-2 per-entry balance", () => {
  it("files a single aggregate unbalanced_journal_entry finding when any real entry does not balance", async () => {
    const client = makeClient({ unbalanced: { count: 2, ids: ["je-1", "je-2"] } });

    await checkPerEntryBalanceForCompany(client as never, COMPANY, "run-1");

    const inserts = client.calls.filter((c) => c.sql.includes("INSERT INTO _system.reconciliation_findings"));
    expect(inserts).toHaveLength(1);
    const values = inserts[0].values as unknown[];
    expect(values[1]).toBe("unbalanced_journal_entry");
    expect(values[2]).toBe("critical");
    expect(JSON.parse(values[5] as string)).toMatchObject({
      unbalanced_count: 2,
      sample_journal_entry_ids: ["je-1", "je-2"],
    });
  });

  it("auto-resolves an open unbalanced-entry finding once every real entry balances again", async () => {
    const client = makeClient({ unbalanced: { count: 0, ids: [] }, openFindingId: "finding-3" });

    await checkPerEntryBalanceForCompany(client as never, COMPANY, "run-1");

    expect(client.calls.some((c) => c.sql.includes("INSERT INTO _system.reconciliation_findings"))).toBe(false);
    const resolveCall = client.calls.find((c) => c.sql.includes("status = 'resolved'"));
    expect(resolveCall).toBeDefined();
    expect(resolveCall!.values).toEqual(["finding-3"]);
  });

  it("does nothing when there is nothing open and nothing unbalanced (the expected steady state)", async () => {
    const client = makeClient({ unbalanced: { count: 0, ids: [] } });

    await checkPerEntryBalanceForCompany(client as never, COMPANY, "run-1");

    expect(client.calls.some((c) => c.sql.includes("INSERT"))).toBe(false);
    expect(client.calls.some((c) => c.sql.includes("UPDATE"))).toBe(false);
  });
});

describe("ledger-integrity-detectors.service — INV-4 documents with no GL delta", () => {
  it("files a document_no_gl_delta finding for TMS-native invoices with zero postings", async () => {
    const client = makeClient({ noGlDeltaInvoices: { count: 3, ids: ["inv-1", "inv-2", "inv-3"] } });

    await checkNoGlDeltaForCompany(client as never, COMPANY, "run-1");

    const inserts = client.calls.filter((c) => c.sql.includes("INSERT INTO _system.reconciliation_findings"));
    expect(inserts).toHaveLength(1); // bills leg has nothing to report
    const values = inserts[0].values as unknown[];
    expect(values[1]).toBe("document_no_gl_delta");
    expect(values[2]).toBe("critical");
    expect(JSON.parse(values[5] as string)).toMatchObject({
      document_type: "invoice",
      count: 3,
      sample_ids: ["inv-1", "inv-2", "inv-3"],
    });
  });

  it("files a document_no_gl_delta finding for TMS-native bills with zero postings", async () => {
    const client = makeClient({ noGlDeltaBills: { count: 2, ids: ["bill-1", "bill-2"] } });

    await checkNoGlDeltaForCompany(client as never, COMPANY, "run-1");

    const inserts = client.calls.filter((c) => c.sql.includes("INSERT INTO _system.reconciliation_findings"));
    expect(inserts).toHaveLength(1);
    const values = inserts[0].values as unknown[];
    expect(JSON.parse(values[5] as string)).toMatchObject({
      document_type: "bill",
      count: 2,
      sample_ids: ["bill-1", "bill-2"],
    });
  });

  it("auto-resolves the invoice-leg finding once every real invoice has a posting again", async () => {
    const client = makeClient({ noGlDeltaInvoices: { count: 0, ids: [] }, openFindingId: "finding-4" });

    await checkNoGlDeltaForCompany(client as never, COMPANY, "run-1");

    expect(client.calls.some((c) => c.sql.includes("INSERT INTO _system.reconciliation_findings"))).toBe(false);
    const resolveCalls = client.calls.filter((c) => c.sql.includes("status = 'resolved'"));
    // both legs are 0 here, so both the invoice AND bill scope resolve the same stubbed open finding
    expect(resolveCalls.length).toBeGreaterThanOrEqual(1);
    expect(resolveCalls[0].values).toEqual(["finding-4"]);
  });

  it("does nothing when both legs are clean and nothing is open (the expected steady state for most classes)", async () => {
    const client = makeClient({});

    await checkNoGlDeltaForCompany(client as never, COMPANY, "run-1");

    expect(client.calls.some((c) => c.sql.includes("INSERT"))).toBe(false);
    expect(client.calls.some((c) => c.sql.includes("UPDATE"))).toBe(false);
  });
});

describe("ledger-integrity-detectors.service — INV-9 future-dated entries", () => {
  it("files a future_dated_journal_entry finding (important, not critical) when any real entry is dated ahead", async () => {
    const client = makeClient({ futureDated: { count: 2, furthest: "2027-01-01", ids: ["je-a", "je-b"] } });

    await checkFutureDatedEntriesForCompany(client as never, COMPANY, "run-1");

    const inserts = client.calls.filter((c) => c.sql.includes("INSERT INTO _system.reconciliation_findings"));
    expect(inserts).toHaveLength(1);
    const values = inserts[0].values as unknown[];
    expect(values[1]).toBe("future_dated_journal_entry");
    expect(values[2]).toBe("important");
    expect(JSON.parse(values[5] as string)).toMatchObject({
      count: 2,
      furthest_entry_date: "2027-01-01",
      sample_journal_entry_ids: ["je-a", "je-b"],
    });
  });

  it("auto-resolves an open finding once no real entry is dated ahead of today", async () => {
    const client = makeClient({ futureDated: { count: 0, furthest: null, ids: [] }, openFindingId: "finding-5" });

    await checkFutureDatedEntriesForCompany(client as never, COMPANY, "run-1");

    expect(client.calls.some((c) => c.sql.includes("INSERT INTO _system.reconciliation_findings"))).toBe(false);
    const resolveCall = client.calls.find((c) => c.sql.includes("status = 'resolved'"));
    expect(resolveCall).toBeDefined();
    expect(resolveCall!.values).toEqual(["finding-5"]);
  });

  it("does nothing in the expected steady state (nothing future-dated, nothing open)", async () => {
    const client = makeClient({});

    await checkFutureDatedEntriesForCompany(client as never, COMPANY, "run-1");

    expect(client.calls.some((c) => c.sql.includes("INSERT"))).toBe(false);
    expect(client.calls.some((c) => c.sql.includes("UPDATE"))).toBe(false);
  });
});

describe("ledger-integrity-detectors.service — INV-11 reversal symmetry", () => {
  it("files a journal_entry_voided_in_place finding when any real JE was voided instead of reversed", async () => {
    const client = makeClient({ voidedInPlace: { count: 1, ids: ["je-voided-1"] } });

    await checkReversalIntegrityForCompany(client as never, COMPANY, "run-1");

    const inserts = client.calls.filter((c) => c.sql.includes("INSERT INTO _system.reconciliation_findings"));
    expect(inserts).toHaveLength(1); // pointer leg is clean by default
    const values = inserts[0].values as unknown[];
    expect(values[1]).toBe("journal_entry_voided_in_place");
    expect(values[2]).toBe("critical");
    expect(JSON.parse(values[5] as string)).toMatchObject({ count: 1, sample_journal_entry_ids: ["je-voided-1"] });
  });

  it("files a journal_entry_reversal_pointer_broken finding when reversed_by_je_id/reverses_je_id disagree", async () => {
    const client = makeClient({ brokenReversalPointers: { count: 2, ids: ["je-a", "je-b"] } });

    await checkReversalIntegrityForCompany(client as never, COMPANY, "run-1");

    const inserts = client.calls.filter((c) => c.sql.includes("INSERT INTO _system.reconciliation_findings"));
    expect(inserts).toHaveLength(1);
    const values = inserts[0].values as unknown[];
    expect(values[1]).toBe("journal_entry_reversal_pointer_broken");
    expect(values[2]).toBe("critical");
    expect(JSON.parse(values[5] as string)).toMatchObject({ count: 2, sample_journal_entry_ids: ["je-a", "je-b"] });
  });

  it("auto-resolves both findings independently once each condition clears", async () => {
    const client = makeClient({
      voidedInPlace: { count: 0, ids: [] },
      brokenReversalPointers: { count: 0, ids: [] },
      openFindingId: "finding-6",
    });

    await checkReversalIntegrityForCompany(client as never, COMPANY, "run-1");

    expect(client.calls.some((c) => c.sql.includes("INSERT INTO _system.reconciliation_findings"))).toBe(false);
    const resolveCalls = client.calls.filter((c) => c.sql.includes("status = 'resolved'"));
    expect(resolveCalls).toHaveLength(2); // both scopes resolve the same stubbed open finding id
    for (const call of resolveCalls) expect(call.values).toEqual(["finding-6"]);
  });

  it("does nothing in the expected steady state (both checks clean, nothing open)", async () => {
    const client = makeClient({});

    await checkReversalIntegrityForCompany(client as never, COMPANY, "run-1");

    expect(client.calls.some((c) => c.sql.includes("INSERT"))).toBe(false);
    expect(client.calls.some((c) => c.sql.includes("UPDATE"))).toBe(false);
  });
});

// LAW-TRANSACTION-HEALTH-REGISTER-2026-09-01 bands A/C/F (CC-2). Each test below uses a small,
// self-contained mock client scoped to exactly the queries its own check issues, rather than
// extending the shared makeClient() above — several of these new checks share SQL substrings
// ("WITH je AS", "FROM catalogs.accounts") with the EXISTING checks tested above, and a single
// shared router risks one check's mock silently answering a different check's query.
function simpleClient(responses: Array<{ match: (sql: string, values?: unknown[]) => boolean; rows: unknown[] }>) {
  const calls: Call[] = [];
  return {
    calls,
    async query(sql: string, values?: unknown[]) {
      calls.push({ sql, values });
      for (const r of responses) {
        if (r.match(sql, values)) return { rows: r.rows };
      }
      return { rows: [] };
    },
  };
}

describe("ledger-integrity-detectors.service — A3 minimum posting lines", () => {
  it("files journal_entry_fewer_than_two_postings when a real entry has under two postings", async () => {
    const client = simpleClient([
      { match: (sql) => sql.includes("lines < 2"), rows: [{ count: "2", ids: ["je-x", "je-y"] }] },
    ]);

    await checkMinimumPostingLinesForCompany(client as never, COMPANY, "run-1");

    const insert = client.calls.find((c) => c.sql.includes("INSERT INTO _system.reconciliation_findings"));
    expect(insert).toBeDefined();
    const values = insert!.values as unknown[];
    expect(values[1]).toBe("journal_entry_fewer_than_two_postings");
    expect(JSON.parse(values[5] as string)).toMatchObject({ count: 2, sample_journal_entry_ids: ["je-x", "je-y"] });
  });

  it("does nothing when every real entry has at least two postings", async () => {
    const client = simpleClient([{ match: (sql) => sql.includes("lines < 2"), rows: [{ count: "0", ids: [] }] }]);

    await checkMinimumPostingLinesForCompany(client as never, COMPANY, "run-1");

    expect(client.calls.some((c) => c.sql.includes("INSERT"))).toBe(false);
  });
});

describe("ledger-integrity-detectors.service — A4 orphan postings", () => {
  it("files posting_orphan_or_cross_company_account when a posting's account doesn't resolve", async () => {
    const client = simpleClient([
      { match: (sql) => sql.includes("a.id IS NULL"), rows: [{ count: "1", ids: ["posting-1"] }] },
    ]);

    await checkOrphanPostingsForCompany(client as never, COMPANY, "run-1");

    const insert = client.calls.find((c) => c.sql.includes("INSERT INTO _system.reconciliation_findings"));
    expect(insert).toBeDefined();
    expect((insert!.values as unknown[])[1]).toBe("posting_orphan_or_cross_company_account");
  });
});

describe("ledger-integrity-detectors.service — A5-extend expense no-GL-delta", () => {
  it("files document_no_gl_delta for a posted expense with zero postings", async () => {
    const client = simpleClient([
      { match: (sql) => sql.includes("FROM accounting.expenses e"), rows: [{ count: "1", ids: ["exp-1"] }] },
    ]);

    await checkExpenseNoGlDeltaForCompany(client as never, COMPANY, "run-1");

    const insert = client.calls.find((c) => c.sql.includes("INSERT INTO _system.reconciliation_findings"));
    const values = insert!.values as unknown[];
    expect(JSON.parse(values[5] as string)).toMatchObject({ document_type: "expense", count: 1, sample_ids: ["exp-1"] });
  });
});

describe("ledger-integrity-detectors.service — C1+C5 voided document reversal integrity", () => {
  it("files voided_document_reversal_broken when a voided invoice's original JE has no reversal", async () => {
    const client = simpleClient([
      {
        match: (sql, values) => sql.includes("reversal_check") && values?.[1] === "invoice",
        rows: [{ doc_id: "inv-1", missing_reversal: true, mismatched_cents: "31390" }],
      },
      { match: (sql, values) => sql.includes("reversal_check") && values?.[1] === "bill", rows: [] },
    ]);

    await checkVoidReversalIntegrityForCompany(client as never, COMPANY, "run-1");

    const inserts = client.calls.filter((c) => c.sql.includes("INSERT INTO _system.reconciliation_findings"));
    expect(inserts).toHaveLength(1); // bill leg is clean
    const values = inserts[0].values as unknown[];
    expect(values[1]).toBe("voided_document_reversal_broken");
    expect(JSON.parse(values[5] as string)).toMatchObject({
      document_type: "invoice",
      missing_reversal_count: 1,
      sample_missing_reversal_ids: ["inv-1"],
    });
  });

  it("does nothing for either document type when nothing is broken", async () => {
    const client = simpleClient([{ match: (sql) => sql.includes("reversal_check"), rows: [] }]);

    await checkVoidReversalIntegrityForCompany(client as never, COMPANY, "run-1");

    expect(client.calls.some((c) => c.sql.includes("INSERT"))).toBe(false);
  });
});

describe("ledger-integrity-detectors.service — C2 void metadata completeness", () => {
  it("files void_metadata_incomplete for a voided invoice with an empty void_reason", async () => {
    const client = simpleClient([
      { match: (sql) => sql.includes("void_reason IS NULL"), rows: [{ count: "1", ids: ["inv-2"] }] },
      { match: (sql) => sql.includes("revoked_reason IS NULL"), rows: [{ count: "0", ids: [] }] },
    ]);

    await checkVoidMetadataCompletenessForCompany(client as never, COMPANY, "run-1");

    const inserts = client.calls.filter((c) => c.sql.includes("INSERT INTO _system.reconciliation_findings"));
    expect(inserts).toHaveLength(1);
    expect(JSON.parse((inserts[0].values as unknown[])[5] as string)).toMatchObject({
      document_type: "invoice",
      count: 1,
    });
  });

  it("files void_metadata_incomplete for a revoked bill missing revoked_by_user_id (the C4 mixed-convention shape)", async () => {
    const client = simpleClient([
      { match: (sql) => sql.includes("void_reason IS NULL"), rows: [{ count: "0", ids: [] }] },
      { match: (sql) => sql.includes("revoked_reason IS NULL"), rows: [{ count: "1", ids: ["bill-1"] }] },
    ]);

    await checkVoidMetadataCompletenessForCompany(client as never, COMPANY, "run-1");

    const inserts = client.calls.filter((c) => c.sql.includes("INSERT INTO _system.reconciliation_findings"));
    expect(inserts).toHaveLength(1);
    expect(JSON.parse((inserts[0].values as unknown[])[5] as string)).toMatchObject({ document_type: "bill", count: 1 });
  });
});

describe("ledger-integrity-detectors.service — F1 test-shaped-but-unflagged documents (F-BAND rewrite)", () => {
  it("files is_sample_data_not_explicit per document type independently, by NAME not by IS NULL", async () => {
    const client = simpleClient([
      {
        match: (sql) => sql.includes("accounting.invoices") && sql.includes("is_sample_data, false) = false"),
        rows: [{ id: "inv-1", text: "regular customer invoice notes" }],
      },
      {
        match: (sql) => sql.includes("accounting.bills") && sql.includes("is_sample_data, false) = false"),
        rows: [{ id: "bill-1", text: "regular vendor bill memo" }],
      },
      {
        match: (sql) => sql.includes("accounting.expenses") && sql.includes("is_sample_data, false) = false"),
        rows: [
          { id: "exp-a", text: "TEST DATA launch-16 GO-1640 do not void" },
          { id: "exp-b", text: "regular fuel expense" },
        ],
      },
    ]);

    await checkSampleDataFlagExplicitForCompany(client as never, COMPANY, "run-1");

    const inserts = client.calls.filter((c) => c.sql.includes("INSERT INTO _system.reconciliation_findings"));
    expect(inserts).toHaveLength(1); // only the expense leg has a test-shaped, unflagged row
    expect(JSON.parse((inserts[0].values as unknown[])[5] as string)).toMatchObject({
      document_type: "expense",
      count: 1,
      sample_ids: ["exp-a"],
    });
  });

  it("never fires on IS NULL alone (the bug this rewrite fixed: zero NULLs exist anywhere per the F-BAND sweep)", async () => {
    const client = simpleClient([
      { match: (sql) => sql.includes("is_sample_data, false) = false"), rows: [{ id: "x", text: "ordinary real record" }] },
    ]);

    await checkSampleDataFlagExplicitForCompany(client as never, COMPANY, "run-1");

    expect(client.calls.some((c) => c.sql.includes("IS NULL"))).toBe(false);
    expect(client.calls.some((c) => c.sql.includes("INSERT"))).toBe(false);
  });
});

describe("ledger-integrity-detectors.service — F2 test-named master data (F-BAND rewrite, multi-table)", () => {
  it("files test_named_account_in_coa for accounts matching the broadened test-name shape", async () => {
    const client = simpleClient([
      {
        match: (sql) => sql.includes("FROM catalogs.accounts"),
        rows: [
          { id: "acct-1", number_val: "2100-00-012", name_val: "CODEX FLEET TEST 20260821 — Driver Escrow" },
          { id: "acct-2", number_val: "9901", name_val: "ZZ-SAMPLE A USMCA_GATEB_SAMPLE_2026-08-07" },
          { id: "acct-3", number_val: "1000", name_val: "Bank of America - Operating (USMCA)" },
        ],
      },
    ]);

    await checkTestNamedAccountForCompany(client as never, COMPANY, "run-1");

    const insert = client.calls.find((c) => c.sql.includes("INSERT INTO _system.reconciliation_findings"));
    const values = insert!.values as unknown[];
    const local = JSON.parse(values[5] as string);
    expect(local.record_type).toBe("account");
    expect(local.count).toBe(2); // the real bank account must NOT be flagged; ZZ-SAMPLE now IS caught
    expect(local.sample_records.map((r: { id: string }) => r.id)).toEqual(["acct-1", "acct-2"]);
  });

  it("excludes the confirmed false positive: a real vendor account with 'Drug Test' in its name", async () => {
    const client = simpleClient([
      {
        match: (sql) => sql.includes("FROM catalogs.accounts"),
        rows: [{ id: "acct-real", number_val: "QBO-1150040105", name_val: "Antidoping-Drug Test Services" }],
      },
    ]);

    await checkTestNamedAccountForCompany(client as never, COMPANY, "run-1");

    expect(client.calls.some((c) => c.sql.includes("INSERT"))).toBe(false);
  });

  it("scans drivers/customers/vendors/units too, independently of accounts", async () => {
    const client = simpleClient([
      { match: (sql) => sql.includes("FROM catalogs.accounts"), rows: [] },
      {
        match: (sql) => sql.includes("FROM mdata.drivers"),
        rows: [{ id: "drv-1", number_val: null, name_val: "TEST CODEX ONBOARD 20260824" }],
      },
      { match: (sql) => sql.includes("FROM mdata.customers"), rows: [] },
      {
        match: (sql) => sql.includes("FROM mdata.vendors"),
        rows: [{ id: "vnd-1", number_val: null, name_val: "TEST-VOID-LATER Vendor 0822" }],
      },
      { match: (sql) => sql.includes("FROM mdata.units"), rows: [] },
    ]);

    await checkTestNamedAccountForCompany(client as never, COMPANY, "run-1");

    const inserts = client.calls.filter((c) => c.sql.includes("INSERT INTO _system.reconciliation_findings"));
    expect(inserts).toHaveLength(2); // drivers + vendors leg; accounts/customers/units are clean
    const recordTypes = inserts.map((i) => JSON.parse((i.values as unknown[])[5] as string).record_type).sort();
    expect(recordTypes).toEqual(["driver", "vendor"]);
  });

  it("does not false-positive on a real account name with no test-shaped substring", async () => {
    const client = simpleClient([
      {
        match: (sql) => sql.includes("FROM catalogs.accounts"),
        rows: [{ id: "acct-1", number_val: "1100", name_val: "Accounts Receivable (A/R)" }],
      },
    ]);

    await checkTestNamedAccountForCompany(client as never, COMPANY, "run-1");

    expect(client.calls.some((c) => c.sql.includes("INSERT"))).toBe(false);
  });
});

describe("ledger-integrity-detectors.service — B6 driver cash advance tie-out (multi-account)", () => {
  it("files subledger_tie_out_diff summing GL across every per-driver control account", async () => {
    const client = simpleClient([
      {
        match: (sql) => sql.includes("driver_advance_accounts"),
        rows: [{ account_id: "drv-acct-1" }, { account_id: "drv-acct-2" }],
      },
      {
        match: (sql) => sql.includes("fn_account_balances_as_of") && sql.includes("closing_balance_cents"),
        rows: [{ closing_balance_cents: "10000", normal_balance: "debit" }],
      },
      {
        match: (sql) => sql.includes("driver_finance.driver_advances") && sql.includes("outstanding_balance"),
        rows: [{ cents: "15000" }],
      },
    ]);

    await checkDriverCashAdvanceTieOutForCompany(client as never, COMPANY, "run-1");

    const insert = client.calls.find((c) => c.sql.includes("INSERT INTO _system.reconciliation_findings"));
    const values = insert!.values as unknown[];
    // gl = 10000 + 10000 (both accounts stubbed identically) = 20000; sub = 15000; diff = 5000
    expect(JSON.parse(values[5] as string)).toMatchObject({ ledger: "driver_cash_advance", gl_cents: 20000, subledger_cents: 15000, diff_cents: 5000 });
  });

  it("does nothing when no company has any per-driver cash-advance account bound yet", async () => {
    const client = simpleClient([{ match: (sql) => sql.includes("driver_advance_accounts"), rows: [] }]);

    await checkDriverCashAdvanceTieOutForCompany(client as never, COMPANY, "run-1");

    expect(client.calls.some((c) => c.sql.includes("INSERT"))).toBe(false);
  });
});

describe("ledger-integrity-detectors.service — extended B3/B4/B7/B8 subledger tie-out", () => {
  it("skips a role entirely when its control account is unbound (never claims a false $0 tie)", async () => {
    const client = simpleClient([{ match: (sql) => sql.includes("FROM accounting.chart_of_accounts_roles"), rows: [] }]);

    await checkExtendedSubledgerTieOutForCompany(client as never, COMPANY, "run-1");

    expect(client.calls.some((c) => c.sql.includes("INSERT"))).toBe(false);
    expect(client.calls.some((c) => c.sql.includes("fn_account_balances_as_of"))).toBe(false);
  });

  // SUBLEDGER-GL-TIEOUT-EVERY-CONTROL (board-routed CC-2, 2026-09-01) — escrow_liability_default
  // and factoring_advance_liability were newly added to EXTENDED_TIE_OUT_ROLES; the explicit
  // per-role dispatch this test proves replaces an implicit trailing `else` that would otherwise
  // silently reuse sumFixedAssetNetBookValueSubledgerCents for an escrow role and manufacture a
  // wrong tie-out. Only the escrow role is bound here (all others resolve unbound and are skipped,
  // same as the test above), isolating exactly the new dispatch branch.
  it("dispatches escrow_liability_default to sumEscrowSubledgerCents, not the fixed-asset default", async () => {
    const client = simpleClient([
      {
        match: (sql, values) => sql.includes("FROM accounting.chart_of_accounts_roles") && !!values?.includes("escrow_liability_default"),
        rows: [{ account_id: "escrow-control-acct" }],
      },
      { match: (sql) => sql.includes("FROM accounting.chart_of_accounts_roles"), rows: [] },
      {
        match: (sql) => sql.includes("fn_account_balances_as_of") && sql.includes("closing_balance_cents"),
        rows: [{ closing_balance_cents: "5000", normal_balance: "credit" }],
      },
      { match: (sql) => sql.includes("FROM accounting.escrow_accounts"), rows: [{ total_cents: "5000" }] },
    ]);

    await checkExtendedSubledgerTieOutForCompany(client as never, COMPANY, "run-1");

    // Asserts the escrow-specific query fired at all — the property this test exists to prove
    // (correct role -> function dispatch). GL/subledger sign-normalization and tie-out arithmetic
    // are already covered by loadControlBalanceCents' own tests elsewhere; not re-asserted here.
    expect(client.calls.some((c) => c.sql.includes("FROM accounting.escrow_accounts"))).toBe(true);
  });
});

// ACC-19 (2026-09-04) — LIVE-CONFIRMED: _system.background_jobs.ledger.integrity_cron has been
// failing every tick since before 2026-09-01 (last_successful_run_at stuck there;
// last_failed_run_at as recent as this fix, same error every time: "current transaction is
// aborted, commands ignored until end of transaction block"). runLedgerIntegrityTick runs every
// company and every detector inside ONE transaction (withLuciaBypass does a single BEGIN...COMMIT
// around the whole tick); a caught JS exception from one detector's query does NOT reset Postgres's
// own aborted-transaction state, so every later client.query() on the same client — every
// remaining detector, for every remaining company — was itself throwing "transaction aborted" and
// being silently swallowed by the very isolation try/catch meant to contain the damage. This test
// proves the fix: a real per-detector SAVEPOINT / ROLLBACK TO SAVEPOINT / RELEASE SAVEPOINT lets
// the NEXT detector on the same client run to completion after an earlier one throws.
describe("ledger-integrity-detectors.service — ACC-19 SAVEPOINT isolation (transaction-poisoning fix)", () => {
  it("recovers via ROLLBACK TO SAVEPOINT so a later detector still runs after an earlier one throws", async () => {
    const calls: Call[] = [];
    const client = {
      calls,
      async query(sql: string, values?: unknown[]) {
        calls.push({ sql, values });
        if (sql.includes("FROM org.companies")) return { rows: [{ id: COMPANY }] };
        // Simulate test_named_account's first F2_TARGETS query (catalogs.accounts) blowing up —
        // exactly the shape of the real CHECK-constraint-violation failure mode, without needing to
        // reproduce the constraint itself in a mock.
        if (sql.includes("FROM catalogs.accounts") && sql.includes("deactivated_at IS NULL")) {
          throw new Error("simulated: reconciliation_findings.finding_type CHECK constraint violation");
        }
        return { rows: [] };
      },
    };

    await runLedgerIntegrityTick(client as never);

    const sqls = calls.map((c) => c.sql);
    const savepointIdx = sqls.findIndex((s) => s.includes("SAVEPOINT ledger_detector_test_named_account") && !s.includes("ROLLBACK") && !s.includes("RELEASE"));
    const rollbackIdx = sqls.findIndex((s) => s.includes("ROLLBACK TO SAVEPOINT ledger_detector_test_named_account"));
    const releaseIdx = sqls.findIndex((s) => s.includes("RELEASE SAVEPOINT ledger_detector_test_named_account"));
    const driverCashAdvanceIdx = sqls.findIndex((s) => s.includes("FROM driver_finance.driver_advance_accounts"));

    // The recovery sequence happened, in order, around the throw.
    expect(savepointIdx).toBeGreaterThanOrEqual(0);
    expect(rollbackIdx).toBeGreaterThan(savepointIdx);
    expect(releaseIdx).toBeGreaterThan(rollbackIdx);
    // driver_cash_advance_tie_out runs AFTER test_named_account in the detector array (BANK-F10002
    // regression this fix targets) — it must still fire, proving the client is usable again.
    expect(driverCashAdvanceIdx).toBeGreaterThan(releaseIdx);
  });

  it("does not leave a dangling savepoint when a detector succeeds (RELEASE without ROLLBACK)", async () => {
    const calls: Call[] = [];
    const client = {
      calls,
      async query(sql: string, values?: unknown[]) {
        calls.push({ sql, values });
        if (sql.includes("FROM org.companies")) return { rows: [{ id: COMPANY }] };
        return { rows: [] };
      },
    };

    await runLedgerIntegrityTick(client as never);

    const sqls = calls.map((c) => c.sql);
    expect(sqls.some((s) => s.includes("ROLLBACK TO SAVEPOINT"))).toBe(false);
    // Every SAVEPOINT taken (one per detector) is matched by a RELEASE — 15 detectors, 15 of each.
    const savepointCount = sqls.filter((s) => s.startsWith("SAVEPOINT ledger_detector_")).length;
    const releaseCount = sqls.filter((s) => s.startsWith("RELEASE SAVEPOINT ledger_detector_")).length;
    expect(savepointCount).toBeGreaterThan(0);
    expect(releaseCount).toBe(savepointCount);
  });
});
