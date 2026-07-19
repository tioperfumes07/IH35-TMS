// FACTORING (Faro) — default-interest accrual engine + day-95 auto-recourse orchestration. FINANCIAL /
// §1.4 gated behind FACTORING_GL_POSTING_ENABLED (default OFF, TRANSP only). Flag OFF ⇒ every function here
// is a pure no-op (no selection, no JE, no status flip). This module ONLY orchestrates: it selects which
// (advance, day) to charge and calls the shipped posters — it writes NO GL math beyond the compounding
// formula that already lives in poster.service.ts (postFactoringDefaultInterestAccrualEvent). Reuses the
// existing chargeback poster verbatim for the day-95 recourse.
//
// Two motions (both idempotent, entity-scoped, audited):
//   1) accrueDefaultInterestForCompany — for each OUTSTANDING advance (funded, customer-unpaid) past day 35,
//      post one compounding Dr Default-Interest-Expense / Cr Liability entry per missing calendar day, in
//      ascending order so each day compounds off the committed prior day.
//   2) triggerDay95RecourseForCompany — for each advance that hits the 95-day Repurchase Deadline still
//      unpaid: catch interest up to today, then fire the chargeback poster with EXACT linked outstanding
//      liability + A/R (no guessed amounts). Status/subledger/audit land inside the chargeback's single
//      caller-owned txn. Interest on the repay leg is 0 because daily accrual already compounded it into
//      the liability.

import { withLuciaBypass } from "../../auth/db.js";
import { isEnabled } from "../../lib/feature-flags/service.js";
import { appendCrudAudit } from "../../audit/crud-audit.js";
import { companyBusinessDate } from "../../lib/company-business-date.js";
import {
  FACTORING_GL_POSTING_FLAG,
  loadExactLinkedChargebackAmounts,
  postFactoringChargebackEvent,
  postFactoringDefaultInterestAccrualEvent,
} from "./poster.service.js";
import {
  FACTORING_INTEREST_ACCRUAL_AFTER_DAY,
  FACTORING_REPURCHASE_DEADLINE_DAYS,
} from "./contract-config.js";

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

// A well-formed system UUID for cron-originated postings/audits (same identity the other accounting/driver
// crons use). Overridable via SYSTEM_ACTOR_USER_ID.
const SYSTEM_ACTOR_ID = process.env.SYSTEM_ACTOR_USER_ID ?? "00000000-0000-4000-8000-000000000001";

type OutstandingAdvance = {
  id: string;
  display_id: string;
  invoice_total_cents: number;
  advanced_at: string;
  day_index: number;
  last_accrual_date: string | null;
};

function ymd(iso: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  return companyBusinessDate(new Date(iso));
}

