#!/usr/bin/env node
/** @matrix-built {"modules":["factoring"],"cols":["reverse_link"],"leafRe":"^home\\.vendor_merges$","task":"LINK-F5183-vendor-merges-reverse"} */
/**
 * GUARD: both a driver's own profile and a vendor's own profile show the QBO vendor-merge rows
 * involving them (LINK-F5171 reverse_link sweep gap factoring:home.vendor_merges).
 *
 * mdata.driver_vendor_merges.driver_id is a real FK with a pre-built index
 * (idx_driver_vendor_merges_driver_recent) that was never used as a query filter.
 * from_qbo_vendor_id/to_qbo_vendor_id are QBO text ids, not FKs; listDriverVendorMerges now
 * resolves them to real internal vendor ids via mdata.vendors.qbo_vendor_id.
 *
 * Fix contract this guard pins:
 *   1. data-infra.service.ts's listDriverVendorMerges accepts optional driverId/vendorId filters,
 *      applies driverId server-side directly and vendorId via the resolved vendor join columns.
 *   2. data-infra.routes.ts's query schema accepts optional driver_id/vendor_id and forwards them.
 *   3. apps/frontend/src/api/data-infra.ts's listDriverVendorMerges accepts and forwards both.
 *   4. FactoringHome.tsx reads driver_id/vendor_id from the URL and forwards them to the query.
 *   5. DriverVendorMergesReverseSection.tsx (new) queries the driver-scoped endpoint;
 *      DriverProfilePage.tsx mounts it, and each resolved from/to vendor drills to its canonical
 *      profile (or renders an honest tombstone when the QBO id has no scoped internal match).
 *   6. VendorMergesReverseSection.tsx (new) queries the vendor-scoped endpoint; VendorDetail.tsx
 *      mounts it.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SERVICE = "apps/backend/src/data-infra/data-infra.service.ts";
const ROUTES = "apps/backend/src/data-infra/data-infra.routes.ts";
const API = "apps/frontend/src/api/data-infra.ts";
const HOME = "apps/frontend/src/pages/factoring/FactoringHome.tsx";
const DRIVER_SECTION = "apps/frontend/src/components/driver-profile/DriverVendorMergesReverseSection.tsx";
const DRIVER_PROFILE = "apps/frontend/src/pages/drivers/DriverProfilePage.tsx";
const VENDOR_SECTION = "apps/frontend/src/components/vendors/VendorMergesReverseSection.tsx";
const VENDOR_DETAIL = "apps/frontend/src/pages/VendorDetail.tsx";
const FILES = [SERVICE, ROUTES, API, HOME, DRIVER_SECTION, DRIVER_PROFILE, VENDOR_SECTION, VENDOR_DETAIL];
const LABEL = "verify-vendor-merges-reverse-section";
const SELFTEST = process.argv.includes("--selftest");

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

export function assertVendorMergesReverse(sources) {
  const src = {};
  for (const rel of FILES) src[rel] = sources?.[rel] ?? read(rel);
  const problems = [];
  const service = src[SERVICE];
  const routes = src[ROUTES];
  const api = src[API];
  const home = src[HOME];
  const driverSection = src[DRIVER_SECTION];
  const driverProfile = src[DRIVER_PROFILE];
  const vendorSection = src[VENDOR_SECTION];
  const vendorDetail = src[VENDOR_DETAIL];

  if (!/AND m\.driver_id = \$/.test(service)) {
    problems.push(`${SERVICE}: listDriverVendorMerges must filter by driver_id server-side when provided`);
  }
  if (!/LEFT JOIN mdata\.drivers d ON d\.id = m\.driver_id[\s\S]{0,100}d\.operating_company_id = m\.operating_company_id/.test(service) || !/AS driver_name/.test(service)) {
    problems.push(`${SERVICE}: merge list must resolve the driver label through an exact same-company join`);
  }
  if (!/driver_name\?: string \| null/.test(api)) {
    problems.push(`${API}: DriverVendorMergeRow must expose the nullable scoped driver name`);
  }
  if (!/<EntityLinkOrTombstone kind="driver" id=\{row\.driver_id\} name=\{row\.driver_name\} noun="Driver"/.test(home)) {
    problems.push(`${HOME}: vendor merge driver must use its scoped nullable human label`);
  }
  if (!/fromv\.id = \$[\s\S]{0,40}OR tov\.id = \$/.test(service)) {
    problems.push(`${SERVICE}: listDriverVendorMerges must filter by resolved vendor id (from or to) when vendorId provided`);
  }
  if (!/driver_id:\s*z\.string\(\)\.uuid\(\)\.optional\(\)/.test(routes)) {
    problems.push(`${ROUTES}: query schema must accept optional driver_id`);
  }
  if (!/vendor_id:\s*z\.string\(\)\.uuid\(\)\.optional\(\)/.test(routes)) {
    problems.push(`${ROUTES}: query schema must accept optional vendor_id`);
  }
  if (!/driverId:\s*query\.data\.driver_id/.test(routes)) {
    problems.push(`${ROUTES}: must forward driver_id to listDriverVendorMerges`);
  }
  if (!/export function listDriverVendorMerges\(companyId: string, filters:/.test(api)) {
    problems.push(`${API}: listDriverVendorMerges must accept a filters param`);
  }
  if (!/searchParams\.get\("driver_id"\)/.test(home)) {
    problems.push(`${HOME}: must read driver_id from URL search params`);
  }
  if (!/listDriverVendorMerges\(companyId,\s*\{[\s\S]{0,80}driver_id:\s*deepLinkDriverId/.test(home)) {
    problems.push(`${HOME}: must forward deepLinkDriverId to listDriverVendorMerges`);
  }
  // LST-F5193 — visible driver/vendor filters must write URL.
  if (!/setSearchParams/.test(home) || !/dataTestId="factoring-home-filter-driver"/.test(home)) {
    problems.push(`${HOME}: vendor merges reverse filters must sync to URL (setSearchParams + driver EntityPicker)`);
  }
  if (!/listDriverVendorMerges\(operatingCompanyId,\s*\{\s*driver_id:\s*driverId\s*\}\)/.test(driverSection)) {
    problems.push(`${DRIVER_SECTION}: must query merges scoped to driverId`);
  }
  if (!/import\s*\{\s*DriverVendorMergesReverseSection\s*\}/.test(driverProfile)) {
    problems.push(`${DRIVER_PROFILE}: must import DriverVendorMergesReverseSection`);
  }
  if (!/<DriverVendorMergesReverseSection[\s\S]*?driverId=\{id\}/.test(driverProfile)) {
    problems.push(`${DRIVER_PROFILE}: must mount <DriverVendorMergesReverseSection driverId={id} .../>`);
  }
  if (!/listDriverVendorMerges\(operatingCompanyId,\s*\{\s*vendor_id:\s*vendorId\s*\}\)/.test(vendorSection)) {
    problems.push(`${VENDOR_SECTION}: must query merges scoped to vendorId`);
  }
  if (!/import\s*\{\s*VendorMergesReverseSection\s*\}/.test(vendorDetail)) {
    problems.push(`${VENDOR_DETAIL}: must import VendorMergesReverseSection`);
  }
  if (!/<VendorMergesReverseSection[\s\S]*?vendorId=\{vendor\.id\}/.test(vendorDetail)) {
    problems.push(`${VENDOR_DETAIL}: must mount <VendorMergesReverseSection vendorId={vendor.id} .../>`);
  }
  // LINK-F5171: Open queue must be EntityLink filtered kinds (not bare Link to=).
  if (!/kind="factoring_vendor_merges_driver"/.test(driverSection) || /from "react-router-dom"/.test(driverSection)) {
    problems.push(`${DRIVER_SECTION}: Open queue must EntityLink kind=factoring_vendor_merges_driver (no bare Link)`);
  }
  if (!/kind="factoring_vendor_merges_vendor"/.test(vendorSection) || /from "react-router-dom"/.test(vendorSection)) {
    problems.push(`${VENDOR_SECTION}: Open queue must EntityLink kind=factoring_vendor_merges_vendor (no bare Link)`);
  }
  if (!/EntityLinkOrTombstone/.test(driverSection) ||
      !/kind="vendor"[\s\S]{0,100}id=\{m\.from_vendor_id\}[\s\S]{0,100}name=\{m\.from_vendor_name\}/.test(driverSection) ||
      !/kind="vendor"[\s\S]{0,100}id=\{m\.to_vendor_id\}[\s\S]{0,100}name=\{m\.to_vendor_name\}/.test(driverSection)) {
    problems.push(`${DRIVER_SECTION}: each resolved from/to vendor must use canonical EntityLinkOrTombstone`);
  }
  if (/id=\{driverId\}[\s\S]{0,160}from_vendor_name/.test(driverSection)) {
    problems.push(`${DRIVER_SECTION}: merge rows must not collapse vendor identities into a driver-filter queue link`);
  }
  if (!/entityLabel\(m\.from_vendor_name, m\.from_qbo_vendor_id, "Vendor"\)/.test(vendorSection) ||
      !/entityLabel\(m\.to_vendor_name, m\.to_qbo_vendor_id, "Vendor"\)/.test(vendorSection)) {
    problems.push(`${VENDOR_SECTION}: merge labels must reject raw QBO vendor-id fallbacks`);
  }
  return problems;
}

function selftest() {
  const good = {
    [SERVICE]: `
      let driverFilter = "";
      if (filters.driverId) { driverFilter = \`AND m.driver_id = $\${values.length}::uuid\`; }
      let vendorFilter = "";
      if (filters.vendorId) { vendorFilter = \`AND (fromv.id = $\${values.length}::uuid OR tov.id = $\${values.length}::uuid)\`; }
      SELECT NULLIF(TRIM(CONCAT(COALESCE(d.first_name, ''), ' ', COALESCE(d.last_name, ''))), '') AS driver_name
      FROM mdata.driver_vendor_merges m
      LEFT JOIN mdata.drivers d ON d.id = m.driver_id AND d.operating_company_id = m.operating_company_id
    `,
    [ROUTES]: `
      const driverVendorMergesQuerySchema = companyQuerySchema.extend({
        driver_id: z.string().uuid().optional(),
        vendor_id: z.string().uuid().optional(),
      });
      const rows = await listDriverVendorMerges(user.uuid, query.data.operating_company_id, 200, {
        driverId: query.data.driver_id,
        vendorId: query.data.vendor_id,
      });
    `,
    [API]: `
      export type DriverVendorMergeRow = { driver_name?: string | null };
      export function listDriverVendorMerges(companyId: string, filters: { driver_id?: string; vendor_id?: string } = {}) {
        return apiRequest(\`/api/v1/integrations/qbo/driver-vendor-merges\`);
      }
    `,
    [HOME]: `
      const [searchParams, setSearchParams] = useSearchParams();
      const deepLinkDriverId = searchParams.get("driver_id");
      const vendorMergesQuery = useQuery({
        queryFn: () =>
          listDriverVendorMerges(companyId, {
            driver_id: deepLinkDriverId ?? undefined,
            vendor_id: deepLinkVendorId ?? undefined,
          }),
      });
      dataTestId="factoring-home-filter-driver"
      <EntityLinkOrTombstone kind="driver" id={row.driver_id} name={row.driver_name} noun="Driver" />
    `,
    [DRIVER_SECTION]: `listDriverVendorMerges(operatingCompanyId, { driver_id: driverId }).then((r) => r.rows)
      kind="factoring_vendor_merges_driver"
      EntityLinkOrTombstone kind="vendor" id={m.from_vendor_id} name={m.from_vendor_name} noun="Vendor"
      EntityLinkOrTombstone kind="vendor" id={m.to_vendor_id} name={m.to_vendor_name} noun="Vendor"`,
    [DRIVER_PROFILE]: `
      import { DriverVendorMergesReverseSection } from "../../components/driver-profile/DriverVendorMergesReverseSection";
      <DriverVendorMergesReverseSection operatingCompanyId={companyId} driverId={id} />
    `,
    [VENDOR_SECTION]: `listDriverVendorMerges(operatingCompanyId, { vendor_id: vendorId }).then((r) => r.rows)
      kind="factoring_vendor_merges_vendor"
      entityLabel(m.from_vendor_name, m.from_qbo_vendor_id, "Vendor")
      entityLabel(m.to_vendor_name, m.to_qbo_vendor_id, "Vendor")`,
    [VENDOR_DETAIL]: `
      import { VendorMergesReverseSection } from "../components/vendors/VendorMergesReverseSection";
      <VendorMergesReverseSection operatingCompanyId={companyId} vendorId={vendor.id} />
    `,
  };
  const goodProblems = assertVendorMergesReverse(good);
  if (goodProblems.length) {
    console.error(`${LABEL} SELFTEST FAIL — known-good fixture flagged: ${goodProblems.join("; ")}`);
    process.exit(1);
  }

  const mutations = [
    { ...good, [SERVICE]: good[SERVICE].replace('driverFilter = `AND m.driver_id = $${values.length}::uuid`;', "") },
    { ...good, [SERVICE]: good[SERVICE].replace('vendorFilter = `AND (fromv.id = $${values.length}::uuid OR tov.id = $${values.length}::uuid)`;', "") },
    { ...good, [SERVICE]: good[SERVICE].replace("d.operating_company_id = m.operating_company_id", "TRUE") },
    { ...good, [API]: good[API].replace("driver_name?: string | null", "driver_name?: never") },
    { ...good, [HOME]: good[HOME].replace("name={row.driver_name}", "name={null}") },
    { ...good, [ROUTES]: good[ROUTES].replace("driver_id: z.string().uuid().optional(),\n        vendor_id: z.string().uuid().optional(),", "") },
    { ...good, [ROUTES]: good[ROUTES].replace("driverId: query.data.driver_id,", "") },
    { ...good, [API]: good[API].replace("filters: { driver_id?: string; vendor_id?: string } = {}", "") },
    { ...good, [HOME]: good[HOME].replace('searchParams.get("driver_id")', '""') },
    { ...good, [HOME]: good[HOME].replace(/setSearchParams/g, "setUrlParams") },
    { ...good, [HOME]: good[HOME].replace("driver_id: deepLinkDriverId ?? undefined,", "") },
    { ...good, [DRIVER_SECTION]: good[DRIVER_SECTION].replace("{ driver_id: driverId }", "{}") },
    { ...good, [DRIVER_PROFILE]: good[DRIVER_PROFILE].replace("import { DriverVendorMergesReverseSection }", "// removed") },
    { ...good, [DRIVER_PROFILE]: good[DRIVER_PROFILE].replace("driverId={id}", "") },
    { ...good, [VENDOR_SECTION]: good[VENDOR_SECTION].replace("{ vendor_id: vendorId }", "{}") },
    { ...good, [VENDOR_DETAIL]: good[VENDOR_DETAIL].replace("import { VendorMergesReverseSection }", "// removed") },
    { ...good, [VENDOR_DETAIL]: good[VENDOR_DETAIL].replace("vendorId={vendor.id}", "") },
    { ...good, [DRIVER_SECTION]: good[DRIVER_SECTION].replace("id={m.from_vendor_id}", "id={driverId}") },
    { ...good, [DRIVER_SECTION]: good[DRIVER_SECTION].replace("id={m.to_vendor_id}", "id={driverId}") },
    { ...good, [VENDOR_SECTION]: good[VENDOR_SECTION].replace(/entityLabel/g, "rawLabel") },
    {
      ...good,
      [DRIVER_SECTION]: good[DRIVER_SECTION].replace('kind="factoring_vendor_merges_driver"', 'from "react-router-dom"'),
    },
    {
      ...good,
      [VENDOR_SECTION]: good[VENDOR_SECTION].replace('kind="factoring_vendor_merges_vendor"', 'from "react-router-dom"'),
    },
  ];
  for (const [i, mutated] of mutations.entries()) {
    if (assertVendorMergesReverse(mutated).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — mutation ${i} escaped detection`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} SELFTEST PASS — ${mutations.length} mutations all detected`);
  process.exit(0);
}

if (SELFTEST) selftest();

const failures = assertVendorMergesReverse();
if (failures.length) {
  console.error(`${LABEL} FAIL:\n${failures.map((f) => ` - ${f}`).join("\n")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS`);
