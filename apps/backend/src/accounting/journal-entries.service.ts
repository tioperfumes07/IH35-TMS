import crypto from "node:crypto";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { writeTransactionSourceLink } from "./accounting-spine-emit.js";
import { withCurrentUser } from "../auth/db.js";
import { enqueueSyncJob } from "../integrations/qbo/qbo-sync.service.js";
import { isEnabled } from "../lib/feature-flags/service.js";
import { pushJournalEntryToQuickBooksImmediateBestEffort } from "./journal-entry-qbo-push.service.js";
import { auditVoid, canVoid, postVoidReversal } from "./void.service.js";

type JournalEntrySource = "manual" | "auto";
type JournalEntryStatus = "posted" | "voided";

type QueryableClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

// Expand/contract (parallel-change) schema compat for the JE reversal-linkage columns.
// reversed_by_je_id / reverses_je_id ship in HELD migration 202607340000, which a prod deploy SKIPS until
// Jorge runs it by hand — so this process must tolerate their absence, or an UNCONDITIONAL read (the JE
// list) would 500 if the code deploys before the migration lands. The columns are additive and never
// dropped, so once we observe them present we cache it for the process lifetime (zero steady-state cost);
// while absent we re-probe cheaply on each call so the code SELF-HEALS the instant the migration is applied.
let reversalLinkageColumnsPresent = false;
async function hasReversalLinkageColumns(client: QueryableClient): Promise<boolean> {
  if (reversalLinkageColumnsPresent) return true;
  const res = await client.query<{ n: number }>(
    `SELECT count(*)::int AS n
       FROM information_schema.columns
      WHERE table_schema = 'accounting'
        AND table_name = 'journal_entries'
        AND column_name IN ('reversed_by_je_id', 'reverses_je_id')`
  );
  const present = Number(res.rows[0]?.n ?? 0) === 2;
  if (present) reversalLinkageColumnsPresent = true;
  return present;
}

