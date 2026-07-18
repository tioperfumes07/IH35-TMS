import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CsaFleetScoreCard } from "./CsaFleetScoreCard";

describe("CsaFleetScoreCard source honesty", () => {
  it("preserves unavailable values and identifies internal inspection points", () => {
    render(
      <CsaFleetScoreCard
        value={{
          total_points: null,
          total_inspections: 0,
          total_oos: 0,
          basic_unsafe_driving: 10,
          basic_hazmat: 87,
          threshold_status: "green",
        }}
      />
    );

    expect(screen.getByText("Internal inspection points")).toBeInTheDocument();
    expect(screen.getByText("Not an FMCSA percentile")).toBeInTheDocument();
    expect(screen.getByText("Authenticated carrier SMS required")).toBeInTheDocument();
    expect(screen.queryByText("87.0")).not.toBeInTheDocument();
    expect(screen.queryByText("green")).not.toBeInTheDocument();
    expect(screen.getAllByText("Unavailable").length).toBeGreaterThan(0);
    expect(screen.getByTestId("csa-bar-basic_unsafe_driving")).toHaveStyle({ width: "100%" });
    expect(screen.getByTestId("csa-bar-basic_hazmat")).toHaveStyle({ width: "0%" });
  });
});
