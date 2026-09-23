// ROUND 131.3 (owner, via the Lead) — DAY-1 FEED GATE.
//
// A feed day REFUSES to open unless all five hold, measured live, cents not dollars, USMCA only:
//   1. every load_number the day's document names is absent or VOID-prefixed in mdata.loads
//      (unique key is not partial — a collision kills day 1)
//   2. no live invoice, driver bill, settlement, expense, fuel row or factoring advance
//      references any of those load numbers
//   3. the day's document exists in data/alwaystrack/settlements-truth-2026-09-13.json and its
//      six dimensions parse
//   4. banking.bank_transactions count for USMCA is unchanged from the run's opening reading
//   5. the purge window is still open (purge_state.json verified_at set, day1_closed_at unset,
//      under 72h)
//
// Refusal prints which of the five failed and the measured number. This module NEVER
// auto-corrects, NEVER soft-passes, NEVER writes — it is a read-only measurement, exactly like
// verify-alwaystrack-parity.mjs (the ground-truth JSON this reuses) and scripts/lib/purge-window.mjs
// (the purge-window semantics this mirrors, reimplemented locally rather than imported — this is
// application runtime code under apps/backend/src, not a CLI script under scripts/, and the two
// build/run independently).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { withCurrentUser } from "../auth/db.js";
import { setScopedCompanyContext } from "../_helpers/scoped-company-context.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const GROUND_TRUTH_PATH = path.join(ROOT, "data/alwaystrack/settlements-truth-2026-09-13.json");
const PURGE_STATE_PATH = process.env.PURGE_STATE_PATH || path.join(ROOT, "purge_state.json");
const PURGE_WINDOW_HOURS = 72;

/** USMCA only — the packet's own scope. A different company id refuses before any query runs. */
export const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";

export type FeedDayPreflightCheckResult = {
  check: 1 | 2 | 3 | 4 | 5;
  label: string;
  passed: boolean;
  /** The measured number/detail — always present, pass or fail (never a bare pass/fail). */
  measured: string;
};

export type FeedDayPreflightResult = {
  opened: boolean;
  document_number: string;
  load_numbers: string[];
  checks: FeedDayPreflightCheckResult[];
};

export type FeedDayPreflightInput = {
  operatingCompanyId: string;
  /** The AlwaysTrack settlement document number this feed day re-creates, e.g. "5769". */
  documentNumber: string;
  /** Captured ONCE by the feed runner at the start of the whole run — condition 4 compares against it. */
  openingBankTransactionCount: number;
};

// ── Condition 3 — ground truth ───────────────────────────────────────────────────────────────
// The same JSON verify-alwaystrack-parity.mjs reads — never re-parse a PDF. Mirrors that guard's
// own computeGroundTruthTargets() shape for the one dimension set this gate needs: does the
// document exist, and do its six figures parse to real numbers (never NaN, never a silent 0 that
// was actually "could not parse").
type GroundTruthDocument = {
  doc: string;
  loads: string[];
  line_haul_cents: number;
  driver_payment_cents: number;
  fuel_cents: number;
  fuel_count: number;
  expenses_cents: number;
  expenses_count: number;
};

function round2Cents(dollars: unknown): number {
  return Math.round(Number(dollars ?? 0) * 100);
}

function sumBy(rows: Array<Record<string, unknown>> | undefined, key: string): number {
  return (rows ?? []).reduce((sum, row) => sum + Number(row[key] ?? 0), 0);
}

/** Reads the ground-truth JSON and finds ONE document by its settlement number. Pure, no I/O beyond the read. */
export function findGroundTruthDocument(documentNumber: string, groundTruthPath = GROUND_TRUTH_PATH): GroundTruthDocument | null {
  if (!fs.existsSync(groundTruthPath)) return null;
  const raw = JSON.parse(fs.readFileSync(groundTruthPath, "utf8")) as { company?: Array<Record<string, unknown>> };
  const row = (raw.company ?? []).find((r) => String(r.settlement_no) === documentNumber);
  if (!row) return null;
  return {
    doc: documentNumber,
    loads: (row.loads as string[] | undefined) ?? [],
    line_haul_cents: round2Cents(sumBy(row.customer_charges as Array<Record<string, unknown>>, "amount")),
    driver_payment_cents: round2Cents(row.driver_payment_total),
    fuel_cents: round2Cents(sumBy(row.fuel_purchases as Array<Record<string, unknown>>, "actual")),
    fuel_count: ((row.fuel_purchases as unknown[] | undefined) ?? []).length,
    expenses_cents: round2Cents(sumBy(row.expenses as Array<Record<string, unknown>>, "amount")),
    expenses_count: ((row.expenses as unknown[] | undefined) ?? []).length,
  };
}