/** Pure calendar-day arithmetic on YYYY-MM-DD (no UTC wall-clock / DST shift). */
function addDays(ymdDate: string, days: number): string {
  const [y, m, d] = ymdDate.slice(0, 10).split("-").map(Number);
  const next = new Date(Date.UTC(y!, m! - 1, d! + days));
  const yy = next.getUTCFullYear();
  const mm = String(next.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(next.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

async function companyPostingEnabled(client: DbClient, operatingCompanyId: string): Promise<boolean> {
  return isEnabled(client as never, FACTORING_GL_POSTING_FLAG, { operating_company_id: operatingCompanyId });
}

// Advances that are funded, customer-unpaid (status 'advanced'), and past the 30+5 grace as of `asOf`.
async function selectOutstandingPastGrace(
  client: DbClient,
  operatingCompanyId: string,
  asOf: string,
  minDayIndex: number
): Promise<OutstandingAdvance[]> {
  const res = await client.query<{
    id: string;
    display_id: string;
    invoice_total_cents: string;
    advanced_at: string;
    day_index: string;
    last_accrual_date: string | null;
  }>(
    `
      SELECT
        fa.id::text,
        fa.display_id,
        fa.invoice_total_cents::text AS invoice_total_cents,
        fa.advanced_at::text          AS advanced_at,
        (($2::date) - ((fa.advanced_at AT TIME ZONE 'America/Chicago')::date))::text AS day_index,
        (
          SELECT MAX(a.accrual_date)::text
          FROM accounting.factoring_default_interest_accruals a
          WHERE a.operating_company_id = fa.operating_company_id
            AND a.factoring_advance_id = fa.id
            AND a.is_active = true
        ) AS last_accrual_date
      FROM accounting.factoring_advances fa
      WHERE fa.operating_company_id = $1::uuid
        AND fa.status = 'advanced'
        AND fa.advanced_at IS NOT NULL
        AND (($2::date) - ((fa.advanced_at AT TIME ZONE 'America/Chicago')::date)) >= $3::int
      ORDER BY fa.advanced_at ASC
    `,
    [operatingCompanyId, asOf, minDayIndex]
  );
  return res.rows.map((r) => ({
    id: r.id,
    display_id: r.display_id,
    invoice_total_cents: Number(r.invoice_total_cents ?? 0),
    advanced_at: r.advanced_at,
    day_index: Number(r.day_index ?? 0),
    last_accrual_date: r.last_accrual_date,
  }));
}

// Post every missing compounding accrual for ONE advance, from its first-uncharged day through `asOf`.
async function accrueThroughDateForAdvance(
  operatingCompanyId: string,
  advance: OutstandingAdvance,
  asOf: string,
  actorUserId: string
): Promise<number> {
  const firstChargeDay = ymd(addDays(ymd(advance.advanced_at), FACTORING_INTEREST_ACCRUAL_AFTER_DAY + 1));
  const resumeDay = advance.last_accrual_date ? ymd(addDays(advance.last_accrual_date, 1)) : firstChargeDay;
  let cursor = resumeDay > firstChargeDay ? resumeDay : firstChargeDay;
  let posted = 0;
  // Bounded loop: at most ~ (deadline) iterations; ascending so each day compounds off the committed prior.
  let guard = 0;
  while (cursor <= asOf && guard < 400) {
    guard += 1;
    const res = await postFactoringDefaultInterestAccrualEvent({
      operating_company_id: operatingCompanyId,
      factoring_advance_id: advance.id,
      actor_user_id: actorUserId,
      accrual_date_iso: cursor,
    });
    if (res.posted) posted += 1;
    cursor = addDays(cursor, 1);
  }
  return posted;
}

export type AccrualTickSummary = { flag_off: boolean; advances_scanned: number; accruals_posted: number };

export async function accrueDefaultInterestForCompany(input: {
  operating_company_id: string;
  as_of_date_iso?: string;
  actor_user_id?: string;
}): Promise<AccrualTickSummary> {
  const asOf = ymd(input.as_of_date_iso ?? companyBusinessDate());
  const actorUserId = input.actor_user_id ?? SYSTEM_ACTOR_ID;

  const advances = await withLuciaBypass(async (client: DbClient) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [input.operating_company_id]);
    if (!(await companyPostingEnabled(client, input.operating_company_id))) return null;
    return selectOutstandingPastGrace(client, input.operating_company_id, asOf, FACTORING_INTEREST_ACCRUAL_AFTER_DAY + 1);
  });

  if (advances === null) return { flag_off: true, advances_scanned: 0, accruals_posted: 0 };

  let accrualsPosted = 0;
  for (const advance of advances) {
    accrualsPosted += await accrueThroughDateForAdvance(input.operating_company_id, advance, asOf, actorUserId);
  }
  return { flag_off: false, advances_scanned: advances.length, accruals_posted: accrualsPosted };
}

export type RecourseTickSummary = { flag_off: boolean; advances_scanned: number; recoursed: number };

export async function triggerDay95RecourseForCompany(input: {
  operating_company_id: string;
  as_of_date_iso?: string;
  actor_user_id?: string;
}): Promise<RecourseTickSummary> {
  const asOf = ymd(input.as_of_date_iso ?? companyBusinessDate());
  const actorUserId = input.actor_user_id ?? SYSTEM_ACTOR_ID;

  const candidates = await withLuciaBypass(async (client: DbClient) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [input.operating_company_id]);
    if (!(await companyPostingEnabled(client, input.operating_company_id))) return null;
    return selectOutstandingPastGrace(client, input.operating_company_id, asOf, FACTORING_REPURCHASE_DEADLINE_DAYS);
  });

  if (candidates === null) return { flag_off: true, advances_scanned: 0, recoursed: 0 };

  let recoursed = 0;
  for (const advance of candidates) {
    // 1) Catch interest all the way up to today so the liability = Net + full accrued interest.
    await accrueThroughDateForAdvance(input.operating_company_id, advance, asOf, actorUserId);

    // 2) Exact linked outstanding amounts only — never guess from mutable status / invoice face alone.
    const exact = await loadExactLinkedChargebackAmounts(input.operating_company_id, advance.id);
    if (exact.liability_cents <= 0 || exact.recoursed_ar_cents <= 0) {
      continue;
    }

    // 3) Full-recourse chargeback in ONE caller-owned txn (repay + A/R return + status + audit).
    const cb = await postFactoringChargebackEvent({
      operating_company_id: input.operating_company_id,
      factoring_advance_id: advance.id,
      actor_user_id: actorUserId,
      charged_back_at_iso: asOf,
      chargeback_amount_cents: exact.liability_cents,
      default_interest_cents: 0,
      recoursed_ar_cents: exact.recoursed_ar_cents,
    });

    if (cb.reason === "flag_off") continue;
    if (!(cb.posted || cb.reason === "already_posted")) continue;

    // Orchestration audit only — status/subledger already committed inside chargeback txn.
    await withLuciaBypass(async (client: DbClient) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [input.operating_company_id]);
      await appendCrudAudit(
        client,
        actorUserId,
        "accounting.factoring_recourse_auto_day95",
        {
          resource_type: "accounting.factoring_advances",
          resource_id: advance.id,
          operating_company_id: input.operating_company_id,
          display_id: advance.display_id,
          repurchase_deadline_days: FACTORING_REPURCHASE_DEADLINE_DAYS,
          outstanding_liability_cents: exact.liability_cents,
          net_recoursed_ar_cents: exact.recoursed_ar_cents,
          journal_entry_id: cb.journal_entry_id ?? null,
        },
        "warning",
        "FACTORING-DAY95-RECOURSE"
      );
    });
    recoursed += 1;
  }
  return { flag_off: false, advances_scanned: candidates.length, recoursed };
}
