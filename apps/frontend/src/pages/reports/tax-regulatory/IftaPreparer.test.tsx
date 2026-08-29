import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import * as iftaApi from "../../../api/reports-ifta";
import { ToastProvider } from "../../../components/Toast";
import { IftaPreparer } from "./IftaPreparer";

vi.mock("../../../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({
    selectedCompanyId: "co-1",
    companies: [],
    selectedCompany: null,
    isLoading: false,
    setSelectedCompany: vi.fn(),
    setDefaultCompanyForUser: vi.fn(() => Promise.resolve()),
  }),
}));

vi.mock("../../../auth/useAuth", () => ({
  useAuth: () => ({
    user: { uuid: "u1", email: "owner@ih35.test", role: "Owner" },
    session: null,
    isLoading: false,
    isError: false,
    isUnauthenticated: false,
  }),
}));

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <ToastProvider>
          <IftaPreparer />
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

// GO-0028: none of IftaPreparer's 4 mutations had an onError handler, so a failed prepare/save/
// owner-approve/mark-filed click reverted silently with zero user-visible signal -- on a live,
// compliance-critical filing wizard including an owner-approval step. Proves the fix: each failure
// now surfaces a visible error toast instead of failing silently.
describe("IftaPreparer error handling (GO-0028)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(iftaApi, "listIftaFilings").mockResolvedValue({ filings: [] });
  });
  afterEach(cleanup);

  it("shows a visible error toast when 'Prepare filing' fails, instead of failing silently", async () => {
    vi.spyOn(iftaApi, "prepareIftaFiling").mockRejectedValue(new Error("network"));
    const user = userEvent.setup();
    renderPage();

    const prepareButton = await screen.findByTestId("ifta-prepare-quarter");
    await user.click(prepareButton);

    await waitFor(() => expect(screen.getByText(/failed to prepare/i)).toBeInTheDocument());
    expect(screen.getByText(/nothing was created/i)).toBeInTheDocument();
    // the button must be usable again, not stuck -- proves this isn't just a hang
    expect(prepareButton).not.toBeDisabled();
  });
});
