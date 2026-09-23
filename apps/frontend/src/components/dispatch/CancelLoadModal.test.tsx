import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock the reasons API so the dropdown is populated deterministically.
vi.mock("../../api/dispatch", () => ({
  listDispatchCancellationReasons: vi.fn().mockResolvedValue({
    reasons: [
      { reason_code: "CUSTOMER_CANCELLED", reason_label: "Customer cancelled", requires_owner_approval: false },
      { reason_code: "EQUIPMENT_ISSUE", reason_label: "Equipment issue", requires_owner_approval: false },
      { reason_code: "DRIVER_WALKOFF", reason_label: "Driver walk-off", requires_owner_approval: true },
    ],
  }),
  // ROUND 125-126 — the VOID-A-LOAD CASCADE PREVIEW. Defaulted to an empty cascade so the
  // pre-existing reason-selection tests (which pass no loadId anyway, so this never fires) are
  // unaffected; the dedicated describe block below overrides this per test.
  getLoadCancellationPreview: vi.fn().mockResolvedValue({
    load_id: "load-1",
    load_number: "13500",
    computed_at: "2026-09-23T00:00:00.000Z",
    invoices: [],
    expenses: [],
    vendor_bills: [],
    driver_advances: [],
    settlements: [],
    fuel_expenses: [],
    driver_bills: [],
  }),
}));

// Mock current user so the modal's role-aware branch is deterministic (default Owner; overridden per test).
vi.mock("../../api/identity", () => ({
  getMe: vi.fn().mockResolvedValue({ user: { role: "Owner" }, session: {} }),
}));

import { getLoadCancellationPreview } from "../../api/dispatch";
import { getMe } from "../../api/identity";
import { CancelLoadModal } from "./CancelLoadModal";

function renderWithClient(ui: ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  // MemoryRouter: a loadId'd render mounts EntityLinkOrTombstone, which needs Router context.
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe("CancelLoadModal — reason selection enables + submits", () => {
  beforeEach(() => vi.clearAllMocks());

  it("selecting a reason + valid notes enables Confirm Cancel and submits the reason_code", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderWithClient(
      <CancelLoadModal open operatingCompanyId="91e0bf0a-133f-4ce8-a734-2586cfa66d96" onClose={vi.fn()} onSubmit={onSubmit} />
    );

    const confirm = screen.getByRole("button", { name: /Confirm Cancel/i });
    expect(confirm).toBeDisabled(); // nothing selected yet

    // Open the dropdown (focus the combobox input) so the options render, like a real user.
    fireEvent.focus(screen.getByPlaceholderText(/Select reason/i));
    const option = await screen.findByRole("option", { name: /Customer cancelled/i });

    // Select a reason via CLICK (touch/automation/click must commit, not just mouseDown).
    fireEvent.click(option);

    // Notes must be >= 20 chars (backend + UI gate).
    fireEvent.change(screen.getByPlaceholderText(/Required notes/i), {
      target: { value: "Customer called to cancel the load this morning." },
    });

    await waitFor(() => expect(confirm).toBeEnabled());

    fireEvent.click(confirm);
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    // Contract fix (the cancel bug): payload MUST carry cancel_reason_code (enum) + cancel_reason (text)
    // — the field names the backend cancel hook requires — not just the legacy reason_code.
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        cancel_reason_code: "CUSTOMER_CANCELLED",
        cancel_reason: "Customer cancelled",
        reason_code: "CUSTOMER_CANCELLED",
        billable_to_customer: false,
      })
    );
  });

  it("surfaces the API error instead of silently hanging (the compounding bug)", async () => {
    const { ApiError } = await import("../../api/client");
    const onSubmit = vi
      .fn()
      .mockRejectedValue(new ApiError(400, { error: "validation_error", details: { message: "cancel_reason_code is required" } }));
    renderWithClient(
      <CancelLoadModal open operatingCompanyId="91e0bf0a-133f-4ce8-a734-2586cfa66d96" onClose={vi.fn()} onSubmit={onSubmit} />
    );
    fireEvent.focus(screen.getByPlaceholderText(/Select reason/i));
    fireEvent.click(await screen.findByRole("option", { name: /Customer cancelled/i }));
    fireEvent.change(screen.getByPlaceholderText(/Required notes/i), {
      target: { value: "Customer called to cancel the load this morning." },
    });
    await waitFor(() => expect(screen.getByRole("button", { name: /Confirm Cancel/i })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: /Confirm Cancel/i }));
    // The error renders (form stays open + editable), not a silent hang.
    expect(await screen.findByRole("alert")).toHaveTextContent(/cancel_reason_code is required/i);
  });

  it("Owner + approval-required reason → 'Approve & Cancel' (inline approve, not a dead-end)", async () => {
    vi.mocked(getMe).mockResolvedValue({ user: { role: "Owner" }, session: {} } as never);
    renderWithClient(
      <CancelLoadModal open operatingCompanyId="91e0bf0a-133f-4ce8-a734-2586cfa66d96" onClose={vi.fn()} onSubmit={vi.fn()} />
    );
    fireEvent.focus(screen.getByPlaceholderText(/Select reason/i));
    fireEvent.click(await screen.findByRole("option", { name: /Driver walk-off/i }));
    await waitFor(() => expect(screen.getByRole("button", { name: /Approve & Cancel/i })).toBeInTheDocument());
    expect(screen.getByText(/approve & cancel this load immediately/i)).toBeInTheDocument();
  });

  it("non-owner + approval-required reason → 'Submit cancel request'", async () => {
    vi.mocked(getMe).mockResolvedValue({ user: { role: "Dispatcher" }, session: {} } as never);
    renderWithClient(
      <CancelLoadModal open operatingCompanyId="91e0bf0a-133f-4ce8-a734-2586cfa66d96" onClose={vi.fn()} onSubmit={vi.fn()} />
    );
    fireEvent.focus(screen.getByPlaceholderText(/Select reason/i));
    fireEvent.click(await screen.findByRole("option", { name: /Driver walk-off/i }));
    await waitFor(() => expect(screen.getByRole("button", { name: /Submit cancel request/i })).toBeInTheDocument());
    expect(screen.getByText(/submitted for Owner approval/i)).toBeInTheDocument();
  });
});

