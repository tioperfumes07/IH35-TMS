// RECON-01 — cron tick orchestration. Two scheduled passes (AM bank-count 06:00 CT, PM categorization-diff
// 19:00 CT) iterate the entities whose TMS_QBO_RECON_ENABLED flag is ON and run the corresponding read-only
// pass. Default OFF → a no-op in prod until the owner flips it per entity. The live QBO source (Reports
// client) is wired only when Martin's 2024 close is stable; until then createQboReconSource returns null and
// the tick records NOTHING for that entity (it never fabricates a QBO side — an empty QBO side would false-flag
// every TMS row). Runs under lucia bypass (system identity) so the engine's FORCED-RLS inserts are permitted.
import * as Sentry from "@sentry/node";
import { withLuciaBypass } from "../../auth/db.js";
import { isEnabled } from "../../lib/feature-flags/service.js";
import { qboCompanyContext, qboQuery } from "../../integrations/qbo/qbo-client.js";
import type { ReconEntry } from "./recon-engine.service.js";
import { runBankCountPass, runCategorizationDiffPass, type QboReconSource } from "./recon-engine.service.js";

export const RECON_FLAG_KEY = "TMS_QBO_RECON_ENABLED";

/**
 * Canonical `_system.background_jobs` job names for the two recon passes. Used both by the standalone
 * Render cron entrypoint (run-recon.ts) to record each run and by the /healthz staleness rule so a
 * silently-dead recon pass surfaces on the deep health check (G4-HEALTH).
 */
export function reconJobName(pass: "am" | "pm"): string {
  return pass === "am" ? "accounting.recon_am_bank_count" : "accounting.recon_pm_categorization_diff";
}

type QboRef = { value?: string; name?: string };

// ── Minimal QBO register entity shapes (only the fields this reconciler reads). All six of these entity
// types can move money through a bank/credit-card account, so the recon source must pull all six or it
// SILENTLY MISSES cash (B1-1). Field shapes per the QBO Accounting API; confirm against real data on the
// first live run (kept defensive: every field optional, safe fallbacks).
type QboDepositTxn = {
  Id: string; TxnDate: string; TotalAmt?: number | string;
  DocNumber?: string; PrivateNote?: string; DepositToAccountRef?: QboRef;
};
type QboPurchaseTxn = {
  Id: string; TxnDate: string; TotalAmt?: number | string;
  DocNumber?: string; PrivateNote?: string; AccountRef?: QboRef;
  Credit?: boolean; // Credit=true → vendor refund/credit = money IN (rare); default is money OUT.
};
type QboTransferTxn = {
  Id: string; TxnDate: string; Amount?: number | string;
  DocNumber?: string; PrivateNote?: string; FromAccountRef?: QboRef; ToAccountRef?: QboRef;
};
type QboBillPaymentTxn = {
  Id: string; TxnDate: string; TotalAmt?: number | string; DocNumber?: string; PrivateNote?: string;
  PayType?: string; CheckPayment?: { BankAccountRef?: QboRef }; CreditCardPayment?: { CCAccountRef?: QboRef };
};
type QboPaymentTxn = {
  Id: string; TxnDate: string; TotalAmt?: number | string;
  DocNumber?: string; PrivateNote?: string; DepositToAccountRef?: QboRef;
};
type QboJournalEntryLine = {
  Amount?: number | string;
  JournalEntryLineDetail?: { PostingType?: string; AccountRef?: QboRef };
};
type QboJournalEntryTxn = {
  Id: string; TxnDate: string; DocNumber?: string; PrivateNote?: string; Line?: QboJournalEntryLine[];
};
type QboAccount = { Id?: string; AccountType?: string };

const toCents = (v: number | string | undefined): number => Math.round(Number(v ?? 0) * 100);

/** All six QBO register-entity arrays for a window, plus the bank/credit-card account-id set used to scope
 *  the ambiguous types (Payment, JournalEntry) to legs that actually hit a bank/cash account. */
export type QboRegisterSources = {
  deposits: QboDepositTxn[];
  purchases: QboPurchaseTxn[];
  transfers: QboTransferTxn[];
  billPayments: QboBillPaymentTxn[];
  payments: QboPaymentTxn[];
  journalEntries: QboJournalEntryTxn[];
  /** QBO Account Ids whose AccountType is Bank or Credit Card. */
  bankAccountRefs: ReadonlySet<string>;
};

