/**
 * ACCT-F412 — THE CASH-BASIS P&L, COMPUTED FROM TRANSACTIONS. This is the query `recognition.ts`
 * named and did not have.
 *
 * WHAT WAS WRONG
 *   `transformProfitLossToCashBasis` took the finished ACCRUAL report — already
 *   `GROUP BY account ... SUM(amount_cents)` — and "converted" it. By then WHICH invoices produced
 *   that revenue, and whether any of them were paid, is gone. With nothing to date it by, the
 *   transform stamped every line `settlement_date = anchorDate`, where anchorDate IS the as-of date,
 *   and the engine's rule `recognized = settlement_date <= as_of` then recognized every line in
 *   full, every time. The cash-basis P&L was the accrual P&L with a different label on it.
 *   An aggregate cannot be disaggregated. A cash-basis P&L has to be built from the postings.
 *
 * THE RULE THIS IMPLEMENTS — QuickBooks' actual one, not a full cash restatement
 *   This is the parity target and it is narrower than people expect. QuickBooks' cash basis is
 *   AR/AP-driven: revenue from an INVOICE is recognized when and to the extent that invoice is
 *   settled, expense from a BILL when and to the extent that bill is settled, and EVERYTHING ELSE
 *   in the ledger passes through at its own GL date, because it was already cash when it posted.
 *   Intuit's own guidance states the AR rule as "paid by value, not by new money": any reduction of
 *   the receivable recognizes income pro rata — a payment, a credit memo and an applied discount all
 *   recognize, and a PARTIAL payment recognizes PARTIALLY, in the period the value moved.
 *
 *   So a $1,000 invoice raised in February with $250 received on 2026-03-15 puts $250 of revenue in
 *   March. Not $1,000, and not in February.
 *
 *   One locked decision goes beyond QuickBooks: @decision Q5 — driver settlements recognize on the
 *   BANK SETTLEMENT DATE. That is the bank transaction's posted date when the settlement is matched
 *   to one, because the bank is the source of truth for when the money actually left.
 *
 * WHAT THIS REPORT WILL NOT DO
 *   It will not fold a number it cannot justify into a total, and it will not drop one either.
 *   Three disclosures sit beside the statement:
 *     • `deferred` — accrual amount NOT yet recognized at `to`. The bridge from accrual to cash.
 *     • `undefined_proportion` — an AR/AP posting whose source document could not be found or whose
 *       total is zero, so the settled proportion has no definition. Recognizing it in full would be
 *       the exact defect above; recognizing nothing silently would hide real money. Disclosed,
 *       excluded from net income, and the reason it exists is a broken document link, not a basis
 *       question.
 *     • `basis_unresolved` — a posting whose `source_transaction_type` no rule in this file claims.
 *       It passes through at its GL date, which is QuickBooks' default for non-AR/AP activity, so
 *       the totals stay complete; and it is listed here so the default is visible rather than
 *       assumed. A type appearing here is a prompt to classify it, not a wrong number.
 */

import { withCurrentUser } from "../../auth/db.js";
import {
  placeAccountType,
  signedPostingAmount,
  type AccountTypePlacement,
} from "../profit-loss-sections.js";
import type { ProfitLossLine, ProfitLossReport, ProfitLossSection } from "../profit-loss.service.js";
import { recognizeCashBasis, type SettlementEvent } from "./recognition.js";

/** How the basis engine treats a posting, decided entirely by its source document's kind. */
export type CashBasisSourceTreatment =
  | "ar_document"
  | "ap_document"
  | "driver_settlement"
  | "cash_event"
  | "direct_je"
  | "unknown";

/**
 * EVERY `source_transaction_type` the posters write, and how cash basis treats it. Measured from the
 * writers in `apps/backend/src` — this is not a guess at what the column might hold.
 *
 * Only `invoice` and `bill` defer. `journal_entry` passes through by @decision Q10. The rest are
 * already cash at the moment they post — a bank categorization, a fuel event, an expense paid from
 * an account, a payment, a transfer — so they pass through at their GL date, which is what
 * QuickBooks does with them too.
 *
 * `prepaid_amortization`, `lease_rental` and `period_close` pass through DELIBERATELY. They are
 * accrual allocations of cash that already moved, and QuickBooks' cash basis does not unwind them
 * either; it only reverses AR and AP. Restating them would make this report disagree with the
 * benchmark while looking more "correct", which is the wrong trade.
 */
