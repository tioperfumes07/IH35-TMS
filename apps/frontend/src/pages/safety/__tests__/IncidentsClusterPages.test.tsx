import type React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as safetyApi from "../../../api/safety";
import { CargoClaimsPage } from "../CargoClaimsPage";
import { DamageReportsPage } from "../DamageReportsPage";
import { TrailerInterchangesPage } from "../TrailerInterchangesPage";

const companyId = "91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071";

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

describe("Incidents cluster pages (A23-7)", () => {
  beforeEach(() => {
    vi.spyOn(safetyApi, "listSafetyIncidents").mockImplementation(async (_companyId, incidentType) => ({
      incidents: [
        {
          id: `${incidentType}-1`,
          incident_type: incidentType,
          incident_at: "2026-06-03T12:00:00Z",
          location: "Terminal",
          status: "open",
        },
      ],
    }));
    vi.spyOn(safetyApi, "getSafetyIncident").mockResolvedValue({
      incident: { id: "row-1", location: "Terminal", description: "Test", photo_keys: [] },
    });
    vi.spyOn(safetyApi, "createSafetyIncident").mockResolvedValue({
      incident: { id: "new-1", status: "open" },
    });
    vi.spyOn(safetyApi, "uploadSafetyIncidentPhoto").mockResolvedValue({
      incident_id: "row-1",
      photo_key: "incidents/row-1/photo.jpg",
      photo_keys: ["incidents/row-1/photo.jpg"],
    });
  });

  it("DamageReportsPage renders list surface", async () => {
    render(wrap(<DamageReportsPage operatingCompanyId={companyId} />));
    await waitFor(() => {
      expect(screen.getByTestId("damage-reports-page")).toBeTruthy();
    });
    expect(screen.getByTestId("damage-reports-page-table")).toBeTruthy();
    expect(screen.getByText("+ Create damage report")).toBeTruthy();
  });

  it("TrailerInterchangesPage exposes create interchange action", async () => {
    render(wrap(<TrailerInterchangesPage operatingCompanyId={companyId} />));
    await waitFor(() => {
      expect(screen.getByTestId("trailer-interchanges-page-create-btn")).toBeTruthy();
    });
    expect(screen.getByText("+ Create interchange")).toBeTruthy();
  });

  it("CargoClaimsPage renders dedicated cargo claim surface", async () => {
    render(wrap(<CargoClaimsPage operatingCompanyId={companyId} />));
    await waitFor(() => {
      expect(screen.getByTestId("cargo-claims-page-row-cargo_claim-1")).toBeTruthy();
    });
    expect(screen.getByText("Cargo Claims")).toBeTruthy();
  });
});
