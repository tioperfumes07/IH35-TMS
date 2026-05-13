import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { VendorsPage } from "../../Vendors";

vi.mock("../../../api/mdata", () => ({
  listVendors: vi.fn().mockResolvedValue({ vendors: [] }),
}));

function wrap() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <VendorsPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("VendorsPage", () => {
  it("does not ship an inline vendor create modal (list + drill-in only)", async () => {
    wrap();
    expect(screen.queryByRole("button", { name: /\+ Create Vendor/i })).toBeNull();
    expect(screen.queryByRole("heading", { name: /create vendor/i })).toBeNull();
  });
});
