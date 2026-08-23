#!/usr/bin/env node
/**
 * Customers reverse_link — Built for detail leaves with EntityLink on CustomerDetail.
 * Create/sync/edit/chrome honesty-dropped in required.json.
 *
 * @matrix-built {"modules":["customers"],"cols":["reverse_link"],"leaves":["detail.profile","detail.billing","detail.quality"],"task":"CUST-F5872-DETAIL-REVERSE-EXACT-LEAVES","vertical":"column-wave"}
 *
 * Self-test: node scripts/verify-customers-reverse-link-detail.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-customers-reverse-link-detail";
const DETAIL = "apps/frontend/src/pages/CustomerDetail.tsx";
const LIST_MASTER_DETAIL = "apps/frontend/src/pages/Customers.tsx";
const LOADS_ROUTE = "apps/backend/src/mdata/loads.routes.ts";
const INVOICES_PAGE = "apps/frontend/src/pages/accounting/InvoicesListPage.tsx";
const INVOICES_ROUTE = "apps/backend/src/accounting/invoices.routes.ts";
const BILLING_ROUTE = "apps/backend/src/mdata/customer-billing.routes.ts";
const CONTACTS_ROUTE = "apps/backend/src/mdata/customer-contacts.routes.ts";
const CUSTOMER_ROUTE = "apps/backend/src/mdata/customers.routes.ts";
const FINANCIAL_ROUTE = "apps/backend/src/mdata/customer-financial.routes.ts";
const CUSTOMER_INVOICES_ROUTE = "apps/backend/src/mdata/customer-invoices.routes.ts";
const CONTACTS_POLICY_MIGRATION = "db/migrations/202613100000_cust_f5974_archived_customer_contacts_read_scope.sql";
const QUALITY_EVENTS_ROUTE = "apps/backend/src/mdata/customer-quality-events.routes.ts";
const MDATA_API = "apps/frontend/src/api/mdata.ts";
const ROUTE_MANIFEST = "apps/frontend/src/routes/manifest.tsx";
const MATRIX = "docs/specs/scoreboard/modules/customers.required.json";
const SELF = "scripts/verify-customers-reverse-link-detail.mjs";
const CLAIMED_LEAVES = ["detail.profile", "detail.billing", "detail.quality"];
const EXACT_HEADER = ' * @matrix-built {"modules":["customers"],"cols":["reverse_link"],"leaves":["detail.profile","detail.billing","detail.quality"],"task":"CUST-F5872-DETAIL-REVERSE-EXACT-LEAVES","vertical":"column-wave"}';

const CHECKS = [
  {
    name: "authorized tax-id decryption failures propagate",
    file: CUSTOMER_ROUTE,
    pattern: /if \(includeTaxId && row\.tax_id_encrypted\) \{\s*taxId = decrypt\(row\.tax_id_encrypted as Buffer\);\s*\}/,
  },
  { name: "load EntityLink", file: DETAIL, pattern: /kind="load"/ },
  { name: "driver EntityLink", file: DETAIL, pattern: /kind="driver"/ },
  { name: "unit EntityLink", file: DETAIL, pattern: /kind="unit"/ },
  {
    name: "customer loads trailer EntityLinkOrTombstone",
    file: DETAIL,
    pattern: /key: "trailer_number"[\s\S]{0,300}<EntityLinkOrTombstone kind="trailer" id=\{load\.trailer_id\} name=\{load\.trailer_number\} noun="Trailer"/,
  },
  {
    name: "loads producer returns canonical trailer id and label",
    file: LOADS_ROUTE,
    pattern: /tr\.id AS trailer_id,\s*tr\.equipment_number AS trailer_number/,
  },
  {
    name: "loads producer scopes trailer assignment to load entity",
    file: LOADS_ROUTE,
    pattern: /WHERE lah\.load_id = l\.id\s*AND lah\.operating_company_id = l\.operating_company_id\s*AND lah\.new_trailer_id IS NOT NULL/,
  },
  { name: "invoice EntityLink", file: DETAIL, pattern: /kind="invoice"/ },
  { name: "vendor EntityLink (factoring)", file: DETAIL, pattern: /kind="vendor"/ },
  {
    name: "billing factor vendor drill consumes canonical producer label",
    file: DETAIL,
    pattern: /id=\{billingSummary\.factoring_company_vendor_id\}[\s\S]{0,180}name=\{billingSummary\.factoring_company_vendor_name\}[\s\S]{0,120}noun="Vendor"/,
  },
  {
    name: "list master-detail factor vendor drill consumes canonical producer label",
    file: LIST_MASTER_DETAIL,
    pattern: /label="Factoring company"[\s\S]{0,320}<EntityLinkOrTombstone[\s\S]{0,160}kind="vendor"[\s\S]{0,160}id=\{summary\.factoring_company_vendor_id\}[\s\S]{0,160}name=\{summary\.factoring_company_vendor_name\}[\s\S]{0,120}noun="Vendor"/,
  },
  {
    name: "billing producer returns factor vendor human label",
    file: BILLING_ROUTE,
    pattern: /fv\.vendor_name AS factoring_company_vendor_name/,
  },
  {
    name: "billing producer scopes factor vendor join to customer company",
    file: BILLING_ROUTE,
    pattern: /LEFT JOIN mdata\.vendors fv\s+ON fv\.id = c\.factoring_company_vendor_id\s+AND fv\.operating_company_id = c\.operating_company_id/,
  },
  {
    name: "billing response exposes nullable factor vendor label",
    file: BILLING_ROUTE,
    pattern: /factoring_company_vendor_name: customer\.factoring_company_vendor_name \?\? null/,
  },
  {
    name: "billing API contract types factor vendor label",
    file: MDATA_API,
    pattern: /export type CustomerBillingSummary = \{[\s\S]{0,260}factoring_company_vendor_name: string \| null;/,
  },
  {
    name: "archived customer quality history validates parent through same-company resolver",
    file: QUALITY_EVENTS_ROUTE,
    pattern: /SELECT id FROM mdata\.get_customer_same_company\(\$1::uuid, \$2::uuid\) LIMIT 1/,
  },
  {
    name: "archived customer base profile uses same-company full-row resolver",
    file: CUSTOMER_ROUTE,
    pattern: /SELECT \$\{CUSTOMER_SELECT_COLUMNS\} FROM mdata\.get_customer_same_company\(\$1::uuid, \$2::uuid\) LIMIT 1/,
  },
  {
    name: "archived customer detail profile uses same-company full-row resolver",
    file: CUSTOMER_ROUTE,
    pattern: /FROM mdata\.get_customer_same_company\(\$1::uuid, \$2::uuid\) c\s+LIMIT 1/,
  },
  {
    name: "archived parent customer label uses same-company resolver",
    file: CUSTOMER_ROUTE,
    pattern: /FROM mdata\.get_customer_same_company\(c\.parent_customer_id, c\.operating_company_id\) p/,
  },
  {
    name: "archived customer contacts validate parent through same-company resolver",
    file: CONTACTS_ROUTE,
    pattern: /FROM mdata\.get_customer_same_company\(\$1::uuid, \$2::uuid\)\s+LIMIT 1/,
  },
  {
    name: "archived customer contacts SELECT policy resolves parent in pinned company",
    file: CONTACTS_POLICY_MIGRATION,
    pattern: /CREATE POLICY cc_select ON mdata\.customer_contacts[\s\S]{0,420}FROM mdata\.get_customer_same_company\([\s\S]{0,180}current_setting\('app\.operating_company_id', true\)/,
  },
  {
    name: "contacts policy migration does not rewrite insert or update policy",
    file: CONTACTS_POLICY_MIGRATION,
    pattern: /INSERT\/UPDATE policies remain unchanged/,
  },
  {
    name: "archived customer billing reads same-company full row",
    file: BILLING_ROUTE,
    pattern: /FROM mdata\.get_customer_same_company\(\$1::uuid, \$2::uuid\) c/,
  },
  {
    name: "archived customer financial summary validates through same-company resolver",
    file: FINANCIAL_ROUTE,
    pattern: /FROM mdata\.get_customer_same_company\(\$1::uuid, \$2::uuid\)\s+LIMIT 1/,
  },
  {
    name: "customer financial summary authenticated read remains rate limited",
    file: FINANCIAL_ROUTE,
    pattern: /app\.get\("\/api\/v1\/mdata\/customers\/:id\/financial-summary", \{ config: \{ rateLimit: \{ max: 60, timeWindow: "1 minute" \} \} \}/,
  },
  {
    name: "customer financial document reverse read carries selected company scope",
    file: FINANCIAL_ROUTE,
    pattern: /const documents = await listAttachments\(user\.uuid, \{\s*operatingCompanyId: companyId,\s*entityType: "customer",\s*entityId: customerId,\s*\}\);/,
  },
  {
    name: "customer financial reverse failure remains visible",
    file: DETAIL,
    pattern: /if \(props\.error\) return <ListErrorBanner message="Failed to load customer financial overview\." onRetry=\{props\.onRetry\} \/>;/,
  },
  {
    name: "customer financial reverse failure can retry exact GET",
    file: DETAIL,
    pattern: /<CustomerFinancialOverviewSection[^>]*onRetry=\{\(\) => void financialSummaryQuery\.refetch\(\)\} \/>/,
  },
  {
    name: "archived customer invoice history validates through same-company resolver",
    file: CUSTOMER_INVOICES_ROUTE,
    pattern: /SELECT id FROM mdata\.get_customer_same_company\(\$1::uuid, \$2::uuid\) LIMIT 1/,
  },
  {
    name: "quality history remains scoped to the validated customer id",
    file: QUALITY_EVENTS_ROUTE,
    pattern: /const filters = \["e\.customer_id = \$1"\]/,
  },
  {
    name: "quality event GET requires selected company query",
    file: QUALITY_EVENTS_ROUTE,
    pattern: /const listQuerySchema = z\.object\(\{\s*operating_company_id: uuidSchema,/,
  },
  {
    name: "quality event GET resolves selected company",
    file: QUALITY_EVENTS_ROUTE,
    pattern: /app\.get\("\/api\/v1\/mdata\/customers\/:customer_id\/quality-events"[\s\S]{0,1600}resolveOperatingCompanyId\([\s\S]{0,180}parsedQuery\.data\.operating_company_id/,
  },
  {
    name: "quality event frontend GET carries selected company",
    file: MDATA_API,
    pattern: /listCustomerQualityEvents\(customerId: string, operatingCompanyId: string,[\s\S]{0,260}operating_company_id: operatingCompanyId/,
  },
  {
    name: "quality history query keys and enables by selected company",
    file: DETAIL,
    pattern: /queryKey: \["customer-quality-events", id, operatingCompanyId, showVoidedQuality\][\s\S]{0,260}listCustomerQualityEvents\(id, operatingCompanyId!, showVoidedQuality\)[\s\S]{0,160}enabled: Boolean\(id && operatingCompanyId\)/,
  },
  {
    name: "parent customer drill preserves nullable canonical label for tombstone handling",
    file: DETAIL,
    pattern: /kind="customer"\s+id=\{customer\.parent_customer_id\}\s+name=\{customer\.parent_customer_name\}\s+noun="Customer"[\s\S]{0,240}data-testid="customer-parent-record-link"/,
  },
  {
    name: "parent customer candidate GET failure exposes exact retry",
    file: DETAIL,
    pattern: /parentCandidatesQuery\.isError[\s\S]{0,500}title="Couldn't load parent customer choices"[\s\S]{0,500}parentCandidatesQuery\.refetch\(\)/,
  },
  { name: "sub-customer EntityLinkOrTombstone", file: DETAIL, pattern: /customer-sub-record-link-/ },
  {
    name: "payment application invoice EntityLinkOrTombstone",
    file: DETAIL,
    pattern: /applications\.map\(\(application\)[\s\S]{0,500}kind="invoice"[\s\S]{0,180}id=\{application\.invoice_id\}[\s\S]{0,180}name=\{application\.invoice_display_id\}/,
  },
  {
    name: "payment application amount remains visible beside invoice drill",
    file: DETAIL,
    pattern: /formatCurrencyCents\(application\.amount_cents\)/,
  },
  {
    name: "customer recent invoices View all preserves canonical customer id",
    file: DETAIL,
    pattern: /navigate\(`\/accounting\/invoices\?customer_id=\$\{encodeURIComponent\(id\)\}`\)/,
  },
  {
    name: "invoice list destination reads customer_id deep link",
    file: INVOICES_PAGE,
    pattern: /const customerId = searchParams\.get\("customer_id"\) \?\? "";/,
  },
  {
    name: "invoice list destination sends customer_id to producer",
    file: INVOICES_PAGE,
    pattern: /customer_id: customerId \|\| undefined/,
  },
  {
    name: "invoice producer applies canonical customer filter",
    file: INVOICES_ROUTE,
    pattern: /if \(q\.customer_id\) \{[\s\S]{0,180}extraWhere\.push\(`i\.customer_id = \$\$\{values\.length\}`\)/,
  },
  {
    name: "customer detail source is mounted",
    file: ROUTE_MANIFEST,
    pattern: /path="\/customers\/:id"[\s\S]{0,180}<CustomerDetailPage \/>/,
  },
  {
    name: "customer list master-detail source is mounted",
    file: ROUTE_MANIFEST,
    pattern: /path="\/customers"[\s\S]{0,180}<CustomersPage \/>/,
  },
  {
    name: "invoice list destination is mounted",
    file: ROUTE_MANIFEST,
    pattern: /path="\/accounting\/invoices"[\s\S]{0,180}<InvoicesListPage \/>/,
  },
];

const FORBIDDEN = [
  {
    name: "tax-id decryption failure must not masquerade as missing tax ID",
    file: CUSTOMER_ROUTE,
    pattern: /try \{[\s\S]{0,120}taxId = decrypt\([\s\S]{0,120}catch \{\s*taxId = null;/,
    mutate: (source) => source.replace(
      "taxId = decrypt(row.tax_id_encrypted as Buffer);",
      "try { taxId = decrypt(row.tax_id_encrypted as Buffer); } catch { taxId = null; }",
    ),
  },
  {
    name: "customer financial document failures must not become false-empty history",
    file: FINANCIAL_ROUTE,
    pattern: /listAttachments\(user\.uuid, \{[\s\S]{0,220}entityId: customerId,[\s\S]{0,80}\}\)\.catch\(\(\) => \[\]\)/,
    mutate: (source) => source.replace(
      'entityId: customerId,\n      });',
      'entityId: customerId,\n      }).catch(() => []);',
    ),
  },
  {
    name: "archived customer quality parent must not use RLS-hidden plain lookup",
    file: QUALITY_EVENTS_ROUTE,
    pattern: /app\.get\("\/api\/v1\/mdata\/customers\/:customer_id\/quality-events"[\s\S]{0,2200}SELECT id FROM mdata\.customers WHERE id = \$1 AND operating_company_id = \$2::uuid LIMIT 1/,
    mutate: (source) => source.replace("SELECT id FROM mdata.get_customer_same_company($1::uuid, $2::uuid) LIMIT 1", "SELECT id FROM mdata.customers WHERE id = $1 AND operating_company_id = $2::uuid LIMIT 1"),
  },
  {
    name: "archived customer quality rows must not be dropped by parent inner join",
    file: QUALITY_EVENTS_ROUTE,
    pattern: /app\.get\("\/api\/v1\/mdata\/customers\/:customer_id\/quality-events"[\s\S]{0,4200}JOIN mdata\.customers c ON c\.id = e\.customer_id/,
    mutate: (source) => source.replace("FROM mdata.customer_quality_events e", "FROM mdata.customer_quality_events e\n          JOIN mdata.customers c ON c.id = e.customer_id"),
  },
  {
    name: "archived customer contacts must not restore active-only parent lookup",
    file: CONTACTS_ROUTE,
    pattern: /FROM mdata\.customers\s+WHERE id = \$1\s+AND operating_company_id = \$2::uuid\s+AND deactivated_at IS NULL/,
    mutate: (source) => source.replace("FROM mdata.get_customer_same_company($1::uuid, $2::uuid)", "FROM mdata.customers\n      WHERE id = $1\n        AND operating_company_id = $2::uuid\n        AND deactivated_at IS NULL"),
  },
  {
    name: "archived customer contacts policy must not restore RLS-recursive plain parent lookup",
    file: CONTACTS_POLICY_MIGRATION,
    pattern: /CREATE POLICY cc_select[\s\S]{0,420}FROM mdata\.customers c/,
    mutate: (source) => source.replace("FROM mdata.get_customer_same_company(", "FROM mdata.customers c /* planted */ WHERE c.id IN (SELECT id FROM mdata.get_customer_same_company("),
  },
  {
    name: "archived customer billing must not restore RLS-hidden parent source",
    file: BILLING_ROUTE,
    pattern: /FROM mdata\.customers c\s+LEFT JOIN catalogs\.payment_terms/,
    mutate: (source) => source.replace("FROM mdata.get_customer_same_company($1::uuid, $2::uuid) c", "FROM mdata.customers c"),
  },
  {
    name: "archived customer financial summary must not restore RLS-hidden parent lookup",
    file: FINANCIAL_ROUTE,
    pattern: /FROM mdata\.customers\s+WHERE id = \$1::uuid\s+AND operating_company_id = \$2::uuid/,
    mutate: (source) => source.replace("FROM mdata.get_customer_same_company($1::uuid, $2::uuid)", "FROM mdata.customers\n          WHERE id = $1::uuid\n            AND operating_company_id = $2::uuid"),
  },
  {
    name: "archived customer invoices must not restore RLS-hidden parent lookup",
    file: CUSTOMER_INVOICES_ROUTE,
    pattern: /SELECT id FROM mdata\.customers WHERE id = \$1::uuid AND operating_company_id = \$2::uuid LIMIT 1/,
    mutate: (source) => source.replace("SELECT id FROM mdata.get_customer_same_company($1::uuid, $2::uuid) LIMIT 1", "SELECT id FROM mdata.customers WHERE id = $1::uuid AND operating_company_id = $2::uuid LIMIT 1"),
  },
];

