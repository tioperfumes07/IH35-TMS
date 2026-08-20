import { DateTime } from "luxon";
import { withLuciaBypass } from "../../../auth/db.js";
import { createBill } from "../../bills.service.js";
import { postSourceTransaction } from "../../posting-engine.service.js";
import { isEnabled } from "../../../lib/feature-flags/service.js";
import { listActiveTemplatesDue, type RecurringBillTemplate } from "./template.service.js";

// GL-posting kill switch for recurring-bill autopost. A recurring bill's autopost IS bill posting, so it
// is gated by the SAME per-entity flag as every other bill post — resolved via lib.feature_flags
// (isEnabled) per operating_company_id, NOT a raw process.env global (which would flip autopost on for
// EVERY entity at once, violating the per-entity kill-switch rule). Default OFF.
const BILL_GL_POSTING_FLAG_KEY = "BILL_GL_POSTING_ENABLED";

export function computeNextGenerationDate(currentDate: string, frequency: string): string {
  const dt = DateTime.fromISO(currentDate, { zone: "utc" });
  if (!dt.isValid) throw new Error("recurring_bill_invalid_date");
  switch (frequency) {
    case "weekly":
      return dt.plus({ weeks: 1 }).toISODate()!;
    case "biweekly":
      return dt.plus({ weeks: 2 }).toISODate()!;
    case "monthly":
      return dt.plus({ months: 1 }).toISODate()!;
    case "quarterly":
      return dt.plus({ months: 3 }).toISODate()!;
    case "annually":
      return dt.plus({ years: 1 }).toISODate()!;
    default:
      throw new Error(`recurring_bill_unknown_frequency:${frequency}`);
  }
}

