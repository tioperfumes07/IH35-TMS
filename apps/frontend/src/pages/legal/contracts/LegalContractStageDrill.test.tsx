// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LegalHomeBoard } from "../components/LegalHomeBoard";
import { LegalContractInstancesPage } from "./LegalContractInstancesPage";

const mocks = vi.hoisted(() => ({ list: vi.fn(async () => ({ contracts: [] })) }));
vi.mock("../../../api/legal-contracts", () => ({ legalContractsApi: { list: mocks.list } }));
vi.mock("../../../api/legal-templates", () => ({ legalTemplatesApi: { list: vi.fn(async () => ({ templates: [] })) } }));
vi.mock("../../../api/legal-matters", () => ({ legalMattersApi: { list: vi.fn(async () => ({ matters: [] })) } }));
vi.mock("../../../contexts/CompanyContext", () => ({ useCompanyContext: () => ({ selectedCompanyId: "company-local-fixture" }) }));
vi.mock("../../../components/Toast", () => ({ useToast: () => ({ pushToast: vi.fn() }) }));
vi.mock("../../../hooks/useFeatureFlag", () => ({ useFeatureFlag: () => ({ enabled: false }) }));
vi.mock("./SendContractModal", () => ({ SendContractModal: () => null }));
vi.mock("./LeaseToOwnCreatorModal", () => ({ LeaseToOwnCreatorModal: () => null }));
vi.mock("./TruckLeaseCreatorModal", () => ({ TruckLeaseCreatorModal: () => null }));
vi.mock("./UnifiedContractCreatorModal", () => ({ UnifiedContractCreatorModal: ({ open, onClose }: { open: boolean; onClose: () => void }) => open ? <button onClick={onClose}>Close creator</button> : null }));

function LocationProbe() {
  const location = useLocation();
  const navigate = useNavigate();
  return <><output data-testid="location">{location.search}</output><button onClick={() => navigate(-1)}>History back</button></>;
}
function mount(initialEntries = ["/legal"]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={initialEntries}>
    <LocationProbe />
    <Routes>
      <Route path="/legal" element={<LegalHomeBoard companyId="company-local-fixture" />} />
      <Route path="/legal/contracts" element={<LegalContractInstancesPage />} />
    </Routes>
  </MemoryRouter></QueryClientProvider>);
}
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("Legal pipeline stage routes drive the canonical list query", () => {
  it("opening and closing the creator preserves the stage and signer scope", async () => {
    const user = userEvent.setup();
    mount(["/legal/contracts?status=draft&signer_type=driver&signer_entity_id=local-driver"]);
    await waitFor(() => expect(mocks.list).toHaveBeenLastCalledWith(expect.objectContaining({ status: "draft" })));
    await user.click(screen.getByRole("button", { name: /^\+ Create$/ }));
    expect(screen.getByTestId("location")).toHaveTextContent("status=draft");
    await user.click(screen.getByRole("button", { name: "Close creator" }));
    expect(screen.getByTestId("location")).toHaveTextContent("status=draft");
    expect(screen.getByTestId("location")).toHaveTextContent("signer_entity_id=local-driver");
    expect(screen.getByTestId("location")).not.toHaveTextContent("openCreate");
    expect(mocks.list).toHaveBeenLastCalledWith(expect.objectContaining({ status: "draft", signer_entity_id: "local-driver" }));
  });
  it.each([
    ["Draft", "draft"], ["Out for signature", "sent,viewed"],
    ["Signed", "signed_electronically"], ["Voided", "voided"],
  ])("%s filters the API before pagination", async (label, status) => {
    const user = userEvent.setup(); mount();
    await user.click(await screen.findByRole("link", { name: new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`) }));
    await waitFor(() => expect(mocks.list).toHaveBeenLastCalledWith(expect.objectContaining({ status, operating_company_id: "company-local-fixture" })));
  });

  it("Reset/Apply clears a deep-linked status, preserves signer scope, and Back restores status", async () => {
    const user = userEvent.setup();
    mount(["/legal/contracts?status=sent&status=viewed&signer_type=driver&signer_entity_id=local-driver"]);
    await waitFor(() => expect(mocks.list).toHaveBeenLastCalledWith(expect.objectContaining({ status: "sent,viewed", signer_type: "driver", signer_entity_id: "local-driver" })));
    await user.click(screen.getByRole("button", { name: /^Filters/ }));
    await user.click(screen.getByRole("button", { name: /^Reset$/ }));
    await user.click(screen.getByRole("button", { name: /^Apply$/ }));
    await waitFor(() => expect(mocks.list).toHaveBeenLastCalledWith(expect.objectContaining({ status: undefined, signer_entity_id: "local-driver" })));
    expect(screen.getByTestId("location")).not.toHaveTextContent("status=");
    await user.click(screen.getByRole("button", { name: "History back" }));
    await waitFor(() => expect(mocks.list).toHaveBeenLastCalledWith(expect.objectContaining({ status: "sent,viewed" })));
  });
});
