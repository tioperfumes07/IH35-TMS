import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { NavyPageSubNav } from "../../components/layout/NavyPageSubNav";
import { maintenancePrimarySubNavItems } from "./MaintenanceHome";

afterEach(cleanup);

describe("Maintenance board navigation uses canonical Home", () => {
  for (const path of ["/maintenance", "/maintenance/", "/maintenance/rm-status-board"]) {
    it(`selects Home at ${path}`, () => {
      render(<MemoryRouter initialEntries={[path]}><NavyPageSubNav items={maintenancePrimarySubNavItems()} /></MemoryRouter>);
      const home = screen.getByRole("link", { name: /^Home$/ });
      expect(home.getAttribute("href")).toBe("/maintenance");
      expect(home.getAttribute("aria-current")).toBe("page");
      expect(screen.getByRole("link", { name: /^Fleet Table$/ }).getAttribute("aria-current")).toBeNull();
    });
  }
  it("keeps only In Shop current for the query-specific fleet route", () => {
    render(<MemoryRouter initialEntries={["/maintenance/fleet-table?status=in-shop"]}><NavyPageSubNav items={maintenancePrimarySubNavItems()} /></MemoryRouter>);
    expect(screen.getByRole("link", { name: /^In Shop$/ }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: /^Home$/ }).getAttribute("aria-current")).toBeNull();
    expect(screen.getByRole("link", { name: /^Fleet Table$/ }).getAttribute("aria-current")).toBeNull();
  });
});
