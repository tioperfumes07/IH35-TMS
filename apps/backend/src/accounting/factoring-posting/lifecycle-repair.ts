/**
 * Strict factoring lifecycle JE candidate validation + repair (CPA VETO 0280-05).
 * Memo is never sufficient alone. Never overwrite authoritative provenance.
 */
import { writeTransactionSourceLink } from "../accounting-spine-emit.js";

/** Authoritative lifecycle source types for Factoring Balance JE linkage (CPA VETO 0280-05). */
export const FACTORING_LIFECYCLE_SOURCE_TYPES = [
  "factoring_advance",
  "factoring_customer_payment",
  "factoring_reserve_release",
  "factoring_chargeback",
  "factoring_default_interest",
] as const;

export type FactoringLifecycleSourceType = (typeof FACTORING_LIFECYCLE_SOURCE_TYPES)[number];

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

export type LifecycleCandidateKind = "none" | "unique" | "ambiguous" | "invalid";

export type LifecycleRepairCandidate = {
  kind: LifecycleCandidateKind;
  journal_entry_id: string | null;
  reason?: string;
};

/** Exact expected role leg for strict repair / posting-key validation (CPA VETO eb06028d). */
export type ExpectedLifecycleLeg = {
  role: string;
  debit_or_credit: "debit" | "credit";
  amount_cents: number;
};

let reversalColsCached: boolean | null = null;
async function hasReversalLinkageColumns(client: DbClient): Promise<boolean> {
  if (reversalColsCached != null) return reversalColsCached;
  const res = await client.query<{ n: string }>(
    `
      SELECT COUNT(*)::text AS n
        FROM information_schema.columns
       WHERE table_schema = 'accounting'
         AND table_name = 'journal_entries'
         AND column_name IN ('reverses_je_id', 'reversed_by_je_id')
    `
  );
  reversalColsCached = Number(res.rows[0]?.n ?? 0) === 2;
  return reversalColsCached;
}

/** SQL AND-fragment excluding reversed / reversing JEs when linkage columns exist. */
async function liveJeNotReversedSql(client: DbClient): Promise<string> {
  if (!(await hasReversalLinkageColumns(client))) return "";
  return ` AND je.reverses_je_id IS NULL AND je.reversed_by_je_id IS NULL `;
}

/** Calendar-day gap between two YYYY-MM-DD company business dates (no UTC wall-clock). */
export function calendarDayIndexBetween(purchaseYmd: string, accrualYmd: string): number {
  const [py, pm, pd] = purchaseYmd.slice(0, 10).split("-").map(Number);
  const [ay, am, ad] = accrualYmd.slice(0, 10).split("-").map(Number);
  if (![py, pm, pd, ay, am, ad].every((n) => Number.isFinite(n))) return 0;
  const p = Date.UTC(py!, pm! - 1, pd!);
  const a = Date.UTC(ay!, am! - 1, ad!);
  return Math.round((a - p) / 86_400_000);
}

function isLifecycleType(v: string): v is FactoringLifecycleSourceType {
  return (FACTORING_LIFECYCLE_SOURCE_TYPES as readonly string[]).includes(v);
}

/**
 * Validate an existing JE against exact expected role accounts, D/C, amounts,
 * source identity, advance, status, and absence of reversals. Used by both
 * strict candidate repair AND posting-key repair (no bypass).
 *
 * Foreign/non-null source_transaction_type with a null source id is a conflict
 * (never treat as unattributed). Unattributed = BOTH type and id null.
 */
