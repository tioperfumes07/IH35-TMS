type Queryable = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[]; rowCount?: number }>;
};

export type DriverCommEntry = {
  id: string;
  operating_company_id: string;
  driver_id: string;
  message: string;
  channel: "sms" | "email" | "in_app";
  direction: "inbound" | "outbound";
  urgency: string | null;
  created_by: string | null;
  created_at: string;
  delivery_status: string;
  delivery_ref: string | null;
};

const COMM_SELECT = `
  SELECT
    m.id::text,
    m.operating_company_id::text,
    m.driver_id::text,
    m.message,
    m.channel,
    m.urgency,
    m.created_by::text,
    m.created_at::text,
    m.delivery_status,
    m.delivery_ref,
    d.identity_user_id::text AS identity_user_id
  FROM mdata.driver_profile_messages m
  JOIN mdata.drivers d ON d.id = m.driver_id
`;

function mapEntry(row: Record<string, unknown>): DriverCommEntry {
  const identityUserId = row.identity_user_id as string | null | undefined;
  const createdBy = row.created_by as string | null;
  const direction: "inbound" | "outbound" =
    identityUserId && createdBy && createdBy === identityUserId ? "inbound" : "outbound";
  return {
    id: String(row.id),
    operating_company_id: String(row.operating_company_id),
    driver_id: String(row.driver_id),
    message: String(row.message),
    channel: row.channel as DriverCommEntry["channel"],
    direction,
    urgency: (row.urgency as string | null) ?? null,
    created_by: createdBy,
    created_at: String(row.created_at),
    delivery_status: String(row.delivery_status ?? "pending"),
    delivery_ref: (row.delivery_ref as string | null) ?? null,
  };
}

export async function listDriverCommunications(
  client: Queryable,
  opts: {
    operatingCompanyId: string;
    driverId: string;
    channel?: string;
    limit: number;
    offset: number;
  }
): Promise<{ entries: DriverCommEntry[]; total: number }> {
  const conditions: string[] = [
    "m.operating_company_id = $1",
    "m.driver_id = $2",
  ];
  const values: unknown[] = [opts.operatingCompanyId, opts.driverId];

  if (opts.channel) {
    values.push(opts.channel);
    conditions.push(`m.channel = $${values.length}`);
  }

  const where = conditions.join(" AND ");

  const countRes = await client.query<{ total: string }>(
    `SELECT count(*)::text AS total
     FROM mdata.driver_profile_messages m
     WHERE ${where}`,
    values
  );
  const total = parseInt(countRes.rows[0]?.total ?? "0", 10);

  const pageValues = [...values, opts.limit, opts.offset];
  const dataRes = await client.query(
    `${COMM_SELECT}
     WHERE ${where}
     ORDER BY m.created_at DESC
     LIMIT $${pageValues.length - 1} OFFSET $${pageValues.length}`,
    pageValues
  );

  return {
    entries: dataRes.rows.map((row) => mapEntry(row as Record<string, unknown>)),
    total,
  };
}
