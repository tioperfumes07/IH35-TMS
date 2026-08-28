import { describe, expect, it } from "vitest";
import {
  checkAskMyAccountantForCompany,
  checkNoGlDeltaForCompany,
  checkPerEntryBalanceForCompany,
  checkSubledgerTieOutForCompany,
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