export async function validateLifecycleJeExactShape(
  client: DbClient,
  opts: {
    operating_company_id: string;
    journal_entry_id: string;
    factoring_advance_id: string;
    source_transaction_type: FactoringLifecycleSourceType;
    expected_legs: ExpectedLifecycleLeg[];
    expected_status?: string;
    /** When set, JE entry_date must equal this YYYY-MM-DD (default-interest / settlement dates). */
    expected_entry_date?: string | null;
  }
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const expectedStatus = opts.expected_status ?? "posted";
  if (!isLifecycleType(opts.source_transaction_type)) {
    return { ok: false, reason: "invalid_lifecycle_source_type" };
  }
  if (!opts.expected_legs.length) {
    return { ok: false, reason: "repair_expected_legs_required" };
  }

  const hasRev = await hasReversalLinkageColumns(client);
  const header = await client.query<{
    id: string;
    status: string;
    entry_date: string | null;
    reverses_je_id: string | null;
    reversed_by_je_id: string | null;
  }>(
    hasRev
      ? `
      SELECT
        je.id::text AS id,
        je.status::text AS status,
        je.entry_date::text AS entry_date,
        je.reverses_je_id::text AS reverses_je_id,
        je.reversed_by_je_id::text AS reversed_by_je_id
        FROM accounting.journal_entries je
       WHERE je.id = $1::uuid
         AND je.operating_company_id = $2::uuid
       LIMIT 1
    `
      : `
      SELECT
        je.id::text AS id,
        je.status::text AS status,
        je.entry_date::text AS entry_date,
        NULL::text AS reverses_je_id,
        NULL::text AS reversed_by_je_id
        FROM accounting.journal_entries je
       WHERE je.id = $1::uuid
         AND je.operating_company_id = $2::uuid
       LIMIT 1
    `,
    [opts.journal_entry_id, opts.operating_company_id]
  );
  const je = header.rows[0];
  if (!je) return { ok: false, reason: "repair_candidate_invalid" };
  if (je.status !== expectedStatus) return { ok: false, reason: "repair_candidate_invalid_status" };
  if (je.reverses_je_id || je.reversed_by_je_id) {
    return { ok: false, reason: "repair_candidate_reversed" };
  }
  if (opts.expected_entry_date) {
    const entryYmd = (je.entry_date ?? "").slice(0, 10);
    if (entryYmd !== opts.expected_entry_date.slice(0, 10)) {
      return { ok: false, reason: "repair_candidate_wrong_entry_date" };
    }
  }

  const legs = await client.query<{
    role: string;
    debit_or_credit: string;
    amount_cents: string;
    source_transaction_type: string | null;
    source_transaction_id: string | null;
  }>(
    `
      SELECT
        r.role::text AS role,
        jep.debit_or_credit::text AS debit_or_credit,
        jep.amount_cents::text AS amount_cents,
        jep.source_transaction_type,
        jep.source_transaction_id
        FROM accounting.journal_entry_postings jep
        JOIN accounting.chart_of_accounts_roles r
          ON r.account_id = jep.account_id
         AND r.operating_company_id = jep.operating_company_id
         AND r.is_active = true
       WHERE jep.journal_entry_uuid = $1::uuid
         AND jep.operating_company_id = $2::uuid
    `,
    [opts.journal_entry_id, opts.operating_company_id]
  );

  if (legs.rows.length !== opts.expected_legs.length) {
    return { ok: false, reason: "repair_candidate_wrong_leg_count" };
  }

  const remaining = [...opts.expected_legs];
  for (const row of legs.rows) {
    const typeSet = row.source_transaction_type != null && row.source_transaction_type !== "";
    const idSet = row.source_transaction_id != null && row.source_transaction_id !== "";
    if (typeSet || idSet) {
      // Any partial or foreign attribution is a conflict — never overwrite.
      if (
        row.source_transaction_type !== opts.source_transaction_type ||
        row.source_transaction_id !== opts.factoring_advance_id
      ) {
        return { ok: false, reason: "repair_candidate_wrong_source_identity" };
      }
    }
    const amt = Number(row.amount_cents ?? 0);
    const idx = remaining.findIndex(
      (e) =>
        e.role === row.role &&
        e.debit_or_credit === row.debit_or_credit &&
        e.amount_cents === amt
    );
    if (idx < 0) {
      return { ok: false, reason: "repair_candidate_wrong_account_or_amount" };
    }
    remaining.splice(idx, 1);
  }
  if (remaining.length > 0) {
    return { ok: false, reason: "repair_candidate_wrong_account_or_amount" };
  }

  // Balanced (debits == credits) — structural, not inferred from remaining.
  const bal = await client.query<{ ok: boolean }>(
    `
      SELECT (
        COALESCE(SUM(CASE WHEN debit_or_credit = 'debit' THEN amount_cents ELSE 0 END), 0)
        = COALESCE(SUM(CASE WHEN debit_or_credit = 'credit' THEN amount_cents ELSE 0 END), 0)
        AND COALESCE(SUM(CASE WHEN debit_or_credit = 'debit' THEN amount_cents ELSE 0 END), 0) > 0
      ) AS ok
        FROM accounting.journal_entry_postings
       WHERE journal_entry_uuid = $1::uuid
         AND operating_company_id = $2::uuid
    `,
    [opts.journal_entry_id, opts.operating_company_id]
  );
  if (!bal.rows[0]?.ok) return { ok: false, reason: "repair_candidate_unbalanced" };

  return { ok: true };
}