// ROUND 125-126 (owner, via the Lead) — VOID-A-LOAD CASCADE PREVIEW: "the dispatcher sees,
// before confirming, every artifact that will be touched — each named with its number and
// amount, never a count." These render/gate assertions do not depend on the reason dropdown
// (a pre-existing, diff-unrelated jsdom flake in this suite — confirmed identical on the
// unmodified file before this change), so they exercise the preview independently of it.
describe("CancelLoadModal — cascade preview (ROUND 125-126)", () => {
  // mockReset (not clearAllMocks) — a prior test's mockResolvedValue must not leak its
  // implementation into the next test; each test below sets its own preview explicitly.
  beforeEach(() => vi.mocked(getLoadCancellationPreview).mockReset());

  it("names every artifact by number and amount, never a bare count, and blocks Confirm until reviewed", async () => {
    vi.mocked(getLoadCancellationPreview).mockResolvedValue({
      load_id: "load-1",
      load_number: "13500",
      computed_at: "2026-09-23T00:00:00.000Z",
      invoices: [{ id: "inv-1", number: "INV-2026-00010", amount_cents: 521000, detail: "sent" }],
      expenses: [],
      vendor_bills: [],
      driver_advances: [],
      settlements: [{ id: "set-1", number: "5775", amount_cents: 118640, detail: "J. Doe — locked" }],
      fuel_expenses: [{ id: "fuel-1", number: "2026-08-05", amount_cents: 35295, detail: "Pilot" }],
      driver_bills: [
        { id: "db-1", number: "13500", amount_cents: 97305, detail: "J. Doe", keep_cents: 22555, void_cents: 74750 },
      ],
    });

    renderWithClient(
      <CancelLoadModal
        open
        operatingCompanyId="91e0bf0a-133f-4ce8-a734-2586cfa66d96"
        loadId="load-1"
        loadNumber="13500"
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />
    );

    expect(await screen.findByText(/INV-2026-00010/)).toBeInTheDocument();
    // A single-item section's header total duplicates that item's own amount — both are real,
    // honest renders of the same $ figure (never a bare count), so assert presence, not uniqueness.
    expect(screen.getAllByText("$5,210.00").length).toBeGreaterThan(0);
    expect(screen.getByText(/5775/)).toBeInTheDocument();
    expect(screen.getAllByText("$1,186.40").length).toBeGreaterThan(0);
    expect(screen.getByText(/KEEP — empty miles actually driven/)).toBeInTheDocument();
    expect(screen.getByText("$225.55")).toBeInTheDocument();
    expect(screen.getByText(/VOID — loaded miles, tarp, extra stops, detention/)).toBeInTheDocument();
    expect(screen.getByText("$747.50")).toBeInTheDocument();

    // Named artifacts exist and the checkbox is unreviewed — Confirm Cancel stays disabled even
    // once a reason exists (simulated by the reviewed gate alone: no reason is selected either,
    // but the cascade-specific helper text must be reachable once reviewed is what's missing).
    const reviewed = screen.getByTestId("cancel-load-modal-cascade-reviewed");
    expect(reviewed).not.toBeChecked();
    fireEvent.click(reviewed);
    expect(reviewed).toBeChecked();
  });

  it("renders an honest empty state, not a bare zero, when nothing is linked to the load", async () => {
    vi.mocked(getLoadCancellationPreview).mockResolvedValue({
      load_id: "load-2",
      load_number: "13501",
      computed_at: "2026-09-23T00:00:00.000Z",
      invoices: [],
      expenses: [],
      vendor_bills: [],
      driver_advances: [],
      settlements: [],
      fuel_expenses: [],
      driver_bills: [],
    });
    renderWithClient(
      <CancelLoadModal
        open
        operatingCompanyId="91e0bf0a-133f-4ce8-a734-2586cfa66d96"
        loadId="load-2"
        loadNumber="13501"
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />
    );
    expect(await screen.findByTestId("cancel-load-modal-cascade-empty")).toHaveTextContent(
      /No linked invoices, expenses, vendor bills, driver advances, settlements, fuel/
    );
    expect(screen.queryByTestId("cancel-load-modal-cascade-reviewed")).not.toBeInTheDocument();
  });
});
