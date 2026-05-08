import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { Sidebar } from "../Sidebar";

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({
    data: { counts: { severe: 0 } },
  }),
}));

vi.mock("../../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({ selectedCompanyId: "company-1" }),
}));

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location-probe">{location.pathname}</div>;
}

describe("Sidebar", () => {
  it("renders width/background/border tokens", () => {
    const { container } = render(
      <MemoryRouter initialEntries={["/home"]}>
        <Sidebar role="Owner" />
      </MemoryRouter>
    );
    const aside = container.querySelector("aside");
    const style = window.getComputedStyle(aside as HTMLElement);
    expect(style.width).toBe("80px");
    expect(style.backgroundColor).toBe("rgb(27, 35, 51)");
    expect(style.borderRight).toContain("1px solid rgb(42, 50, 66)");
  });

  it("renders all 15 nav labels in expected order for Owner role", () => {
    render(
      <MemoryRouter initialEntries={["/home"]}>
        <Sidebar role="Owner" />
      </MemoryRouter>
    );
    const expected = [
      "HOME",
      "MAINT",
      "ACCTG",
      "BANK",
      "FUEL",
      "SAFETY",
      "DRIVERS",
      "CUSTOMERS",
      "DISPATCH",
      "VENDORS",
      "DOCS",
      "LISTS",
      "REPORTS",
      "425C",
      "DRV APP",
    ];
    const rendered = screen.getAllByRole("link").map((el) => el.textContent?.replace(/\s+/g, " ").trim());
    expect(rendered).toEqual(expected);
    const iconCount = document.querySelectorAll("a svg").length;
    expect(iconCount).toBe(15);
  });

  it("uses uppercase 10px labels and active item weight 600", () => {
    render(
      <MemoryRouter initialEntries={["/home"]}>
        <Sidebar role="Owner" />
      </MemoryRouter>
    );
    const homeLink = screen.getByRole("link", { name: /HOME/i });
    const homeLabel = within(homeLink).getByText("HOME");
    expect(homeLabel.className).toContain("text-[10px]");
    expect(homeLabel.className).toContain("uppercase");
    expect(window.getComputedStyle(homeLabel).fontWeight).toBe("600");
  });

  it("applies active and hover backgrounds", () => {
    render(
      <MemoryRouter initialEntries={["/home"]}>
        <Sidebar role="Owner" />
      </MemoryRouter>
    );
    const homeLink = screen.getByRole("link", { name: /HOME/i });
    expect(homeLink.className).toContain("bg-white/10");

    const fuelLink = screen.getByRole("link", { name: /FUEL/i });
    expect(fuelLink.className).toContain("hover:bg-white/5");
    fireEvent.mouseEnter(fuelLink);
  });

  it("navigates to target route when item clicked", () => {
    render(
      <MemoryRouter initialEntries={["/home"]}>
        <Sidebar role="Owner" />
        <LocationProbe />
      </MemoryRouter>
    );
    expect(screen.getByTestId("location-probe")).toHaveTextContent("/home");
    fireEvent.click(screen.getByRole("link", { name: /DISPATCH/i }));
    expect(screen.getByTestId("location-probe")).toHaveTextContent("/dispatch");
  });
});
