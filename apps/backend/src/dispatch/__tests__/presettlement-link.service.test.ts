import { describe, expect, it, vi } from "vitest";

import {
  PresettlementLinkError,
  allocateNextSettlementDisplayId,
  findOpenPresettlementTourForUnit,
  confirmPresettlementLink,
  linkLoadToPresettlementAfterAssignmentInClientTx,
  linkLoadToPresettlementAtBookingInClientTx,
  suggestPresettlementLink,
} from "../presettlement-link.service.js";

const OPCO = "5c854333-6ea5-4faa-af31-67cb272fef80";
const LOAD_ID = "11111111-1111-1111-1111-111111111111";
const DRIVER_ID = "22222222-2222-2222-2222-222222222222";
const TOUR_ID = "33333333-3333-3333-3333-333333333333";
const OPEN_SETTLEMENT_ID = "44444444-4444-4444-4444-444444444444";
const SUGGESTION_ID = "55555555-5555-5555-5555-555555555555";
const USER_ID = "66666666-6666-6666-6666-666666666666";
const { reopen } = vi.hoisted(() => ({ reopen: vi.fn().mockResolvedValue(true) }));
vi.mock("../../driver-finance/settlement-continuation.service.js", () => ({ reopenSettlementForContinuationInClientTx: reopen }));

