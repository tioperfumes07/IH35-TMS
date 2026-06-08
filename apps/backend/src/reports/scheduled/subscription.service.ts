import { withCurrentUser, withLuciaBypass } from "../../auth/db.js";
import { computeNextScheduledAt, type CadenceInput, type SubscriptionCadence } from "./cadence.js";

export type ScheduledSubscription = {
  uuid: string;
  operating_company_id: string;
  report_slug: string;
  cadence: SubscriptionCadence;
  day_of_week: number | null;
  day_of_month: number | null;
  time_of_day: string;
  timezone: string;
  recipient_emails: string[];
  recipient_user_uuids: string[] | null;
  is_active: boolean;
  last_sent_at: string | null;
  next_scheduled_at: string | null;
  delivery_format: "pdf" | "xlsx" | "html";
  created_at: string;
  updated_at: string;
};

export type DeliveryLogRow = {
  uuid: string;
  subscription_uuid: string;
  sent_at: string;
  status: "success" | "failed" | "bounced";
  error_message: string | null;
  recipients: string[] | null;
};

export type CreateSubscriptionInput = {
  operatingCompanyId: string;
  reportSlug: string;
  cadence: SubscriptionCadence;
  dayOfWeek?: number | null;
  dayOfMonth?: number | null;
  timeOfDay: string;
  timezone?: string;
  recipientEmails: string[];
  recipientUserUuids?: string[] | null;
  deliveryFormat?: "pdf" | "xlsx" | "html";
};

export type UpdateSubscriptionInput = Partial<Omit<CreateSubscriptionInput, "operatingCompanyId" | "reportSlug">>;

function mapSubscriptionRow(row: Record<string, unknown>): ScheduledSubscription {
  return {
    uuid: String(row.uuid),
    operating_company_id: String(row.operating_company_id),
    report_slug: String(row.report_slug),
    cadence: String(row.cadence) as SubscriptionCadence,
    day_of_week: row.day_of_week != null ? Number(row.day_of_week) : null,
    day_of_month: row.day_of_month != null ? Number(row.day_of_month) : null,
    time_of_day: String(row.time_of_day).slice(0, 8),
    timezone: String(row.timezone ?? "America/Chicago"),
    recipient_emails: Array.isArray(row.recipient_emails) ? (row.recipient_emails as string[]) : [],
    recipient_user_uuids: Array.isArray(row.recipient_user_uuids)
      ? (row.recipient_user_uuids as string[])
      : null,
    is_active: row.is_active !== false,
    last_sent_at: row.last_sent_at ? new Date(String(row.last_sent_at)).toISOString() : null,
    next_scheduled_at: row.next_scheduled_at ? new Date(String(row.next_scheduled_at)).toISOString() : null,
    delivery_format: String(row.delivery_format ?? "pdf") as ScheduledSubscription["delivery_format"],
    created_at: new Date(String(row.created_at)).toISOString(),
    updated_at: new Date(String(row.updated_at)).toISOString(),
  };
}

function cadenceFromRow(row: Record<string, unknown>): CadenceInput {
  return {
    cadence: String(row.cadence) as SubscriptionCadence,
    dayOfWeek: row.day_of_week != null ? Number(row.day_of_week) : null,
    dayOfMonth: row.day_of_month != null ? Number(row.day_of_month) : null,
    timeOfDay: String(row.time_of_day).slice(0, 8),
    timezone: String(row.timezone ?? "America/Chicago"),
  };
}

export async function listSubscriptions(operatingCompanyId: string, userId: string): Promise<ScheduledSubscription[]> {
  return withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);
    const res = await client.query(
      `SELECT * FROM reports.scheduled_subscriptions WHERE operating_company_id = $1 ORDER BY report_slug ASC`,
      [operatingCompanyId]
    );
    return res.rows.map((row) => mapSubscriptionRow(row as Record<string, unknown>));
  });
}

