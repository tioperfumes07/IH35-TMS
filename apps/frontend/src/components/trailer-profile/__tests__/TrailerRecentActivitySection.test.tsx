import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import * as clientApi from "../../../api/client";
import * as docsApi from "../../../api/docs";
import { TrailerRecentActivitySection } from "../TrailerRecentActivitySection";

const companyId = "91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071";
const equipmentId = "eq-trailer-1";

function renderSection() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <TrailerRecentActivitySection equipmentId={equipmentId} companyId={companyId} />
    </QueryClientProvider>
  );
}

describe("TrailerRecentActivitySection — trailer WO history (B26)", () => {
  beforeEach(() => {
    vi.spyOn(clientApi, "apiRequest").mockImplementation(async (url: string) => {
      if (url.includes("/api/v1/maintenance/work-orders")) {
        return {
          work_orders: [{ id: "wo-1", display_id: "WO-100", status: "open", equipment_id: equipmentId }],
          total_count: 1,
        };
      }
      return { equipment_log: [] };
    });
    vi.spyOn(docsApi, "listFiles").mockResolvedValue({ files: [], total: 0, limit: 10, offset: 0 });
  });

  it("requests work orders filtered by equipment_id", async () => {
    renderSection();
    await waitFor(() => {
      expect(clientApi.apiRequest).toHaveBeenCalledWith(
        expect.stringContaining(`equipment_id=${encodeURIComponent(equipmentId)}`)
      );
    });
  });

  it("renders trailer work orders without requiring attached truck", async () => {
    renderSection();
    expect(await screen.findByText("WO-100 · open")).toBeTruthy();
    expect(screen.queryByText("No truck attached.")).toBeNull();
  });
});
