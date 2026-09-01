import { appendCrudAudit } from "../audit/crud-audit.js";

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

type ReserveInput = {
  operatingCompanyId: string;
  reservedByUserId: string;
  reservationId?: string;
};

type ConsumeInput = {
  operatingCompanyId: string;
  reservationId: string;
  reservedByUserId: string;
  loadId: string;
};

export type ClaimInput = {
  operatingCompanyId: string;
  reservationId: string;
  reservedByUserId: string;
};

export const LOAD_ID_RESERVATION_TTL_SECONDS = 60;

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "23505";
}

/**
 * GO-10 REV-B — thrown when a company has never had a single numeric Load Number minted (neither
 * a real mdata.loads row nor a lib.trace_counters seed) and the allocator refuses to silently
 * invent a starting point. The office must set the first Load Number explicitly (the existing
 * manual-override path in book-load already supports a caller-supplied load_number); once ONE
 * real number exists for the company, every later allocation seeds naturally from it and this
 * error can never fire again for that company.
 */
export class FirstLoadNumberRequiredError extends Error {
  code = "first_load_number_required" as const;
  constructor() {
    super("first_load_number_required");
  }
}

/**
 * GO-10 REV-B — thrown when the atomic allocator's own number still collides at INSERT (23505).
 * With a real per-(company,day) counter this is no longer an expected transient race to retry
 * past (that was only ever needed because the old design derived the next number by re-reading
 * MAX(...) from rows that might not be visible yet) — a collision now means something bypassed
 * the allocator (a direct insert, an import, a stale reservation), which is worth surfacing to
 * the caller, not silently retrying past.
 */
export class LoadNumberConflictError extends Error {
  code = "duplicate_load_number" as const;
  loadNumber: string;
  existingId: string | null;
  constructor(loadNumber: string, existingId: string | null) {
    super("duplicate_load_number");
    this.loadNumber = loadNumber;
    this.existingId = existingId;
  }
}

/**
 * GO-10 REV-B (L3 lock) — THE single shared allocator for both dispatch's TTL reservation flow
 * (reserveNextLoadId, below) and mdata/loads.routes.ts's direct-create path. Previously each file
 * carried its own independent last-4-digits substring-regex parse of the trailing digit run, and
 * the two produced DIFFERENT string shapes (this file: `L-YYYYMMDD-NNNN`;
 * loads.routes.ts: `L<COMPANY-TOKEN>-YYYYMMDD-NNNN`) — the two paths' own MAX queries could never
 * see each other's rows. L3 kills BOTH formats: the mint is now PLAIN DIGITS ONLY (e.g. "13509"),
 * a flat company-wide ascending integer with no date component and no prefix, matching the
 * owner's existing external numbering scheme (he types "13508", the system continues "13509").
 *
 * SEED (once per company, lazily on first use): MAX(load_number::bigint) WHERE load_number ~
 * '^[0-9]+$' — a FULL-STRING numeric parse, never last-N-digits (a last-4-digits substring would
 * silently truncate "13561" to "3561"). If that numeric set is empty (company has never had a
 * single purely-numeric Load Number), refuse with FirstLoadNumberRequiredError rather than invent
 * a starting constant — the office must type the first number once
 * (assertLoadNumberAvailable + the caller-supplied load_number path already support this).
 *
 * ONGOING (every call after the seed exists): an atomic upsert-counter (lib.trace_counters,
 * doc_type = 'LOAD', reusing the exact mechanism GO-08 202613330000 built for trace_no/trace_key)
 * via lib.next_trace_no() — never a live re-read of MAX(...), which is the race that let two
 * concurrent bookings compute the same "next" number before either INSERT was visible to the
 * other.
 */
