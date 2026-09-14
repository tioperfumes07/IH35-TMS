// @vitest-environment jsdom
// B6 (owner, 2026-09-12) — "a dot on any tab that contains data." Additive: hasData is optional so
// every pre-existing consumer (30+ pages) that never sets it renders identically to before.
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { NavyPageSubNav } from "./NavyPageSubNav";

afterEach(cleanup);

function wrap(ui: React.ReactElement) {
  return <MemoryRouter>{ui}</MemoryRouter>;
}

describe("NavyPageSubNav data dot", () => {
  it("renders a dot on a tab with hasData: true", () => {
    render(
      wrap(
        <NavyPageSubNav
          items={[
            { label: "Contacts", to: "Contacts", hasData: true },
            { label: "Loads", to: "Loads", hasData: false },
          ]}
          activeId="Contacts"
          onTabChange={vi.fn()}
          itemIds={["Contacts", "Loads"]}
        />
      )
    );
    const contactsBtn = screen.getByRole("button", { name: /Contacts/ });
    const loadsBtn = screen.getByRole("button", { name: /Loads/ });
    expect(contactsBtn.querySelector(".bg-white")).not.toBeNull();
    expect(loadsBtn.querySelector(".bg-white")).toBeNull();
  });

  it("renders no dot at all when hasData is never passed (every pre-existing consumer)", () => {
    render(
      wrap(
        <NavyPageSubNav
          items={[{ label: "Profile", to: "Profile" }]}
          activeId="Profile"
          onTabChange={vi.fn()}
          itemIds={["Profile"]}
        />
      )
    );
    expect(document.querySelector(".bg-white")).toBeNull();
  });
});

// P0 (owner, 2026-09-14) — "Factoring: 10 of 16 tabs unreachable in production." PR #21952 moved 10
// tabs into 3 NavyPageSubNav dropdowns (Cash/Statement/Settings); none opened live. Root cause: the
// wrapper's `onMouseEnter={show}` opened the menu, then the SAME click's own `onClick` toggle flipped
// it straight back closed — a real user's cursor always fires mouseenter before the click that follows
// it lands, so the dropdown could never visibly open by clicking. `userEvent.click()` reproduces this
// exactly (it dispatches a realistic pointer/mouse event sequence, unlike `fireEvent.click`, which
// fires only a bare "click" and would NOT have caught this regression). Guards the fix in NavyDropdown
// (the mouseenter-then-click race) for every consumer of this shared component, not just Factoring.
describe("NavyDropdown open/close (P0 2026-09-14 — mouseenter-then-click race)", () => {
  function renderDropdown() {
    return render(
      wrap(
        <NavyPageSubNav
          items={[
            {
              label: "Cash",
              to: "",
              children: [
                { label: "Funds Due", to: "/factoring/funds-due" },
                { label: "Payments to You", to: "/factoring/payments-to-you" },
              ],
            },
          ]}
        />
      )
    );
  }

  it("opens on a realistic click (mouseenter fires before click, matching a real mouse user)", async () => {
    const user = userEvent.setup();
    renderDropdown();
    const trigger = screen.getByRole("button", { name: /Cash/ });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("menuitem", { name: "Funds Due" })).toBeNull();

    await user.click(trigger);

    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("menuitem", { name: "Funds Due" })).toBeVisible();
    expect(screen.getByRole("menuitem", { name: "Payments to You" })).toBeVisible();
  });

  it("closes on a second click (normal toggle still works once open)", async () => {
    const user = userEvent.setup();
    renderDropdown();
    const trigger = screen.getByRole("button", { name: /Cash/ });

    await user.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");

    await user.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("menuitem", { name: "Funds Due" })).toBeNull();
  });

  it("a child link is clickable once the menu is open", async () => {
    const user = userEvent.setup();
    renderDropdown();
    await user.click(screen.getByRole("button", { name: /Cash/ }));
    const link = screen.getByRole("menuitem", { name: "Funds Due" });
    expect(link).toHaveAttribute("href", "/factoring/funds-due");
  });

  // P0 FOLLOW-UP #2 (owner 2026-09-14, live Chrome AFTER the click-race fix deployed): fixing the
  // click race was not enough. `<nav className="overflow-x-auto ...">` computes `overflow-y: auto`
  // too (CSS Overflow spec pairs the axes) and clips this `position: absolute` menu, since it renders
  // below the nav's own box — confirmed live via `elementFromPoint` returning page content instead of
  // the menu, despite zIndex:30/opacity:1/display:block all reading correctly. Same defect CLASS as
  // verify-accounting-subnav-click-reachability.mjs's GO-23 nav-dropdown-clip fix, and the same
  // portal-to-body remedy. jsdom has no real layout engine (every rect is 0x0), so it cannot see the
  // clipping directly — but it CAN see the structural fix: the open menu must be a child of
  // `document.body`, NOT of the `<nav>` (its clipping ancestor). This is the exact shape of assertion
  // that would have caught the second bug immediately if it had existed before the first live check.
  it("the open menu portals to document.body, escaping the <nav>'s own overflow-clipping ancestor", async () => {
    const user = userEvent.setup();
    renderDropdown();
    await user.click(screen.getByRole("button", { name: /Cash/ }));
    const menu = screen.getByRole("menu");
    const nav = screen.getByRole("navigation", { name: "Section navigation" });
    expect(nav.contains(menu)).toBe(false);
    expect(document.body.contains(menu)).toBe(true);
  });
});
