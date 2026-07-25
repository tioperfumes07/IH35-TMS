// STMT-2 — TRANSP opening-balance importer (BUILD-AND-HOLD, financial cluster, §1.4).
//
// Maps the QBO 12/31/2024 Balance Sheet (transp-2024-12-31-source.ts) to catalogs.accounts (TRANSP,
// entity-scoped), and assembles a REVIEWABLE opening journal-entry PREVIEW — it never calls
// createJournalEntry, never writes to accounting.journal_entries, and never posts anything. Opening
// balances are OWNER-ENTERED ONLY (skill `ih35-accounting-decisions` §0/§2; constitution §1.4/§1.6):
// this module's entire job ends at "here is the balanced JE, and here is what didn't map" — Jorge reviews
// and posts by hand (e.g. through the existing manual JE screen), never through code this file writes.
//
// Behind OPENING_BALANCE_IMPORT_ENABLED (migration 202607140000, HELD, default OFF).
//
// Matching strategy (documented limitation, not guessed): the source data is a hand-transcribed QBO BS
// pull (docs/OPENING-BALANCES-TRANSP-2024-12-31.md) that does not carry QBO's own account IDs — only the
// account LABEL as QBO displayed it. So the match key here is account_name (exact, then normalized-fuzzy),
// NOT catalogs.accounts.qbo_account_id. A stronger id-based bridge is possible once/if the real QBO
// account IDs for these 12/31/2024 lines are captured (mdata.qbo_accounts already carries qbo_account_id
// for accounts synced later) — flagged here as a follow-up, not fabricated. Every line that fails to match
// is surfaced in `unmapped`, never silently dropped or guessed.
//
// Idempotent / re-runnable: pure computation from the static source file + a live catalogs.accounts read —
// re-running after Martin adjusts a QBO figure (memory `qbo-balance-in-flux-embezzlement`) or after an
// account gets created/renamed simply reflects the new inputs; there is no persisted "run" state to drift.

import { isEnabled } from "../../lib/feature-flags/service.js";
import {
  TRANSP_OPENING_BALANCE_AS_OF,
  TRANSP_OPENING_BALANCE_HEADLINE_CENTS,
  TRANSP_OPENING_BALANCE_SOURCE_LINES,
  TRANSP_OPENING_JE_ENTRY_DATE,
  type OpeningBalanceSourceLine,
} from "./transp-2024-12-31-source.js";

export const OPENING_BALANCE_IMPORT_FLAG = "OPENING_BALANCE_IMPORT_ENABLED";

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

// Normalize a label for fuzzy matching: lowercase, strip everything but letters/digits. Deterministic,
// no external calls — "A/R (A/R)" and "AR AR" both normalize to "arar".
function normalizeLabel(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]/g, "");
}

// signed-actual → debit/credit (CPA-locked convention, see transp-2024-12-31-source.ts file header):
// take the account's ACTUAL reported sign, never force a "natural side" assumption. Asset: positive=Dr,
// negative=Cr. Liability/Equity: positive=Cr, negative=Dr. Returns null for a zero line (nothing to post).
export function signedCentsToDebitCredit(
  accountType: "Asset" | "Liability" | "Equity",
  amountCents: number
): { debit_or_credit: "debit" | "credit"; amount_cents: number } | null {
  if (amountCents === 0) return null;
  const abs = Math.abs(amountCents);
  if (accountType === "Asset") {
    return amountCents > 0 ? { debit_or_credit: "debit", amount_cents: abs } : { debit_or_credit: "credit", amount_cents: abs };
  }
  // Liability / Equity
  return amountCents > 0 ? { debit_or_credit: "credit", amount_cents: abs } : { debit_or_credit: "debit", amount_cents: abs };
}

type CatalogsAccountRow = { id: string; account_name: string };

async function loadTranspAccounts(client: DbClient, operatingCompanyId: string): Promise<CatalogsAccountRow[]> {
  const res = await client.query<{ id: string; account_name: string }>(
    `
      SELECT id::text, account_name
      FROM catalogs.accounts
      WHERE operating_company_id = $1::uuid
        AND deactivated_at IS NULL
    `,
    [operatingCompanyId]
  );
  return res.rows;
}

