import { fireEvent, render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { HoverDropdownNav } from "../../../components/forms/shared/HoverDropdownNav";
import { ACCOUNTING_SUB_NAV_ITEMS } from "../subnav-manifest";

/**
 * GO-23 nav-dropdown-clip regression guard (owner FINISH-LAW report 2026-09-03: "Load costs"
 * unreachable from the Accounting nav except by typing the URL directly).
 *
 * ROOT CAUSE: `.hover-dropdown-nav` sets `overflow-x: auto`; per the CSS Overflow spec that forces
 * the paired `overflow-y` to also compute `auto` on that same element (confirmed live via
 * getComputedStyle -- only overflow-x was authored, overflowY still read back "auto"). Every
 * `.nav-dropdown` menu is `position: absolute` inside `.nav-item-with-dropdown`, a descendant of
 * that clipping ancestor -- so every open dropdown rendered correctly in the DOM (real links, real
 * hrefs, `display:block`/`opacity:1`) but was cropped off-screen by the ancestor's forced
 * `overflow-y: auto`, confirmed live in Chrome on ALL SIX Accounting groups (Bills / Expenses /
 * Bill payment / Invoices / Maintenance & shop / More) -- one bug in HoverDropdownNav, not five.
 * Zero console errors accompanied it; this was a pure CSS defect, invisible to any test that only
 * asserts a menu is "in the document" without asserting it escaped the clipping ancestor.
 *
 * FIX: HoverDropdownNav.tsx now renders each open `.nav-dropdown` into a `document.body` portal,
 * positioned via `measureNavDropdownStyle()` (position: fixed, from a live getBoundingClientRect()
 * read) -- the same fix already proven for this exact clipping class in components/Combobox.tsx's
 * measureListboxStyle(). jsdom does not run real layout/CSS overflow computation, so a bounding-rect
 * assertion can't reproduce the clip here the way live Chrome did -- but the portal fix is a
 * structural DOM change (the open menu is no longer a descendant of `.hover-dropdown-nav`), which
 * IS observable in jsdom. That structural assertion is what actually catches this regression: it is
 * true after the fix and was false (menu nested under the clipping ancestor) before it.
 *
 * This guard renders the REAL, live `ACCOUNTING_SUB_NAV_ITEMS` manifest (not a hand-rolled fixture)
 * through the REAL `HoverDropdownNav`, fires a real click on every group trigger, and asserts every
 * leaf href declared in the manifest is present as a real clickable `<a role="menuitem">` inside a
 * menu that has escaped `.hover-dropdown-nav`'s clipping subtree -- "reachable by click", not just
 * "declared in the manifest".
 */
describe("ACCOUNTING_SUB_NAV_ITEMS -- every leaf href is reachable by an actual click", () => {
  it("has at least one dropdown group to test (sanity: the manifest is not accidentally flat)", () => {
    const groups = ACCOUNTING_SUB_NAV_ITEMS.filter((item) => (item.children?.length ?? 0) > 0);
    expect(groups.length).toBeGreaterThanOrEqual(5); // Bills, Expenses, Bill payment, Invoices, Maintenance & shop, More
  });

  it("clicking every group chevron opens a menu portal-escaped from .hover-dropdown-nav, containing every declared child href as a real clickable link", () => {
    const { container } = render(
      <MemoryRouter>
        <HoverDropdownNav items={ACCOUNTING_SUB_NAV_ITEMS} openOn="click" />
      </MemoryRouter>,
    );
    const nav = container.querySelector(".hover-dropdown-nav");
    if (!nav) throw new Error("expected .hover-dropdown-nav to render");

    const groups = ACCOUNTING_SUB_NAV_ITEMS.filter((item) => (item.children?.length ?? 0) > 0);
    const triggers = [...nav.querySelectorAll<HTMLButtonElement>('button[aria-haspopup="true"]')];
    expect(triggers).toHaveLength(groups.length);

    for (let i = 0; i < groups.length; i++) {
      const group = groups[i]!;
      const trigger = triggers[i]!;

      // Reachable by CLICK -- not hover, not a synthetic open() call.
      fireEvent.click(trigger);

      const menuId = trigger.getAttribute("aria-controls");
      expect(menuId, `${group.label}: chevron has no aria-controls`).toBeTruthy();
      const menu = document.getElementById(menuId!);
      expect(menu, `${group.label}: no menu rendered for aria-controls="${menuId}" after click`).toBeTruthy();

      // The regression-catching assertion: the open menu must NOT be a DOM descendant of
      // .hover-dropdown-nav (the CSS-overflow-clipping ancestor). Before the portal fix this was
      // always true (menu nested under nav-item-with-dropdown -> nav) and this line would fail.
      expect(
        nav.contains(menu),
        `${group.label}: dropdown menu is still nested inside .hover-dropdown-nav -- it will be ` +
          `clipped by that ancestor's CSS-spec-forced overflow-y:auto (GO-23 nav-dropdown-clip)`,
      ).toBe(false);
      expect(document.body.contains(menu), `${group.label}: portal menu did not attach to document.body`).toBe(
        true,
      );

      for (const child of group.children ?? []) {
        const link = menu!.querySelector<HTMLAnchorElement>(`a[href="${CSS.escape(child.href)}"]`);
        expect(
          link,
          `${group.label} ▾ ${child.label}: no reachable <a href="${child.href}"> inside the open menu`,
        ).toBeTruthy();
        expect(link).toHaveAttribute("role", "menuitem");
      }

      // Close it (toggle) before opening the next group, keeping each iteration independent.
      fireEvent.click(trigger);
    }
  });

  it("every non-dropdown leaf item in the manifest renders as a real clickable link", () => {
    render(
      <MemoryRouter>
        <HoverDropdownNav items={ACCOUNTING_SUB_NAV_ITEMS} openOn="click" />
      </MemoryRouter>,
    );
    const leaves = ACCOUNTING_SUB_NAV_ITEMS.filter(
      (item) => (item.children?.length ?? 0) === 0 && item.href != null,
    );
    expect(leaves.length).toBeGreaterThan(0);
    for (const leaf of leaves) {
      const link = document.querySelector<HTMLAnchorElement>(`a[href="${CSS.escape(leaf.href!)}"]`);
      expect(link, `${leaf.label}: no reachable <a href="${leaf.href}">`).toBeTruthy();
    }
  });
});
