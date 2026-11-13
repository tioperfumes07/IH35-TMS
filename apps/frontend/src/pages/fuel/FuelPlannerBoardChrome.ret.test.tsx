import type { ReactElement } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { FuelPlannerBoardChrome } from "./FuelPlannerBoardChrome";
import { withReturnContext } from "../../lib/returnContext";

function LocationProbe() {
  const { pathname, search } = useLocation();
  return <div data-testid="location-probe">{`${pathname}${search}`}</div>;
}

function wrap(initial: string, ui: ReactElement) {
  return (
    <MemoryRouter initialEntries={[initial]}>
      <Routes>
        <Route
          path="/fuel/history"
          element={
            <>
              {ui}
              <LocationProbe />
            </>
          }
        />
        <Route path="/fuel" element={<LocationProbe />} />
        <Route path="/fuel/by-truck" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>
  );
}

describe("ROUND 8.20 board19 FuelPlannerBoardChrome ret Back", () => {
  afterEach(cleanup);

  it("shows in-app Back on History when ret restores By-truck origin", async () => {
    const user = userEvent.setup();
    const historyWithRet = withReturnContext("/fuel/history?unit_id=u1", "/fuel/by-truck?period=sep");
    render(
      wrap(
        historyWithRet,
        <FuelPlannerBoardChrome
          title="History"
          subtitle="Fuel fills"
          backHref="/fuel"
          subnavItems={[
            { label: "Home", to: "/fuel" },
            { label: "History", to: "/fuel/history" },
            { label: "By truck", to: "/fuel/by-truck" },
          ]}
        />,
      ),
    );
    expect(screen.getByTestId("fuel-board-back")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByTestId("location-probe").textContent).toContain("/fuel/by-truck");
    expect(screen.getByTestId("location-probe").textContent).toContain("period=sep");
  });
});
