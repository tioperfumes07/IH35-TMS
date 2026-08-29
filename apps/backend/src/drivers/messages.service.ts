import { enqueueOutboxEvent } from "../outbox/enqueue-outbox-event.js";

type Queryable = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[]; rowCount?: number }>;
};

export class DriverMessagePersistenceError extends Error {
  constructor(readonly operation: "create" | "delivery_status") {
    super(`driver_message_${operation}_failed`);
    this.name = "DriverMessagePersistenceError";
  }
}

export function requireDriverMessageRow<T>(rows: T[], operation: "create" | "delivery_status"): T {
  const row = rows[0];
  if (!row) throw new DriverMessagePersistenceError(operation);
  return row;
}

async function updateDriverMessageDeliveryStatus(
  client: Queryable,
  input: { messageId: string; operatingCompanyId: string; driverId: string; status: "delivered" | "failed" }
) {
  const res = await client.query<{ id: string }>(
    `UPDATE mdata.driver_profile_messages
     SET delivery_status = $4
     WHERE id = $1 AND operating_company_id = $2::uuid AND driver_id = $3::uuid
     RETURNING id::text`,
    [input.messageId, input.operatingCompanyId, input.driverId, input.status]
  );
  requireDriverMessageRow(res.rows, "delivery_status");
}

export type DriverMessageRow = {
  id: string;
  operating_company_id: string;
  driver_id: string;
  message: string;
  channel: "sms" | "email" | "in_app";
  urgency: string | null;
  created_by: string | null;
  created_at: string;
  read_at: string | null;
  read_by: string | null;
  delivery_status: string;
  delivery_ref: string | null;
  sender_side: "office" | "driver";
  driver_name?: string;
};

function mapMessageRow(row: Record<string, unknown>): DriverMessageRow {
  const identityUserId = row.identity_user_id as string | null | undefined;
  const createdBy = row.created_by as string | null;
  const senderSide: "office" | "driver" =
    identityUserId && createdBy && createdBy === identityUserId ? "driver" : "office";
  return {
    id: String(row.id),
    operating_company_id: String(row.operating_company_id),
    driver_id: String(row.driver_id),
    message: String(row.message),
    channel: row.channel as DriverMessageRow["channel"],
    urgency: (row.urgency as string | null) ?? null,
    created_by: createdBy,
    created_at: String(row.created_at),
    read_at: (row.read_at as string | null) ?? null,
    read_by: (row.read_by as string | null) ?? null,
    delivery_status: String(row.delivery_status ?? "pending"),
    delivery_ref: (row.delivery_ref as string | null) ?? null,
    sender_side: senderSide,
    driver_name: row.driver_name ? String(row.driver_name) : undefined,
  };
}

const MESSAGE_SELECT = `
  SELECT
    m.id::text,
    m.operating_company_id::text,
    m.driver_id::text,
    m.message,
    m.channel,
    m.urgency,
    m.created_by::text,
    m.created_at::text,
    m.read_at::text,
    m.read_by::text,
    m.delivery_status,
    m.delivery_ref,
    d.identity_user_id::text AS identity_user_id,
    concat_ws(' ', d.first_name, d.last_name) AS driver_name
  FROM mdata.driver_profile_messages m
  JOIN mdata.drivers d ON d.id = m.driver_id
                       AND (
                         d.operating_company_id = m.operating_company_id
                         OR EXISTS (
                           SELECT 1 FROM mdata.driver_company_authorizations select_dca
                           WHERE select_dca.driver_id = d.id
                             AND select_dca.company_id = m.operating_company_id
                             AND select_dca.is_authorized = true
                             AND select_dca.deactivated_at IS NULL
                         )
                       )
`;

export async function listDriverMessageThread(
  client: Queryable,
  operatingCompanyId: string,
  driverId: string
): Promise<DriverMessageRow[]> {
  const res = await client.query(
    `
      ${MESSAGE_SELECT}
      WHERE m.operating_company_id = $1::uuid
        AND m.driver_id = $2
      ORDER BY m.created_at ASC
    `,
    [operatingCompanyId, driverId]
  );
  return res.rows.map((row) => mapMessageRow(row as Record<string, unknown>));
}

export async function listOfficeInbox(
  client: Queryable,
  operatingCompanyId: string
): Promise<
  Array<{
    driver_id: string;
    driver_name: string;
    latest_message: string;
    latest_at: string;
    unread_count: number;
    latest_channel: string;
  }>
