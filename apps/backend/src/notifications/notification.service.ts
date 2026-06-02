import { withLuciaBypass } from "../auth/db.js";

export type NotificationType =
  | "compliance_expiring"
  | "compliance_expired"
  | "maintenance_alert"
  | "load_status"
  | "driver_alert"
  | "system"
  | "message";

export type NotificationSeverity = "info" | "low" | "medium" | "high" | "critical";

export type CreateNotificationInput = {
  operating_company_id: string;
  user_id: string;
  type: NotificationType;
  severity: NotificationSeverity;
  title: string;
  body?: string | null;
  action_link?: string | null;
  entity_type?: string | null;
  entity_id?: string | null;
  source_block?: string | null;
};

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

export async function createNotification(
  input: CreateNotificationInput,
  client?: DbClient
): Promise<{ id: string } | null> {
  const run = async (c: DbClient) => {
    await c.query(`SELECT set_config('app.operating_company_id', $1, true)`, [input.operating_company_id]);
    const res = await c.query<{ id: string }>(
      `
        INSERT INTO notifications.user_notifications (
          operating_company_id, user_id, type, severity, title, body,
          action_link, entity_type, entity_id, source_block
        ) VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8, $9::uuid, $10)
        RETURNING id::text
      `,
      [
        input.operating_company_id,
        input.user_id,
        input.type,
        input.severity,
        input.title,
        input.body ?? null,
        input.action_link ?? null,
        input.entity_type ?? null,
        input.entity_id ?? null,
        input.source_block ?? null,
      ]
    );
    return res.rows[0] ?? null;
  };

  if (client) return run(client);
  return withLuciaBypass(async (c) => run(c));
}

export async function listCompanyNotifyUserIds(
  client: DbClient,
  operatingCompanyId: string,
  roles: string[] = ["Owner", "Administrator", "Manager"]
): Promise<string[]> {
  const res = await client.query<{ id: string }>(
    `
      SELECT DISTINCT u.id::text
      FROM identity.users u
      LEFT JOIN org.user_company_access uca ON uca.user_id = u.id
      WHERE u.deactivated_at IS NULL
        AND u.role = ANY($2::text[])
        AND (
          u.default_company_id = $1::uuid
          OR uca.company_id = $1::uuid
        )
    `,
    [operatingCompanyId, roles]
  );
  return res.rows.map((row) => row.id);
}
