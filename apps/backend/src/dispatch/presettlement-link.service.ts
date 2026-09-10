// GO-22 pre-settlement (owner direct instruction 2026-09-02), superseded by SET-01 (owner ruling
// 2026-09-03/09-04, settled): "The instant a load is CREATED it joins a pre-settlement. Not at
// delivery. Not at invoice. At creation. Assignment is automatic. Closing is human-confirmed."
// suggestPresettlementLink still only ever SUGGESTS (writes a suggestion row, resolution logic
// unchanged: NB with none open starts one; TR and SB legs join the open one for that tour_id) —
// confirmPresettlementLink is the one place that actually writes driver_finance.driver_settlements
// / mdata.loads.presettlement_link_id. It is NO LONGER human-only: linkLoadToPresettlementAtBooking
// below calls both, unconditionally, from inside book-load.service.ts's own booking transaction,
// so a load can never exist without already being linked. A human can still separately reject/
// re-link via listPendingPresettlementSuggestions + confirmPresettlementLink directly (unchanged),
// but that path is no longer the ONLY writer.
import { randomUUID } from "node:crypto";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { allocateSettlementDisplayId } from "../driver-finance/settlement-display-id.js";
import { reopenSettlementForContinuationInClientTx } from "../driver-finance/settlement-continuation.service.js";

export type DbClient = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[]; rowCount?: number }>;
};

export class PresettlementLinkError extends Error {
  constructor(
    readonly code: string,
    message?: string
  ) {
    super(message ?? code);
    this.name = "PresettlementLinkError";
  }
}

export type TripType = "NB" | "TR" | "SB" | "LOCAL";

/** Compatibility entry point: settlement identity never consumes the load counter. */
export async function allocateNextSettlementDisplayId(client: DbClient, operatingCompanyId: string, periodDate = new Date().toISOString().slice(0, 10)): Promise<string> {
  return allocateSettlementDisplayId(client, operatingCompanyId, periodDate);
}

type SuggestInput = {
  operating_company_id: string;
  load_id: string;
  driver_id: string;
  unit_id?: string | null;
  trip_type: TripType;
  tour_id?: string | null;
  actor_user_id: string;
};

type SuggestResult = {
  suggestion_id: string;
  suggested_settlement_id: string | null;
  suggested_reason: string;
};

/** REG-040: inherit the latest unit/driver tour, including a closed tour's continuation. */
export async function findOpenPresettlementTourForUnit(
  client: DbClient,
  input: { operating_company_id: string; driver_id: string; unit_id: string },
): Promise<string | null> {
  // Held through booking and confirmation. Select the latest candidate first; suggestion
  // resolution splits a fresh NB from an occupied open tour without falling back to an older closed one.
  await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [
    `presettlement-unit:${input.operating_company_id}:${input.unit_id}`,
  ]);
  const result = await client.query<{ tour_id: string }>(`
    SELECT s.tour_id::text
    FROM driver_finance.driver_settlements s
    WHERE s.operating_company_id = $1::uuid AND s.driver_id = $2::uuid
      AND s.tour_id IS NOT NULL
      AND s.voided_at IS NULL AND s.status IN ('open', 'closed', 'locked', 'approved', 'paid', 'final')
      AND EXISTS (
        SELECT 1 FROM mdata.loads l
        WHERE l.operating_company_id = s.operating_company_id
          AND l.assigned_unit_id = $3::uuid AND l.tour_id = s.tour_id
          AND (l.presettlement_link_id = s.id OR l.id = s.first_load_id)
          AND l.soft_deleted_at IS NULL AND l.status::text <> 'cancelled'
      )
    ORDER BY s.created_at DESC, s.id
    LIMIT 1
  `, [input.operating_company_id, input.driver_id, input.unit_id]);
  return result.rows[0]?.tour_id ?? null;
}

