type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

type ReserveInput = {
  operatingCompanyId: string;
  reservedByUserId: string;
};

type ConsumeInput = {
  reservationId: string;
  loadId: string;
};

function makeLoadNumber(seq: number, date = new Date()) {
  const ymd = date.toISOString().slice(0, 10).replace(/-/g, "");
  return `L-${ymd}-${String(seq).padStart(4, "0")}`;
}

export async function reserveNextLoadNumber(client: DbClient, input: ReserveInput) {
  const now = new Date();
  const prefix = `L-${now.toISOString().slice(0, 10).replace(/-/g, "")}-%`;

  const existing = await client.query<{ id: string; reserved_load_number: string }>(
    `
      SELECT id, reserved_load_number
      FROM dispatch.load_id_reservations
      WHERE operating_company_id = $1
        AND reserved_by_user_id = $2
        AND status = 'reserved'
        AND expires_at > now()
      ORDER BY reserved_at DESC
      LIMIT 1
    `,
    [input.operatingCompanyId, input.reservedByUserId]
  );
  if (existing.rows[0]?.reserved_load_number) {
    return { reservationId: existing.rows[0].id, loadNumber: existing.rows[0].reserved_load_number };
  }

  const nextLoadSeq = await client.query<{ next_seq: number }>(
    `
      SELECT COALESCE(MAX(COALESCE(NULLIF(substring(load_number FROM '([0-9]{4})$'), ''), '0')::int), 0) + 1 AS next_seq
      FROM mdata.loads
      WHERE operating_company_id = $1
        AND load_number LIKE $2
    `,
    [input.operatingCompanyId, prefix]
  );

  const nextReservedSeq = await client.query<{ next_seq: number }>(
    `
      SELECT COALESCE(MAX(COALESCE(NULLIF(substring(reserved_load_number FROM '([0-9]{4})$'), ''), '0')::int), 0) + 1 AS next_seq
      FROM dispatch.load_id_reservations
      WHERE operating_company_id = $1
        AND reserved_load_number LIKE $2
        AND reserved_at::date = current_date
    `,
    [input.operatingCompanyId, prefix]
  );

  const seq = Math.max(Number(nextLoadSeq.rows[0]?.next_seq ?? 1), Number(nextReservedSeq.rows[0]?.next_seq ?? 1));
  const loadNumber = makeLoadNumber(seq, now);

  const insert = await client.query<{ id: string }>(
    `
      INSERT INTO dispatch.load_id_reservations (
        operating_company_id, reserved_load_number, reserved_by_user_id, status, reserved_at, expires_at
      )
      VALUES ($1, $2, $3, 'reserved', now(), now() + interval '15 minutes')
      RETURNING id
    `,
    [input.operatingCompanyId, loadNumber, input.reservedByUserId]
  );

  return { reservationId: insert.rows[0].id, loadNumber };
}

export async function consumeLoadNumberReservation(client: DbClient, input: ConsumeInput) {
  await client.query(
    `
      UPDATE dispatch.load_id_reservations
      SET status = 'consumed',
          consumed_at = now(),
          consumed_load_id = $2,
          updated_at = now()
      WHERE id = $1
        AND status = 'reserved'
    `,
    [input.reservationId, input.loadId]
  );
}
