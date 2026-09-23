import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { SamsaraDriverMappingPage } from "./SamsaraDriverMappingPage";
import { ToastProvider } from "../../components/Toast";
import * as mappingApi from "../../api/samsara-driver-mapping";
import type { SamsaraProfile } from "../../api/samsara-driver-mapping";

// E20 Part B (Round 92/94) -- "663 unmapped is the DEFAULT VIEW", "mapped / unmapped / ambiguous
// are three distinct states", "nothing on this page writes a pairing the backend did not
// resolve". These tests lock exactly those three claims plus the map/unmap write paths.

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
    resolver_suggestion: { status: "unmatched" },
    ...overrides,
  };
}

describe("SamsaraDriverMappingPage — E20 Part B", () => {
  it("defaults to the unmapped status tab, not a footnote", async () => {
    const listSpy = vi.mocked(mappingApi.listSamsaraProfiles).mockResolvedValue({ status: "ok", profiles: [], next_cursor: null });
    wrap(<SamsaraDriverMappingPage />);
    await waitFor(() => expect(listSpy).toHaveBeenCalled());
    expect(listSpy.mock.calls[0]?.[1]).toMatchObject({ status: "unmapped" });
    expect(screen.getByTestId("status-tab-unmapped")).toHaveClass("underline");
  });

  it("renders a matched suggestion as its own named state, with an apply action", async () => {
    vi.mocked(mappingApi.listSamsaraProfiles).mockResolvedValue({
      status: "ok",
      profiles: [profile({ resolver_suggestion: { status: "matched", target_id: "drv-9" } })],
      next_cursor: null,
    });
    wrap(<SamsaraDriverMappingPage />);
    expect(await screen.findByText("Suggested match found")).toBeTruthy();
    expect(screen.getByTestId("apply-suggestion-sam-1")).toBeTruthy();
  });

  it("renders an ambiguous suggestion with its candidate count, never a pick", async () => {
    vi.mocked(mappingApi.listSamsaraProfiles).mockResolvedValue({
      status: "ok",
      profiles: [profile({ resolver_suggestion: { status: "ambiguous", candidate_ids: ["a", "b", "c"] } })],
      next_cursor: null,
    });
    wrap(<SamsaraDriverMappingPage />);
    expect(await screen.findByText("Ambiguous (3 candidates)")).toBeTruthy();
    // Never an "apply" action for an ambiguous verdict — a human must pick via the target picker.
    expect(screen.queryByTestId("apply-suggestion-sam-1")).toBeNull();
  });

  it("renders an already-mapped row's real target name, not the suggestion column", async () => {
    vi.mocked(mappingApi.listSamsaraProfiles).mockResolvedValue({
      status: "ok",
      profiles: [profile({ mapped: true, local_driver_id: "drv-9", driver_name: "Jordan Ruiz" })],
      next_cursor: null,
    });
    wrap(<SamsaraDriverMappingPage />);
    expect(await screen.findByText("Jordan Ruiz")).toBeTruthy();
  });

  it("names a deactivated mapped target instead of showing it as a clean match", async () => {
    vi.mocked(mappingApi.listSamsaraProfiles).mockResolvedValue({
      status: "ok",
      profiles: [profile({ mapped: true, local_vendor_id: "ven-1", vendor_name: "Owner-Op Carrier", mapped_target_deactivated: true })],
      next_cursor: null,
    });
    wrap(<SamsaraDriverMappingPage />);
    expect(await screen.findByText("Owner-Op Carrier (deactivated)")).toBeTruthy();
  });

  it("selecting rows and opening the target picker never writes until Confirm is clicked", async () => {
    vi.mocked(mappingApi.listSamsaraProfiles).mockResolvedValue({ status: "ok", profiles: [profile()], next_cursor: null });
    vi.mocked(mappingApi.listMappingTargets).mockResolvedValue({
      status: "ok",
      targets: [{ id: "drv-9", name: "Jordan Ruiz", kind: "driver", active: true }],
    });
    const mapSpy = vi.mocked(mappingApi.mapSamsaraDrivers);
    wrap(<SamsaraDriverMappingPage />);
    fireEvent.click(await screen.findByTestId("profile-select-sam-1"));
    fireEvent.click(screen.getByTestId("bulk-map-to-driver"));
    expect(await screen.findByTestId("target-picker-modal")).toBeTruthy();
    // Confirm button starts disabled — no target chosen yet, no write possible.
    expect(screen.getByTestId("target-picker-confirm")).toBeDisabled();
    expect(mapSpy).not.toHaveBeenCalled();
  });

  it("map writes with the selected samsara_driver_ids and chosen target", async () => {
    vi.mocked(mappingApi.listSamsaraProfiles).mockResolvedValue({ status: "ok", profiles: [profile()], next_cursor: null });
    vi.mocked(mappingApi.listMappingTargets).mockResolvedValue({
      status: "ok",
      targets: [{ id: "drv-9", name: "Jordan Ruiz", kind: "driver", active: true }],
    });
    vi.mocked(mappingApi.mapSamsaraDrivers).mockResolvedValue({ status: "ok", mapped_count: 1, missing_samsara_driver_ids: [] });
    wrap(<SamsaraDriverMappingPage />);
    fireEvent.click(await screen.findByTestId("profile-select-sam-1"));
    fireEvent.click(screen.getByTestId("bulk-map-to-driver"));
    const modal = within(await screen.findByTestId("target-picker-modal"));
    fireEvent.focus(modal.getByRole("combobox"));
    // Combobox renders its option list via a portal — outside the modal's own DOM subtree.
    fireEvent.click(await screen.findByRole("option", { name: "Jordan Ruiz" }));
    fireEvent.click(screen.getByTestId("target-picker-confirm"));
    await waitFor(() =>
      expect(mappingApi.mapSamsaraDrivers).toHaveBeenCalledWith("company-1", {
        samsara_driver_ids: ["sam-1"],
        target_kind: "driver",
        target_id: "drv-9",
      })
    );
  });

  it("unmap is disabled when no selected row is currently mapped", async () => {
    vi.mocked(mappingApi.listSamsaraProfiles).mockResolvedValue({ status: "ok", profiles: [profile()], next_cursor: null });
    wrap(<SamsaraDriverMappingPage />);
    fireEvent.click(await screen.findByTestId("profile-select-sam-1"));
    expect(screen.getByTestId("bulk-unmap")).toBeDisabled();
  });

  it("unmap writes the selected ids when at least one selected row is mapped", async () => {
    vi.mocked(mappingApi.listSamsaraProfiles).mockResolvedValue({
      status: "ok",
      profiles: [profile({ mapped: true, local_driver_id: "drv-9", driver_name: "Jordan Ruiz" })],
      next_cursor: null,
    });
    vi.mocked(mappingApi.unmapSamsaraDrivers).mockResolvedValue({ status: "ok", unmapped_count: 1 });
    wrap(<SamsaraDriverMappingPage />);
    fireEvent.click(await screen.findByTestId("profile-select-sam-1"));
    fireEvent.click(screen.getByTestId("bulk-unmap"));
    await waitFor(() => expect(mappingApi.unmapSamsaraDrivers).toHaveBeenCalledWith("company-1", { samsara_driver_ids: ["sam-1"] }));
  });

  it("shows the honest empty state, not a fabricated zero, distinguishing status", async () => {
    vi.mocked(mappingApi.listSamsaraProfiles).mockResolvedValue({ status: "ok", profiles: [], next_cursor: null });
    wrap(<SamsaraDriverMappingPage />);
    expect(await screen.findByTestId("profiles-empty")).toHaveTextContent("No unmapped Samsara profiles");
  });

  it("shows a named error instead of the empty text when the fetch fails", async () => {
    vi.mocked(mappingApi.listSamsaraProfiles).mockRejectedValue(new Error("network down"));
    wrap(<SamsaraDriverMappingPage />);
    expect(await screen.findByTestId("profiles-error")).toBeTruthy();
    expect(screen.queryByTestId("profiles-empty")).toBeNull();
  });
});
