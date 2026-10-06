import { assertNoHistoricalJournalCoverage } from "../driver-finance/settlement-historical-attribution.service.js";
import crypto from "node:crypto";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { insertPostingLineWithSpineIfNew } from "./posting-line-writer.js";
import { withCurrentUser } from "../auth/db.js";
import { enqueueSyncJob } from "../integrations/qbo/qbo-sync.service.js";
import { isEnabled } from "../lib/feature-flags/service.js";
import { pushJournalEntryToQuickBooksImmediateBestEffort } from "./journal-entry-qbo-push.service.js";
import { auditVoid, canVoid, postVoidReversal, releaseBankLinesNamingDocument, resolveReversalDate, todayIso } from "./void.service.js";
// ACCT-PERIOD-CLOSE-01: this manual/API create path was the one JE-insert choke point with no
// closed-period check at all -- accounting.periods' DB triggers (migration 0183) already block the
// raw INSERT as a last resort, but this call gives a clean, typed PostingEngineError("PERIOD_LOCKED")
// refusal before the DB round-trip, matching every other poster's own ensureOpenPeriod call.
import { ensureOpenPeriod } from "./posting-engine.service.js";
// ACCT-LINK-01 regression fix (GO-1405 Recipe B, 2026-08-29): the type-resolution helpers moved to
// this leaf module so void.service.ts (which this file already imports FROM) and every other
// direct-insert poster can use them too without an import cycle. Re-exported here so this file's
// existing internal callers and any external importer of the old location keep working unchanged.
import {
  hasJournalEntryTypeColumn,
  inferJournalEntryTypeCode,
  resolveJournalEntryTypeId,
  type QueryableClient,
} from "./journal-entry-type-resolver.js";

/**
 * LST-F416 (ROUND 390.3) — the human words for an entry in a reversal / restore memo. The link to the original is
 * structural (reverses_je_id, reversal_of_line_id), never a raw id in prose: an operator reads "journal entry of
 * 2026-10-06 ("Fuel — unit T-101")", not a UUID.
 */
export function describeJournalEntry(entryDate: string | null | undefined, memo: string | null | undefined): string {
  const date = (entryDate ?? "").slice(0, 10);
  const label = (memo ?? "").trim().replace(/\s+/g, " ");
  const short = label.length > 80 ? `${label.slice(0, 77)}...` : label;
  return `journal entry of ${date || "(no date)"}${short ? ` ("${short}")` : ""}`;
}
export { hasJournalEntryTypeColumn, inferJournalEntryTypeCode, resolveJournalEntryTypeId, type QueryableClient };

type JournalEntrySource = "manual" | "auto";
type JournalEntryStatus = "posted" | "voided";

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

