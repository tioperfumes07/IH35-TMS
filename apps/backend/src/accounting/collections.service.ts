import { withCurrentUser, withLuciaBypass } from "../auth/db.js";
import { appendCrudAudit } from "../audit/crud-audit.js";

export type CollectionAgingBucket = "current" | "1_30" | "31_60" | "61_90" | "91_plus";
export type CollectionTaskStatus = "open" | "contacted" | "promised" | "escalated" | "resolved";
export type CollectionTaskResolution = "paid" | "disputed" | "written_off";
export type CollectionContactType = "call" | "email" | "letter" | "sms";

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

type InvoiceSnapshot = {
  invoice_id: string;
  customer_id: string;
  owed_cents: number | string;
  days_overdue: number | string;
  status: string;
};

type ExistingTaskSnapshot = {
  id: string;
  invoice_id: string;
  status: CollectionTaskStatus;
};

type UpsertResultRow = {
  id: string;
  inserted: boolean;
  prior_status: CollectionTaskStatus | null;
};

export type CollectionTaskRow = {
  id: string;
  operating_company_id: string;
  customer_id: string;
  customer_name: string | null;
  invoice_id: string;
  owed_cents: number;
  days_overdue: number;
  aging_bucket: CollectionAgingBucket;
  status: CollectionTaskStatus;
  resolution: CollectionTaskResolution | null;
  assigned_to_user_id: string | null;
  last_contact_at: string | null;
  next_action_date: string | null;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
};

export type CollectionContactRow = {
  id: string;
  task_id: string;
  contact_type: CollectionContactType;
  notes: string;
  next_action_date: string | null;
  created_at: string;
  created_by_user_id: string | null;
};

export type CollectionTaskDetail = {
  task: CollectionTaskRow;
  contacts: CollectionContactRow[];
};

const DEFAULT_THRESHOLDS = [30, 60, 90] as const;
const DEFAULT_SOURCE_TAG = "BLOCK-44-AR-COLLECTIONS";

function toInt(value: number | string | null | undefined): number {
  return Number(value ?? 0);
}

function asIsoDateOrNull(value?: string | null): string | null {
  if (!value) return null;
  return value.slice(0, 10);
}

export function toAgingBucket(daysOverdue: number): CollectionAgingBucket {
  if (daysOverdue <= 0) return "current";
  if (daysOverdue <= 30) return "1_30";
  if (daysOverdue <= 60) return "31_60";
  if (daysOverdue <= 90) return "61_90";
  return "91_plus";
}

function minThreshold(thresholds: readonly number[]) {
  return Math.max(1, Math.min(...thresholds));
}

function shouldTrackInvoice(invoice: InvoiceSnapshot, thresholdDays: number): boolean {
  const owed = toInt(invoice.owed_cents);
  const days = toInt(invoice.days_overdue);
  return owed > 0 && days >= thresholdDays;
}

async function appendCollectionAudit(
  client: DbClient,
  actorUserId: string | null | undefined,
  eventClass: "collection.task_created" | "collection.task_contacted" | "collection.task_resolved",
  payload: Record<string, unknown>
) {
  if (actorUserId) {
    await appendCrudAudit(client, actorUserId, eventClass, payload, "info", DEFAULT_SOURCE_TAG);
    return;
  }
  await client.query(`SELECT audit.append_event($1, 'info', $2::jsonb, NULL, $3)`, [
    eventClass,
    JSON.stringify(payload),
    DEFAULT_SOURCE_TAG,
  ]);
}