/** Pure QBO-register → ReconEntry[] mapper (no network, no DB — fully unit-testable). Normalizes ALL SIX
 *  bank-hitting QBO transaction types to the SAME signed-cents convention as the TMS side (credit / money-IN
 *  positive, money-OUT negative). This is register-side normalization for comparison ONLY — the engine never
 *  posts; no GL math here. Covering all six is the B1-1 fix: previously only Deposit + Purchase were pulled,
 *  so Transfers, BillPayments, directly-deposited customer Payments, and bank-leg JournalEntries never
 *  reconciled and their cash movement went unseen. */
export function buildReconEntriesFromQboRegister(src: QboRegisterSources): ReconEntry[] {
  const entries: ReconEntry[] = [];

  // 1) Deposit — money IN (+). DepositToAccountRef is the receiving bank account.
  for (const d of src.deposits) {
    entries.push({
      txn_date: d.TxnDate,
      amount_cents: toCents(d.TotalAmt),
      reference: d.PrivateNote ?? d.DocNumber ?? null,
      account_ref: d.DepositToAccountRef?.value ?? "unmapped",
      source_ref: { kind: "bank_txn", id: `qbo:deposit:${d.Id}`, display: d.DocNumber ?? undefined },
    });
  }

  // 2) Purchase — money OUT (−) by default; a Purchase flagged Credit=true is a vendor refund → money IN (+).
  //    AccountRef is the bank/credit-card account the money moved through.
  for (const p of src.purchases) {
    const magnitude = toCents(p.TotalAmt);
    entries.push({
      txn_date: p.TxnDate,
      amount_cents: p.Credit ? magnitude : -magnitude,
      reference: p.PrivateNote ?? p.DocNumber ?? null,
      account_ref: p.AccountRef?.value ?? "unmapped",
      source_ref: { kind: "bank_txn", id: `qbo:purchase:${p.Id}`, display: p.DocNumber ?? undefined },
    });
  }

  // 3) Transfer — bank→bank. TWO bank-hitting legs: the From account loses (−), the To account gains (+).
  for (const t of src.transfers) {
    const magnitude = toCents(t.Amount);
    const ref = t.PrivateNote ?? t.DocNumber ?? null;
    entries.push({
      txn_date: t.TxnDate, amount_cents: -magnitude, reference: ref,
      account_ref: t.FromAccountRef?.value ?? "unmapped",
      source_ref: { kind: "bank_txn", id: `qbo:transfer:${t.Id}:from`, display: t.DocNumber ?? undefined },
    });
    entries.push({
      txn_date: t.TxnDate, amount_cents: magnitude, reference: ref,
      account_ref: t.ToAccountRef?.value ?? "unmapped",
      source_ref: { kind: "bank_txn", id: `qbo:transfer:${t.Id}:to`, display: t.DocNumber ?? undefined },
    });
  }

  // 4) BillPayment — money OUT (−). The bank/CC account depends on PayType (Check → CheckPayment.BankAccountRef,
  //    CreditCard → CreditCardPayment.CCAccountRef).
  for (const bp of src.billPayments) {
    const acct = bp.CheckPayment?.BankAccountRef?.value ?? bp.CreditCardPayment?.CCAccountRef?.value ?? "unmapped";
    entries.push({
      txn_date: bp.TxnDate,
      amount_cents: -toCents(bp.TotalAmt),
      reference: bp.PrivateNote ?? bp.DocNumber ?? null,
      account_ref: acct,
      source_ref: { kind: "bank_txn", id: `qbo:billpayment:${bp.Id}`, display: bp.DocNumber ?? undefined },
    });
  }

  // 5) Payment (customer receipt) — money IN (+), but ONLY when deposited DIRECTLY to a bank account
  //    (DepositToAccountRef present AND in the bank/CC set). A Payment left in Undeposited Funds hits the bank
  //    later via a Deposit (arm 1); including it here too would DOUBLE-COUNT the same cash, so skip it.
  for (const pay of src.payments) {
    const acct = pay.DepositToAccountRef?.value;
    if (!acct || !src.bankAccountRefs.has(acct)) continue;
    entries.push({
      txn_date: pay.TxnDate,
      amount_cents: toCents(pay.TotalAmt),
      reference: pay.PrivateNote ?? pay.DocNumber ?? null,
      account_ref: acct,
      source_ref: { kind: "bank_txn", id: `qbo:payment:${pay.Id}`, display: pay.DocNumber ?? undefined },
    });
  }

  // 6) JournalEntry — only the LEGS posting to a bank/cash account are bank-hitting. Standard bank-register
  //    sign: a Debit to a bank/cash account increases it (money IN, +); a Credit decreases it (money OUT, −).
  //    Non-bank legs (revenue/expense/AR/AP…) are not cash movements and are excluded via bankAccountRefs.
  for (const je of src.journalEntries) {
    (je.Line ?? []).forEach((line, idx) => {
      const acct = line.JournalEntryLineDetail?.AccountRef?.value;
      if (!acct || !src.bankAccountRefs.has(acct)) return;
      const magnitude = toCents(line.Amount);
      const isDebit = (line.JournalEntryLineDetail?.PostingType ?? "").toLowerCase() === "debit";
      entries.push({
        txn_date: je.TxnDate,
        amount_cents: isDebit ? magnitude : -magnitude,
        reference: je.PrivateNote ?? je.DocNumber ?? null,
        account_ref: acct,
        source_ref: { kind: "bank_txn", id: `qbo:journalentry:${je.Id}:${idx}`, display: je.DocNumber ?? undefined },
      });
    });
  }

  return entries;
}

