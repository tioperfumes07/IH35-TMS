import { describe, expect, it } from "vitest";
import { CAPACITY_SQL, toCapacityRow, type CapacityRawRow, type CapacityRow } from "../capacity.service.js";
import {
  MAX_OFFER_EMAILS_PER_DAY,
  OFFER_HORIZON_HOURS,
  offerSubject,
  planOffers,
  signUnsubscribeToken,
  verifyUnsubscribeToken,
  type OfferRecipient,
} from "../capacity-offers.service.js";
import { UNIT_IN_SERVICE_SQL } from "../../unit-in-service.js";
import { canonicalDispatchWorkWhereClause } from "../../canonical-active-load-set.js";
import { boardStatus, desiredPostings, diffPostings } from "../load-board-posting.service.js";

const NOW = new Date("2026-11-10T15:00:00Z");
const SECRET = "test-secret-0123456789abcdef";

function raw(over: Partial<CapacityRawRow> = {}): CapacityRawRow {
  return {
    unit_id: "11111111-1111-4111-8111-111111111111", unit_number: "T152",
    load_id: null, load_number: null, open_load_count: 0,
    load_trailer_type: null, last_trailer_type: "refrigerated_van",
    driver_name: "Juan Perez",
    stop_city: null, stop_state: null,
    stop_actual_departure_at: null, stop_appointment_end_at: null, stop_scheduled_arrival_at: null,
    gps_city: "Laredo", gps_state: "TX", gps_captured_at: "2026-11-10T14:00:00Z",
    offer_enabled: null, off_reason_code: null,
    ...over,
  };
}

describe("capacity engine — where and when each truck is free", () => {
  it("uses the FINAL stop of the LAST load in the unit's chain, appointment before scheduled", () => {
    const row = toCapacityRow(raw({
      load_id: "L1", load_number: "13735", open_load_count: 2, load_trailer_type: "dry_van",
      stop_city: "Medley", stop_state: "FL",
      stop_appointment_end_at: "2026-11-11T18:00:00Z", stop_scheduled_arrival_at: "2026-11-11T12:00:00Z",
    }), NOW);
    expect(row).toMatchObject({ available_city: "Medley", available_state: "FL", available_at: "2026-11-11T18:00:00Z", source: "appointment", equipment: "Dry Van", equipment_source: "next_load", offerable: true, open_load_count: 2 });
  });

  it("actual departure wins over appointment and scheduled", () => {
    const row = toCapacityRow(raw({ load_id: "L1", stop_city: "Dallas", stop_state: "TX", stop_actual_departure_at: "2026-11-10T10:00:00Z", stop_appointment_end_at: "2026-11-10T09:00:00Z" }), NOW);
    expect(row.source).toBe("actual");
    expect(row.available_at).toBe("2026-11-10T10:00:00Z");
  });

  it("no open load → GPS position, source gps", () => {
    const row = toCapacityRow(raw(), NOW);
    expect(row).toMatchObject({ available_city: "Laredo", available_state: "TX", source: "gps", equipment: "Reefer", equipment_source: "last_load", offerable: true, reason: null });
  });

  it("unknown → NULL + a reason, and never offered", () => {
    const noTime = toCapacityRow(raw({ load_id: "L9", load_number: "999", stop_city: "Austin", stop_state: "TX" }), NOW);
    expect(noTime.available_at).toBeNull();
    expect(noTime.reason).toMatch(/no appointment or scheduled time/);
    expect(noTime.offerable).toBe(false);
    const noGps = toCapacityRow(raw({ gps_city: null, gps_state: null, gps_captured_at: null }), NOW);
    expect(noGps).toMatchObject({ available_city: null, source: null, offerable: false });
    expect(noGps.reason).toMatch(/no GPS position/);
    const stale = toCapacityRow(raw({ gps_captured_at: "2026-09-26T12:00:00Z" }), NOW);
    expect(stale.reason).toMatch(/days old/);
    expect(stale.offerable).toBe(false);
    const noEquip = toCapacityRow(raw({ last_trailer_type: null }), NOW);
    expect(noEquip.reason).toMatch(/no trailer type/);
  });

  it("offer switched off keeps the reason code and is not offerable", () => {
    const row = toCapacityRow(raw({ offer_enabled: false, off_reason_code: "capacity_driver_home_time" }), NOW);
    expect(row).toMatchObject({ offer_enabled: false, off_reason_code: "capacity_driver_home_time", offerable: false });
  });

  it("the SQL is gated by the canonical in-service unit set and the canonical active-load set", () => {
    expect(CAPACITY_SQL).toMatch(/FROM mdata\.units u/);
    expect(CAPACITY_SQL).toContain(UNIT_IN_SERVICE_SQL);
    expect(CAPACITY_SQL).toContain(canonicalDispatchWorkWhereClause("l", "$1::uuid"));
  });
});

function cap(over: Partial<CapacityRow>): CapacityRow {
  return {
    unit_id: "u1", unit_number: "T100", driver_name: null, equipment: "Reefer", equipment_source: "last_load",
    available_city: "Laredo", available_state: "TX", available_at: "2026-11-10T16:00:00Z", source: "gps", reason: null,
    last_load_id: null, last_load_number: null, open_load_count: 0, offer_enabled: true, off_reason_code: null, offerable: true,
    ...over,
  };
}
const R1: OfferRecipient = { contact_uuid: "c1", email: "Buyer@Shipper.com", contact_name: "Ana", customer_id: "cust1", customer_name: "Shipper" };
const R2: OfferRecipient = { contact_uuid: "c2", email: "ops@other.com", contact_name: null, customer_id: "cust2", customer_name: "Other" };