/** SQL fragment excluding reversed / reversing JEs (empty when columns absent). */
export async function liveJournalEntryNotReversedSql(client: DbClient): Promise<string> {
  return liveJeNotReversedSql(client);
}

export async function findStrictLifecycleRepairCandidate(
  client: DbClient,
  opts: {
    operating_company_id: string;
    factoring_advance_id: string;
    source_transaction_type: FactoringLifecycleSourceType;
    /** Optional memo hint — never sole authority. */
    memo?: string | null;
    /** Expected JE status — default posted. */
    expected_status?: string;
    /** When provided, candidate must match exact role/D/C/amount legs. */
    expected_legs?: ExpectedLifecycleLeg[];
    expected_entry_date?: string | null;
    /**
     * Event identity for MULTI-INSTANCE lifecycle events (e.g. sequential partial
     * `factoring_customer_payment`s, per-day `factoring_default_interest`). When provided, a JE that
     * already owns a deterministic posting key for a DIFFERENT event_key (same advance + source type) is
     * NOT a repair candidate for THIS event — it belongs to a sibling event and must not be matched (then
     * fail exact-shape) merely because it shares the advance + source type. The deterministic posting-key
     * lookup (findLifecyclePostingKeyJe) already resolves the same-event re-post; this scopes the repair
     * fallback so a first $40k payment JE is never treated as an invalid candidate for a second $30k
     * payment. Omit (NULL) for singleton events (funding) — fully backward compatible.
     */
    event_key?: string | null;
  }
): Promise<LifecycleRepairCandidate> {
  const expectedStatus = opts.expected_status ?? "posted";
  if (!isLifecycleType(opts.source_transaction_type)) {
    return { kind: "invalid", journal_entry_id: null, reason: "invalid_lifecycle_source_type" };
  }

  const notReversed = await liveJeNotReversedSql(client);
  const authoritative = await client.query<{ id: string }>(
    `
      SELECT je.id::text AS id
        FROM accounting.journal_entries je
       WHERE je.operating_company_id = $1::uuid
         AND je.status = $4
         AND je.source = 'auto'
         ${notReversed}
         AND EXISTS (
               SELECT 1
                 FROM accounting.journal_entry_postings jep
                WHERE jep.journal_entry_uuid = je.id
                  AND jep.operating_company_id = je.operating_company_id
                  AND jep.source_transaction_type = $2
                  AND jep.source_transaction_id = $3::text
             )
         AND NOT EXISTS (
               SELECT 1
                 FROM accounting.journal_entry_postings jep
                WHERE jep.journal_entry_uuid = je.id
                  AND jep.operating_company_id = je.operating_company_id
                  AND jep.source_transaction_id IS NOT NULL
                  AND NOT (
                    jep.source_transaction_type = $2
                    AND jep.source_transaction_id = $3::text
                  )
             )
         AND NOT EXISTS (
               SELECT 1
                 FROM accounting.journal_entry_postings jep
                 JOIN accounting.transaction_source_links tsl
                   ON tsl.journal_entry_posting_id = jep.id
                  AND tsl.operating_company_id = jep.operating_company_id
                  AND tsl.linked_object_type = 'factoring_advance'
                WHERE jep.journal_entry_uuid = je.id
                  AND jep.operating_company_id = je.operating_company_id
                  AND (
                    tsl.linked_object_id <> $3::text
                    OR (
                      jep.source_transaction_type IS NOT NULL
                      AND jep.source_transaction_type <> ''
                      AND tsl.relationship_role IS DISTINCT FROM (jep.source_transaction_type)
                    )
                  )
             )
         AND (
               SELECT COALESCE(SUM(CASE WHEN jep.debit_or_credit = 'debit' THEN jep.amount_cents ELSE 0 END), 0)
                    = COALESCE(SUM(CASE WHEN jep.debit_or_credit = 'credit' THEN jep.amount_cents ELSE 0 END), 0)
                  AND COALESCE(SUM(CASE WHEN jep.debit_or_credit = 'debit' THEN jep.amount_cents ELSE 0 END), 0) > 0
                 FROM accounting.journal_entry_postings jep
                WHERE jep.journal_entry_uuid = je.id
                  AND jep.operating_company_id = je.operating_company_id
             )
         -- Multi-instance event scoping: a JE already keyed to a DIFFERENT event_key (sibling partial
         -- payment / different accrual day) is not this event's repair candidate. NULL event_key
         -- (singleton events like funding) leaves behavior unchanged.
         AND (
               $5::text IS NULL
               OR NOT EXISTS (
                     SELECT 1
                       FROM accounting.factoring_lifecycle_posting_keys plk
                      WHERE plk.journal_entry_id = je.id
                        AND plk.operating_company_id = je.operating_company_id
                        AND plk.factoring_advance_id = $3::uuid
                        AND plk.source_transaction_type = $2
                        AND plk.event_key <> $5::text
                  )
             )
       ORDER BY je.created_at ASC, je.id ASC
    `,
    [
      opts.operating_company_id,
      opts.source_transaction_type,
      opts.factoring_advance_id,
      expectedStatus,
      opts.event_key ?? null,
    ]
  );

  if (authoritative.rows.length > 1) {
    return {
      kind: "ambiguous",
      journal_entry_id: null,
      reason: "ambiguous_lifecycle_je_candidates",
    };
  }
  if (authoritative.rows.length === 1) {
    const jeId = authoritative.rows[0]!.id;
    if (opts.expected_legs?.length) {
      const shape = await validateLifecycleJeExactShape(client, {
        operating_company_id: opts.operating_company_id,
        journal_entry_id: jeId,
        factoring_advance_id: opts.factoring_advance_id,
        source_transaction_type: opts.source_transaction_type,
        expected_legs: opts.expected_legs,
        expected_status: expectedStatus,
        expected_entry_date: opts.expected_entry_date,
      });
      if (!shape.ok) {
        return { kind: "invalid", journal_entry_id: null, reason: shape.reason };
      }
    }
    return { kind: "unique", journal_entry_id: jeId };
  }

  // Unattributed memo candidate — only when EVERY posting line has null source attribution
  // and no contradictory TSL. Never treat a memo hit with foreign provenance as already_posted.
  if (opts.memo) {
    const unlinked = await client.query<{ id: string }>(
      `
        SELECT je.id::text AS id
          FROM accounting.journal_entries je
         WHERE je.operating_company_id = $1::uuid
           AND je.status = $3
           AND je.source = 'auto'
           AND je.memo = $2
           ${notReversed}
           AND NOT EXISTS (
                 SELECT 1
                   FROM accounting.journal_entry_postings jep
                  WHERE jep.journal_entry_uuid = je.id
                    AND jep.operating_company_id = je.operating_company_id
                    AND (
                      jep.source_transaction_id IS NOT NULL
                      OR (
                        jep.source_transaction_type IS NOT NULL
                        AND jep.source_transaction_type <> ''
                      )
                    )
               )
           AND NOT EXISTS (
                 SELECT 1
                   FROM accounting.journal_entry_postings jep
                   JOIN accounting.transaction_source_links tsl
                     ON tsl.journal_entry_posting_id = jep.id
                    AND tsl.operating_company_id = jep.operating_company_id
                    AND tsl.linked_object_type = 'factoring_advance'
                  WHERE jep.journal_entry_uuid = je.id
                    AND jep.operating_company_id = je.operating_company_id
                    AND tsl.linked_object_id <> $4::text
               )
           AND (
                 SELECT COALESCE(SUM(CASE WHEN jep.debit_or_credit = 'debit' THEN jep.amount_cents ELSE 0 END), 0)
                      = COALESCE(SUM(CASE WHEN jep.debit_or_credit = 'credit' THEN jep.amount_cents ELSE 0 END), 0)
                    AND COALESCE(SUM(CASE WHEN jep.debit_or_credit = 'debit' THEN jep.amount_cents ELSE 0 END), 0) > 0
                   FROM accounting.journal_entry_postings jep
                  WHERE jep.journal_entry_uuid = je.id
                    AND jep.operating_company_id = je.operating_company_id
               )
         ORDER BY je.created_at ASC, je.id ASC
      `,
      [opts.operating_company_id, opts.memo, expectedStatus, opts.factoring_advance_id]
    );
    if (unlinked.rows.length > 1) {
      return {
        kind: "ambiguous",
        journal_entry_id: null,
        reason: "ambiguous_unlinked_memo_candidates",
      };
    }
    if (unlinked.rows.length === 1) {
      const jeId = unlinked.rows[0]!.id;
      if (opts.expected_legs?.length) {
        const shape = await validateLifecycleJeExactShape(client, {
          operating_company_id: opts.operating_company_id,
          journal_entry_id: jeId,
          factoring_advance_id: opts.factoring_advance_id,
          source_transaction_type: opts.source_transaction_type,
          expected_legs: opts.expected_legs,
          expected_status: expectedStatus,
          expected_entry_date: opts.expected_entry_date,
        });
        if (!shape.ok) {
          return { kind: "invalid", journal_entry_id: null, reason: shape.reason };
        }
      }
      return { kind: "unique", journal_entry_id: jeId };
    }

    // Memo exists but provenance is foreign / partial — fail closed (do not repair, do not re-post).
    const foreign = await client.query<{ id: string }>(
      `
        SELECT je.id::text AS id
          FROM accounting.journal_entries je
         WHERE je.operating_company_id = $1::uuid
           AND je.memo = $2
           AND je.status <> 'voided'
           ${notReversed}
         LIMIT 2
      `,
      [opts.operating_company_id, opts.memo]
    );
    if (foreign.rows.length > 0) {
      return {
        kind: "invalid",
        journal_entry_id: null,
        reason: "memo_collision_with_foreign_or_invalid_provenance",
      };
    }
  }

  return { kind: "none", journal_entry_id: null };
}

