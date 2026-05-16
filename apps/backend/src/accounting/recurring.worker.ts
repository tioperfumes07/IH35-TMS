import type { PoolClient } from "pg";
import { CronExpressionParser } from "cron-parser";
import { DateTime } from "luxon";
import crypto from "node:crypto";
import { withLuciaBypass } from "../auth/db.js";
import { enqueueSyncJob } from "../integrations/qbo/qbo-sync.service.js";
import { nextInvoiceDisplayId } from "./display-id.js";
import { recomputeInvoiceTotals } from "./shared.js";

export function computeNextRecurringRunUtc(fromIso: string, cadence: string, cronExpr: string | null): string {
  const dt = DateTime.fromISO(fromIso, { zone: "utc" });
  if (!dt.isValid) throw new Error("recurring_invalid_from_iso");
  switch (cadence) {
    case "weekly":
      return dt.plus({ weeks: 1 }).toUTC().toISO()!;
    case "biweekly":
      return dt.plus({ weeks: 2 }).toUTC().toISO()!;
    case "monthly":
      return dt.plus({ months: 1 }).toUTC().toISO()!;
    case "quarterly":
      return dt.plus({ months: 3 }).toUTC().toISO()!;
    case "annually":
      return dt.plus({ years: 1 }).toUTC().toISO()!;
    case "custom_cron": {
      const expr = cronExpr?.trim();
      if (!expr) throw new Error("recurring_cron_missing");
      const interval = CronExpressionParser.parse(expr, { currentDate: dt.toJSDate(), tz: "UTC" });
      const next = interval.next().toISOString();
      if (!next) throw new Error("recurring_cron_next_failed");
      return next;
    }
    default:
      throw new Error("recurring_unknown_cadence");
  }
}

function payloadHash(parts: unknown) {
  return crypto.createHash("sha256").update(JSON.stringify(parts)).digest("hex");
}