// ACCT-LINK-01 — journal_entry_type_id is LIVE on Neon (mig 202607960000 applied).
// Expand/contract retained so fresh DBs before that mig still boot.
let journalEntryTypeColumnPresent = false;
async function hasJournalEntryTypeColumn(client: QueryableClient): Promise<boolean> {
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
 * Used by create path + Neon backfill so auto posters cannot leave journal_entry_type_id NULL.
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

async function resolveJournalEntryTypeId(
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

type CreatePostingInput = {
  account_id: string;
  class_id?: string | null;
  entity_uuid?: string | null;
  /** BANK-F5330 / P23 — discriminator for entity_uuid; migration 202612670000 CHECK-pairs them. */
  entity_type?: "customer" | "vendor" | "driver" | "unit" | null;
  debit_or_credit: "debit" | "credit";
  amount_cents: number;
  description?: string | null;
};

export type CreateJournalEntryInput = {
  operating_company_id: string;
  entry_date: string;
  memo?: string | null;
  source?: JournalEntrySource;
  /** catalogs.journal_entry_types.id — optional; defaults to GENERAL for source=manual when column present */
  journal_entry_type_id?: string | null;
  /** catalogs.journal_entry_types.code — optional alternate to id */
  journal_entry_type_code?: string | null;
  /**
   * ACCT-F210 — is this entry SAMPLE money? Defaults false, so every existing caller is unchanged.
   *
   * This is the choke point the whole sample-tag chain was missing. FAIL-D6 (#4923) made a load
   * taggable, and the two load-derived money paths already inherit it — from-load.ts writes the
   * invoice tag and settlements-load-bookended.service.ts writes the settlement-line tag. The GENERAL
   * LEDGER did not, because createJournalEntry had no way to carry the flag at all, so no poster could
   * pass one. A sample load therefore produced a tagged invoice, tagged settlement lines, and UNTAGGED
   * revenue journal entries -- and the GL is the surface financial statements are built from, so
   * "exclude sample rows from this report" still counted sample revenue as real.
   */
  is_sample_data?: boolean;
  postings: CreatePostingInput[];
};

export type CreateJournalEntryHeader = {
  id: string;
  operating_company_id: string;
  entry_date: string;
  memo: string | null;
  status: JournalEntryStatus;
  source: JournalEntrySource;
  qbo_sync_pending: boolean;
  created_at: string;
};

/**
 * Optional caller-owned transaction hooks (CPA VETO 0280-05 atomic lifecycle links).
 * When `client` is supplied the caller owns BEGIN/COMMIT; side-effect enqueue is suppressed
 * so the caller can enqueue only after a successful outer commit.
 */
export type CreateJournalEntryOptions = {
  client?: QueryableClient;
  /** Runs after JE header+lines+manual TSL, before the owning transaction commits. */
  afterInsertBeforeCommit?: (
    client: QueryableClient,
    header: CreateJournalEntryHeader
  ) => Promise<void>;
  /** When true with a caller-owned client, skip QBO/sync enqueue (caller runs after COMMIT). */
  suppressSideEffects?: boolean;
};

function hashPayload(payload: unknown) {
  return crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

async function triggerWf064OwnerNotification(
  client: { query: (sql: string, values?: unknown[]) => Promise<unknown> },
  actorUserId: string,
  actorRole: string,
  payload: { journal_entry_id: string; operating_company_id: string; source: JournalEntrySource }
) {
  if (payload.source !== "manual" || actorRole === "Owner") return;
  await appendCrudAudit(
    client,
    actorUserId,
    "workflow.requested",
    {
      action_code: "WF-064-ACCT-001",
      workflow_context: "manual_journal_entry_high_risk",
      owner_notification_required: true,
      target_resource_type: "accounting.journal_entries",
      target_resource_id: payload.journal_entry_id,
      operating_company_id: payload.operating_company_id,
    },
    "warning",
    "P5-D4-JE-WF064"
  );
}

/**
 * In-client JE insert primitive (caller-owned transaction). Used by factoring poster so
 * lifecycle source links / reserve movements commit atomically with the JE.
 */
export async function createJournalEntryOnClient(
  client: QueryableClient,
  input: CreateJournalEntryInput,
  actor: { userId: string; role: string },
  options?: Pick<CreateJournalEntryOptions, "afterInsertBeforeCommit">
): Promise<CreateJournalEntryHeader> {
  if (!input.postings?.length || input.postings.length < 2) {
    throw new Error("journal_entry_min_two_lines_required");
  }
  const debits = input.postings
    .filter((line) => line.debit_or_credit === "debit")
    .reduce((sum, line) => sum + Number(line.amount_cents || 0), 0);
  const credits = input.postings
    .filter((line) => line.debit_or_credit === "credit")
    .reduce((sum, line) => sum + Number(line.amount_cents || 0), 0);
  if (debits <= 0 || credits <= 0) throw new Error("journal_entry_requires_debit_and_credit");
  if (debits !== credits) {
    throw new Error("journal_entry_not_balanced");
  }

  await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [input.operating_company_id]);
  const typeColPresent = await hasJournalEntryTypeColumn(client);
  const typeId = typeColPresent
    ? await resolveJournalEntryTypeId(client, {
        journal_entry_type_id: input.journal_entry_type_id,
        journal_entry_type_code: input.journal_entry_type_code,
        source: input.source ?? "manual",
        memo: input.memo ?? null,
      })
    : null;

  const headerRes = typeColPresent
    ? await client.query<CreateJournalEntryHeader>(
        `
      INSERT INTO accounting.journal_entries (
        operating_company_id,
        entry_date,
        memo,
        status,
        source,
        journal_entry_type_id,
        created_by_user_id,
        qbo_sync_pending,
        is_sample_data,
        created_at,
        updated_at
      )
      VALUES ($1,$2::date,$3,'posted',$4,$5::uuid,$6,true,$7,now(),now())
      RETURNING id, operating_company_id::text, entry_date::text, memo, status, source, qbo_sync_pending, created_at::text
    `,
        [
          input.operating_company_id,
          input.entry_date,
          input.memo ?? null,
          input.source ?? "manual",
          typeId,
          actor.userId,
          input.is_sample_data ?? false,
        ]
      )
    : await client.query<CreateJournalEntryHeader>(
        `
      INSERT INTO accounting.journal_entries (
        operating_company_id,
        entry_date,
        memo,
        status,
        source,
        created_by_user_id,
        qbo_sync_pending,
        is_sample_data,
        created_at,
        updated_at
      )
      VALUES ($1,$2::date,$3,'posted',$4,$5,true,$6,now(),now())
      RETURNING id, operating_company_id::text, entry_date::text, memo, status, source, qbo_sync_pending, created_at::text
    `,
        [
          input.operating_company_id,
          input.entry_date,
          input.memo ?? null,
          input.source ?? "manual",
          actor.userId,
          input.is_sample_data ?? false,
        ]
      );
  const header = headerRes.rows[0];
  if (!header?.id) throw new Error("journal_entry_insert_failed");

  let lineSequence = 1;
  for (const posting of input.postings) {
    const lineRes = await client.query<{ id: string }>(
      `
        INSERT INTO accounting.journal_entry_postings (
          operating_company_id,
          journal_entry_uuid,
          line_sequence,
          account_id,
          class_id,
          entity_uuid,
          entity_type,
          debit_or_credit,
          amount_cents,
          description,
          idempotency_key,
          created_at,
          updated_at
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,now(),now())
        ON CONFLICT (operating_company_id, idempotency_key, line_sequence)
          WHERE idempotency_key IS NOT NULL DO NOTHING
        RETURNING id::text
      `,
      [
        input.operating_company_id,
        header.id,
        lineSequence,
        posting.account_id,
        posting.class_id ?? null,
        posting.entity_uuid ?? null,
        // BANK-F5330 / P23 — must travel with entity_uuid: migration 202612670000's CHECK rejects
        // one set without the other.
        posting.entity_type ?? null,
        posting.debit_or_credit,
        posting.amount_cents,
        posting.description ?? null,
        // BLOCK 2: every money insert carries a key. A manual JE has no natural idempotency token,
        // so the key is keyed to its freshly-generated header id (unique per entry) — this populates
        // the column + satisfies the unique-index backstop without changing manual-JE behavior.
        `manual_je:${header.id}`,
      ]
    );
    // CODER-12 audit-spine: one source link per inserted posting line, same transaction. On a
    // BLOCK-2 ON CONFLICT no-op (no row returned) the original line already carries its link → skip.
    const postingId = lineRes.rows[0]?.id;
    if (postingId) {
      await writeTransactionSourceLink(client, {
        operating_company_id: input.operating_company_id,
        journal_entry_posting_id: postingId,
        linked_object_type: "journal_entry",
        linked_object_id: header.id,
        relationship_role: "manual_entry",
      });
    }
    lineSequence += 1;
  }

  // CODER-12 audit-spine: the immutable audit event for this posting is the appendCrudAudit
  // ("accounting.journal_entry.created") call below -> audit.audit_events (the canonical, DB-trigger
  // immutable 5-yr audit log per the blueprint). events.log_event is NOT used (its valid_subject_type
  // CHECK rejects accounting subjects -> would fail-loud + roll back the posting). The per-line
  // source links above are the source->posting traceability half of the spine.
  await appendCrudAudit(
    client,
    actor.userId,
    "accounting.journal_entry.created",
    {
      resource_type: "accounting.journal_entries",
      resource_id: header.id,
      operating_company_id: input.operating_company_id,
      source: input.source ?? "manual",
      debit_total_cents: debits,
      credit_total_cents: credits,
      postings_count: input.postings.length,
    },
    "info",
    "P5-D4-MANUAL-JE"
  );

  await triggerWf064OwnerNotification(client, actor.userId, actor.role, {
    journal_entry_id: header.id,
    operating_company_id: input.operating_company_id,
    source: input.source ?? "manual",
  });

  if (options?.afterInsertBeforeCommit) {
    await options.afterInsertBeforeCommit(client, header);
  }

  return header;
}

export async function createJournalEntry(
  input: CreateJournalEntryInput,
  actor: { userId: string; role: string },
  options?: CreateJournalEntryOptions
) {
  if (!input.postings?.length || input.postings.length < 2) {
    throw new Error("journal_entry_min_two_lines_required");
  }
  const debits = input.postings
    .filter((line) => line.debit_or_credit === "debit")
    .reduce((sum, line) => sum + Number(line.amount_cents || 0), 0);
  const credits = input.postings
    .filter((line) => line.debit_or_credit === "credit")
    .reduce((sum, line) => sum + Number(line.amount_cents || 0), 0);
  if (debits <= 0 || credits <= 0) throw new Error("journal_entry_requires_debit_and_credit");
  if (debits !== credits) {
    throw new Error("journal_entry_not_balanced");
  }

  const created = options?.client
    ? await createJournalEntryOnClient(options.client, input, actor, {
        afterInsertBeforeCommit: options.afterInsertBeforeCommit,
      })
    : await withCurrentUser(actor.userId, async (client) => {
        return createJournalEntryOnClient(client, input, actor, {
          afterInsertBeforeCommit: options?.afterInsertBeforeCommit,
        });
      });

  // [IMPORT-P0 qbo-import-exclusion] This create path only produces TMS-origin JEs (source_system='tms').
  // BOTH downstream push paths — the queue drain (sync-outbound-accounting.ts, drained by cron) and the
  // immediate best-effort push below — consult the shared gate (qbo-je-push-gate.ts): they refuse any
  // non-'tms' source_system (structural) and require QBO_JE_PUSH_ENABLED ON per entity (default OFF).
  // When the caller owns the outer transaction (options.client + suppressSideEffects), enqueue AFTER
  // their COMMIT so a rolled-back JE never leaves a sync job / QBO push artifact.
  if (!(options?.client && options.suppressSideEffects)) {
    await enqueueSyncJob(
      input.operating_company_id,
      "journal_entry",
      created.id,
      hashPayload({
        journal_entry_id: created.id,
        entry_date: input.entry_date,
        source: input.source ?? "manual",
        debit_total_cents: debits,
        credit_total_cents: credits,
      }),
      actor.userId
    );

    void pushJournalEntryToQuickBooksImmediateBestEffort({
      operatingCompanyId: input.operating_company_id,
      journalEntryId: created.id,
    });
  }

  return created;
}

/** Side effects deferred when createJournalEntry ran inside a caller-owned transaction. */
export async function enqueueJournalEntrySideEffects(
  input: Pick<CreateJournalEntryInput, "operating_company_id" | "entry_date" | "source" | "postings">,
  journalEntryId: string,
  actorUserId: string
): Promise<void> {
  const debits = input.postings
    .filter((line) => line.debit_or_credit === "debit")
    .reduce((sum, line) => sum + Number(line.amount_cents || 0), 0);
  const credits = input.postings
    .filter((line) => line.debit_or_credit === "credit")
    .reduce((sum, line) => sum + Number(line.amount_cents || 0), 0);
  // [IMPORT-P0 qbo-import-exclusion] Post-COMMIT enqueue for caller-owned JE txns (same gate as create).
  // Queue drain + immediate push refuse non-'tms' source_system and require QBO_JE_PUSH_ENABLED ON.
  await enqueueSyncJob(
    input.operating_company_id,
    "journal_entry",
    journalEntryId,
    hashPayload({
      journal_entry_id: journalEntryId,
      entry_date: input.entry_date,
      source: input.source ?? "manual",
      debit_total_cents: debits,
      credit_total_cents: credits,
    }),
    actorUserId
  );
  void pushJournalEntryToQuickBooksImmediateBestEffort({
    operatingCompanyId: input.operating_company_id,
    journalEntryId,
  });
}

// AF-7 money-control kill switch: per-entity, default OFF. Gates the void ACTION on a posted journal
// entry (the "void/reversing-JE UX"), independent of VOID_ENFORCEMENT_ENABLED which only controls whether
// a reversing JE posts on void. Enabling is per-entity-only (an explicit tenant override) — see
// db/migrations/202607110320_af7_money_control_flags.sql. When OFF/absent the void action is refused with
// a policy error (no silent no-op); nothing new posts, and the existing void path is otherwise unchanged.
const MONEY_CONTROL_VOID_REVERSAL_FLAG_KEY = "MONEY_CONTROL_VOID_REVERSAL_ENABLED";

export type ReverseJournalEntryNoFlipResult = {
  reversal: Awaited<ReturnType<typeof postVoidReversal>>;
  linkage_written: boolean;
};

/**
 * SHARED reverse-not-flip mechanics for a posted journal entry (GOV-JE-VOID-FIX — the ONE helper called
 * by BOTH the direct voidJournalEntry AND the governance executeJournalEntry, so neither re-implements
 * JE-void). Posts a LINKED reversing JE via postVoidReversal and writes the bidirectional header linkage.
 * The original is NEVER flipped to status='voided' — GL total readers exclude 'voided' (13 sites), so a
 * flip would SILENTLY DROP the original; the reversing JE is what nets the GL to zero.
 *
 * Expand/contract-safe: the reversal-linkage columns ship in HELD migration 202607340000 — when ABSENT
 * the linkage write is skipped (reversal still posts, status still not flipped → GL correct in EVERY
 * migration state); postVoidReversal's void:{type}:{id} idempotency key blocks a second reversal in that
 * pre-migration window. Reuses the EXISTING hasReversalLinkageColumns probe (no new probe).
 *
 * Runs on the CALLER's transaction client. Contains NO gate-flag logic (R2 — each surface keeps its own
 * gate: direct = MONEY_CONTROL_VOID_REVERSAL_ENABLED, governance = VOID_ENFORCEMENT_ENABLED).
 */
export async function reverseJournalEntryNoFlip(
  client: QueryableClient,
  params: {
    operatingCompanyId: string;
    journalEntryId: string;
    reason: string;
    actorUserId: string;
    currentBusinessDate?: string;
  }
): Promise<ReverseJournalEntryNoFlipResult> {
  const { operatingCompanyId, journalEntryId } = params;
  const reason = params.reason.trim();
  const hasLinkage = await hasReversalLinkageColumns(client);

  const existingRes = await client.query<{ status: JournalEntryStatus; entry_date: string; reversed_by_je_id: string | null }>(
    `SELECT status, entry_date::text AS entry_date, ${hasLinkage ? "reversed_by_je_id::text" : "NULL::text"} AS reversed_by_je_id
       FROM accounting.journal_entries
      WHERE id = $1 AND operating_company_id = $2::uuid
      LIMIT 1 FOR UPDATE`,
    [journalEntryId, operatingCompanyId]
  );
  const existing = existingRes.rows[0];
  if (!existing) throw new Error("journal_entry_not_found");
  if (existing.status !== "posted") throw new Error("journal_entry_not_postable");

  // Deterministic retry/recovery lookup. Header linkage is preferred when the additive columns exist;
  // transaction_source_links is the canonical pre-migration fallback written by postVoidReversal.
  // Returning the existing reversal makes retries/crash recovery idempotent; >1 distinct reversal is a
  // fail-loud integrity defect, never a reason to post another JE.
  const existingReversalRes = await client.query<{
    reversal_journal_entry_id: string;
    reversal_date: string;
    reversed_line_count: number;
  }>(
    hasLinkage && existing.reversed_by_je_id
      ? `SELECT je.id::text AS reversal_journal_entry_id, je.entry_date::text AS reversal_date,
                COUNT(jep.id)::int AS reversed_line_count
           FROM accounting.journal_entries je
           JOIN accounting.journal_entry_postings jep ON jep.journal_entry_uuid = je.id
          WHERE je.id = $1::uuid AND je.operating_company_id = $2::uuid
          GROUP BY je.id, je.entry_date`
      : `SELECT jep.journal_entry_uuid::text AS reversal_journal_entry_id,
                je.entry_date::text AS reversal_date,
                COUNT(DISTINCT jep.id)::int AS reversed_line_count
           FROM accounting.transaction_source_links tsl
           JOIN accounting.journal_entry_postings jep ON jep.id = tsl.journal_entry_posting_id
           JOIN accounting.journal_entries je ON je.id = jep.journal_entry_uuid
                                              AND je.operating_company_id = $2::uuid
          WHERE tsl.operating_company_id = $2::uuid
            AND tsl.linked_object_type = 'journal_entry'
            AND tsl.linked_object_id = $1
            AND tsl.relationship_role = 'reversal_of'
          GROUP BY jep.journal_entry_uuid, je.entry_date
          ORDER BY jep.journal_entry_uuid
          LIMIT 2`,
    [existing.reversed_by_je_id ?? journalEntryId, operatingCompanyId]
  );
  if (existingReversalRes.rows.length > 1) throw new Error("journal_entry_multiple_reversals");
  const existingReversal = existingReversalRes.rows[0];
  if (hasLinkage && existing.reversed_by_je_id && !existingReversal) {
    throw new Error("journal_entry_reversal_link_corrupt");
  }
  if (existingReversal) {
    return {
      reversal: {
        reversal_journal_entry_id: existingReversal.reversal_journal_entry_id,
        reversal_date: existingReversal.reversal_date,
        closed_period_reversal: existingReversal.reversal_date !== existing.entry_date,
        reversed_line_count: Number(existingReversal.reversed_line_count),
      },
      linkage_written: hasLinkage,
    };
  }

  const reversal = await postVoidReversal(
    client,
    {
      operatingCompanyId,
      entityType: "journal_entry",
      entityId: journalEntryId,
      originalDate: existing.entry_date,
      memo: `Reversal of journal entry ${journalEntryId}: ${reason}`,
      currentDate: params.currentBusinessDate,
    },
    { userId: params.actorUserId }
  );
  if (!reversal.reversal_journal_entry_id) throw new Error("journal_entry_nothing_to_reverse");

  // Bidirectional header linkage (Linkage-Law). The original is NEVER flipped — status stays 'posted'.
  let linkageWritten = false;
  if (hasLinkage) {
    await client.query(
      `UPDATE accounting.journal_entries SET reversed_by_je_id = $2::uuid, updated_at = now()
         WHERE id = $1 AND operating_company_id = $3::uuid`,
      [journalEntryId, reversal.reversal_journal_entry_id, operatingCompanyId]
    );
    await client.query(
      `UPDATE accounting.journal_entries SET reverses_je_id = $2::uuid, void_reason = $3, updated_at = now()
         WHERE id = $1 AND operating_company_id = $4::uuid`,
      [reversal.reversal_journal_entry_id, journalEntryId, reason, operatingCompanyId]
    );
    linkageWritten = true;
  }
  return { reversal, linkage_written: linkageWritten };
}

export async function voidJournalEntry(
  operatingCompanyId: string,
  journalEntryId: string,
  voidReason: string,
  actor: { userId: string; role: string }
) {
  const result = await withCurrentUser(actor.userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [operatingCompanyId]);

    // AF-7 money-control gate (per-entity, default OFF): refuse the void action unless the owner has
    // enabled it for THIS entity. Resolved before any read/write so an OFF entity can never mutate a JE.
    const voidActionEnabled = await isEnabled(client, MONEY_CONTROL_VOID_REVERSAL_FLAG_KEY, {
      operating_company_id: operatingCompanyId,
      user_uuid: actor.userId,
    });
    if (!voidActionEnabled) throw new Error("void_reversal_disabled");

    // Option 1 (NetSuite/QBO reversing-entry model): voiding a posted JE NEVER mutates/flips the original.
    // It posts a LINKED reversing JE (equal/opposite, status='posted') and records the bidirectional header
    // link; the original stays status='posted'. The GL reports exclude 'voided' (trial-balance /
    // balance-sheet / cash-flow / account-register all filter `je.status <> 'voided'`), so a status flip
    // would SILENTLY DROP the entry from the GL — which is why the flip model is unsafe and this reverses.
    if (!canVoid(actor.role)) throw new Error("forbidden_void_owner_or_accountant_only");
    // Mandatory non-empty reason (audit/GAAP requirement) — enforced server-side, not just in the UI.
    if (!voidReason || !voidReason.trim()) throw new Error("void_reason_required");

    // Option-1 void REQUIRES the reversal-linkage columns. The per-entity money-control flag above already
    // gates this path (verify-then-flip means the HELD migration is applied before an entity is flipped ON),
    // but if it were ever reached pre-migration, fail cleanly (503) instead of a raw missing-column SQL error.
    if (!(await hasReversalLinkageColumns(client))) throw new Error("journal_entry_reversal_columns_unavailable");

    // Reverse-not-flip via the SHARED helper (the SAME mechanics the governance JE-void path uses now).
    // The original is NEVER flipped to 'voided' — postVoidReversal posts the equal/opposite JE and the
    // bidirectional header linkage is written inside the helper.
    const { reversal } = await reverseJournalEntryNoFlip(client, {
      operatingCompanyId,
      journalEntryId,
      reason: voidReason,
      actorUserId: actor.userId,
    });

    // Immutable audit-log row (who / when / why).
    await auditVoid(client, actor.userId, "journal_entry", {
      operatingCompanyId,
      entityId: journalEntryId,
      reason: voidReason.trim(),
      reversal,
    });

    return {
      ok: true,
      reversal_journal_entry_id: reversal.reversal_journal_entry_id,
      reversal_date: reversal.reversal_date,
      closed_period_reversal: reversal.closed_period_reversal,
    };
  });

  // [IMPORT-P0 qbo-import-exclusion] Void of a TMS-origin JE. Both push paths (queue drain + immediate)
  // consult the shared gate: they refuse any non-'tms' source_system and require QBO_JE_PUSH_ENABLED ON
  // per entity (default OFF). Imported entries never reach here anyway.
  await enqueueSyncJob(
    operatingCompanyId,
    "journal_entry",
    journalEntryId,
    hashPayload({ journal_entry_id: journalEntryId, action: "void" }),
    actor.userId
  );
  return result;
}

