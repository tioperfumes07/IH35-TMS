import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ColumnChooser } from "./ColumnChooser";

describe("ColumnChooser Apply law", () => {
  it("keeps page and column changes as drafts until Apply", () => {
    const onToggleColumn = vi.fn();
    const onPageSizeChange = vi.fn();
    render(
      <ColumnChooser
        columns={[{ key: "name", label: "Name" }, { key: "amount", label: "Amount" }]}
        hidden={new Set<string>()}
        onToggleColumn={onToggleColumn}
        pageSize={25}
        onPageSizeChange={onPageSizeChange}
      />,
    );

    fireEvent.click(screen.getByLabelText("Table settings"));
    fireEvent.click(screen.getByRole("checkbox", { name: "Amount" }));
    fireEvent.change(screen.getByLabelText("Rows per page"), { target: { value: "50" } });
    expect(onToggleColumn).not.toHaveBeenCalled();
    expect(onPageSizeChange).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(onToggleColumn).toHaveBeenCalledWith("amount");
    expect(onPageSizeChange).toHaveBeenCalledWith(50);
  });

  it("Cancel discards drafts", () => {
    const onToggleColumn = vi.fn();
    render(
      <ColumnChooser
        columns={[{ key: "amount", label: "Amount" }]}
        hidden={new Set<string>()}
        onToggleColumn={onToggleColumn}
        pageSize={25}
        onPageSizeChange={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByLabelText("Table settings"));
    fireEvent.click(screen.getByRole("checkbox", { name: "Amount" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onToggleColumn).not.toHaveBeenCalled();
  });

  it("Escape closes and discards drafts", () => {
    const onToggleColumn = vi.fn();
    render(
      <ColumnChooser
        columns={[{ key: "amount", label: "Amount" }]}
        hidden={new Set<string>()}
        onToggleColumn={onToggleColumn}
        pageSize={25}
        onPageSizeChange={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByLabelText("Table settings"));
    fireEvent.click(screen.getByRole("checkbox", { name: "Amount" }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("button", { name: "Apply" })).not.toBeInTheDocument();
    expect(onToggleColumn).not.toHaveBeenCalled();
  });
});
