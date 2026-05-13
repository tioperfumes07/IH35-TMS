import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { NavItem } from "./HoverDropdownNav";
import { HoverDropdownNav } from "./HoverDropdownNav";

const accountingDemo: NavItem[] = [
  {
    label: "Bills",
    children: [
      { label: "Bill", href: "/accounting/bills" },
      { label: "Maintenance bill", href: "/accounting/bills/maintenance" },
      { label: "Repair bill", href: "/accounting/bills/repair" },
      { label: "Fuel bill", href: "/accounting/bills/fuel" },
      { label: "Driver bill", href: "/accounting/bills/driver" },
      { label: "Vendor bill", href: "/accounting/bills/vendor" },
      { label: "Multiple bills", href: "/accounting/bills/multiple" },
    ],
  },
];

function openBillsMenu() {
  render(
    <MemoryRouter>
      <HoverDropdownNav items={accountingDemo} activeHref="/accounting/bills/maintenance" />
    </MemoryRouter>,
  );
  const billsBtn = screen.getByRole("menuitem", { name: /^Bills$/i });
  const hoverTarget = billsBtn.parentElement;
  if (!hoverTarget) throw new Error("expected Bills wrapper");
  fireEvent.mouseEnter(hoverTarget);
  return hoverTarget;
}

afterEach(() => {
  vi.useRealTimers();
});

describe("HoverDropdownNav primitive (invariant #20)", () => {
  it("opens on hover, highlights active child, nowrap + max-content (MUST 6.3.1.1)", () => {
    openBillsMenu();
    const menu = screen.getByTestId("bills-dropdown-menu");
    expect(menu).toBeTruthy();
    expect(window.getComputedStyle(menu).width).toBe("max-content");
    const links = within(menu).getAllByRole("menuitem");
    expect(links).toHaveLength(7);
    for (const a of links) {
      expect(window.getComputedStyle(a).whiteSpace).toBe("nowrap");
    }
    const maintenance = links.find((el) => el.textContent === "Maintenance bill");
    expect(maintenance).toBeTruthy();
    expect(maintenance?.className.split(/\s+/).includes("active")).toBe(true);

    const longest =
      accountingDemo[0].children?.reduce((m, c) => (c.label.length > m.length ? c.label : m), "") ?? "";
    expect(longest).toBe("Maintenance bill");
  });

  it("closes after mouse leave with 150ms delay", () => {
    vi.useFakeTimers();
    const hoverTarget = openBillsMenu();
    expect(screen.getByTestId("bills-dropdown-menu")).toBeTruthy();
    fireEvent.mouseLeave(hoverTarget);
    act(() => {
      vi.advanceTimersByTime(149);
    });
    expect(screen.getByTestId("bills-dropdown-menu")).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(2);
    });
    expect(screen.queryByTestId("bills-dropdown-menu")).toBeNull();
  });

  it("closes on Escape from document and restores focus to trigger", () => {
    openBillsMenu();
    const menu = screen.getByTestId("bills-dropdown-menu");
    expect(menu).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByTestId("bills-dropdown-menu")).toBeNull();
    const billsBtn = screen.getByRole("menuitem", { name: /^Bills$/i });
    expect(document.activeElement).toBe(billsBtn);
  });

  it("ArrowDown opens menu and moves focus into first link (keyboard)", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <HoverDropdownNav items={accountingDemo} />
      </MemoryRouter>,
    );
    const billsBtn = screen.getByRole("menuitem", { name: /^Bills$/i });
    billsBtn.focus();
    await user.keyboard("{ArrowDown}");
    const menu = await screen.findByTestId("bills-dropdown-menu");
    const first = within(menu).getAllByRole("menuitem")[0];
    expect(document.activeElement).toBe(first);
  });

  it("ArrowDown / ArrowUp move between dropdown links", async () => {
    const user = userEvent.setup();
    openBillsMenu();
    const menu = screen.getByTestId("bills-dropdown-menu");
    const links = within(menu).getAllByRole("menuitem");
    links[0].focus();
    await user.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(links[1]);
    await user.keyboard("{ArrowUp}");
    expect(document.activeElement).toBe(links[0]);
  });
});
