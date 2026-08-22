#!/usr/bin/env node
/** @matrix-built {"modules":["factoring"],"cols":["reverse_link"],"leaves":["home.recourse_pipeline","home.chargebacks_fees"],"task":"FACT-F5838-RECOURSE-CHARGEBACKS-REVERSE-EXACT-LEAVES"} */
/**
 * GUARD: a customer's (and, for recourse, a load's) own page can jump into the factoring recourse
 * pipeline / chargebacks-fees tables pre-scoped to them, and both backend routes + FactoringHome.tsx
 * honor the deep link (LINK-F5171 reverse_link sweep gaps factoring:home.recourse_pipeline and
 * factoring:home.chargebacks_fees).
 *
 * GET /api/v1/factoring/recourse-pipeline already LATERAL-joins accounting.invoices for
 * customer_id; views.factoring_chargebacks_fees carries no entity FK at all -- both now resolve
 * customer_id (and recourse also load_id) via that same join, exposed as optional filters.
 *
 * Fix contract this guard pins:
 *   1. factoring.routes.ts's recourseQuerySchema/chargebacksFeesQuerySchema accept optional
 *      customer_id (both) and load_id (recourse only), applied server-side in SQL.
 *   2. FactoringHome.tsx reads customer_id/load_id from the URL and forwards them to both queries.
 *   3. FactoringTab.tsx (load-side) renders EntityLink kind="factoring_recourse_load" id={loadId}.
 *   4. EntityLink.tsx defines "factoring_recourse_load" -> /factoring/recourse-pipeline?load_id=.
 *   5. CustomerFactoringRecourseReverseSection.tsx (new) queries both endpoints scoped to
 *      customer_id and links back; CustomerDetail.tsx mounts it.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ROUTES = "apps/backend/src/factoring/factoring.routes.ts";
const HOME = "apps/frontend/src/pages/factoring/FactoringHome.tsx";
const FACTORING_TAB = "apps/frontend/src/components/dispatch/tabs/FactoringTab.tsx";
const ENTITY_LINK = "apps/frontend/src/components/shared/EntityLink.tsx";
const SECTION = "apps/frontend/src/components/customers/CustomerFactoringRecourseReverseSection.tsx";
const CUSTOMER_DETAIL = "apps/frontend/src/pages/CustomerDetail.tsx";
const SELF = "scripts/verify-factoring-recourse-chargebacks-reverse-section.mjs";
const REQUIRED = "docs/specs/scoreboard/modules/factoring.required.json";
const FILES = [ROUTES, HOME, FACTORING_TAB, ENTITY_LINK, SECTION, CUSTOMER_DETAIL, SELF, REQUIRED];
const LABEL = "verify-factoring-recourse-chargebacks-reverse-section";
const SELFTEST = process.argv.includes("--selftest");

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

export function assertFactoringRecourseChargebacksReverse(sources) {
  const src = {};
  for (const rel of FILES) src[rel] = sources?.[rel] ?? read(rel);
  const problems = [];
  const routes = src[ROUTES];
  const home = src[HOME];
  const factoringTab = src[FACTORING_TAB];
  const entityLink = src[ENTITY_LINK];
  const section = src[SECTION];
  const customerDetail = src[CUSTOMER_DETAIL];
  const self = src[SELF];
  const required = src[REQUIRED];

  if (!/^\/\*\* @matrix-built \{"modules":\["factoring"\],"cols":\["reverse_link"\],"leaves":\["home\.recourse_pipeline","home\.chargebacks_fees"\],"task":"FACT-F5838-RECOURSE-CHARGEBACKS-REVERSE-EXACT-LEAVES"\} \*\/$/m.test(self)) {
    problems.push(`${SELF}: Built annotation must own the two exact recourse/chargebacks reverse leaves`);
  }
  let requiredLeaves = [];
  try {
    requiredLeaves = JSON.parse(required).leaves ?? [];
  } catch {
    problems.push(`${REQUIRED}: must remain valid JSON`);
  }
  for (const leaf of ["home.recourse_pipeline", "home.chargebacks_fees"]) {
    const entry = requiredLeaves.find((candidate) => candidate.id === leaf);
    if (!entry?.required?.includes("reverse_link")) problems.push(`${REQUIRED}: ${leaf} must remain a Required reverse_link leaf`);
  }

  if (!/recourseQuerySchema = companyQuerySchema\.extend\(\{[\s\S]*?customer_id:\s*z\.string\(\)\.uuid\(\)\.optional\(\)/.test(routes)) {
    problems.push(`${ROUTES}: recourseQuerySchema must accept optional customer_id`);
  }
  if (!/load_id:\s*z\.string\(\)\.uuid\(\)\.optional\(\)/.test(routes)) {
    problems.push(`${ROUTES}: recourseQuerySchema must accept optional load_id`);
  }
  if (!/chargebacksFeesQuerySchema = companyQuerySchema\.extend/.test(routes)) {
    problems.push(`${ROUTES}: must define chargebacksFeesQuerySchema with optional customer_id`);
  }
  if (!/searchParams\.get\("customer_id"\)/.test(home) || !/searchParams\.get\("load_id"\)/.test(home)) {
    problems.push(`${HOME}: must read customer_id and load_id from URL search params`);
  }
  if (!/getFactoringRecoursePipeline\(companyId,\s*200,\s*\{/.test(home)) {
    problems.push(`${HOME}: must forward customer_id/load_id to getFactoringRecoursePipeline`);
  }
  if (!/getFactoringChargebacksFees\(companyId,\s*deepLinkCustomerId/.test(home)) {
    problems.push(`${HOME}: must forward customer_id to getFactoringChargebacksFees`);
  }
  // LST-F5193 — visible reverse filters must write URL.
  if (!/setSearchParams/.test(home) || !/dataTestId="factoring-home-filter-customer"/.test(home) || !/dataTestId="factoring-home-filter-load"/.test(home)) {
    problems.push(`${HOME}: recourse/chargebacks reverse filters must sync to URL (setSearchParams + EntityPickers)`);
  }
  if (!/kind="factoring_recourse_load"/.test(factoringTab) || !/id=\{loadId\}/.test(factoringTab)) {
    problems.push(`${FACTORING_TAB}: must render EntityLink kind="factoring_recourse_load" id={loadId}`);
  }
  if (!/case "factoring_recourse_load":/.test(entityLink) || !/\/factoring\/recourse-pipeline\?load_id=\$\{id\}/.test(entityLink)) {
    problems.push(`${ENTITY_LINK}: must define factoring_recourse_load -> /factoring/recourse-pipeline?load_id=<id>`);
  }
  if (!/getFactoringRecoursePipeline\(operatingCompanyId,\s*200,\s*\{\s*customer_id:\s*customerId\s*\}\)/.test(section)) {
    problems.push(`${SECTION}: must query recourse pipeline scoped to customer_id`);
  }
  if (!/getFactoringChargebacksFees\(operatingCompanyId,\s*customerId\)/.test(section)) {
    problems.push(`${SECTION}: must query chargebacks fees scoped to customerId`);
  }
  if (!/import\s*\{\s*CustomerFactoringRecourseReverseSection\s*\}/.test(customerDetail)) {
    problems.push(`${CUSTOMER_DETAIL}: must import CustomerFactoringRecourseReverseSection`);
  }
  if (!/<CustomerFactoringRecourseReverseSection[\s\S]*?customerId=\{id\}/.test(customerDetail)) {
    problems.push(`${CUSTOMER_DETAIL}: must mount <CustomerFactoringRecourseReverseSection customerId={id} .../>`);
  }

  if (!/factoring_recourse_customer/.test(section) || !/factoring_chargebacks_customer/.test(section)) {
    problems.push(`${SECTION}: must use EntityLink kinds factoring_recourse_customer + factoring_chargebacks_customer`);
  }
  if (/from "react-router-dom"/.test(section)) {
    problems.push(`${SECTION}: must not import react-router Link`);
  }

  return problems;
}

function selftest() {
  const good = {
    [ROUTES]: `
      const recourseQuerySchema = companyQuerySchema.extend({
        customer_id: z.string().uuid().optional(),
        load_id: z.string().uuid().optional(),
      });
      const chargebacksFeesQuerySchema = companyQuerySchema.extend({
        customer_id: z.string().uuid().optional(),
      });
    `,
    [HOME]: `
      const [searchParams, setSearchParams] = useSearchParams();
      const deepLinkCustomerId = searchParams.get("customer_id");
      const deepLinkLoadId = searchParams.get("load_id");
      getFactoringRecoursePipeline(companyId, 200, {
        customer_id: deepLinkCustomerId ?? undefined,
        load_id: deepLinkLoadId ?? undefined,
      });
      getFactoringChargebacksFees(companyId, deepLinkCustomerId ?? undefined);
      dataTestId="factoring-home-filter-customer"
      dataTestId="factoring-home-filter-load"
    `,
    [FACTORING_TAB]: `<EntityLink kind="factoring_recourse_load" id={loadId} label="View" />`,
    [ENTITY_LINK]: `
      case "factoring_recourse_load":
        return \`/factoring/recourse-pipeline?load_id=\${id}\`;
    `,
    [SECTION]: `
      getFactoringRecoursePipeline(operatingCompanyId, 200, { customer_id: customerId });
      getFactoringChargebacksFees(operatingCompanyId, customerId);
    
      factoring_recourse_customer factoring_chargebacks_customer`,
    [CUSTOMER_DETAIL]: `
      import { CustomerFactoringRecourseReverseSection } from "../components/customers/CustomerFactoringRecourseReverseSection";
      <CustomerFactoringRecourseReverseSection operatingCompanyId={operatingCompanyId} customerId={id} />
    `,
    [SELF]: `/** @matrix-built {"modules":["factoring"],"cols":["reverse_link"],"leaves":["home.recourse_pipeline","home.chargebacks_fees"],"task":"FACT-F5838-RECOURSE-CHARGEBACKS-REVERSE-EXACT-LEAVES"} */`,
    [REQUIRED]: `{"leaves":[{"id": "home.recourse_pipeline", "required": ["reverse_link"]},{"id": "home.chargebacks_fees", "required": ["reverse_link"]}]}`,
  };
  const goodProblems = assertFactoringRecourseChargebacksReverse(good);
  if (goodProblems.length) {
    console.error(`${LABEL} SELFTEST FAIL — known-good fixture flagged: ${goodProblems.join("; ")}`);
    process.exit(1);
  }

  const mutations = [
    { ...good, [ROUTES]: good[ROUTES].replace("customer_id: z.string().uuid().optional(),\n        load_id: z.string().uuid().optional(),", "") },
    { ...good, [ROUTES]: good[ROUTES].replace("load_id: z.string().uuid().optional(),\n      });\n      const chargebacksFeesQuerySchema", "});\n      const chargebacksFeesQuerySchema") },
    { ...good, [ROUTES]: good[ROUTES].replace("const chargebacksFeesQuerySchema = companyQuerySchema.extend({", "const chargebacksFeesQuerySchema = z.object({") },
    { ...good, [HOME]: good[HOME].replace('searchParams.get("customer_id")', '""') },
    { ...good, [HOME]: good[HOME].replace(/setSearchParams/g, "setUrlParams") },
    { ...good, [HOME]: good[HOME].replace("getFactoringRecoursePipeline(companyId, 200, {", "getFactoringRecoursePipeline(companyId, 200)") },
    { ...good, [HOME]: good[HOME].replace("getFactoringChargebacksFees(companyId, deepLinkCustomerId ?? undefined);", "getFactoringChargebacksFees(companyId);") },
    { ...good, [FACTORING_TAB]: good[FACTORING_TAB].replace('kind="factoring_recourse_load"', 'kind="factoring_queue_load"') },
    { ...good, [ENTITY_LINK]: good[ENTITY_LINK].replace('case "factoring_recourse_load":', "// removed") },
    { ...good, [SECTION]: good[SECTION].replace("getFactoringRecoursePipeline(operatingCompanyId, 200, { customer_id: customerId });", "") },
    { ...good, [SECTION]: good[SECTION].replace("getFactoringChargebacksFees(operatingCompanyId, customerId);", "") },
    { ...good, [CUSTOMER_DETAIL]: good[CUSTOMER_DETAIL].replace("import { CustomerFactoringRecourseReverseSection }", "// removed") },
    { ...good, [CUSTOMER_DETAIL]: good[CUSTOMER_DETAIL].replace("customerId={id}", "") },
    { ...good, [SELF]: good[SELF].replace('"leaves":["home.recourse_pipeline","home.chargebacks_fees"]', '"leafRe":"^home.*$"') },
    { ...good, [REQUIRED]: good[REQUIRED].replace('"id": "home.recourse_pipeline", "required": ["reverse_link"]', '"id": "home.recourse_pipeline", "required": ["customer"]') },
    { ...good, [REQUIRED]: good[REQUIRED].replace('"id": "home.chargebacks_fees", "required": ["reverse_link"]', '"id": "home.chargebacks_fees", "required": ["customer"]') },
  ];
  for (const [i, mutated] of mutations.entries()) {
    if (assertFactoringRecourseChargebacksReverse(mutated).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — mutation ${i} escaped detection`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} SELFTEST PASS — ${mutations.length} mutations all detected`);
  process.exit(0);
}

if (SELFTEST) selftest();

const failures = assertFactoringRecourseChargebacksReverse();
if (failures.length) {
  console.error(`${LABEL} FAIL:\n${failures.map((f) => ` - ${f}`).join("\n")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS`);
