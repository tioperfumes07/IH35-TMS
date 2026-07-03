import type React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as safetyApi from "../../../api/safety";
import * as mdataApi from "../../../api/mdata";
import * as loadsApi from "../../../api/loads";
import * as catalogsSafetyApi from "../../../api/catalogs-safety";
import { CargoClaimsPage } from "../CargoClaimsPage";
import { DamageReportsPage } from "../DamageReportsPage";
import { TrailerInterchangesPage } from "../TrailerInterchangesPage";

const companyId = "91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071";
const driverId = "11111111-1111-4111-8111-111111111111";
const unitId = "22222222-2222-4222-8222-222222222222";
const trailerId = "33333333-3333-4333-8333-333333333333";
const customerId = "44444444-4444-4444-8444-444444444444";

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

let createSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(safetyApi, "listSafetyIncidents").mockResolvedValue({ incidents: [] });
  vi.spyOn(safetyApi, "getSafetyIncident").mockResolvedValue({
    incident: { id: "new-1", location: "Yard", description: "d", photo_keys: [] },
  });
  createSpy = vi
    .spyOn(safetyApi, "createSafetyIncident")
    .mockResolvedValue({ incident: { id: "new-1", status: "open" } });
  vi.spyOn(safetyApi, "uploadSafetyIncidentPhoto").mockResolvedValue({
    incident_id: "new-1",
    photo_key: "k",
    photo_keys: ["k"],
  });
  vi.spyOn(mdataApi, "listDrivers").mockResolvedValue({
    drivers: [{ id: driverId, first_name: "Ana", last_name: "Mecor" }] as never,
    total: 1,
  });
  vi.spyOn(mdataApi, "listUnits").mockResolvedValue({
    units: [
      { id: unitId, unit_number: "TRK-100", kind: "truck" },
      { id: trailerId, unit_number: "TRL-900", kind: "trailer" },
    ],
    total: 2,
  });
  vi.spyOn(mdataApi, "listCustomers").mockResolvedValue({
    customers: [{ id: customerId, name: "Acme Foods" }] as never,
    total: 1,
  });
  vi.spyOn(loadsApi, "listLoads").mockResolvedValue({ loads: [], total: 0 } as never);
  vi.spyOn(catalogsSafetyApi, "listCargoClaimReasons").mockResolvedValue({
    rows: [
      {
        id: "r1",
        operating_company_id: companyId,
        reason_code: "SHORTAGE",
        display_name: "Shortage",
        description: null,
        claim_category: "shortage",
        is_active: true,
        sort_order: 0,
        created_at: "",
        updated_at: "",
      },
    ],
    total: 1,
  });
});

async function openCreate(testId: string) {
  await waitFor(() => expect(screen.getByTestId(`${testId}-create-btn`)).toBeTruthy());
  fireEvent.click(screen.getByTestId(`${testId}-create-btn`));
  await waitFor(() => expect(screen.getByTestId(`${testId}-drawer`)).toBeTruthy());
}

