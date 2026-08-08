import type React from "react";
import { pickCombo } from "../../../test-utils/pickCombo";
import { MemoryRouter } from "react-router-dom";
import { ToastProvider } from "../../../components/Toast";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as safetyApi from "../../../api/safety";
import * as mdataApi from "../../../api/mdata";
import * as loadsApi from "../../../api/loads";
import { DamageReportsPage } from "../DamageReportsPage";
import { TrailerInterchangesPage } from "../TrailerInterchangesPage";

const companyId = "91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071";
const driverId = "11111111-1111-4111-8111-111111111111";
const unitId = "22222222-2222-4222-8222-222222222222";
const trailerId = "33333333-3333-4333-8333-333333333333";

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  // These creator pages call useLocation/useNavigate and useToast, so with neither provider EVERY render
  // threw and all 4 tests died before a single assertion — the failure named the router, never the page.
  return (
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <MemoryRouter>{ui}</MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>
  );
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
  // The TRAILER picker is EntityPicker kind="trailer", which reads `listEquipment` (GET /mdata/equipment) —
  // NOT `listUnits`. Mocking only listUnits left its list empty except the "+ Create trailer" row, so the
  // trailer could never be selected. Label comes from `equipment_number` (entityPickerRegistry).
  vi.spyOn(mdataApi, "listEquipment").mockResolvedValue({
    equipment: [{ id: trailerId, equipment_number: "TRL-900", equipment_type: "trailer" }],
  } as never);
  vi.spyOn(mdataApi, "listUnits").mockResolvedValue({
    units: [
      { id: unitId, unit_number: "TRK-100", kind: "truck" },
      { id: trailerId, unit_number: "TRL-900", kind: "trailer" },
    ],
    total: 2,
  });
  vi.spyOn(loadsApi, "listLoads").mockResolvedValue({ loads: [], total: 0 } as never);
});

async function openCreate(testId: string) {
  await waitFor(() => expect(screen.getByTestId(`${testId}-create-btn`)).toBeTruthy());
  fireEvent.click(screen.getByTestId(`${testId}-create-btn`));
  await waitFor(() => expect(screen.getByTestId(`${testId}-drawer`)).toBeTruthy());
}

describe("Incidents cluster typed creators (SC-CLUSTER: damage + interchange)", () => {
  it("damage_report renders its typed field (damage amount) and not interchange fields", async () => {
    render(wrap(<DamageReportsPage operatingCompanyId={companyId} />));
    await openCreate("damage-reports-page");
    expect(screen.getByTestId("damage-reports-page-field-damage_amount_cents")).toBeTruthy();
    expect(screen.getByTestId("damage-reports-page-field-driver_id")).toBeTruthy();
    expect(screen.getByTestId("damage-reports-page-field-trailer_id")).toBeTruthy();
    expect(screen.queryByTestId("damage-reports-page-field-interchange_party")).toBeNull();
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

  it("persists picked uuids + converts dollars to integer cents, then keeps the drawer open for photos", async () => {
    render(wrap(<DamageReportsPage operatingCompanyId={companyId} />));
    await openCreate("damage-reports-page");

    // Save disabled until required text is present.
    expect((screen.getByTestId("damage-reports-page-save-btn") as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(screen.getByTestId("damage-reports-page-field-location"), { target: { value: "Dock 4" } });
    fireEvent.change(screen.getByTestId("damage-reports-page-field-description"), {
      target: { value: "Fork punctured wall" },
    });
    // These fields are EntityPickers (a Combobox), not inputs: setting `value` on the container throws
    // "The given element does not have a value setter". A listbox row is addressed by its VISIBLE
    // TEXT, not the uuid — pickCombo drives it the way the browser does.
    pickCombo(within(screen.getByTestId("damage-reports-page-field-driver_id")).getByRole("combobox"), /Ana Mecor/i);
    pickCombo(within(screen.getByTestId("damage-reports-page-field-unit_id")).getByRole("combobox"), /TRK-100/i);
    // Damage amount is the shared MoneyInput (cents mode) — enter dollars, it parses to integer cents.
    const amountInput = screen
      .getByTestId("damage-reports-page-field-damage_amount_cents")
      .querySelector("input") as HTMLInputElement;
    fireEvent.change(amountInput, { target: { value: "1.00" } });

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

  it("trailer_interchange sends interchange_party + trailer_id after confirming without photos", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(wrap(<TrailerInterchangesPage operatingCompanyId={companyId} />));
    await openCreate("trailer-interchanges-page");

    fireEvent.change(screen.getByTestId("trailer-interchanges-page-field-location"), {
      target: { value: "Laredo yard" },
    });
    fireEvent.change(screen.getByTestId("trailer-interchanges-page-field-description"), {
      target: { value: "In-gate" },
    });
    // These fields are EntityPickers (a Combobox), not inputs: setting `value` on the container throws
    // "The given element does not have a value setter". A listbox row is addressed by its VISIBLE
    // TEXT, not the uuid — pickCombo drives it the way the browser does.
    pickCombo(within(screen.getByTestId("trailer-interchanges-page-field-trailer_id")).getByRole("combobox"), /TRL-900/i);
    fireEvent.change(screen.getByTestId("trailer-interchanges-page-field-interchange_party"), {
      target: { value: "Carrier XYZ" },
    });

    const saveBtn = screen.getByTestId("trailer-interchanges-page-save-btn") as HTMLButtonElement;
    await waitFor(() => expect(saveBtn.disabled).toBe(false));
    fireEvent.click(saveBtn);

    await waitFor(() => expect(createSpy).toHaveBeenCalledTimes(1));
    expect(confirmSpy).toHaveBeenCalled();
    const payload = createSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.trailer_id).toBe(trailerId);
    expect(payload.interchange_party).toBe("Carrier XYZ");
    expect(payload.incident_type).toBe("trailer_interchange");
  });
});
