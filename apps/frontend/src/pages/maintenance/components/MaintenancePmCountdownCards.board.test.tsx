import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { MaintenancePmCountdownCards } from "./MaintenancePmCountdownCards";

describe("Maintenance Home compact PM monitor", () => {
  it("links the count and empty schedule explanation to the schedule source", () => {
    render(<MemoryRouter><MaintenancePmCountdownCards rows={[]} board /></MemoryRouter>);
    // ROUND 9.0 — the schedule source, with ?ret back to the board.
    expect(screen.getByRole("link", { name: "PM countdown — view schedules" }).getAttribute("href")).toMatch(/^\/maintenance\/pm-schedule(\?ret=|$)/);
    expect(screen.getByText("Oil · tires · DOT · brake — no active schedule").getAttribute("href")).toMatch(/^\/maintenance\/pm-schedule(\?ret=|$)/);
  });
  it("does not present an unloaded schedule count as zero", () => {
    render(<MemoryRouter><MaintenancePmCountdownCards rows={[]} loading board /></MemoryRouter>);
    expect(screen.getByRole("link", { name: "PM countdown — view schedules" })).toHaveTextContent("…");
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });
});
