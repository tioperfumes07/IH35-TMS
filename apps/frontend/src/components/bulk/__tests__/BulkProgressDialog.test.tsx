import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BulkProgressDialog } from "../BulkProgressDialog";

function wrap(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{ui}</QueryClientProvider>;
}

describe("BulkProgressDialog", () => {
  it("shows succeeded and failed counts", () => {
    render(
      wrap(
        <BulkProgressDialog
          open
          requested={5}
          succeeded={3}
          failed={[
            { id: "id-1", message: "Invalid state" },
            { id: "id-2", message: "Permission denied" },
          ]}
          bulk_call_id="bulk-123"
          onClose={vi.fn()}
        />
      )
    );
    expect(screen.getByText((_, el) => el?.textContent === "3 of 5 succeeded; 2 failed")).toBeTruthy();
    expect(screen.getByText(/Invalid state/)).toBeTruthy();
    expect(screen.getByText(/bulk-123/)).toBeTruthy();
  });

  it("calls onClose", () => {
    const onClose = vi.fn();
    render(
      wrap(
        <BulkProgressDialog open requested={1} succeeded={1} failed={[]} onClose={onClose} />
      )
    );
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