/**
 * Attach lifecycle provenance only onto unattributed lines.
 * Never overwrites a different source_transaction_* or contradictory TSL.
 */
export async function attachFactoringLifecycleSourceLinksStrict(
  client: DbClient,
  opts: {
    operating_company_id: string;
    journal_entry_id: string;
    factoring_advance_id: string;
    source_transaction_type: FactoringLifecycleSourceType;
  }
): Promise<void> {
  const conflict = await client.query<{ id: string }>(
    `
      SELECT jep.id::text AS id
        FROM accounting.journal_entry_postings jep
       WHERE jep.journal_entry_uuid = $1::uuid
         AND jep.operating_company_id = $2::uuid
         AND (
               -- Any foreign/partial source attribution (incl. type set + null id) is conflict.
               (
                 (
                   (
                     jep.source_transaction_type IS NOT NULL
                     AND jep.source_transaction_type <> ''
                   )
                   OR jep.source_transaction_id IS NOT NULL
                 )
                 AND NOT (
                   jep.source_transaction_type = $3
                   AND jep.source_transaction_id = $4::text
                 )
               )
               OR EXISTS (
                 SELECT 1
                   FROM accounting.transaction_source_links tsl
                  WHERE tsl.journal_entry_posting_id = jep.id
                    AND tsl.operating_company_id = jep.operating_company_id
                    AND tsl.linked_object_type = 'factoring_advance'
                    AND (
                      tsl.linked_object_id <> $4::text
                      OR tsl.relationship_role IS DISTINCT FROM $3
                    )
               )
             )
       LIMIT 1
    `,
    [
      opts.journal_entry_id,
      opts.operating_company_id,
      opts.source_transaction_type,
      opts.factoring_advance_id,
    ]
  );
  if (conflict.rows[0]?.id) {
    throw new Error("factoring_lifecycle_source_link_conflict");
  }

  await client.query(
    `
      UPDATE accounting.journal_entry_postings
         SET source_transaction_type = $3,
             source_transaction_id = $4
       WHERE journal_entry_uuid = $1::uuid
         AND operating_company_id = $2::uuid
         AND source_transaction_id IS NULL
         AND (
               source_transaction_type IS NULL
               OR source_transaction_type = ''
             )
    `,
    [
      opts.journal_entry_id,
      opts.operating_company_id,
      opts.source_transaction_type,
      opts.factoring_advance_id,
    ]
  );

  const lines = await client.query<{ id: string }>(
    `
      SELECT id::text AS id
        FROM accounting.journal_entry_postings
       WHERE journal_entry_uuid = $1::uuid
         AND operating_company_id = $2::uuid
         AND source_transaction_type = $3
         AND source_transaction_id = $4::text
    `,
    [
      opts.journal_entry_id,
      opts.operating_company_id,
      opts.source_transaction_type,
      opts.factoring_advance_id,
    ]
  );
  for (const line of lines.rows) {
    await writeTransactionSourceLink(client, {
      operating_company_id: opts.operating_company_id,
      journal_entry_posting_id: line.id,
      linked_object_type: "factoring_advance",
      linked_object_id: opts.factoring_advance_id,
      relationship_role: opts.source_transaction_type,
    });
  }
}

