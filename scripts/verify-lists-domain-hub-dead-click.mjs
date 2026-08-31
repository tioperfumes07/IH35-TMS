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
 *   7. Payment Methods + Payment Terms thin wrappers use AccountingCatalogListPage (inherits ?create=1).
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
  paymentMethodsPage: path.join(
    ROOT,
    "apps/frontend/src/pages/lists/accounting/PaymentMethodsListPage.tsx"
  ),
  paymentTermsPage: path.join(
    ROOT,
    "apps/frontend/src/pages/lists/accounting/PaymentTermsListPage.tsx"
  ),
  classesPage: path.join(ROOT, "apps/frontend/src/pages/lists/accounting/ClassesListPage.tsx"),
  expenseCategoriesPage: path.join(
    ROOT,
    "apps/frontend/src/pages/lists/accounting/ExpenseCategoriesListPage.tsx"
  ),
  taxCodesPage: path.join(ROOT, "apps/frontend/src/pages/lists/accounting/TaxCodesListPage.tsx"),
  journalEntryTypesPage: path.join(
    ROOT,
    "apps/frontend/src/pages/lists/accounting/JournalEntryTypesListPage.tsx"
  ),
  currencyCodesPage: path.join(
    ROOT,
    "apps/frontend/src/pages/lists/accounting/CurrencyCodesListPage.tsx"
  ),
  qboCategoriesPage: path.join(
    ROOT,
    "apps/frontend/src/pages/lists/accounting/QboCategoriesListPage.tsx"
  ),
  accountRoleBindingsPage: path.join(
    ROOT,
    "apps/frontend/src/pages/lists/accounting/AccountRoleBindingsListPage.tsx"
  ),
  chartOfAccountsSeedsPage: path.join(
    ROOT,
    "apps/frontend/src/pages/lists/accounting/ChartOfAccountsSeedsListPage.tsx"
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
  "apps/frontend/src/pages/lists/dispatch/DispatchFlagColorsCatalog.tsx",
  "apps/frontend/src/pages/lists/maintenance/OemPartsCatalog.tsx",
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

function honorsCreateQueryParam(source, openCreatePattern) {
  const direct =
    /searchParams\.get\("create"\)\s*!==\s*"1"/.test(source) ||
    /(?:searchParams\.)?get\("create"\)\s*===\s*"1"/.test(source);
  const sharedHook =
    /useCreateQueryParam\s*\(\s*\{[\s\S]{0,800}?onOpenCreate\s*:\s*\(\)\s*=>\s*\{[\s\S]{0,800}?\}\s*,?\s*\}\s*\)/.test(
      source
    );
  return (direct || sharedHook) && openCreatePattern.test(source);
}

export function collectProblems(sources = {}) {
  const manifest = sources.manifest ?? read(PATHS.manifest);
  const catalogsMap = sources.catalogsMap ?? read(PATHS.catalogsMap);
  const coaPage = sources.coaPage ?? read(PATHS.coaPage);
  const catalogListPage = sources.catalogListPage ?? read(PATHS.catalogListPage);
  const voidCancelPage = sources.voidCancelPage ?? read(PATHS.voidCancelPage);
  const paymentMethodsPage = sources.paymentMethodsPage ?? read(PATHS.paymentMethodsPage);
  const paymentTermsPage = sources.paymentTermsPage ?? read(PATHS.paymentTermsPage);
  const classesPage = sources.classesPage ?? read(PATHS.classesPage);
  const expenseCategoriesPage = sources.expenseCategoriesPage ?? read(PATHS.expenseCategoriesPage);
  const taxCodesPage = sources.taxCodesPage ?? read(PATHS.taxCodesPage);
  const journalEntryTypesPage = sources.journalEntryTypesPage ?? read(PATHS.journalEntryTypesPage);
  const currencyCodesPage = sources.currencyCodesPage ?? read(PATHS.currencyCodesPage);
  const qboCategoriesPage = sources.qboCategoriesPage ?? read(PATHS.qboCategoriesPage);
  const accountRoleBindingsPage = sources.accountRoleBindingsPage ?? read(PATHS.accountRoleBindingsPage);
  const chartOfAccountsSeedsPage =
    sources.chartOfAccountsSeedsPage ?? read(PATHS.chartOfAccountsSeedsPage);
  const errors = [];

  if (!manifest) errors.push(fail("missing apps/frontend/src/routes/manifest.tsx"));
  if (!catalogsMap) errors.push(fail("missing apps/frontend/src/pages/lists/components/AllCatalogsMap.tsx"));
  if (!coaPage) errors.push(fail("missing ChartOfAccountsListPage.tsx"));
  if (!catalogListPage) errors.push(fail("missing AccountingCatalogListPage.tsx"));
  if (!voidCancelPage) errors.push(fail("missing VoidCancelReasonsListPage.tsx"));
  if (!paymentMethodsPage) errors.push(fail("missing PaymentMethodsListPage.tsx"));
  if (!paymentTermsPage) errors.push(fail("missing PaymentTermsListPage.tsx"));
  if (!classesPage) errors.push(fail("missing ClassesListPage.tsx"));
  if (!expenseCategoriesPage) errors.push(fail("missing ExpenseCategoriesListPage.tsx"));
  if (!taxCodesPage) errors.push(fail("missing TaxCodesListPage.tsx"));
  if (!journalEntryTypesPage) errors.push(fail("missing JournalEntryTypesListPage.tsx"));
  if (!currencyCodesPage) errors.push(fail("missing CurrencyCodesListPage.tsx"));
  if (!qboCategoriesPage) errors.push(fail("missing QboCategoriesListPage.tsx"));
  if (!accountRoleBindingsPage) errors.push(fail("missing AccountRoleBindingsListPage.tsx"));
  if (!chartOfAccountsSeedsPage) errors.push(fail("missing ChartOfAccountsSeedsListPage.tsx"));
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
  // Non-accounting domains: flyout Create deep-links preferred createable catalog ?create=1 (LST-F5216/5217).
  if (!/preferredByDomain/.test(catalogsMap)) {
    errors.push(fail('buildCatalogPath non-accounting "_create" must use preferredByDomain createable leaves'));
  }
  if (!/create=1/.test(catalogsMap.split('catalogKey === "_create"')[1]?.slice(0, 1200) ?? "")) {
    errors.push(fail('buildCatalogPath non-accounting "_create" must deep-link a catalog with ?create=1'));
  }
  // Must not unconditionally return hub-only for every domain's _create (accounting CoA carve-out stays).
  if (/if \(catalogKey === "_create"\) \{\s*return `\/lists\/hub\/\$\{domain\}`;/.test(catalogsMap)) {
    errors.push(fail('"_create" must not unconditionally return /lists/hub/${domain} for all domains'));
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

  // INBOX Lists create leaves — Payment Methods / Terms inherit AccountingCatalogListPage ?create=1.
  if (!/AccountingCatalogListPage/.test(paymentMethodsPage)) {
    errors.push(fail("PaymentMethodsListPage must wrap AccountingCatalogListPage (inherits ?create=1)"));
  }
  if (!/AccountingCatalogListPage/.test(paymentTermsPage)) {
    errors.push(fail("PaymentTermsListPage must wrap AccountingCatalogListPage (inherits ?create=1)"));
  }
  if (!/payment-methods/.test(catalogsMap) || !/Payment Methods/.test(catalogsMap)) {
    errors.push(fail("AllCatalogsMap must list live Payment Methods catalog"));
  }
  if (!/payment-terms/.test(catalogsMap) || !/Payment Terms/.test(catalogsMap)) {
    errors.push(fail("AllCatalogsMap must list live Payment Terms catalog"));
  }
  for (const [src, name] of [
    [classesPage, "ClassesListPage"],
    [expenseCategoriesPage, "ExpenseCategoriesListPage"],
    [taxCodesPage, "TaxCodesListPage"],
    [journalEntryTypesPage, "JournalEntryTypesListPage"],
    [currencyCodesPage, "CurrencyCodesListPage"],
    [qboCategoriesPage, "QboCategoriesListPage"],
    [accountRoleBindingsPage, "AccountRoleBindingsListPage"],
    [chartOfAccountsSeedsPage, "ChartOfAccountsSeedsListPage"],
  ]) {
    if (!/AccountingCatalogListPage/.test(src)) {
      errors.push(fail(`${name} must wrap AccountingCatalogListPage (inherits ?create=1)`));
    }
  }

  // Items + Detail Types: custom create chrome must still honor ?create=1.
  if (!sources.skipSharedCreateRatchet) {
    const itemsPage = read("apps/frontend/src/pages/lists/accounting/ItemsListPage.tsx");
    const detailTypesPage = read("apps/frontend/src/pages/lists/accounting/DetailTypesListPage.tsx");
    const postingTemplatesPage = read(
      "apps/frontend/src/pages/lists/accounting/PostingTemplatesListPage.tsx"
    );
    if (!itemsPage) errors.push(fail("missing ItemsListPage.tsx"));
    else if (!/searchParams\.get\("create"\) !== "1"/.test(itemsPage) && !/get\("create"\) === "1"/.test(itemsPage)) {
      errors.push(fail("ItemsListPage must honor ?create=1 → ItemEditorModal"));
    }
    if (!detailTypesPage) errors.push(fail("missing DetailTypesListPage.tsx"));
    else if (!honorsCreateQueryParam(detailTypesPage, /setModalMode\("create"\)/)) {
      errors.push(fail("DetailTypesListPage must honor ?create=1 → create modal"));
    }
    if (!postingTemplatesPage) errors.push(fail("missing PostingTemplatesListPage.tsx"));
    else if (
      !/searchParams\.get\("create"\) !== "1"/.test(postingTemplatesPage) &&
      !/get\("create"\) === "1"/.test(postingTemplatesPage)
    ) {
      errors.push(fail("PostingTemplatesListPage must honor ?create=1 → PostingTemplateModal"));
    }
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
  const productionShapedDetailTypes = `
useCreateQueryParam({
  companyId,
  onOpenCreate: () => {
    setSubmitError("");
    setActiveRow(null);
    setModalMode("create");
  },
});`;
  if (!honorsCreateQueryParam(productionShapedDetailTypes, /setModalMode\("create"\)/)) {
    console.error(`${LABEL} --selftest FAIL: production-shaped shared-hook fixture should pass`);
    process.exit(1);
  }
  for (const [name, source] of [
    ["hook removed", productionShapedDetailTypes.replace("useCreateQueryParam", "ignoreCreateQueryParam")],
    ["callback removed", productionShapedDetailTypes.replace("onOpenCreate", "onOpenEdit")],
    ["wrong modal mode", productionShapedDetailTypes.replace('setModalMode("create")', 'setModalMode("edit")')],
  ]) {
    if (honorsCreateQueryParam(source, /setModalMode\("create"\)/)) {
      console.error(`${LABEL} --selftest FAIL: ${name} mutation should fail`);
      process.exit(1);
    }
  }

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
  const preferredByDomain = { drivers: "termination-reasons" };
  const preferred = { catalogKey: "termination-reasons" };
  if (preferred?.catalogKey) {
    return "/lists/drivers/termination-reasons?create=1";
  }
  return \`/lists/hub/\${domain}\`;
}
`;
  const goodCoa = `useEffect(() => { if (searchParams.get("create") !== "1") return; setDrawerOpen(true); }, [searchParams]);`;
  const goodCatalogList = `useEffect(() => { if (searchParams.get("create") !== "1") return; setModalOpen(true); }, [searchParams]);`;
  const goodVoidCancel = `useEffect(() => { if (searchParams.get("create") !== "1") return; setModalMode("create"); }, [searchParams]);`;

  const goodPaymentMethods = `export function PaymentMethodsListPage() { return <AccountingCatalogListPage client={paymentMethodsCatalogClient} />; }`;
  const goodPaymentTerms = `export function PaymentTermsListPage() { return <AccountingCatalogListPage client={paymentTermsCatalogClient} />; }`;
  const goodClasses = `export function ClassesListPage() { return <AccountingCatalogListPage client={classesCatalogClient} />; }`;
  const goodExpenseCategories = `export function ExpenseCategoriesListPage() { return <AccountingCatalogListPage client={expenseCategoriesCatalogClient} />; }`;
  const goodTaxCodes = `export function TaxCodesListPage() { return <AccountingCatalogListPage client={taxCodesCatalogClient} />; }`;
  const goodJeTypes = `export function JournalEntryTypesListPage() { return <AccountingCatalogListPage client={journalEntryTypesCatalogClient} />; }`;
  const goodCurrency = `export function CurrencyCodesListPage() { return <AccountingCatalogListPage client={currencyCodesCatalogClient} />; }`;
  const goodQboCategories = `export function QboCategoriesListPage() { return <AccountingCatalogListPage client={qboCategoriesCatalogClient} />; }`;
  const goodRoleBindings = `export function AccountRoleBindingsListPage() { return <AccountingCatalogListPage client={accountRoleBindingsCatalogClient} readOnly />; }`;
  const goodCoaSeeds = `export function ChartOfAccountsSeedsListPage() { return <AccountingCatalogListPage client={chartOfAccountsSeedsCatalogClient} />; }`;
  const goodMapWithPaymentLeaves = `${goodMap}
{ name: "Payment Terms", live: true, catalogKey: "payment-terms" },
{ name: "Payment Methods", live: true, catalogKey: "payment-methods" },
`;

  if (
    collectProblems({
      manifest: goodManifest,
      catalogsMap: goodMapWithPaymentLeaves,
      coaPage: goodCoa,
      catalogListPage: goodCatalogList,
      voidCancelPage: goodVoidCancel,
      paymentMethodsPage: goodPaymentMethods,
      paymentTermsPage: goodPaymentTerms,
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
    catalogsMap: goodMapWithPaymentLeaves,
    coaPage: goodCoa,
    catalogListPage: goodCatalogList,
    voidCancelPage: goodVoidCancel,
    paymentMethodsPage: goodPaymentMethods,
    paymentTermsPage: goodPaymentTerms,
    classesPage: goodClasses,
    expenseCategoriesPage: goodExpenseCategories,
    taxCodesPage: goodTaxCodes,
    journalEntryTypesPage: goodJeTypes,
    currencyCodesPage: goodCurrency,
    qboCategoriesPage: goodQboCategories,
    accountRoleBindingsPage: goodRoleBindings,
    chartOfAccountsSeedsPage: goodCoaSeeds,
    skipSharedCreateRatchet: true,
  });
  if (!badErrors.some((e) => e.includes("resolveListsDomainHubKey"))) {
    console.error(`${LABEL} --selftest FAIL: bad ListsDomainRoute should fail`, badErrors);
    process.exit(1);
  }

  const barePaymentMethods = `export function PaymentMethodsListPage() { return <div>hand-rolled</div>; }`;
  const barePmErrors = collectProblems({
    manifest: goodManifest,
    catalogsMap: goodMapWithPaymentLeaves,
    coaPage: goodCoa,
    catalogListPage: goodCatalogList,
    voidCancelPage: goodVoidCancel,
    paymentMethodsPage: barePaymentMethods,
    paymentTermsPage: goodPaymentTerms,
    classesPage: goodClasses,
    expenseCategoriesPage: goodExpenseCategories,
    taxCodesPage: goodTaxCodes,
    journalEntryTypesPage: goodJeTypes,
    currencyCodesPage: goodCurrency,
    qboCategoriesPage: goodQboCategories,
    accountRoleBindingsPage: goodRoleBindings,
    chartOfAccountsSeedsPage: goodCoaSeeds,
    skipSharedCreateRatchet: true,
  });
  if (!barePmErrors.some((e) => e.includes("PaymentMethodsListPage must wrap AccountingCatalogListPage"))) {
    console.error(`${LABEL} --selftest FAIL: bare PaymentMethodsListPage should fail`, barePmErrors);
    process.exit(1);
  }

  const badMap = `if (catalogKey === "_create") { return \`/lists/hub/\${domain}\`; }`;
  const badMapErrors = collectProblems({
    manifest: goodManifest,
    catalogsMap: badMap,
    coaPage: goodCoa,
    catalogListPage: goodCatalogList,
    voidCancelPage: goodVoidCancel,
    skipSharedCreateRatchet: true,
  });
  if (!badMapErrors.some((e) => e.includes("create=1") || e.includes("_create"))) {
    console.error(`${LABEL} --selftest FAIL: hub-only _create should fail`, badMapErrors);
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
