import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { DriverManagerAttentionPanel } from "../DriverManagerAttentionPanel";

// GO-0027-HOME-F: a FAILED fetch must never render the same "looks current" text as a genuinely
// empty-but-successful result -- matches the identical fix applied to SafetyAlertsPanel.
describe("DriverManagerAttentionPanel", () => {
  it("shows the honest all-clear message when items is genuinely empty (no error)", () => {
    render(
      <MemoryRouter>
        <DriverManagerAttentionPanel items={[]} />
      </MemoryRouter>
    );
    expect(screen.getByText(/fleet operations look current/i)).toBeInTheDocument();
  });

  it("never shows the all-clear message on isError, even with an empty items array", () => {
    render(
      <MemoryRouter>
        <DriverManagerAttentionPanel items={[]} isError />
      </MemoryRouter>
    );
    expect(screen.queryByText(/fleet operations look current/i)).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(/unable to load driver manager attention items/i);
    expect(screen.getByRole("alert")).toHaveTextContent(/not an all-clear/i);
  });
});
