import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EntityEmptyState } from "./EntityEmptyState";

describe("EntityEmptyState", () => {
  it("names the selected entity and points at the entity switcher", () => {
    render(<EntityEmptyState entityName="USMCA Freight Solutions Inc" noun="bank accounts" />);
    // The honest signal: the entity is named + the user is told to switch entity (not a bare "0").
    expect(screen.getByText(/USMCA Freight Solutions Inc has no bank accounts yet/i)).toBeInTheDocument();
    expect(screen.getByText(/switch entity from the top bar/i)).toBeInTheDocument();
  });

  it("falls back to a generic subject when no entity name is given", () => {
    render(<EntityEmptyState noun="transactions" />);
    expect(screen.getByText(/This entity has no transactions yet/i)).toBeInTheDocument();
  });
});
