import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { SamsaraDriverMappingPage } from "./SamsaraDriverMappingPage";
import { ToastProvider } from "../../components/Toast";
import * as mappingApi from "../../api/samsara-driver-mapping";
import type { SamsaraProfile } from "../../api/samsara-driver-mapping";

vi.mock("../../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({ selectedCompanyId: "company-1" }),
}));

vi.mock("../../api/samsara-driver-mapping", () => ({
  listSamsaraProfiles: vi.fn(),
  listMappingTargets: vi.fn(),
  mapSamsaraDrivers: vi.fn(),
  unmapSamsaraDrivers: vi.fn(),
}));

function wrap(ui: ReactElement) {
  return render(
    <MemoryRouter>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <ToastProvider>{ui}</ToastProvider>
      </QueryClientProvider>
    </MemoryRouter>
  );
}

function profile(overrides: Partial<SamsaraProfile> = {}): SamsaraProfile {
  return {
    samsara_driver_id: "sam-1",
    samsara_name: "Leonel Morales",
    mapped: false,
    local_driver_id: null,
    local_vendor_id: null,
    driver_name: null,
    vendor_name: null,
    driver_status: null,
    mapped_target_deactivated: false,
    last_seen_at: "2026-09-20T00:00:00Z",
    samsara_status: "active",
    resolver_suggestion: { status: "unmatched" },
    ...overrides,
  };
}

const DRIVER = {
  id: "drv-9",
  name: "Jordan Ruiz",
  kind: "driver" as const,
  active: true,
  cdl_number: "TX123",
  mapped_samsara_count: 1,
};

