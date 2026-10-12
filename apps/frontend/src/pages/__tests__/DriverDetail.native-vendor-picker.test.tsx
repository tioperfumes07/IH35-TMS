import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as clientApi from "../../api/client";
import * as mdataApi from "../../api/mdata";
import { ToastProvider } from "../../components/Toast";
import { DriverDetailPage } from "../DriverDetail";

const COMPANY = "22222222-2222-4222-8222-222222222222";
const DRIVER = "33333333-3333-4333-8333-333333333333";
const OLD_VENDOR = "44444444-4444-4444-8444-444444444444";
const NEW_VENDOR = "55555555-5555-4555-8555-555555555555";

vi.mock("../../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({ selectedCompanyId: COMPANY, selectedCompany: { id: COMPANY, code: "USMCA" }, isLoading: false }),
}));

vi.mock("../../auth/useAuth", () => ({
  useAuth: () => ({ user: { uuid: "u-1", role: "Owner" }, isLoading: false }),
}));

// The whole-profile summary has its own aggregate fetch and its own tests; it is not under test here.
vi.mock("../../components/driver-profile/DriverWholeProfile", () => ({ DriverWholeProfile: () => null }));

vi.mock("../../api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api/client")>();
  return { ...actual, apiRequest: vi.fn() };
});

vi.mock("../../api/mdata", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api/mdata")>();
  return {
    ...actual,
    getDriver: vi.fn(),
    getDriverApVendor: vi.fn(),
    updateVendor: vi.fn(),
    updateDriver: vi.fn(),
    listVendors: vi.fn(),
  };
});

const driverFixture = {
  id: DRIVER,
  operating_company_id: COMPANY,
  first_name: "Ana",
  last_name: "Lopez",
  status: "Active",
  qbo_vendor_id: null,
  qbo_class_id: null,
  preferred_language: "en",
};

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <MemoryRouter initialEntries={[`/drivers/${DRIVER}/record?tab=profile`]}>
          <Routes>
            <Route path="/drivers/:id/record" element={<DriverDetailPage />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe("DriverDetail — vendor is the native A/P payee picker, never a QBO picker (443.137 9e)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Every other section of this page reads its own endpoint; answer each with an empty list so the
    // page renders whole. ("then" stays undefined so the value is not mistaken for a thenable.)
    const emptyLists = new Proxy({}, { get: (_t, prop) => (prop === "then" ? undefined : []) });
    vi.mocked(clientApi.apiRequest).mockResolvedValue(emptyLists);
    vi.mocked(mdataApi.getDriver).mockResolvedValue(driverFixture as never);
    vi.mocked(mdataApi.getDriverApVendor).mockResolvedValue({
      vendor: { id: OLD_VENDOR, name: "Ana Lopez (driver)", qbo_vendor_id: null, operating_company_id: COMPANY, driver_id: DRIVER },
    });
    vi.mocked(mdataApi.listVendors).mockResolvedValue({
      vendors: [
        { id: OLD_VENDOR, name: "Ana Lopez (driver)", vendor_type: "Driver" },
        { id: NEW_VENDOR, name: "Ana Lopez LLC", vendor_type: "Driver" },
      ],
    } as never);
    vi.mocked(mdataApi.updateVendor).mockResolvedValue({} as never);
    vi.mocked(mdataApi.updateDriver).mockResolvedValue(driverFixture as never);
  });

  it("renders the canonical vendor picker with the linked payee and no QuickBooks search box", async () => {
    renderPage();
    const field = await screen.findByTestId("driver-ap-vendor-select");
    expect(within(field).getByText("A/P vendor (driver payee)")).toBeInTheDocument();
    expect(await within(field).findByDisplayValue("Ana Lopez (driver)")).toBeInTheDocument();
    expect(screen.queryByText("QBO vendor")).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/search QuickBooks/i)).not.toBeInTheDocument();
  });

  it("relinks the payee on mdata.vendors.driver_id and never writes qbo_vendor_id", async () => {
    renderPage();
    const field = await screen.findByTestId("driver-ap-vendor-select");
    const input = await within(field).findByDisplayValue("Ana Lopez (driver)");
    fireEvent.focus(input);
    fireEvent.click(input);
    fireEvent.click(await screen.findByRole("option", { name: /Ana Lopez LLC/ }));
    fireEvent.click(screen.getByRole("button", { name: "Save vendor & class" }));

    await waitFor(() => expect(mdataApi.updateDriver).toHaveBeenCalledTimes(1));
    expect(vi.mocked(mdataApi.updateVendor).mock.calls).toEqual([
      [OLD_VENDOR, { driver_id: null }],
      [NEW_VENDOR, { driver_id: DRIVER }],
    ]);
    const driverPatch = vi.mocked(mdataApi.updateDriver).mock.calls[0]?.[1] as Record<string, unknown>;
    expect(driverPatch).not.toHaveProperty("qbo_vendor_id");
    expect(driverPatch).toEqual({ qbo_class_id: null });
  });

  it("restores the previous payee when linking the new vendor fails", async () => {
    vi.mocked(mdataApi.updateVendor).mockImplementation(async (id: string, body: { driver_id?: string | null }) => {
      if (id === NEW_VENDOR) throw new Error("mdata_vendor_conflict");
      return { id, ...body } as never;
    });
    renderPage();
    const field = await screen.findByTestId("driver-ap-vendor-select");
    const input = await within(field).findByDisplayValue("Ana Lopez (driver)");
    fireEvent.focus(input);
    fireEvent.click(input);
    fireEvent.click(await screen.findByRole("option", { name: /Ana Lopez LLC/ }));
    fireEvent.click(screen.getByRole("button", { name: "Save vendor & class" }));

    await waitFor(() => expect(mdataApi.updateVendor).toHaveBeenCalledTimes(3));
    expect(vi.mocked(mdataApi.updateVendor).mock.calls).toEqual([
      [OLD_VENDOR, { driver_id: null }],
      [NEW_VENDOR, { driver_id: DRIVER }],
      [OLD_VENDOR, { driver_id: DRIVER }],
    ]);
    expect(mdataApi.updateDriver).not.toHaveBeenCalled();
  });
});