async function materializeInvoice(client: PoolClient, tmpl: Record<string, unknown>, actorId: string) {
  const oc = String(tmpl.operating_company_id);
  const body = tmpl.template_payload as Record<string, unknown>;
  const customerId = String(body.customer_id ?? "");
  if (!customerId) throw new Error("recurring_invoice_missing_customer");

  const customerRes = await client.query<{
    payment_terms_id: string | null;
    ar_email: string | null;
    ar_phone: string | null;
    terms_name: string | null;
    days_until_due: string | null;
  }>(
    `
      SELECT c.payment_terms_id, c.ar_email, c.ar_phone, pt.terms_name, pt.days_until_due::text
      FROM mdata.customers c
      LEFT JOIN catalogs.payment_terms pt ON pt.id = c.payment_terms_id
      WHERE c.id = $1 AND c.operating_company_id = $2::uuid
      LIMIT 1
    `,
    [customerId, oc]
  );
  const customer = customerRes.rows[0];
  if (!customer) throw new Error("recurring_invoice_customer_not_found");

  const issueDate = typeof body.issue_date === "string" ? body.issue_date : new Date().toISOString().slice(0, 10);
  const termsDays = Number(customer.days_until_due ?? 30);
  const dueDate =
    typeof body.due_date === "string"
      ? body.due_date
      : DateTime.fromISO(`${issueDate}T00:00:00.000Z`, { zone: "utc" }).plus({ days: termsDays }).toISODate()!;
  const displayId = await nextInvoiceDisplayId(client, oc, new Date(`${issueDate}T00:00:00.000Z`));

  const ins = await client.query<{ id: string }>(
    `
      INSERT INTO accounting.invoices (
        operating_company_id,
        customer_id,
        display_id,
        status,
        issue_date,
        due_date,
        payment_terms_id,
        payment_terms_label,
        payment_terms_days,
        ar_email_snapshot,
        ar_phone_snapshot,
        internal_notes,
        customer_notes,
        currency_code,
        created_by_user_id,
        updated_by_user_id
      ) VALUES (
        $1::uuid,$2::uuid,$3,'draft',$4::date,$5::date,$6,$7,$8,$9,$10,$11,$12,'USD',$13::uuid,$13::uuid
      )
      RETURNING id::text
    `,
    [
      oc,
      customerId,
      displayId,
      issueDate,
      dueDate,
      customer.payment_terms_id,
      customer.terms_name,
      termsDays,
      customer.ar_email,
      customer.ar_phone,
      (body.internal_notes as string | undefined) ?? null,
      (body.customer_notes as string | undefined) ?? null,
      actorId,
    ]
  );
  const invoiceId = ins.rows[0]?.id;
  if (!invoiceId) throw new Error("recurring_invoice_insert_failed");

  const lines = Array.isArray(body.lines) ? (body.lines as Record<string, unknown>[]) : [];
  let order = 0;
  for (const ln of lines) {
    order += 1;
    const qty = Number(ln.quantity ?? 1);
    const unit = Number(ln.unit_amount_cents ?? ln.amount_cents ?? 0);
    const lineType = typeof ln.line_type === "string" ? ln.line_type : "other";
    const description = String(ln.description ?? "Recurring line");
    const lineTotal = Math.round(qty * unit);
    await client.query(
      `
        INSERT INTO accounting.invoice_lines (
          operating_company_id,
          invoice_id,
          line_type,
          description,
          quantity,
          unit_amount_cents,
          line_total_cents,
          display_order,
          created_at
        )
        VALUES ($1::uuid,$2::uuid,$3,$4,$5,$6,$7,$8,now())
      `,
      [oc, invoiceId, lineType, description, qty, unit, lineTotal, order]
    );
  }
  await recomputeInvoiceTotals(client, invoiceId);
  await client.query(`SELECT audit.append_event($1,$2,$3::jsonb,NULL,$4)`, [
    "accounting.recurring_template.materialized",
    "info",
    JSON.stringify({ template_id: tmpl.id, entity: "invoice", entity_id: invoiceId }),
    "P7-W2-RECURRING",
  ]);

  return invoiceId;
}

async function materializeBill(client: PoolClient, tmpl: Record<string, unknown>, actorId: string) {
  const oc = String(tmpl.operating_company_id);
  const body = tmpl.template_payload as Record<string, unknown>;
  const vendorId = String(body.vendor_id ?? "");
  const billDate = String(body.bill_date ?? "");
  const amountCents = Number(body.amount_cents ?? 0);
  if (!vendorId || !billDate || amountCents <= 0) throw new Error("recurring_bill_invalid_payload");

  const ins = await client.query<{ id: string }>(
    `
      INSERT INTO accounting.bills (
        operating_company_id,
        vendor_id,
        vendor_uuid,
        bill_number,
        bill_date,
        due_date,
        amount_cents,
        total_amount,
        paid_cents,
        paid_amount,
        status,
        memo,
        coa_account_id,
        created_by_user_id,
        created_at,
        updated_at
      )
      VALUES (
        $1::uuid,$2::uuid,$2::uuid,$3,$4::date,$5::date,$6,$7,0,0,'unpaid',$8,$9,$10::uuid,now(),now()
      )
      RETURNING id::text
    `,
    [
      oc,
      vendorId,
      body.bill_number ?? null,
      billDate,
      body.due_date ?? null,
      amountCents,
      amountCents / 100,
      body.memo ?? null,
      body.coa_account_id ?? null,
      actorId,
    ]
  );
  const billId = ins.rows[0]?.id;
  if (!billId) throw new Error("recurring_bill_insert_failed");

  await client.query(`SELECT audit.append_event($1,$2,$3::jsonb,NULL,$4)`, [
    "accounting.recurring_template.materialized",
    "info",
    JSON.stringify({ template_id: tmpl.id, entity: "bill", entity_id: billId }),
    "P7-W2-RECURRING",
  ]);
  return billId;
}

