import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({ selectedCompanyId: "co-1" }),
}));
vi.mock("../../components/Toast", () => ({
  useToast: () => ({ pushToast: vi.fn() }),
}));

const api = vi.hoisted(() => ({ candidates: vi.fn(), preview: vi.fn(), merge: vi.fn() }));
vi.mock("../../api/driverMerge", () => ({ driverMergeApi: api }));

import { DriverDuplicatesPage } from "./DriverDuplicatesPage";

const jorge = { id: "d-keep", first_name: "JORGE INFANTE", last_name: "CORONA", status: "Active", cdl_number: "A1", loads: 40 };
const luis = { id: "d-dup", first_name: "LUIS", last_name: "CORONA", status: "Inactive", cdl_number: "A1", loads: 2 };
const preview = (over: Partial<Record<string, unknown>> = {}) => ({
  survivor: { id: "d-keep", name: "JORGE INFANTE CORONA", status: "Active", loads: 40 },
  merged: { id: "d-dup", name: "LUIS CORONA", status: "Inactive", loads: 2 },
  references: [
    { ref: "mdata.driver_samsara_accounts.driver_id", rows: 1, status: "moved" },
    { ref: "hos.duty_status_events.driver_id", rows: 9, status: "history_kept" },
  ],
  escrow: { merged_balance_cents: 0, survivor_has_account: true, merged_has_account: false },
  blockers: [],
  needs_override_reason: false,
  ...over,
});

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <DriverDuplicatesPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("DriverDuplicatesPage", () => {
  beforeEach(() => {
    api.candidates.mockReset().mockResolvedValue({ pairs: [{ survivor: jorge, merged: [luis], why: ["same CDL"] }] });
    api.preview.mockReset();
    api.merge.mockReset().mockResolvedValue({ ok: true, repointed: [], history_kept: [], kept_on_survivor: [] });
  });

  it("will not merge until the owner has previewed exactly what moves", async () => {
    api.preview.mockResolvedValue(preview());
    renderPage();
    const mergeBtn = await screen.findByTestId("dup-merge-d-keep");
    expect(mergeBtn).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /preview merge/i }));
    await screen.findByTestId("dup-preview");
    expect(api.preview).toHaveBeenCalledWith("co-1", "d-keep", "d-dup");
    expect(screen.getByText(/History the database keeps/)).toBeInTheDocument();
    expect(mergeBtn).toBeEnabled();
    fireEvent.click(mergeBtn);
    await waitFor(() => expect(api.merge).toHaveBeenCalledWith("co-1", "d-keep", "d-dup", null));
  });

  it("a blocker keeps the merge closed", async () => {
    api.preview.mockResolvedValue(preview({ blockers: ["Both profiles are on an open settlement"] }));
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /preview merge/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent("open settlement");
    expect(screen.getByTestId("dup-merge-d-keep")).toBeDisabled();
  });

  it("keeping the profile with fewer loads requires a reason", async () => {
    api.preview.mockResolvedValue(preview({ needs_override_reason: true }));
    renderPage();
    fireEvent.click(await screen.findByLabelText("Keep LUIS CORONA"));
    fireEvent.click(screen.getByRole("button", { name: /preview merge/i }));
    await screen.findByTestId("dup-preview");
    expect(api.preview).toHaveBeenCalledWith("co-1", "d-dup", "d-keep");
    const mergeBtn = screen.getByTestId("dup-merge-d-keep");
    expect(mergeBtn).toBeDisabled();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Owner: LUIS is the legal name on the CDL" } });
    expect(mergeBtn).toBeEnabled();
  });
});
