import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { PageHeader } from "../../forms/shared/PageHeader";
import { ParityTable } from "../../parity/ParityTable";
import { V3SideCard } from "../V3SideCard";
import { V3KpiTile } from "../V3KpiTile";

// ROUND 9.4 (owner 11-14 16:41 CT "100% IDENTICAL"): the parts every V3 board draws, at the board's own values
// (docs/design/v3/*.dc.html — th/td, header, side card and tile are identical on all boards).
describe("V3 board parts", () => {
  it("ParityTable appearance=v3 draws the boards' th and td", () => {
    render(<MemoryRouter><ParityTable appearance="v3" panel rows={[{ id: "1", unit: "T177" }]} columns={[{ key: "unit", label: "Unit" }]} rowKey={(r) => r.id} storageKey="t-v3" /></MemoryRouter>);
    const th = screen.getByText("Unit").closest("th")!;
    expect(th).toHaveStyle({ fontSize: "11px", fontWeight: "600", color: "#5B6576", backgroundColor: "#F7F8FA", paddingTop: "7px", paddingLeft: "12px", textTransform: "none" });
    expect(screen.getByText("T177").closest("td")).toHaveStyle({ fontSize: "12px", paddingTop: "7px", paddingLeft: "12px" });
  });
  it("PageHeader variant=v3: crumb, ← Back, 700 18px title, subtitle", () => {
    render(<MemoryRouter><PageHeader variant="v3" crumb="Maintenance" title="Maintenance" subtitle="Work orders" /></MemoryRouter>);
    expect(screen.getByRole("heading", { name: "Maintenance" })).toHaveStyle({ font: "700 18px Inter, ui-sans-serif, system-ui, sans-serif" });
    expect(screen.getByRole("button", { name: "Back" })).toHaveTextContent("← Back");
    expect(screen.getByText("Work orders")).toHaveStyle({ fontSize: "11px" });
  });
  it("side card title is written in capitals; board tile is 6px and sized by content", () => {
    render(<MemoryRouter><V3SideCard title="PM countdown" count={0}>Oil</V3SideCard><V3KpiTile board label="MTD cost" value="$0" testId="tile" /><V3KpiTile label="Home" value="1" testId="home-tile" /></MemoryRouter>);
    expect(screen.getByText("PM COUNTDOWN")).toBeInTheDocument();
    expect(screen.getByTestId("tile")).toHaveStyle({ borderRadius: "6px" });
    expect(screen.getByTestId("tile").style.height).toBe("");
    expect(screen.getByTestId("home-tile")).toHaveStyle({ height: "78px", borderRadius: "2px" });
  });
});