async function materializeJournal(client: PoolClient, tmpl: Record<string, unknown>, actorId: string) {
  const oc = String(tmpl.operating_company_id);
  const body = tmpl.template_payload as Record<string, unknown>;
  const entryDate = String(body.entry_date ?? new Date().toISOString().slice(0, 10));
  const memo = typeof body.memo === "string" ? body.memo : null;
  const postings = Array.isArray(body.postings) ? (body.postings as Record<string, unknown>[]) : [];
  if (postings.length < 2) throw new Error("recurring_journal_min_two_lines");

  let debits = 0;
  let credits = 0;
  for (const p of postings) {
    const side = String(p.debit_or_credit ?? "");
    const amt = Number(p.amount_cents ?? 0);
    if (side === "debit") debits += amt;
    else if (side === "credit") credits += amt;
  }
  if (debits !== credits || debits <= 0) throw new Error("recurring_journal_not_balanced");

  const header = await client.query<{ id: string }>(
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
      VALUES ($1::uuid,$2::date,$3,'posted','auto',$4::uuid,true,now(),now())
      RETURNING id::text
    `,
    [oc, entryDate, memo, actorId]
  );
  const jeId = header.rows[0]?.id;
  if (!jeId) throw new Error("recurring_journal_insert_failed");

  let seq = 1;
  for (const p of postings) {
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
        VALUES ($1::uuid,$2::uuid,$3,$4::uuid,$5::uuid,$6::uuid,$7,$8,$9,now(),now())
      `,
      [
        oc,
        jeId,
        seq,
        String(p.account_id),
        p.class_id ? String(p.class_id) : null,
        p.entity_uuid ? String(p.entity_uuid) : null,
        String(p.debit_or_credit),
        Number(p.amount_cents ?? 0),
        p.description ?? null,
      ]
    );
    seq += 1;
  }

  await client.query(`SELECT audit.append_event($1,$2,$3::jsonb,NULL,$4)`, [
    "accounting.recurring_template.materialized",
    "info",
    JSON.stringify({ template_id: tmpl.id, entity: "journal_entry", entity_id: jeId }),
    "P7-W2-RECURRING",
  ]);
  return jeId;
}

async function materializeExpense(client: PoolClient, tmpl: Record<string, unknown>, actorId: string) {
  const oc = String(tmpl.operating_company_id);
  const body = tmpl.template_payload as Record<string, unknown>;
  const expenseDate = String(body.expense_date ?? new Date().toISOString().slice(0, 10));
  const amountCents = Number(body.amount_cents ?? 0);
  if (amountCents <= 0) throw new Error("recurring_expense_invalid_amount");
  const totalAmount = amountCents / 100;

  const reg = await client.query<{ ok: boolean }>(`SELECT to_regclass('accounting.expenses') IS NOT NULL AS ok`);
  if (!reg.rows[0]?.ok) throw new Error("recurring_expense_table_missing");

  const ins = await client.query<{ id: string }>(
    `
      INSERT INTO accounting.expenses (
        operating_company_id,
        vendor_uuid,
        status,
        transaction_date,
        total_amount,
        memo,
        payment_account_uuid
      )
      VALUES (
        $1::uuid,
        $2::uuid,
        'posted',
        $3::date,
        $4,
        $5,
        $6::uuid
      )
      RETURNING id::text
    `,
    [oc, body.vendor_uuid ?? null, expenseDate, totalAmount, body.memo ?? null, body.payment_account_uuid ?? null]
  );
  const expenseId = ins.rows[0]?.id;
  if (!expenseId) throw new Error("recurring_expense_insert_failed");

  await client.query(`SELECT audit.append_event($1,$2,$3::jsonb,$4::uuid,$5)`, [
    "accounting.recurring_template.materialized",
    "info",
    JSON.stringify({ template_id: tmpl.id, entity: "expense", entity_id: expenseId }),
    actorId,
    "P7-W2-RECURRING",
  ]);

  return expenseId;
}

