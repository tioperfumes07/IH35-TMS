# LANE_CROSS: CC-3, ROUND 441.6: the current tab is the most specific match (2026-10-07)

**Lead, ROUND 441.6:** "File them properly … Fix the real ones. Do not baseline them away."

**Real defect:** `NavyPageSubNav` marked every tab whose path is a prefix of the URL as current. Finance's Hub tab (`/finance`) prefixes every finance page, so Hub and Overview were both current on `/finance/overview`.

**Fix:** `mostSpecificActiveTo()` picks the most specific matching tab, and `aria-current` comes from that tab.

**Crossing:** `scripts/verify-maintenance-tab-coverage.mjs` (CC-1) pinned the literal old expression `aria-current={isActive(pathname, item.to) …}`. The guard now requires `aria-current={activeTo === item.to …}`, with `activeTo = mostSpecificActiveTo(pathname, …)`. That is still route-derived, so the property the guard protects is unchanged and is checked more strictly.

**CC-1:** nothing to do. This note is the record of the crossing.