function makeClient(overrides: { openSettlement?: { id: string; display_id: string } | null; suggestionStatus?: string; targetClosed?: boolean; closedContinuation?: boolean; suggestionTour?: string | null; hasOtherNb?: boolean; historicalContinuation?: boolean; suggestionTripType?: "NB" | "TR" | "SB"; currentTripType?: "NB" | "TR" | "SB"; currentDriver?: string } = {}) {
  const calls: { sql: string; values: unknown[] }[] = [];
  let pending: unknown[] | undefined;
  const client = {
    query: vi.fn(async (sql: string, values: unknown[] = []) => {
      calls.push({ sql, values });
      if (sql.includes("SELECT l.id::text, l.trip_type, l.assigned_primary_driver_id")) return { rows: [{
        id: LOAD_ID, trip_type: overrides.currentTripType ?? pending?.[4] ?? overrides.suggestionTripType ?? "TR",
        driver_id: overrides.currentDriver ?? DRIVER_ID, unit_id: pending?.[3] ?? null,
      }] };
      if (/SELECT audit\.append_event/.test(sql)) return { rows: [] };
      if (/SELECT id, display_id[\s\S]*FROM driver_finance\.driver_settlements/.test(sql)) {
        return { rows: overrides.openSettlement ? [{ ...overrides.openSettlement, is_continuation: overrides.closedContinuation || overrides.historicalContinuation || false, is_closed: overrides.closedContinuation ?? false, has_other_nb: overrides.hasOtherNb ?? false }] : [] };
      }
      if (/SELECT id FROM driver_finance\.presettlement_link_suggestions WHERE/.test(sql)) return { rows: [] };
      if (/INSERT INTO driver_finance\.presettlement_link_suggestions/.test(sql)) { pending = values; return { rows: [{ id: SUGGESTION_ID }] }; }
      if (/UPDATE driver_finance\.presettlement_link_suggestions/.test(sql)) return { rows: [] };
      if (/SELECT id, load_id::text, driver_id::text, tour_id::text, suggested_settlement_id::text, status/.test(sql)) {
        return {
          rows: [
            {
              id: SUGGESTION_ID,
              load_id: LOAD_ID,
              driver_id: DRIVER_ID,
              tour_id: pending ? pending[5] : overrides.suggestionTour === undefined ? TOUR_ID : overrides.suggestionTour,
              trip_type: pending ? pending[4] : overrides.suggestionTripType ?? "TR",
              suggested_settlement_id: pending ? pending[6] : overrides.openSettlement?.id ?? null,
              status: overrides.suggestionStatus ?? "pending",
            },
          ],
        };
      }
      if (/COALESCE\(\s*\(SELECT ls\.scheduled_arrival_at/.test(sql)) return { rows: [{ trip_started_at: "2026-07-03T08:00:00.000Z", is_sample_data: false }] };
      if (/SELECT EXISTS \(SELECT 1 FROM lib\.trace_counters/.test(sql)) return { rows: [{ exists: true }] };
      if (sql.includes("next_settlement_display_id")) return { rows: [{ next_id: "S-2026-0042" }] };
      if (/SELECT lib\.next_trace_no/.test(sql)) return { rows: [{ seq: "1" }] };
      if (/INSERT INTO driver_finance\.driver_settlements/.test(sql)) return { rows: [{ id: "new-settlement-id" }] };
      if (/SELECT id, status, trip_closed_at::text, tour_id::text FROM driver_finance\.driver_settlements\s+WHERE id = \$1::uuid/.test(sql)) return { rows: overrides.targetClosed ? [] : [{ id: OPEN_SETTLEMENT_ID, tour_id: TOUR_ID, status: overrides.closedContinuation ? "closed" : "open", trip_closed_at: overrides.closedContinuation ? "2026-09-10" : null }] };
      if (sql.includes(") AS has_other_nb")) return { rows: [{ has_other_nb: overrides.hasOtherNb ?? false }] };
      if (/UPDATE driver_finance\.driver_settlements/.test(sql)) return { rows: [] };
      if (/UPDATE mdata\.loads SET presettlement_link_id/.test(sql)) return { rows: [] };
      return { rows: [] };
    }),
  };
  return { client, calls };
}

describe("presettlement link — GO-22", () => {
  it("NB without an existing tour suggests creating a new pre-settlement", async () => {
    const { client } = makeClient();
    const result = await suggestPresettlementLink(client as never, {
      operating_company_id: OPCO,
      load_id: LOAD_ID,
      driver_id: DRIVER_ID,
      trip_type: "NB",
      actor_user_id: USER_ID,
    });
    expect(result.suggested_settlement_id).toBeNull();
    expect(result.suggested_reason).toMatch(/new tour/);
  });

  it("TR/SB with a matching open settlement for the tour suggests linking to it", async () => {
    const { client } = makeClient({ openSettlement: { id: OPEN_SETTLEMENT_ID, display_id: "S-1" } });
    const result = await suggestPresettlementLink(client as never, {
      operating_company_id: OPCO,
      load_id: LOAD_ID,
      driver_id: DRIVER_ID,
      trip_type: "TR",
      tour_id: TOUR_ID,
      actor_user_id: USER_ID,
    });
    expect(result.suggested_settlement_id).toBe(OPEN_SETTLEMENT_ID);
    expect(result.suggested_reason).toMatch(/joins the open pre-settlement/);
  });

  it("TR/SB with no open settlement for the tour honestly suggests nothing, not an error", async () => {
    const { client } = makeClient({ openSettlement: null });
    const result = await suggestPresettlementLink(client as never, {
      operating_company_id: OPCO,
      load_id: LOAD_ID,
      driver_id: DRIVER_ID,
      trip_type: "SB",
      tour_id: TOUR_ID,
      actor_user_id: USER_ID,
    });
    expect(result.suggested_settlement_id).toBeNull();
    expect(result.suggested_reason).toMatch(/needs manual attach/);
  });

  it("never touches mdata.loads.presettlement_link_id or driver_finance.driver_settlements during suggest — only confirm does", async () => {
    const { client, calls } = makeClient({ openSettlement: { id: OPEN_SETTLEMENT_ID, display_id: "S-1" } });
    await suggestPresettlementLink(client as never, {
      operating_company_id: OPCO,
      load_id: LOAD_ID,
      driver_id: DRIVER_ID,
      trip_type: "TR",
      tour_id: TOUR_ID,
      actor_user_id: USER_ID,
    });
    expect(calls.some((c) => /UPDATE mdata\.loads/.test(c.sql))).toBe(false);
    expect(calls.some((c) => /INSERT INTO driver_finance\.driver_settlements/.test(c.sql))).toBe(false);
  });

  it("confirmPresettlementLink create_new mints a new settlement and links the load", async () => {
    const { client, calls } = makeClient({ openSettlement: { id: OPEN_SETTLEMENT_ID, display_id: "S-1" } });
    const result = await confirmPresettlementLink(client as never, {
      operating_company_id: OPCO,
      suggestion_id: SUGGESTION_ID,
      action: "create_new",
      actor_user_id: USER_ID,
    });
    expect(result.status).toBe("confirmed");
    expect(result.settlement_id).toBe("new-settlement-id");
    const created = calls.find(c => /INSERT INTO driver_finance\.driver_settlements/.test(c.sql));
    expect(created?.values[2]).toBe("S-2026-0042");
    expect(calls.some(c => c.sql.includes("lib.next_trace_no"))).toBe(false);
    expect(calls.some((c) => /INSERT INTO driver_finance\.driver_settlements/.test(c.sql))).toBe(true);
    expect(calls.some((c) => /UPDATE mdata\.loads SET presettlement_link_id/.test(c.sql))).toBe(true);
  });

  it("GAP-PRESETTLEMENT-PERIOD-NULL: create_new derives period_start/period_end from the load's own trip-start date, never leaves them NULL", async () => {
    const { client, calls } = makeClient({ openSettlement: { id: OPEN_SETTLEMENT_ID, display_id: "S-1" } });
    await confirmPresettlementLink(client as never, {
      operating_company_id: OPCO,
      suggestion_id: SUGGESTION_ID,
      action: "create_new",
      actor_user_id: USER_ID,
    });
    const insertCall = calls.find((c) => /INSERT INTO driver_finance\.driver_settlements/.test(c.sql));
    expect(insertCall).toBeTruthy();
    expect(insertCall!.sql).toMatch(/period_start/);
    expect(insertCall!.sql).toMatch(/period_end/);
    // Both bound to the SAME $6 placeholder (period_start = period_end = trip-start date,
    // matching openLoadBookendedSettlement's initial-value pattern) — the mocked trip-start
    // query returns 2026-07-03, so both params must carry that date, not undefined/null.
    expect(insertCall!.values).toContain("2026-07-03");
    expect(insertCall!.values.some((v) => v == null)).toBe(false);
  });

  it("manual no-tour override keeps the chosen same-driver/unit settlement and persists its tour", async () => {
    const { client, calls } = makeClient({ suggestionTour: null });
    const result = await confirmPresettlementLink(client as never, {
      operating_company_id: OPCO, suggestion_id: SUGGESTION_ID,
      action: "link_existing", override_settlement_id: OPEN_SETTLEMENT_ID, actor_user_id: USER_ID,
    });
    expect(result.settlement_id).toBe(OPEN_SETTLEMENT_ID);
    const target = calls.find(c => c.sql.includes("SELECT id, status, trip_closed_at"))!;
    expect(target.values).toEqual([OPEN_SETTLEMENT_ID, OPCO, DRIVER_ID, null, null, true]);
    expect(target.sql).toContain("driver_id = $3::uuid");
    expect(target.sql).toContain("l.assigned_unit_id = $5::uuid");
    expect(calls.find(c => c.sql.includes("UPDATE mdata.loads SET tour_id"))?.values).toEqual([TOUR_ID, LOAD_ID, OPCO]);
    expect(calls.some(c => c.sql.includes("INSERT INTO driver_finance.driver_settlements"))).toBe(false);
  });

  it("confirmPresettlementLink link_existing refuses when there is no target settlement at all", async () => {
    const { client } = makeClient({ openSettlement: null });
    await expect(
      confirmPresettlementLink(client as never, {
        operating_company_id: OPCO,
        suggestion_id: SUGGESTION_ID,
        action: "link_existing",
        actor_user_id: USER_ID,
      })
    ).rejects.toMatchObject({ code: "no_target_settlement" });
  });

  it("confirmPresettlementLink refuses to resolve an already-resolved suggestion", async () => {
    const { client } = makeClient({ suggestionStatus: "confirmed" });
    await expect(
      confirmPresettlementLink(client as never, {
        operating_company_id: OPCO,
        suggestion_id: SUGGESTION_ID,
        action: "reject",
        actor_user_id: USER_ID,
      })
    ).rejects.toMatchObject({ code: "suggestion_already_resolved" });
  });

  it("PresettlementLinkError is a real Error subclass carrying a stable .code", () => {
    const err = new PresettlementLinkError("some_code", "some message");
    expect(err).toBeInstanceOf(Error);
    expect(err.code).toBe("some_code");
  });

  // SET-01 (owner ruling 2026-09-03/09-04): "the instant a load is CREATED it joins a
  // pre-settlement... assignment is automatic." This is the exact function book-load.service.ts
  // calls, unconditionally, from inside its own booking transaction -- these tests exercise the
  // real production code path (not a re-implementation of it) against a mock client, proving both
  // the resolution AND the transaction ordering (suggest's own writes happen before confirm's)
  // without booking a real load anywhere, live or otherwise.
  describe("linkLoadToPresettlementAtBookingInClientTx — SET-01 (called from book-load.service.ts at booking time)", () => {
    it("NB leg: suggests+confirms create_new in one call, returns a real settlement_id", async () => {
      const { client, calls } = makeClient();
      const result = await linkLoadToPresettlementAtBookingInClientTx(client as never, {
        operating_company_id: OPCO,
        load_id: LOAD_ID,
        driver_id: DRIVER_ID,
        trip_type: "NB",
        tour_id: TOUR_ID,
        actor_user_id: USER_ID,
      });
      expect(result.action).toBe("create_new");
      expect(result.settlement_id).toBe("new-settlement-id");
      expect(result.suggestion_id).toBe(SUGGESTION_ID);
      // Transaction-order proof: the suggestion INSERT (suggest phase) happens strictly before
      // the driver_settlements INSERT and the mdata.loads UPDATE (confirm phase) — matching the
      // owner's "assignment is automatic... a load can never exist without already being linked"
      // requirement, not just "eventually linked."
      const suggestIdx = calls.findIndex((c) => /INSERT INTO driver_finance\.presettlement_link_suggestions/.test(c.sql));
      const settlementIdx = calls.findIndex((c) => /INSERT INTO driver_finance\.driver_settlements/.test(c.sql));
      const loadUpdateIdx = calls.findIndex((c) => /UPDATE mdata\.loads SET presettlement_link_id/.test(c.sql));
      expect(suggestIdx).toBeGreaterThanOrEqual(0);
      expect(settlementIdx).toBeGreaterThan(suggestIdx);
      expect(loadUpdateIdx).toBeGreaterThan(suggestIdx);
    });

    it("TR/SB leg with an open settlement for the tour: suggests+confirms link_existing, joins the SAME settlement (never opens a new one)", async () => {
      const { client, calls } = makeClient({ openSettlement: { id: OPEN_SETTLEMENT_ID, display_id: "S-1" } });
      const result = await linkLoadToPresettlementAtBookingInClientTx(client as never, {
        operating_company_id: OPCO,
        load_id: LOAD_ID,
        driver_id: DRIVER_ID,
        trip_type: "TR",
        tour_id: TOUR_ID,
        actor_user_id: USER_ID,
      });
      expect(result.action).toBe("link_existing");
      expect(result.settlement_id).toBe(OPEN_SETTLEMENT_ID);
      // A southbound (or, here, a triangulation) leg joining an open tour must NEVER mint a
      // second driver_settlements row -- that would silently split one trip's money across two
      // settlements.
      expect(calls.some((c) => /INSERT INTO driver_finance\.driver_settlements/.test(c.sql))).toBe(false);
    });

    it("throws a real PresettlementLinkError, never a silent partial result, when the suggestion cannot be confirmed", async () => {
      // The suggest-then-confirm ordering means a race (a suggestion resolved by something else
      // between the two calls) or any other confirm-side failure must fail LOUD here -- book-load
      // .service.ts's own transaction then rolls back the whole booking, never leaving a load
      // half-linked. Simulated here via a suggestion that already resolved to a non-pending status.
      const { client } = makeClient({ suggestionStatus: "rejected" });
      await expect(
        linkLoadToPresettlementAtBookingInClientTx(client as never, {
          operating_company_id: OPCO,
          load_id: LOAD_ID,
          driver_id: DRIVER_ID,
          trip_type: "NB",
          tour_id: TOUR_ID,
          actor_user_id: USER_ID,
        })
      ).rejects.toBeInstanceOf(PresettlementLinkError);
    });
  });

  // REG-008 (SET-01 auto-link gap, 2026-09-09/10): quick-assign, planner reschedule, and manual
  // reassignment all write assigned_primary_driver_id AFTER a load is already booked, and none of
  // them ever called the linker. These tests exercise the shared gate the fix adds, against the
  // same mock client shape as the at-booking tests above.
  describe("linkLoadToPresettlementAfterAssignmentInClientTx — REG-008 (called from post-booking driver-assignment paths)", () => {
    it("already linked: is a no-op, never re-suggests or re-confirms", async () => {
      const { client, calls } = makeClient();
      const result = await linkLoadToPresettlementAfterAssignmentInClientTx(client as never, {
        operating_company_id: OPCO,
        load_id: LOAD_ID,
        presettlement_link_id_before: "already-linked-settlement-id",
        driver_id: DRIVER_ID,
        trip_type: "NB",
        tour_id: TOUR_ID,
        actor_user_id: USER_ID,
      });
      expect(result).toBeNull();
      expect(calls.some((c) => /INSERT INTO driver_finance\.presettlement_link_suggestions/.test(c.sql))).toBe(false);
      expect(calls.some((c) => /UPDATE mdata\.loads SET presettlement_link_id/.test(c.sql))).toBe(false);
    });

    it("trip_type not yet known: defers with an audit event, never guesses NB/TR/SB", async () => {
      const { client, calls } = makeClient();
      const result = await linkLoadToPresettlementAfterAssignmentInClientTx(client as never, {
        operating_company_id: OPCO,
        load_id: LOAD_ID,
        presettlement_link_id_before: null,
        driver_id: DRIVER_ID,
        trip_type: null,
        tour_id: null,
        actor_user_id: USER_ID,
      });
      expect(result).toBeNull();
      expect(calls.some((c) => /SELECT audit\.append_event/.test(c.sql))).toBe(true);
      expect(calls.some((c) => /INSERT INTO driver_finance\.presettlement_link_suggestions/.test(c.sql))).toBe(false);
    });

    it("not yet linked + trip_type known: runs the SAME at-booking resolution logic (NB opens new)", async () => {
      const { client } = makeClient();
      const result = await linkLoadToPresettlementAfterAssignmentInClientTx(client as never, {
        operating_company_id: OPCO,
        load_id: LOAD_ID,
        presettlement_link_id_before: null,
        driver_id: DRIVER_ID,
        trip_type: "NB",
        tour_id: TOUR_ID,
        actor_user_id: USER_ID,
      });
      expect(result?.action).toBe("create_new");
      expect(result?.settlement_id).toBe("new-settlement-id");
    });

    it("not yet linked, TR/SB with an open tour settlement: joins it (never opens a second one)", async () => {
      const { client, calls } = makeClient({ openSettlement: { id: OPEN_SETTLEMENT_ID, display_id: "S-1" } });
      const result = await linkLoadToPresettlementAfterAssignmentInClientTx(client as never, {
        operating_company_id: OPCO,
        load_id: LOAD_ID,
        presettlement_link_id_before: null,
        driver_id: DRIVER_ID,
        trip_type: "TR",
        tour_id: TOUR_ID,
        actor_user_id: USER_ID,
      });
      expect(result?.action).toBe("link_existing");
      expect(result?.settlement_id).toBe(OPEN_SETTLEMENT_ID);
      expect(calls.some((c) => /INSERT INTO driver_finance\.driver_settlements/.test(c.sql))).toBe(false);
    });
  });
});

describe("REG-010/011 settlement identity", () => {
  it("uses the settlement sequence without consuming a load number", async () => {
    const { client, calls } = makeClient();
    await expect(allocateNextSettlementDisplayId(client as never, OPCO, "2026-07-03")).resolves.toBe("S-2026-0042");
    expect(calls).toHaveLength(1);
    expect(calls[0].sql).toContain("driver_finance.next_settlement_display_id");
    expect(calls[0].values).toEqual([OPCO, "2026-07-03"]);
  });
  it.each([undefined, null, "S-13734", "13734", "S-2026-42"])("rejects invalid allocator output %s instead of inventing an ID", async (next_id) => {
    const client = { query: vi.fn().mockResolvedValue({ rows: [{ next_id }] }) };
    await expect(allocateNextSettlementDisplayId(client, OPCO, "2026-07-03")).rejects.toThrow("Settlement number allocation failed");
  });
});

describe("NB tour separation and REG-040 closed continuation", () => {
  const unitId = "77777777-7777-4777-8777-777777777777";

  it("closed NB reopens through the reversal service and confirms the SAME UUID with continuation classification", async () => {
    reopen.mockClear();
    const { client, calls } = makeClient({ openSettlement: { id: OPEN_SETTLEMENT_ID, display_id: "S-2026-0042" }, closedContinuation: true });
    const result = await linkLoadToPresettlementAtBookingInClientTx(client as never, {
      operating_company_id: OPCO, load_id: LOAD_ID, driver_id: DRIVER_ID, unit_id: unitId,
      trip_type: "NB", tour_id: TOUR_ID, actor_user_id: USER_ID,
    });
    expect(result).toMatchObject({ action: "link_existing", settlement_id: OPEN_SETTLEMENT_ID });
    expect(reopen).toHaveBeenCalledWith(client, { operatingCompanyId: OPCO, settlementId: OPEN_SETTLEMENT_ID, loadId: LOAD_ID, actorUserId: USER_ID });
    expect(calls.some(c => /next_settlement_display_id|INSERT INTO driver_finance\.driver_settlements/.test(c.sql))).toBe(false);
    expect(calls.find(c => /INSERT INTO driver_finance\.presettlement_link_suggestions/.test(c.sql))?.values[7]).toMatch(/^REG-040 resettlement continuation/);
  });

  it("inherits the open unit/driver tour under a transaction lock before any allocation", async () => {
    const query = vi.fn().mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ tour_id: TOUR_ID }] });
    const tour = await findOpenPresettlementTourForUnit({ query }, { operating_company_id: OPCO, driver_id: DRIVER_ID, unit_id: unitId });
    expect(tour).toBe(TOUR_ID);
    expect(query.mock.calls[0][0]).toContain("pg_advisory_xact_lock");
    expect(query.mock.calls[0][1]).toEqual([`presettlement-unit:${OPCO}:${unitId}`]);
    const [sql, params] = query.mock.calls[1];
    expect(params).toEqual([OPCO, DRIVER_ID, unitId]);
    expect(sql).toContain("s.tour_id IS NOT NULL");
    expect(sql).toContain("s.voided_at IS NULL AND s.status IN ('open', 'closed'");
    expect(sql).toContain("l.operating_company_id = s.operating_company_id");
    expect(sql).toContain("l.assigned_unit_id = $3::uuid AND l.tour_id = s.tour_id");
  });

  it("leaves fresh-tour creation to booking when the unit has no open tour", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    await expect(findOpenPresettlementTourForUnit({ query }, { operating_company_id: OPCO, driver_id: DRIVER_ID, unit_id: unitId })).resolves.toBeNull();
    expect(query.mock.calls.some(([sql]) => /INSERT|UPDATE|next_settlement_display_id/.test(sql))).toBe(false);
  });

  it("first NB can join an open tour that has no other NB", async () => {
    const { client, calls } = makeClient({ openSettlement: { id: OPEN_SETTLEMENT_ID, display_id: "S-2026-0042" } });
    const result = await linkLoadToPresettlementAtBookingInClientTx(client as never, {
      operating_company_id: OPCO, load_id: LOAD_ID, driver_id: DRIVER_ID, unit_id: unitId,
      trip_type: "NB", tour_id: TOUR_ID, actor_user_id: USER_ID,
    });
    expect(result).toMatchObject({ action: "link_existing", settlement_id: OPEN_SETTLEMENT_ID });
    expect(calls.some(c => /next_settlement_display_id|INSERT INTO driver_finance\.driver_settlements/.test(c.sql))).toBe(false);
    const lookup = calls.find(c => /SELECT id, display_id/.test(c.sql))!;
    expect(lookup.values).toEqual([OPCO, DRIVER_ID, TOUR_ID, unitId, LOAD_ID]);
    const link = calls.find(c => /UPDATE mdata\.loads SET presettlement_link_id/.test(c.sql))!;
    expect(link.values).toEqual([OPEN_SETTLEMENT_ID, LOAD_ID, TOUR_ID, OPCO]);
  });

  it("refuses linking if the suggested settlement becomes unavailable before confirmation", async () => {
    const { client, calls } = makeClient({ openSettlement: { id: OPEN_SETTLEMENT_ID, display_id: "S-2026-0042" }, targetClosed: true });
    await expect(linkLoadToPresettlementAtBookingInClientTx(client as never, {
      operating_company_id: OPCO, load_id: LOAD_ID, driver_id: DRIVER_ID, unit_id: unitId,
      trip_type: "NB", tour_id: TOUR_ID, actor_user_id: USER_ID,
    })).rejects.toMatchObject({ code: "target_settlement_not_open" });
    expect(calls.some(c => /UPDATE mdata\.loads SET presettlement_link_id/.test(c.sql))).toBe(false);
    expect(calls.find(c => /SELECT id, status, trip_closed_at::text, tour_id::text FROM driver_finance\.driver_settlements\s+WHERE/.test(c.sql))?.sql).toContain("FOR UPDATE");
  });
});