/**
 * Claim a unique lifecycle posting key in the caller-owned txn (concurrency backstop).
 * Uses ON CONFLICT DO NOTHING so the loser never leaves the txn aborted (25P02).
 */
export async function claimFactoringLifecyclePostingKey(
  client: DbClient,
  opts: {
    operating_company_id: string;
    factoring_advance_id: string;
    source_transaction_type: FactoringLifecycleSourceType;
    event_key: string;
    journal_entry_id: string;
  }
): Promise<"claimed" | "already_claimed"> {
  const res = await client.query<{ journal_entry_id: string }>(
    `
      INSERT INTO accounting.factoring_lifecycle_posting_keys (
        operating_company_id, factoring_advance_id, source_transaction_type, event_key, journal_entry_id
      )
      VALUES ($1::uuid, $2::uuid, $3, $4, $5::uuid)
      ON CONFLICT (operating_company_id, factoring_advance_id, source_transaction_type, event_key)
      DO NOTHING
      RETURNING journal_entry_id::text AS journal_entry_id
    `,
    [
      opts.operating_company_id,
      opts.factoring_advance_id,
      opts.source_transaction_type,
      opts.event_key,
      opts.journal_entry_id,
    ]
  );
  if (res.rows[0]?.journal_entry_id) return "claimed";
  return "already_claimed";
}

