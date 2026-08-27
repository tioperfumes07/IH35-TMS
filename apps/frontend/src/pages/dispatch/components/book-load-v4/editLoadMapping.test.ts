import { describe, expect, it } from "vitest";
import type { LoadDetail } from "../../../../api/loads";
import { buildEditPatchBody, buildEditPrefill } from "./editLoadMapping";

const OCID = "91e0bf0a-133f-4ce8-a734-2586cfa66d96";

const baseLoad = {
  id: "load-1",
  operating_company_id: OCID,
  load_number: "L-1001",
  customer_id: "cust-1",
  customer_name: "ACME",
  status: "booked",
  rate_total_cents: 250000,
  currency_code: "USD",
  assigned_unit_id: "unit-1",
  assigned_primary_driver_id: "drv-1",
  assigned_secondary_driver_id: null,
  team_id: null,
  notes: "hello",
  customer_wo_number: "WO-9",
  pickup_number: "PU-3",
  detention_expected_y_n: true,
  detention_reason_id: "7ec72d18-5fef-4f46-9008-66d08f019c55",
  detention_expected_hours: 2,
  miles_practical: 500,
  trip_type: "NB",
  piece_count: 18,
  customer_po_number: "PO-9000",
  stops: [
    { id: "s1", load_id: "load-1", sequence_number: 1, stop_type: "pickup", city: "Laredo", state: "TX", country: "USA", address_line1: "1 A", scheduled_arrival_at: null, status: "pending", notes: null, created_at: "", updated_at: "", gate_dock_text: "Dock 4" },
  ],
} as unknown as LoadDetail;

describe("editLoadMapping — anti-data-loss (GUARD #5)", () => {
  it("rate-only edit sends ONLY charges + operating_company_id — never commodity/customer/stops/etc.", () => {
    const values = { ...buildEditPrefill(baseLoad), linehaul_cents: 300000 };
    const body = buildEditPatchBody(values, { linehaul_cents: true }, OCID);
    expect(body.operating_company_id).toBe(OCID);
    expect(body.charges).toBeTruthy();
    // Nothing else is in the body — untouched fields are never sent, so the partial update can't wipe them.
    expect(Object.keys(body).sort()).toEqual(["charges", "operating_company_id"]);
    // Explicitly: the unpersisted + untouched fields are absent.
    expect("commodity" in body).toBe(false);
    expect("customer_wo_number" in body).toBe(false);
    expect("stops" in body).toBe(false);
    expect("notes" in body).toBe(false);
  });

  it("editing ONE scalar sends only that scalar", () => {
    const values = { ...buildEditPrefill(baseLoad), customer_wo_number: "WO-NEW" };
    const body = buildEditPatchBody(values, { customer_wo_number: true }, OCID);
    expect(Object.keys(body).sort()).toEqual(["customer_wo_number", "operating_company_id"]);
    expect(body.customer_wo_number).toBe("WO-NEW");
  });

  it("P44 round-trips the canonical detention reason FK", () => {
    const values = buildEditPrefill(baseLoad);
    expect(values.detention_reason_id).toBe("7ec72d18-5fef-4f46-9008-66d08f019c55");
    const body = buildEditPatchBody(values, { detention_reason_id: true }, OCID);
    expect(body.detention_reason_id).toBe("7ec72d18-5fef-4f46-9008-66d08f019c55");
  });

  it("no edits → body is just operating_company_id (nothing overwritten)", () => {
    const values = buildEditPrefill(baseLoad);
    const body = buildEditPatchBody(values, {}, OCID);
    expect(Object.keys(body)).toEqual(["operating_company_id"]);
  });

  it("ACCT-F9508 (migration 202613220000): trip_type/commodity/weight_lbs ARE emitted when dirty; reefer_setpoint (never a real column name) is NEVER emitted", () => {
    const values = {
      ...buildEditPrefill(baseLoad),
      commodity: "ALUMINUM",
      weight_lbs: 38000,
      reefer_setpoint: "28",
      trip_type: "SB",
    };
    const body = buildEditPatchBody(
      values,
      { commodity: true, weight_lbs: true, reefer_setpoint: true, trip_type: true } as Record<string, unknown>,
      OCID
    );
    expect(body.commodity).toBe("ALUMINUM");
    expect(body.cargo_weight_lbs).toBe(38000);
    expect("reefer_setpoint" in body).toBe(false);
    expect("reefer_setpoint_temp_f" in body).toBe(false);
    expect(body.trip_type).toBe("SB");
  });

  it("Block 7 (migration 202606221000): pieces→piece_count + customer_po_number ARE emitted when dirty", () => {
    const values = { ...buildEditPrefill(baseLoad), pieces: "12", customer_po_number: "PO-123" };
    const body = buildEditPatchBody(
      values,
      { pieces: true, customer_po_number: true } as Record<string, unknown>,
      OCID
    );
    expect(body.piece_count).toBe(12); // form 'pieces' text → mdata column piece_count (int)
    expect(body.customer_po_number).toBe("PO-123");
  });

  it("still-excluded fields (load_type/trailer_type/hazmat) are NEVER emitted (no column / §4)", () => {
    const values = {
      ...buildEditPrefill(baseLoad),
      load_type: "broker",
      trailer_type: "dry_van",
      hazmat: true,
    };
    const body = buildEditPatchBody(
      values,
      { load_type: true, trailer_type: true, hazmat: true } as Record<string, unknown>,
      OCID
    );
    for (const k of ["load_type", "trailer_type", "hazmat"]) {
      expect(k in body).toBe(false);
    }
  });

  it("stops are sent (full shape) only when the stops group is dirty", () => {
    const values = buildEditPrefill(baseLoad);
    expect("stops" in buildEditPatchBody(values, { miles_practical: true }, OCID)).toBe(false);
    const withStops = buildEditPatchBody(values, { stops: [{ city: true }] } as Record<string, unknown>, OCID);
    expect(Array.isArray(withStops.stops)).toBe(true);
    expect((withStops.stops as Array<Record<string, unknown>>)[0].gate_dock_text).toBe("Dock 4");
  });
});

describe("editLoadMapping — prefill", () => {
  it("maps the load summary into form values (rate→linehaul, detention, assignment mode)", () => {
    const v = buildEditPrefill(baseLoad);
    expect(v.customer_id).toBe("cust-1");
    expect(v.linehaul_cents).toBe(250000);
    expect(v.customer_wo_number).toBe("WO-9");
    expect(v.detention_expected_y_n).toBe(true);
    expect(v.assignment_mode).toBe("solo");
    expect((v.stops as Array<Record<string, unknown>>)[0].gate_dock_text).toBe("Dock 4");
  });

  it("ACCT-F9508 (migration 202613220000): prefills trip_type/pieces/customer_po_number/commodity/weight_lbs from the detail (round-trip); reefer_setpoint (never a real column name) is NOT prefilled", () => {
    const v = buildEditPrefill({ ...baseLoad, commodity: "STEEL COILS", cargo_weight_lbs: 42000 } as unknown as LoadDetail);
    expect(v.trip_type).toBe("NB");
    expect(v.pieces).toBe("18"); // piece_count (int) surfaced as text
    expect(v.customer_po_number).toBe("PO-9000");
    expect(v.commodity).toBe("STEEL COILS");
    expect(v.weight_lbs).toBe(42000);
    expect("reefer_setpoint" in v).toBe(false);
  });
});
