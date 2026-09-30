import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TableMoneyCell } from "./TableMoneyCell";
import { TABLE_MISSING } from "../../lib/money";

describe("TableMoneyCell (C-37)", () => {
  it("renders accounting parentheses for negatives in red", () => {
    render(<TableMoneyCell cents={-50000} data-testid="m" />);
    const el = screen.getByTestId("m");
    expect(el).toHaveTextContent("($500.00)");
    expect(el.className).toContain("text-red-600");
  });

  it("missing cents renders em dash", () => {
    render(<TableMoneyCell cents={null} data-testid="m" />);
    expect(screen.getByTestId("m")).toHaveTextContent(TABLE_MISSING);
  });
});