/** Six dimensions "parse" — every numeric figure is a finite number, not NaN from a bad source row. */
function sixDimensionsParse(doc: GroundTruthDocument): boolean {
  return [doc.line_haul_cents, doc.driver_payment_cents, doc.fuel_cents, doc.fuel_count, doc.expenses_cents, doc.expenses_count].every(
    (n) => Number.isFinite(n)
  );
}

// ── Condition 5 — purge window ───────────────────────────────────────────────────────────────
// Mirrors scripts/lib/purge-window.mjs's purgeWindow() semantics exactly (same three fields, same
// 72h expiry), reimplemented here because this file runs as compiled backend TypeScript, not a
// standalone CLI script — the two intentionally do not share a module across that boundary.
function purgeWindowOpen(now = new Date()): { open: boolean; reason: string } {
  if (!fs.existsSync(PURGE_STATE_PATH)) return { open: false, reason: "no purge_state.json" };
  const state = JSON.parse(fs.readFileSync(PURGE_STATE_PATH, "utf8")) as {
    verified_at?: string | null;
    day1_closed_at?: string | null;
  };
  if (!state.verified_at) return { open: false, reason: "verified_at not set" };
  const verified = new Date(state.verified_at);
  if (Number.isNaN(verified.getTime())) return { open: false, reason: `verified_at is not a timestamp: ${state.verified_at}` };
  if (state.day1_closed_at) return { open: false, reason: `day 1 closed at ${state.day1_closed_at}` };
  const expiresAt = new Date(verified.getTime() + PURGE_WINDOW_HOURS * 3_600_000);
  if (now.getTime() >= expiresAt.getTime()) return { open: false, reason: `expired at ${expiresAt.toISOString()}` };
  return { open: true, reason: `open, expires ${expiresAt.toISOString()}` };
}

type LoadRow = { id: string; load_number: string; is_void_prefixed: boolean };

/**
 * Resolves each requested load_number to its mdata.loads row(s), matching either the literal
 * number or a "VOID-{number}-{suffix}" tombstone — the rename this codebase's own void campaign
 * uses to free a number for reuse (confirmed live: VOID-13601-02f65b81, VOID-13602-0b529946).
 */
async function resolveCandidateLoads(
  client: { query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }> },
  operatingCompanyId: string,
  loadNumbers: string[]
): Promise<Map<string, LoadRow[]>> {
  const byNumber = new Map<string, LoadRow[]>(loadNumbers.map((n) => [n, []]));
  if (loadNumbers.length === 0) return byNumber;
  const res = await client.query<{ id: string; load_number: string }>(
    `SELECT id, load_number FROM mdata.loads
      WHERE operating_company_id = $1::uuid
        AND (load_number = ANY($2::text[]) OR load_number LIKE 'VOID-%')`,
    [operatingCompanyId, loadNumbers]
  );
  for (const row of res.rows) {
    const voidPrefixed = row.load_number.startsWith("VOID-");
    for (const target of loadNumbers) {
      const isLiteralMatch = row.load_number === target;
      const isVoidTombstoneOfTarget = voidPrefixed && row.load_number.startsWith(`VOID-${target}-`);
      if (isLiteralMatch || isVoidTombstoneOfTarget) {
        byNumber.get(target)!.push({ id: row.id, load_number: row.load_number, is_void_prefixed: voidPrefixed });
      }
    }
  }
  return byNumber;
}