type CreatePostingInput = {
  /** U24 / LAW 363.3 — an explicit load stamp for this line (the reclassify engine's load move: the reversing leg keeps
   *  the old load, the reposting leg carries the new one). Absent = the stamp from the posting's source document. */
  load_id?: string | null;
  account_id: string;
  class_id?: string | null;
  /** BANK-F91052 — QBO Location (mdata.locations); nullable reporting dimension. */
  location_id?: string | null;
  entity_uuid?: string | null;
  /** BANK-F5330 / P23 — discriminator for entity_uuid; migration 202612670000 CHECK-pairs them. */
  entity_type?: "customer" | "vendor" | "driver" | "unit" | null;
  debit_or_credit: "debit" | "credit";
  amount_cents: number;
  description?: string | null;
  /** The document this line posts for (e.g. "invoice" + the invoice id). Both or neither. */
  source_transaction_type?: string | null;
  source_transaction_id?: string | null;
  /** ROUND 393.2 — the document LINE this posting is for (the reclassify engine names it so the load resolves per line). */
  source_transaction_line_id?: string | null;
  /** ROUND 393.2 — this posting undoes that one (a reclass out-leg); its load resolves to the reversed line's load. */
  reversal_of_line_id?: string | null;
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
  /**
   * The document the whole entry posts for, applied to every line that does not name its own.
   * Required for source="auto": an automated entry whose lines are still unsourced after
   * afterInsertBeforeCommit is refused. A hand-keyed entry (source="manual") with none is its own
   * source document ("manual_je", its id). ("journal_entry" already means "posts for another JE".)
   */
  source_transaction_type?: string | null;
  source_transaction_id?: string | null;
  /**
   * ROUND 393.2 — what the spine row of each line names, when it is not the source document itself (the factoring
   * lifecycle names the factoring_advance, with the lifecycle type as its role). Omitted: the source document, as the
   * one posting-line writer does by default. Never applies to a hand-keyed entry (that one names the journal entry).
   */
  spine_link?: { linked_object_type: string; linked_object_id: string } | null;
  relationship_role?: string | null;
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
  for (const line of input.postings) {
    const type = line.source_transaction_type ?? input.source_transaction_type ?? null;
    const id = line.source_transaction_id ?? input.source_transaction_id ?? null;
    if (!type !== !id) throw new Error("journal_entry_posting_source_pair_incomplete");
  }
  const isHandKeyed = (input.source ?? "manual") === "manual";

  await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [input.operating_company_id]);
  await ensureOpenPeriod(client, input.operating_company_id, input.entry_date);
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
    // ROUND 393.2 — the one posting-line writer: the line and its spine row together. BLOCK 2: every money insert
    // carries a key; a manual JE has no natural token, so the key is its freshly-generated header id, and a replay of the
    // same (key, line) writes nothing and no second link (insertPostingLineWithSpineIfNew).
    // The line's source is the REAL document an automated caller names; only a hand-keyed entry is its own source
    // (manual_je = this header), and its spine row keeps naming the journal entry as a manual entry.
    const sourceType = posting.source_transaction_type ?? input.source_transaction_type ?? (isHandKeyed ? "manual_je" : null);
    const sourceId = posting.source_transaction_id ?? input.source_transaction_id ?? (isHandKeyed ? header.id : null);
    // An automated entry names its source document up front — the writer refuses an unsourced line at INSERT, so the
    // old pattern of stamping the source after the insert (afterInsertBeforeCommit) is gone; the factoring lifecycle,
    // its only user, now passes its source in. The refusal keeps this service's own error code.
    if (!sourceType || !sourceId) throw new Error("journal_entry_posting_source_required");
    await insertPostingLineWithSpineIfNew(client, {
      operating_company_id: input.operating_company_id,
      journal_entry_uuid: header.id,
      line_sequence: lineSequence,
      account_id: posting.account_id,
      class_id: posting.class_id ?? null,
      location_id: posting.location_id ?? null,
      entity_uuid: posting.entity_uuid ?? null,
      // BANK-F5330 / P23 — must travel with entity_uuid: migration 202612670000's CHECK rejects one set without the other.
      entity_type: posting.entity_type ?? null,
      debit_or_credit: posting.debit_or_credit,
      amount_cents: posting.amount_cents,
      description: posting.description ?? null,
      idempotency_key: `manual_je:${header.id}`,
      source_transaction_type: sourceType as string,
      source_transaction_id: sourceId as string,
      source_transaction_line_id: posting.source_transaction_line_id ?? null,
      reversal_of_line_id: posting.reversal_of_line_id ?? null,
      load_id: posting.load_id ?? null,
      ...(sourceType === "manual_je"
        ? { spine_link: { linked_object_type: "journal_entry", linked_object_id: header.id }, relationship_role: "manual_entry" }
        : {
            ...(input.spine_link ? { spine_link: input.spine_link } : {}),
            ...(input.relationship_role ? { relationship_role: input.relationship_role } : {}),
          }),
    });
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

  // Every posting names the document it posts for. A line still unsourced here — not set at insert,
  // not stamped by afterInsertBeforeCommit — is refused, and the throw rolls the whole entry back.
  const unsourced = await client.query<{ n: string }>(
    `SELECT count(*)::text AS n
       FROM accounting.journal_entry_postings
      WHERE journal_entry_uuid = $1
        AND (source_transaction_type IS NULL OR source_transaction_id IS NULL)`,
    [header.id]
  );
  if (Number(unsourced.rows[0]?.n ?? 0) > 0) {
    throw new Error("journal_entry_posting_source_required");
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

  const existingRes = await client.query<{ status: JournalEntryStatus; entry_date: string; reversed_by_je_id: string | null; memo: string | null }>(
    `SELECT status, entry_date::text AS entry_date, ${hasLinkage ? "reversed_by_je_id::text" : "NULL::text"} AS reversed_by_je_id, memo
       FROM accounting.journal_entries
      WHERE id = $1 AND operating_company_id = $2::uuid
      LIMIT 1 FOR UPDATE`,
    [journalEntryId, operatingCompanyId]
  );
  const existing = existingRes.rows[0];
  if (!existing) throw new Error("journal_entry_not_found");
  if (existing.status !== "posted") throw new Error("journal_entry_not_postable");
  await assertNoHistoricalJournalCoverage(client, operatingCompanyId, journalEntryId);

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
      memo: `Reversal of ${describeJournalEntry(existing.entry_date, existing.memo)}: ${reason}`,
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

/**
 * ROUND 390.1 — RESTORE what a reversing entry cancelled, WITHOUT reversing a reversal.
 *
 * A reversal line is terminal (posting-line-writer refuses a line whose reversal_of_line_id names another reversal), so
 * the two paths whose PURPOSE is to bring reversed money back — reinstating a voided document, and undoing a reclassify
 * — cannot "void the void's reversing JE" any more. This posts the same economics as that old reverse-of-reversal, in a
 * shape the ledger can trust: for each line L of the reversing entry X,
 *   - L is a reversal (reversal_of_line_id = O): a FRESH copy of the original line O (its account, side, amount,
 *     dimensions, source document and load) — a new live line, not a reversal of L;
 *   - L is an ordinary line (a reclassify in-leg): its normal reversal (reversal_of_line_id = L), which is allowed.
 * Dated like any reversal (the entry's date, or today when that period is closed). Bidirectional header link
 * (X.reversed_by_je_id / new.reverses_je_id) so a retry returns the existing restore. Only reinstate and reclassify
 * undo call this — a raw void of a reversing entry stays refused.
 */
export async function restoreReversedJournalEntryInClientTx(
  client: QueryableClient,
  params: { operatingCompanyId: string; journalEntryId: string; reason: string; actorUserId: string; actorRole?: string }
): Promise<{ restore_journal_entry_id: string; restore_date: string; already_restored: boolean }> {
  const { operatingCompanyId, journalEntryId } = params;
  const reason = params.reason.trim();
  const head = await client.query<{ status: string; entry_date: string; reversed_by_je_id: string | null; is_sample_data: boolean | null; memo: string | null }>(
    `SELECT status, entry_date::text AS entry_date, reversed_by_je_id::text, is_sample_data, memo
       FROM accounting.journal_entries WHERE id = $1::uuid AND operating_company_id = $2::uuid LIMIT 1 FOR UPDATE`,
    [journalEntryId, operatingCompanyId]
  );
  const x = head.rows[0];
  if (!x) throw new Error("journal_entry_not_found");
  if (x.status !== "posted") throw new Error("journal_entry_not_postable");
  if (x.reversed_by_je_id) {
    const prior = await client.query<{ entry_date: string }>(`SELECT entry_date::text AS entry_date FROM accounting.journal_entries WHERE id = $1::uuid`, [x.reversed_by_je_id]);
    return { restore_journal_entry_id: x.reversed_by_je_id, restore_date: prior.rows[0]?.entry_date ?? x.entry_date, already_restored: true };
  }
  const lines = await client.query<{
    id: string; account_id: string; debit_or_credit: "debit" | "credit"; amount_cents: string; description: string | null;
    class_id: string | null; location_id: string | null; entity_uuid: string | null; entity_type: string | null; load_id: string | null;
    source_transaction_type: string | null; source_transaction_id: string | null; source_transaction_line_id: string | null;
    o_id: string | null; o_account_id: string | null; o_side: "debit" | "credit" | null; o_amount_cents: string | null; o_description: string | null;
    o_class_id: string | null; o_location_id: string | null; o_entity_uuid: string | null; o_entity_type: string | null; o_load_id: string | null;
    o_source_type: string | null; o_source_id: string | null; o_source_line_id: string | null; o_reversed_by: string | null;
  }>(
    `SELECT l.id::text, l.account_id::text, l.debit_or_credit, l.amount_cents::text, l.description,
            l.class_id::text, l.location_id::text, l.entity_uuid::text, l.entity_type, l.load_id::text,
            l.source_transaction_type, l.source_transaction_id, l.source_transaction_line_id,
            o.id::text AS o_id, o.account_id::text AS o_account_id, o.debit_or_credit AS o_side, o.amount_cents::text AS o_amount_cents,
            o.description AS o_description, o.class_id::text AS o_class_id, o.location_id::text AS o_location_id,
            o.entity_uuid::text AS o_entity_uuid, o.entity_type AS o_entity_type, o.load_id::text AS o_load_id,
            o.source_transaction_type AS o_source_type, o.source_transaction_id AS o_source_id, o.source_transaction_line_id AS o_source_line_id,
            o.reversed_by_line_id::text AS o_reversed_by
       FROM accounting.journal_entry_postings l
       LEFT JOIN accounting.journal_entry_postings o ON o.id = l.reversal_of_line_id
      WHERE l.journal_entry_uuid = $1::uuid AND l.operating_company_id = $2::uuid
      ORDER BY l.line_sequence`,
    [journalEntryId, operatingCompanyId]
  );
  if (!lines.rows.length) throw new Error("journal_entry_nothing_to_restore");
  // AUTH-400 rehearsal — a fresh copy is written only for an original this entry ACTUALLY cancelled: its own
  // reversed_by_line_id must name this entry's reversal line. An original that is still live (a one-sided link — the
  // reclassify defect fixed in the posting-line writer) would be duplicated: the rehearsal produced two live $24.59
  // debits on one expense, and every later void of that expense was rightly refused as unbalanced.
  for (const l of lines.rows) {
    if (l.o_id && l.o_reversed_by !== l.id) {
      throw Object.assign(
        new Error(`restore_original_not_cancelled_by_this_entry: line ${l.o_id} is ${l.o_reversed_by ? `reversed by ${l.o_reversed_by}` : "still live"}, not by ${l.id} — restoring it would duplicate it`),
        { code: "restore_original_not_cancelled_by_this_entry" }
      );
    }
  }
  const cutoff = (await client.query<{ c: string | null }>(`SELECT accounting.closed_period_cutoff($1::uuid)::text AS c`, [operatingCompanyId])).rows[0]?.c ?? null;
  const restoreDate = resolveReversalDate(x.entry_date, cutoff, todayIso());
  const postings = lines.rows.map((l) =>
    l.o_id
      ? {
          // fresh copy of the ORIGINAL line the reversal cancelled — never a reversal of the reversal
          account_id: l.o_account_id!,
          debit_or_credit: l.o_side!,
          amount_cents: Number(l.o_amount_cents),
          description: l.o_description ? `Restored: ${l.o_description}` : "Restored",
          class_id: l.o_class_id,
          location_id: l.o_location_id,
          entity_uuid: l.o_entity_uuid,
          entity_type: (l.o_entity_type ?? null) as never,
          load_id: l.o_load_id,
          source_transaction_type: l.o_source_type,
          source_transaction_id: l.o_source_id,
          source_transaction_line_id: l.o_source_line_id,
        }
      : {
          // an ordinary line in the entry (a reclassify in-leg): its normal reversal
          account_id: l.account_id,
          debit_or_credit: (l.debit_or_credit === "debit" ? "credit" : "debit") as "debit" | "credit",
          amount_cents: Number(l.amount_cents),
          description: l.description ? `Reversal: ${l.description}` : "Reversal",
          class_id: l.class_id,
          location_id: l.location_id,
          entity_uuid: l.entity_uuid,
          entity_type: (l.entity_type ?? null) as never,
          load_id: l.load_id,
          source_transaction_type: l.source_transaction_type,
          source_transaction_id: l.source_transaction_id,
          source_transaction_line_id: l.source_transaction_line_id,
          reversal_of_line_id: l.id,
        }
  );
  const created = await createJournalEntryOnClient(
    client,
    {
      operating_company_id: operatingCompanyId,
      entry_date: restoreDate,
      memo: `Restore of ${describeJournalEntry(x.entry_date, x.memo)}: ${reason}`,
      source: "auto",
      is_sample_data: Boolean(x.is_sample_data),
      source_transaction_type: "journal_entry",
      source_transaction_id: journalEntryId,
      postings,
    },
    { userId: params.actorUserId, role: params.actorRole ?? "Owner" }
  );
  // Stamp the cancelled reversal lines' originals? No — the originals stay reversed by their reversal; the restore is a
  // new live line. Header link only, so the reversing entry reads as restored and a retry is idempotent.
  if (await hasReversalLinkageColumns(client)) {
    // ROUND 368.2(b) — stamping reversed_by_je_id makes this reversing entry stop being live. A bank line matched to it
    // (matched_journal_entry_id) goes back to For review FIRST, with its release record; otherwise the document-side
    // refusal (202615360600) rejects the restore at COMMIT.
    await releaseBankLinesNamingDocument(client as never, { operatingCompanyId, pointerColumn: "matched_journal_entry_id", documentId: journalEntryId }, {
      userId: params.actorUserId,
      reason: `journal entry restored: ${journalEntryId}`,
    });
    await client.query(`UPDATE accounting.journal_entries SET reversed_by_je_id = $2::uuid, updated_at = now() WHERE id = $1::uuid AND operating_company_id = $3::uuid`, [journalEntryId, created.id, operatingCompanyId]);
    await client.query(`UPDATE accounting.journal_entries SET reverses_je_id = $2::uuid, void_reason = $3, updated_at = now() WHERE id = $1::uuid AND operating_company_id = $4::uuid`, [created.id, journalEntryId, reason, operatingCompanyId]);
  }
  return { restore_journal_entry_id: created.id, restore_date: restoreDate, already_restored: false };
}

/** Own-connection wrapper for the reinstate routes (same money-control gate, role check and audit as voidJournalEntry). */
export async function restoreReversedJournalEntry(
  operatingCompanyId: string,
  journalEntryId: string,
  reason: string,
  actor: { userId: string; role: string }
) {
  return withCurrentUser(actor.userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [operatingCompanyId]);
    const enabled = await isEnabled(client, MONEY_CONTROL_VOID_REVERSAL_FLAG_KEY, { operating_company_id: operatingCompanyId, user_uuid: actor.userId });
    if (!enabled) throw new Error("void_reversal_disabled");
    if (!canVoid(actor.role)) throw new Error("forbidden_void_owner_or_accountant_only");
    if (!reason || !reason.trim()) throw new Error("void_reason_required");
    const r = await restoreReversedJournalEntryInClientTx(client, { operatingCompanyId, journalEntryId, reason, actorUserId: actor.userId, actorRole: actor.role });
    await appendCrudAudit(client as never, actor.userId, "accounting.journal_entry.restored", {
      resource_type: "accounting.journal_entries", resource_id: journalEntryId, operating_company_id: operatingCompanyId,
      restore_journal_entry_id: r.restore_journal_entry_id, restore_date: r.restore_date, reason: reason.trim(),
    }, "warning", "ROUND-390.1-RESTORE");
    return r;
  });
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