export async function syncCollectionTasksWithClient(
  client: DbClient,
  input: {
    operatingCompanyId: string;
    actorUserId?: string | null;
    thresholdsDays?: readonly number[];
  }
) {
  const thresholds = (input.thresholdsDays?.length ? input.thresholdsDays : DEFAULT_THRESHOLDS)
    .map((value) => Math.max(1, Math.round(value)))
    .sort((a, b) => a - b);
  const thresholdDays = minThreshold(thresholds);

  const invoicesRes = await client.query<InvoiceSnapshot>(
    `
      SELECT
        i.id::text AS invoice_id,
        i.customer_id::text AS customer_id,
        COALESCE(i.amount_open_cents, 0)::bigint AS owed_cents,
        GREATEST(COALESCE((CURRENT_DATE - i.due_date), 0), 0)::int AS days_overdue,
        i.status::text AS status
      FROM accounting.invoices i
      WHERE i.operating_company_id = $1::uuid
        AND i.voided_at IS NULL
        AND i.status IN ('sent', 'partial', 'paid', 'factored')
    `,
    [input.operatingCompanyId]
  );

  const existingRes = await client.query<ExistingTaskSnapshot>(
    `
      SELECT id::text, invoice_id::text, status::text AS status
      FROM accounting.ar_collection_tasks
      WHERE operating_company_id = $1::uuid
    `,
    [input.operatingCompanyId]
  );

  const existingByInvoice = new Map<string, ExistingTaskSnapshot>();
  for (const row of existingRes.rows) existingByInvoice.set(row.invoice_id, row);

  let created = 0;
  let updated = 0;
  let resolved = 0;

  for (const invoice of invoicesRes.rows) {
    const invoiceId = invoice.invoice_id;
    const owedCents = toInt(invoice.owed_cents);
    const daysOverdue = toInt(invoice.days_overdue);
    const tracked = shouldTrackInvoice(invoice, thresholdDays);
    const existing = existingByInvoice.get(invoiceId);
    const isPaid = invoice.status === "paid" || owedCents <= 0;

    if (!tracked && !isPaid) continue;

    if (isPaid) {
      if (existing && existing.status !== "resolved") {
        await client.query(
          `
            UPDATE accounting.ar_collection_tasks
            SET
              status = 'resolved',
              resolution = COALESCE(resolution, 'paid'),
              closed_at = COALESCE(closed_at, now()),
              owed_cents = $2::bigint,
              days_overdue = $3::int,
              aging_bucket = $4::text
            WHERE id = $1::uuid
          `,
          [existing.id, owedCents, daysOverdue, toAgingBucket(daysOverdue)]
        );
        resolved += 1;
        await appendCollectionAudit(client, input.actorUserId, "collection.task_resolved", {
          task_id: existing.id,
          operating_company_id: input.operatingCompanyId,
          invoice_id: invoiceId,
          resolution: "paid",
        });
      }
      continue;
    }

    if (!tracked) continue;

    const upsertRes = await client.query<UpsertResultRow>(
      `
        INSERT INTO accounting.ar_collection_tasks (
          operating_company_id,
          customer_id,
          invoice_id,
          owed_cents,
          days_overdue,
          aging_bucket,
          status,
          resolution,
          closed_at
        )
        VALUES (
          $1::uuid,
          $2::uuid,
          $3::uuid,
          $4::bigint,
          $5::int,
          $6::text,
          'open',
          NULL,
          NULL
        )
        ON CONFLICT (operating_company_id, invoice_id)
        DO UPDATE SET
          customer_id = EXCLUDED.customer_id,
          owed_cents = EXCLUDED.owed_cents,
          days_overdue = EXCLUDED.days_overdue,
          aging_bucket = EXCLUDED.aging_bucket,
          status = CASE
            WHEN accounting.ar_collection_tasks.status = 'resolved' THEN 'open'
            ELSE accounting.ar_collection_tasks.status
          END,
          resolution = CASE
            WHEN accounting.ar_collection_tasks.status = 'resolved' THEN NULL
            ELSE accounting.ar_collection_tasks.resolution
          END,
          closed_at = CASE
            WHEN accounting.ar_collection_tasks.status = 'resolved' THEN NULL
            ELSE accounting.ar_collection_tasks.closed_at
          END
        RETURNING
          id::text AS id,
          (xmax = 0) AS inserted,
          CASE
            WHEN xmax = 0 THEN NULL
            ELSE status::text
          END AS prior_status
      `,
      [input.operatingCompanyId, invoice.customer_id, invoiceId, owedCents, daysOverdue, toAgingBucket(daysOverdue)]
    );

    const upsertRow = upsertRes.rows[0];
    if (!upsertRow) continue;
    if (upsertRow.inserted) {
      created += 1;
      await appendCollectionAudit(client, input.actorUserId, "collection.task_created", {
        task_id: upsertRow.id,
        operating_company_id: input.operatingCompanyId,
        invoice_id: invoiceId,
        customer_id: invoice.customer_id,
        owed_cents: owedCents,
        days_overdue: daysOverdue,
        aging_bucket: toAgingBucket(daysOverdue),
      });
    } else {
      updated += 1;
    }
  }

  const openRes = await client.query<{ open_count: number | string }>(
    `
      SELECT COUNT(*)::int AS open_count
      FROM accounting.ar_collection_tasks
      WHERE operating_company_id = $1::uuid
        AND status <> 'resolved'
    `,
    [input.operatingCompanyId]
  );

  return {
    created,
    updated,
    resolved,
    open_count: toInt(openRes.rows[0]?.open_count),
  };
}

