import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as clientApi from "../../../api/client";
import { ToastProvider } from "../../../components/Toast";
import { QboVendorLinkagePage } from "../QboVendorLinkagePage";

// 443.137 9e part 2 (#26732): the QBO vendor/class link + unlink routes always answer 409
// QBO_NATIVE_WRITE_REFUSED. The page must show the archive linkage with no write action at all.
vi.mock("../../../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({ selectedCompanyId: "11111111-1111-4111-8111-111111111111" }),
}));
vi.mock("../../../auth/useAuth", () => ({ useAuth: () => ({ user: { uuid: "u", role: "Owner" } }) }));
vi.mock("../../../api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../api/client")>();
  return { ...actual, apiRequest: vi.fn() };
});

function renderPage(path = "/admin/qbo-vendor-linkage") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <MemoryRouter initialEntries={[path]}>
          <QboVendorLinkagePage />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe("QboVendorLinkagePage — read-only QBO linkage archive (443.137 9e)", () => {
  beforeEach(() => {
    vi.mocked(clientApi.apiRequest).mockReset();
    vi.mocked(clientApi.apiRequest).mockImplementation(async (path: string) => {
      if (path.includes("qbo-mapping-status")) {
        return { rows: [{ id: "d1", first_name: "Ana", last_name: "Lopez", qbo_vendor_id: null, linked: false }] };
      }
      if (path.includes("/units")) return { units: [{ id: "u1", unit_number: "T-501", qbo_class_id: null }] };
      return { classes: [] };
    });
  });

  it("drivers and assets tabs show no link / auto-link / edit-linkage action", async () => {
    renderPage();
    expect(await screen.findByText(/Lopez, Ana/)).toBeInTheDocument();
    expect(screen.getByTestId("qbo-vendor-linkage-read-only")).toHaveTextContent(/read-only archive/i);
    expect(screen.queryByRole("button", { name: /Link to Existing|Edit Linkage|Auto-Link/i })).toBeNull();
    expect(screen.queryByText("Actions")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Assets" }));
    expect(await screen.findByText("T-501")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Link to Existing/i })).toBeNull();

    for (const call of vi.mocked(clientApi.apiRequest).mock.calls) {
      expect(String(call[0])).not.toMatch(/link-qbo-|vendor-link(?!age)/);
    }
  });
});
