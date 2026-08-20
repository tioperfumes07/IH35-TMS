import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import {
  DOMAIN_CONFIG,
  DomainCatalogSection,
  buildCatalogPath,
  buildDomainModulePath,
  sortDomainsForDisplay,
} from "./AllCatalogsMap";
import { DomainCatalogHubPage } from "../DomainCatalogHubPage";
import { listsScrollKey, readScrollPosition, saveScrollPosition } from "../ListsHubPage";

// Row-count badge pulls live counts via a react-query hook; stub it so these unit tests stay pure.
vi.mock("./DomainRowCountBadge", () => ({
  DomainRowCountBadge: () => <span data-testid="row-count-badge" />,
}));

// ModuleHeader's optional countModule badge also pulls a live count via useModuleCount, which needs
// a CompanyProvider these unit tests don't set up; stub it the same way as DomainRowCountBadge above.
vi.mock("../../../components/layout/SubNavCounts", () => ({
  SubNavCounts: () => <span data-testid="subnav-count-badge" />,
}));

// DomainCatalogSection reads useCompanyContext() directly (USMCA/TRK vs TRANSP: QBO bulk-link is
// TRANSP-only, sync-health twin #8751) — same reason it needs a stub as the two hooks above, so it
// renders without a real CompanyProvider tree. TRANSP so qbo-bulk-link catalog entries stay visible,
// matching the current sortDomainsForDisplay(DOMAIN_CONFIG) fixture these tests already assert on.
vi.mock("../../../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({ selectedCompany: { code: "TRANSP" }, selectedCompanyId: "co-1" }),
}));

describe("Lists reorg — ordering (data-driven, single source)", () => {
  const sorted = sortDomainsForDisplay(DOMAIN_CONFIG);

  it("pins Accounting first, then domains strictly alphabetical by label", () => {
    expect(sorted[0].key).toBe("accounting");
    const restLabels = sorted.slice(1).map((d) => d.label);
    expect(restLabels).toEqual([...restLabels].sort((a, b) => a.localeCompare(b)));
  });

  it("sorts catalogs strictly alphabetical by name within every domain", () => {
    for (const domain of sorted) {
      const names = domain.catalogs.map((c) => c.name);
      expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
    }
  });

  it("does not drop any domain or catalog (additive-only reorder)", () => {
    expect(sorted).toHaveLength(DOMAIN_CONFIG.length);
    const before = DOMAIN_CONFIG.reduce((n, d) => n + d.catalogs.length, 0);
    const after = sorted.reduce((n, d) => n + d.catalogs.length, 0);
    expect(after).toBe(before);
  });
});

describe("Lists reorg — domain header is a focusable control, not a bare span", () => {
  const accounting = sortDomainsForDisplay(DOMAIN_CONFIG)[0];

  it("renders a keyboard-focusable button that fires onDomainClick with the key", () => {
    const onDomainClick = vi.fn();
    render(<MemoryRouter><DomainCatalogSection domain={accounting} onCatalogClick={vi.fn()} onDomainClick={onDomainClick} /></MemoryRouter>);
    const header = screen.getByTestId("domain-header-link");
    expect(header.tagName).toBe("BUTTON");
    fireEvent.click(header);
    expect(onDomainClick).toHaveBeenCalledWith("accounting");
  });

  it("falls back to a plain span when no onDomainClick is provided", () => {
    render(<MemoryRouter><DomainCatalogSection domain={accounting} onCatalogClick={vi.fn()} /></MemoryRouter>);
    expect(screen.queryByTestId("domain-header-link")).toBeNull();
  });
});

