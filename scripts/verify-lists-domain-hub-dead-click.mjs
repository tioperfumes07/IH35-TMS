#!/usr/bin/env node
/**
 * Lists /lists/:domain catch-all used to render ComingSoonPage for every known domain
 * (accounting, safety, drivers, …) even though DomainCatalogHubPage already existed at
 * /lists/hub/:domain. DomainRibbon "+ Create new catalog" and bookmarked /lists/accounting
 * URLs dead-clicked into ComingSoon.
 *
 * Proves:
 *   1. ListsDomainRoute Navigate-redirects known domain params to /lists/hub/:key before fallback.
 *   2. buildCatalogPath(domain, "_create"):
 *        - accounting → /lists/accounting/chart-of-accounts?create=1 (AccountDrawer deep-link)
 *        - other domains → /lists/hub/:domain (not bare /lists/:domain)
 *   3. /lists/hub/:domain still mounts DomainCatalogHubPage (Rule 07 — additive only).
 *   4. ChartOfAccountsListPage + AccountingCatalogListPage honor ?create=1.
 *   5. VoidCancelReasonsListPage honors ?create=1 → Create Entry modal (LST-F5211).
 *   6. Shared domain catalog list pages use useCreateQueryParam (LST-F5214 systemic sweep).
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const LABEL = "verify-lists-domain-hub-dead-click";
const ROOT = process.cwd();

const PATHS = {
  manifest: path.join(ROOT, "apps/frontend/src/routes/manifest.tsx"),
  catalogsMap: path.join(ROOT, "apps/frontend/src/pages/lists/components/AllCatalogsMap.tsx"),
  coaPage: path.join(ROOT, "apps/frontend/src/pages/lists/accounting/ChartOfAccountsListPage.tsx"),
  catalogListPage: path.join(
    ROOT,
    "apps/frontend/src/pages/lists/accounting/AccountingCatalogListPage.tsx"
  ),
  voidCancelPage: path.join(
    ROOT,
    "apps/frontend/src/pages/lists/accounting/VoidCancelReasonsListPage.tsx"
  ),
};

/** LST-F5214 — shared bases + safety/dispatch leaves that must honor ?create=1 via the hook. */
const SHARED_CREATE_DEEPLINK_FILES = [
  "apps/frontend/src/hooks/useCreateQueryParam.ts",
  "apps/frontend/src/pages/lists/dispatch/DispatchCatalogListPage.tsx",
  "apps/frontend/src/pages/lists/driver/DriverCatalogListPage.tsx",
  "apps/frontend/src/pages/lists/fleet/FleetCatalogListPage.tsx",
  "apps/frontend/src/pages/lists/fuel/FuelCatalogListPage.tsx",
  "apps/frontend/src/pages/lists/maintenance/MaintenanceCatalogListPage.tsx",
  "apps/frontend/src/pages/lists/GenericCatalogPage.tsx",
  "apps/frontend/src/pages/lists/dispatch/LoadCancellationReasonsListPage.tsx",
  "apps/frontend/src/pages/lists/drivers/TerminationReasonsListPage.tsx",
  "apps/frontend/src/pages/lists/safety/ComplaintTypesListPage.tsx",
  "apps/frontend/src/pages/lists/safety/DotViolationTypesListPage.tsx",
  "apps/frontend/src/pages/lists/safety/CompanyViolationTypesListPage.tsx",
  "apps/frontend/src/pages/lists/safety/InternalFineReasonsListPage.tsx",
  "apps/frontend/src/pages/lists/safety/CargoClaimReasonsListPage.tsx",
  "apps/frontend/src/pages/lists/safety/CivilFineTypesListPage.tsx",
  "apps/frontend/src/pages/lists/driver/DriverTeamsPage.tsx",
  "apps/frontend/src/pages/lists/drivers/DriversReferenceCatalogPage.tsx",
];

const KNOWN_DOMAIN_KEYS = [
  "accounting",
  "safety",
  "maintenance",
  "dispatch",
  "fuel",
  "drivers",
  "fleet",
  "names_master",
];

function read(rel) {
  const full = typeof rel === "string" && rel.startsWith("/") ? rel : path.join(ROOT, rel);
  if (!fs.existsSync(full)) return null;
  return fs.readFileSync(full, "utf8");
}

function fail(msg) {
  return msg;
}

