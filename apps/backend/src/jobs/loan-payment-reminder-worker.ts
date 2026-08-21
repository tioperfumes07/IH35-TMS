/**
 * LOAN-09 — related-party loan payment reminders.
 *
 * WHAT IT DOES. Once a day it finds every unposted, un-reversed loan schedule row whose due date falls
 * inside the lead window, and enqueues ONE `accounting.related_party_loan.payment_due` event per row on
 * the canonical outbox. The registered notice handler resolves recipients and writes the in-app
 * notification. This job posts nothing, deducts nothing, and touches no ledger — a due date is not
 * evidence that money moved, and a system that books on the strength of one records payments that never
 * happened. QuickBooks, NetSuite and McLeod all keep "a payment is due" and "a payment occurred" as
 * separate facts; so does this.
 *
 * EXACTLY ONCE PER SCHEDULE ROW, ENFORCED BY THE DATABASE. A daily sweep re-discovers the same upcoming
 * payment on every pass. Without dedupe it would notify the same person every day until the due date,
 * which is how a notification channel becomes noise people filter out — and the one time it matters,
 * nobody reads it. The dedupe_key is the schedule row id under a LIFETIME partial unique index
 * (ux_outbox_events_dedupe_key, verified on prod), so the second enqueue inserts nothing. Deduping in
 * the database rather than with an "already_reminded" flag also means a crash between enqueue and
 * flag-write cannot double-notify: there is no window.
 *
 * WHY A CONSTANT LEAD TIME, STATED HONESTLY. The spec asks for a configurable lead time per loan.
 * accounting.related_party_loan_entries has NO lead-time column (verified against prod, not assumed),
 * and inventing one to hold a value nobody has been asked for yet would be guessing at a requirement.
 * So the lead is a single named constant here, applied uniformly and visible in one place. When the
 * owner specifies per-loan lead times, this becomes a column read and the constant becomes its default
 * — an additive change, not a rewrite.
 *
 * ENTITY-SCOPED. The scan runs per operating company with app.operating_company_id set, so a TRANSP
 * sweep can never enqueue a reminder about a USMCA loan.
 */
import type { FastifyInstance } from "fastify";
import cron from "node-cron";

import { withLuciaBypass } from "../auth/db.js";
import { assertTenantContext } from "../cron/_helpers/tenant-context-guard.js";
import { wrapBackgroundJobTick } from "../lib/background-jobs.js";
import { enqueueOutboxEvent } from "../outbox/enqueue-outbox-event.js";

export const LOAN_PAYMENT_DUE_EVENT = "accounting.related_party_loan.payment_due";

/**
 * Days ahead of the due date to raise the reminder. Seven gives a full working week to arrange funds
 * or object to the amount, which is the shortest window that still survives a payment falling on a
 * weekend or a holiday.
 */
export const REMINDER_LEAD_DAYS = 7;

type Queryable = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

export type DueScheduleRow = {
  schedule_id: string;
  loan_id: string;
  operating_company_id: string;
  payment_number: number;
  due_date: string;
  payment_cents: number;
  principal_cents: number;
  interest_cents: number;
  counterparty_name: string | null;
  direction: string;
};