/** The live QBO register source (WIRED 2026-07-04; B1-1 expanded 2026-07-05 to all six bank-hitting types).
 *  Pulls the entity's full QBO bank register for the window — Deposit, Purchase, Transfer, BillPayment,
 *  directly-deposited Payment, and bank-leg JournalEntry — and maps to ReconEntry with the SAME signed
 *  convention as the TMS side (credit / money-IN positive). Auth comes from the live
 *  integrations.qbo_connections tokens via qboCompanyContext; any QBO API/auth error THROWS (the caller
 *  records the run as failed) so we NEVER fabricate an empty QBO side — an empty side would false-flag every
 *  TMS row. Only entities whose TMS_QBO_RECON_ENABLED flag is ON reach here, and by policy that flag is
 *  flipped only for QBO-connected entities. The extraction is a read-only mapping (buildReconEntriesFrom
 *  QboRegister) — no GL posting. QBO field shapes should be confirmed against real data on the first live run. */
function createQboReconSource(operatingCompanyId: string): QboReconSource | null {
  void operatingCompanyId;
  return {
    async bankEntries(opco: string, windowStart: string, windowEnd: string): Promise<ReconEntry[]> {
      const ctx = await qboCompanyContext(opco); // throws if the entity has no live QBO connection
      const ws = windowStart.slice(0, 10);
      const we = windowEnd.slice(0, 10);
      const dateRange = `TxnDate >= '${ws}' AND TxnDate <= '${we}'`;

      // Bank + Credit Card account ids — the set of accounts that represent real cash/payment accounts. Used to
      // scope Payment (skip Undeposited Funds) and JournalEntry legs to bank-hitting rows only.
      const accountsRes = await qboQuery<QboAccount>(
        ctx,
        `SELECT * FROM Account WHERE AccountType IN ('Bank', 'Credit Card') MAXRESULTS 1000`,
      );
      const bankAccountRefs = new Set<string>();
      for (const a of (accountsRes.QueryResponse?.Account as QboAccount[] | undefined) ?? []) {
        if (a.Id) bankAccountRefs.add(a.Id);
      }

      const [deposits, purchases, transfers, billPayments, payments, journalEntries] = await Promise.all([
        qboQuery<QboDepositTxn>(ctx, `SELECT * FROM Deposit WHERE ${dateRange} MAXRESULTS 1000`),
        qboQuery<QboPurchaseTxn>(ctx, `SELECT * FROM Purchase WHERE ${dateRange} MAXRESULTS 1000`),
        qboQuery<QboTransferTxn>(ctx, `SELECT * FROM Transfer WHERE ${dateRange} MAXRESULTS 1000`),
        qboQuery<QboBillPaymentTxn>(ctx, `SELECT * FROM BillPayment WHERE ${dateRange} MAXRESULTS 1000`),
        qboQuery<QboPaymentTxn>(ctx, `SELECT * FROM Payment WHERE ${dateRange} MAXRESULTS 1000`),
        qboQuery<QboJournalEntryTxn>(ctx, `SELECT * FROM JournalEntry WHERE ${dateRange} MAXRESULTS 1000`),
      ]);

      return buildReconEntriesFromQboRegister({
        deposits: (deposits.QueryResponse?.Deposit as QboDepositTxn[] | undefined) ?? [],
        purchases: (purchases.QueryResponse?.Purchase as QboPurchaseTxn[] | undefined) ?? [],
        transfers: (transfers.QueryResponse?.Transfer as QboTransferTxn[] | undefined) ?? [],
        billPayments: (billPayments.QueryResponse?.BillPayment as QboBillPaymentTxn[] | undefined) ?? [],
        payments: (payments.QueryResponse?.Payment as QboPaymentTxn[] | undefined) ?? [],
        journalEntries: (journalEntries.QueryResponse?.JournalEntry as QboJournalEntryTxn[] | undefined) ?? [],
        bankAccountRefs,
      });
    },
  };
}

