import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { InsuranceSummarySection } from "./InsuranceSummarySection";

describe("InsuranceSummarySection linked policy reverse", () => {
  it("renders a real policy_unit link as a canonical policy drill", () => {
    render(
      <MemoryRouter>
        <InsuranceSummarySection
          insuranceSummary={{
            linked_policies: [
              {
                policy_id: "00000000-0000-4000-8000-000000000888",
                number: "POL-888",
                carrier: "Acme Mutual",
                coverage_type: "auto_liability",
                status: "active",
                expiration: "2027-01-01",
                monthly_premium: 10000,
              },
            ],
          }}
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole("link", { name: "POL-888" })).toHaveAttribute(
      "href",
      "/safety/insurance/policies/00000000-0000-4000-8000-000000000888",
    );
  });
});