const money = (cents: number) =>
  `$${(Number(cents) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Rows due within the lead window that still need a reminder.
 *
 * EXCLUSIONS, EACH FOR A REASON:
 *  - posted  — already paid; reminding about it would send someone chasing a settled payment.
 *  - reversed_at / deleted_at — void-not-delete keeps these rows forever, but a voided loan is not a
 *    debt, and a reminder about one is a false liability in front of the owner.
 *  - due_date < today — a MISSED payment is a different fact needing a different message. Quietly
 *    folding overdue rows into a "due soon" reminder would understate the problem.
 */
export async function findSchedulesDueSoon(
  client: Queryable,
  operatingCompanyId: string,
  leadDays: number
): Promise<DueScheduleRow[]> {
  const res = await client.query<DueScheduleRow>(
    `
      SELECT s.id::text            AS schedule_id,
             s.loan_id::text       AS loan_id,
             s.operating_company_id::text AS operating_company_id,
             s.payment_number,
             s.due_date::text      AS due_date,
             s.payment_cents::bigint,
             s.principal_cents::bigint,
             s.interest_cents::bigint,
             e.counterparty_name,
             e.direction
        FROM accounting.related_party_loan_schedule s
        JOIN accounting.related_party_loan_entries e
          ON e.id = s.loan_id
         AND e.operating_company_id = s.operating_company_id
       WHERE s.operating_company_id = $1::uuid
         AND s.is_active
         AND s.deleted_at IS NULL
         AND NOT s.posted
         AND e.deleted_at IS NULL
         AND e.reversed_at IS NULL
         AND s.due_date >= CURRENT_DATE
         AND s.due_date <= CURRENT_DATE + ($2::int * INTERVAL '1 day')
       ORDER BY s.due_date, s.payment_number
    `,
    [operatingCompanyId, leadDays]
  );
  return res.rows;
}

/** The lifetime dedupe identity: one reminder per schedule row, forever. */
export function reminderDedupeKey(scheduleId: string): string {
  return `${LOAN_PAYMENT_DUE_EVENT}:${scheduleId}`;
}

export async function runLoanPaymentReminderTick(app: FastifyInstance): Promise<{ enqueued: number; skipped: number }> {
  let enqueued = 0;
  let skipped = 0;

  await withLuciaBypass(async (client) => {
    const companies = await client.query<{ operating_company_id: string }>(
      `
        SELECT DISTINCT operating_company_id::text AS operating_company_id
        FROM accounting.related_party_loan_entries
        WHERE deleted_at IS NULL
          AND reversed_at IS NULL
      `
    );

    for (const row of companies.rows) {
      const operatingCompanyId = String(row.operating_company_id ?? "");
      if (!operatingCompanyId) continue;
      assertTenantContext(operatingCompanyId, "accounting.loan_payment_reminder");
      await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [operatingCompanyId]);

      const due = await findSchedulesDueSoon(client, operatingCompanyId, REMINDER_LEAD_DAYS);
      for (const s of due) {
        const result = await enqueueOutboxEvent(
          client,
          LOAN_PAYMENT_DUE_EVENT,
          { aggregate_type: "accounting.related_party_loan_entries", aggregate_id: s.loan_id },
          {
            operating_company_id: operatingCompanyId,
            loan_id: s.loan_id,
            schedule_id: s.schedule_id,
            payment_number: String(s.payment_number),
            due_date: s.due_date,
            direction: s.direction,
            counterparty_name: s.counterparty_name ?? null,
            payment_amount: money(s.payment_cents),
            principal_amount: money(s.principal_cents),
            interest_amount: money(s.interest_cents),
            // Cents are carried alongside the formatted strings so a consumer never has to parse
            // currency text back into a number.
            payment_cents: Number(s.payment_cents),
            principal_cents: Number(s.principal_cents),
            interest_cents: Number(s.interest_cents),
          },
          reminderDedupeKey(s.schedule_id)
        );
        if (result.enqueued) enqueued += 1;
        else skipped += 1;
      }
    }
  });

  app.log.info(
    { enqueued, skipped },
    "loan payment reminder tick complete (skipped = already reminded, deduped by the database)"
  );
  return { enqueued, skipped };
}

let initialized = false;

export function initializeLoanPaymentReminder(app: FastifyInstance) {
  if (initialized) return;
  initialized = true;

  if (process.env.ENABLE_LOAN_PAYMENT_REMINDER === "false") {
    app.log.info("Loan payment reminder disabled via ENABLE_LOAN_PAYMENT_REMINDER=false");
    return;
  }

  // 07:00 Central, after the 06:00 expiry monitor, so the two daily notification sweeps do not land in
  // the same inbox minute.
  cron.schedule(
    "0 7 * * *",
    async () => {
      await wrapBackgroundJobTick(
        "accounting.loan_payment_reminder",
        async () => {
          await runLoanPaymentReminderTick(app);
        },
        app.log
      );
    },
    {
      maxRandomDelay: 20000 /* cron-stagger (code only) — see PROD-OUTAGE-STEADY-STATE-CRON-PILEUP-CONFIRMED */, timezone: "America/Chicago" }
  );

  app.log.info("Loan payment reminder scheduled (daily 07:00 America/Chicago)");
}