export const CASH_BASIS_SOURCE_TREATMENTS: Readonly<Record<string, CashBasisSourceTreatment>> = {
  invoice: "ar_document",
  bill: "ap_document",

  driver_settlement: "driver_settlement",
  settlement: "driver_settlement",

  journal_entry: "direct_je",

  expense: "cash_event",
  bill_payment: "cash_event",
  customer_payment: "cash_event",
  payment: "cash_event",
  bank_categorization: "cash_event",
  bank_reconciliation: "cash_event",
  fuel_event: "cash_event",
  transfer: "cash_event",
  factoring_advance: "cash_event",
  factoring_advance_deposit: "cash_event",
  factoring_reserve_release: "cash_event",
  factoring_customer_payment: "cash_event",
  driver_advance: "cash_event",
  driver_reimbursement: "cash_event",
  cash_advance: "cash_event",
  prepaid_purchase: "cash_event",
  prepaid_amortization: "cash_event",
  loan_payment: "cash_event",
  lease_rental: "cash_event",
  finance_loan: "cash_event",
  period_close: "cash_event",
};

export function treatCashBasisSource(sourceTransactionType: string | null | undefined): CashBasisSourceTreatment {
  const key = String(sourceTransactionType ?? "").trim();
  if (key === "") return "unknown";
  return CASH_BASIS_SOURCE_TREATMENTS[key] ?? "unknown";
}

/** One un-grouped posting on a P&L-relevant account. The cash rendering never groups before it recognizes. */
export type CashBasisPostingRow = {
  posting_id: string;
  account_id: string | null;
  account_code: string;
  account_name: string;
  account_type: string;
  debit_or_credit: string;
  amount_cents: number;
  source_transaction_type: string;
  source_transaction_id: string;
  entry_date: string;
};

/** A source document and everything that has settled it. */
export type DocumentSettlementFacts = {
  total_cents: number;
  events: readonly SettlementEvent[];
};

export type CashBasisProfitLossReport = ProfitLossReport & {
  basis: "cash";
  /** Accrual amount still unrecognized at `to`. Never part of net income — this is the bridge. */
  deferred: ProfitLossSection;
  /** AR/AP postings with no definable settled proportion. Disclosed, excluded from net income. */
  undefined_proportion: ProfitLossSection;
  /** Passed through at GL date because no rule claimed the source type. INCLUDED in net income. */
  basis_unresolved: ProfitLossSection;
  recognition: {
    window: { from: string; to: string };
    postings_considered: number;
    by_treatment: Record<CashBasisSourceTreatment, number>;
  };
};

type Bucket = {
  key: string;
  account_id: string | null;
  account_code: string;
  account_name: string;
  account_type: string;
  amount: number;
};

function bucketKey(row: { account_id: string | null; account_code: string; account_name: string }) {
  return row.account_id ?? `${row.account_code}\u0000${row.account_name}`;
}

/**
 * Add to an account's bucket, CREATING IT AT ZERO if it is not there yet. A section row is created
 * by the account having a posting, not by the recognized amount being non-zero — so the cash column
 * lists the same accounts as the accrual column, and an account whose revenue is entirely deferred
 * shows as 0 instead of vanishing from the statement.
 */
function addTo(map: Map<string, Bucket>, row: CashBasisPostingRow, amount: number) {
  const key = bucketKey(row);
  const existing = map.get(key);
  if (existing) {
    existing.amount += amount;
    return;
  }
  map.set(key, {
    key,
    account_id: row.account_id,
    account_code: row.account_code,
    account_name: row.account_name,
    account_type: row.account_type,
    amount,
  });
}

function toLines(map: Map<string, Bucket>, { dropZero }: { dropZero: boolean }): ProfitLossLine[] {
  const lines = [...map.values()]
    .filter((bucket) => (dropZero ? bucket.amount !== 0 : true))
    .sort((a, b) => {
      const codeCompare = a.account_code.localeCompare(b.account_code);
      if (codeCompare !== 0) return codeCompare;
      return a.account_name.localeCompare(b.account_name);
    })
    .map((bucket) => ({
      ...(bucket.account_id ? { account_id: bucket.account_id } : {}),
      account_code: bucket.account_code,
      account_name: bucket.account_name,
      account_type: bucket.account_type,
      amount: bucket.amount,
    }));
  return lines;
}

