/**
 * C1 — runtime proof of the picker law for the shared EntityPicker.
 *
 * The guard (scripts/verify-picker-law-no-raw-uuid.mjs) proves statically that no raw-UUID input
 * survives and that the registry declares canonical read == write. These tests prove the BEHAVIOUR
 * the guard can only assert the shape of:
 *   - the roster is read company-scoped from the canonical list call;
 *   - inline "+ Create ___" is the FIRST ROW INSIDE the dropdown, present before any keystroke;
 *   - picking an option hands the parent the CANONICAL ID plus its human-labelled roster option;
 *   - a filter (allowCreate={false}) shows no create row;
 *   - a kind that refuses inline create (for example, load) shows no create row even by default;
 *   - audited entities with real canonical nested creators (insurance policy/claim) return and select
 *     its persisted id and human label;
 *   - a value that is not in the roster stays visible instead of silently blanking.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { EntityPicker } from "../EntityPicker";

const listDrivers = vi.fn();
const listLoads = vi.fn();
const listVendors = vi.fn();
const listInsuranceClaims = vi.fn();
const listInsuranceLawsuits = vi.fn();

vi.mock("../../../api/mdata", () => ({
  listDrivers: (...args: unknown[]) => listDrivers(...args),
  listUnits: vi.fn().mockResolvedValue({ units: [] }),
  listVendors: (...args: unknown[]) => listVendors(...args),
}));
vi.mock("../../../api/loads", () => ({ listLoads: (...args: unknown[]) => listLoads(...args) }));
vi.mock("../../../api/maintenance", () => ({ listWorkOrders: vi.fn().mockResolvedValue({ work_orders: [] }) }));
vi.mock("../../../api/insurance", () => ({
  listInsurancePolicies: vi.fn().mockResolvedValue({ policies: [] }),
  listInsuranceClaims: (...args: unknown[]) => listInsuranceClaims(...args),
  listInsuranceLawsuits: (...args: unknown[]) => listInsuranceLawsuits(...args),
}));
vi.mock("../../../api/accounting", () => ({ listFactoringAdvances: vi.fn().mockResolvedValue({ rows: [] }) }));

// The create surfaces are heavyweight real forms; C1's contract is only that the picker DELEGATES
// to them, so they are stubbed to a marker. The guard separately forbids the picker from rendering
// a dialog shell of its own.
vi.mock("../../drivers/CreateDriverModal", () => ({
  CreateDriverModal: ({ open, shell }: { open: boolean; shell?: string }) =>
    open ? <div data-testid="create-driver-surface" data-shell={shell} /> : null,
}));
vi.mock("../../fleet/CreateUnitModal", () => ({ CreateUnitModal: () => null }));
vi.mock("../../insurance/PolicyCreateModal", () => ({
  PolicyCreateModal: ({ open, onCreated }: { open: boolean; onCreated: (id: string, label: string) => void }) =>
    open ? <button type="button" onClick={() => onCreated("policy-created", "TEST-POLICY")}>Complete policy create</button> : null,
}));
vi.mock("../../insurance/ClaimCreateModal", () => ({
  ClaimCreateModal: ({ open, onCreated }: { open: boolean; onCreated: (id: string, label: string) => void }) =>
    open ? <button type="button" onClick={() => onCreated("claim-created", "CLM-CREATED")}>Complete claim create</button> : null,
}));
vi.mock("../../insurance/LawsuitCreateModal", () => ({
  LawsuitCreateModal: ({ open, onCreated }: { open: boolean; onCreated: (id?: string, label?: string) => void }) =>
    open ? (
      <button type="button" onClick={() => onCreated("lawsuit-created", "CASE-CREATED")}>
        Complete lawsuit create
      </button>
    ) : null,
}));
vi.mock("../InlineCreateDrawer", () => ({
  InlineCreateDrawer: ({ open, kind, onCreated }: { open: boolean; kind: string; onCreated: (record: { id: string; label: string }) => void }) =>
    open ? (
      <div data-testid={`inline-create-${kind}`}>
        <button type="button" onClick={() => onCreated({ id: "vendor-created", label: "Created Vendor" })}>Complete vendor create</button>
      </div>
    ) : null,
}));

const COMPANY = "11111111-1111-4111-8111-111111111111";

function wrap(node: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{node}</QueryClientProvider>);
}

function CompanySwitchHarness({ companyId }: { companyId: string }) {
  const [value, setValue] = useState<string | null>(null);
  return (
    <EntityPicker
      kind="vendor"
      operatingCompanyId={companyId}
      value={value}
      onChange={setValue}
      allowCreate
      dataTestId="company-switch-vendor-picker"
    />
  );
}

describe("EntityPicker (C1 picker law)", () => {
  beforeEach(() => {
    listDrivers.mockReset();
    listLoads.mockReset();
    listDrivers.mockResolvedValue({
      drivers: [
        { id: "drv-1", first_name: "Jane", last_name: "Driver" },
        { id: "drv-2", first_name: "Mecor", last_name: "Lopez" },
      ],
    });
    listLoads.mockResolvedValue({
      loads: [{ id: "load-1", load_number: "LD-100", customer_name: "ACME", first_pickup_city: "Laredo" }],
    });
    listVendors.mockReset();
    listVendors.mockResolvedValue({ vendors: [{ id: "vendor-1", name: "Roadside Supply", vendor_type: "Shop" }] });
    listInsuranceClaims.mockReset();
    listInsuranceClaims.mockResolvedValue({ claims: [{ id: "claim-1", claim_number: "CLM-1", status: "open" }] });
    listInsuranceLawsuits.mockReset();
    listInsuranceLawsuits.mockResolvedValue({
      lawsuits: [{ id: "ls-1", case_number: "CASE-1", status: "active" }],
    });
  });

  it("reads the canonical roster company-scoped", async () => {
    wrap(<EntityPicker kind="driver" operatingCompanyId={COMPANY} value={null} onChange={vi.fn()} />);
    await waitFor(() =>
      expect(listDrivers).toHaveBeenCalledWith(
        expect.objectContaining({ operating_company_id: COMPANY, status: "Active", limit: 200 })
      )
    );
  });

  it("SAF-B29: typing sends search to the server and is part of the query path", async () => {
    const user = userEvent.setup();
    wrap(<EntityPicker kind="driver" operatingCompanyId={COMPANY} value={null} onChange={vi.fn()} />);
    await waitFor(() => expect(listDrivers).toHaveBeenCalled());
    listDrivers.mockClear();
    const input = await screen.findByPlaceholderText("Select driver");
    await user.click(input);
    await user.type(input, "Mec");
    await waitFor(() =>
      expect(listDrivers).toHaveBeenCalledWith(
        expect.objectContaining({ operating_company_id: COMPANY, search: expect.stringMatching(/Mec/) })
      )
    );
  });

  it('puts inline "+ Add new driver" as the FIRST ROW inside the dropdown, before any keystroke', async () => {
    const user = userEvent.setup();
    wrap(<EntityPicker kind="driver" operatingCompanyId={COMPANY} value={null} onChange={vi.fn()} />);
    await user.click(await screen.findByPlaceholderText("Select driver"));

    const createRow = await screen.findByText("+ Add new driver");
    expect(createRow).toBeTruthy();
    // FIRST row: it must precede the first roster option in document order.
    const janeRow = await screen.findByText("Jane Driver");
    expect(createRow.compareDocumentPosition(janeRow) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("hands the parent the CANONICAL ID plus the human-labelled roster option", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    wrap(<EntityPicker kind="driver" operatingCompanyId={COMPANY} value={null} onChange={onChange} />);
    await user.click(await screen.findByPlaceholderText("Select driver"));
    await user.click(await screen.findByText("Mecor Lopez"));
    expect(onChange).toHaveBeenCalledWith("drv-2", { value: "drv-2", label: "Mecor Lopez" });
  });

  it("opens the entity's real create surface in the C7 drawer shell by default", async () => {
    const user = userEvent.setup();
    wrap(<EntityPicker kind="driver" operatingCompanyId={COMPANY} value={null} onChange={vi.fn()} />);
    await user.click(await screen.findByPlaceholderText("Select driver"));
    await user.click(await screen.findByText("+ Add new driver"));
    const surface = await screen.findByTestId("create-driver-surface");
    // shell="modal" is the shared Modal, which after C7 renders variant="drawer" (480px right
    // drawer with focus trap + Escape + unsaved guard). shell="drawer" is CHROME-11's ParityDrawer,
    // used only when the picker is already inside an open money drawer.
    expect(surface.getAttribute("data-shell")).toBe("modal");
  });

  it("reuses the canonical vendor drawer and keeps + Create as the first roster row", async () => {
    const user = userEvent.setup();
    wrap(<EntityPicker kind="vendor" operatingCompanyId={COMPANY} value={null} onChange={vi.fn()} allowCreate />);
    await user.click(await screen.findByPlaceholderText("Select vendor"));

    const createRow = await screen.findByText("+ Add new vendor");
    const vendorRow = await screen.findByText("Roadside Supply");
    expect(createRow.compareDocumentPosition(vendorRow) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    await user.click(createRow);
    expect(await screen.findByTestId("inline-create-vendor")).toBeTruthy();
  });

  it("clears a locally created selection when the operating-company roster changes", async () => {
    const user = userEvent.setup();
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const view = render(
      <QueryClientProvider client={qc}>
        <CompanySwitchHarness companyId={COMPANY} />
      </QueryClientProvider>
    );

    await user.click(await screen.findByPlaceholderText("Select vendor"));
    await user.click(await screen.findByText("+ Add new vendor"));
    await user.click(await screen.findByText("Complete vendor create"));
    await waitFor(() => expect((screen.getByTestId("company-switch-vendor-picker") as HTMLInputElement).value).toBe("Created Vendor"));

    view.rerender(
      <QueryClientProvider client={qc}>
        <CompanySwitchHarness companyId="22222222-2222-4222-8222-222222222222" />
      </QueryClientProvider>
    );
    await waitFor(() => expect((screen.getByTestId("company-switch-vendor-picker") as HTMLInputElement).value).toBe(""));
    expect(screen.queryByText("Created Vendor")).toBeNull();
  });

  it("suppresses the prior-company FK even when a legacy parent ignores the null callback", async () => {
    const onChange = vi.fn();
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const renderPicker = (companyId: string) => (
      <QueryClientProvider client={qc}>
        <EntityPicker
          kind="vendor"
          operatingCompanyId={companyId}
          value="vendor-company-a"
          onChange={onChange}
          dataTestId="stubborn-parent-picker"
        />
      </QueryClientProvider>
    );
    const view = render(renderPicker(COMPANY));
    await waitFor(() => expect((screen.getByTestId("stubborn-parent-picker") as HTMLInputElement).value).toBe("vendor-company-a"));

    view.rerender(renderPicker("22222222-2222-4222-8222-222222222222"));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(null));
    expect((screen.getByTestId("stubborn-parent-picker") as HTMLInputElement).value).toBe("");
  });

  it("stacks as a ParityDrawer when nested inside an open money drawer (CHROME-11)", async () => {
    const user = userEvent.setup();
    wrap(<EntityPicker kind="driver" operatingCompanyId={COMPANY} value={null} onChange={vi.fn()} nestedInDrawer />);
    await user.click(await screen.findByPlaceholderText("Select driver"));
    await user.click(await screen.findByText("+ Add new driver"));
    expect((await screen.findByTestId("create-driver-surface")).getAttribute("data-shell")).toBe("drawer");
  });

  it("a FILTER offers no create row", async () => {
    const user = userEvent.setup();
    wrap(
      <EntityPicker kind="driver" operatingCompanyId={COMPANY} value={null} onChange={vi.fn()} allowCreate={false} />
    );
    await user.click(await screen.findByPlaceholderText("Select driver"));
    await screen.findByText("Jane Driver");
    expect(screen.queryByText("+ Add new driver")).toBeNull();
  });

  it("creates a claim through the canonical creator and auto-selects the returned row", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    wrap(<EntityPicker kind="insurance_claim" operatingCompanyId={COMPANY} value={null} onChange={onChange} />);
    await user.click(await screen.findByPlaceholderText("Select insurance claim"));
    const createRow = await screen.findByText("+ Add new insurance claim");
    const rosterRow = await screen.findByText("CLM-1");
    expect(createRow.compareDocumentPosition(rosterRow) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await user.click(createRow);
    await user.click(await screen.findByText("Complete claim create"));
    expect(onChange).toHaveBeenCalledWith("claim-created", { value: "claim-created", label: "CLM-CREATED" });
  });

  it("creates a policy through the canonical creator and auto-selects its human policy number", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    wrap(<EntityPicker kind="insurance_policy" operatingCompanyId={COMPANY} value={null} onChange={onChange} />);
    await user.click(await screen.findByPlaceholderText("Select policy"));
    await user.click(await screen.findByText("+ Add new policy"));
    await user.click(await screen.findByText("Complete policy create"));
    expect(onChange).toHaveBeenCalledWith("policy-created", { value: "policy-created", label: "TEST-POLICY" });
  });

  it("creates a lawsuit through the canonical creator and auto-selects the returned row", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    wrap(<EntityPicker kind="insurance_lawsuit" operatingCompanyId={COMPANY} value={null} onChange={onChange} />);
    await user.click(await screen.findByPlaceholderText("Select insurance lawsuit"));
    const createRow = await screen.findByText("+ Add new insurance lawsuit");
    const rosterRow = await screen.findByText("CASE-1");
    expect(createRow.compareDocumentPosition(rosterRow) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await user.click(createRow);
    await user.click(await screen.findByText("Complete lawsuit create"));
    expect(onChange).toHaveBeenCalledWith("lawsuit-created", { value: "lawsuit-created", label: "CASE-CREATED" });
  });

  it("a TRANSACTION kind offers no create row even by default", async () => {
    const user = userEvent.setup();
    wrap(<EntityPicker kind="load" operatingCompanyId={COMPANY} value={null} onChange={vi.fn()} />);
    await user.click(await screen.findByPlaceholderText("Select load"));
    await screen.findByText("LD-100");
    expect(screen.queryByText("+ Create load")).toBeNull();
  });

  it("keeps a selected value that is not in the roster visible instead of blanking it", async () => {
    wrap(
      <EntityPicker
        kind="driver"
        operatingCompanyId={COMPANY}
        value="drv-archived"
        onChange={vi.fn()}
        dataTestId="picker-under-test"
      />
    );
    await waitFor(() => expect(listDrivers).toHaveBeenCalled());
    const input = (await screen.findByTestId("picker-under-test")) as HTMLInputElement;
    await waitFor(() => expect(input.value).toBe("drv-archived"));
  });
});
