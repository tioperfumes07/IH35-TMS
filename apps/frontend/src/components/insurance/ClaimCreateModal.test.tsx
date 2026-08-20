import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "../Toast";
import { ClaimCreateModal } from "./ClaimCreateModal";

/**
 * WIZARD-CLAIM-ECONOMICS-DEPTH slice 2 — light render test. Verifies the new economics fields
 * (fault, driver_responsible, trailer, deductible, recovery_rail, repair_books_treatment) are on
 * screen, and that owner locks #1/#2 (2026-07-22) hold: recovery_rail + repair_books_treatment
 * ALWAYS default to "ask" — never auto-advanced past it.
 */

const insuranceMocks = {
  listInsurancePolicies: vi.fn().mockResolvedValue({
    policies: [{ id: "policy-1", policy_number: "POL-1", insurer_name: "Acme Insurer" }],
  }),
  create: vi.fn().mockResolvedValue({ id: "claim-1" }),
};

vi.mock("../../api/insurance", async () => {
  const actual = await vi.importActual<typeof import("../../api/insurance")>("../../api/insurance");
  return {
    ...actual,
    listInsurancePolicies: (...args: unknown[]) => insuranceMocks.listInsurancePolicies(...args),
    insuranceClaimsApi: { ...actual.insuranceClaimsApi, create: (...args: unknown[]) => insuranceMocks.create(...args) },
  };
});

vi.mock("../../api/mdata", async () => {
  const actual = await vi.importActual<typeof import("../../api/mdata")>("../../api/mdata");
  return {
    ...actual,
    listUnits: vi.fn().mockResolvedValue({
      units: [{ id: "trailer-1", unit_number: "TRL-1", kind: "trailer" }],
    }),
    listDrivers: vi.fn().mockResolvedValue({ drivers: [] }),
  };
});

vi.mock("../../api/loads", async () => {
  const actual = await vi.importActual<typeof import("../../api/loads")>("../../api/loads");
  return { ...actual, listLoads: vi.fn().mockResolvedValue({ loads: [] }) };
});

vi.mock("../../api/safety", async () => {
  const actual = await vi.importActual<typeof import("../../api/safety")>("../../api/safety");
  return { ...actual, getSafetyAccidents: vi.fn().mockResolvedValue({ accidents: [] }) };
});

function wrap(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <ToastProvider>{ui}</ToastProvider>
      </QueryClientProvider>
    </MemoryRouter>
  );
}

describe("ClaimCreateModal — claim economics slice 2", () => {
  const defaultProps = {
    open: true,
    operatingCompanyId: "91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071",
    onClose: vi.fn(),
    onCreated: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders fault, driver_responsible, trailer, deductible, recovery_rail, repair_books fields", () => {
    render(wrap(<ClaimCreateModal {...defaultProps} />));
    expect(screen.getByTestId("claim-create-fault-field")).toBeInTheDocument();
    expect(screen.getByTestId("claim-create-driver-responsible-field")).toBeInTheDocument();
    expect(screen.getByTestId("claim-create-trailer-field")).toBeInTheDocument();
    expect(screen.getByLabelText(/Deductible \(USD\)/i)).toBeInTheDocument();
    expect(screen.getByTestId("claim-create-recovery-rail-field")).toBeInTheDocument();
    expect(screen.getByTestId("claim-create-repair-books-field")).toBeInTheDocument();
  });

  it("owner lock #1 — recovery_rail defaults to 'ask' (never auto-advanced)", () => {
    render(wrap(<ClaimCreateModal {...defaultProps} />));
    const select = screen.getByTestId("claim-create-recovery-rail-field").querySelector("select");
    expect(select).toHaveValue("ask");
  });

  it("owner lock #2 — repair_books_treatment defaults to 'ask', no dollar-threshold copy present", () => {
    render(wrap(<ClaimCreateModal {...defaultProps} />));
    const select = screen.getByTestId("claim-create-repair-books-field").querySelector("select");
    expect(select).toHaveValue("ask");
    expect(screen.getByText(/No dollar threshold applies/i)).toBeInTheDocument();
  });

  it("keeps the nested '+ Add new trailer' add-new entry point on the trailer picker", async () => {
    // V2 universal picker law: dropdown inline-create rows read "+ Add new <entity>" — "+ Create"
    // is reserved for page primary buttons (entityAddNewLabel, components/parity/entityPickerRegistry.ts).
    render(wrap(<ClaimCreateModal {...defaultProps} />));
    const user = userEvent.setup();
    const trailerField = screen.getByTestId("claim-create-trailer-field");
    await user.click(within(trailerField).getByRole("combobox"));
    expect(await screen.findByText(/\+ Add new trailer/i)).toBeInTheDocument();
  });

  it("driver field still uses DriverPickerWithCreate (nested driver create preserved)", () => {
    render(wrap(<ClaimCreateModal {...defaultProps} />));
    expect(screen.getByTestId("claim-create-driver-field")).toBeInTheDocument();
  });
});
