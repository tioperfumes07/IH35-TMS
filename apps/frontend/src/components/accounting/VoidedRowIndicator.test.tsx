import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { voidedRowClassName, VoidedRowBadge } from "./VoidedRowIndicator";

describe("voidedRowClassName", () => {
  it("dims a voided row and leaves a live row untouched", () => {
    expect(voidedRowClassName("2026-09-23T00:00:00Z")).toBe("opacity-60");
    expect(voidedRowClassName(null)).toBe("");
    expect(voidedRowClassName(undefined)).toBe("");
  });
});

describe("VoidedRowBadge", () => {
  it("renders the Voided badge only when voidedAt is set — never fabricates", () => {
    const { rerender } = render(<VoidedRowBadge voidedAt={null} />);
    expect(screen.queryByTestId("voided-row-badge")).toBeNull();

    rerender(<VoidedRowBadge voidedAt="2026-09-23T00:00:00Z" />);
    expect(screen.getByTestId("voided-row-badge")).toHaveTextContent("Voided");
  });
});