/**
 * ACCT-F18 — Law §9 reverse hop: journal entry → banking.bank_transactions.
 * Bank-recon accept stamps banking.bank_transactions.matched_journal_entry_id.
 * Entity-scoped — never cross opco.
 */
const JE_MATCHED_BANK_TRANSACTION_ID_SQL = `
  (
    SELECT bt.id::text
    FROM banking.bank_transactions bt
    WHERE bt.operating_company_id = je.operating_company_id
      AND bt.matched_journal_entry_id = je.id
    ORDER BY bt.transaction_date DESC, bt.created_at DESC
    LIMIT 1
  )
`;

/** Same hop as ID — merchant/description so JE Bank column is not a UUID tombstone. */
const JE_MATCHED_BANK_TRANSACTION_LABEL_SQL = `
  (
    SELECT COALESCE(NULLIF(bt.merchant_name, ''), NULLIF(bt.description, ''))
    FROM banking.bank_transactions bt
    WHERE bt.operating_company_id = je.operating_company_id
      AND bt.matched_journal_entry_id = je.id
    ORDER BY bt.transaction_date DESC, bt.created_at DESC
    LIMIT 1
  )
`;

export async function listJournalEntries(input: {
  userId: string;
  operating_company_id: string;
  source?: JournalEntrySource;
  status?: JournalEntryStatus;
  account_id?: string;
  from_date?: string;
  to_date?: string;
  limit: number;
  offset: number;
}) {
  return withCurrentUser(input.userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [input.operating_company_id]);
    const values: unknown[] = [input.operating_company_id];
    const filters: string[] = ["je.operating_company_id = $1::uuid"];
    if (input.source) {
      values.push(input.source);
      filters.push(`je.source = $${values.length}`);
    }
    if (input.status) {
      values.push(input.status);
      filters.push(`je.status = $${values.length}`);
    }
    if (input.from_date) {
      values.push(input.from_date);
      filters.push(`je.entry_date >= $${values.length}::date`);
    }
    if (input.to_date) {
      values.push(input.to_date);
      filters.push(`je.entry_date <= $${values.length}::date`);
    }
    if (input.account_id) {
      values.push(input.account_id);
      filters.push(`EXISTS (
        SELECT 1 FROM accounting.journal_entry_postings p
        WHERE p.journal_entry_uuid = je.id
          AND p.account_id = $${values.length}
      )`);
    }
    values.push(input.limit, input.offset);
    // Reversal-linkage columns are HELD-migration-gated (see hasReversalLinkageColumns): select them when
    // present, else NULL so a pre-migration prod cannot 500 the list. Both forms yield the same output
    // columns; the boolean is server-derived (no user input), so interpolation here is injection-safe.
    const linkageCols = (await hasReversalLinkageColumns(client))
      ? "je.reversed_by_je_id::text,\n          je.reverses_je_id::text,"
      : "NULL::text AS reversed_by_je_id,\n          NULL::text AS reverses_je_id,";
    const res = await client.query(
      `
        SELECT
          je.id,
          je.operating_company_id::text,
          je.entry_date::text,
          je.memo,
          je.status,
          je.source,
          je.created_by_user_id::text,
          je.voided_at::text,
          je.void_reason,
          ${linkageCols}
          je.qbo_journal_entry_id,
          je.qbo_sync_pending,
          je.created_at::text,
          je.updated_at::text,
          ${JE_MATCHED_BANK_TRANSACTION_ID_SQL} AS matched_bank_transaction_id,
          ${JE_MATCHED_BANK_TRANSACTION_LABEL_SQL} AS matched_bank_transaction_description,
          COALESCE(SUM(CASE WHEN p.debit_or_credit = 'debit' THEN p.amount_cents ELSE 0 END),0)::bigint AS debit_total_cents,
          COALESCE(SUM(CASE WHEN p.debit_or_credit = 'credit' THEN p.amount_cents ELSE 0 END),0)::bigint AS credit_total_cents
        FROM accounting.journal_entries je
        LEFT JOIN accounting.journal_entry_postings p ON p.journal_entry_uuid = je.id
        WHERE ${filters.join(" AND ")}
        GROUP BY je.id
        ORDER BY je.entry_date DESC, je.created_at DESC
        LIMIT $${values.length - 1}
        OFFSET $${values.length}
      `,
      values
    );
    return res.rows;
  });
}