function section(map: Map<string, Bucket>, opts: { dropZero: boolean }): ProfitLossSection {
  const lines = toLines(map, opts);
  return { lines, total: lines.reduce((sum, line) => sum + line.amount, 0) };
}

/**
 * THE PURE BUILDER. No database, no clock — postings in, report out. Separated so every rule above
 * is provable by arithmetic, which is the only way a basis engine can be trusted.
 */
export function buildCashBasisProfitLoss(input: {
  postings: readonly CashBasisPostingRow[];
  /** invoice id (text, as the posting stores it) → its total and settlements. */
  arDocuments: ReadonlyMap<string, DocumentSettlementFacts>;
  /** bill id (text) → its total and settlements. */
  apDocuments: ReadonlyMap<string, DocumentSettlementFacts>;
  /** settlement id (text) → the bank settlement date, or null when it has not settled. */
  driverSettlementDates: ReadonlyMap<string, string | null>;
  from: string;
  to: string;
}): CashBasisProfitLossReport {
  const revenue = new Map<string, Bucket>();
  const cogs = new Map<string, Bucket>();
  const opex = new Map<string, Bucket>();
  const unclassified = new Map<string, Bucket>();
  const deferred = new Map<string, Bucket>();
  const undefinedProportion = new Map<string, Bucket>();
  const basisUnresolved = new Map<string, Bucket>();

  const byTreatment: Record<CashBasisSourceTreatment, number> = {
    ar_document: 0,
    ap_document: 0,
    driver_settlement: 0,
    cash_event: 0,
    direct_je: 0,
    unknown: 0,
  };

  const sectionFor = (placement: AccountTypePlacement) => {
    if (placement.kind !== "profit_loss") return null;
    if (placement.section === "revenue") return revenue;
    if (placement.section === "cogs") return cogs;
    return opex;
  };

  for (const row of input.postings) {
    const placement = placeAccountType(row.account_type);

    // ACCT-F413: a Balance Sheet account on a P&L query is not a question — it is simply not this
    // statement's account, and it is dropped by name rather than caught by a safety net.
    if (placement.kind === "balance_sheet") continue;

    const signed = signedPostingAmount(placement, row.debit_or_credit, Number(row.amount_cents ?? 0));
    const treatment = treatCashBasisSource(row.source_transaction_type);
    byTreatment[treatment] += 1;

    const target = sectionFor(placement) ?? unclassified;

    if (treatment === "ar_document" || treatment === "ap_document") {
      const documents = treatment === "ar_document" ? input.arDocuments : input.apDocuments;
      const facts = documents.get(row.source_transaction_id);
      const result = recognizeCashBasis({
        postingAmountCents: signed,
        documentTotalCents: facts?.total_cents ?? 0,
        settlements: facts?.events ?? [],
        from: input.from,
        to: input.to,
      });

      if (result.reason === "undefined_proportion") {
        // The document link is broken or the document is worth nothing. Say so; do not guess.
        addTo(undefinedProportion, row, signed);
        continue;
      }

      addTo(target, row, result.recognizedCents);
      if (result.deferredCents !== 0) addTo(deferred, row, result.deferredCents);
      continue;
    }

    if (treatment === "driver_settlement") {
      // @decision Q5 — the bank settlement date, not the settlement's own period end.
      const settledOn = input.driverSettlementDates.get(row.source_transaction_id) ?? null;
      const recognized =
        settledOn !== null &&
        settledOn.slice(0, 10) >= input.from.slice(0, 10) &&
        settledOn.slice(0, 10) <= input.to.slice(0, 10);
      const throughTo = settledOn !== null && settledOn.slice(0, 10) <= input.to.slice(0, 10);
      addTo(target, row, recognized ? signed : 0);
      if (!throughTo) addTo(deferred, row, signed);
      continue;
    }

    // cash_event · direct_je (@decision Q10) · unknown — already cash when it posted, so it is
    // recognized on its own GL date, which is what QuickBooks does with non-AR/AP activity.
    const inWindow =
      row.entry_date.slice(0, 10) >= input.from.slice(0, 10) &&
      row.entry_date.slice(0, 10) <= input.to.slice(0, 10);
    addTo(target, row, inWindow ? signed : 0);
    if (treatment === "unknown" && inWindow && signed !== 0) addTo(basisUnresolved, row, signed);
  }

  const revenueSection = section(revenue, { dropZero: false });
  const cogsSection = section(cogs, { dropZero: false });
  const opexSection = section(opex, { dropZero: false });
  // The unclassified disclosure only lists accounts that actually carry something, matching the
  // accrual rendering: an empty block means the chart is fully mapped.
  const unclassifiedSection = section(unclassified, { dropZero: true });

  const grossProfit = revenueSection.total - cogsSection.total;
  const netIncome = revenueSection.total - cogsSection.total - opexSection.total;

  return {
    basis: "cash",
    unclassified: unclassifiedSection,
    revenue: revenueSection,
    cogs: cogsSection,
    gross_profit: grossProfit,
    operating_expenses: opexSection,
    net_income: netIncome,
    deferred: section(deferred, { dropZero: true }),
    undefined_proportion: section(undefinedProportion, { dropZero: true }),
    basis_unresolved: section(basisUnresolved, { dropZero: true }),
    recognition: {
      window: { from: input.from, to: input.to },
      postings_considered: input.postings.length,
      by_treatment: byTreatment,
    },
  };
}

