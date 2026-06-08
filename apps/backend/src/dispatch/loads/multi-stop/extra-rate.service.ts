export type StopExtraRateType =
  | "extra_stop_fee"
  | "lumper"
  | "detention"
  | "fuel_surcharge"
  | "accessorial"
  | "other";

type Queryable = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }>;
};

export type AddStopExtraInput = {
  operating_company_id: string;
  load_uuid: string;
  stop_uuid: string;
  rate_type: StopExtraRateType;
  amount_cents: number;
  description?: string | null;
  created_by_user_uuid?: string | null;
};

export type SoftDeleteStopExtraInput = {
  operating_company_id: string;
  load_uuid: string;
  stop_uuid: string;
  rate_uuid: string;
};

export async function addStopExtra(client: Queryable, input: AddStopExtraInput) {
  const insertRes = await client.query(
    `
      INSERT INTO dispatch.stop_extra_rates (
        operating_company_id,
        stop_uuid,
        load_uuid,
        rate_type,
        amount_cents,
        description,
        created_by_user_uuid
      )
      SELECT
        $1, $2, $3, $4, $5, $6, $7
      WHERE EXISTS (
        SELECT 1
        FROM mdata.load_stops ls
        WHERE ls.id = $2::uuid
          AND ls.load_id = $3::uuid
      )
      RETURNING *
    `,
    [
      input.operating_company_id,
      input.stop_uuid,
      input.load_uuid,
      input.rate_type,
      Math.max(0, Math.trunc(input.amount_cents)),
      input.description ?? null,
      input.created_by_user_uuid ?? null,
    ]
  );
  return insertRes.rows[0] ?? null;
}

export async function listForLoad(client: Queryable, input: { operating_company_id: string; load_uuid: string }) {
  const res = await client.query(
    `
      SELECT
        ser.*,
        ls.sequence_number,
        ls.stop_type
      FROM dispatch.stop_extra_rates ser
      JOIN mdata.load_stops ls
        ON ls.id = ser.stop_uuid
      WHERE ser.operating_company_id = $1
        AND ser.load_uuid = $2
        AND ser.is_active = true
      ORDER BY ls.sequence_number ASC, ser.created_at ASC
    `,
    [input.operating_company_id, input.load_uuid]
  );
  return res.rows;
}

export async function totalForLoad(client: Queryable, input: { operating_company_id: string; load_uuid: string }) {
  const res = await client.query<{ total_cents: number }>(
    `
      SELECT COALESCE(SUM(amount_cents), 0)::int AS total_cents
      FROM dispatch.stop_extra_rates
      WHERE operating_company_id = $1
        AND load_uuid = $2
        AND is_active = true
    `,
    [input.operating_company_id, input.load_uuid]
  );
  return Number(res.rows[0]?.total_cents ?? 0);
}

export async function softDelete(client: Queryable, input: SoftDeleteStopExtraInput) {
  const res = await client.query(
    `
      UPDATE dispatch.stop_extra_rates
      SET is_active = false,
          updated_at = now()
      WHERE operating_company_id = $1
        AND load_uuid = $2
        AND stop_uuid = $3
        AND uuid = $4
        AND is_active = true
      RETURNING *
    `,
    [input.operating_company_id, input.load_uuid, input.stop_uuid, input.rate_uuid]
  );
  return res.rows[0] ?? null;
}