export type ReconTickResult = {
  pass: "am" | "pm";
  window_start: string;
  window_end: string;
  entities_checked: number;
  entities_run: number;
  skipped_flag_off: number;
  skipped_source_pending: number;
  runs: Array<{ operating_company_id: string; run_id: string; exceptions: number }>;
};

/** Run one reconciliation tick. `now` is injectable for tests (backend runtime passes a real Date). */
export async function runReconTick(pass: "am" | "pm", now: Date = new Date(), windowDays = 1): Promise<ReconTickResult> {
  const windowEnd = now.toISOString();
  const windowStart = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000).toISOString();

  return withLuciaBypass(async (client) => {
    const companies = await client.query<{ id: string }>(`SELECT id::text FROM org.companies`);
    const result: ReconTickResult = {
      pass, window_start: windowStart, window_end: windowEnd,
      entities_checked: 0, entities_run: 0, skipped_flag_off: 0, skipped_source_pending: 0, runs: [],
    };

    for (const c of companies.rows) {
      result.entities_checked++;
      const on = await isEnabled(client, RECON_FLAG_KEY, { operating_company_id: c.id });
      if (!on) { result.skipped_flag_off++; continue; }

      const source = createQboReconSource(c.id);
      if (!source) {
        result.skipped_source_pending++;
        console.warn(`[recon-cron] ${pass}: TMS_QBO_RECON_ENABLED ON for ${c.id} but the live QBO source is not wired yet — skipping (no data fabricated).`);
        continue;
      }

      try {
        const run =
          pass === "am"
            ? await runBankCountPass(client, c.id, windowStart, windowEnd, source, null)
            : await runCategorizationDiffPass(client, c.id, windowStart, windowEnd, source, null);
        result.entities_run++;
        result.runs.push({ operating_company_id: c.id, run_id: run.run_id, exceptions: run.exceptions });
      } catch (err) {
        // A QBO auth/API failure for one entity must NOT kill the whole tick or fabricate an empty QBO side.
        // Record as source-pending (nothing trusted this pass for this entity) and continue to the next.
        result.skipped_source_pending++;
        console.error(
          `[recon-cron] ${pass}: QBO source failed for ${c.id} — skipping this entity (no data fabricated):`,
          (err as Error)?.message ?? err,
        );
        // G10-C3 alert-on-failure: a flagged-ON (trusted) entity that failed its QBO source is a silent recon
        // hole — report it so an on-call channel can page. Additive; safe no-op when SENTRY_DSN is unset.
        Sentry.captureException(err, {
          tags: { subsystem: "accounting-recon", pass, phase: "qbo_source" },
          extra: { operating_company_id: c.id },
        });
      }
    }

    // G10-C3 alert-on-failure (zero-trusted-entity): a "trusted entity" is one whose TMS_QBO_RECON_ENABLED flag
    // is ON — we trust it to reconcile this tick. If one or more entities were flagged ON but NONE actually
    // reconciled (every trusted entity was source-pending or failed), the recon is silently doing nothing and a
    // human needs to know. Emit a Sentry event so an on-call channel can page. Additive; safe no-op when
    // SENTRY_DSN is unset. Not fired when zero entities are flagged ON (that is the intended default-OFF state).
    const trustedEntities = result.entities_checked - result.skipped_flag_off;
    if (trustedEntities > 0 && result.entities_run === 0) {
      Sentry.captureMessage(
        `[recon-cron] ${pass}: ${trustedEntities} entit${trustedEntities === 1 ? "y" : "ies"} flagged ON for reconciliation but ZERO reconciled this tick (all source-pending/failed) — recon is silently not running.`,
        {
          level: "error",
          tags: { subsystem: "accounting-recon", pass },
          extra: {
            trusted_entities: trustedEntities,
            entities_checked: result.entities_checked,
            skipped_flag_off: result.skipped_flag_off,
            skipped_source_pending: result.skipped_source_pending,
          },
        },
      );
    }

    return result;
  });
}