/**
 * The query service the TODO names. Called at book time (replaces the old
 * dispatch.load.presettlement_link_deferred log) — writes ONE suggestion row, never touches
 * mdata.loads.presettlement_link_id or driver_finance.driver_settlements directly.
 *
 * NB — start a new tour if the candidate open settlement already has an NB. Closed
 *      candidates retain the REG-040 audited continuation path.
 * TR/SB — look up an OPEN driver_settlements row (trip_closed_at IS NULL, voided_at IS NULL) for
 *      this driver with the SAME tour_id. Found -> suggest linking to it. Not found (e.g. the TR/SB
 *      leg was booked before its NB, or the NB's settlement was never confirmed yet) -> suggest
 *      NULL with a reason flagging manual attach is needed; this is not an error, it is an honest
 *      "nothing to recommend yet."
 */
export async function suggestPresettlementLink(client: DbClient, input: SuggestInput): Promise<SuggestResult> {
  // All entry points (including manual suggestions) serialize unit before tour. A fresh NB
  // cannot inherit a historical continuation marker from an already reopened settlement.
  if (input.unit_id) await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [
    `presettlement-unit:${input.operating_company_id}:${input.unit_id}`,
  ]);
  if (input.tour_id) await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [
    `presettlement-tour:${input.operating_company_id}:${input.driver_id}:${input.tour_id}`,
  ]);
  let suggestionTourId = input.tour_id ?? null;
  let suggestedSettlementId: string | null = null;
  let reason: string;

  if (input.trip_type === "NB" && !input.tour_id) {
    suggestionTourId = randomUUID();
    suggestedSettlementId = null;
    reason = "NB leg starts a new tour — recommend opening a new pre-settlement for this driver.";
  } else {
    if (!input.tour_id) {
      suggestedSettlementId = null;
      reason = `${input.trip_type} leg has no tour_id captured — cannot match it to an open pre-settlement automatically; needs manual attach.`;
    } else {
      const openRes = await client.query<{ id: string; display_id: string | null; is_continuation: boolean; is_closed: boolean; has_other_nb: boolean }>(
        `
          SELECT id, display_id,
                 (trip_closed_at IS NOT NULL OR status <> 'open' OR EXISTS (
                   SELECT 1 FROM driver_finance.presettlement_link_suggestions prior
                   WHERE prior.operating_company_id = driver_settlements.operating_company_id
                     AND prior.assigned_settlement_id = driver_settlements.id AND prior.status = 'confirmed'
                     AND prior.suggested_reason LIKE 'REG-040 resettlement continuation%'
                 )) AS is_continuation,
                 (trip_closed_at IS NOT NULL OR status <> 'open') AS is_closed,
                 EXISTS (SELECT 1 FROM mdata.loads nb
                   WHERE nb.operating_company_id = driver_settlements.operating_company_id
                     AND (nb.presettlement_link_id = driver_settlements.id OR nb.id = driver_settlements.first_load_id)
                     AND nb.id <> $5::uuid AND nb.trip_type = 'NB'
                     AND nb.soft_deleted_at IS NULL AND nb.status::text <> 'cancelled') AS has_other_nb
            FROM driver_finance.driver_settlements
           WHERE operating_company_id = $1::uuid
             AND driver_id = $2::uuid
             AND tour_id = $3::uuid
             AND voided_at IS NULL
             AND status IN ('open', 'closed', 'locked', 'approved', 'paid', 'final')
             AND ($4::uuid IS NULL OR EXISTS (
               SELECT 1 FROM mdata.loads l
               WHERE l.operating_company_id = driver_settlements.operating_company_id
                 AND l.tour_id = driver_settlements.tour_id
                 AND l.assigned_unit_id = $4::uuid
                 AND (l.presettlement_link_id = driver_settlements.id OR l.id = driver_settlements.first_load_id)
                 AND l.soft_deleted_at IS NULL AND l.status::text <> 'cancelled'
             ))
           ORDER BY created_at DESC
           LIMIT 1
        `,
        [input.operating_company_id, input.driver_id, input.tour_id, input.unit_id ?? null, input.load_id]
      );
      const open = openRes.rows[0];
      if (open && input.trip_type === "NB" && !open.is_closed && open.has_other_nb) {
        suggestionTourId = randomUUID();
        reason = "NB leg starts a new tour — the open pre-settlement already has an NB leg.";
      } else if (open) {
        suggestedSettlementId = open.id;
        reason = open.is_continuation
          ? `REG-040 resettlement continuation: ${input.trip_type} leg retains settlement ${open.display_id ?? open.id}.`
          : `${input.trip_type} leg joins the open pre-settlement ${open.display_id ?? open.id} already started for this tour.`;
      } else {
        suggestedSettlementId = null;
        reason = `${input.trip_type} leg's tour has no open pre-settlement for this driver yet (no NB confirmed, or it already closed) — needs manual attach or a new pre-settlement.`;
      }
    }
  }

  // One pending suggestion per load — refresh rather than duplicate on re-suggest (e.g. a save
  // retried, or the wizard re-submitted after an edit).
  const existing = await client.query<{ id: string }>(
    `SELECT id FROM driver_finance.presettlement_link_suggestions WHERE operating_company_id = $1::uuid AND load_id = $2::uuid AND status = 'pending'`,
    [input.operating_company_id, input.load_id]
  );
  let suggestionId: string;
  if (existing.rows[0]?.id) {
    await client.query(
      `
        UPDATE driver_finance.presettlement_link_suggestions
           SET driver_id = $1::uuid, unit_id = $2::uuid, trip_type = $3, tour_id = $4::uuid,
               suggested_settlement_id = $5::uuid, suggested_reason = $6, updated_at = now()
         WHERE id = $7::uuid
      `,
      [input.driver_id, input.unit_id ?? null, input.trip_type, suggestionTourId, suggestedSettlementId, reason, existing.rows[0].id]
    );
    suggestionId = existing.rows[0].id;
  } else {
    const insertRes = await client.query<{ id: string }>(
      `
        INSERT INTO driver_finance.presettlement_link_suggestions (
          operating_company_id, load_id, driver_id, unit_id, trip_type, tour_id,
          suggested_settlement_id, suggested_reason
        )
        VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, $6::uuid, $7::uuid, $8)
        RETURNING id
      `,
      [
        input.operating_company_id,
        input.load_id,
        input.driver_id,
        input.unit_id ?? null,
        input.trip_type,
        suggestionTourId,
        suggestedSettlementId,
        reason,
      ]
    );
    suggestionId = insertRes.rows[0]!.id;
  }

  await appendCrudAudit(
    client,
    input.actor_user_id,
    "driver_finance.presettlement_link.suggested",
    { suggestion_id: suggestionId, load_id: input.load_id, suggested_settlement_id: suggestedSettlementId, original_tour_id: input.tour_id ?? null, tour_id: suggestionTourId, reason },
    "info",
    "GO-22"
  );

  return { suggestion_id: suggestionId, suggested_settlement_id: suggestedSettlementId, suggested_reason: reason };
}

