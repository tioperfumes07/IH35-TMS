import type React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as mdataApi from "../../../api/mdata";
import * as loadsApi from "../../../api/loads";
import * as safetyApi from "../../../api/safety";
import { DamageReportCreatorModal } from "../components/DamageReportCreatorModal";

const companyId = "91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071";
const driverId = "11111111-1111-4111-8111-111111111111";
const unitId = "22222222-2222-4222-8222-222222222222";

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

describe("DamageReportCreatorModal (SC2)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.spyOn(mdataApi, "listDrivers").mockResolvedValue({
      drivers: [{ id: driverId, first_name: "Juan", last_name: "Mecor" } as never],
      total: 1,
    });
    vi.spyOn(mdataApi, "listUnits").mockResolvedValue({
      units: [{ id: unitId, unit_number: "TRK-101" }],
      total: 1,
    });
    vi.spyOn(loadsApi, "listLoads").mockResolvedValue({
      loads: [],
      total_count: 0,
      has_more: false,
    } as never);
    vi.spyOn(safetyApi, "createSafetyIncident").mockResolvedValue({
      incident: { id: "new-incident-1", status: "open" },
    });
    vi.spyOn(safetyApi, "uploadSafetyIncidentPhoto").mockResolvedValue({
      incident_id: "new-incident-1",
      photo_key: "incidents/new-incident-1/photo.jpg",
      photo_keys: ["incidents/new-incident-1/photo.jpg"],
    });
  });

  it("passes limit:200 + operating_company_id to the driver picker", async () => {
    render(wrap(<DamageReportCreatorModal operatingCompanyId={companyId} onClose={() => {}} onCreated={() => {}} />));
    await waitFor(() => {
      expect(mdataApi.listDrivers).toHaveBeenCalledWith(
        expect.objectContaining({ operating_company_id: companyId, limit: 200 })
      );
    });
    expect(mdataApi.listUnits).toHaveBeenCalledWith(expect.objectContaining({ limit: 200 }));
  });

  it("blocks submit until date/location/description are present", async () => {
    render(wrap(<DamageReportCreatorModal operatingCompanyId={companyId} onClose={() => {}} onCreated={() => {}} />));
    const saveBtn = await screen.findByRole("button", { name: /^Save$/ });
    // date defaults to companyNow(); location + description still empty → Save disabled.
    expect((saveBtn as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(screen.getByTestId("damage-report-location"), { target: { value: "Laredo yard" } });
    expect((saveBtn as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByTestId("damage-report-description"), { target: { value: "Bent bumper" } });
    expect((saveBtn as HTMLButtonElement).disabled).toBe(false);
  });

  it("posts all collected fields (incl. operating_company_id) and converts dollars→cents", async () => {
    const onCreated = vi.fn();
    render(wrap(<DamageReportCreatorModal operatingCompanyId={companyId} onClose={() => {}} onCreated={onCreated} />));

    await screen.findByTestId("damage-report-location");
    fireEvent.change(screen.getByTestId("damage-report-incident-at"), {
      target: { value: "2026-07-01T09:30" },
    });
    fireEvent.change(screen.getByTestId("damage-report-location"), { target: { value: "Laredo yard" } });
    fireEvent.change(screen.getByTestId("damage-report-description"), { target: { value: "Bent bumper" } });

    // $1,234.56 → 123456 cents via MoneyInput cents mode.
    const money = screen.getByLabelText("Estimated damage amount");
    fireEvent.focus(money);
    fireEvent.change(money, { target: { value: "1234.56" } });

    fireEvent.click(screen.getByRole("button", { name: /^Save$/ }));

    await waitFor(() => expect(safetyApi.createSafetyIncident).toHaveBeenCalledTimes(1));
    const payload = (safetyApi.createSafetyIncident as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][0] as Record<string, unknown>;
    expect(payload.operating_company_id).toBe(companyId);
    expect(payload.incident_type).toBe("damage_report");
    expect(payload.location).toBe("Laredo yard");
    expect(payload.description).toBe("Bent bumper");
    expect(payload.damage_amount_cents).toBe(123456);
    expect(typeof payload.incident_at).toBe("string");
    expect(onCreated).toHaveBeenCalled();
  });

  it("shows the photo-upload step after a successful create", async () => {
    render(wrap(<DamageReportCreatorModal operatingCompanyId={companyId} onClose={() => {}} onCreated={() => {}} />));
    await screen.findByTestId("damage-report-location");
    fireEvent.change(screen.getByTestId("damage-report-location"), { target: { value: "Laredo yard" } });
    fireEvent.change(screen.getByTestId("damage-report-description"), { target: { value: "Bent bumper" } });
    fireEvent.click(screen.getByRole("button", { name: /^Save$/ }));

    await waitFor(() => {
      expect(screen.getByTestId("damage-report-photo-input")).toBeTruthy();
    });
    expect(screen.getByText(/add photos/i)).toBeTruthy();
  });
});