> {
  const res = await client.query(
    `
      SELECT
        d.id::text AS driver_id,
        concat_ws(' ', d.first_name, d.last_name) AS driver_name,
        lm.message AS latest_message,
        lm.created_at::text AS latest_at,
        lm.channel AS latest_channel,
        COALESCE(uc.unread_count, 0)::int AS unread_count
      FROM mdata.drivers d
      JOIN LATERAL (
        SELECT message, created_at, channel
        FROM mdata.driver_profile_messages m
        WHERE m.driver_id = d.id
          AND m.operating_company_id = $1::uuid
        ORDER BY m.created_at DESC
        LIMIT 1
      ) lm ON true
      LEFT JOIN LATERAL (
        SELECT count(*)::int AS unread_count
        FROM mdata.driver_profile_messages m
        WHERE m.driver_id = d.id
          AND m.operating_company_id = $1::uuid
          AND m.read_at IS NULL
          AND m.created_by IS NOT NULL
          AND m.created_by = d.identity_user_id
      ) uc ON true
      WHERE (
          d.operating_company_id = $1::uuid
          OR EXISTS (
            SELECT 1 FROM mdata.driver_company_authorizations inbox_dca
            WHERE inbox_dca.driver_id = d.id
              AND inbox_dca.company_id = $1::uuid
              AND inbox_dca.is_authorized = true
              AND inbox_dca.deactivated_at IS NULL
          )
        )
        AND d.deactivated_at IS NULL
        AND d.archived_at IS NULL
      ORDER BY lm.created_at DESC
    `,
    [operatingCompanyId]
  );
  return res.rows as Array<{
    driver_id: string;
    driver_name: string;
    latest_message: string;
    latest_at: string;
    unread_count: number;
    latest_channel: string;
  }>;
}

export async function listUnreadMessages(
  client: Queryable,
  operatingCompanyId: string
): Promise<DriverMessageRow[]> {
  const res = await client.query(
    `
      ${MESSAGE_SELECT}
      WHERE m.operating_company_id = $1::uuid
        AND m.read_at IS NULL
        AND m.created_by IS NOT NULL
        AND m.created_by = d.identity_user_id
      ORDER BY m.created_at DESC
    `,
    [operatingCompanyId]
  );
  return res.rows.map((row) => mapMessageRow(row as Record<string, unknown>));
}

export async function listDriverPwaMessages(client: Queryable, driverId: string): Promise<DriverMessageRow[]> {
  const res = await client.query(
    `
      ${MESSAGE_SELECT}
      WHERE m.driver_id = $1
      ORDER BY m.created_at ASC
    `,
    [driverId]
  );
  return res.rows.map((row) => mapMessageRow(row as Record<string, unknown>));
}

/**
 * DRV-F6179 — the PWA GET (listDriverPwaMessages, DRV-F6178) returns messages from every company
 * the driver is authorized for, home or shared, but the write endpoints (reply / mark-read) always
 * derived the acting company from the driver's HOME company alone. A shared driver marking a
 * non-home-company message read got a 404 (dead click); replying silently inserted the reply into
 * the wrong (home-company) thread instead of erroring. This asserts the SAME predicate the SELECT
 * side and markMessageRead already encode (home company OR an active canonical authorization)
 * BEFORE a write is allowed to target a non-home company. Throws `driver_company_not_authorized`.
 */
export async function assertDriverActingCompany(
  client: Queryable,
  driverId: string,
  operatingCompanyId: string
): Promise<void> {
  const res = await client.query(
    `
      SELECT 1
      FROM mdata.drivers d
      WHERE d.id = $1
        AND (
          d.operating_company_id = $2::uuid
          OR EXISTS (
            SELECT 1 FROM mdata.driver_company_authorizations acting_dca
            WHERE acting_dca.driver_id = d.id
              AND acting_dca.company_id = $2::uuid
              AND acting_dca.is_authorized = true
              AND acting_dca.deactivated_at IS NULL
          )
        )
      LIMIT 1
    `,
    [driverId, operatingCompanyId]
  );
  if (res.rows.length === 0) {
    throw new Error("driver_company_not_authorized");
  }
}

export async function markMessageRead(
  client: Queryable,
  messageId: string,
  operatingCompanyId: string,
  readerUserId: string
): Promise<DriverMessageRow | null> {
  const res = await client.query(
    `
      UPDATE mdata.driver_profile_messages m
      SET read_at = COALESCE(read_at, now()),
          read_by = COALESCE(read_by, $3::uuid)
      FROM mdata.drivers d
      WHERE (
          d.operating_company_id = $2::uuid
          OR EXISTS (
            SELECT 1 FROM mdata.driver_company_authorizations read_dca
            WHERE read_dca.driver_id = d.id
              AND read_dca.company_id = $2::uuid
              AND read_dca.is_authorized = true
              AND read_dca.deactivated_at IS NULL
          )
        )
        AND m.id = $1::uuid
        AND m.operating_company_id = $2::uuid
        AND m.driver_id = d.id
      RETURNING
        m.id::text,
        m.operating_company_id::text,
        m.driver_id::text,
        m.message,
        m.channel,
        m.urgency,
        m.created_by::text,
        m.created_at::text,
        m.read_at::text,
        m.read_by::text,
        m.delivery_status,
        m.delivery_ref,
        d.identity_user_id::text AS identity_user_id,
        concat_ws(' ', d.first_name, d.last_name) AS driver_name
    `,
    [messageId, operatingCompanyId, readerUserId]
  );
  const row = res.rows[0] as Record<string, unknown> | undefined;
  return row ? mapMessageRow(row) : null;
}