describe("SamsaraDriverMappingPage — split + additive save", () => {
  it("renders the split panes", async () => {
    vi.mocked(mappingApi.listMappingTargets).mockResolvedValue({ status: "ok", targets: [DRIVER] });
    vi.mocked(mappingApi.listSamsaraProfiles).mockResolvedValue({ status: "ok", profiles: [], next_cursor: null });
    wrap(<SamsaraDriverMappingPage />);
    expect(await screen.findByTestId("sdm-left-pane")).toBeTruthy();
    expect(screen.getByTestId("sdm-right-pane")).toBeTruthy();
    expect(screen.getByTestId("sdm-filter-status")).toBeTruthy();
    expect(screen.getByTestId("sdm-filter-mapping")).toBeTruthy();
    expect(screen.getByTestId("sdm-filter-kind")).toBeTruthy();
  });

  it("selecting a person drives the right pane and locks already-mapped rows", async () => {
    vi.mocked(mappingApi.listMappingTargets).mockResolvedValue({ status: "ok", targets: [DRIVER] });
    vi.mocked(mappingApi.listSamsaraProfiles).mockResolvedValue({
      status: "ok",
      profiles: [
        profile({
          samsara_driver_id: "sam-locked",
          samsara_name: "Already Here",
          mapped: true,
          local_driver_id: "drv-9",
          driver_name: "Jordan Ruiz",
        }),
        profile({ samsara_driver_id: "sam-free", samsara_name: "Free User" }),
      ],
      next_cursor: null,
    });
    wrap(<SamsaraDriverMappingPage />);
    fireEvent.click(await screen.findByTestId("sdm-map-btn-drv-9"));
    expect(await screen.findByTestId("sdm-filter-show")).toBeTruthy();
    const locked = await screen.findByTestId("profile-select-sam-locked");
    expect((locked as HTMLInputElement).checked).toBe(true);
    expect((locked as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByTestId("sdm-mapped-here-sam-locked")).toBeTruthy();
  });

  it("additive save posts only newly ticked ids — never clears the locked mapping", async () => {
    vi.mocked(mappingApi.listMappingTargets).mockResolvedValue({ status: "ok", targets: [DRIVER] });
    vi.mocked(mappingApi.listSamsaraProfiles).mockResolvedValue({
      status: "ok",
      profiles: [
        profile({
          samsara_driver_id: "sam-locked",
          mapped: true,
          local_driver_id: "drv-9",
          driver_name: "Jordan Ruiz",
        }),
        profile({ samsara_driver_id: "sam-free", samsara_name: "Free User" }),
      ],
      next_cursor: null,
    });
    vi.mocked(mappingApi.mapSamsaraDrivers).mockResolvedValue({
      status: "ok",
      mapped_count: 1,
      missing_samsara_driver_ids: [],
    });
    wrap(<SamsaraDriverMappingPage />);
    fireEvent.click(await screen.findByTestId("sdm-map-btn-drv-9"));
    // Show filter defaults to unmapped — switch to all so both rows appear
    // (MultiSelectDropdown: open + tick "All")
    fireEvent.click(screen.getByTestId("sdm-filter-show").querySelector("button")!);
    fireEvent.click(await screen.findByText("All"));
    fireEvent.click(await screen.findByTestId("profile-select-sam-free"));
    fireEvent.click(screen.getByTestId("sdm-save"));
    await waitFor(() =>
      expect(mappingApi.mapSamsaraDrivers).toHaveBeenCalledWith("company-1", {
        samsara_driver_ids: ["sam-free"],
        target_kind: "driver",
        target_id: "drv-9",
        retire_emptied_drivers: false,
      })
    );
    // Locked id must NOT be in the payload as a replace-clear — only the new one.
    const body = vi.mocked(mappingApi.mapSamsaraDrivers).mock.calls[0]?.[1];
    expect(body?.samsara_driver_ids).not.toContain("sam-locked");
  });

  it("a row mapped elsewhere must be unmapped there first", async () => {
    vi.mocked(mappingApi.listMappingTargets).mockResolvedValue({ status: "ok", targets: [DRIVER] });
    vi.mocked(mappingApi.listSamsaraProfiles).mockResolvedValue({
      status: "ok",
      profiles: [
        profile({
          samsara_driver_id: "sam-other",
          mapped: true,
          local_driver_id: "drv-other",
          driver_name: "Someone Else",
        }),
      ],
      next_cursor: null,
    });
    wrap(<SamsaraDriverMappingPage />);
    fireEvent.click(await screen.findByTestId("sdm-map-btn-drv-9"));
    fireEvent.click(screen.getByTestId("sdm-filter-show").querySelector("button")!);
    fireEvent.click(await screen.findByText("All"));
    const box = await screen.findByTestId("profile-select-sam-other");
    expect((box as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByTestId("sdm-unmap-sam-other")).toBeTruthy();
  });

  it("same-person retire is only sent when the human ticks it", async () => {
    vi.mocked(mappingApi.listMappingTargets).mockResolvedValue({ status: "ok", targets: [DRIVER] });
    vi.mocked(mappingApi.listSamsaraProfiles).mockResolvedValue({
      status: "ok",
      profiles: [profile({ samsara_driver_id: "sam-free" })],
      next_cursor: null,
    });
    vi.mocked(mappingApi.mapSamsaraDrivers).mockResolvedValue({
      status: "ok",
      mapped_count: 1,
      retired_driver_ids: ["drv-old"],
      missing_samsara_driver_ids: [],
    });
    wrap(<SamsaraDriverMappingPage />);
    fireEvent.click(await screen.findByTestId("sdm-map-btn-drv-9"));
    fireEvent.click(await screen.findByTestId("profile-select-sam-free"));
    fireEvent.click(screen.getByTestId("sdm-retire-emptied"));
    fireEvent.click(screen.getByTestId("sdm-save"));
    await waitFor(() =>
      expect(mappingApi.mapSamsaraDrivers).toHaveBeenCalledWith("company-1", {
        samsara_driver_ids: ["sam-free"],
        target_kind: "driver",
        target_id: "drv-9",
        retire_emptied_drivers: true,
      })
    );
  });
});