type ConfirmInput = {
  operating_company_id: string;
  suggestion_id: string;
  action: "create_new" | "link_existing" | "reject";
  actor_user_id: string;
  // required when action === "link_existing" AND the suggestion itself had no suggested_settlement_id
  // (a dispatcher manually picking a different/older open settlement than what was suggested).
  override_settlement_id?: string | null;
};

/**
 * The only place that actually links a load to a pre-settlement — writes
 * driver_finance.driver_settlements and mdata.loads.presettlement_link_id. Called both by
 * linkLoadToPresettlementAtBooking (below, automatic, at book time) and directly by a human
 * resolving a pending suggestion (e.g. the TR/SB "no open pre-settlement found" case).
 */
export async function confirmPresettlementLink(client: DbClient, input: ConfirmInput) {
  // Match booking's load-before-suggestion lock order. Suggestions are editable snapshots;
  // the current load decides NB separation and driver/unit eligibility at confirmation.
  const loadRes = await client.query<{ id: string; trip_type: TripType | null; driver_id: string | null; unit_id: string | null }>(`
    SELECT l.id::text, l.trip_type, l.assigned_primary_driver_id::text AS driver_id,
           l.assigned_unit_id::text AS unit_id
    FROM mdata.loads l
    JOIN driver_finance.presettlement_link_suggestions p
      ON p.load_id = l.id AND p.operating_company_id = l.operating_company_id
    WHERE p.id = $1::uuid AND p.operating_company_id = $2::uuid
      AND l.soft_deleted_at IS NULL
    FOR UPDATE OF l`, [input.suggestion_id, input.operating_company_id]);
  const res = await client.query<{
    id: string;
    load_id: string;
    driver_id: string;
    tour_id: string | null;
    suggested_settlement_id: string | null;
    status: string;
    unit_id: string | null;
    trip_type: TripType;
  }>(
    `
      SELECT id, load_id::text, driver_id::text, tour_id::text, suggested_settlement_id::text, status, unit_id::text, trip_type
        FROM driver_finance.presettlement_link_suggestions
       WHERE id = $1::uuid AND operating_company_id = $2::uuid
       FOR UPDATE
    `,
    [input.suggestion_id, input.operating_company_id]
  );
  const suggestion = res.rows[0];
  if (!suggestion) throw new PresettlementLinkError("suggestion_not_found");
  if (suggestion.status !== "pending") {
    throw new PresettlementLinkError("suggestion_already_resolved", `This suggestion is already ${suggestion.status}.`);
  }

  if (input.action === "reject") {
    await client.query(
      `UPDATE driver_finance.presettlement_link_suggestions SET status = 'rejected', assigned_at = now(), assigned_by_user_id = $1::uuid, updated_at = now() WHERE id = $2::uuid`,
      [input.actor_user_id, input.suggestion_id]
    );
    await appendCrudAudit(client, input.actor_user_id, "driver_finance.presettlement_link.rejected", { suggestion_id: input.suggestion_id }, "info", "GO-22");
    return { suggestion_id: input.suggestion_id, status: "rejected" as const, settlement_id: null };
  }

  const currentLoad = loadRes.rows[0];
  if (!currentLoad || currentLoad.id !== suggestion.load_id || !currentLoad.trip_type ||
      currentLoad.driver_id !== suggestion.driver_id) {
    throw new PresettlementLinkError("suggestion_load_changed", "The load assignment changed. Refresh its settlement suggestion.");
  }
  suggestion.trip_type = currentLoad.trip_type;
  suggestion.unit_id = currentLoad.unit_id;
  await client.query(`UPDATE driver_finance.presettlement_link_suggestions
    SET trip_type = $1, unit_id = $2::uuid, updated_at = now()
    WHERE id = $3::uuid AND operating_company_id = $4::uuid`,
  [suggestion.trip_type, suggestion.unit_id, input.suggestion_id, input.operating_company_id]);

  let settlementId: string;
  if (input.action === "create_new") {
    // A manual create_new can confirm an old suggestion carrying an occupied tour. Give every
    // new NB settlement its own identity; never create two settlements on that old tour.
    if (suggestion.trip_type === "NB") {
      suggestion.tour_id = randomUUID();
      await client.query(`UPDATE driver_finance.presettlement_link_suggestions
        SET tour_id = $1::uuid, updated_at = now()
        WHERE id = $2::uuid AND operating_company_id = $3::uuid`,
      [suggestion.tour_id, input.suggestion_id, input.operating_company_id]);
    }
    // GAP-PRESETTLEMENT-PERIOD-NULL (found live 2026-09-05, seeding the settlement feed): this
    // branch never set period_start/period_end (both NOT NULL, no default on
    // driver_finance.driver_settlements) — every "create_new" confirmation crashed with a NOT
    // NULL violation. Its sibling writer, driver-finance/settlements-load-bookended.service.ts's
    // openLoadBookendedSettlement, has always derived both from the load's own trip-start date
    // (period_start = period_end = trip start; period_end is extended later, at each subsequent
    // load's docs-received event) — this mirrors that exact pattern rather than inventing a new
    // one. First pickup stop's scheduled_arrival_at is the load's own trip start (matches
    // openLoadBookendedSettlement's `pickupAt`); mdata.loads.created_at is the same `?? new
    // Date().toISOString()`-shaped fallback for a load with no stops yet.
    // verify-settlement-sample-tag-wired (Gate-B): is_sample_data must be DERIVED off the parent
    // load, never a literal — the exact class LV-SAMPLE-TAG-DISPATCH-HOLE shipped as, per that
    // guard's own message. Fetched in the same round trip as trip-start.
    const loadContext = await client.query<{ trip_started_at: string; is_sample_data: boolean }>(
      `
        SELECT
          COALESCE(
            (SELECT ls.scheduled_arrival_at FROM mdata.load_stops ls
              WHERE ls.load_id = $1::uuid AND ls.stop_type = 'pickup' AND ls.soft_deleted_at IS NULL
              ORDER BY ls.sequence_number ASC LIMIT 1),
            (SELECT l.created_at FROM mdata.loads l WHERE l.id = $1::uuid),
            now()
          )::text AS trip_started_at,
          COALESCE((SELECT l.is_sample_data FROM mdata.loads l WHERE l.id = $1::uuid), false) AS is_sample_data
      `,
      [suggestion.load_id]
    );
    const periodDate = String(loadContext.rows[0]!.trip_started_at).slice(0, 10);
    const isSampleData = Boolean(loadContext.rows[0]!.is_sample_data);
    // REG-010/011: the booking path shares the canonical settlement allocator.
    const displayId = await allocateNextSettlementDisplayId(client, input.operating_company_id, periodDate);
    const insertRes = await client.query<{ id: string }>(
      `
        INSERT INTO driver_finance.driver_settlements (
          operating_company_id, driver_id, status, display_id, tour_id, first_load_id,
          period_start, period_end, trip_started_at, created_by_user_id, is_sample_data,
          -- LDT-5 (2026-09-06): a booking-time pre-settlement IS the load-bookended model. Without this the
          -- Pre-Settlement tab (settlement_model = 'load_bookended' filter) and trip close (same check) never
          -- saw these rows — 15/15 open USMCA settlements were NULL. Backfill: 202613800100.
          settlement_model
        )
        VALUES ($1::uuid, $2::uuid, 'open', $3, $4::uuid, $5::uuid, $6::date, $6::date, now(), $7::uuid, $8, 'load_bookended')
        RETURNING id
      `,
      [input.operating_company_id, suggestion.driver_id, displayId, suggestion.tour_id, suggestion.load_id, periodDate, input.actor_user_id, isSampleData]
    );
    settlementId = insertRes.rows[0]!.id;
  } else {
    // link_existing
    const targetId = input.override_settlement_id ?? suggestion.suggested_settlement_id;
    if (!targetId) {
      throw new PresettlementLinkError(
        "no_target_settlement",
        "link_existing requires either the suggested_settlement_id or an explicit override_settlement_id."
      );
    }
    const targetRes = await client.query<{ id: string; status?: string; trip_closed_at?: string | null; tour_id?: string | null }>(
      `SELECT id, status, trip_closed_at::text, tour_id::text FROM driver_finance.driver_settlements
       WHERE id = $1::uuid AND operating_company_id = $2::uuid
         AND driver_id = $3::uuid AND ($6::boolean OR tour_id IS NOT DISTINCT FROM $4::uuid)
         AND voided_at IS NULL AND status IN ('open', 'closed', 'locked', 'approved', 'paid', 'final')
         AND ($5::uuid IS NULL OR EXISTS (SELECT 1 FROM mdata.loads l
           WHERE l.operating_company_id = driver_settlements.operating_company_id
             AND l.tour_id = driver_settlements.tour_id AND l.assigned_unit_id = $5::uuid
             AND (l.presettlement_link_id = driver_settlements.id OR l.id = driver_settlements.first_load_id)
             AND l.soft_deleted_at IS NULL AND l.status::text <> 'cancelled')) FOR UPDATE`,
      [targetId, input.operating_company_id, suggestion.driver_id, suggestion.tour_id, suggestion.unit_id ?? null, Boolean(input.override_settlement_id)]
    );
    if (!targetRes.rows[0]) {
      throw new PresettlementLinkError("target_settlement_not_open", "The target pre-settlement is not open (already closed, voided, or does not exist).");
    }
    settlementId = targetId;
    const target = targetRes.rows[0];
    // The row lock above makes this authoritative even for stale/manual suggestions and
    // concurrent confirmations. Closed REG-040 continuation still takes its audited path.
    if (suggestion.trip_type === "NB" && target.status === "open" && !target.trip_closed_at) {
      const occupied = await client.query<{ has_other_nb: boolean }>(`SELECT EXISTS (
        SELECT 1 FROM mdata.loads nb
        WHERE nb.operating_company_id = $1::uuid
          AND (nb.presettlement_link_id = $2::uuid OR nb.id = (SELECT first_load_id
            FROM driver_finance.driver_settlements WHERE id = $2::uuid AND operating_company_id = $1::uuid))
          AND nb.id <> $3::uuid AND nb.trip_type = 'NB'
          AND nb.soft_deleted_at IS NULL AND nb.status::text <> 'cancelled'
      ) AS has_other_nb`, [input.operating_company_id, targetId, suggestion.load_id]);
      if (occupied.rows[0]?.has_other_nb) throw new PresettlementLinkError(
        "open_settlement_already_has_nb", "This open settlement already has an NB leg. Start a new tour.");
    }
    if (input.override_settlement_id && target.tour_id !== undefined) {
      suggestion.tour_id = target.tour_id;
      await client.query(`UPDATE mdata.loads SET tour_id = $1::uuid, updated_at = now()
        WHERE id = $2::uuid AND operating_company_id = $3::uuid`, [target.tour_id, suggestion.load_id, input.operating_company_id]);
      await client.query(`UPDATE driver_finance.presettlement_link_suggestions SET tour_id = $1::uuid, updated_at = now()
        WHERE id = $2::uuid AND operating_company_id = $3::uuid`, [target.tour_id, input.suggestion_id, input.operating_company_id]);
    }
    if (target.trip_closed_at || (target.status && target.status !== "open")) {
      await reopenSettlementForContinuationInClientTx(client, {
        operatingCompanyId: input.operating_company_id, settlementId,
        loadId: suggestion.load_id, actorUserId: input.actor_user_id,
      });
      // The target may have closed between suggest and confirm. Persist the classification in
      // the existing relation, so every read model recognizes continuation after status reopens.
      await client.query(`UPDATE driver_finance.presettlement_link_suggestions
        SET suggested_reason = $1, updated_at = now()
        WHERE id = $2::uuid AND operating_company_id = $3::uuid`, [
        "REG-040 resettlement continuation: same settlement after audited reversal", input.suggestion_id, input.operating_company_id,
      ]);
    }
    await client.query(
      `UPDATE driver_finance.driver_settlements SET last_load_id = $1::uuid, updated_at = now() WHERE id = $2::uuid`,
      [suggestion.load_id, settlementId]
    );
  }

  await client.query(`UPDATE mdata.loads SET presettlement_link_id = $1::uuid, tour_id = $3::uuid, updated_at = now()
    WHERE id = $2::uuid AND operating_company_id = $4::uuid`, [
    settlementId,
    suggestion.load_id,
    suggestion.tour_id,
    input.operating_company_id,
  ]);

  await client.query(
    `
      UPDATE driver_finance.presettlement_link_suggestions
         SET status = 'confirmed', assigned_settlement_id = $1::uuid, assigned_at = now(),
             assigned_by_user_id = $2::uuid, updated_at = now()
       WHERE id = $3::uuid
    `,
    [settlementId, input.actor_user_id, input.suggestion_id]
  );

  await appendCrudAudit(
    client,
    input.actor_user_id,
    "driver_finance.presettlement_link.confirmed",
    { suggestion_id: input.suggestion_id, load_id: suggestion.load_id, settlement_id: settlementId, tour_id: suggestion.tour_id, action: input.action },
    "info",
    "GO-22"
  );

  return { suggestion_id: input.suggestion_id, status: "confirmed" as const, settlement_id: settlementId };
}