export type OpeningBalancePreviewLine = {
  qbo_account_label: string;
  category: OpeningBalanceSourceLine["category"];
  account_type: OpeningBalanceSourceLine["account_type"];
  amount_cents: number;
  matched_account_id: string | null;
  matched_account_name: string | null;
  match_method: "exact" | "normalized" | "unmapped";
  debit_or_credit: "debit" | "credit" | null; // null when amount_cents === 0 (nothing to post)
};

export type OpeningBalanceImportPreview = {
  flag_off: boolean;
  operating_company_id: string;
  as_of_date: string;
  entry_date: string;
  lines: OpeningBalancePreviewLine[];
  unmapped: OpeningBalancePreviewLine[];
  headline_tie_out: {
    computed_total_assets_cents: number;
    computed_total_liabilities_cents: number;
    computed_total_equity_cents: number;
    expected_total_assets_cents: number;
    expected_total_liabilities_cents: number;
    expected_total_equity_cents: number;
    ties_to_doc: boolean; // source-data internal check — independent of any account mapping
  };
  je_preview: {
    operating_company_id: string;
    entry_date: string;
    memo: string;
    source: "manual";
    postings: Array<{ account_id: string; debit_or_credit: "debit" | "credit"; amount_cents: number; description: string }>;
  } | null; // null when unmapped lines exist or the JE would not balance — never a partial/unsafe JE
  total_debits_cents: number;
  total_credits_cents: number;
  is_balanced: boolean;
  ready_to_post: boolean; // true only when unmapped is empty AND is_balanced — Jorge still posts by hand
};

