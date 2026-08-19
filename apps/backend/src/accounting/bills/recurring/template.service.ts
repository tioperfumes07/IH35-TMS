import { withCurrentUser, withLuciaBypass } from "../../../auth/db.js";
import { DateTime } from "luxon";

export type RecurringBillFrequency = "weekly" | "biweekly" | "monthly" | "quarterly" | "annually";

export type RecurringBillLineItem = {
  description: string;
  amount: number;
  coa_account_id?: string | null;
};

export type CreateTemplateInput = {
  operatingCompanyId: string;
  vendorUuid: string;
  templateName: string;
  amount: number;
  memo?: string | null;
  frequency: RecurringBillFrequency;
  dayOfMonth?: number | null;
  dayOfWeek?: number | null;
  nextGenerationDate: string;
  endDate?: string | null;
  autoPost?: boolean;
  lineItems?: RecurringBillLineItem[];
};

export type UpdateTemplateInput = Partial<Omit<CreateTemplateInput, "operatingCompanyId">>;

export type RecurringBillTemplate = {
  uuid: string;
  operating_company_id: string;
  vendor_uuid: string;
  vendor_name: string | null;
  template_name: string;
  amount: string;
  memo: string | null;
  frequency: RecurringBillFrequency;
  day_of_month: number | null;
  day_of_week: number | null;
  next_generation_date: string;
  end_date: string | null;
  is_active: boolean;
  auto_post: boolean;
  line_items: RecurringBillLineItem[];
  created_at: string;
  updated_at: string;
};

export async function createTemplate(data: CreateTemplateInput, userId: string): Promise<string> {
  const result = await withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [data.operatingCompanyId]);
    const res = await client.query<{ uuid: string }>(
      `
        INSERT INTO accounting.recurring_bill_templates (
          operating_company_id, vendor_uuid, template_name, amount, memo,
          frequency, day_of_month, day_of_week, next_generation_date, end_date,
          is_active, auto_post, line_items, created_at, updated_at
        )
        VALUES (
          $1, $2::uuid, $3, $4, $5,
          $6, $7, $8, $9::date, $10::date,
          true, $11, $12::jsonb, now(), now()
        )
        RETURNING uuid::text
      `,
      [
        data.operatingCompanyId,
        data.vendorUuid,
        data.templateName,
        data.amount,
        data.memo ?? null,
        data.frequency,
        data.dayOfMonth ?? null,
        data.dayOfWeek ?? null,
        data.nextGenerationDate,
        data.endDate ?? null,
        data.autoPost ?? false,
        JSON.stringify(data.lineItems ?? []),
      ]
    );
    if (!res.rows[0]) throw new Error("recurring_bill_template_insert_failed");
    return res.rows[0].uuid;
  });
  return result;
}

export async function updateTemplate(uuid: string, data: UpdateTemplateInput, userId: string): Promise<string> {
  const setClauses: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  const fieldMap: Record<string, string> = {
    vendorUuid: "vendor_uuid",
    templateName: "template_name",
    amount: "amount",
    memo: "memo",
    frequency: "frequency",
    dayOfMonth: "day_of_month",
    dayOfWeek: "day_of_week",
    nextGenerationDate: "next_generation_date",
    endDate: "end_date",
    autoPost: "auto_post",
    lineItems: "line_items",
  };

  for (const [key, col] of Object.entries(fieldMap)) {
    const val = (data as Record<string, unknown>)[key];
    if (val !== undefined) {
      if (key === "lineItems") {
        setClauses.push(`${col} = $${idx}::jsonb`);
        values.push(JSON.stringify(val));
      } else if (key === "nextGenerationDate" || key === "endDate") {
        setClauses.push(`${col} = $${idx}::date`);
        values.push(val ?? null);
      } else if (key === "vendorUuid") {
        setClauses.push(`${col} = $${idx}::uuid`);
        values.push(val);
      } else {
        setClauses.push(`${col} = $${idx}`);
        values.push(val);
      }
      idx++;
    }
  }

  if (setClauses.length === 0) return uuid;

  setClauses.push(`updated_at = now()`);
  values.push(uuid);

  const result = await withCurrentUser(userId, async (client) => {
    const res = await client.query<{ uuid: string }>(
      `UPDATE accounting.recurring_bill_templates SET ${setClauses.join(", ")} WHERE uuid = $${idx}::uuid RETURNING uuid::text`,
      values
    );
    if (!res.rows[0]) throw new Error("recurring_bill_template_not_found");
    return res.rows[0].uuid;
  });
  return result;
}

