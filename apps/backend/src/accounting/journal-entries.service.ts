import crypto from "node:crypto";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { enqueueSyncJob } from "../integrations/qbo/qbo-sync.service.js";
import { pushJournalEntryToQuickBooksImmediateBestEffort } from "./journal-entry-qbo-push.service.js";

type JournalEntrySource = "manual" | "auto";
type JournalEntryStatus = "posted" | "voided";

type CreatePostingInput = {
  account_id: string;
  class_id?: string | null;
  entity_uuid?: string | null;
  debit_or_credit: "debit" | "credit";
  amount_cents: number;
  description?: string | null;
};

export type CreateJournalEntryInput = {
  operating_company_id: string;
  entry_date: string;
  memo?: string | null;
  source?: JournalEntrySource;
  postings: CreatePostingInput[];
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

export async function createJournalEntry(input: CreateJournalEntryInput, actor: { userId: string; role: string }) {
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

  const created = await withCurrentUser(actor.userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [input.operating_company_id]);
    const headerRes = await client.query<{
      id: string;
      operating_company_id: string;
      entry_date: string;
      memo: string | null;
      status: JournalEntryStatus;
      source: JournalEntrySource;
      qbo_sync_pending: boolean;
      created_at: string;
    }>(
      `
        INSERT INTO accounting.journal_entries (
          operating_company_id,
          entry_date,
          memo,
          status,
          source,
          created_by_user_id,
          qbo_sync_pending,
          created_at,
          updated_at
        )
        VALUES ($1,$2::date,$3,'posted',$4,$5,true,now(),now())
        RETURNING id, operating_company_id::text, entry_date::text, memo, status, source, qbo_sync_pending, created_at::text
      `,
      [input.operating_company_id, input.entry_date, input.memo ?? null, input.source ?? "manual", actor.userId]
    );
    const header = headerRes.rows[0];
    if (!header?.id) throw new Error("journal_entry_insert_failed");

    let lineSequence = 1;
    for (const posting of input.postings) {
      await client.query(
        `
          INSERT INTO accounting.journal_entry_postings (
            operating_company_id,
            journal_entry_uuid,
            line_sequence,
            account_id,
            class_id,
            entity_uuid,
            debit_or_credit,
            amount_cents,
            description,
            created_at,
            updated_at
          )
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,now(),now())
        `,
        [
          input.operating_company_id,
          header.id,
          lineSequence,
          posting.account_id,
          posting.class_id ?? null,
          posting.entity_uuid ?? null,
          posting.debit_or_credit,
          posting.amount_cents,
          posting.description ?? null,
        ]
      );
      lineSequence += 1;
    }

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

    return header;
  });

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

  return created;
}

export async function voidJournalEntry(
  operatingCompanyId: string,
  journalEntryId: string,
  voidReason: string,
  actor: { userId: string; role: string }
) {
  if (actor.role !== "Owner") throw new Error("forbidden_owner_only");
  const result = await withCurrentUser(actor.userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);
    const existingRes = await client.query<{ id: string; status: JournalEntryStatus }>(
      `
        SELECT id, status
        FROM accounting.journal_entries
        WHERE id = $1
          AND operating_company_id = $2
        LIMIT 1
        FOR UPDATE
      `,
      [journalEntryId, operatingCompanyId]
    );
    const existing = existingRes.rows[0];
    if (!existing) throw new Error("journal_entry_not_found");
    if (existing.status === "voided") throw new Error("journal_entry_already_voided");

    await client.query(
      `
        UPDATE accounting.journal_entries
        SET status = 'voided',
            voided_at = now(),
            voided_by_user_id = $3,
            void_reason = $4,
            qbo_sync_pending = true,
            updated_at = now()
        WHERE id = $1
          AND operating_company_id = $2
      `,
      [journalEntryId, operatingCompanyId, actor.userId, voidReason]
    );

    await appendCrudAudit(
      client,
      actor.userId,
      "accounting.journal_entry.voided",
      {
        resource_type: "accounting.journal_entries",
        resource_id: journalEntryId,
        operating_company_id: operatingCompanyId,
        void_reason: voidReason,
      },
      "warning",
      "P5-D4-MANUAL-JE"
    );
    return { ok: true };
  });

  await enqueueSyncJob(
    operatingCompanyId,
    "journal_entry",
    journalEntryId,
    hashPayload({ journal_entry_id: journalEntryId, action: "void" }),
    actor.userId
  );
  return result;
}

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
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [input.operating_company_id]);
    const values: unknown[] = [input.operating_company_id];
    const filters: string[] = ["je.operating_company_id = $1"];
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
          je.qbo_journal_entry_id,
          je.qbo_sync_pending,
          je.created_at::text,
          je.updated_at::text,
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

export async function getJournalEntryDetail(userId: string, operatingCompanyId: string, journalEntryId: string) {
  return withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);
    const headerRes = await client.query(
      `
        SELECT
          id,
          operating_company_id::text,
          entry_date::text,
          memo,
          status,
          source,
          created_by_user_id::text,
          voided_at::text,
          voided_by_user_id::text,
          void_reason,
          qbo_journal_entry_id,
          qbo_sync_pending,
          created_at::text,
          updated_at::text
        FROM accounting.journal_entries
        WHERE id = $1
          AND operating_company_id = $2
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
          p.debit_or_credit,
          p.amount_cents,
          p.description
        FROM accounting.journal_entry_postings p
        LEFT JOIN catalogs.accounts a ON a.id = p.account_id
        LEFT JOIN catalogs.classes c ON c.id = p.class_id
        WHERE p.journal_entry_uuid = $1
          AND p.operating_company_id = $2
        ORDER BY p.line_sequence ASC, p.created_at ASC
      `,
      [journalEntryId, operatingCompanyId]
    );
    return { ...header, postings: postingsRes.rows };
  });
}