describe("NB-OPEN-TOUR-SPLIT", () => {
  const input = { operating_company_id: OPCO, load_id: LOAD_ID, driver_id: DRIVER_ID,
    unit_id: "77777777-7777-4777-8777-777777777777", trip_type: "NB" as const,
    tour_id: TOUR_ID, actor_user_id: USER_ID };
  it.each([false, true])("fresh NB splits occupied open tour even with historical continuation=%s", async (historicalContinuation) => {
    reopen.mockClear();
    const { client, calls } = makeClient({ openSettlement: { id: OPEN_SETTLEMENT_ID, display_id: "S-2026-0042" }, hasOtherNb: true, historicalContinuation });
    const result = await linkLoadToPresettlementAtBookingInClientTx(client as never, input);
    expect(result).toMatchObject({ action: "create_new", settlement_id: "new-settlement-id" });
    const created = calls.find(c => /INSERT INTO driver_finance\.driver_settlements/.test(c.sql))!;
    expect(created.values[3]).toMatch(/^[a-f0-9-]{36}$/);
    expect(created.values[3]).not.toBe(TOUR_ID);
    const linked = calls.find(c => /UPDATE mdata\.loads SET presettlement_link_id/.test(c.sql))!;
    expect(linked.values).toEqual(["new-settlement-id", LOAD_ID, created.values[3], OPCO]);
    expect(reopen).not.toHaveBeenCalled();
  });
  it("post-booking NB assignment splits an explicit occupied tour", async () => {
    const { client, calls } = makeClient({ openSettlement: { id: OPEN_SETTLEMENT_ID, display_id: "S-2026-0042" }, hasOtherNb: true });
    expect(await linkLoadToPresettlementAfterAssignmentInClientTx(client as never, { ...input, presettlement_link_id_before: null }))
      .toMatchObject({ action: "create_new" });
    expect(calls.find(c => /INSERT INTO driver_finance\.driver_settlements/.test(c.sql))!.values[3]).not.toBe(TOUR_ID);
  });
  it.each([undefined, OPEN_SETTLEMENT_ID])("stale/manual confirmation rejects a second NB (override=%s)", async (override_settlement_id) => {
    const { client, calls } = makeClient({ openSettlement: { id: OPEN_SETTLEMENT_ID, display_id: "S-2026-0042" }, hasOtherNb: true, suggestionTripType: "NB" });
    await expect(confirmPresettlementLink(client as never, { operating_company_id: OPCO, suggestion_id: SUGGESTION_ID,
      action: "link_existing", override_settlement_id, actor_user_id: USER_ID })).rejects.toMatchObject({ code: "open_settlement_already_has_nb" });
    expect(calls.some(c => /UPDATE mdata\.loads/.test(c.sql))).toBe(false);
  });
  it.each(["TR", "SB"] as const)("%s still joins an occupied open tour", async (trip_type) => {
    const { client } = makeClient({ openSettlement: { id: OPEN_SETTLEMENT_ID, display_id: "S-2026-0042" }, hasOtherNb: true });
    expect(await linkLoadToPresettlementAtBookingInClientTx(client as never, { ...input, trip_type }))
      .toMatchObject({ action: "link_existing", settlement_id: OPEN_SETTLEMENT_ID });
  });
  it("stale TR suggestion cannot attach a load now edited to NB", async () => {
    const { client, calls } = makeClient({ openSettlement: { id: OPEN_SETTLEMENT_ID, display_id: "S-2026-0042" },
      hasOtherNb: true, suggestionTripType: "TR", currentTripType: "NB" });
    await expect(confirmPresettlementLink(client as never, { operating_company_id: OPCO, suggestion_id: SUGGESTION_ID,
      action: "link_existing", actor_user_id: USER_ID })).rejects.toMatchObject({ code: "open_settlement_already_has_nb" });
    expect(calls.some(c => /UPDATE mdata\.loads/.test(c.sql))).toBe(false);
    expect(calls.find(c => c.sql.includes("SELECT l.id::text, l.trip_type"))!.sql).toContain("FOR UPDATE OF l");
  });
  it("stale driver assignment cannot confirm a settlement for the old driver", async () => {
    const { client } = makeClient({ currentDriver: USER_ID });
    await expect(confirmPresettlementLink(client as never, { operating_company_id: OPCO, suggestion_id: SUGGESTION_ID,
      action: "create_new", actor_user_id: USER_ID })).rejects.toMatchObject({ code: "suggestion_load_changed" });
  });
  it("manual create_new on an old NB suggestion creates a distinct tour", async () => {
    const { client, calls } = makeClient({ openSettlement: { id: OPEN_SETTLEMENT_ID, display_id: "S-2026-0042" }, suggestionTripType: "NB" });
    expect(await confirmPresettlementLink(client as never, { operating_company_id: OPCO, suggestion_id: SUGGESTION_ID,
      action: "create_new", actor_user_id: USER_ID })).toMatchObject({ settlement_id: "new-settlement-id" });
    expect(calls.find(c => /INSERT INTO driver_finance\.driver_settlements/.test(c.sql))!.values[3]).not.toBe(TOUR_ID);
  });
  it("closed occupied NB tour still uses audited REG-040 continuation", async () => {
    reopen.mockClear();
    const { client } = makeClient({ openSettlement: { id: OPEN_SETTLEMENT_ID, display_id: "S-2026-0042" }, hasOtherNb: true, closedContinuation: true });
    expect(await linkLoadToPresettlementAtBookingInClientTx(client as never, input)).toMatchObject({ action: "link_existing", settlement_id: OPEN_SETTLEMENT_ID });
    expect(reopen).toHaveBeenCalledTimes(1);
  });
});
