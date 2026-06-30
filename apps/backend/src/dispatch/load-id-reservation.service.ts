import { appendCrudAudit } from "../audit/crud-audit.js";
import { companyBusinessDateCompact } from "../lib/company-business-date.js";

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

export type ClaimInput = {
  operatingCompanyId: string;
  reservationId: string;
  reservedByUserId: string;
};

export const LOAD_ID_RESERVATION_TTL_SECONDS = 60;

export type ReserveNextLoadIdResult = {
  reservationId: string;
  loadNumber: string;
  reservedUntilIso: string;
  ttlSeconds: number;
};

function makeLoadNumber(seq: number, date = new Date()) {
  // Business date in the company timezone — NOT UTC. A load booked at 7 PM Central must carry the
  // Central calendar date, or the persisted Load Number reads as tomorrow. (see company-business-date)
  const ymd = companyBusinessDateCompact(date);
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

export async function reserveNextLoadId(client: DbClient, input: ReserveInput): Promise<ReserveNextLoadIdResult> {
  await expireStaleLoadIdReservations(client, input.operatingCompanyId);

  const now = new Date();
  const prefix = `L-${companyBusinessDateCompact(now)}-%`;

  const existing = await client.query<{ id: string; reserved_load_number: string; expires_at: string }>(
    `
      SELECT id, reserved_load_number, expires_at::text AS expires_at
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
    const row = existing.rows[0];
    await appendCrudAudit(
      client,
      input.reservedByUserId,
      "dispatch.load.id_reservation_created",
      {
        operating_company_id: input.operatingCompanyId,
        reservation_uuid: row.id,
        load_number: row.reserved_load_number,
        reused_existing: true,
      },
      "info",
      "P6-D2"
    );
    return {
      reservationId: row.id,
      loadNumber: row.reserved_load_number,
      reservedUntilIso: new Date(row.expires_at).toISOString(),
      ttlSeconds: LOAD_ID_RESERVATION_TTL_SECONDS,
    };
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
        AND (reserved_at AT TIME ZONE 'America/Chicago')::date = (now() AT TIME ZONE 'America/Chicago')::date
    `,
    [input.operatingCompanyId, prefix]
  );

  const seq = Math.max(Number(nextLoadSeq.rows[0]?.next_seq ?? 1), Number(nextReservedSeq.rows[0]?.next_seq ?? 1));
  const loadNumber = makeLoadNumber(seq, now);

  const insert = await client.query<{ id: string; expires_at: string }>(
    `
      INSERT INTO dispatch.load_id_reservations (
        operating_company_id, reserved_load_number, reserved_by_user_id, status, reserved_at, expires_at
      )
      VALUES ($1, $2, $3, 'reserved', now(), now() + ($4 * interval '1 second'))
      RETURNING id, expires_at::text AS expires_at
    `,
    [input.operatingCompanyId, loadNumber, input.reservedByUserId, LOAD_ID_RESERVATION_TTL_SECONDS]
  );
  const exp = insert.rows[0]?.expires_at;
  const resId = insert.rows[0]?.id;
  if (!exp || !resId) {
    throw new Error("load_id_reservation_insert_failed");
  }

  await appendCrudAudit(
    client,
    input.reservedByUserId,
    "dispatch.load.id_reservation_created",
    {
      operating_company_id: input.operatingCompanyId,
      reservation_uuid: resId,
      load_number: loadNumber,
      reused_existing: false,
      ttl_seconds: LOAD_ID_RESERVATION_TTL_SECONDS,
    },
    "info",
    "P6-D2"
  );

  return {
    reservationId: resId,
    loadNumber,
    reservedUntilIso: new Date(exp).toISOString(),
    ttlSeconds: LOAD_ID_RESERVATION_TTL_SECONDS,
  };
}

export async function claimReservation(client: DbClient, input: ClaimInput) {
  await expireStaleLoadIdReservations(client, input.operatingCompanyId);
  const claimed = await client.query<{ id: string; reserved_load_number: string; reserved_by_user_id: string }>(
    `
      SELECT id, reserved_load_number, reserved_by_user_id::text AS reserved_by_user_id
      FROM dispatch.load_id_reservations
      WHERE id = $1
        AND operating_company_id = $2
        AND reserved_by_user_id = $3
        AND status = 'reserved'
        AND expires_at > now()
      FOR UPDATE
      LIMIT 1
    `,
    [input.reservationId, input.operatingCompanyId, input.reservedByUserId]
  );
  if (claimed.rows[0]) {
    await appendCrudAudit(
      client,
      input.reservedByUserId,
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

export async function cancelLoadIdReservation(client: DbClient, input: ClaimInput) {
  const res = await client.query<{ id: string }>(
    `
      UPDATE dispatch.load_id_reservations
      SET status = 'cancelled',
          updated_at = now()
      WHERE id = $1
        AND operating_company_id = $2
        AND reserved_by_user_id = $3
        AND status = 'reserved'
      RETURNING id
    `,
    [input.reservationId, input.operatingCompanyId, input.reservedByUserId]
  );
  return Boolean(res.rows[0]?.id);
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
