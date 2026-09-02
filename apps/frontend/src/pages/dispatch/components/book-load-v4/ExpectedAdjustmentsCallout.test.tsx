// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useForm } from "react-hook-form";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup } from "@testing-library/react";

vi.mock("../../../../api/catalogs-dispatch", () => ({
  listAllDispatchCatalogRows: async () => ({ rows: [], total: 0 }),
  detentionReasonsCatalogClient: { list: vi.fn(async () => ({ rows: [], total: 0 })) },
}));

import { ExpectedAdjustmentsCallout } from "./ExpectedAdjustmentsCallout";

afterEach(() => cleanup());
beforeEach(() => vi.clearAllMocks());

function Harness() {
  const { register, watch, setValue } = useForm<Record<string, unknown>>({
    defaultValues: { detention_expected_y_n: false },
  });
  const qc = new QueryClient();
  return (
    <QueryClientProvider client={qc}>
      <ExpectedAdjustmentsCallout
        register={register}
        operatingCompanyId="5c854333-6ea5-4faa-af31-67cb272fef80"
        watch={watch}
        setValue={setValue}
      />
    </QueryClientProvider>
  );
}

// GO-23 QuickBooks-format fix: every dollar/hour field in this callout was a raw
// <input type="number"> exposing cents with no $, no thousands separator, and a native
// spinner. Confirms the fields are now the shared MoneyInput/NumberInput controls (which
// format on blur / render $X,XXX.XX) instead of the raw input the operator was hitting live.
describe("ExpectedAdjustmentsCallout QuickBooks formats", () => {
  it("anticipated chargeback renders as a $ MoneyInput, not a raw number input", async () => {
    render(<Harness />);
    const field = screen.getByLabelText("Anticipated chargeback") as HTMLInputElement;
    const user = userEvent.setup();
    await user.type(field, "125");
    await user.tab();
    expect(field).toHaveValue("125.00");
  });

  it("detention per-hour fields render as $ MoneyInputs (present, formatted controls)", () => {
    render(<Harness />);
    expect(screen.getByLabelText("Detention bill customer per hour")).toBeInTheDocument();
    expect(screen.getByLabelText("Detention driver pay per hour")).toBeInTheDocument();
  });

  it("late delivery estimated deduction renders as a $ MoneyInput", () => {
    render(<Harness />);
    expect(screen.getByLabelText("Late delivery estimated deduction")).toBeInTheDocument();
  });

  it("detention expected hours renders as a formatted NumberInput, no native spinner", async () => {
    render(<Harness />);
    const field = screen.getByLabelText("Detention hours expected") as HTMLInputElement;
    const user = userEvent.setup();
    await user.type(field, "2.5");
    await user.tab();
    expect(field).toHaveValue("2.50");
  });
});
