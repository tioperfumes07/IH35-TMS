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
 * Find a unique already-posted JE for (entity, lifecycle source type, advance)
 * that is posted, balanced, and free of contradictory source/TSL provenance.
 * Memo is an optional hint only when postings are still unattributed.
 */
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
  }
): Promise<LifecycleRepairCandidate> {
  const expectedStatus = opts.expected_status ?? "posted";
  if (!isLifecycleType(opts.source_transaction_type)) {
    return { kind: "invalid", journal_entry_id: null, reason: "invalid_lifecycle_source_type" };
  }

  const authoritative = await client.query<{ id: string }>(
    `
      SELECT je.id::text AS id
        FROM accounting.journal_entries je
       WHERE je.operating_company_id = $1::uuid
         AND je.status = $4
         AND je.source = 'auto'
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
       ORDER BY je.created_at ASC, je.id ASC
    `,
    [
      opts.operating_company_id,
      opts.source_transaction_type,
      opts.factoring_advance_id,
      expectedStatus,
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
    return { kind: "unique", journal_entry_id: authoritative.rows[0]!.id };
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
           AND NOT EXISTS (
                 SELECT 1
                   FROM accounting.journal_entry_postings jep
                  WHERE jep.journal_entry_uuid = je.id
                    AND jep.operating_company_id = je.operating_company_id
                    AND jep.source_transaction_id IS NOT NULL
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
      return { kind: "unique", journal_entry_id: unlinked.rows[0]!.id };
    }

    // Memo exists but provenance is foreign / partial — fail closed (do not repair, do not re-post).
    const foreign = await client.query<{ id: string }>(
      `
        SELECT je.id::text AS id
          FROM accounting.journal_entries je
         WHERE je.operating_company_id = $1::uuid
           AND je.memo = $2
           AND je.status <> 'voided'
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
               (
                 jep.source_transaction_id IS NOT NULL
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

/** Claim a unique lifecycle posting key in the caller-owned txn (concurrency backstop). */
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
  try {
    await client.query(
      `
        INSERT INTO accounting.factoring_lifecycle_posting_keys (
          operating_company_id, factoring_advance_id, source_transaction_type, event_key, journal_entry_id
        )
        VALUES ($1::uuid, $2::uuid, $3, $4, $5::uuid)
      `,
      [
        opts.operating_company_id,
        opts.factoring_advance_id,
        opts.source_transaction_type,
        opts.event_key,
        opts.journal_entry_id,
      ]
    );
    return "claimed";
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === "23505") return "already_claimed";
    throw e;
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