export async function allocateNextLoadNumber(client: DbClient, operatingCompanyId: string): Promise<string> {
  // Fast path: already seeded, just increment atomically. Doing this check first means the
  // one-time seed logic below only ever runs once per company, ever.
  const already = await client.query<{ exists: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM lib.trace_counters WHERE operating_company_id = $1::uuid AND doc_type = 'LOAD') AS exists`,
    [operatingCompanyId]
  );
  if (!already.rows[0]?.exists) {
    const seedRes = await client.query<{ seed: string | null }>(
      `
        SELECT MAX(load_number::bigint)::text AS seed
        FROM mdata.loads
        WHERE operating_company_id = $1::uuid
          AND load_number ~ '^[0-9]+$'
      `,
      [operatingCompanyId]
    );
    const seed = seedRes.rows[0]?.seed;
    if (seed == null) {
      throw new FirstLoadNumberRequiredError();
    }
    // ON CONFLICT DO NOTHING: a concurrent caller may have won the seed race between the EXISTS
    // check above and here — that is fine, whichever seed value lands first is the correct one
    // (both are derived from the same MAX at effectively the same instant).
    await client.query(
      `
        INSERT INTO lib.trace_counters (operating_company_id, doc_type, last_trace_no, updated_at)
        VALUES ($1::uuid, 'LOAD', $2::bigint, now())
        ON CONFLICT (operating_company_id, doc_type) DO NOTHING
      `,
      [operatingCompanyId, seed]
    );
  }

  const seqRes = await client.query<{ seq: string }>(`SELECT lib.next_trace_no($1::uuid, 'LOAD')::text AS seq`, [
    operatingCompanyId,
  ]);
  const seq = seqRes.rows[0]?.seq;
  if (!seq || !/^[0-9]+$/.test(seq)) {
    throw new Error("load_number_allocator_failed");
  }
  return seq;
}

export type ReserveNextLoadIdResult = {
  reservationId: string;
  loadNumber: string;
  reservedUntilIso: string;
  ttlSeconds: number;
};

export async function expireStaleLoadIdReservations(client: DbClient, operatingCompanyId: string) {
  await client.query(
    `
      UPDATE dispatch.load_id_reservations
      SET status = 'expired',
          updated_at = now()
      WHERE operating_company_id = $1::uuid
        AND status = 'reserved'
        AND expires_at <= now()
    `,
    [operatingCompanyId]
  );
}

export async function reserveNextLoadId(client: DbClient, input: ReserveInput): Promise<ReserveNextLoadIdResult> {
  if (input.reservationId) {
    const renewed = await client.query<{ id: string; reserved_load_number: string; expires_at: string }>(
      `
        UPDATE dispatch.load_id_reservations
        SET expires_at = now() + ($4 * interval '1 second'),
            updated_at = now()
        WHERE id = $1::uuid
          AND operating_company_id = $2::uuid
          AND reserved_by_user_id = $3::uuid
          AND status = 'reserved'
          AND expires_at > now() - ($4 * interval '1 second')
        RETURNING id::text, reserved_load_number, expires_at::text
      `,
      [input.reservationId, input.operatingCompanyId, input.reservedByUserId, LOAD_ID_RESERVATION_TTL_SECONDS]
    );
    const row = renewed.rows[0];
    if (row?.id && row.reserved_load_number && row.expires_at) {
      await appendCrudAudit(
        client,
        input.reservedByUserId,
        "dispatch.load.id_reservation_renewed",
        {
          operating_company_id: input.operatingCompanyId,
          reservation_uuid: row.id,
          load_number: row.reserved_load_number,
          ttl_seconds: LOAD_ID_RESERVATION_TTL_SECONDS,
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
  }
  await expireStaleLoadIdReservations(client, input.operatingCompanyId);

  const existing = await client.query<{ id: string; reserved_load_number: string; expires_at: string }>(
    `
      SELECT id, reserved_load_number, expires_at::text AS expires_at
      FROM dispatch.load_id_reservations
      WHERE operating_company_id = $1::uuid
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

  const loadNumber = await allocateNextLoadNumber(client, input.operatingCompanyId);

  // SAVEPOINT so a unique-collision rolls back only THIS INSERT, not the caller's whole transaction.
  await client.query(`SAVEPOINT reserve_load_id`);
  try {
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
    await client.query(`RELEASE SAVEPOINT reserve_load_id`);

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
  } catch (err) {
    await client.query(`ROLLBACK TO SAVEPOINT reserve_load_id`).catch(() => undefined);
    if (isUniqueViolation(err)) {
      // The allocator is atomic — a collision here means something else (a direct insert, an
      // import, a stale row) already used this exact number. Surface it structured, not a retry.
      const existingRow = await client.query<{ id: string }>(
        `SELECT id::text FROM dispatch.load_id_reservations WHERE operating_company_id = $1::uuid AND reserved_load_number = $2 LIMIT 1`,
        [input.operatingCompanyId, loadNumber]
      );
      throw new LoadNumberConflictError(loadNumber, existingRow.rows[0]?.id ?? null);
    }
    throw err;
  }
}

