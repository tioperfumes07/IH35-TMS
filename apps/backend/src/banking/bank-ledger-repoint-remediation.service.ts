/**
 * Remediation for bank transactions posted through a WRONG bank-leg bridge.
 *
 * THE SITUATION THIS EXISTS FOR (measured on prod 2026-08-04)
 * `banking.bank_accounts.ledger_account_id` is the cash/liability leg of every bank-feed GL posting.
 * The "Business Platinum Card®" account (account_class='credit') pointed at catalogs.accounts
 * QBO-1150040080 "Faro Factoring Reserves" — an ASSET — instead of the Amex card liability
 * (QBO-338 "Amex Card-", confirmed against the live QuickBooks balance sheet). Bank categorization
 * trusted that column, so 120 card purchases CREDITED $41,191.86 to the factoring reserve between
 * 2026-07-12 and 2026-08-04, plus one $309.00 debit — net $40,882.86 sitting in the wrong account.
 *
 * Migration 202612100000 repoints the bridge, and bank-feed-gl-posting.service.ts now refuses to post
 * through a class-mismatched bridge at all. Neither fixes HISTORY: journal postings are append-only, so
 * the already-written lines still carry the old account_id.
 *
 * HOW THIS CORRECTS THEM — no new GL math, and no hand-written journal entry
 * For each affected bank transaction it drives the EXISTING posting engine twice:
 *   1. reversePostedSourceTransaction(...)  → the engine's own reversing batch, which unwinds the
 *      original lines exactly as written (including the wrong account) so the two net to zero;
 *   2. postSourceTransaction(..., posting_purpose:'repost', repost_revision) → the engine rebuilds the
 *      lines from the source bank transaction, now resolving the bank leg through the CORRECTED bridge.
 * The net effect is DR Faro Factoring Reserves / CR Amex Card- for the full amount, expressed as real
 * reversal+repost pairs rather than one opaque plug — every corrected dollar stays traceable to the
 * bank transaction that caused it, which is what an auditor will ask for.
 *
 * SAFETY
 *  * Flag-gated, DEFAULT OFF (BANK_LEDGER_REPOINT_REMEDIATION_ENABLED), per entity.
 *  * Selects ONLY rows whose posted bank leg disagrees with the bank account's CURRENT
 *    ledger_account_id. A row already correct is invisible to this service, so a second run is a no-op
 *    and it can never "correct" a row that was right all along.
 *  * Refuses to run while the bridge is still mismatched — reposting into a wrong bridge would just
 *    rewrite the same error with a new batch id.
 *  * dryRun reports exactly what would change without posting anything.
 *  * Per-row failures are collected, never thrown past the loop: one bad row must not strand the rest
 *    half-corrected.
 */
import { withCompanyScope } from "../accounting/shared.js";
import { isEnabled } from "../lib/feature-flags/service.js";
import { appendCrudAudit } from "../audit/crud-audit.js";
import {
  postSourceTransaction,
  reversePostedSourceTransaction,
} from "../accounting/posting-engine.service.js";
import { BANK_FEED_GL_POSTING_FLAG_KEY } from "./bank-feed-gl-posting.service.js";

export const BANK_LEDGER_REPOINT_REMEDIATION_FLAG_KEY = "BANK_LEDGER_REPOINT_REMEDIATION_ENABLED";

const AUDIT_SOURCE = "BANK-LEDGER-REPOINT-REMEDIATION";

export type RepointRemediationInput = {
  companyId: string;
  actorUserUuid: string;
  /** Limit to one bank account; omit to sweep every bank account in the entity. */
  bankAccountId?: string | null;
  /** Report only — post nothing. */
  dryRun?: boolean;
  /** Safety ceiling per invocation. */
  limit?: number;
};

export type RepointRemediationRow = {
  bank_transaction_id: string;
  bank_account_id: string;
  bank_account_name: string | null;
  posted_account_id: string;
  posted_account_name: string | null;
  current_ledger_account_id: string;
  current_ledger_account_name: string | null;
  amount_cents: number;
};