/* ------------------------------------------------------------------------------------------------
 * THE QUERIES. Five reads, each one narrow, none of them aggregating before recognition runs.
 * ---------------------------------------------------------------------------------------------- */

type PostingRowDb = {
  posting_id: string;
  account_id: string | null;
  account_code: string;
  account_name: string;
  account_type: string;
  debit_or_credit: string;
  amount_cents: string | number;
  source_transaction_type: string;
  source_transaction_id: string;
  entry_date: string;
};

type SettlementRowDb = {
  document_id: string;
  settled_on: string | null;
  amount_cents: string | number;
};

type DocumentTotalRowDb = { document_id: string; total_cents: string | number };

/**
 * The posting scan is NOT filtered by the report window, and that is the whole point of this file.
 * An invoice raised in February and paid in March belongs in MARCH's cash-basis P&L, so the posting
 * that carries February's revenue has to be in hand when the March window is evaluated. Filtering
 * postings by `je.entry_date` — which is what every aggregate version of this report did — makes
 * that invoice unreachable and is precisely why the old transform could never be right.
 *
 * The scan is bounded instead by the account: only accounts the P&L claims. Every other exclusion
 * matches `profit-loss.service.ts` line for line, so the two bases see the SAME ledger:
 * voided entries out, sample data out, unposted batches out, and the period-close retained-earnings
 * entry out (ACCT-F5656 — its mirror-image postings would net a closed period's activity to zero).
 */
const POSTINGS_SQL = `
  SELECT
    p.id::text AS posting_id,
    a.id::text AS account_id,
    COALESCE(a.account_number, '') AS account_code,
    COALESCE(a.account_name, '') AS account_name,
    COALESCE(a.account_type, '') AS account_type,
    p.debit_or_credit,
    p.amount_cents::bigint AS amount_cents,
    COALESCE(p.source_transaction_type, '') AS source_transaction_type,
    COALESCE(p.source_transaction_id, '') AS source_transaction_id,
    je.entry_date::text AS entry_date
  FROM accounting.journal_entry_postings p
  JOIN accounting.journal_entries je
    ON je.id = p.journal_entry_uuid
   AND je.operating_company_id = p.operating_company_id
  LEFT JOIN accounting.posting_batches pb
    ON pb.id = p.posting_batch_id
   AND pb.operating_company_id = p.operating_company_id
  LEFT JOIN catalogs.accounts a
    ON a.id = p.account_id
   AND a.operating_company_id = p.operating_company_id
  WHERE p.operating_company_id = $1::uuid
    AND je.status <> 'voided'
    AND COALESCE(je.is_sample_data, false) = false
    AND (p.posting_batch_id IS NULL OR pb.batch_status IN ('posted', 'reversed'))
    AND je.id NOT IN (
      SELECT ap.retained_earnings_entry_id
      FROM accounting.periods ap
      WHERE ap.operating_company_id = $1::uuid
        AND ap.retained_earnings_entry_id IS NOT NULL
    )
    AND COALESCE(a.account_type, '') NOT IN (
      'Asset', 'Bank', 'AccountsReceivable', 'OtherCurrentAsset', 'FixedAsset', 'OtherAsset',
      'Liability', 'AccountsPayable', 'CreditCard', 'OtherCurrentLiability', 'LongTermLiability',
      'Equity', 'Statistical'
    )
  ORDER BY a.account_number ASC NULLS LAST, a.account_name ASC, p.id ASC
`;