/**
 * Reverse drill-through: "what posted this journal entry" — the source object(s) tied to each
 * posting line. Reads BOTH source-tracking mechanisms that exist on the real schema (verified against
 * db/migrations/0195_accounting_posting_backbone_schema.sql — accounting.journal_entries itself has
 * NO source_type/source_id columns; there is no migration gap here):
 *   1. accounting.journal_entry_postings.source_transaction_type / source_transaction_id — set directly
 *      by some posting flows (e.g. the posting engine's batch inserts).
 *   2. accounting.transaction_source_links — one row per posting line, written via
 *      writeTransactionSourceLink() (journal-entries.service.ts manual-JE path, void.service.ts reversals,
 *      amortization/lease/settlement posting, etc.).
 * LEFT JOINed so a posting line with only mechanism (1) still returns a row.
 */
export async function getJournalEntrySourceLinks(userId: string, operatingCompanyId: string, journalEntryId: string) {
  return withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [operatingCompanyId]);
    const headerRes = await client.query(
      `SELECT id FROM accounting.journal_entries WHERE id = $1 AND operating_company_id = $2::uuid LIMIT 1`,
      [journalEntryId, operatingCompanyId]
    );
    if (!headerRes.rows[0]) throw new Error("journal_entry_not_found");

    // LV-JE-SOURCE-LINKS-INVOICE-NOT-VISIBLE (audit row 1295/board): neither source_transaction_id
    // nor linked_object_id ever carried a display name, so JournalEntryDetailPage.tsx's reverse-link
    // always rendered the honest-but-avoidable "Source — not visible" tombstone for every row, even
    // for the two most common real source types (invoice=38, bill=84 rows repo-wide at audit time).
    // Both id columns are TEXT (verified live: information_schema.columns), never uuid — accounting.
    // invoices.id / accounting.bills.id ARE uuid, so every join below casts the uuid side ::text
    // (never the reverse), per this session's established uuid=text safe-cast direction. Scoped to
    // invoice + bill + (ACCT-F5682) bank_categorization — the other ~14 linked_object_type values
    // observed live (fuel_event, depreciation_schedule_row, loan_amortization_row, etc.) need their
    // own per-table verification before a display column is added for them; this is not a corner
    // cut, it is the guarded scope.
    //
    // ACCT-F5682 — LV-BANK-CATEGORIZE-REVERSE-LINK-IS-A-MEMO-STRING re-verified: the row's own
    // premise ("the ONLY row-level pointer back is a UUID inside free-text memo prose") is FALSE
    // against current live data — jep.source_transaction_type='bank_categorization' AND
    // source_transaction_id=<bank_transactions.id> already exist as a structured column pair
    // (maybePostBankCategorizationToGl's own postSourceTransaction call sets them), no memo parsing
    // required. The real remaining gap this closes is narrower: bank_categorization never got a
    // resolved DISPLAY NAME here, same class as the other unresolved linked_object_types.
    // banking.bank_transactions.id is uuid — cast ::text on the uuid side, same direction as above.
    const res = await client.query(
      `
        SELECT
          jep.id AS journal_entry_posting_id,
          jep.line_sequence,
          jep.source_transaction_type,
          CASE
            WHEN jep.source_transaction_type IN ('customer_payment', 'payment') THEN 'payment'
            WHEN jep.source_transaction_type = 'bill_payment' THEN 'bill_payment'
            WHEN jep.source_transaction_type = 'driver_advance' THEN 'cash_advance'
            WHEN jep.source_transaction_type IN ('prepaid_asset', 'prepaid_amortization') THEN 'prepaid_asset'
            WHEN jep.source_transaction_type IN ('fixed_asset', 'fixed_asset_depreciation') THEN 'fixed_asset'
            WHEN jep.source_transaction_type = 'loan' THEN 'finance_loan'
            WHEN jep.source_transaction_type = 'lease_contract' THEN 'lease_contract'
            WHEN jep.source_transaction_type = 'recurring_template' THEN 'recurring_template'
            WHEN jep.source_transaction_type = 'period_close' THEN 'period_close'
            WHEN jep.source_transaction_type IN ('prepaid_amortization_row', 'depreciation_schedule_row', 'loan_amortization_row') THEN jep.source_transaction_type
            WHEN jep.source_transaction_type IN ('factoring_customer_payment', 'factoring_chargeback', 'factoring_reserve_release', 'factoring_default_interest') THEN 'factoring_advance'
            WHEN jep.source_transaction_type = 'loan_payment' THEN 'finance_loan'
            WHEN jep.source_transaction_type = 'prepaid_purchase' THEN 'prepaid_asset'
            ELSE jep.source_transaction_type
          END AS source_entity_kind,
          jep.source_transaction_id,
          jep.source_transaction_line_id,
          jep.posting_batch_id::text,
          tsl.id AS source_link_id,
          tsl.linked_object_type,
          CASE
            WHEN tsl.linked_object_type IN ('customer_payment', 'payment') THEN 'payment'
            WHEN tsl.linked_object_type = 'bill_payment' THEN 'bill_payment'
            WHEN tsl.linked_object_type = 'driver_advance' THEN 'cash_advance'
            WHEN tsl.linked_object_type IN ('prepaid_asset', 'prepaid_amortization') THEN 'prepaid_asset'
            WHEN tsl.linked_object_type IN ('fixed_asset', 'fixed_asset_depreciation') THEN 'fixed_asset'
            WHEN tsl.linked_object_type = 'loan' THEN 'finance_loan'
            WHEN tsl.linked_object_type = 'lease_contract' THEN 'lease_contract'
            WHEN tsl.linked_object_type = 'recurring_template' THEN 'recurring_template'
            WHEN tsl.linked_object_type = 'period_close' THEN 'period_close'
            WHEN tsl.linked_object_type IN ('prepaid_amortization_row', 'depreciation_schedule_row', 'loan_amortization_row') THEN tsl.linked_object_type
            WHEN tsl.linked_object_type IN ('factoring_customer_payment', 'factoring_chargeback', 'factoring_reserve_release', 'factoring_default_interest') THEN 'factoring_advance'
            WHEN tsl.linked_object_type = 'loan_payment' THEN 'finance_loan'
            WHEN tsl.linked_object_type = 'prepaid_purchase' THEN 'prepaid_asset'
            ELSE tsl.linked_object_type
          END AS linked_object_entity_kind,
          tsl.linked_object_id,
          tsl.relationship_role,
          tsl.created_at::text AS source_link_created_at,
          -- JE-SOURCE-LINKS-BILL-USES-WRONG-COLUMN: accounting.bills.display_id is a near-dead
          -- column (12 of 16,298 rows populated, 0.07%) — the real bill identity is bill_number
          -- (15,750 of 16,298, 96.6%), same convention every other bill-label call site in this repo
          -- already uses (audit-reports.routes.ts, spine-events.routes.ts, transaction-register.routes.ts,
          -- bank-recon/match.service.ts). Reading display_id alone meant this JE source-link resolver
          -- tombstoned "Source — not visible" for essentially every bill-sourced journal entry, even
          -- though the href it builds from source_transaction_id was already correct.
          COALESCE(src_inv.display_id, src_bill.display_id, src_bill.bill_number, src_banktx.display_label) AS source_transaction_display_id,
          COALESCE(link_inv.display_id, link_bill.display_id, link_bill.bill_number) AS linked_object_display_id
        FROM accounting.journal_entry_postings jep
        LEFT JOIN accounting.transaction_source_links tsl ON tsl.journal_entry_posting_id = jep.id
        LEFT JOIN accounting.invoices src_inv
          ON jep.source_transaction_type = 'invoice'
          AND src_inv.id::text = jep.source_transaction_id
          AND src_inv.operating_company_id = $2::uuid
        LEFT JOIN accounting.bills src_bill
          ON jep.source_transaction_type = 'bill'
          AND src_bill.id::text = jep.source_transaction_id
          AND src_bill.operating_company_id = $2::uuid
        LEFT JOIN LATERAL (
          SELECT COALESCE(bt.merchant_name, bt.description, 'Bank transaction') AS display_label
          FROM banking.bank_transactions bt
          WHERE jep.source_transaction_type = 'bank_categorization'
            AND bt.id::text = jep.source_transaction_id
            AND bt.operating_company_id = $2::uuid
          LIMIT 1
        ) src_banktx ON true
        LEFT JOIN accounting.invoices link_inv
          ON tsl.linked_object_type = 'invoice'
          AND link_inv.id::text = tsl.linked_object_id
          AND link_inv.operating_company_id = $2::uuid
        LEFT JOIN accounting.bills link_bill
          ON tsl.linked_object_type = 'bill'
          AND link_bill.id::text = tsl.linked_object_id
          AND link_bill.operating_company_id = $2::uuid
        WHERE jep.journal_entry_uuid = $1
          AND jep.operating_company_id = $2::uuid
        ORDER BY jep.line_sequence ASC, tsl.created_at ASC NULLS LAST
      `,
      [journalEntryId, operatingCompanyId]
    );
    return res.rows;
  });
}