describe("Lists reorg — buildCatalogPath (shared resolver)", () => {
  it("resolves dispatch, drivers-reference, names, and default paths", () => {
    expect(buildCatalogPath("dispatch", "load-types")).toBe("/lists/dispatch/load-types");
    expect(buildCatalogPath("drivers", "license-classes")).toBe("/lists/drivers/license-classes");
    expect(buildCatalogPath("drivers", "driver-load-statuses")).toBe("/lists/drivers/driver-load-statuses");
    expect(buildCatalogPath("drivers", "pay-types")).toBe("/lists/driver/pay-types"); // normalized + default
    expect(buildCatalogPath("names_master", "brokers")).toBe("/lists/names/brokers");
    expect(buildCatalogPath("accounting", "chart-of-accounts")).toBe("/lists/accounting/chart-of-accounts");
    expect(buildCatalogPath("accounting", "_create")).toBe("/lists/accounting/chart-of-accounts?create=1");
    expect(buildCatalogPath("drivers", "_create")).toBe("/lists/drivers/termination-reasons?create=1");
    expect(buildCatalogPath("safety", "_create")).toBe("/lists/safety/internal-fine-reasons?create=1");
    expect(buildCatalogPath("dispatch", "_create")).toBe("/lists/dispatch/dispatch-flag-colors?create=1");
    expect(buildCatalogPath("customers", "customers-master")).toBe("/customers");
    expect(buildCatalogPath("vendors", "vendors-master")).toBe("/vendors");
    // LST-F13 — mounted orphans must resolve from DOMAIN_CONFIG keys.
    expect(buildCatalogPath("maintenance", "parts-catalog")).toBe("/lists/maintenance/parts-catalog");
    expect(buildCatalogPath("accounting", "abandonment-defaults")).toBe("/lists/accounting/abandonment-defaults");
    expect(buildCatalogPath("accounting", "account-types-lookup")).toBe("/lists/accounting/account-types");
  });

  it("exposes the canonical Customers roster from the Customers domain", () => {
    const customers = DOMAIN_CONFIG.find((d) => d.key === "customers");
    expect(customers?.catalogs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "Customers", catalogKey: "customers-master", live: true }),
      ]),
    );
  });

  it("exposes the canonical Vendors roster from the Vendors domain", () => {
    const vendors = DOMAIN_CONFIG.find((d) => d.key === "vendors");
    expect(vendors?.catalogs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "Vendors", catalogKey: "vendors-master", live: true }),
      ]),
    );
  });

  it("DOMAIN_CONFIG includes LST-F13 hub orphans (parts-catalog + abandonment-defaults)", () => {
    const maint = DOMAIN_CONFIG.find((d) => d.key === "maintenance");
    const acct = DOMAIN_CONFIG.find((d) => d.key === "accounting");
    expect(maint?.catalogs.some((c) => c.catalogKey === "parts-catalog" && c.live)).toBe(true);
    expect(acct?.catalogs.some((c) => c.catalogKey === "abandonment-defaults" && c.live)).toBe(true);
  });
});

describe("Lists reorg — /lists/hub/:domain resolves to DomainCatalogHubPage", () => {
  function renderHub(path: string) {
    return render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/lists/hub/:domain" element={<DomainCatalogHubPage />} />
        </Routes>
      </MemoryRouter>,
    );
  }

  it("renders only the requested domain's catalogs for a known key", () => {
    renderHub("/lists/hub/accounting");
    expect(screen.getByText("Accounting catalogs")).toBeTruthy();
    expect(screen.getByText("Chart of Accounts")).toBeTruthy();
  });

  it("falls back to ComingSoon for an unknown domain key", () => {
    renderHub("/lists/hub/not-a-domain");
    expect(screen.getByText("Roadmap note")).toBeTruthy();
  });
});

describe("Lists reorg — scroll-restore helper round-trips per pathname", () => {
  it("saves and reads a Y offset scoped to the pathname", () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
    };
    saveScrollPosition(storage, "/lists", 420);
    expect(readScrollPosition(storage, "/lists")).toBe(420);
    expect(readScrollPosition(storage, "/lists/hub/accounting")).toBe(0);
    expect(listsScrollKey("/lists")).toContain("/lists");
  });
});

describe("Lists reverse_link — buildDomainModulePath", () => {
  it("maps domains to live module routes", () => {
    expect(buildDomainModulePath("safety")).toBe("/safety");
    expect(buildDomainModulePath("dispatch")).toBe("/dispatch");
    expect(buildDomainModulePath("customers")).toBe("/customers");
    expect(buildDomainModulePath("reference")).toBeNull();
  });

  it("renders Open module link on domain section", () => {
    const accounting = sortDomainsForDisplay(DOMAIN_CONFIG)[0];
    render(
      <MemoryRouter>
        <DomainCatalogSection domain={accounting} onCatalogClick={vi.fn()} onDomainClick={vi.fn()} />
      </MemoryRouter>,
    );
    expect(screen.getByTestId("lists-domain-open-module-accounting")).toHaveAttribute("href", "/accounting");
  });
});
