import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BulkActionModal } from "../BulkActionModal";

function wrap(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{ui}</QueryClientProvider>;
}

describe("BulkActionModal", () => {
  it("requires reason with at least 10 characters", () => {
    const onConfirm = vi.fn();
    render(
      wrap(
        <BulkActionModal
          open
          actionLabel="Archive"
          affectedCount={5}
          requiresReason
          onConfirm={onConfirm}
          onCancel={vi.fn()}
        />
      )
    );
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "too short" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByText(/at least 10 characters/i)).toBeTruthy();
  });

  it("calls onConfirm when reason is valid", () => {
    const onConfirm = vi.fn();
    render(
      wrap(
        <BulkActionModal
          open
          actionLabel="Archive"
          affectedCount={2}
          requiresReason
          onConfirm={onConfirm}
          onCancel={vi.fn()}
        />
      )
    );
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "Annual cleanup for inactive vendors" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect(onConfirm).toHaveBeenCalledWith({
      reason: "Annual cleanup for inactive vendors",
    });
  });
});
