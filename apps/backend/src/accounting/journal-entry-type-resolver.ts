/**
 * ACCT-LINK-01 regression fix (GO-1405 Recipe B, 2026-08-29): shared leaf module so every direct
 * JE-creating poster (fuel/bank-recon/settlement/amortization/lease/period-close/void-reversal/
 * recurring-worker/posting-engine, plus journal-entries.service.ts's own manual/API path) can
 * resolve a real catalogs.journal_entry_types.id instead of leaving journal_entry_type_id NULL.
 *
 * Deliberately a LEAF module (no imports from any accounting service file) so it can be imported
 * by void.service.ts, journal-entries.service.ts, and posting-engine.service.ts alike without
 * creating an import cycle -- journal-entries.service.ts already imports from void.service.ts.
 *
 * Root cause this fixes: journal-entries.service.ts's own manual/API create path was the ONLY
 * insert site wired to resolve a type; every other poster did its own raw
 * INSERT INTO accounting.journal_entries with no journal_entry_type_id column at all, which is why
 * live density stayed at 46/2214 (2%) even after that path's "never leave NULL" fix landed --
 * manual/API-created JEs are a small minority of total volume; the auto-posters are the majority.
 */

export type QueryableClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

type JournalEntrySource = "manual" | "auto";

let journalEntryTypeColumnPresent = false;
export async function hasJournalEntryTypeColumn(client: QueryableClient): Promise<boolean> {
  if (journalEntryTypeColumnPresent) return true;
  const res = await client.query<{ n: number }>(
    `SELECT count(*)::int AS n
       FROM information_schema.columns
      WHERE table_schema = 'accounting'
        AND table_name = 'journal_entries'
        AND column_name = 'journal_entry_type_id'`
  );
  const present = Number(res.rows[0]?.n ?? 0) === 1;
  if (present) journalEntryTypeColumnPresent = true;
  return present;
}

/**
 * Infer catalogs.journal_entry_types.code from memo/source when the caller omitted a type.
 * Used by every create path + the Neon backfill so auto posters cannot leave journal_entry_type_id NULL.
 */
export function inferJournalEntryTypeCode(input: {
  journal_entry_type_code?: string | null;
  source?: JournalEntrySource | null;
  memo?: string | null;
}): string {
  const explicit = input.journal_entry_type_code?.trim();
  if (explicit) return explicit;
  const memo = (input.memo ?? "").toLowerCase();
  if (memo.includes("opening balance")) return "OPENING_BALANCE";
  if (memo.includes("invoice") && memo.includes("posting")) return "SALES_INVOICE";
  if (memo.startsWith("bill ") || memo.includes(" bill ") || /^bill\b/.test(memo)) return "BILL";
  if (memo.includes("bill payment")) return "BILL_PAYMENT";
  if (memo.includes("factoring")) return "FACTORING_ADVANCE";
  if (memo.includes("escrow")) return "ESCROW_ENTRY";
  if (memo.includes("depreciation")) return "DEPRECIATION";
  if (memo.includes("transfer")) return "TRANSFER";
  if (memo.includes("deposit")) return "DEPOSIT";
  if (memo.includes("settlement")) return "PAYROLL_SETTLEMENT";
  // Bank categorization / reversal / guard fixtures → GENERAL (typed, not NULL).
  return "GENERAL";
}

export async function resolveJournalEntryTypeId(
  client: QueryableClient,
  input: {
    journal_entry_type_id?: string | null;
    journal_entry_type_code?: string | null;
    source?: JournalEntrySource;
    memo?: string | null;
  }
): Promise<string> {
  if (input.journal_entry_type_id) {
    const byId = await client.query<{ id: string }>(
      `SELECT id::text FROM catalogs.journal_entry_types WHERE id = $1::uuid AND is_active = true LIMIT 1`,
      [input.journal_entry_type_id]
    );
    if (!byId.rows[0]?.id) throw new Error("journal_entry_type_not_found");
    return byId.rows[0].id;
  }
  // ROOT CAUSE FIX: auto posters used to skip type (null) → 0% inbound density on live JEs.
  // Always resolve a catalog code (memo heuristic → GENERAL fallback). Never leave NULL.
  const code = inferJournalEntryTypeCode(input);
  const byCode = await client.query<{ id: string }>(
    `SELECT id::text FROM catalogs.journal_entry_types WHERE lower(code) = lower($1) AND is_active = true LIMIT 1`,
    [code]
  );
  if (!byCode.rows[0]?.id) throw new Error("journal_entry_type_not_found");
  return byCode.rows[0].id;
}