export async function feedDayPreflight(userId: string, input: FeedDayPreflightInput): Promise<FeedDayPreflightResult> {
  const checks: FeedDayPreflightCheckResult[] = [];

  if (input.operatingCompanyId !== USMCA_COMPANY_ID) {
    return {
      opened: false,
      document_number: input.documentNumber,
      load_numbers: [],
      checks: [
        {
          check: 1,
          label: "USMCA only",
          passed: false,
          measured: `operating_company_id ${input.operatingCompanyId} is not USMCA (${USMCA_COMPANY_ID})`,
        },
      ],
    };
  }

  // Condition 3 first — it names the load list every other condition needs.
  const doc = findGroundTruthDocument(input.documentNumber);
  const dimensionsOk = doc != null && sixDimensionsParse(doc);
  checks.push({
    check: 3,
    label: "document exists in AlwaysTrack ground truth, six dimensions parse",
    passed: dimensionsOk,
    measured: doc
      ? `doc ${doc.doc}: line_haul=${doc.line_haul_cents}c driver_payment=${doc.driver_payment_cents}c ` +
        `fuel=${doc.fuel_cents}c/${doc.fuel_count}rows expenses=${doc.expenses_cents}c/${doc.expenses_count}rows`
      : `document ${input.documentNumber} not found in ${path.basename(GROUND_TRUTH_PATH)}`,
  });
  const loadNumbers = doc?.loads ?? [];

  const result = await withCurrentUser(userId, async (client) => {
    await setScopedCompanyContext(client, userId, input.operatingCompanyId);

    // Condition 1 + 2 — resolve, then check for collisions and lingering live financial rows.
    const candidatesByNumber = await resolveCandidateLoads(client, input.operatingCompanyId, loadNumbers);
    const collisions: string[] = [];
    const candidateIds: string[] = [];
    for (const [number, rows] of candidatesByNumber) {
      const liveCollision = rows.find((r) => !r.is_void_prefixed);
      if (liveCollision) collisions.push(`${number} (live load ${liveCollision.id})`);
      for (const r of rows) candidateIds.push(r.id);
    }
    checks.push({
      check: 1,
      label: "every load_number is absent or VOID-prefixed in mdata.loads",
      passed: collisions.length === 0,
      measured: collisions.length === 0 ? `${loadNumbers.length} load number(s) checked, 0 collisions` : `collision on: ${collisions.join(", ")}`,
    });

    let liveReferences: string[] = [];
    if (candidateIds.length > 0) {
      const res = await client.query<{ family: string; n: string }>(
        `SELECT 'invoice' AS family, count(*) AS n FROM accounting.invoices
           WHERE operating_company_id = $1::uuid AND source_load_id = ANY($2::uuid[])
             AND status NOT IN ('void', 'voided')
          UNION ALL
         SELECT 'driver_bill', count(*) FROM driver_finance.driver_bills
           WHERE operating_company_id = $1::uuid AND load_id = ANY($2::uuid[])
             AND voided_at IS NULL AND status <> 'void'
          UNION ALL
         SELECT 'settlement', count(*) FROM driver_finance.driver_settlements s
           WHERE s.operating_company_id = $1::uuid AND s.voided_at IS NULL AND s.status <> 'cancelled'
             AND (
               s.first_load_id = ANY($2::uuid[]) OR s.last_load_id = ANY($2::uuid[])
               OR EXISTS (
                 SELECT 1 FROM driver_finance.settlement_lines sl
                 LEFT JOIN driver_finance.driver_bills db2 ON db2.id = sl.source_driver_bill_id
                 WHERE sl.settlement_id = s.id AND COALESCE(db2.load_id, sl.load_id) = ANY($2::uuid[])
               )
             )
          UNION ALL
         SELECT 'expense', count(*) FROM accounting.expenses
           WHERE operating_company_id = $1::uuid AND load_id = ANY($2::uuid[])
             AND voided_at IS NULL AND status NOT IN ('void', 'voided')
          UNION ALL
         SELECT 'fuel', count(*) FROM fuel.fuel_transactions
           WHERE operating_company_id = $1::uuid AND load_id = ANY($2::uuid[]) AND voided_at IS NULL
          UNION ALL
         SELECT 'factoring_advance', count(DISTINCT fa.id) FROM accounting.factoring_advances fa
           JOIN accounting.invoices i ON i.factoring_advance_id = fa.id AND i.operating_company_id = fa.operating_company_id
           WHERE fa.operating_company_id = $1::uuid AND fa.status <> 'voided' AND i.source_load_id = ANY($2::uuid[])`,
        [input.operatingCompanyId, candidateIds]
      );
      liveReferences = res.rows.filter((r) => Number(r.n) > 0).map((r) => `${r.family}=${r.n}`);
    }
    checks.push({
      check: 2,
      label: "no live invoice, driver bill, settlement, expense, fuel row or factoring advance references those loads",
      passed: liveReferences.length === 0,
      measured:
        liveReferences.length === 0
          ? `0 live references across 6 families (${candidateIds.length} candidate load id(s) checked)`
          : `live references found: ${liveReferences.join(", ")}`,
    });

    // Condition 4 — banking must not move. Read-only count, never touched by this module.
    const bankRes = await client.query<{ n: string }>(
      `SELECT count(*) AS n FROM banking.bank_transactions WHERE operating_company_id = $1::uuid`,
      [input.operatingCompanyId]
    );
    const currentBankCount = Number(bankRes.rows[0]?.n ?? 0);
    checks.push({
      check: 4,
      label: "banking.bank_transactions count unchanged from the run's opening reading",
      passed: currentBankCount === input.openingBankTransactionCount,
      measured: `current=${currentBankCount} opening=${input.openingBankTransactionCount}`,
    });

    return { candidateIds };
  });
  void result;

  // Condition 5 — purge window, filesystem-only, no DB.
  const window = purgeWindowOpen();
  checks.push({
    check: 5,
    label: "purge window is still open",
    passed: window.open,
    measured: window.reason,
  });

  checks.sort((a, b) => a.check - b.check);
  return {
    opened: checks.every((c) => c.passed),
    document_number: input.documentNumber,
    load_numbers: loadNumbers,
    checks,
  };
}