export async function assertLoadNumberAvailable(
  client: DbClient,
  operatingCompanyId: string,
  loadNumber: string,
  exceptReservationId?: string
): Promise<void> {
  const trimmed = loadNumber.trim();
  if (!trimmed) {
    throw Object.assign(new Error("load_number_required"), { code: "load_number_required" });
  }
  const existingLoad = await client.query(
    `SELECT 1 FROM mdata.loads WHERE operating_company_id = $1::uuid AND load_number = $2 LIMIT 1`,
    [operatingCompanyId, trimmed]
  );
  if (existingLoad.rows[0]) {
    throw Object.assign(new Error("duplicate_load_number"), { code: "duplicate_load_number", load_number: trimmed });
  }
  const reserved = await client.query(
    `
      SELECT 1
        FROM dispatch.load_id_reservations
       WHERE operating_company_id = $1::uuid
         AND reserved_load_number = $2
         AND status = 'reserved'
         AND expires_at > now()
         AND ($3::uuid IS NULL OR id <> $3::uuid)
       LIMIT 1
    `,
    [operatingCompanyId, trimmed, exceptReservationId ?? null]
  );
  if (reserved.rows[0]) {
    throw Object.assign(new Error("duplicate_load_number"), { code: "duplicate_load_number", load_number: trimmed });
  }
}

export async function claimReservation(client: DbClient, input: ClaimInput) {
  await expireStaleLoadIdReservations(client, input.operatingCompanyId);
  const claimed = await client.query<{ id: string; reserved_load_number: string; reserved_by_user_id: string }>(
    `
      SELECT id, reserved_load_number, reserved_by_user_id::text AS reserved_by_user_id
      FROM dispatch.load_id_reservations
      WHERE id = $1
        AND operating_company_id = $2::uuid
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
        AND operating_company_id = $2::uuid
        AND reserved_by_user_id = $3
        AND status = 'reserved'
      RETURNING id
    `,
    [input.reservationId, input.operatingCompanyId, input.reservedByUserId]
  );
  return Boolean(res.rows[0]?.id);
}

export async function consumeLoadNumberReservation(client: DbClient, input: ConsumeInput) {
  const consumed = await client.query<{ id: string }>(
    `
      UPDATE dispatch.load_id_reservations
      SET status = 'consumed',
          consumed_at = now(),
          consumed_load_id = $2,
          updated_at = now()
      WHERE id = $1
        AND operating_company_id = $3::uuid
        AND reserved_by_user_id = $4::uuid
        AND status = 'reserved'
      RETURNING id::text
    `,
    [input.reservationId, input.loadId, input.operatingCompanyId, input.reservedByUserId]
  );
  if (!consumed.rows[0]?.id) throw new Error("load_id_reservation_consume_conflict");
}

// Backwards-compatible export used in existing code.
export const reserveNextLoadNumber = reserveNextLoadId;
