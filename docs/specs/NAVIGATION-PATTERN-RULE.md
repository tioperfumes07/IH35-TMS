# IH35-TMS — Navigation Pattern Rule (LOCKED)
Source: Jorge directive, IH35-TMS-MASTER-RULES.md rule G3 / locked rule #20

## Left Rail (Sidebar)
- FLAT module list only — one icon + label per module
- NO hover menus on the sidebar
- NO flyout submenus on the sidebar
- Hover = tooltip showing full module name only
- Sidebar NEVER changes layout or adds nested items

## Top Bar (Page-Level Sub-Navigation)
- ALL sub-navigation lives in a hover-dropdown bar at the TOP of each page
- Each module's page has its own top bar with grouped tabs
- Groups example for Dispatch: Load Board ▾ | Planning ▾ | Assignments ▾ | Settlements ▾ | Documents ▾ | Map ▾
- Hover any group to see its items (dropdown)
- Sub-items within groups: Planner Calendar, Load Templates, Unassigned Units, Reserve a Load (under Planning), etc.

## What is FORBIDDEN
- Sidebar flyout menus (hover on sidebar = tooltip ONLY)
- Side-expanding sub-menus
- Nested sidebar items
- Bottom-of-page navigation
- Sub-nav in modal headers

## Current Drift Status
As of 2026-06-07: SidebarFlyoutMenu.tsx exists and may violate this rule. This file should be audited and corrected in a future block. Do NOT remove it in this PR — document only.

### Observed violations (audit 2026-06-07)

| File | Violation | Status |
|------|-----------|--------|
| `apps/frontend/src/components/SidebarFlyoutMenu.tsx` | Renders a flyout panel (`absolute left-full top-0`) listing sub-links for every sidebar module on hover | Grandfathered — must be removed/replaced in a dedicated corrective block |
| `apps/frontend/src/components/Sidebar.tsx` | Imports and mounts `<SidebarFlyoutMenu>` inside each sidebar item's `onMouseEnter` handler | Depends on above; corrected when SidebarFlyoutMenu is removed |
| `apps/frontend/src/components/layout/sidebar-config.ts` | Exports `getSidebarFlyoutItems()` — helper that feeds sub-links to the flyout | Depends on above |

### What SidebarFlyoutMenu.tsx does (as of 2026-06-07)
`SidebarFlyoutMenu` is a React component that renders an absolutely-positioned white panel to the right of the sidebar rail whenever a user hovers over a sidebar item. It displays a titled list of sub-page links (with optional badge counts) sourced from `getSidebarFlyoutItems()` in `sidebar-config.ts`. This is a direct violation of the flat-sidebar rule: hover on a sidebar item **must** show only a tooltip with the module name, not a navigable submenu.

**Corrective action required (future block):** Replace `SidebarFlyoutMenu` usage with a native HTML `title` tooltip on each `NavLink`, and move all sub-navigation to the top-bar `HoverDropdownNav` pattern already used by Dispatch, Accounting, and Reports pages.

## CI Enforcement
A guard script at `scripts/verify-nav-pattern.mjs` checks for new violations on every CI run:
- Hard-fails if any component named `*FlyoutMenu*`, `*SidebarDropdown*`, or `*SidebarSubmenu*` is imported in `Sidebar.tsx` other than the grandfathered `SidebarFlyoutMenu`
- Warns (exit 0) if `SidebarFlyoutMenu.tsx` exists (grandfathered file still present)

## Canonical References
- `apps/frontend/src/components/forms/shared/HoverDropdownNav.tsx` — approved top-bar hover dropdown implementation
- `apps/frontend/src/components/layout/sidebar-config.ts` — sidebar module registry (flat list)
- `docs/specs/NAV_INTEGRITY_RULES.md` — earlier integrity rules (superseded by this document where in conflict)
- `docs/specs/SIDEBAR-ARCH-UPDATE.md` — sidebar architecture history