export async function listPendingPresettlementSuggestions(client: DbClient, operatingCompanyId: string) {
  const res = await client.query(
    `
      SELECT s.*, l.load_number, d.first_name, d.last_name,
             ds.display_id AS suggested_settlement_display_id
        FROM driver_finance.presettlement_link_suggestions s
        JOIN mdata.loads l ON l.id = s.load_id
        LEFT JOIN mdata.drivers d ON d.id = s.driver_id
        LEFT JOIN driver_finance.driver_settlements ds ON ds.id = s.suggested_settlement_id
       WHERE s.operating_company_id = $1::uuid AND s.status = 'pending'
       ORDER BY s.created_at DESC
    `,
    [operatingCompanyId]
  );
  return res.rows;
}

export type LinkAtBookingInput = {
  operating_company_id: string;
  load_id: string;
  driver_id: string;
  unit_id?: string | null;
  trip_type: TripType;
  tour_id?: string | null;
  actor_user_id: string;
};

export type LinkAtBookingResult = {
  suggestion_id: string;
  settlement_id: string;
  action: "create_new" | "link_existing";
};

/**
 * SET-01 (owner ruling 2026-09-03/09-04, settled): "The instant a load is CREATED it joins a
 * pre-settlement. Not at delivery. Not at invoice. At creation. Assignment is automatic. Closing
 * is human-confirmed." Extracted from book-load.service.ts's inline call so the exact production
 * code path is independently testable against a real Postgres (not a mock) without booking a real
 * load through the app.
 *
 * Calls suggestPresettlementLink first (fresh NB splits occupied open tours; return legs
 * join their tour and closed REG-040 continuation retains its identity) then confirmPresettlementLink immediately
 * after, in the SAME caller transaction -- the caller (book-load.service.ts) wraps both in its own
 * booking transaction, so a load can never exist without already being linked. This function does
 * not open or commit a transaction itself; that is the caller's responsibility, matching every
 * other *InClientTx helper in this codebase (e.g. reverseDriverAdvanceInClientTx).
 */