export async function syncCollectionTasks(input: {
  operatingCompanyId: string;
  actorUserId?: string | null;
  thresholdsDays?: readonly number[];
}) {
  return withLuciaBypass(async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [input.operatingCompanyId]);
    return syncCollectionTasksWithClient(client, input);
  });
}

export async function listCollectionTasks(input: {
  userId: string;
  operatingCompanyId: string;
  bucket?: CollectionAgingBucket;
  owner?: string;
}) {
  return withCurrentUser(input.userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [input.operatingCompanyId]);

    const values: unknown[] = [input.operatingCompanyId];
    const where = ["t.operating_company_id = $1::uuid"];
    if (input.bucket) {
      values.push(input.bucket);
      where.push(`t.aging_bucket = $${values.length}::text`);
    }
    if (input.owner === "unassigned") {
      where.push("t.assigned_to_user_id IS NULL");
    } else if (input.owner) {
      values.push(input.owner);
      where.push(`t.assigned_to_user_id = $${values.length}::uuid`);
    }

    const res = await client.query<CollectionTaskRow>(
      `
        SELECT
          t.id::text,
          t.operating_company_id::text,
          t.customer_id::text,
          c.customer_name,
          t.invoice_id::text,
          t.owed_cents::bigint,
          t.days_overdue::int,
          t.aging_bucket::text,
          t.status::text,
          t.resolution::text,
          t.assigned_to_user_id::text,
          t.last_contact_at::text,
          t.next_action_date::text,
          t.created_at::text,
          t.updated_at::text,
          t.closed_at::text
        FROM accounting.ar_collection_tasks t
        LEFT JOIN mdata.customers c ON c.id = t.customer_id
        WHERE ${where.join(" AND ")}
        ORDER BY
          CASE t.status
            WHEN 'escalated' THEN 1
            WHEN 'open' THEN 2
            WHEN 'contacted' THEN 3
            WHEN 'promised' THEN 4
            ELSE 5
          END,
          t.days_overdue DESC,
          t.next_action_date NULLS LAST,
          t.created_at DESC
      `,
      values
    );

    return { tasks: res.rows.map(normalizeTaskRow) };
  });
}

export async function getCollectionTask(input: {
  userId: string;
  operatingCompanyId: string;
  taskId: string;
}): Promise<CollectionTaskDetail | null> {
  return withCurrentUser(input.userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [input.operatingCompanyId]);

    const taskRes = await client.query<CollectionTaskRow>(
      `
        SELECT
          t.id::text,
          t.operating_company_id::text,
          t.customer_id::text,
          c.customer_name,
          t.invoice_id::text,
          t.owed_cents::bigint,
          t.days_overdue::int,
          t.aging_bucket::text,
          t.status::text,
          t.resolution::text,
          t.assigned_to_user_id::text,
          t.last_contact_at::text,
          t.next_action_date::text,
          t.created_at::text,
          t.updated_at::text,
          t.closed_at::text
        FROM accounting.ar_collection_tasks t
        LEFT JOIN mdata.customers c ON c.id = t.customer_id
        WHERE t.operating_company_id = $1::uuid
          AND t.id = $2::uuid
        LIMIT 1
      `,
      [input.operatingCompanyId, input.taskId]
    );
    const task = taskRes.rows[0];
    if (!task) return null;

    const contactsRes = await client.query<CollectionContactRow>(
      `
        SELECT
          id::text,
          task_id::text,
          contact_type::text,
          notes,
          next_action_date::text,
          created_at::text,
          created_by_user_id::text
        FROM accounting.ar_collection_contacts
        WHERE task_id = $1::uuid
        ORDER BY created_at DESC, id DESC
      `,
      [input.taskId]
    );

    return {
      task: normalizeTaskRow(task),
      contacts: contactsRes.rows.map(normalizeContactRow),
    };
  });
}

