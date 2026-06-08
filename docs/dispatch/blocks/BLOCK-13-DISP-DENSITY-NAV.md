AGENT-1 · Block 13 of 13 — PHASE Dispatch / TASK <add tracker row DISP-DENSITY-NAV> — Density pass + sidebar nav correction
SO: prepend BOX 0. NAV RULE #20.
SCOPE (ADDITIVE/CORRECTIVE):
(a) Density: reduce card/cell padding + font within locked tokens so more fits on a full screen (cards ~6-8px padding, table cells ~4-7px, planner cells compact). No token violations.
(b) Nav correction (cite NAVIGATION-PATTERN-RULE.md + deferred SIDEBAR-NAV-CORRECTION): replace SidebarFlyoutMenu.tsx side-flyout with tooltip-only rail + top-bar hover sub-nav. REQUIRES before/after preview approval before editing Sidebar.tsx (do not edit Sidebar.tsx until preview signed off).
FILES: dispatch CSS/token usage (EDIT); SidebarFlyoutMenu.tsx / Sidebar.tsx (CORRECTIVE — preview-gated).
ACCEPTANCE: denser layout, tokens intact; nav correction preview produced; Sidebar.tsx edited only after approval.
LANE LOCK: Sidebar files are magnet — single writer, preview-gated.
