import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TotalsStack } from "../TotalsStack";

describe("TotalsStack", () => {
  it("renders rows in order: Subtotal, Tax, Grand", () => {
    const { container } = render(<TotalsStack subtotal={100} grandLabel="WO Total = A + B" />);
    const labels = Array.from(container.querySelectorAll(".totals-row span:first-child")).map((el) => el.textContent?.trim());
    expect(labels).toEqual(["Subtotal", "Tax %", "WO Total = A + B"]);
  });

  it("uses default tax rate of 8.25 when omitted", () => {
    render(<TotalsStack subtotal={100} grandLabel="WO Total = A + B" />);
    const taxInput = screen.getByRole("spinbutton");
    expect(taxInput).toHaveValue(8.25);
    expect(screen.getByText("$8.25")).toBeInTheDocument();
    expect(screen.getByText("$108.25")).toBeInTheDocument();
  });

  it("allows tax input editing in editable mode", () => {
    render(<TotalsStack subtotal={100} taxRate={8.25} grandLabel="WO Total = A + B" taxRateMode="editable" />);
    const taxInput = screen.getByRole("spinbutton");
    expect(taxInput).not.toHaveAttribute("readonly");
  });

  it("sets tax input readonly in readonly mode", () => {
    render(<TotalsStack subtotal={100} taxRate={8.25} grandLabel="WO Total = A + B" taxRateMode="readonly" />);
    const taxInput = screen.getByRole("spinbutton");
    expect(taxInput).toHaveAttribute("readonly");
  });

  it("fires onTaxRateChange with typed value", () => {
    const onTaxRateChange = vi.fn();
    render(<TotalsStack subtotal={100} taxRate={8.25} grandLabel="WO Total = A + B" onTaxRateChange={onTaxRateChange} />);
    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "9.5" } });
    expect(onTaxRateChange).toHaveBeenCalledWith(9.5);
  });

  it("computes totals correctly for required cases", () => {
    const { rerender } = render(<TotalsStack subtotal={0} taxRate={8.25} grandLabel="Expense Total = A + B" />);
    expect(screen.getAllByText("$0.00").length).toBeGreaterThan(0);

    rerender(<TotalsStack subtotal={100} taxRate={8.25} grandLabel="Expense Total = A + B" />);
    expect(screen.getByText("$108.25")).toBeInTheDocument();

    rerender(<TotalsStack subtotal={1874.5} taxRate={8.25} grandLabel="Expense Total = A + B" />);
    expect(screen.getByText("$154.65")).toBeInTheDocument();
    expect(screen.getByText("$2029.15")).toBeInTheDocument();

    rerender(<TotalsStack subtotal={1874.5} taxRate={0} grandLabel="Expense Total = A + B" />);
    expect(screen.getAllByText("$1874.50").length).toBeGreaterThan(0);
  });

  it("renders provided grand label", () => {
    render(<TotalsStack subtotal={100} taxRate={8.25} grandLabel="Bill Total = A + B" />);
    expect(screen.getByText("Bill Total = A + B")).toBeInTheDocument();
  });

  it("renders negative subtotal without crashing", () => {
    render(<TotalsStack subtotal={-50} taxRate={8.25} grandLabel="WO Total = A + B" />);
    expect(screen.getByText("$-50.00")).toBeInTheDocument();
    expect(screen.getByText("$-54.13")).toBeInTheDocument();
  });
});
