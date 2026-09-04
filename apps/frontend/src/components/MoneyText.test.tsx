import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MoneyText } from "./MoneyText";

// GLB-05 — the canonical money-rendering component: QBO format text ("$1,234.56"), right-aligned,
// tabular numerals, from either cents (preferred) or dollars.
describe("MoneyText", () => {
  it("renders integer cents as QBO-format dollars", () => {
    render(<MoneyText cents={123456} data-testid="m" />);
    expect(screen.getByTestId("m")).toHaveTextContent("$1,234.56");
  });

  it("renders a dollar amount when cents is not passed", () => {
    render(<MoneyText dollars={1234.5} data-testid="m" />);
    expect(screen.getByTestId("m")).toHaveTextContent("$1,234.50");
  });

  it("prefers cents over dollars when both are somehow passed", () => {
    render(<MoneyText cents={100} dollars={999} data-testid="m" />);
    expect(screen.getByTestId("m")).toHaveTextContent("$1.00");
  });

  it("null/undefined renders $0.00, never blank or NaN", () => {
    render(<MoneyText cents={null} data-testid="m" />);
    expect(screen.getByTestId("m")).toHaveTextContent("$0.00");
  });

  it("always carries the right-align + tabular-nums classes", () => {
    render(<MoneyText cents={100} data-testid="m" />);
    const el = screen.getByTestId("m");
    expect(el.className).toContain("text-right");
    expect(el.className).toContain("tabular-nums");
  });

  it("negativeIsWarning=false (default) does not redden a negative amount", () => {
    render(<MoneyText cents={-500} data-testid="m" />);
    expect(screen.getByTestId("m").className).not.toContain("text-red-700");
    expect(screen.getByTestId("m")).toHaveTextContent("-$5.00");
  });

  it("negativeIsWarning=true reddens a negative amount, not a positive one", () => {
    const { rerender } = render(<MoneyText cents={-500} negativeIsWarning data-testid="m" />);
    expect(screen.getByTestId("m").className).toContain("text-red-700");
    rerender(<MoneyText cents={500} negativeIsWarning data-testid="m" />);
    expect(screen.getByTestId("m").className).not.toContain("text-red-700");
  });

  it("merges a caller className without dropping the base classes", () => {
    render(<MoneyText cents={100} className="text-lg" data-testid="m" />);
    const el = screen.getByTestId("m");
    expect(el.className).toContain("text-lg");
    expect(el.className).toContain("text-right");
  });
});
