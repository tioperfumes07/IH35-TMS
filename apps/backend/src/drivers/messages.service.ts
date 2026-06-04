import { sendEmail } from "../notifications/email.service.js";
import { bridgeDriverSms } from "../notifications/sms-bridge.service.js";

type Queryable = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[]; rowCount?: number }>;
};

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
`;

export async function listDriverMessageThread(
  client: Queryable,
  operatingCompanyId: string,
  driverId: string
): Promise<DriverMessageRow[]> {
  const res = await client.query(
    `
      ${MESSAGE_SELECT}
      WHERE m.operating_company_id = $1
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
          AND m.operating_company_id = $1
        ORDER BY m.created_at DESC
        LIMIT 1
      ) lm ON true
      LEFT JOIN LATERAL (
        SELECT count(*)::int AS unread_count
        FROM mdata.driver_profile_messages m
        WHERE m.driver_id = d.id
          AND m.operating_company_id = $1
          AND m.read_at IS NULL
          AND m.created_by IS NOT NULL
          AND m.created_by = d.identity_user_id
      ) uc ON true
      WHERE d.operating_company_id = $1
        AND d.deactivated_at IS NULL
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
      WHERE m.operating_company_id = $1
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
      WHERE m.id = $1::uuid
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
  const id = (res.rows[0] as { id: string }).id;
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
    await client.query(
      `UPDATE mdata.driver_profile_messages SET delivery_status = 'delivered' WHERE id = $1`,
      [input.messageId]
    );
    return { delivery_status: "delivered", delivery_ref: null };
  }

  const driverRes = await client.query<{ phone: string | null; email: string | null; identity_user_id: string | null }>(
    `SELECT phone, email, identity_user_id::text FROM mdata.drivers WHERE id = $1 AND operating_company_id = $2`,
    [input.driverId, input.operatingCompanyId]
  );
  const driver = driverRes.rows[0];
  if (!driver) {
    await client.query(
      `UPDATE mdata.driver_profile_messages SET delivery_status = 'failed' WHERE id = $1`,
      [input.messageId]
    );
    return { delivery_status: "failed", delivery_ref: null };
  }

  if (input.channel === "sms") {
    if (!driver.phone) {
      await client.query(
        `UPDATE mdata.driver_profile_messages SET delivery_status = 'failed' WHERE id = $1`,
        [input.messageId]
      );
      return { delivery_status: "failed", delivery_ref: null };
    }
    const sms = await bridgeDriverSms({ to: driver.phone, body: input.message });
    const status = sms.success ? "sent" : sms.skipped ? "skipped" : "failed";
    await client.query(
      `UPDATE mdata.driver_profile_messages SET delivery_status = $2, delivery_ref = $3 WHERE id = $1`,
      [input.messageId, status, sms.sid ?? null]
    );
    return { delivery_status: status, delivery_ref: sms.sid ?? null };
  }

  if (!driver.email) {
    await client.query(
      `UPDATE mdata.driver_profile_messages SET delivery_status = 'failed' WHERE id = $1`,
      [input.messageId]
    );
    return { delivery_status: "failed", delivery_ref: null };
  }

  try {
    const emailResult = await sendEmail({
      to: driver.email,
      subject: "Message from IH35 Dispatch",
      html: `<p>${input.message.replace(/</g, "&lt;")}</p>`,
      text: input.message,
      sender: "dispatch",
      eventClass: "driver.profile.message",
      recipientUserUuid: driver.identity_user_id,
      actorUserId: input.actorUserId,
    });
    await client.query(
      `UPDATE mdata.driver_profile_messages SET delivery_status = 'sent', delivery_ref = $2 WHERE id = $1`,
      [input.messageId, emailResult.id]
    );
    return { delivery_status: "sent", delivery_ref: emailResult.id };
  } catch {
    await client.query(
      `UPDATE mdata.driver_profile_messages SET delivery_status = 'skipped' WHERE id = $1`,
      [input.messageId]
    );
    return { delivery_status: "skipped", delivery_ref: null };
  }
}