export async function linkLoadToPresettlementAtBookingInClientTx(
  client: DbClient,
  input: LinkAtBookingInput
): Promise<LinkAtBookingResult> {
  const suggestion = await suggestPresettlementLink(client, {
    operating_company_id: input.operating_company_id,
    load_id: input.load_id,
    driver_id: input.driver_id,
    unit_id: input.unit_id ?? null,
    trip_type: input.trip_type,
    tour_id: input.tour_id ?? null,
    actor_user_id: input.actor_user_id,
  });
  const action: "create_new" | "link_existing" = suggestion.suggested_settlement_id ? "link_existing" : "create_new";
  const confirmed = await confirmPresettlementLink(client, {
    operating_company_id: input.operating_company_id,
    suggestion_id: suggestion.suggestion_id,
    action,
    actor_user_id: input.actor_user_id,
  });
  if (confirmed.status !== "confirmed" || !confirmed.settlement_id) {
    // confirmPresettlementLink only returns non-confirmed for action="reject", which this
    // function never passes -- an assertion, not a real runtime branch, kept so a future edit
    // to confirmPresettlementLink's contract fails loud here instead of returning a bad shape.
    throw new PresettlementLinkError(
      "link_at_booking_did_not_confirm",
      "confirmPresettlementLink did not return a confirmed settlement_id"
    );
  }
  return { suggestion_id: suggestion.suggestion_id, settlement_id: confirmed.settlement_id, action };
}

