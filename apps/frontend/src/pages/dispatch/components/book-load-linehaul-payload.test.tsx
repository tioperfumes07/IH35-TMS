import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useForm } from "react-hook-form";
import { describe, expect, it } from "vitest";
import { MoneyInput } from "../../../components/forms/MoneyInput";
import { buildBookLoadChargeLines } from "../../../components/dispatch/accessorial-editor-lib";

// CI GUARD (2026-06-24) — FIX-4 / W-3, the disputed 10× linehaul money bug. GUARD live-captured a booking
// payload where typing $1,500 produced linehaul_cents=1500000 (should be 150000). The existing
// MoneyInput.test only checks parseToCents in isolation; this exercises the REAL SUBMISSION SEAM the wizard
// uses: the cents MoneyInput (exactly as BookLoadModalV4 wires Linehaul) → form value → buildBookLoadChargeLines
// (the function that builds the POST `charges`). If a 10× lived on this path, this assertion would catch it.

let getCents: (() => number) | null = null;

function LinehaulHarness() {
  // Mirror BookLoadModalV4:927 exactly: valueCents/onChangeCents bound to a form field.
  const form = useForm({ defaultValues: { linehaul_cents: 0 } });
  getCents = () => Number(form.getValues("linehaul_cents") || 0);
  return (
    <MoneyInput
      valueCents={form.watch("linehaul_cents")}
      onChangeCents={(c) => form.setValue("linehaul_cents", c ?? 0, { shouldDirty: true })}
      ariaLabel="Linehaul"
    />
  );
}

async function typeLinehaulAndBuildPayload(text: string): Promise<number> {
  const user = userEvent.setup();
  render(<LinehaulHarness />);
  const input = screen.getByLabelText("Linehaul");
  await user.clear(input);
  await user.type(input, text);
  const formCents = getCents!();
  // The submission seam: BookLoadModalV4 passes the form's linehaul_cents straight into buildBookLoadChargeLines.
  const lines = buildBookLoadChargeLines({ linehaul_cents: formCents, fuel_surcharge_cents: 0, accessorial_rows: [] });
  const linehaul = lines.find((l) => l.code === "linehaul");
  return linehaul?.amount_cents ?? -1;
}

describe("Book Load linehaul → payload cents (FIX-4 / W-3 submission-seam guard)", () => {
  it("$1,500 typed → payload linehaul_cents === 150000 (NOT 1500000)", async () => {
    expect(await typeLinehaulAndBuildPayload("1500")).toBe(150000);
  });
  it("$1,234.56 → 123456", async () => {
    expect(await typeLinehaulAndBuildPayload("1234.56")).toBe(123456);
  });
  it("$0.01 → 1", async () => {
    expect(await typeLinehaulAndBuildPayload("0.01")).toBe(1);
  });
});