export type RepointRemediationResult = {
  ran: boolean;
  reason?: "flag_off" | "bank_feed_posting_off" | "bridge_still_mismatched" | "nothing_to_correct";
  dry_run: boolean;
  candidates: number;
  corrected: number;
  failed: number;
  net_cents_moved: number;
  rows: Array<RepointRemediationRow & { outcome: "corrected" | "failed" | "would_correct"; error?: string }>;
};

/**
 * Rows whose posted bank leg no longer matches the bank account's bridge. The posting is identified
 * through matched_journal_entry_id, and the "bank leg" is the posting line whose account is NOT the
 * categorized account — i.e. the cash/liability side the bridge chose.
 */
async function findAffected(
  client: { query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }> },
  companyId: string,
  bankAccountId: string | null | undefined,
  limit: number
): Promise<RepointRemediationRow[]> {
  const res = await client.query(
    `
      SELECT
        bt.id::text                       AS bank_transaction_id,
        ba.id::text                       AS bank_account_id,
        ba.account_name                   AS bank_account_name,
        posted.id::text                   AS posted_account_id,
        posted.account_name               AS posted_account_name,
        cur.id::text                      AS current_ledger_account_id,
        cur.account_name                  AS current_ledger_account_name,
        abs(bt.amount_cents)::bigint      AS amount_cents
      FROM banking.bank_transactions bt
      JOIN banking.bank_accounts ba
        ON ba.id = bt.bank_account_id
       AND ba.operating_company_id = bt.operating_company_id
      JOIN catalogs.accounts cur
        ON cur.id = ba.ledger_account_id
      JOIN accounting.journal_entry_postings p
        ON p.journal_entry_uuid = bt.matched_journal_entry_id
       AND p.operating_company_id = bt.operating_company_id
      JOIN catalogs.accounts posted
        ON posted.id = p.account_id
      WHERE bt.operating_company_id = $1::uuid
        AND bt.matched_journal_entry_id IS NOT NULL
        AND ($2::uuid IS NULL OR ba.id = $2::uuid)
        -- the bank leg, not the categorized leg
        AND p.account_id IS DISTINCT FROM bt.categorization_gl_account_id
        -- ...and it disagrees with the bridge as it stands NOW
        AND p.account_id IS DISTINCT FROM ba.ledger_account_id
        -- never touch a line that has already been reversed or superseded
        AND p.reversal_of_line_id IS NULL
        AND p.reversed_by_line_id IS NULL
      ORDER BY bt.transaction_date, bt.id
      LIMIT $3::int
    `,
    [companyId, bankAccountId ?? null, limit]
  );
  return res.rows as RepointRemediationRow[];
}

/** True when every bank account in scope bridges to a type consistent with its class. */
async function bridgeIsSane(
  client: { query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }> },
  companyId: string,
  bankAccountId: string | null | undefined
): Promise<boolean> {
  const res = await client.query(
    `
      SELECT count(*)::int AS mismatched
      FROM banking.bank_accounts ba
      JOIN catalogs.accounts led ON led.id = ba.ledger_account_id
                                 AND led.operating_company_id = ba.operating_company_id
      WHERE ba.operating_company_id = $1::uuid
        AND ($2::uuid IS NULL OR ba.id = $2::uuid)
        AND (
          (ba.account_class = 'credit' AND led.account_type <> 'Liability')
          OR (ba.account_class = 'depository' AND led.account_type <> 'Asset')
        )
    `,
    [companyId, bankAccountId ?? null]
  );
  return ((res.rows[0] as { mismatched: number } | undefined)?.mismatched ?? 0) === 0;
}

