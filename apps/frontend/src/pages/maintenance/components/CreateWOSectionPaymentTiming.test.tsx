import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CreateWOSectionPaymentTiming } from "./CreateWOSectionPaymentTiming";

/**
 * C9 (DoD-B) round-trip contract, per form.
 *
 * Bill Terms rendered a live-looking select with `onChange={() => {}}`. The field IS carried by the
 * create-work-order payload (`bill_terms`) and the route accepts it (work-orders.routes.ts), so the
 * operator's pick had somewhere to go — the handler simply threw it away, and every work-order bill
 * booked on the rendered default with no warning. This test pins the wiring: choosing a term must
 * reach form state, which is what the submit payload reads.
 */
describe("CreateWOSectionPaymentTiming — C9 field/payload round trip", () => {
  function renderSection(overrides: Record<string, unknown> = {}) {
    const setValue = vi.fn();
    const watch = vi.fn((name: string) => (name === "payment_timing" ? "bill_me_later" : "")) as never;
    const register = ((name: string) => ({ name, onChange: vi.fn(), onBlur: vi.fn(), ref: vi.fn() })) as never;
    render(
      <CreateWOSectionPaymentTiming
        register={register}
        watch={watch}
        setValue={setValue as never}
        {...(overrides as object)}
      />
    );
    return { setValue };
  }

  it("writes the chosen Bill Terms into form state (was a no-op handler that discarded it)", () => {
    const { setValue } = renderSection();
    const combo = screen.getByDisplayValue("Net 30");
    fireEvent.change(combo, { target: { value: "Net 15" } });
    fireEvent.keyDown(combo, { key: "ArrowDown" });
    const option = screen.getByText("Net 15");
    fireEvent.click(option);
    expect(setValue).toHaveBeenCalledWith("bill_terms", "net_15", expect.objectContaining({ shouldDirty: true }));
  });

  it("keeps the rendered default as the value it would send, never a blank", () => {
    renderSection();
    expect(screen.getByDisplayValue("Net 30")).toBeTruthy();
  });
});