type EnqueuePayload = {
  operating_company_id: string;
  entity_type: "invoice" | "bill" | "journal_entry" | "expense";
  entity_id: string;
  actorId: string;
  tmplId: string;
};

async function processOneTemplate(client: PoolClient, tmplId: string): Promise<EnqueuePayload | null> {
  const lock = await client.query(
    `
      SELECT *
      FROM accounting.recurring_templates
      WHERE id = $1::uuid
        AND is_active = true
        AND next_run_at <= now()
      FOR UPDATE SKIP LOCKED
    `,
    [tmplId]
  );
  const tmpl = lock.rows[0] as Record<string, unknown> | undefined;
  if (!tmpl) return null;

  const actorId = tmpl.created_by_user_id ? String(tmpl.created_by_user_id) : null;
  if (!actorId) throw new Error("recurring_missing_created_by_user");

  await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [String(tmpl.operating_company_id)]);

  const kind = String(tmpl.kind);
  let entityId: string;
  let entityType: EnqueuePayload["entity_type"];
  if (kind === "invoice") {
    entityId = await materializeInvoice(client, tmpl, actorId);
    entityType = "invoice";
  } else if (kind === "bill") {
    entityId = await materializeBill(client, tmpl, actorId);
    entityType = "bill";
  } else if (kind === "journal_entry") {
    entityId = await materializeJournal(client, tmpl, actorId);
    entityType = "journal_entry";
  } else if (kind === "expense") {
    entityId = await materializeExpense(client, tmpl, actorId);
    entityType = "expense";
  } else {
    throw new Error("recurring_unknown_kind");
  }

  const nextIso = computeNextRecurringRunUtc(
    new Date().toISOString(),
    String(tmpl.cadence),
    tmpl.cron_expression ? String(tmpl.cron_expression) : null
  );

  await client.query(
    `
      UPDATE accounting.recurring_templates
      SET last_run_at = now(),
          next_run_at = $2::timestamptz,
          run_count = run_count + 1,
          updated_at = now()
      WHERE id = $1::uuid
    `,
    [tmplId, nextIso]
  );

  return {
    operating_company_id: String(tmpl.operating_company_id),
    entity_type: entityType,
    entity_id: entityId,
    actorId,
    tmplId,
  };
}

/** Cron worker — one DB transaction per template; outbound enqueue runs after commit. */
export async function processRecurringTemplatesTick(limit = 50): Promise<{ attempted: number; ran: number }> {
  let attempted = 0;
  let ran = 0;

  const dueIds = await withLuciaBypass(async (client) => {
    const res = await client.query<{ id: string }>(
      `
        SELECT id::text
        FROM accounting.recurring_templates
        WHERE is_active = true AND next_run_at <= now()
        ORDER BY next_run_at ASC
        LIMIT $1
      `,
      [limit]
    );
    return res.rows.map((r) => r.id);
  });

  for (const id of dueIds) {
    attempted += 1;
    try {
      const enqueuePayload = await withLuciaBypass(async (client) => {
        await client.query("BEGIN");
        try {
          const result = await processOneTemplate(client, id);
          await client.query("COMMIT");
          return result;
        } catch (err) {
          await client.query("ROLLBACK").catch(() => undefined);
          throw err;
        }
      });
      if (enqueuePayload) {
        await enqueueSyncJob(
          enqueuePayload.operating_company_id,
          enqueuePayload.entity_type as "invoice" | "bill" | "journal_entry" | "expense",
          enqueuePayload.entity_id,
          payloadHash({ recurring_template_id: enqueuePayload.tmplId }),
          enqueuePayload.actorId,
          { triggered_by: "recurring_template", payload_jsonb: { recurring_template_id: enqueuePayload.tmplId } }
        );
        ran += 1;
      }
    } catch (err) {
      console.error({ err, tmplId: id }, "recurring_template_tick_failed");
    }
  }

  return { attempted, ran };
}