export async function remediateRepointedBankLedgerPostings(
  input: RepointRemediationInput
): Promise<RepointRemediationResult> {
  const dryRun = input.dryRun === true;
  const limit = Math.max(1, Math.min(input.limit ?? 500, 2000));

  const prepared = await withCompanyScope(input.actorUserUuid, input.companyId, async (client) => {
    const flagOn = await isEnabled(client, BANK_LEDGER_REPOINT_REMEDIATION_FLAG_KEY, {
      operating_company_id: input.companyId,
      user_uuid: input.actorUserUuid,
    });
    if (!flagOn) return { gate: "flag_off" as const };

    // BOTH flags must be ON. This service reposts through
    // postSourceTransaction('bank_categorization'), so it is a bank-feed GL posting path like any
    // other and must honour that path's own per-entity kill switch. Checking only the remediation
    // flag would let a correction post into an entity whose bank-feed posting is deliberately OFF —
    // re-opening the exact kill switch the entity relies on, through a side door.
    const bankFeedPostingOn = await isEnabled(client, BANK_FEED_GL_POSTING_FLAG_KEY, {
      operating_company_id: input.companyId,
      user_uuid: input.actorUserUuid,
    });
    if (!bankFeedPostingOn) return { gate: "bank_feed_posting_off" as const };

    // Reposting into a still-wrong bridge would rewrite the same error under a new batch id.
    if (!(await bridgeIsSane(client, input.companyId, input.bankAccountId))) {
      return { gate: "bridge_still_mismatched" as const };
    }

    return { gate: "ok" as const, rows: await findAffected(client, input.companyId, input.bankAccountId, limit) };
  });

  if (prepared.gate !== "ok") {
    return {
      ran: false,
      reason: prepared.gate,
      dry_run: dryRun,
      candidates: 0,
      corrected: 0,
      failed: 0,
      net_cents_moved: 0,
      rows: [],
    };
  }

  const candidates = prepared.rows;
  if (candidates.length === 0) {
    return {
      ran: false,
      reason: "nothing_to_correct",
      dry_run: dryRun,
      candidates: 0,
      corrected: 0,
      failed: 0,
      net_cents_moved: 0,
      rows: [],
    };
  }

  if (dryRun) {
    return {
      ran: true,
      dry_run: true,
      candidates: candidates.length,
      corrected: 0,
      failed: 0,
      net_cents_moved: candidates.reduce((sum, r) => sum + Number(r.amount_cents ?? 0), 0),
      rows: candidates.map((r) => ({ ...r, outcome: "would_correct" as const })),
    };
  }

  const actor = { userId: input.actorUserUuid };
  const rows: RepointRemediationResult["rows"] = [];
  let corrected = 0;
  let failed = 0;
  let netCents = 0;

  for (const row of candidates) {
    try {
      await reversePostedSourceTransaction(
        {
          operating_company_id: input.companyId,
          source_transaction_type: "bank_categorization",
          source_transaction_id: row.bank_transaction_id,
        },
        actor
      );
      await postSourceTransaction(
        {
          operating_company_id: input.companyId,
          source_transaction_type: "bank_categorization",
          source_transaction_id: row.bank_transaction_id,
          posting_purpose: "repost",
          repost_revision: 1,
        },
        actor
      );
      corrected += 1;
      netCents += Number(row.amount_cents ?? 0);
      rows.push({ ...row, outcome: "corrected" });
    } catch (error) {
      // One bad row must not strand the rest half-corrected — collect and keep going.
      failed += 1;
      rows.push({ ...row, outcome: "failed", error: error instanceof Error ? error.message : String(error) });
    }
  }

  await withCompanyScope(input.actorUserUuid, input.companyId, async (client) => {
    await appendCrudAudit(
      client,
      input.actorUserUuid,
      "banking.bank_ledger_repoint_remediation.completed",
      {
        operating_company_id: input.companyId,
        bank_account_id: input.bankAccountId ?? null,
        candidates: candidates.length,
        corrected,
        failed,
        net_cents_moved: netCents,
        bank_transaction_ids: rows.filter((r) => r.outcome === "corrected").map((r) => r.bank_transaction_id),
      },
      failed > 0 ? "warning" : "info",
      AUDIT_SOURCE
    );
  });

  return {
    ran: true,
    dry_run: false,
    candidates: candidates.length,
    corrected,
    failed,
    net_cents_moved: netCents,
    rows,
  };
}
