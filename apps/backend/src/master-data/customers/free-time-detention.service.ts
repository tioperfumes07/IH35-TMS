type Queryable = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }>;
};

export type CustomerFreeTimeDetentionTerms = {
  customer_uuid: string;
  operating_company_id: string;
  free_time_minutes: number;
  detention_rate_per_hour: string;
  detention_currency: string;
  detention_requires_approval: boolean;
  terms_updated_at: string | null;
  terms_updated_by_user_uuid: string | null;
  free_time_pickup_minutes: number;
  free_time_delivery_minutes: number;
};

export type CustomerTermsHistoryRow = {
  uuid: string;
  customer_uuid: string;
  operating_company_id: string;
  tenant_id: string;
  free_time_minutes: number;
  detention_rate_per_hour: string;
  detention_currency: string;
  detention_requires_approval: boolean;
  terms_updated_at: string;
  terms_updated_by_user_uuid: string | null;
  recorded_at: string;
};

export async function assertCustomerScope(
  client: Queryable,
  customerUuid: string,
  operatingCompanyId: string
): Promise<string | null> {
  const res = await client.query<{ id: string }>(
    `
      SELECT id::text
      FROM mdata.customers
      WHERE id = $1::uuid
        AND operating_company_id = $2::uuid
      LIMIT 1
    `,
    [customerUuid, operatingCompanyId]
  );
  return res.rows[0]?.id ?? null;
}

export async function getTerms(
  client: Queryable,
  customerUuid: string,
  operatingCompanyId: string
): Promise<CustomerFreeTimeDetentionTerms | null> {
  const res = await client.query<CustomerFreeTimeDetentionTerms>(
    `
      SELECT
        id::text AS customer_uuid,
        operating_company_id::text AS operating_company_id,
        free_time_minutes,
        detention_rate_per_hour::text,
        detention_currency,
        detention_requires_approval,
        terms_updated_at::text,
        terms_updated_by_user_uuid::text,
        free_time_pickup_minutes,
        free_time_delivery_minutes
      FROM mdata.customers
      WHERE id = $1::uuid
        AND operating_company_id = $2::uuid
      LIMIT 1
    `,
    [customerUuid, operatingCompanyId]
  );
  return res.rows[0] ?? null;
}

export async function updateTerms(
  client: Queryable,
  customerUuid: string,
  operatingCompanyId: string,
  actorUserUuid: string,
  patch: Partial<{
    free_time_minutes: number;
    detention_rate_per_hour: number;
    detention_currency: string;
    detention_requires_approval: boolean;
  }>
): Promise<CustomerFreeTimeDetentionTerms | null> {
  const current = await getTerms(client, customerUuid, operatingCompanyId);
  if (!current) return null;

  await client.query(
    `
      INSERT INTO master_data.customer_terms_history (
        customer_uuid,
        operating_company_id,
        tenant_id,
        free_time_minutes,
        detention_rate_per_hour,
        detention_currency,
        detention_requires_approval,
        terms_updated_at,
        terms_updated_by_user_uuid
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, now(), $8)
    `,
    [
      customerUuid,
      operatingCompanyId,
      operatingCompanyId,
      current.free_time_minutes,
      current.detention_rate_per_hour,
      current.detention_currency,
      current.detention_requires_approval,
      actorUserUuid,
    ]
  );

  const setParts: string[] = [];
  const values: unknown[] = [];
  const add = (column: string, value: unknown) => {
    values.push(value);
    setParts.push(`${column} = $${values.length}`);
  };

  if ("free_time_minutes" in patch) add("free_time_minutes", patch.free_time_minutes);
  if ("detention_rate_per_hour" in patch) add("detention_rate_per_hour", patch.detention_rate_per_hour);
  if ("detention_currency" in patch) add("detention_currency", patch.detention_currency);
  if ("detention_requires_approval" in patch) add("detention_requires_approval", patch.detention_requires_approval);
  add("terms_updated_at", new Date().toISOString());
  add("terms_updated_by_user_uuid", actorUserUuid);
  add("updated_by_user_id", actorUserUuid);
  values.push(customerUuid, operatingCompanyId);

  const updated = await client.query<CustomerFreeTimeDetentionTerms>(
    `
      UPDATE mdata.customers
      SET ${setParts.join(", ")}
      WHERE id = $${values.length - 1}::uuid
        AND operating_company_id = $${values.length}::uuid
      RETURNING
        id::text AS customer_uuid,
        operating_company_id::text AS operating_company_id,
        free_time_minutes,
        detention_rate_per_hour::text,
        detention_currency,
        detention_requires_approval,
        terms_updated_at::text,
        terms_updated_by_user_uuid::text,
        free_time_pickup_minutes,
        free_time_delivery_minutes
    `,
    values
  );
  return updated.rows[0] ?? null;
}

export async function listTermsHistory(
  client: Queryable,
  customerUuid: string,
  operatingCompanyId: string,
  limit = 50
): Promise<CustomerTermsHistoryRow[]> {
  const res = await client.query<CustomerTermsHistoryRow>(
    `
      SELECT
        uuid::text,
        customer_uuid::text,
        operating_company_id::text,
        tenant_id::text,
        free_time_minutes,
        detention_rate_per_hour::text,
        detention_currency,
        detention_requires_approval,
        terms_updated_at::text,
        terms_updated_by_user_uuid::text,
        recorded_at::text
      FROM master_data.customer_terms_history
      WHERE customer_uuid = $1::uuid
        AND operating_company_id = $2::uuid
      ORDER BY recorded_at DESC
      LIMIT $3
    `,
    [customerUuid, operatingCompanyId, limit]
  );
  return res.rows;
}