// LV-JE-MEMO-RECORD-NOT-VISIBLE — the list page's humanMemo() regex-replaces every UUID embedded in
// je.memo with entityLabel(null, uuid, noun): the name argument is HARDCODED null, so it can never
// resolve and always falls back to "<noun> — not visible", regardless of whether the source record is
// real and resolvable (confirmed live: 1,885/1,930 posted JEs, 97.7%, had a resolvable source that
// tombstoned anyway). journal_entry_postings already carries source_transaction_type/
// source_transaction_id per line (the SAME columns account-register.service.ts and
// getJournalEntrySourceLinks already resolve from) — this list query just never joined out to them.
// Picks ONE representative posting per JE (ORDER BY line_sequence, matching this file's own
// LIFO/ordering precedent elsewhere) since a manually-created JE's lines typically share one source;
// self-contained correlated subqueries (only reference outer je.id/je.operating_company_id), so they
// slot into the SELECT list without touching the existing GROUP BY je.id.
const JE_SOURCE_TRANSACTION_TYPE_SQL = `
  (
    SELECT p2.source_transaction_type
    FROM accounting.journal_entry_postings p2
    WHERE p2.journal_entry_uuid = je.id
      AND p2.source_transaction_type IS NOT NULL
    ORDER BY p2.line_sequence ASC
    LIMIT 1
  )
`;

