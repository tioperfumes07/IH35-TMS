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
    // P1 2026-09-14 (LOAD-NUMBER-COUNTER-POISONED) — this MAX() scan is now a SAFETY-NET fallback
    // only. The primary seed path is seedLoadNumberCounterFromManualEntry() below, called the
    // moment the office's own first manually-typed numeric load number is actually saved — that
    // seed can never be wrong because it IS the office's own typed value, not a guess reconstructed
    // from whatever rows happen to exist later. This fallback exists only for a caller that reaches
    // allocateNextLoadNumber before that hook ever ran (a direct import, a bypass of book-load, or
    // a pre-existing company from before this fix). Live-caught 2026-09-13/14: with no status
    // filter, this MAX() picked up a status='cancelled' test-proof booking 154 numbers above the
    // real working max (13749 vs 13595), which then poisoned every load number minted after it.
    // Excluding cancelled loads is a real, evidenced improvement (both ghost incidents found this
    // session were status='cancelled'), not a complete guarantee — a genuinely real cancelled load
    // could still legitimately be a company's true max in some future case. That residual risk is
    // why this whole branch is now the FALLBACK, not the primary path.
    const seedRes = await client.query<{ seed: string | null }>(
      `
        SELECT MAX(load_number::bigint)::text AS seed
        FROM mdata.loads
        WHERE operating_company_id = $1::uuid
          AND load_number ~ '^[0-9]+$'
          AND status <> 'cancelled'
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

  // P0 2026-09-14 (LOAD-NUMBER-COUNTER-BURN-ON-OPEN, item 3) — lib.next_trace_no() is a BLIND
  // atomic increment with zero collision awareness against mdata.loads. Live-evidenced 2026-09-14:
  // USMCA has two cancelled ghost test bookings (load_number 13743, 13749) that occupy real rows
  // under the plain (non-partial) UNIQUE(operating_company_id, load_number) constraint — cancelling
  // a load does NOT free its number. The P1 register correction that same day rolled the counter
  // BACKWARD below those two numbers (13762 -> 13596, the real working max), which is correct for
  // TODAY but means ordinary future counting will walk the sequence back UP through 13743 and 13749
  // and mint them again -- and the INSERT will then fail on a real unique-violation in front of a
  // real dispatcher. A pure "allocate atomically once, at save" design (the owner's own instinct,
  // and what item 3's counter correction assumes) is not itself sufficient without this check; it
  // is what makes it safe going forward without redesigning into a full MAX()+collision-check
  // allocator (option c) for every call. Bounded retry: skip any number lib.next_trace_no() returns
  // that a live row already holds, advancing the counter each time (never rewinding), capped so a
  // real bug elsewhere (e.g. a stuck counter) fails loudly instead of looping forever.
  const MAX_COLLISION_SKIPS = 1000;
  for (let attempt = 0; attempt < MAX_COLLISION_SKIPS; attempt++) {
    const seqRes = await client.query<{ seq: string }>(`SELECT lib.next_trace_no($1::uuid, 'LOAD')::text AS seq`, [
      operatingCompanyId,
    ]);
    const seq = seqRes.rows[0]?.seq;
    if (!seq || !/^[0-9]+$/.test(seq)) {
      throw new Error("load_number_allocator_failed");
    }
    const taken = await client.query<{ exists: boolean }>(
      `SELECT EXISTS (SELECT 1 FROM mdata.loads WHERE operating_company_id = $1::uuid AND load_number = $2) AS exists`,
      [operatingCompanyId, seq]
    );
    if (!taken.rows[0]?.exists) {
      return seq;
    }
    // A real, already-existing row (e.g. a cancelled ghost) holds this number -- next_trace_no()
    // already advanced the counter past it permanently (irreversible by design, same as any other
    // burned number); loop to the next one rather than returning a value doomed to 23505 at INSERT.
  }
  throw new Error("load_number_allocator_exhausted_collision_retries");
}

/**
 * P0 2026-09-14 (LOAD-NUMBER-COUNTER-BURN-ON-OPEN) — a PURE READ, zero side effects, zero writes.
 * Never calls lib.next_trace_no() (that's the irreversible increment) and never seeds
 * lib.trace_counters if it doesn't exist yet -- this function only ever SELECTs.
 *
 * ROOT CAUSE this exists to fix: allocateNextLoadNumber() above is correct and remains the ONLY
 * real allocator, but every prior caller of it from the wizard's own open-on-mount flow
 * (LiveLoadIdBar -> reserveDispatchLoadId -> reserveNextLoadId -> allocateNextLoadNumber) spent a
 * real, permanent number the instant the wizard was opened -- whether or not a load was ever
 * created. Live-proven 2026-09-14: last_trace_no 13611 -> open the wizard -> close without saving
 * -> 13612, one number burned, zero rows created. Ninety minutes of ordinary opening-and-abandoning
 * burned 16 numbers this same day.
 *
 * FIX: the wizard now calls THIS function on open (via GET .../loads/next-number-peek) to display
 * a live-computed PREVIEW only. No reservation row, no counter increment, nothing written. The
 * REAL allocation still happens exactly once, atomically, via allocateNextLoadNumber -- but now
 * only at the moment book-load.service.ts's own createLoad() actually inserts the row (the
 * `if (!loadNumber) { reserveNextLoadId(...) }` fallback already there, previously unreachable in
 * practice because the frontend always pre-empted it with a proactive mount-time reservation). A
 * number is spent when a load is created, not when a screen opens.
 *
 * Two dispatchers can see the same preview momentarily if both open the wizard at once -- this is
 * NOT a real collision: whichever one actually submits first gets that number for real (via the
 * existing atomic sequence), and the second dispatcher's stale preview simply never matches what
 * they end up submitting with (the number in the response after a successful save is always the
 * real one, shown to them then). No number is ever double-issued because nothing is issued by
 * peeking -- only allocateNextLoadNumber issues, and it remains atomic.
 */
export async function peekNextLoadNumber(client: DbClient, operatingCompanyId: string): Promise<string> {
  const { rows } = await client.query<{ last_trace_no: string | null }>(
    `SELECT last_trace_no::text FROM lib.trace_counters WHERE operating_company_id = $1::uuid AND doc_type = 'LOAD'`,
    [operatingCompanyId]
  );
  if (!rows[0]?.last_trace_no) {
    // No counter seeded yet -- same UX as allocateNextLoadNumber's own first-ever-mint case: the
    // office must type the first number. Do NOT fall back to a MAX() scan here either; peeking
    // must never invent a number the real allocator wouldn't also produce.
    throw new FirstLoadNumberRequiredError();
  }
  const next = BigInt(rows[0].last_trace_no) + 1n;
  return next.toString();
}

/**
 * P1 2026-09-14 (LOAD-NUMBER-COUNTER-POISONED) — call this right after a MANUALLY-TYPED, purely
 * numeric load number is actually saved (book-load.service.ts, right after the INSERT's own
 * SAVEPOINT releases — inside the same transaction, so a rolled-back booking never seeds a
 * counter for a load that was never really created). If the company has no lib.trace_counters
 * row yet, seed it with THIS exact office-typed number — never a MAX() scan reconstructed later
 * from whatever rows happen to exist by then. That reconstruction is exactly what let a
 * status='cancelled' test booking win the seed 154 numbers above the true working max in the
 * incident this fix closes. Idempotent (ON CONFLICT DO NOTHING) — a no-op on every booking after
 * the company's first, which is the normal, expected case.
 */
export async function seedLoadNumberCounterFromManualEntry(
  client: DbClient,
  operatingCompanyId: string,
  loadNumber: string
): Promise<void> {
  if (!/^[0-9]+$/.test(loadNumber)) return; // only the flat numeric scheme has a counter to seed
  await client.query(
    `
      INSERT INTO lib.trace_counters (operating_company_id, doc_type, last_trace_no, updated_at)
      VALUES ($1::uuid, 'LOAD', $2::bigint, now())
      ON CONFLICT (operating_company_id, doc_type) DO NOTHING
    `,
    [operatingCompanyId, loadNumber]
  );
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
