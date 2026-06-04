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

  it("does not wrap body in nested card chrome (no inner modal frame)", () => {
    renderModal();
    const panel = document.body.querySelector("[class*='shadow-xl']");
    expect(panel).toBeTruthy();
    const nestedFrames = panel?.querySelectorAll(".rounded.border.border-gray-200.bg-gray-50");
    expect(nestedFrames?.length ?? 0).toBe(0);
  });
});