describe("Incidents cluster typed creators (SC-CLUSTER)", () => {
  it("damage_report renders its typed fields (damage amount) and not interchange/cargo fields", async () => {
    render(wrap(<DamageReportsPage operatingCompanyId={companyId} />));
    await openCreate("damage-reports-page");
    expect(screen.getByTestId("damage-reports-page-field-damage_amount_cents")).toBeTruthy();
    expect(screen.getByTestId("damage-reports-page-field-driver_id")).toBeTruthy();
    expect(screen.getByTestId("damage-reports-page-field-trailer_id")).toBeTruthy();
    expect(screen.queryByTestId("damage-reports-page-field-interchange_party")).toBeNull();
    expect(screen.queryByTestId("damage-reports-page-field-claim_reason_code")).toBeNull();
  });

  it("trailer_interchange renders interchange party + requires a trailer", async () => {
    render(wrap(<TrailerInterchangesPage operatingCompanyId={companyId} />));
    await openCreate("trailer-interchanges-page");
    expect(screen.getByTestId("trailer-interchanges-page-field-interchange_party")).toBeTruthy();
    expect(screen.queryByTestId("trailer-interchanges-page-field-damage_amount_cents")).toBeNull();
    // Trailer is required — fill location/description but omit trailer, Save must stay disabled.
    fireEvent.change(screen.getByTestId("trailer-interchanges-page-field-location"), {
      target: { value: "Border yard" },
    });
    fireEvent.change(screen.getByTestId("trailer-interchanges-page-field-description"), {
      target: { value: "Handover" },
    });
    const missing = screen.getByTestId("trailer-interchanges-page-missing-fields");
    expect(missing.textContent).toContain("Trailer");
    expect((screen.getByTestId("trailer-interchanges-page-save-btn") as HTMLButtonElement).disabled).toBe(true);
  });

  it("cargo_claim renders claimant/reason/filed-date fields", async () => {
    render(wrap(<CargoClaimsPage operatingCompanyId={companyId} />));
    await openCreate("cargo-claims-page");
    expect(screen.getByTestId("cargo-claims-page-field-claimant_customer_id")).toBeTruthy();
    expect(screen.getByTestId("cargo-claims-page-field-claim_reason_code")).toBeTruthy();
    expect(screen.getByTestId("cargo-claims-page-field-claim_filed_at")).toBeTruthy();
    expect(screen.getByTestId("cargo-claims-page-field-damage_amount_cents")).toBeTruthy();
  });

  it("persists picked uuids + converts dollars to integer cents, then keeps the drawer open for photos", async () => {
    render(wrap(<DamageReportsPage operatingCompanyId={companyId} />));
    await openCreate("damage-reports-page");

    // Save disabled until required text is present.
    expect((screen.getByTestId("damage-reports-page-save-btn") as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(screen.getByTestId("damage-reports-page-field-location"), { target: { value: "Dock 4" } });
    fireEvent.change(screen.getByTestId("damage-reports-page-field-description"), {
      target: { value: "Fork punctured wall" },
    });
    fireEvent.change(screen.getByTestId("damage-reports-page-field-driver_id"), { target: { value: driverId } });
    fireEvent.change(screen.getByTestId("damage-reports-page-field-unit_id"), { target: { value: unitId } });
    fireEvent.change(screen.getByTestId("damage-reports-page-field-damage_amount_cents"), {
      target: { value: "1.00" },
    });

    const saveBtn = screen.getByTestId("damage-reports-page-save-btn") as HTMLButtonElement;
    await waitFor(() => expect(saveBtn.disabled).toBe(false));
    fireEvent.click(saveBtn);

    await waitFor(() => expect(createSpy).toHaveBeenCalledTimes(1));
    const payload = createSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.driver_id).toBe(driverId);
    expect(payload.unit_id).toBe(unitId);
    expect(payload.damage_amount_cents).toBe(100);
    expect(payload.incident_type).toBe("damage_report");
    expect(typeof payload.incident_at).toBe("string");

    // Post-save: drawer stays open in detail mode with the photo input + hint.
    await waitFor(() => expect(screen.getByTestId("damage-reports-page-saved-hint")).toBeTruthy());
    expect(screen.getByTestId("damage-reports-page-photo-input")).toBeTruthy();
  });

  it("cargo_claim feature-detects SC4 fields: no echo → shows pending note, record still saved", async () => {
    // Backend not live: created row does NOT echo claim_reason_code.
    createSpy.mockResolvedValueOnce({ incident: { id: "new-1", status: "open" } });
    render(wrap(<CargoClaimsPage operatingCompanyId={companyId} />));
    await openCreate("cargo-claims-page");

    fireEvent.change(screen.getByTestId("cargo-claims-page-field-location"), { target: { value: "Warehouse" } });
    fireEvent.change(screen.getByTestId("cargo-claims-page-field-description"), { target: { value: "Short 3 pallets" } });
    fireEvent.change(screen.getByTestId("cargo-claims-page-field-claimant_customer_id"), {
      target: { value: customerId },
    });
    fireEvent.change(screen.getByTestId("cargo-claims-page-field-claim_reason_code"), {
      target: { value: "SHORTAGE" },
    });

    const saveBtn = screen.getByTestId("cargo-claims-page-save-btn") as HTMLButtonElement;
    await waitFor(() => expect(saveBtn.disabled).toBe(false));
    fireEvent.click(saveBtn);

    await waitFor(() => expect(createSpy).toHaveBeenCalledTimes(1));
    const payload = createSpy.mock.calls[0][0] as Record<string, unknown>;
    // Fields ARE sent optimistically...
    expect(payload.claim_reason_code).toBe("SHORTAGE");
    expect(payload.claimant_customer_id).toBe(customerId);
    // ...but since the echo lacks them, the surface surfaces the pending note (no hard-fail).
    await waitFor(() => expect(screen.getByTestId("cargo-claims-page-sc4-pending")).toBeTruthy());
    expect(screen.getByTestId("cargo-claims-page-saved-hint")).toBeTruthy();
  });
});
