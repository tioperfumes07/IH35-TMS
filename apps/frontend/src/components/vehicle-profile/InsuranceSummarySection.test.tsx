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
    expect(screen.getByText("AL ON")).toBeInTheDocument();
    expect(screen.getByTestId("vp-insurance-document-evidence")).toHaveTextContent("NOT EVIDENCED");
  });

  it("reports documentary evidence separately from active coverage", () => {
    render(
      <MemoryRouter>
        <InsuranceSummarySection
          insuranceSummary={{
            insurance_document_count: 2,
            linked_policies: [
              {
                policy_id: "00000000-0000-4000-8000-000000000889",
                number: "APD-889",
                coverage_type: "physical_damage",
                status: "active",
              },
              {
                policy_id: "00000000-0000-4000-8000-000000000890",
                number: "MTC-890",
                coverage_type: "cargo",
                status: "active",
              },
            ],
          }}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText("APD ON")).toBeInTheDocument();
    expect(screen.getByText("MTC ON")).toBeInTheDocument();
    expect(screen.getByTestId("vp-insurance-document-evidence")).toHaveTextContent("EVIDENCED (2)");
  });
});