// ACCT-F5595: updateTemplate/deactivateTemplate/generateFromTemplate all took only a template uuid
// with no operating_company_id anywhere in their call chain -- a caller who knew/guessed another
// company's template uuid could update it, deactivate it, or (via generate-now) trigger creation of
// a real bill in that company's books, with zero ownership check. This lookup lets the ROUTE resolve
// the template's real owning company BEFORE calling any of the three mutators, so it can assert the
// caller is actually a member of that company. Deliberately company-agnostic itself (bypasses RLS,
// matching generateFromTemplate's own withLuciaBypass template fetch) since its only job is to name
// the owner for an authorization check the caller performs next, not to scope a data read.
export async function resolveTemplateOperatingCompanyId(uuid: string): Promise<string | null> {
  return withLuciaBypass(async (client) => {
    const res = await client.query<{ operating_company_id: string }>(
      `SELECT operating_company_id::text FROM accounting.recurring_bill_templates WHERE uuid = $1::uuid`,
      [uuid]
    );
    return res.rows[0]?.operating_company_id ?? null;
  });
}

export async function deactivateTemplate(uuid: string, userId: string): Promise<string> {
  const result = await withCurrentUser(userId, async (client) => {
    const res = await client.query<{ uuid: string }>(
      `
        UPDATE accounting.recurring_bill_templates
        SET is_active = false, updated_at = now()
        WHERE uuid = $1::uuid AND is_active = true
        RETURNING uuid::text
      `,
      [uuid]
    );
    if (!res.rows[0]) throw new Error("recurring_bill_template_not_found_or_already_inactive");
    return res.rows[0].uuid;
  });
  return result;
}

export async function getTemplate(uuid: string, operatingCompanyId: string, userId: string): Promise<RecurringBillTemplate> {
  const result = await withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [operatingCompanyId]);
    const res = await client.query<RecurringBillTemplate>(
      `
        SELECT t.*, v.vendor_name
        FROM accounting.recurring_bill_templates t
        LEFT JOIN mdata.vendors v ON v.id = t.vendor_uuid AND v.operating_company_id = t.operating_company_id
        WHERE t.uuid = $1::uuid AND t.operating_company_id = $2::uuid
      `,
      [uuid, operatingCompanyId]
    );
    if (!res.rows[0]) throw new Error("recurring_bill_template_not_found");
    return res.rows[0];
  });
  return result;
}

export async function listTemplates(
  operatingCompanyId: string,
  userId: string,
  opts: { activeOnly?: boolean; dueSoon?: boolean } = {}
): Promise<RecurringBillTemplate[]> {
  const conditions: string[] = ["t.operating_company_id = $1::uuid"];
  const values: unknown[] = [operatingCompanyId];
  let idx = 2;

  if (opts.activeOnly) {
    conditions.push(`t.is_active = true`);
  }
  if (opts.dueSoon) {
    const cutoff = DateTime.utc().plus({ days: 7 }).toISODate();
    conditions.push(`t.next_generation_date <= $${idx}::date`);
    values.push(cutoff);
    idx++;
  }

  const result = await withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [operatingCompanyId]);
    const res = await client.query<RecurringBillTemplate>(
      `
        SELECT t.*, v.vendor_name
        FROM accounting.recurring_bill_templates t
        LEFT JOIN mdata.vendors v ON v.id = t.vendor_uuid AND v.operating_company_id = t.operating_company_id
        WHERE ${conditions.join(" AND ")}
        ORDER BY t.next_generation_date ASC
      `,
      values
    );
    return res.rows;
  });
  return result;
}

export async function listActiveTemplatesDue(userId: string): Promise<RecurringBillTemplate[]> {
  const today = DateTime.utc().toISODate()!;
  const result = await withLuciaBypass(async (client) => {
    const res = await client.query<RecurringBillTemplate>(
      `
        SELECT * FROM accounting.recurring_bill_templates
        WHERE is_active = true
          AND next_generation_date <= $1::date
          AND (end_date IS NULL OR end_date >= $1::date)
        ORDER BY next_generation_date ASC
      `,
      [today]
    );
    return res.rows;
  });
  return result;
}
