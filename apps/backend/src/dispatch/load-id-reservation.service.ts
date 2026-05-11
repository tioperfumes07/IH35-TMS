import { appendCrudAudit } from "../audit/crud-audit.js";

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

type ClaimInput = {
  operatingCompanyId: string;
  reservationId: string;
};

function makeLoadNumber(seq: number, date = new Date()) {
  const ymd = date.toISOString().slice(0, 10).replace(/-/g, "");
  return `L-${ymd}-${String(seq).padStart(4, "0")}`;
}

export async function expireStaleLoadIdReservations(client: DbClient, operatingCompanyId: string) {
  await client.query(
    `
      UPDATE dispatch.load_id_reservations
      SET status = 'expired',
          updated_at = now()
      WHERE operating_company_id = $1
        AND status = 'reserved'
        AND expires_at <= now()
    `,
    [operatingCompanyId]
  );
}

export async function reserveNextLoadId(client: DbClient, input: ReserveInput) {
  await expireStaleLoadIdReservations(client, input.operatingCompanyId);

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
    await appendCrudAudit(
      client,
      input.reservedByUserId,
      "dispatch.load.id_reservation_created",
      {
        operating_company_id: input.operatingCompanyId,
        reservation_uuid: existing.rows[0].id,
        load_number: existing.rows[0].reserved_load_number,
        reused_existing: true,
      },
      "info",
      "P6-D2"
    );
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
  await appendCrudAudit(
    client,
    input.reservedByUserId,
    "dispatch.load.id_reservation_created",
    {
      operating_company_id: input.operatingCompanyId,
      reservation_uuid: insert.rows[0].id,
      load_number: loadNumber,
      reused_existing: false,
    },
    "info",
    "P6-D2"
  );

  return { reservationId: insert.rows[0].id, loadNumber };
}

export async function claimReservation(client: DbClient, input: ClaimInput) {
  await expireStaleLoadIdReservations(client, input.operatingCompanyId);
  const claimed = await client.query<{ id: string; reserved_load_number: string; reserved_by_user_id: string }>(
    `
      SELECT id, reserved_load_number, reserved_by_user_id::text
      FROM dispatch.load_id_reservations
      WHERE id = $1
        AND operating_company_id = $2
        AND status = 'reserved'
        AND expires_at > now()
      LIMIT 1
    `,
    [input.reservationId, input.operatingCompanyId]
  );
  if (claimed.rows[0]) {
    await appendCrudAudit(
      client,
      claimed.rows[0].reserved_by_user_id,
      "dispatch.load.id_reservation_claimed",
      {
        operating_company_id: input.operatingCompanyId,
        reservation_uuid: claimed.rows[0].id,
        load_number: claimed.rows[0].reserved_load_number,
      },
      "info",
      "P6-D2"
    );
  }
  return claimed.rows[0] ?? null;
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

// Backwards-compatible export used in existing code.
export const reserveNextLoadNumber = reserveNextLoadId;