export async function insertDriverReply(
  client: Queryable,
  input: {
    operatingCompanyId: string;
    driverId: string;
    driverUserId: string;
    message: string;
  }
): Promise<DriverMessageRow> {
  const res = await client.query(
    `
      INSERT INTO mdata.driver_profile_messages (
        operating_company_id, driver_id, message, channel, created_by, delivery_status
      )
      VALUES ($1, $2, $3, 'in_app', $4, 'delivered')
      RETURNING id::text
    `,
    [input.operatingCompanyId, input.driverId, input.message, input.driverUserId]
  );
  const inserted = requireDriverMessageRow(res.rows as Array<{ id: string }>, "create");
  const id = inserted.id;
  const thread = await listDriverMessageThread(client, input.operatingCompanyId, input.driverId);
  return thread.find((m) => m.id === id) ?? mapMessageRow({ ...(res.rows[0] as Record<string, unknown>), message: input.message, channel: "in_app", delivery_status: "delivered", driver_id: input.driverId, operating_company_id: input.operatingCompanyId, created_by: input.driverUserId, created_at: new Date().toISOString(), read_at: null, read_by: null, delivery_ref: null, urgency: null, identity_user_id: input.driverUserId });
}

export async function deliverDriverProfileMessage(
  client: Queryable,
  input: {
    messageId: string;
    operatingCompanyId: string;
    driverId: string;
    channel: "sms" | "email" | "in_app";
    message: string;
    actorUserId: string | null;
  }
): Promise<{ delivery_status: string; delivery_ref: string | null }> {
  if (input.channel === "in_app") {
    await updateDriverMessageDeliveryStatus(client, { ...input, status: "delivered" });
    return { delivery_status: "delivered", delivery_ref: null };
  }

  const driverRes = await client.query<{ phone: string | null; email: string | null; identity_user_id: string | null }>(
    `SELECT phone, email, identity_user_id::text
     FROM mdata.drivers d
     WHERE d.id = $1
       AND (
         d.operating_company_id = $2::uuid
         OR EXISTS (
           SELECT 1 FROM mdata.driver_company_authorizations delivery_dca
           WHERE delivery_dca.driver_id = d.id
             AND delivery_dca.company_id = $2::uuid
             AND delivery_dca.is_authorized = true
             AND delivery_dca.deactivated_at IS NULL
         )
       )`,
    [input.driverId, input.operatingCompanyId]
  );
  const driver = driverRes.rows[0];
  if (!driver) {
    await updateDriverMessageDeliveryStatus(client, { ...input, status: "failed" });
    return { delivery_status: "failed", delivery_ref: null };
  }

  if (input.channel === "sms") {
    if (!driver.phone) {
      await updateDriverMessageDeliveryStatus(client, { ...input, status: "failed" });
      return { delivery_status: "failed", delivery_ref: null };
    }
    await enqueueOutboxEvent(
      client,
      "driver.profile_message.deliver",
      { aggregate_type: "mdata.driver_profile_messages", aggregate_id: input.messageId },
      {
        operating_company_id: input.operatingCompanyId,
        driver_id: input.driverId,
        channel: "sms",
        to: driver.phone,
        message: input.message,
        actor_user_id: input.actorUserId,
      },
      `driver-profile-message-delivery:${input.messageId}`
    );
    return { delivery_status: "pending", delivery_ref: null };
  }

  if (!driver.email) {
    await updateDriverMessageDeliveryStatus(client, { ...input, status: "failed" });
    return { delivery_status: "failed", delivery_ref: null };
  }

  await enqueueOutboxEvent(
    client,
    "driver.profile_message.deliver",
    { aggregate_type: "mdata.driver_profile_messages", aggregate_id: input.messageId },
    {
      operating_company_id: input.operatingCompanyId,
      driver_id: input.driverId,
      channel: "email",
      to: driver.email,
      message: input.message,
      recipient_user_id: driver.identity_user_id,
      actor_user_id: input.actorUserId,
    },
    `driver-profile-message-delivery:${input.messageId}`
  );
  return { delivery_status: "pending", delivery_ref: null };
}
