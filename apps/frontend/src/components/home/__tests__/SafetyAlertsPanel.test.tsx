import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { SafetyAlertsPanel } from "../SafetyAlertsPanel";

// GO-0027-HOME-F: a FAILED fetch must never render the same "looks clear" text as a genuinely
// empty-but-successful result -- the most dangerous form of a masked error on a safety panel.
describe("SafetyAlertsPanel", () => {
  it("shows the honest all-clear message when alerts is genuinely empty (no error)", () => {
    render(
      <MemoryRouter>
        <SafetyAlertsPanel alerts={[]} />
      </MemoryRouter>
    );
    expect(screen.getByText(/fleet compliance looks clear/i)).toBeInTheDocument();
  });

  it("never shows the all-clear message on isError, even with an empty alerts array", () => {
    render(
      <MemoryRouter>
        <SafetyAlertsPanel alerts={[]} isError />
      </MemoryRouter>
    );
    expect(screen.queryByText(/fleet compliance looks clear/i)).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(/unable to load safety alerts/i);
    expect(screen.getByRole("alert")).toHaveTextContent(/does not mean compliance is clear/i);
  });
});