export async function createSubscription(data: CreateSubscriptionInput, userId: string): Promise<string> {
  const timezone = data.timezone?.trim() || "America/Chicago";
  const nextAt = computeNextScheduledAt({
    cadence: data.cadence,
    dayOfWeek: data.dayOfWeek,
    dayOfMonth: data.dayOfMonth,
    timeOfDay: data.timeOfDay,
    timezone,
  });

  return withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [data.operatingCompanyId]);
    const res = await client.query<{ uuid: string }>(
      `
        INSERT INTO reports.scheduled_subscriptions (
          operating_company_id, report_slug, cadence, day_of_week, day_of_month,
          time_of_day, timezone, recipient_emails, recipient_user_uuids,
          delivery_format, next_scheduled_at, is_active, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6::time, $7, $8::text[], $9::uuid[], $10, $11, true, now(), now())
        RETURNING uuid::text
      `,
      [
        data.operatingCompanyId,
        data.reportSlug,
        data.cadence,
        data.dayOfWeek ?? null,
        data.dayOfMonth ?? null,
        data.timeOfDay,
        timezone,
        data.recipientEmails,
        data.recipientUserUuids?.length ? data.recipientUserUuids : null,
        data.deliveryFormat ?? "pdf",
        nextAt.toISOString(),
      ]
    );
    if (!res.rows[0]) throw new Error("scheduled_subscription_insert_failed");
    return res.rows[0].uuid;
  });
}

export async function updateSubscription(
  uuid: string,
  operatingCompanyId: string,
  data: UpdateSubscriptionInput,
  userId: string
): Promise<ScheduledSubscription> {
  return withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);
    const existing = await client.query(
      `SELECT * FROM reports.scheduled_subscriptions WHERE uuid = $1::uuid AND operating_company_id = $2`,
      [uuid, operatingCompanyId]
    );
    if (!existing.rows[0]) throw new Error("scheduled_subscription_not_found");

    const merged = { ...(existing.rows[0] as Record<string, unknown>) };
    if (data.cadence) merged.cadence = data.cadence;
    if ("dayOfWeek" in data) merged.day_of_week = data.dayOfWeek ?? null;
    if ("dayOfMonth" in data) merged.day_of_month = data.dayOfMonth ?? null;
    if (data.timeOfDay) merged.time_of_day = data.timeOfDay;
    if (data.timezone) merged.timezone = data.timezone;
    if (data.recipientEmails) merged.recipient_emails = data.recipientEmails;
    if ("recipientUserUuids" in data) merged.recipient_user_uuids = data.recipientUserUuids ?? null;
    if (data.deliveryFormat) merged.delivery_format = data.deliveryFormat;

    const nextAt = computeNextScheduledAt(cadenceFromRow(merged));
    const setClauses = ["updated_at = now()", "next_scheduled_at = $3"];
    const values: unknown[] = [uuid, operatingCompanyId, nextAt.toISOString()];
    let idx = 4;

    const fieldMap: Record<string, string> = {
      cadence: "cadence",
      dayOfWeek: "day_of_week",
      dayOfMonth: "day_of_month",
      timeOfDay: "time_of_day",
      timezone: "timezone",
      recipientEmails: "recipient_emails",
      recipientUserUuids: "recipient_user_uuids",
      deliveryFormat: "delivery_format",
    };

    for (const [key, column] of Object.entries(fieldMap)) {
      if (!(key in data)) continue;
      const value = (data as Record<string, unknown>)[key];
      if (key === "recipientEmails") {
        setClauses.push(`${column} = $${idx}::text[]`);
        values.push(value);
      } else if (key === "recipientUserUuids") {
        setClauses.push(`${column} = $${idx}::uuid[]`);
        values.push(Array.isArray(value) && value.length ? value : null);
      } else if (key === "timeOfDay") {
        setClauses.push(`${column} = $${idx}::time`);
        values.push(value);
      } else {
        setClauses.push(`${column} = $${idx}`);
        values.push(value);
      }
      idx += 1;
    }

    const res = await client.query(
      `UPDATE reports.scheduled_subscriptions SET ${setClauses.join(", ")} WHERE uuid = $1::uuid AND operating_company_id = $2 RETURNING *`,
      values
    );
    if (!res.rows[0]) throw new Error("scheduled_subscription_not_found");
    return mapSubscriptionRow(res.rows[0] as Record<string, unknown>);
  });
}

