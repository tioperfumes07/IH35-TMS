import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import {
  DOMAIN_CONFIG,
  DomainCatalogSection,
  buildCatalogPath,
  sortDomainsForDisplay,
} from "./AllCatalogsMap";
import { DomainCatalogHubPage } from "../DomainCatalogHubPage";
import { listsScrollKey, readScrollPosition, saveScrollPosition } from "../ListsHubPage";

// Row-count badge pulls live counts via a react-query hook; stub it so these unit tests stay pure.
vi.mock("./DomainRowCountBadge", () => ({
  DomainRowCountBadge: () => <span data-testid="row-count-badge" />,
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
    render(<DomainCatalogSection domain={accounting} onCatalogClick={vi.fn()} onDomainClick={onDomainClick} />);
    const header = screen.getByTestId("domain-header-link");
    expect(header.tagName).toBe("BUTTON");
    fireEvent.click(header);
    expect(onDomainClick).toHaveBeenCalledWith("accounting");
  });

  it("falls back to a plain span when no onDomainClick is provided", () => {
    render(<DomainCatalogSection domain={accounting} onCatalogClick={vi.fn()} />);
    expect(screen.queryByTestId("domain-header-link")).toBeNull();
  });
});

describe("Lists reorg — buildCatalogPath (shared resolver)", () => {
  it("resolves dispatch, drivers-reference, names, and default paths", () => {
    expect(buildCatalogPath("dispatch", "load-types")).toBe("/lists/dispatch/load-types");
    expect(buildCatalogPath("drivers", "license-classes")).toBe("/lists/drivers/license-classes");
    expect(buildCatalogPath("drivers", "pay-types")).toBe("/lists/driver/pay-types"); // normalized + default
    expect(buildCatalogPath("names_master", "brokers")).toBe("/lists/names/brokers");
    expect(buildCatalogPath("accounting", "chart-of-accounts")).toBe("/lists/accounting/chart-of-accounts");
    expect(buildCatalogPath("accounting", "_create")).toBe("/lists/accounting");
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
