import type { FastifyInstance } from "fastify";
import cron from "node-cron";
import { withLuciaBypass } from "../auth/db.js";
import { assertTenantContext } from "../cron/_helpers/tenant-context-guard.js";
import { wrapBackgroundJobTick } from "../lib/background-jobs.js";

export type DueWindow = "t7" | "t3" | "t1" | "due_today" | "overdue" | "future";

const REMINDER_WINDOWS = new Set<DueWindow>(["t7", "t3", "t1", "due_today"]);
let initialized = false;

function parseDateOnly(value: string): Date {
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`invalid_date_only:${value}`);
  }
  return parsed;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function toDateOnlyString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function diffDays(dueDate: Date, baseDate: Date): number {
  const dayMs = 24 * 60 * 60 * 1000;
  return Math.floor((dueDate.getTime() - baseDate.getTime()) / dayMs);
}

export function classifyDueWindow(dueDate: string, today: string): DueWindow {
  const due = parseDateOnly(dueDate);
  const current = parseDateOnly(today);
  const delta = diffDays(due, current);

  if (delta < 0) return "overdue";
  if (delta === 0) return "due_today";
  if (delta === 1) return "t1";
  if (delta === 3) return "t3";
  if (delta === 7) return "t7";
  return "future";
}

type ReminderCandidate = {
  id: string;
  due_date: string;
};

export async function sendReminders(tenantId: string, today: string) {
  const result = {
    scanned: 0,
    reminded: 0,
    buckets: {
      t7: 0,
      t3: 0,
      t1: 0,
      due_today: 0,
      overdue: 0,
      future: 0,
    } as Record<DueWindow, number>,
  };

  const limitDate = toDateOnlyString(addDays(parseDateOnly(today), 7));

  await withLuciaBypass(async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [tenantId]);
    const rows = await client.query<ReminderCandidate>(
      `
        SELECT id::text, due_date::text
        FROM insurance.payment_schedule
        WHERE tenant_id = $1::uuid
          AND status = 'scheduled'
          AND due_date <= $2::date
      `,
      [tenantId, limitDate]
    );

    result.scanned = rows.rows.length;
    for (const row of rows.rows) {
      const bucket = classifyDueWindow(row.due_date, today);
      result.buckets[bucket] += 1;
      if (!REMINDER_WINDOWS.has(bucket)) continue;

      const updateRes = await client.query(
        `
          UPDATE insurance.payment_schedule
          SET status = 'reminded',
              reminded_at = now()
          WHERE id = $1::uuid
            AND tenant_id = $2::uuid
            AND status = 'scheduled'
          RETURNING id::text
        `,
        [row.id, tenantId]
      );
      if (updateRes.rows[0]) result.reminded += 1;
    }
  });

  return result;
}

export function initializeInsurancePaymentReminderCron(app: FastifyInstance) {
  if (initialized) return;
  initialized = true;

  cron.schedule(
    "0 8 * * *",
    async () => {
      await wrapBackgroundJobTick(
        "insurance.payment_reminder_cron",
        async () => {
          await withLuciaBypass(async (client) => {
            const companies = await client.query<{ id: string }>(
              `
                SELECT id::text AS id
                FROM org.companies
                WHERE is_active = true
                  AND deactivated_at IS NULL
                ORDER BY id
              `
            );
            const today = toDateOnlyString(new Date());
            for (const company of companies.rows) {
              assertTenantContext(company.id, "insurance.payment_reminder_cron");
              await sendReminders(company.id, today);
            }
          });
        },
        app.log
      );
    },
    { timezone: "America/Chicago" }
  );

  app.log.info("Insurance payment reminder cron scheduled (daily 08:00 America/Chicago)");
}