export async function deactivateSubscription(uuid: string, operatingCompanyId: string, userId: string): Promise<void> {
  await withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);
    const res = await client.query(
      `
        UPDATE reports.scheduled_subscriptions
        SET is_active = false, updated_at = now()
        WHERE uuid = $1::uuid AND operating_company_id = $2 AND is_active = true
        RETURNING uuid
      `,
      [uuid, operatingCompanyId]
    );
    if (!res.rows[0]) throw new Error("scheduled_subscription_not_found_or_already_inactive");
  });
}

export async function listDeliveryLog(
  operatingCompanyId: string,
  userId: string,
  opts?: { subscriptionUuid?: string; limit?: number }
): Promise<DeliveryLogRow[]> {
  const limit = Math.min(Math.max(opts?.limit ?? 100, 1), 500);
  return withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);
    const params: unknown[] = [operatingCompanyId, limit];
    let filter = "";
    if (opts?.subscriptionUuid) {
      filter = "AND l.subscription_uuid = $3::uuid";
      params.push(opts.subscriptionUuid);
    }
    const res = await client.query(
      `
        SELECT l.*
        FROM reports.scheduled_delivery_log l
        JOIN reports.scheduled_subscriptions s ON s.uuid = l.subscription_uuid
        WHERE s.operating_company_id = $1
        ${filter}
        ORDER BY l.sent_at DESC
        LIMIT $2
      `,
      params
    );
    return res.rows.map((row) => ({
      uuid: String((row as Record<string, unknown>).uuid),
      subscription_uuid: String((row as Record<string, unknown>).subscription_uuid),
      sent_at: new Date(String((row as Record<string, unknown>).sent_at)).toISOString(),
      status: String((row as Record<string, unknown>).status) as DeliveryLogRow["status"],
      error_message: (row as Record<string, unknown>).error_message
        ? String((row as Record<string, unknown>).error_message)
        : null,
      recipients: Array.isArray((row as Record<string, unknown>).recipients)
        ? ((row as Record<string, unknown>).recipients as string[])
        : null,
    }));
  });
}

export async function listDueSubscriptions(now: Date = new Date()): Promise<ScheduledSubscription[]> {
  return withLuciaBypass(async (client) => {
    const res = await client.query(
      `
        SELECT *
        FROM reports.scheduled_subscriptions
        WHERE is_active = true
          AND next_scheduled_at IS NOT NULL
          AND next_scheduled_at <= $1::timestamptz
        ORDER BY next_scheduled_at ASC
        LIMIT 200
      `,
      [now.toISOString()]
    );
    return res.rows.map((row) => mapSubscriptionRow(row as Record<string, unknown>));
  });
}

export async function markSubscriptionSent(
  uuid: string,
  operatingCompanyId: string,
  cadence: CadenceInput,
  sentAt: Date = new Date()
): Promise<void> {
  const nextAt = computeNextScheduledAt(cadence, sentAt);
  await withLuciaBypass(async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);
    await client.query(
      `
        UPDATE reports.scheduled_subscriptions
        SET last_sent_at = $3::timestamptz,
            next_scheduled_at = $4::timestamptz,
            updated_at = now()
        WHERE uuid = $1::uuid AND operating_company_id = $2
      `,
      [uuid, operatingCompanyId, sentAt.toISOString(), nextAt.toISOString()]
    );
  });
}

export async function appendDeliveryLog(input: {
  subscriptionUuid: string;
  operatingCompanyId: string;
  status: "success" | "failed" | "bounced";
  errorMessage?: string | null;
  recipients: string[];
}): Promise<void> {
  await withLuciaBypass(async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [input.operatingCompanyId]);
    await client.query(
      `
        INSERT INTO reports.scheduled_delivery_log (subscription_uuid, status, error_message, recipients)
        VALUES ($1::uuid, $2, $3, $4::text[])
      `,
      [input.subscriptionUuid, input.status, input.errorMessage ?? null, input.recipients]
    );
  });
}