export async function getJournalEntryDetail(userId: string, operatingCompanyId: string, journalEntryId: string) {
  return withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [operatingCompanyId]);
    const typeColPresent = await hasJournalEntryTypeColumn(client);
    const typeSelect = typeColPresent
      ? `je.journal_entry_type_id::text,
          jet.code AS journal_entry_type_code,
          jet.display_name AS journal_entry_type_name,`
      : `NULL::text AS journal_entry_type_id,
          NULL::text AS journal_entry_type_code,
          NULL::text AS journal_entry_type_name,`;
    const typeJoin = typeColPresent ? "LEFT JOIN catalogs.journal_entry_types jet ON jet.id = je.journal_entry_type_id" : "";
    const headerRes = await client.query(
      `
        SELECT
          je.id,
          je.operating_company_id::text,
          je.entry_date::text,
          je.memo,
          je.status,
          je.source,
          je.created_by_user_id::text,
          je.voided_at::text,
          je.voided_by_user_id::text,
          je.void_reason,
          ${typeSelect}
          je.qbo_journal_entry_id,
          je.qbo_sync_pending,
          je.created_at::text,
          je.updated_at::text,
          ${JE_MATCHED_BANK_TRANSACTION_ID_SQL} AS matched_bank_transaction_id,
          ${JE_MATCHED_BANK_TRANSACTION_LABEL_SQL} AS matched_bank_transaction_description
        FROM accounting.journal_entries je
        ${typeJoin}
        WHERE je.id = $1
          AND je.operating_company_id = $2::uuid
        LIMIT 1
      `,
      [journalEntryId, operatingCompanyId]
    );
    const header = headerRes.rows[0];
    if (!header) throw new Error("journal_entry_not_found");
    const postingsRes = await client.query(
      `
        SELECT
          p.id,
          p.journal_entry_uuid::text,
          p.line_sequence,
          p.account_id::text,
          a.account_number,
          a.account_name,
          p.class_id::text,
          c.class_name,
          p.entity_uuid::text,
          p.entity_type,
          p.debit_or_credit,
          p.amount_cents,
          p.description
        FROM accounting.journal_entry_postings p
        -- ENTITY PREDICATE ON THE JOINS (CLS-JOIN-ENTITY-UNSCOPED). Scoping the POSTING does not scope
        -- the account or class it resolves to. Both catalogs.accounts and catalogs.classes carry
        -- operating_company_id (verified on prod), and RLS is not a backstop: the policy admits
        -- org.user_accessible_company_ids(), which returns EVERY active company when the role is Owner.
        -- Unscoped, this GL detail screen could label a posting with another entity's account name or
        -- class — on the ledger, where the name IS the audit trail.
        LEFT JOIN catalogs.accounts a ON a.id = p.account_id
                                     AND a.operating_company_id = p.operating_company_id
        LEFT JOIN catalogs.classes c ON c.id = p.class_id
                                    AND c.operating_company_id = p.operating_company_id
        WHERE p.journal_entry_uuid = $1
          AND p.operating_company_id = $2::uuid
        ORDER BY p.line_sequence ASC, p.created_at ASC
      `,
      [journalEntryId, operatingCompanyId]
    );
    return { ...header, postings: postingsRes.rows };
  });
}
