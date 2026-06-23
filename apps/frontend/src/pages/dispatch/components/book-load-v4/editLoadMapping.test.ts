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
  detention_expected_hours: 2,
  miles_practical: 500,
  commodity: "STEEL COILS",
  cargo_weight_lbs: 42000,
  reefer_setpoint_temp_f: 34,
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

  it("no edits → body is just operating_company_id (nothing overwritten)", () => {
    const values = buildEditPrefill(baseLoad);
    const body = buildEditPatchBody(values, {}, OCID);
    expect(Object.keys(body)).toEqual(["operating_company_id"]);
  });

  it("Block 7: commodity/weight/reefer/trip_type ARE emitted when dirty (Jorge-approved set)", () => {
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
    expect(body.cargo_weight_lbs).toBe(38000); // form weight_lbs → mdata column cargo_weight_lbs
    expect(body.reefer_setpoint_temp_f).toBe(28); // text → numeric
    expect(body.trip_type).toBe("SB");
  });

  it("Block 7: an untouched commodity is NOT sent even when another field changes (no wipe)", () => {
    const values = { ...buildEditPrefill(baseLoad), notes: "changed" };
    const body = buildEditPatchBody(values, { notes: true } as Record<string, unknown>, OCID);
    expect("commodity" in body).toBe(false);
    expect("cargo_weight_lbs" in body).toBe(false);
    expect(body.notes).toBe("changed");
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

  it("Block 7: prefills commodity/weight/reefer/trip_type from the detail (round-trip)", () => {
    const v = buildEditPrefill(baseLoad);
    expect(v.commodity).toBe("STEEL COILS");
    expect(v.weight_lbs).toBe(42000); // from cargo_weight_lbs
    expect(v.reefer_setpoint).toBe("34"); // numeric reefer_setpoint_temp_f surfaced as text
    expect(v.trip_type).toBe("NB");
    expect(v.pieces).toBe("18"); // piece_count (int) surfaced as text
    expect(v.customer_po_number).toBe("PO-9000");
  });
});
