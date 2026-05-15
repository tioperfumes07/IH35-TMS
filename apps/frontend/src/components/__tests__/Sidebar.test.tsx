import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { UserRole } from "../../types/api";
import { resolveSidebarOrder, SIDEBAR_ITEM_META } from "../layout/sidebar-config";
import { Sidebar } from "../Sidebar";

const mockInvalidateQueries = vi.fn();
const mockMutateAsync = vi.fn().mockResolvedValue(undefined);

vi.mock("@tanstack/react-query", () => ({
  useQuery: (opts: { queryKey?: unknown[] }) => {
    const key = opts.queryKey ?? [];
    if (key[0] === "user" && key[1] === "preferences") {
      return { data: { preferences: {} }, isLoading: false, isError: false };
    }
    if (key[0] === "sidebar") {
      return { data: { counts: { severe: 0 } }, isLoading: false, isError: false };
    }
    return { data: undefined, isLoading: false, isError: false };
  },
  useMutation: () => ({
    mutateAsync: mockMutateAsync,
    isPending: false,
  }),
  useQueryClient: () => ({
    invalidateQueries: mockInvalidateQueries,
  }),
}));

vi.mock("../../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({ selectedCompanyId: "company-1" }),
}));

function navLabelsForRole(role: UserRole, preferences?: Record<string, unknown>): string[] {
  const order = resolveSidebarOrder(role, preferences);
  return order
    .map((id) => SIDEBAR_ITEM_META[id])
    .filter((m) => !m.visibleRoles || m.visibleRoles.includes(role))
    .map((m) => m.label);
}

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location-probe">{location.pathname}</div>;
}

describe("Sidebar", () => {
  it("renders width/background/border tokens", () => {
    const { container } = render(
      <MemoryRouter initialEntries={["/home"]}>
        <Sidebar role="Owner" mobileOpen />
      </MemoryRouter>
    );
    const aside = container.querySelector("aside");
    expect(aside?.className).toContain("w-20");
    const style = window.getComputedStyle(aside as HTMLElement);
    expect(style.backgroundColor).toBe("rgb(27, 35, 51)");
    expect(style.borderRight).toContain("1px solid rgb(42, 50, 66)");
  });

  it("renders nav labels in SIDEBAR_DEFAULT_ORDER for Owner role", () => {
    render(
      <MemoryRouter initialEntries={["/home"]}>
        <Sidebar role="Owner" mobileOpen />
      </MemoryRouter>
    );
    const expected = navLabelsForRole("Owner");
    const rendered = screen.getAllByRole("link").map((el) => el.textContent?.replace(/\s+/g, " ").trim());
    expect(rendered).toEqual(expected);
    const iconCount = document.querySelectorAll("a svg").length;
    expect(iconCount).toBe(expected.length);
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

    const dispatchLink = screen.getByRole("link", { name: /DISPATCH/i });
    expect(dispatchLink.className).toContain("hover:bg-white/5");
    fireEvent.mouseEnter(dispatchLink);
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