const JE_SOURCE_TRANSACTION_ID_SQL = `
  (
    SELECT p2.source_transaction_id
    FROM accounting.journal_entry_postings p2
    WHERE p2.journal_entry_uuid = je.id
      AND p2.source_transaction_type IS NOT NULL
    ORDER BY p2.line_sequence ASC
    LIMIT 1
  )
`;

// Human document id for the representative source, reusing the exact display_id-then-bill_number
// precedence ACCT-F5708 established (accounting.bills.display_id is 0.07% populated live;
// bill_number is 96.6%) plus the same per-type joins account-register.service.ts already uses for
// its own reference/payee columns. fuel_event (the DOMINANT live shape — 82.6% of posted JEs, "Fuel
// txn <uuid>" — fuel.fuel_transactions carries no display-id column at all) resolves via the SAME
// unit-number identity FuelTransactionsTable.tsx already uses to identify a fuel transaction to a
// human. bill_payment and driver_advance are NOT yet covered here (no proven display-id column found
// for either table) — those rows still fall through to the pre-existing humanMemo() garble-avoidance,
// not a regression, just not newly resolved; noted honestly rather than silently claimed complete.
const JE_SOURCE_TRANSACTION_DISPLAY_ID_SQL = `
  (
    SELECT COALESCE(
      b.display_id, b.bill_number,
      inv.display_id,
      pay.display_id,
      ds.display_id,
      ex.expense_number,
      bpay.display_id, bpay.bill_number,
      ftu.unit_number,
      NULLIF(btrim(bt.merchant_name), ''), NULLIF(btrim(bt.description), '')
    )
    FROM (
      SELECT p2.source_transaction_type AS t, p2.source_transaction_id AS sid
      FROM accounting.journal_entry_postings p2
      WHERE p2.journal_entry_uuid = je.id
        AND p2.source_transaction_type IS NOT NULL
      ORDER BY p2.line_sequence ASC
      LIMIT 1
    ) src
    LEFT JOIN accounting.bills b
      ON src.t = 'bill' AND b.id::text = src.sid AND b.operating_company_id = je.operating_company_id
    LEFT JOIN accounting.invoices inv
      ON src.t = 'invoice' AND inv.id::text = src.sid AND inv.operating_company_id = je.operating_company_id
    LEFT JOIN accounting.payments pay
      ON src.t = 'customer_payment' AND pay.id::text = src.sid AND pay.operating_company_id = je.operating_company_id
    LEFT JOIN driver_finance.driver_settlements ds
      ON src.t = 'settlement' AND ds.id::text = src.sid AND ds.operating_company_id = je.operating_company_id
    LEFT JOIN accounting.expenses ex
      ON src.t = 'expense' AND ex.id::text = src.sid AND ex.operating_company_id = je.operating_company_id
    -- LV-JE-MEMO-RECORD-NOT-VISIBLE (229-row residual) — bill_payment has no display id of its own;
    -- resolve through the bill it paid, same two-hop join account-register.service.ts already uses.
    LEFT JOIN accounting.bill_payments bpp
      ON src.t = 'bill_payment' AND bpp.id::text = src.sid AND bpp.operating_company_id = je.operating_company_id
    LEFT JOIN accounting.bills bpay
      ON bpay.id = bpp.bill_id AND bpay.operating_company_id = je.operating_company_id
    LEFT JOIN fuel.fuel_transactions ft
      ON src.t = 'fuel_event' AND ft.id::text = src.sid AND ft.operating_company_id = je.operating_company_id
    -- Deliberately UNSCOPED by entity (matches fuel-transactions.routes.ts's own unit join): a unit
    -- can be owned by one entity and currently leased to another, and the fuel purchase can be
    -- recorded under a THIRD entity's books (confirmed live: unit 181b5c93... owner_company_id=TRK,
    -- currently_leased_to_company_id=USMCA, but its fuel_transactions row + this JE are both TRANSP).
    -- unit_number is an identifying label, not financial data — the real entity scope is already
    -- enforced one hop up, on ft.operating_company_id = je.operating_company_id above.
    LEFT JOIN mdata.units ftu
      ON ftu.id = ft.unit_id
    LEFT JOIN banking.bank_transactions bt
      ON src.t = 'bank_categorization' AND bt.id::text = src.sid AND bt.operating_company_id = je.operating_company_id
  )
`;

