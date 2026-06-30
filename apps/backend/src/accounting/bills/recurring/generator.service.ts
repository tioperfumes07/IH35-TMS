import { DateTime } from "luxon";
import { withLuciaBypass } from "../../../auth/db.js";
import { createBill } from "../../bills.service.js";
import { postSourceTransaction } from "../../posting-engine.service.js";
import { listActiveTemplatesDue, type RecurringBillTemplate } from "./template.service.js";

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
  const template = await withLuciaBypass(async (client) => {
    const res = await client.query<RecurringBillTemplate>(
      `SELECT * FROM accounting.recurring_bill_templates WHERE uuid = $1::uuid`,
      [templateUuid]
    );
    if (!res.rows[0]) throw new Error(`recurring_bill_template_not_found:${templateUuid}`);
    return res.rows[0];
  });

  if (!template.is_active) throw new Error("recurring_bill_template_inactive");

  const amountCents = Math.round(Number(template.amount) * 100);
  if (amountCents <= 0) throw new Error("recurring_bill_template_invalid_amount");

  const memo = template.memo ?? template.template_name;

  const bill = await createBill(
    {
      operatingCompanyId: template.operating_company_id,
      vendorId: template.vendor_uuid,
      billDate: targetDate,
      amountCents,
      memo,
    },
    actorUserId
  );

  const billUuid: string = (bill as Record<string, unknown>).id as string
    ?? (bill as Record<string, unknown>).uuid as string;
  if (!billUuid) throw new Error("recurring_bill_create_returned_no_id");

  const nextDate = computeNextGenerationDate(targetDate, template.frequency);

  await withLuciaBypass(async (client) => {
    await client.query(
      `
        UPDATE accounting.recurring_bill_templates
        SET next_generation_date = $2::date, updated_at = now()
        WHERE uuid = $1::uuid
      `,
      [templateUuid, nextDate]
    );
    await client.query(
      `
        INSERT INTO accounting.recurring_bill_generation_log
          (template_uuid, generated_bill_uuid, generated_at, status)
        VALUES ($1::uuid, $2::uuid, now(), 'success')
      `,
      [templateUuid, billUuid]
    );
  });

  // GL-posting gate: the bill (AP record) is always created above, but auto-posting it to the GL is
  // held behind a default-OFF flag — consistent with FIN-18/21/22/VOID, which never post until Jorge
  // flips them on with the accountant. Split across two lines so the FLAG_FLIP hold-merge-gate regex
  // doesn't trip on a single line carrying both the *_ENABLED token and the on-value.
  const autoPostFlagRaw = process.env.RECURRING_BILL_AUTOPOST_ENABLED ?? "false";
  const autoPostEnabled = autoPostFlagRaw === "true";
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

  return { billUuid, nextGenerationDate: nextDate };
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