export type LinkAfterAssignmentInput = {
  operating_company_id: string;
  load_id: string;
  /** The load's presettlement_link_id as it stood BEFORE this driver-assignment write, read from
   *  the same row-locked SELECT the caller already does. This is the idempotency gate: a load
   *  that is already linked (from booking, or from an earlier assignment) is never re-linked here
   *  -- driver reassignment on an already-open tour is a separate concern (vehicle-swap /
   *  settlement-lines), not this function's job. */
  presettlement_link_id_before: string | null;
  driver_id: string;
  unit_id?: string | null;
  trip_type: TripType | null;
  tour_id?: string | null;
  actor_user_id: string;
};

/**
 * REG-008 (SET-01 auto-link gap, 2026-09-09/10): book-load.service.ts links a load to a
 * pre-settlement at booking time, but ONLY when a driver + trip_type are already present at that
 * instant. The normal dispatcher workflow books first and assigns a driver later -- quick-assign,
 * the planner reschedule/assign, and manual reassignment all write
 * mdata.loads.assigned_primary_driver_id AFTER booking, and none of them ever called the linker,
 * so those loads never joined a pre-settlement at all (owner-verified live: loads 13581, 13580,
 * 13508).
 *
 * This is the shared "first time both conditions become true" gate for every POST-booking
 * driver-assignment write path, so the SET-01 resolution logic (suggestPresettlementLink ->
 * confirmPresettlementLink, same NB-opens/TR-SB-joins rule) is called from exactly one place for
 * all of them, not reimplemented three times. Returns:
 *   - `null` with no audit when the load is already linked (idempotent no-op: reassigning the
 *     driver on an already-open tour is not this function's job).
 *   - `null` with a "deferred" audit (mirrors book-load.service.ts's own booking-time branch)
 *     when trip_type still isn't known -- never guesses NB/TR/SB.
 *   - the real link result when both are now present for the first time.
 *
 * Caller contract: run inside the SAME transaction as the assigned_primary_driver_id UPDATE,
 * using the trip_type/tour_id/unit_id/presettlement_link_id read from the SAME row-locked SELECT
 * that transaction already does (this function does not re-read or re-lock the row itself).
 */