export async function logCollectionContact(input: {
  userId: string;
  operatingCompanyId: string;
  taskId: string;
  contactType: CollectionContactType;
  notes: string;
  nextActionDate?: string | null;
}) {
  return withCurrentUser(input.userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [input.operatingCompanyId]);

    const taskRes = await client.query<{ id: string; invoice_id: string }>(
      `
        SELECT id::text, invoice_id::text
        FROM accounting.ar_collection_tasks
        WHERE id = $1::uuid
          AND operating_company_id = $2::uuid
        LIMIT 1
      `,
      [input.taskId, input.operatingCompanyId]
    );
    const task = taskRes.rows[0];
    if (!task) return null;

    const contactRes = await client.query<CollectionContactRow>(
      `
        INSERT INTO accounting.ar_collection_contacts (
          task_id,
          contact_type,
          notes,
          next_action_date,
          created_by_user_id
        )
        VALUES (
          $1::uuid,
          $2::text,
          $3::text,
          $4::date,
          $5::uuid
        )
        RETURNING
          id::text,
          task_id::text,
          contact_type::text,
          notes,
          next_action_date::text,
          created_at::text,
          created_by_user_id::text
      `,
      [input.taskId, input.contactType, input.notes, asIsoDateOrNull(input.nextActionDate), input.userId]
    );

    await client.query(
      `
        UPDATE accounting.ar_collection_tasks
        SET
          status = CASE WHEN status = 'resolved' THEN status ELSE 'contacted' END,
          last_contact_at = now(),
          next_action_date = COALESCE($2::date, next_action_date)
        WHERE id = $1::uuid
      `,
      [input.taskId, asIsoDateOrNull(input.nextActionDate)]
    );

    await appendCollectionAudit(client, input.userId, "collection.task_contacted", {
      task_id: input.taskId,
      operating_company_id: input.operatingCompanyId,
      invoice_id: task.invoice_id,
      contact_type: input.contactType,
      next_action_date: asIsoDateOrNull(input.nextActionDate),
    });

    return normalizeContactRow(contactRes.rows[0]);
  });
}

export async function resolveCollectionTask(input: {
  userId: string;
  operatingCompanyId: string;
  taskId: string;
  resolution: CollectionTaskResolution;
}) {
  return withCurrentUser(input.userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [input.operatingCompanyId]);

    const res = await client.query<{ id: string; invoice_id: string; closed_at: string | null }>(
      `
        UPDATE accounting.ar_collection_tasks
        SET
          status = 'resolved',
          resolution = $3::text,
          closed_at = COALESCE(closed_at, now())
        WHERE id = $1::uuid
          AND operating_company_id = $2::uuid
        RETURNING id::text, invoice_id::text, closed_at::text
      `,
      [input.taskId, input.operatingCompanyId, input.resolution]
    );
    const task = res.rows[0];
    if (!task) return null;

    await appendCollectionAudit(client, input.userId, "collection.task_resolved", {
      task_id: task.id,
      operating_company_id: input.operatingCompanyId,
      invoice_id: task.invoice_id,
      resolution: input.resolution,
      closed_at: task.closed_at,
    });

    return { task_id: task.id, resolution: input.resolution, closed_at: task.closed_at };
  });
}

function normalizeTaskRow(row: CollectionTaskRow): CollectionTaskRow {
  return {
    ...row,
    owed_cents: toInt(row.owed_cents),
    days_overdue: toInt(row.days_overdue),
    customer_name: row.customer_name ?? null,
    resolution: row.resolution ?? null,
    assigned_to_user_id: row.assigned_to_user_id ?? null,
    last_contact_at: row.last_contact_at ?? null,
    next_action_date: asIsoDateOrNull(row.next_action_date),
    closed_at: row.closed_at ?? null,
  };
}

function normalizeContactRow(row: CollectionContactRow): CollectionContactRow {
  return {
    ...row,
    notes: row.notes ?? "",
    next_action_date: asIsoDateOrNull(row.next_action_date),
    created_by_user_id: row.created_by_user_id ?? null,
  };
}