export async function buildTransp20241231OpeningBalanceImportPreview(
  client: DbClient,
  operatingCompanyId: string
): Promise<OpeningBalanceImportPreview> {
  const flagOn = await isEnabled(client as never, OPENING_BALANCE_IMPORT_FLAG, { operating_company_id: operatingCompanyId });

  const emptyHeadline = {
    computed_total_assets_cents: 0,
    computed_total_liabilities_cents: 0,
    computed_total_equity_cents: 0,
    expected_total_assets_cents: TRANSP_OPENING_BALANCE_HEADLINE_CENTS.total_assets_cents,
    expected_total_liabilities_cents: TRANSP_OPENING_BALANCE_HEADLINE_CENTS.total_liabilities_cents,
    expected_total_equity_cents: TRANSP_OPENING_BALANCE_HEADLINE_CENTS.total_equity_cents,
    ties_to_doc: false,
  };

  if (!flagOn) {
    return {
      flag_off: true,
      operating_company_id: operatingCompanyId,
      as_of_date: TRANSP_OPENING_BALANCE_AS_OF,
      entry_date: TRANSP_OPENING_JE_ENTRY_DATE,
      lines: [],
      unmapped: [],
      headline_tie_out: emptyHeadline,
      je_preview: null,
      total_debits_cents: 0,
      total_credits_cents: 0,
      is_balanced: false,
      ready_to_post: false,
    };
  }

  const accounts = await loadTranspAccounts(client, operatingCompanyId);
  const byExactName = new Map<string, CatalogsAccountRow>();
  const byNormalizedName = new Map<string, CatalogsAccountRow>();
  for (const a of accounts) {
    byExactName.set(a.account_name.trim().toLowerCase(), a);
    const norm = normalizeLabel(a.account_name);
    if (!byNormalizedName.has(norm)) byNormalizedName.set(norm, a); // first-match-wins, never silently overwritten
  }

  const lines: OpeningBalancePreviewLine[] = TRANSP_OPENING_BALANCE_SOURCE_LINES.map((src) => {
    const exact = byExactName.get(src.qbo_account_label.trim().toLowerCase());
    const normalized = exact ? undefined : byNormalizedName.get(normalizeLabel(src.qbo_account_label));
    const matched = exact ?? normalized ?? null;
    const dc = signedCentsToDebitCredit(src.account_type, src.amount_cents);
    return {
      qbo_account_label: src.qbo_account_label,
      category: src.category,
      account_type: src.account_type,
      amount_cents: src.amount_cents,
      matched_account_id: matched?.id ?? null,
      matched_account_name: matched?.account_name ?? null,
      match_method: exact ? "exact" : normalized ? "normalized" : "unmapped",
      debit_or_credit: dc?.debit_or_credit ?? null,
    };
  });

  const unmapped = lines.filter((l) => l.matched_account_id === null);

  // Headline tie-out is computed straight off the SOURCE data (independent of live account mapping) —
  // proves the transcription in transp-2024-12-31-source.ts still ties to the doc, regardless of whether
  // catalogs.accounts has caught up yet. Mirrors scripts/verify-opening-balance-source-ties-to-doc.mjs.
  const computedAssets = TRANSP_OPENING_BALANCE_SOURCE_LINES.filter((l) => l.account_type === "Asset").reduce((s, l) => s + l.amount_cents, 0);
  const computedLiabilities = TRANSP_OPENING_BALANCE_SOURCE_LINES.filter((l) => l.account_type === "Liability").reduce((s, l) => s + l.amount_cents, 0);
  const computedEquity = TRANSP_OPENING_BALANCE_SOURCE_LINES.filter((l) => l.account_type === "Equity").reduce((s, l) => s + l.amount_cents, 0);
  const headline_tie_out = {
    computed_total_assets_cents: computedAssets,
    computed_total_liabilities_cents: computedLiabilities,
    computed_total_equity_cents: computedEquity,
    expected_total_assets_cents: TRANSP_OPENING_BALANCE_HEADLINE_CENTS.total_assets_cents,
    expected_total_liabilities_cents: TRANSP_OPENING_BALANCE_HEADLINE_CENTS.total_liabilities_cents,
    expected_total_equity_cents: TRANSP_OPENING_BALANCE_HEADLINE_CENTS.total_equity_cents,
    ties_to_doc:
      computedAssets === TRANSP_OPENING_BALANCE_HEADLINE_CENTS.total_assets_cents &&
      computedLiabilities === TRANSP_OPENING_BALANCE_HEADLINE_CENTS.total_liabilities_cents &&
      computedEquity === TRANSP_OPENING_BALANCE_HEADLINE_CENTS.total_equity_cents,
  };

  const postableLines = lines.filter((l) => l.matched_account_id && l.debit_or_credit && l.amount_cents !== 0);
  const totalDebits = postableLines.filter((l) => l.debit_or_credit === "debit").reduce((s, l) => s + Math.abs(l.amount_cents), 0);
  const totalCredits = postableLines.filter((l) => l.debit_or_credit === "credit").reduce((s, l) => s + Math.abs(l.amount_cents), 0);
  const isBalanced = totalDebits === totalCredits && totalDebits > 0;

  const memo = `Opening balance — TRANSP as of ${TRANSP_OPENING_BALANCE_AS_OF} (QBO Balance Sheet, signed-actual)`;
  const jePreview =
    unmapped.length === 0 && isBalanced
      ? {
          operating_company_id: operatingCompanyId,
          entry_date: TRANSP_OPENING_JE_ENTRY_DATE,
          memo,
          source: "manual" as const,
          postings: postableLines.map((l) => ({
            account_id: l.matched_account_id as string,
            debit_or_credit: l.debit_or_credit as "debit" | "credit",
            amount_cents: Math.abs(l.amount_cents),
            description: `${memo} — ${l.qbo_account_label}`,
          })),
        }
      : null;

  return {
    flag_off: false,
    operating_company_id: operatingCompanyId,
    as_of_date: TRANSP_OPENING_BALANCE_AS_OF,
    entry_date: TRANSP_OPENING_JE_ENTRY_DATE,
    lines,
    unmapped,
    headline_tie_out,
    je_preview: jePreview,
    total_debits_cents: totalDebits,
    total_credits_cents: totalCredits,
    is_balanced: isBalanced,
    ready_to_post: unmapped.length === 0 && isBalanced,
  };
}
