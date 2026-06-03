import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WorkOrderDetailModal } from "../WorkOrderDetailModal";

function renderModal() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <WorkOrderDetailModal
        open
        workOrder={{
          display_id: "WO-2026-001",
          source_type: "IS",
          status: "open",
          opened_at: "2026-06-01T12:00:00Z",
        }}
        onClose={vi.fn()}
      />
    </QueryClientProvider>
  );
}

describe("WorkOrderDetailModal", () => {
  it("renders exactly one h2 element (Modal title only, no doubled header)", () => {
    renderModal();
    expect(document.body.querySelectorAll("h2")).toHaveLength(1);
  });
});
