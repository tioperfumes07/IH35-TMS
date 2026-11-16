import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BulkActionModal } from "../BulkActionModal";

// The reason step is the shared VoidReasonModal: it reads the selected company and the signed-in role, and lists the
// catalog of void/cancel reasons. With no catalog rows it takes a typed reason (the path these tests drive).
vi.mock("../../../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({ selectedCompanyId: "co-1" }),
}));
vi.mock("../../../auth/useAuth", () => ({ useAuth: () => ({ user: { role: "Owner" } }) }));
vi.mock("../../../api/catalogs", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../api/catalogs")>()),
  listVoidCancelReasons: vi.fn(async () => ({ reasons: [] })),
}));

function wrap(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{ui}</QueryClientProvider>;
}

function openReasonStep(onConfirm: ReturnType<typeof vi.fn>, affectedCount = 5) {
  render(
    wrap(
      <BulkActionModal open actionLabel="Archive" affectedCount={affectedCount} requiresReason onConfirm={onConfirm} onCancel={vi.fn()} />,
    ),
  );
  fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
}

describe("BulkActionModal", () => {
  it("requires a reason of at least 10 characters before the action can run", async () => {
    const onConfirm = vi.fn();
    openReasonStep(onConfirm);
    const reason = await screen.findByRole("textbox");
    fireEvent.change(reason, { target: { value: "too short" } });
    const submit = screen.getByRole("button", { name: "Archive" });
    expect(submit).toBeDisabled();
    expect(screen.getByText(/Add 1 more character\(s\)/)).toBeTruthy();
    fireEvent.click(submit);
    expect(onConfirm).not.toHaveBeenCalled();
    // A bulk status change is not a void — no reversing-entry warning.
    expect(screen.queryByText(/reversing entry/i)).toBeNull();
  });

  it("calls onConfirm with the reason once it is long enough", async () => {
    const onConfirm = vi.fn();
    openReasonStep(onConfirm, 2);
    fireEvent.change(await screen.findByRole("textbox"), { target: { value: "Annual cleanup for inactive vendors" } });
    fireEvent.click(screen.getByRole("button", { name: "Archive" }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith({ reason: "Annual cleanup for inactive vendors" }));
  });
});