function readSources() {
  return Object.fromEntries(
    [DETAIL, LIST_MASTER_DETAIL, LOADS_ROUTE, INVOICES_PAGE, INVOICES_ROUTE, BILLING_ROUTE, CONTACTS_ROUTE, CUSTOMER_ROUTE, FINANCIAL_ROUTE, CUSTOMER_INVOICES_ROUTE, CONTACTS_POLICY_MIGRATION, QUALITY_EVENTS_ROUTE, MDATA_API, ROUTE_MANIFEST, MATRIX, SELF].map((file) => [
      file,
      fs.readFileSync(path.join(ROOT, file), "utf8"),
    ]),
  );
}

function run(sources) {
  const failures = CHECKS.filter((c) => !c.pattern.test(sources[c.file])).map((c) => c.name);
  failures.push(...FORBIDDEN.filter((c) => c.pattern.test(sources[c.file])).map((c) => c.name));
  try {
    const matrix = JSON.parse(sources[MATRIX]);
    for (const id of CLAIMED_LEAVES) {
      const leaf = matrix.leaves?.find((item) => item.id === id);
      if (!leaf?.required?.includes("reverse_link")) failures.push(`exact Required ownership: ${id}:reverse_link`);
    }
  } catch {
    failures.push("customers Required matrix parses");
  }
  if (!sources[SELF].split("\n").includes(EXACT_HEADER)) failures.push("exact customer detail Built header");
  return failures;
}