export async function listJournalEntries(input: {
  userId: string;
  operating_company_id: string;
  source?: JournalEntrySource;
  status?: JournalEntryStatus;
  account_id?: string;
  account_ids?: string[];
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
    const accountIds = [
      ...new Set([
        ...(input.account_ids ?? []),
        ...(input.account_id ? [input.account_id] : []),
      ]),
    ];
    if (accountIds.length) {
      values.push(accountIds);
      filters.push(`EXISTS (
        SELECT 1 FROM accounting.journal_entry_postings p
        WHERE p.journal_entry_uuid = je.id
          AND p.account_id = ANY($${values.length}::uuid[])
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
          ${JE_SOURCE_TRANSACTION_TYPE_SQL} AS source_transaction_type,
          ${JE_SOURCE_TRANSACTION_ID_SQL} AS source_transaction_id,
          ${JE_SOURCE_TRANSACTION_DISPLAY_ID_SQL} AS source_transaction_display_id,
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
 * R-102-B item 5 — disclosed count: company-wide, independent of every non-status filter (a list
 * that hides voided rows must state what it hid).
 */
export async function countVoidedJournalEntries(userId: string, operatingCompanyId: string) {
  return withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [operatingCompanyId]);
    const res = await client.query(
      `SELECT count(*) AS n FROM accounting.journal_entries
        WHERE operating_company_id = $1::uuid AND status = 'voided'`,
      [operatingCompanyId]
    );
    return Number(res.rows[0]?.n ?? 0);
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
            WHEN jep.source_transaction_type = 'fuel_event' THEN 'fuel_transaction'
            WHEN jep.source_transaction_type = 'driver_reimbursement' THEN 'driver_reimbursement'
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
            WHEN tsl.linked_object_type = 'fuel_event' THEN 'fuel_transaction'
            WHEN tsl.linked_object_type = 'driver_reimbursement' THEN 'driver_reimbursement'
            WHEN tsl.linked_object_type = 'dispute_disbursement' THEN 'settlement_dispute'
            WHEN tsl.linked_object_type = 'driver_settlement' THEN 'settlement'
            WHEN tsl.linked_object_type = 'driver_settlement_deduction' THEN 'settlement_deduction'
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
          -- JE-SOURCE-LINKS-EXPENSE-NEVER-JOINED: expense is the same class of gap this comment block
          -- already fixed for invoice/bill/bank_categorization/fuel_event/driver_reimbursement, and
          -- live-reproduced the same way (created EXP-2026-00002, its JE detail's Source links panel
          -- tombstoned "Source — not visible" even though the row exists and posted correctly).
          -- accounting.expenses.expense_number is the SAME column listJournalEntries' own
          -- JE_SOURCE_TRANSACTION_DISPLAY_ID_SQL already uses for this exact type (ex.expense_number)
          -- a few lines above in this file — this query just never got the matching join.
          COALESCE(src_inv.display_id, src_bill.display_id, src_bill.bill_number, src_banktx.display_label, src_fueltx.display_label, src_reimbursement.display_label, src_expense.display_label) AS source_transaction_display_id,
          COALESCE(link_inv.display_id, link_bill.display_id, link_bill.bill_number, link_dispute.dispute_description, link_settlement.display_id, link_load.load_number, link_unit.unit_number, link_deduction.display_label, link_expense.display_label) AS linked_object_display_id
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
        LEFT JOIN LATERAL (
          SELECT COALESCE(NULLIF(ft.transaction_reference, ''), 'Fuel purchase ' || ft.transaction_at::date::text) AS display_label
          FROM fuel.fuel_transactions ft
          WHERE jep.source_transaction_type = 'fuel_event'
            AND ft.id::text = jep.source_transaction_id
            AND ft.operating_company_id = $2::uuid
          LIMIT 1
        ) src_fueltx ON true
        LEFT JOIN LATERAL (
          SELECT COALESCE(NULLIF(r.reason, ''), 'Driver ' || replace(r.reimbursement_type, '_', ' ') || ' reimbursement') AS display_label
          FROM driver_finance.driver_reimbursements r
          WHERE jep.source_transaction_type = 'driver_reimbursement'
            AND r.id::text = jep.source_transaction_id
            AND r.operating_company_id = $2::uuid
          LIMIT 1
        ) src_reimbursement ON true
        LEFT JOIN LATERAL (
          SELECT COALESCE(NULLIF(e.expense_number, ''), 'Expense ' || e.transaction_date::text) AS display_label
          FROM accounting.expenses e
          WHERE jep.source_transaction_type = 'expense'
            AND e.id::text = jep.source_transaction_id
            AND e.operating_company_id = $2::uuid
          LIMIT 1
        ) src_expense ON true
        LEFT JOIN accounting.invoices link_inv
          ON tsl.linked_object_type = 'invoice'
          AND link_inv.id::text = tsl.linked_object_id
          AND link_inv.operating_company_id = $2::uuid
        LEFT JOIN accounting.bills link_bill
          ON tsl.linked_object_type = 'bill'
          AND link_bill.id::text = tsl.linked_object_id
          AND link_bill.operating_company_id = $2::uuid
        LEFT JOIN driver_finance.driver_settlement_disputes link_dispute
          ON tsl.linked_object_type = 'dispute_disbursement'
          AND link_dispute.id::text = tsl.linked_object_id
          AND link_dispute.operating_company_id = $2::uuid
        LEFT JOIN driver_finance.driver_settlements link_settlement
          ON tsl.linked_object_type = 'driver_settlement'
          AND link_settlement.id::text = tsl.linked_object_id
          AND link_settlement.operating_company_id = $2::uuid
        LEFT JOIN mdata.loads link_load
          ON tsl.linked_object_type = 'load'
          AND link_load.id::text = tsl.linked_object_id
          AND link_load.operating_company_id = $2::uuid
        LEFT JOIN mdata.units link_unit
          ON tsl.linked_object_type = 'unit'
          AND link_unit.id::text = tsl.linked_object_id
          AND COALESCE(link_unit.currently_leased_to_company_id, link_unit.owner_company_id) = $2::uuid
        LEFT JOIN LATERAL (
          SELECT COALESCE(NULLIF(btrim(d.reason), ''), initcap(replace(d.deduction_type, '_', ' '))) AS display_label
          FROM driver_finance.driver_settlement_deductions d
          WHERE tsl.linked_object_type = 'driver_settlement_deduction'
            AND d.id::text = tsl.linked_object_id
            AND d.operating_company_id = $2::uuid
          LIMIT 1
        ) link_deduction ON true
        LEFT JOIN LATERAL (
          SELECT COALESCE(NULLIF(e2.expense_number, ''), 'Expense ' || e2.transaction_date::text) AS display_label
          FROM accounting.expenses e2
          WHERE tsl.linked_object_type = 'expense'
            AND e2.id::text = tsl.linked_object_id
            AND e2.operating_company_id = $2::uuid
          LIMIT 1
        ) link_expense ON true
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
    // ACC-49 — the detail response never carried debit_total_cents/credit_total_cents at all
    // (JournalEntryDetailPage.tsx's own void-modal label already referenced entry.debit_total_cents,
    // silently rendering $0.00 — a real, live symptom of this exact gap). Computed here from the
    // SAME postings just fetched, never a second, competing query against journal_entry_postings.
    let debitTotalCents = 0;
    let creditTotalCents = 0;
    for (const posting of postingsRes.rows as Array<{ debit_or_credit: string; amount_cents: number | string }>) {
      const cents = Number(posting.amount_cents ?? 0);
      if (posting.debit_or_credit === "debit") debitTotalCents += cents;
      else if (posting.debit_or_credit === "credit") creditTotalCents += cents;
    }

    return { ...header, postings: postingsRes.rows, debit_total_cents: debitTotalCents, credit_total_cents: creditTotalCents };
  });
}

export type PostingsBySourceGroup = {
  journal_entry_id: string;
  entry_date: string;
  status: string;
  postings: Array<Record<string, unknown>>;
  debit_total_cents: number;
  credit_total_cents: number;
};

/**
 * ACC-49 — postings resolved by (source_transaction_type, source_transaction_id), grouped by their
 * real parent journal entry so PostingGrid.tsx's balance check (one grid = one JE, always
 * debit==credit by construction) is never asked to sum postings across unrelated entries. Powers the
 * Journal tab on Expense/Bill/Invoice detail — the SAME accounting.journal_entry_postings table
 * JournalEntryDetailPage.tsx reads, just filtered the other direction (by source doc instead of by
 * journal_entry_uuid). source_transaction_id is TEXT on this table (verified live schema) — every
 * real writer stores a uuid string in it, cast ::text on the uuid-side param to match.
 */
export async function getJournalEntryPostingsBySource(
  userId: string,
  operatingCompanyId: string,
  sourceTransactionType: string,
  sourceTransactionId: string
): Promise<PostingsBySourceGroup[]> {
  return withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [operatingCompanyId]);
    const res = await client.query(
      `
        SELECT
          p.journal_entry_uuid::text AS journal_entry_uuid,
          je.entry_date::text AS entry_date,
          je.status AS je_status,
          p.id,
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
        JOIN accounting.journal_entries je
          ON je.id = p.journal_entry_uuid
         AND je.operating_company_id = p.operating_company_id
        -- ENTITY PREDICATE (CLS-JOIN-ENTITY-UNSCOPED), same pattern getJournalEntryDetail already
        -- uses: the posting is scoped, the account/class it resolves to must be pinned too.
        LEFT JOIN catalogs.accounts a ON a.id = p.account_id
                                     AND a.operating_company_id = p.operating_company_id
        LEFT JOIN catalogs.classes c ON c.id = p.class_id
                                    AND c.operating_company_id = p.operating_company_id
        WHERE p.operating_company_id = $1::uuid
          AND p.source_transaction_type = $2
          AND p.source_transaction_id = $3::text
        ORDER BY je.entry_date ASC, p.journal_entry_uuid ASC, p.line_sequence ASC
      `,
      [operatingCompanyId, sourceTransactionType, sourceTransactionId]
    );

    const groups = new Map<string, PostingsBySourceGroup>();
    for (const row of res.rows as Array<Record<string, unknown>>) {
      const jeId = String(row.journal_entry_uuid);
      let group = groups.get(jeId);
      if (!group) {
        group = {
          journal_entry_id: jeId,
          entry_date: String(row.entry_date),
          status: String(row.je_status),
          postings: [],
          debit_total_cents: 0,
          credit_total_cents: 0,
        };
        groups.set(jeId, group);
      }
      const { journal_entry_uuid: _jeId, je_status: _status, ...posting } = row;
      group.postings.push(posting);
      const cents = Number(row.amount_cents ?? 0);
      if (row.debit_or_credit === "debit") group.debit_total_cents += cents;
      else if (row.debit_or_credit === "credit") group.credit_total_cents += cents;
    }
    return [...groups.values()];
  });
}
