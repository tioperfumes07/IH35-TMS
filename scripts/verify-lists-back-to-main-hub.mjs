#!/usr/bin/env node
/**
 * LST-F3352 — Lists ← back-arrow + Catalog Index dual-path.
 *
 * Live (USMCA 2026-08-15): Catalog Index → Account Types opened
 * /lists/catalogs/accounting/account-types-lookup with Back → /lists/catalogs
 * (Catalog Index), not the main Lists hub. Catalog Index "Open Accounts" also
 * hit factory GenericCatalogPage instead of the bespoke QBO CoA drawer page.
 *
 * Proves:
 *   1. GenericCatalogPage BackArrowHeader backTo="/lists"
 *   2. ListsSubNav Catalog domains → /lists/hub/:domain (parent href /lists)
 *   3. CatalogIndex prefers buildCatalogPath for live DOMAIN_CONFIG catalogs
 *      (chart-of-accounts / items never stay on /lists/catalogs/…)
 *   4. DomainCatalogHubPage has no nested bordered card (box-in-box)
 *   5. UniversalListToolbar exposes QBO date presets when ranging a date field
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const LABEL = "verify-lists-back-to-main-hub";
const ROOT = process.cwd();

const PATHS = {
  generic: "apps/frontend/src/pages/lists/GenericCatalogPage.tsx",
  subnav: "apps/frontend/src/pages/lists/ListsSubNav.tsx",
  index: "apps/frontend/src/pages/lists/CatalogIndex.tsx",
  hub: "apps/frontend/src/pages/lists/DomainCatalogHubPage.tsx",
  toolbar: "apps/frontend/src/components/table/UniversalListToolbar.tsx",
};

function read(rel) {
  const full = path.join(ROOT, rel);
  if (!fs.existsSync(full)) return null;
  return fs.readFileSync(full, "utf8");
}

function collectProblems(sources = {}) {
  const errors = [];
  const generic = sources.generic ?? read(PATHS.generic);
  const subnav = sources.subnav ?? read(PATHS.subnav);
  const index = sources.index ?? read(PATHS.index);
  const hub = sources.hub ?? read(PATHS.hub);
  const toolbar = sources.toolbar ?? read(PATHS.toolbar);

  for (const [name, src] of Object.entries({ generic, subnav, index, hub, toolbar })) {
    if (!src) errors.push(`missing ${PATHS[name] ?? name}`);
  }
  if (errors.length) return errors;

  if (/backTo=["']\/lists\/catalogs["']/.test(generic)) {
    errors.push('GenericCatalogPage must backTo="/lists" (not /lists/catalogs)');
  }
  if (!/backTo=["']\/lists["']/.test(generic)) {
    errors.push('GenericCatalogPage must include backTo="/lists"');
  }

  if (!/href:\s*`\/lists\/hub\/\$\{domain\}`/.test(subnav) && !/href:\s*"\/lists\/hub\/\$\{domain\}"/.test(subnav)) {
    // template literal form
    if (!/\/lists\/hub\/\$\{domain\}/.test(subnav)) {
      errors.push("ListsSubNav Catalog domains children must href /lists/hub/${domain}");
    }
  }
  if (/label:\s*"Catalog domains"[\s\S]{0,200}?href:\s*"\/lists\/catalogs"/.test(subnav)) {
    errors.push('ListsSubNav "Catalog domains" parent must not href /lists/catalogs');
  }

  if (!/catalogIndexOpenPath|buildCatalogPath/.test(index)) {
    errors.push("CatalogIndex must prefer hub/bespoke paths via catalogIndexOpenPath/buildCatalogPath");
  }
  if (!/chart-of-accounts/.test(index) && !/buildCatalogPath/.test(index)) {
    errors.push("CatalogIndex must route live hub catalogs through buildCatalogPath");
  }
  // Must not hardcode factory-only for chart-of-accounts open path when live on hub
  if (/factoryRoutePath\(definition\.domain,\s*definition\.catalogKey\)/.test(index) && !/catalogIndexOpenPath/.test(index)) {
    errors.push("CatalogIndex must not always use factoryRoutePath — prefer catalogIndexOpenPath");
  }

  if (/rounded-sm border border-slate-200 bg-white p-3[\s\S]{0,120}?DomainCatalogSection/.test(hub)) {
    errors.push("DomainCatalogHubPage must not wrap DomainCatalogSection in a nested bordered card (box-in-box)");
  }

  if (!/QBO date range preset|applyUniversalDatePreset|This Month/.test(toolbar)) {
    errors.push("UniversalListToolbar must expose QBO date range presets (This Month / …) for date fields");
  }

  return errors;
}

function selftest() {
  const good = {
    generic: 'backTo="/lists"',
    subnav: 'label: "Catalog domains", href: "/lists", children: DOMAIN_ORDER.map((domain) => ({ href: `/lists/hub/${domain}` }))',
    index: "export function catalogIndexOpenPath() {} buildCatalogPath(hubDomain, catalogKey)",
    hub: "<div className=\"space-y-2\"><DomainCatalogSection domain={domain} onCatalogClick={openCatalog} /></div>",
    toolbar: "aria-label=\"QBO date range preset\" applyUniversalDatePreset This Month",
  };
  if (collectProblems(good).length) {
    console.error(`${LABEL} --selftest FAIL: good fixture should pass`, collectProblems(good));
    process.exit(1);
  }
  const bad = {
    generic: 'backTo="/lists/catalogs"',
    subnav: 'label: "Catalog domains", href: "/lists/catalogs", children: [{ href: "/lists/accounting" }]',
    index: "routePath: factoryRoutePath(definition.domain, definition.catalogKey)",
    hub: '<div className="rounded-sm border border-slate-200 bg-white p-3"><DomainCatalogSection domain={domain} onCatalogClick={openCatalog} /></div>',
    toolbar: "aria-label=\"Date or amount range\" From To Apply",
  };
  const badErrs = collectProblems(bad);
  if (badErrs.length < 4) {
    console.error(`${LABEL} --selftest FAIL: bad fixture should fail ≥4 ways`, badErrs);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS`);
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }
  const errors = collectProblems();
  if (errors.length) {
    console.error(`${LABEL} FAIL (${errors.length}):`);
    for (const e of errors) console.error(`  ✗ ${e}`);
    process.exit(1);
  }
  console.log(`${LABEL} PASS`);
}

main();