/**
 * Everything that settles an INVOICE. @decision "paid by value, not by new money" — both halves:
 *   • a customer payment applied to the invoice, dated by the PAYMENT's date, not the application's
 *   • a credit memo applied to the invoice, dated by the application
 * A voided payment, a voided application and a voided credit memo all settle nothing.
 */
const AR_SETTLEMENTS_SQL = `
  SELECT pa.invoice_id::text AS document_id,
         pm.payment_date::text AS settled_on,
         pa.amount_cents::bigint AS amount_cents
    FROM accounting.payment_applications pa
    JOIN accounting.payments pm
      ON pm.id = pa.payment_id
     AND pm.operating_company_id = pa.operating_company_id
   WHERE pa.operating_company_id = $1::uuid
     AND pm.voided_at IS NULL
  UNION ALL
  SELECT cma.invoice_id::text AS document_id,
         (cma.applied_at AT TIME ZONE 'UTC')::date::text AS settled_on,
         cma.applied_cents::bigint AS amount_cents
    FROM accounting.credit_memo_applications cma
    JOIN accounting.credit_memos cm
      ON cm.id = cma.credit_memo_id
     AND cm.operating_company_id = cma.operating_company_id
   WHERE cma.operating_company_id = $1::uuid
     AND cma.voided_at IS NULL
     AND cm.voided_at IS NULL
`;

/**
 * Everything that settles a BILL — a bill payment, or a vendor credit applied to it. A revoked bill
 * payment and a voided vendor-credit application settle nothing.
 *
 * `payment_applications` carries no void column of its own; migration 0195's own note says an
 * application is dead when "the payment OR the invoice it applies to is voided", so the AR half
 * joins `payments` and tests `pm.voided_at`, and a voided invoice never reaches the lookup at all
 * because its postings sit on a voided journal entry the posting scan already excludes.
 */
const AP_SETTLEMENTS_SQL = `
  SELECT bp.bill_id::text AS document_id,
         bp.payment_date::text AS settled_on,
         bp.amount_cents::bigint AS amount_cents
    FROM accounting.bill_payments bp
   WHERE bp.operating_company_id = $1::uuid
     -- revoked_at IS NULL is the ONLY void marker any writer in the repo applies to bill_payments
     -- (measured: every filter on this table in apps/backend/src uses it, and none filters on
     -- status). No extra status predicate is invented here.
     AND bp.revoked_at IS NULL
  UNION ALL
  SELECT vca.bill_id::text AS document_id,
         (vca.applied_at AT TIME ZONE 'UTC')::date::text AS settled_on,
         vca.applied_cents::bigint AS amount_cents
    FROM accounting.vendor_credit_applications vca
   WHERE vca.operating_company_id = $1::uuid
     AND vca.voided_at IS NULL
`;

const AR_TOTALS_SQL = `
  SELECT i.id::text AS document_id, i.total_cents::bigint AS total_cents
    FROM accounting.invoices i
   WHERE i.operating_company_id = $1::uuid
     AND i.voided_at IS NULL
`;

const AP_TOTALS_SQL = `
  SELECT b.id::text AS document_id, b.amount_cents::bigint AS total_cents
    FROM accounting.bills b
   WHERE b.operating_company_id = $1::uuid
     AND b.revoked_at IS NULL
`;

/**
 * @decision Q5 — a driver settlement recognizes on the BANK SETTLEMENT DATE. In descending order of
 * truth: the matched bank transaction's posted date, then its transaction date, then the
 * settlement's own `payment_cleared_at`, then `paid_at`. An unpaid settlement has no date and
 * recognizes nothing — it is deferred, not dropped.
 */
const DRIVER_SETTLEMENT_DATES_SQL = `
  SELECT ds.id::text AS document_id,
         COALESCE(
           bt.posted_date::text,
           bt.transaction_date::text,
           (ds.payment_cleared_at AT TIME ZONE 'UTC')::date::text,
           (ds.paid_at AT TIME ZONE 'UTC')::date::text
         ) AS settled_on
    FROM driver_finance.driver_settlements ds
    LEFT JOIN banking.bank_transactions bt
      ON bt.id = ds.paid_via_bank_txn_id
     AND bt.operating_company_id = ds.operating_company_id
   WHERE ds.operating_company_id = $1::uuid
`;