if (process.argv.includes("--selftest")) {
  const live = readSources();
  if (run(live).length) {
    console.error(`${LABEL} SELFTEST FAIL live`);
    process.exit(1);
  }
  for (const check of CHECKS) {
    const globalPattern = new RegExp(check.pattern.source, check.pattern.flags.includes("g") ? check.pattern.flags : `${check.pattern.flags}g`);
    const plantedSource = live[check.file].replace(globalPattern, "/* planted reverse-link defect */");
    const planted = { ...live, [check.file]: plantedSource };
    if (plantedSource === live[check.file] || !run(planted).includes(check.name)) {
      console.error(`${LABEL} SELFTEST FAIL — planted defect stayed green: ${check.name}`);
      process.exit(1);
    }
  }
  for (const check of FORBIDDEN) {
    const plantedSource = check.mutate(live[check.file]);
    const planted = { ...live, [check.file]: plantedSource };
    if (plantedSource === live[check.file] || !run(planted).includes(check.name)) {
      console.error(`${LABEL} SELFTEST FAIL — planted forbidden regression stayed green: ${check.name}`);
      process.exit(1);
    }
  }
  for (const id of CLAIMED_LEAVES) {
    const plantedMatrix = live[MATRIX].replace(`"id": "${id}"`, `"id": "${id}.removed"`);
    if (plantedMatrix === live[MATRIX] || !run({ ...live, [MATRIX]: plantedMatrix }).includes(`exact Required ownership: ${id}:reverse_link`)) {
      console.error(`${LABEL} SELFTEST FAIL — exact leaf ownership stayed green: ${id}`);
      process.exit(1);
    }
  }
  const plantedSelf = live[SELF].replace(EXACT_HEADER, `${EXACT_HEADER}.removed`);
  if (plantedSelf === live[SELF] || !run({ ...live, [SELF]: plantedSelf }).includes("exact customer detail Built header")) {
    console.error(`${LABEL} SELFTEST FAIL — exact Built header stayed green`);
    process.exit(1);
  }
  const mutationCount = CHECKS.length + FORBIDDEN.length + CLAIMED_LEAVES.length + 1;
  console.log(`${LABEL} SELFTEST PASS — ${mutationCount}/${mutationCount} planted defects rejected`);
  process.exit(0);
}

const fails = run(readSources());
if (fails.length) {
  console.error(`${LABEL} FAIL:\n- ${fails.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — customers detail reverse_link ratcheted`);
