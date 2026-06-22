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

  it("commodity is never emitted even if present in values + dirty (not in the editable set)", () => {
    const values = { ...buildEditPrefill(baseLoad), commodity: "STEEL", notes: "changed" };
    const body = buildEditPatchBody(values, { commodity: true, notes: true } as Record<string, unknown>, OCID);
    expect("commodity" in body).toBe(false);
    expect(body.notes).toBe("changed");
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
});