function groupSettlements(rows: readonly SettlementRowDb[]): Map<string, SettlementEvent[]> {
  const out = new Map<string, SettlementEvent[]>();
  for (const row of rows) {
    if (!row.settled_on) continue; // an application with no date settles nothing we can place
    const amount = Number(row.amount_cents ?? 0);
    if (amount <= 0) continue;
    const list = out.get(row.document_id);
    const event: SettlementEvent = { date: String(row.settled_on).slice(0, 10), amount_cents: amount };
    if (list) list.push(event);
    else out.set(row.document_id, [event]);
  }
  return out;
}

function joinDocuments(
  totals: readonly DocumentTotalRowDb[],
  settlements: ReadonlyMap<string, SettlementEvent[]>
): Map<string, DocumentSettlementFacts> {
  const out = new Map<string, DocumentSettlementFacts>();
  for (const row of totals) {
    out.set(row.document_id, {
      total_cents: Number(row.total_cents ?? 0),
      events: settlements.get(row.document_id) ?? [],
    });
  }
  return out;
}

/** The earliest date Postgres will accept, used when the caller gives no `from`. */
const OPEN_WINDOW_START = "0001-01-01";

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

/**
 * Read everything the builder needs, ON A CLIENT THE CALLER OWNS.
 *
 * This is split out for the period close. `writePeriodCashBasisSnapshotAtClose` runs INSIDE the
 * close transaction, and a snapshot that opened its own connection would read the database as it
 * was before the close — then freeze those numbers permanently (@decision Q9). So the close feeds
 * the same builder from its own client, and the live report feeds it from a request-scoped one.
 * One definition, two callers, no second implementation of the rule.
 */
export async function fetchCashBasisProfitLossInputs(
  client: DbClient,
  input: { operating_company_id: string; from: string; to: string }
) {
  const scope = [input.operating_company_id];

  const [postings, arSettlements, apSettlements, arTotals, apTotals, settlementDates] = await Promise.all([
    client.query<PostingRowDb>(POSTINGS_SQL, scope),
    client.query<SettlementRowDb>(AR_SETTLEMENTS_SQL, scope),
    client.query<SettlementRowDb>(AP_SETTLEMENTS_SQL, scope),
    client.query<DocumentTotalRowDb>(AR_TOTALS_SQL, scope),
    client.query<DocumentTotalRowDb>(AP_TOTALS_SQL, scope),
    client.query<{ document_id: string; settled_on: string | null }>(DRIVER_SETTLEMENT_DATES_SQL, scope),
  ]);

  const driverSettlementDates = new Map<string, string | null>();
  for (const row of settlementDates.rows) {
    driverSettlementDates.set(row.document_id, row.settled_on ? String(row.settled_on).slice(0, 10) : null);
  }

  return {
    postings: postings.rows.map((row) => ({
      posting_id: row.posting_id,
      account_id: row.account_id,
      account_code: row.account_code,
      account_name: row.account_name,
      account_type: row.account_type,
      debit_or_credit: row.debit_or_credit,
      amount_cents: Number(row.amount_cents ?? 0),
      source_transaction_type: row.source_transaction_type,
      source_transaction_id: row.source_transaction_id,
      entry_date: row.entry_date,
    })),
    arDocuments: joinDocuments(arTotals.rows, groupSettlements(arSettlements.rows)),
    apDocuments: joinDocuments(apTotals.rows, groupSettlements(apSettlements.rows)),
    driverSettlementDates,
    from: input.from,
    to: input.to,
  };
}

/** The cash-basis P&L for a window, read and built on the SAME client the caller already holds. */
export async function buildCashBasisProfitLossOnClient(
  client: DbClient,
  input: { operating_company_id: string; from?: string; to: string }
): Promise<CashBasisProfitLossReport> {
  const inputs = await fetchCashBasisProfitLossInputs(client, {
    operating_company_id: input.operating_company_id,
    from: input.from ?? OPEN_WINDOW_START,
    to: input.to,
  });
  return buildCashBasisProfitLoss(inputs);
}

export async function getCashBasisProfitLossReport(input: {
  userId: string;
  operating_company_id: string;
  from_date?: string;
  /** Required in practice — the route always passes the anchor date. */
  to_date: string;
}): Promise<CashBasisProfitLossReport> {
  return withCurrentUser(input.userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [input.operating_company_id]);
    return buildCashBasisProfitLossOnClient(client, {
      operating_company_id: input.operating_company_id,
      from: input.from_date,
      to: input.to_date,
    });
  });
}
