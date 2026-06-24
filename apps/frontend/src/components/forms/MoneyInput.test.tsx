import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { MoneyInput, formatCentsDisplay, formatDollarsDisplay, parseToCents, parseToDollars } from "./MoneyInput";

// M-1 (P0): the shared QBO-style money seam. The Book Load §A bug was typing 350 (dollars) into a
// *_cents field with NO conversion → stored 350¢ → totalled $3.50. MoneyInput converts dollars↔cents
// at one seam: typed 350 → 35000 cents → displays $350.00. These tests lock the acceptance.
describe("MoneyInput dollars↔cents seam (parseToCents / formatCentsDisplay)", () => {
  it("typing 350 dollars stores 35000 cents (NOT 350)", () => {
    expect(parseToCents("350")).toBe(35000);
  });

  it("typing 1500.5 stores 150050 cents", () => {
    expect(parseToCents("1500.5")).toBe(150050);
  });

  it("strips $ and thousands separators when parsing", () => {
    expect(parseToCents("$1,500.50")).toBe(150050);
  });

  it("empty / partial input parses to null (= $0.00)", () => {
    expect(parseToCents("")).toBeNull();
    expect(parseToCents(".")).toBeNull();
    expect(parseToCents("-")).toBeNull();
  });

  it("displays cents as QBO currency — always 2 decimals + thousands separators", () => {
    expect(formatCentsDisplay(35000)).toBe("350.00");
    expect(formatCentsDisplay(150050)).toBe("1,500.50");
    expect(formatCentsDisplay(0)).toBe("0.00");
  });

  it("round-trips a dollar amount through cents and back", () => {
    const cents = parseToCents("350");
    expect(cents).toBe(35000);
    expect(formatCentsDisplay(cents)).toBe("350.00");
  });
});

// M-1 DOLLARS mode (ruling 2026-06-23 option a): dollars-origin financial fields (CostBreakdownBox,
// shared by Create WO + bills + expenses) keep storing DOLLARS — the input is display-only QBO format,
// the emitted/stored number is BYTE-FOR-BYTE the same dollar value (no ×100). These lock that contract.
describe("MoneyInput DOLLARS mode (parseToDollars / formatDollarsDisplay) — no cents conversion", () => {
  it("typing 350 emits 350 DOLLARS (NOT 35000) — payload byte-for-byte unchanged", () => {
    expect(parseToDollars("350")).toBe(350);
  });

  it("typing 5.5 emits 5.5 dollars (unit/rate fractional)", () => {
    expect(parseToDollars("5.5")).toBe(5.5);
  });

  it("strips $ and thousands separators but does NOT scale", () => {
    expect(parseToDollars("$1,500.50")).toBe(1500.5);
  });

  it("displays a dollar value as QBO currency — 2 decimals + thousands", () => {
    expect(formatDollarsDisplay(350)).toBe("350.00");
    expect(formatDollarsDisplay(1500.5)).toBe("1,500.50");
    expect(formatDollarsDisplay(0)).toBe("0.00");
  });

  it("dollar value round-trips unchanged (the byte-for-byte guarantee)", () => {
    const d = parseToDollars("350");
    expect(d).toBe(350);
    expect(formatDollarsDisplay(d)).toBe("350.00");
  });
});

// W-3 (GUARD live, 2026-06-24): typing 1500 into the flat §A Linehaul box yielded a DOM value of "15000"
// (digit-shift) → parseToCents("15000") = 1500000 = $15,000 (10× the $1,500 entered). parseToCents and
// buildBookLoadChargeLines are correct; the bug was UPSTREAM in onFocus: a zero field set its text to "0"
// (not ""), and after the programmatic value change the cursor landed at the start, so the typed digits
// prepended to the leftover "0" → "1500" + "0" = "15000". These RENDER tests reproduce it at the keystroke
// layer (the parseToCents-in-isolation tests above passed and missed it).
describe("MoneyInput keystroke layer — zero-field digit-shift (W-3 10× guard)", () => {
  let lastCents: number | null = -1;
  function CentsHarness() {
    const [cents, setCents] = useState<number | null>(0);
    lastCents = cents;
    return (
      <MoneyInput
        valueCents={cents}
        onChangeCents={(c) => {
          lastCents = c;
          setCents(c);
        }}
        ariaLabel="Amount"
      />
    );
  }

  it("focusing a ZERO field clears it to empty (no leftover '0' to prepend)", async () => {
    const user = userEvent.setup();
    render(<CentsHarness />);
    const input = screen.getByLabelText("Amount") as HTMLInputElement;
    await user.click(input);
    expect(input.value).toBe(""); // was "0" before the fix — the leftover digit that caused the shift
  });

  it("typing 1500 into a fresh field yields 150000 cents, NOT 1500000", async () => {
    const user = userEvent.setup();
    render(<CentsHarness />);
    const input = screen.getByLabelText("Amount") as HTMLInputElement;
    await user.click(input); // focus → onFocus
    input.setSelectionRange(0, 0); // browser lands the cursor at the start after the programmatic value change
    await user.type(input, "1500", { skipClick: true, initialSelectionStart: 0, initialSelectionEnd: 0 });
    expect(lastCents).toBe(150000); // was 1500000 (the leftover "0" made the value "15000")
  });
});
