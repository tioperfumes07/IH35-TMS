// @vitest-environment jsdom
// B4 (owner, 2026-09-12) — "relationship-health-score honesty: exclude missing inputs, label
// partial, or remove." CUST-01 C3(b) (pre-existing) already covers the zero-signal case; this
// covers the previously-unhandled 1-4-of-5-signals case.
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CustomerRelationshipScore } from "./CustomerRelationshipScore";

afterEach(cleanup);

describe("CustomerRelationshipScore honesty", () => {
  it('shows "No data yet" when every subscore is null (pre-existing CUST-01 C3(b) behavior)', () => {
    render(
      <CustomerRelationshipScore
        score={{
          customer_uuid: "c1",
          operating_company_id: "co1",
          computed_at: "2026-09-01T00:00:00Z",
          overall_health_score: 0,
          health_tier: "at_risk",
          engagement_subscore: null,
          payment_behavior_subscore: null,
          service_quality_subscore: null,
          margin_trend_subscore: null,
          complaint_subscore: null,
        }}
      />
    );
    expect(screen.getByText("No data yet")).toBeInTheDocument();
    expect(screen.queryByText("At Risk")).not.toBeInTheDocument();
  });

  it('shows "Partial" (never a definitive tier) and hides the overall number when only some signals are present', () => {
    render(
      <CustomerRelationshipScore
        score={{
          customer_uuid: "c1",
          operating_company_id: "co1",
          computed_at: "2026-09-01T00:00:00Z",
          overall_health_score: 92.5,
          health_tier: "thriving",
          engagement_subscore: 95,
          payment_behavior_subscore: null,
          service_quality_subscore: null,
          margin_trend_subscore: null,
          complaint_subscore: null,
        }}
      />
    );
    expect(screen.getByText("Partial")).toBeInTheDocument();
    expect(screen.queryByText("Thriving")).not.toBeInTheDocument();
    expect(screen.getByText(/Only 1 of 5 signals available/)).toBeInTheDocument();
    // The overall score is hidden while partial, even though the backend returned a number.
    expect(screen.queryByText("92.5")).not.toBeInTheDocument();
  });

  it("shows the real tier and overall score when all 5 subscores are present", () => {
    render(
      <CustomerRelationshipScore
        score={{
          customer_uuid: "c1",
          operating_company_id: "co1",
          computed_at: "2026-09-01T00:00:00Z",
          overall_health_score: 88.0,
          health_tier: "healthy",
          engagement_subscore: 90,
          payment_behavior_subscore: 85,
          service_quality_subscore: 92,
          margin_trend_subscore: 80,
          complaint_subscore: 95,
        }}
      />
    );
    expect(screen.getByText("Healthy")).toBeInTheDocument();
    expect(screen.getByText("88.0")).toBeInTheDocument();
    expect(screen.queryByText("Partial")).not.toBeInTheDocument();
  });
});