/** Thrown inside afterInsert when a concurrent claimer won — outer savepoint rolls JE back. */
export class FactoringLifecyclePostingKeyRaceError extends Error {
  constructor() {
    super("factoring_lifecycle_posting_key_race");
    this.name = "FactoringLifecyclePostingKeyRaceError";
  }
}

export async function findLifecyclePostingKeyJe(
  client: DbClient,
  opts: {
    operating_company_id: string;
    factoring_advance_id: string;
    source_transaction_type: FactoringLifecycleSourceType;
    event_key: string;
  }
): Promise<string | null> {
  const res = await client.query<{ journal_entry_id: string }>(
    `
      SELECT journal_entry_id::text AS journal_entry_id
        FROM accounting.factoring_lifecycle_posting_keys
       WHERE operating_company_id = $1::uuid
         AND factoring_advance_id = $2::uuid
         AND source_transaction_type = $3
         AND event_key = $4
       LIMIT 1
    `,
    [
      opts.operating_company_id,
      opts.factoring_advance_id,
      opts.source_transaction_type,
      opts.event_key,
    ]
  );
  return res.rows[0]?.journal_entry_id ?? null;
}

/**
 * FAC-VOID-ENUM-2150: an advance's lifecycle can accumulate MORE than one linked posting key --
 * funding, one-or-more factoring_customer_payment installments, factoring_default_interest accruals,
 * a recourse return, etc. -- and nothing in this schema guarantees the advance stays in
 * 'submitted'/'advanced' status until every downstream event is closed out (proven live: a
 * factoring_customer_payment JE posted while an advance was still 'advanced', then the advance was
 * voided anyway). A void/reversal path that looks up only ONE hardcoded event_key (e.g. "funding")
 * leaves every OTHER linked, still-posted JE standing -- the advance reads 'voided' while its own
 * customer-payment leg keeps a live, un-reversed debit sitting on the factoring-advance liability
 * account (2150) forever. This returns every linked posting key for the advance whose JE is STILL
 * posted (not itself already reversed), so a caller can walk and reverse the complete set, not just
 * one assumed leg.
 */
export async function findAllLifecyclePostingKeyJes(
  client: DbClient,
  opts: {
    operating_company_id: string;
    factoring_advance_id: string;
  }
): Promise<Array<{ source_transaction_type: string; event_key: string; journal_entry_id: string }>> {
  const notReversedSql = await liveJournalEntryNotReversedSql(client);
  const res = await client.query<{
    source_transaction_type: string;
    event_key: string;
    journal_entry_id: string;
  }>(
    `
      SELECT plk.source_transaction_type, plk.event_key, plk.journal_entry_id::text AS journal_entry_id
        FROM accounting.factoring_lifecycle_posting_keys plk
        JOIN accounting.journal_entries je ON je.id = plk.journal_entry_id
       WHERE plk.operating_company_id = $1::uuid
         AND plk.factoring_advance_id = $2::uuid
         AND je.status = 'posted'
         AND je.voided_at IS NULL
         ${notReversedSql}
       ORDER BY je.entry_date, plk.created_at
    `,
    [opts.operating_company_id, opts.factoring_advance_id]
  );
  return res.rows;
}