export async function linkLoadToPresettlementAfterAssignmentInClientTx(
  client: DbClient,
  input: LinkAfterAssignmentInput
): Promise<LinkAtBookingResult | null> {
  if (input.presettlement_link_id_before) return null;

  if (!input.trip_type) {
    await appendCrudAudit(
      client,
      input.actor_user_id,
      "dispatch.load.presettlement_link_deferred",
      {
        load_uuid: input.load_id,
        requested: true,
        reason: "driver assigned post-booking but trip_type not yet captured — cannot suggest a pre-settlement match",
      },
      "info",
      "REG-008"
    );
    return null;
  }

  let tourId = input.tour_id ?? null;
  if (input.unit_id && (input.trip_type === "NB" || !tourId)) {
    const existingTour = tourId ? await client.query<{ id: string }>(`
      SELECT id FROM driver_finance.driver_settlements
      WHERE operating_company_id = $1::uuid AND driver_id = $2::uuid
        AND tour_id = $3::uuid AND voided_at IS NULL
        AND status IN ('open', 'closed', 'locked', 'approved', 'paid', 'final')
        AND EXISTS (SELECT 1 FROM mdata.loads l
          WHERE l.operating_company_id = driver_settlements.operating_company_id
            AND l.tour_id = driver_settlements.tour_id AND l.assigned_unit_id = $4::uuid
            AND (l.presettlement_link_id = driver_settlements.id OR l.id = driver_settlements.first_load_id)
            AND l.soft_deleted_at IS NULL AND l.status::text <> 'cancelled') LIMIT 1
    `, [input.operating_company_id, input.driver_id, tourId, input.unit_id]) : { rows: [] };
    if (!existingTour.rows.length) {
      const inheritedTour = await findOpenPresettlementTourForUnit(client, {
        operating_company_id: input.operating_company_id, driver_id: input.driver_id, unit_id: input.unit_id,
      });
      if (inheritedTour) {
        tourId = inheritedTour;
        await client.query(`UPDATE mdata.loads SET tour_id = $1::uuid, updated_at = now()
          WHERE id = $2::uuid AND operating_company_id = $3::uuid AND presettlement_link_id IS NULL`,
        [tourId, input.load_id, input.operating_company_id]);
      }
    }
  }

  return linkLoadToPresettlementAtBookingInClientTx(client, {
    operating_company_id: input.operating_company_id,
    load_id: input.load_id,
    driver_id: input.driver_id,
    unit_id: input.unit_id ?? null,
    trip_type: input.trip_type,
    tour_id: tourId,
    actor_user_id: input.actor_user_id,
  });
}
