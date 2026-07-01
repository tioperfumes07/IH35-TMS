import { describe, expect, it } from "vitest";
import {
  SAFETY_ALIAS_TABS,
  SAFETY_GROUPS,
  findSafetyTab,
  type SafetyTab,
} from "../SAFETY_TABS_CONFIG";

// SAFETY-2 regression guard: every Safety sub-tab menu item (canonical + alias) must map to a defined
// /safety/* route and resolve back to the matching active-tab label + breadcrumb group, so a
// dead/mis-labeled item (like the old "Cert Expiry" that stayed on "DOT Compliance") fails CI.

const CANONICAL_TABS: { groupId: string; groupLabel: string; tab: SafetyTab }[] = SAFETY_GROUPS.flatMap(
  (group) => group.tabs.map((tab) => ({ groupId: group.id, groupLabel: group.label, tab }))
);
const ALIAS_TABS = SAFETY_ALIAS_TABS.map((alias) => {
  const group = SAFETY_GROUPS.find((g) => g.id === alias.groupId);
  return { groupId: alias.groupId, groupLabel: group?.label ?? "", tab: alias.tab };
});
const ALL_TABS = [...CANONICAL_TABS, ...ALIAS_TABS];

// Mirrors SafetyLayout's route -> activeTabId derivation (canonical first, then aliases).
function deriveActiveTabId(path: string): string {
  for (const group of SAFETY_GROUPS) {
    for (const tab of group.tabs) {
      if (tab.route === path) return tab.id;
    }
  }
  for (const alias of SAFETY_ALIAS_TABS) {
    if (alias.tab.route === path) return alias.tab.id;
  }
  return "driver-files";
}

describe("Safety nav routing integrity", () => {
  it("every sub-tab has a non-empty /safety/* route", () => {
    for (const { tab } of ALL_TABS) {
      expect(tab.route, `${tab.id} route`).toMatch(/^\/safety\//);
    }
  });

  it("every sub-tab route round-trips to its own id, label, and breadcrumb group", () => {
    for (const { groupLabel, tab } of ALL_TABS) {
      // The route the nav item links to must resolve back to this exact tab (no dead/mis-wired item).
      expect(deriveActiveTabId(tab.route), `route ${tab.route} -> activeTabId`).toBe(tab.id);
      const meta = findSafetyTab(tab.id);
      expect(meta, `findSafetyTab(${tab.id})`).not.toBeNull();
      expect(meta?.tab.label).toBe(tab.label);
      expect(meta?.group.label).toBe(groupLabel);
    }
  });

  it("Cert Expiry alias is distinct from DOT Compliance and lands under Compliance Docs & Monitoring", () => {
    const dotCompliance = findSafetyTab("dot-compliance");
    const certExpiry = findSafetyTab("cert-expiry");
    expect(certExpiry, "cert-expiry must resolve").not.toBeNull();
    // Distinct route so the active-tab/breadcrumb can differ from DOT Compliance (the reported bug).
    expect(certExpiry?.tab.route).toBe("/safety/cert-expiry");
    expect(certExpiry?.tab.route).not.toBe(dotCompliance?.tab.route);
    expect(certExpiry?.tab.label).toBe("Cert Expiry");
    expect(certExpiry?.group.label).toBe("Compliance Docs & Monitoring");
    // Selecting Cert Expiry produces "Cert Expiry" active, not "DOT Compliance".
    expect(deriveActiveTabId("/safety/cert-expiry")).toBe("cert-expiry");
    expect(deriveActiveTabId("/safety/dot-compliance")).toBe("dot-compliance");
  });

  it("alias tabs are NOT part of the canonical 28 groups", () => {
    for (const alias of SAFETY_ALIAS_TABS) {
      const inCanonical = SAFETY_GROUPS.some((g) => g.tabs.some((t) => t.id === alias.tab.id));
      expect(inCanonical, `${alias.tab.id} must stay out of SAFETY_GROUPS`).toBe(false);
    }
  });
});