export function collectProblems(sources = {}) {
  const manifest = sources.manifest ?? read(PATHS.manifest);
  const catalogsMap = sources.catalogsMap ?? read(PATHS.catalogsMap);
  const coaPage = sources.coaPage ?? read(PATHS.coaPage);
  const catalogListPage = sources.catalogListPage ?? read(PATHS.catalogListPage);
  const voidCancelPage = sources.voidCancelPage ?? read(PATHS.voidCancelPage);
  const errors = [];

  if (!manifest) errors.push(fail("missing apps/frontend/src/routes/manifest.tsx"));
  if (!catalogsMap) errors.push(fail("missing apps/frontend/src/pages/lists/components/AllCatalogsMap.tsx"));
  if (!coaPage) errors.push(fail("missing ChartOfAccountsListPage.tsx"));
  if (!catalogListPage) errors.push(fail("missing AccountingCatalogListPage.tsx"));
  if (!voidCancelPage) errors.push(fail("missing VoidCancelReasonsListPage.tsx"));
  if (errors.length) return errors;

  if (!/function ListsDomainRoute\(\)/.test(manifest)) {
    errors.push(fail("manifest missing ListsDomainRoute"));
  } else {
    const body = manifest.match(/function ListsDomainRoute\(\)\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";
    if (!/resolveListsDomainHubKey\(domain\)/.test(body)) {
      errors.push(fail("ListsDomainRoute must call resolveListsDomainHubKey(domain) before ComingSoon fallback"));
    }
    if (!/\/lists\/hub\/\$\{hubKey\}/.test(body)) {
      errors.push(fail("ListsDomainRoute must Navigate to /lists/hub/${hubKey} for known domains"));
    }
    const beforeComingSoon = body.split("ComingSoonPage")[0] ?? "";
    if (!/resolveListsDomainHubKey\(domain\)/.test(beforeComingSoon)) {
      errors.push(fail("ListsDomainRoute resolves hub key before rendering ComingSoonPage"));
    }
  }

  if (!/export function resolveListsDomainHubKey/.test(catalogsMap)) {
    errors.push(fail("AllCatalogsMap must export resolveListsDomainHubKey"));
  }

  // Accounting flyout Create must deep-link CoA create chrome (Live Chrome residual #709).
  if (!/chart-of-accounts\?create=1/.test(catalogsMap)) {
    errors.push(
      fail('buildCatalogPath accounting "_create" must return /lists/accounting/chart-of-accounts?create=1')
    );
  }
  // Non-accounting domains still use the domain hub (never bare /lists/:domain).
  if (!/return `\/lists\/hub\/\$\{domain\}`;/.test(catalogsMap)) {
    errors.push(fail('buildCatalogPath non-accounting "_create" must return /lists/hub/${domain}'));
  }
  if (/if \(catalogKey === "_create"\) return `\/lists\/hub\/\$\{domain\}`;/.test(catalogsMap)) {
    errors.push(
      fail('accounting "_create" must not unconditionally return /lists/hub/${domain} (AccountDrawer dead-click)')
    );
  }

  if (!/searchParams\.get\("create"\) !== "1"/.test(coaPage) && !/get\("create"\) === "1"/.test(coaPage)) {
    errors.push(fail("ChartOfAccountsListPage must honor ?create=1 → AccountDrawer"));
  }
  if (!/setDrawerOpen\(true\)/.test(coaPage)) {
    errors.push(fail("ChartOfAccountsListPage must open AccountDrawer on create deep-link"));
  }
  if (!/searchParams\.get\("create"\) !== "1"/.test(catalogListPage) && !/get\("create"\) === "1"/.test(catalogListPage)) {
    errors.push(fail("AccountingCatalogListPage must honor ?create=1 → AccountingCatalogModal"));
  }
  if (!/searchParams\.get\("create"\) !== "1"/.test(voidCancelPage) && !/get\("create"\) === "1"/.test(voidCancelPage)) {
    errors.push(fail("VoidCancelReasonsListPage must honor ?create=1 → Create Entry modal"));
  }
  if (!/setModalMode\("create"\)/.test(voidCancelPage)) {
    errors.push(fail("VoidCancelReasonsListPage must setModalMode(create) on create deep-link"));
  }

  // LST-F5214 — ratcheting shared catalog create deep-link (reads live disk; skip when selftest fixtures only).
  if (!sources.skipSharedCreateRatchet) {
    for (const rel of SHARED_CREATE_DEEPLINK_FILES) {
      const src = read(rel);
      if (!src) {
        errors.push(fail(`missing ${rel}`));
        continue;
      }
      if (rel.endsWith("useCreateQueryParam.ts")) {
        if (!/searchParams\.get\("create"\) !== "1"/.test(src)) {
          errors.push(fail("useCreateQueryParam must honor ?create=1"));
        }
        if (!/next\.delete\("create"\)/.test(src)) {
          errors.push(fail("useCreateQueryParam must strip create param after open"));
        }
        continue;
      }
      if (!/useCreateQueryParam/.test(src)) {
        errors.push(fail(`${path.basename(rel)} must use useCreateQueryParam for ?create=1`));
      }
    }
  }

  if (!/path="\/lists\/hub\/:domain"[\s\S]{0,200}?DomainCatalogHubPage/.test(manifest)) {
    errors.push(fail("/lists/hub/:domain must still mount DomainCatalogHubPage (Rule 07)"));
  }

  for (const key of KNOWN_DOMAIN_KEYS) {
    if (!new RegExp(`findDomainByKey\\("${key}"`).test(catalogsMap) && key !== "names_master") {
      // names_master resolved via route alias; others are direct keys in DOMAIN_CONFIG
      continue;
    }
  }

  return errors;
}

function selftest() {
  const goodManifest = `
function ListsDomainRoute() {
  const { domain } = useParams();
  const location = useLocation();
  if (domain) {
    const hubKey = resolveListsDomainHubKey(domain);
    if (hubKey) {
      return <Navigate to={\`/lists/hub/\${hubKey}\${location.search}\${location.hash}\`} replace />;
    }
  }
  return <ComingSoonPage />;
}
<Route path="/lists/hub/:domain" element={<ProtectedRoute><DomainCatalogHubPage /></ProtectedRoute>} />
`;
  const goodMap = `
export function resolveListsDomainHubKey(routeDomain) { return routeDomain; }
if (catalogKey === "_create") {
  if (domain === "accounting" || routeDomain === "accounting") {
    return "/lists/accounting/chart-of-accounts?create=1";
  }
  return \`/lists/hub/\${domain}\`;
}
`;
  const goodCoa = `useEffect(() => { if (searchParams.get("create") !== "1") return; setDrawerOpen(true); }, [searchParams]);`;
  const goodCatalogList = `useEffect(() => { if (searchParams.get("create") !== "1") return; setModalOpen(true); }, [searchParams]);`;
  const goodVoidCancel = `useEffect(() => { if (searchParams.get("create") !== "1") return; setModalMode("create"); }, [searchParams]);`;

  if (
    collectProblems({
      manifest: goodManifest,
      catalogsMap: goodMap,
      coaPage: goodCoa,
      catalogListPage: goodCatalogList,
      voidCancelPage: goodVoidCancel,
      skipSharedCreateRatchet: true,
    }).length
  ) {
    console.error(`${LABEL} --selftest FAIL: good fixture should pass`);
    process.exit(1);
  }

  const badManifest = `
function ListsDomainRoute() {
  return <ComingSoonPage />;
}
<Route path="/lists/hub/:domain" element={<ProtectedRoute><DomainCatalogHubPage /></ProtectedRoute>} />
`;
  const badErrors = collectProblems({
    manifest: badManifest,
    catalogsMap: goodMap,
    coaPage: goodCoa,
    catalogListPage: goodCatalogList,
    voidCancelPage: goodVoidCancel,
    skipSharedCreateRatchet: true,
  });
  if (!badErrors.some((e) => e.includes("resolveListsDomainHubKey"))) {
    console.error(`${LABEL} --selftest FAIL: bad ListsDomainRoute should fail`, badErrors);
    process.exit(1);
  }

  const badMap = `if (catalogKey === "_create") return \`/lists/hub/\${domain}\`;`;
  const badMapErrors = collectProblems({
    manifest: goodManifest,
    catalogsMap: badMap,
    coaPage: goodCoa,
    catalogListPage: goodCatalogList,
    voidCancelPage: goodVoidCancel,
    skipSharedCreateRatchet: true,
  });
  if (!badMapErrors.some((e) => e.includes("create=1") || e.includes("_create"))) {
    console.error(`${LABEL} --selftest FAIL: unconditional hub _create should fail`, badMapErrors);
    process.exit(1);
  }

  const badVoid = collectProblems({
    manifest: goodManifest,
    catalogsMap: goodMap,
    coaPage: goodCoa,
    catalogListPage: goodCatalogList,
    voidCancelPage: `// no create deep-link`,
    skipSharedCreateRatchet: true,
  });
  if (!badVoid.some((e) => e.includes("VoidCancelReasonsListPage must honor"))) {
    console.error(`${LABEL} --selftest FAIL: void-cancel missing ?create=1 should fail`, badVoid);
    process.exit(1);
  }

  console.log(`${LABEL} --selftest OK`);
}

function main() {
  if (process.argv.includes("--selftest")) return selftest();
  const errors = collectProblems();
  if (errors.length) {
    console.error(`${LABEL} FAIL:`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log(
    `${LABEL} OK — /lists/:domain → hub; accounting _create → CoA?create=1; DomainCatalogHubPage intact`
  );
}

main();