export async function generateFromTemplate(
  templateUuid: string,
  targetDate: string,
  actorUserId: string
): Promise<{ billUuid: string; nextGenerationDate: string }> {
  // ACCT-F5649 — the template row is locked FOR UPDATE for the ENTIRE check-generate-advance
  // sequence (read -> validate -> createBill -> compare-and-swap next_generation_date -> log), all
  // inside this ONE withLuciaBypass transaction. createBill() itself still opens its own separate
  // connection (a genuinely different pool/transaction) — that's fine, because the lock's job here
  // is pure mutual exclusion: a second concurrent/retried call to generate-now (or a cron tick racing
  // a manual click) blocks on the SAME `SELECT ... FOR UPDATE` until this one commits or rolls back,
  // so it can never read the stale next_generation_date and duplicate the bill. Previously the read,
  // the createBill() call, and the next_generation_date advance each ran on independent unlocked
  // connections, so two near-simultaneous calls could both pass the is_active check, both create a
  // real duplicate AP bill (and duplicate GL JE if BILL_GL_POSTING_ENABLED), and then race a blind,
  // non-CAS UPDATE where the last write wins.
  const { billUuid, nextGenerationDate, template } = await withLuciaBypass(async (client) => {
    const res = await client.query<RecurringBillTemplate>(
      `SELECT * FROM accounting.recurring_bill_templates WHERE uuid = $1::uuid FOR UPDATE`,
      [templateUuid]
    );
    const tmpl = res.rows[0];
    if (!tmpl) throw new Error(`recurring_bill_template_not_found:${templateUuid}`);

    if (!tmpl.is_active) throw new Error("recurring_bill_template_inactive");

    // A concurrent call that was blocked on the lock above and only now proceeds: the freshly-locked
    // row may already show generation advanced past this cycle (the first caller won the race and
    // committed while we waited). Reject rather than silently duplicate.
    if (tmpl.next_generation_date && String(tmpl.next_generation_date) > targetDate) {
      throw new Error("recurring_bill_already_generated_for_period");
    }

    const amountCents = Math.round(Number(tmpl.amount) * 100);
    if (amountCents <= 0) throw new Error("recurring_bill_template_invalid_amount");

    const memo = tmpl.memo ?? tmpl.template_name;

    // When the template stores line items with CoA, create real bill_lines (LAW §9).
    const rawLines = Array.isArray(tmpl.line_items) ? tmpl.line_items : [];
    const billLines =
      rawLines.length > 0
        ? rawLines.map((line) => {
            const lineCents = Math.round(Number(line.amount) * 100);
            if (!Number.isFinite(lineCents) || lineCents <= 0) {
              throw new Error("recurring_bill_line_amount_invalid");
            }
            if (!line.coa_account_id) {
              throw new Error("recurring_bill_line_coa_required");
            }
            return {
              accountId: line.coa_account_id,
              amountCents: lineCents,
              description: line.description || tmpl.template_name,
              section: "A" as const,
            };
          })
        : undefined;
    if (billLines) {
      const linesSum = billLines.reduce((sum, line) => sum + line.amountCents, 0);
      if (linesSum !== amountCents) throw new Error("recurring_bill_lines_amount_mismatch");
    }

    // LV-BILL-HEADER-ONLY-UNPOSTABLE / P1-BILL-GL (2026-08-16) — this file's own removed comment
    // documented "Header-only remains for legacy templates with an empty line_items array": exactly
    // the defect createBill() now refuses (a bill with zero accounting.bill_lines rows the GL poster
    // can never resolve). `accounting.recurring_bill_templates` has no CoA column of its own — the
    // `coa_account_id` field on the `RecurringBillTemplate` TS type is a phantom, never backed by a
    // real DB column (verified live: 0 rows on prod, `information_schema.columns` confirms the column
    // does not exist) — so there is no template-level fallback to synthesize a line from. Fail loud
    // instead: a template with empty line_items cannot generate a postable bill and must not silently
    // produce one that sits unresolved forever.
    if (!billLines) {
      throw new Error("recurring_bill_template_missing_line_items");
    }

    const bill = await createBill(
      {
        operatingCompanyId: tmpl.operating_company_id,
        vendorId: tmpl.vendor_uuid,
        billDate: targetDate,
        amountCents,
        memo,
        lines: billLines,
      },
      actorUserId
    );

    const billId: string = (bill as Record<string, unknown>).id as string
      ?? (bill as Record<string, unknown>).uuid as string;
    if (!billId) throw new Error("recurring_bill_create_returned_no_id");

    const nextDate = computeNextGenerationDate(targetDate, tmpl.frequency);

    // Compare-and-swap against the value read under the SAME lock — under normal operation this can
    // never miss (nothing else can touch this row while we hold FOR UPDATE), but it's cheap
    // defense-in-depth matching this codebase's established CAS convention (e.g. ACCT-F5636/F5646/F5647).
    const upd = await client.query(
      `
        UPDATE accounting.recurring_bill_templates
        SET next_generation_date = $2::date, updated_at = now()
        WHERE uuid = $1::uuid AND next_generation_date IS NOT DISTINCT FROM $3::date
      `,
      [templateUuid, nextDate, tmpl.next_generation_date]
    );
    if (upd.rowCount === 0) throw new Error("recurring_bill_template_generation_race");

    await client.query(
      `
        INSERT INTO accounting.recurring_bill_generation_log
          (template_uuid, generated_bill_uuid, generated_at, status)
        VALUES ($1::uuid, $2::uuid, now(), 'success')
      `,
      [templateUuid, billId]
    );

    return { billUuid: billId, nextGenerationDate: nextDate, template: tmpl };
  });

  // GL-posting gate: the bill (AP record) is always created above, but auto-posting it to the GL is
  // held behind a default-OFF, PER-ENTITY flag resolved via lib.feature_flags (isEnabled) — consistent
  // with FIN-18/21/22/VOID, which never post until Jorge flips them on with the accountant. Resolved on
  // a scoped client for THIS template's operating_company_id, so a flip is per-entity (never a raw
  // process.env global that would enable autopost for every entity at once). Default OFF => no-op.
  const autoPostEnabled = await withLuciaBypass(async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [template.operating_company_id]);
    return isEnabled(client, BILL_GL_POSTING_FLAG_KEY, {
      operating_company_id: template.operating_company_id,
      user_uuid: actorUserId,
    });
  });
  if (template.auto_post && autoPostEnabled) {
    try {
      await postSourceTransaction(
        {
          operating_company_id: template.operating_company_id,
          source_transaction_type: "bill",
          source_transaction_id: billUuid,
        },
        { userId: actorUserId }
      );
    } catch (err) {
      // log but don't fail — bill already created
      console.error("[recurring-bills] auto_post failed for bill", billUuid, err);
    }
  }

  return { billUuid, nextGenerationDate };
}

export type GeneratorRunSummary = {
  processed: number;
  succeeded: number;
  failed: number;
  errors: Array<{ templateUuid: string; error: string }>;
};

export async function runRecurringBillGeneratorTick(
  actorUserId: string,
  targetDate?: string
): Promise<GeneratorRunSummary> {
  const date = targetDate ?? DateTime.utc().toISODate()!;
  const templates = await listActiveTemplatesDue(actorUserId);

  const summary: GeneratorRunSummary = {
    processed: templates.length,
    succeeded: 0,
    failed: 0,
    errors: [],
  };

  for (const tmpl of templates) {
    try {
      await generateFromTemplate(tmpl.uuid, date, actorUserId);
      summary.succeeded++;
    } catch (err) {
      summary.failed++;
      const msg = err instanceof Error ? err.message : String(err);
      summary.errors.push({ templateUuid: tmpl.uuid, error: msg });

      await withLuciaBypass(async (client) => {
        await client.query(
          `
            INSERT INTO accounting.recurring_bill_generation_log
              (template_uuid, generated_at, status, error_message)
            VALUES ($1::uuid, now(), 'failed', $2)
          `,
          [tmpl.uuid, msg]
        );
      }).catch(() => {});
    }
  }

  return summary;
}