describe("capacity offers — audience, lanes, cap", () => {
  const lanes = new Map([["cust1", new Set(["TX"])], ["cust2", new Set(["GA"])]]);
  const capacity = [
    cap({ unit_id: "u1", unit_number: "T100" }),
    cap({ unit_id: "u2", unit_number: "T101", available_state: "GA", available_city: "Augusta" }),
    cap({ unit_id: "u3", unit_number: "T102", offerable: false, offer_enabled: false }),
    cap({ unit_id: "u4", unit_number: "T103", available_at: new Date(NOW.getTime() + (OFFER_HORIZON_HOURS + 1) * 3_600_000).toISOString() }),
  ];

  it("morning: each flagged recipient gets only trucks in its customer's lane states, offerable, inside the horizon", () => {
    const plan = planOffers({ kind: "morning", recipients: [R1, R2], laneStatesByCustomer: lanes, capacity, sentToday: new Map(), now: NOW });
    expect(plan.map((p) => [p.recipient.contact_uuid, p.trucks.map((t) => t.unit_number)])).toEqual([["c1", ["T100"]], ["c2", ["T101"]]]);
  });

  it("a recipient whose customer has no lane history gets nothing", () => {
    const plan = planOffers({ kind: "morning", recipients: [R1], laneStatesByCustomer: new Map(), capacity, sentToday: new Map(), now: NOW });
    expect(plan).toEqual([]);
  });

  it("hard cap: one morning + one change per day; change carries only NEW trucks", () => {
    expect(MAX_OFFER_EMAILS_PER_DAY).toBe(2);
    const morningSent = new Map([["buyer@shipper.com", { morning: [{ unit_id: "u1", unit_number: "T100", city: "Laredo", state: "TX", available_at: "x", equipment: "Reefer" }] }]]);
    expect(planOffers({ kind: "morning", recipients: [R1], laneStatesByCustomer: lanes, capacity, sentToday: morningSent, now: NOW })).toEqual([]);
    expect(planOffers({ kind: "change", recipients: [R1], laneStatesByCustomer: lanes, capacity, sentToday: morningSent, now: NOW })).toEqual([]);
    const withNew = [...capacity, cap({ unit_id: "u9", unit_number: "T109", available_city: "San Antonio" })];
    const change = planOffers({ kind: "change", recipients: [R1], laneStatesByCustomer: lanes, capacity: withNew, sentToday: morningSent, now: NOW });
    expect(change[0].trucks.map((t) => t.unit_number)).toEqual(["T109"]);
    const bothSent = new Map([["buyer@shipper.com", { morning: [], change: true }]]);
    expect(planOffers({ kind: "change", recipients: [R1], laneStatesByCustomer: lanes, capacity: withNew, sentToday: bothSent, now: NOW })).toEqual([]);
  });

  it("subject names the count, day and cities", () => {
    const plan = planOffers({ kind: "morning", recipients: [R1], laneStatesByCustomer: lanes, capacity, sentToday: new Map(), now: NOW });
    expect(offerSubject("USMCA", plan[0].trucks, "morning", NOW)).toBe("USMCA — 1 truck available Tue (Laredo)");
  });

  it("unsubscribe token round-trips and rejects tampering", () => {
    const t = signUnsubscribeToken("5c854333-6ea5-4faa-af31-67cb272fef80", "Buyer@Shipper.com", SECRET);
    expect(verifyUnsubscribeToken(t, SECRET)).toEqual({ operatingCompanyId: "5c854333-6ea5-4faa-af31-67cb272fef80", email: "buyer@shipper.com" });
    expect(verifyUnsubscribeToken(t.slice(0, -2) + "xx", SECRET)).toBeNull();
    expect(verifyUnsubscribeToken(t, "another-secret-0123456789")).toBeNull();
  });
});

describe("load-board posting", () => {
  it("not connected without credentials — says exactly what is missing", () => {
    expect(boardStatus("dat", {})).toMatchObject({ connected: false });
    expect(boardStatus("dat", {}).reason).toMatch(/^Not connected — needs DAT API credentials/);
    expect(boardStatus("truckstop", {}).reason).toMatch(/^Not connected — needs Truckstop API credentials/);
  });

  it("a unit that is no longer offerable (booked further out / offer off) is withdrawn", () => {
    const desired = desiredPostings([cap({ unit_id: "u1" }), cap({ unit_id: "u2", offerable: false })]);
    expect(desired.map((d) => d.unit_id)).toEqual(["u1"]);
    const existing = [
      { id: "p1", unit_id: "u1", external_posting_id: "x1", status: "posted", origin_city: "Laredo", origin_state: "TX", available_at: "2026-11-10T16:00:00Z", equipment: "Reefer" },
      { id: "p2", unit_id: "u2", external_posting_id: "x2", status: "posted", origin_city: "Laredo", origin_state: "TX", available_at: "2026-11-10T16:00:00Z", equipment: "Reefer" },
    ];
    const { upserts, withdraws } = diffPostings(desired, existing);
    expect(upserts).toEqual([]);
    expect(withdraws.map((w) => w.unit_id)).toEqual(["u2"]);
    const moved = diffPostings(desiredPostings([cap({ unit_id: "u1", available_city: "Dallas" })]), existing);
    expect(moved.upserts.map((u) => u.origin_city)).toEqual(["Dallas"]);
  });
});
