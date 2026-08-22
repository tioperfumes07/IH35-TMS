#!/usr/bin/env node
/** @matrix-built {"modules":["factoring"],"cols":["reverse_link"],"leaves":["dispatch.queue"],"task":"FACT-F5837-DISPATCH-QUEUE-REVERSE-EXACT-LEAF"} */
/**
 * GUARD: a customer's and a load's own pages can jump into the dispatch factoring queue pre-scoped
 * to them, and the queue page + its backend route both honor the deep link
 * (LINK-F5171 reverse_link sweep gap factoring:dispatch.queue).
 *
 * GET /api/v1/dispatch/factoring-queue already selects real customer_id (c.id) and load_id (l.id)
 * FKs off every row, but accepted no filter param at all, and neither CustomerDetail nor the load's
 * FactoringTab ever called it or linked to it -- FactoringTab independently re-derived a near-
 * identical packet-stage lifecycle from load.notes instead.
 *
 * Fix contract this guard pins:
 *   1. factoring-queue.routes.ts's querySchema accepts optional customer_id/load_id and applies
 *      them server-side to the SQL WHERE clause (server-side scoping, not a client-side filter --
 *      the queue is capped at limit=200).
 *   2. FactoringQueuePage.tsx reads customer_id/load_id from the URL and forwards them to the query.
 *   3. FactoringTab.tsx (load-side) links to /dispatch/factoring-queue?load_id=<id>.
 *   4. CustomerFactoringQueueReverseSection.tsx (new) queries the customer-scoped endpoint and links
 *      to /dispatch/factoring-queue?customer_id=<id>; CustomerDetail.tsx mounts it.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ROUTES = "apps/backend/src/dispatch/factoring-queue.routes.ts";
const QUEUE_PAGE = "apps/frontend/src/pages/dispatch/FactoringQueuePage.tsx";
const FACTORING_TAB = "apps/frontend/src/components/dispatch/tabs/FactoringTab.tsx";
const SECTION = "apps/frontend/src/components/customers/CustomerFactoringQueueReverseSection.tsx";
const CUSTOMER_DETAIL = "apps/frontend/src/pages/CustomerDetail.tsx";
const SELF = "scripts/verify-factoring-dispatch-queue-reverse-section.mjs";
const REQUIRED = "docs/specs/scoreboard/modules/factoring.required.json";
const FILES = [ROUTES, QUEUE_PAGE, FACTORING_TAB, SECTION, CUSTOMER_DETAIL, SELF, REQUIRED];
const LABEL = "verify-factoring-dispatch-queue-reverse-section";
const SELFTEST = process.argv.includes("--selftest");

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

export function assertFactoringDispatchQueueReverse(sources) {
  const src = {};
  for (const rel of FILES) src[rel] = sources?.[rel] ?? read(rel);
  const problems = [];
  const routes = src[ROUTES];
  const queuePage = src[QUEUE_PAGE];
  const factoringTab = src[FACTORING_TAB];
  const section = src[SECTION];
  const customerDetail = src[CUSTOMER_DETAIL];
  const self = src[SELF];
  const required = src[REQUIRED];

  if (!/^\/\*\* @matrix-built \{"modules":\["factoring"\],"cols":\["reverse_link"\],"leaves":\["dispatch\.queue"\],"task":"FACT-F5837-DISPATCH-QUEUE-REVERSE-EXACT-LEAF"\} \*\/$/m.test(self)) {
    problems.push(`${SELF}: Built annotation must own only factoring:dispatch.queue reverse_link`);
  }
  if (!/"id": "dispatch\.queue"[\s\S]{0,350}"required": \[[\s\S]{0,250}"reverse_link"/.test(required)) {
    problems.push(`${REQUIRED}: dispatch.queue must remain a Required reverse_link leaf`);
  }

  if (!/customer_id:\s*z\.string\(\)\.uuid\(\)\.optional\(\)/.test(routes)) {
    problems.push(`${ROUTES}: querySchema must accept optional customer_id`);
  }
  if (!/load_id:\s*z\.string\(\)\.uuid\(\)\.optional\(\)/.test(routes)) {
    problems.push(`${ROUTES}: querySchema must accept optional load_id`);
  }
  if (!/customerFilter\s*=\s*`AND c\.id/.test(routes)) {
    problems.push(`${ROUTES}: SQL must filter by customer_id server-side when provided`);
  }
  if (!/loadFilter\s*=\s*`AND l\.id/.test(routes)) {
    problems.push(`${ROUTES}: SQL must filter by load_id server-side when provided`);
  }
  if (!/searchParams\.get\("customer_id"\)/.test(queuePage) || !/searchParams\.get\("load_id"\)/.test(queuePage)) {
    problems.push(`${QUEUE_PAGE}: must read customer_id and load_id from URL search params`);
  }
  if (!/params\.set\("customer_id"/.test(queuePage) || !/params\.set\("load_id"/.test(queuePage)) {
    problems.push(`${QUEUE_PAGE}: must forward customer_id/load_id to the API call`);
  }
  if (
    !/dataTestId="factoring-dispatch-filter-customer"/.test(queuePage) ||
    !/dataTestId="factoring-dispatch-filter-load"/.test(queuePage) ||
    !/allowCreate=\{false\}/.test(queuePage)
  ) {
    problems.push(`${QUEUE_PAGE}: must render EntityPicker customer+load filters (allowCreate=false)`);
  }
  if (!/kind=["']factoring_queue_load["']/.test(factoringTab) || !/id=\{loadId\}/.test(factoringTab)) {
    problems.push(`${FACTORING_TAB}: must drill via EntityLink kind=factoring_queue_load id={loadId}`);
  }
  if (!/customer_id=\$\{encodeURIComponent\(customerId\)\}/.test(section)) {
    problems.push(`${SECTION}: must query the queue scoped to customer_id`);
  }
  if (!/import\s*\{\s*CustomerFactoringQueueReverseSection\s*\}/.test(customerDetail)) {
    problems.push(`${CUSTOMER_DETAIL}: must import CustomerFactoringQueueReverseSection`);
  }
  if (!/<CustomerFactoringQueueReverseSection[\s\S]*?customerId=\{id\}/.test(customerDetail)) {
    problems.push(`${CUSTOMER_DETAIL}: must mount <CustomerFactoringQueueReverseSection customerId={id} .../>`);
  }

  if (!/factoring_queue_customer/.test(section)) {
    problems.push(`${SECTION}: View full queue must use EntityLink kind factoring_queue_customer`);
  }
  // LST-F5196 — filters must write URL.
  if (!/setSearchParams/.test(queuePage)) {
    problems.push(`${QUEUE_PAGE}: dispatch queue filters must sync to URL (setSearchParams)`);
  }

  return problems;
}

function selftest() {
  const good = {
    [ROUTES]: `
      const querySchema = z.object({
        customer_id: z.string().uuid().optional(),
        load_id: z.string().uuid().optional(),
      });
      let customerFilter = "";
      if (customerId) { customerFilter = \`AND c.id = $\${filterParams.length}::uuid\`; }
      let loadFilter = "";
      if (loadId) { loadFilter = \`AND l.id = $\${filterParams.length}::uuid\`; }
    `,
    [QUEUE_PAGE]: `setSearchParams

      const deepLinkCustomerId = searchParams.get("customer_id");
      const deepLinkLoadId = searchParams.get("load_id");
      const params = new URLSearchParams();
      if (effectiveCustomerId) params.set("customer_id", effectiveCustomerId);
      if (effectiveLoadId) params.set("load_id", effectiveLoadId);
      dataTestId="factoring-dispatch-filter-customer"
      dataTestId="factoring-dispatch-filter-load"
      allowCreate={false}
    `,
    [FACTORING_TAB]: `<EntityLink kind="factoring_queue_load" id={loadId} label="View" />`,
    [SECTION]: `\`/api/v1/dispatch/factoring-queue?operating_company_id=\${x}&customer_id=\${encodeURIComponent(customerId)}\` factoring_queue_customer`,
    [CUSTOMER_DETAIL]: `
      import { CustomerFactoringQueueReverseSection } from "../components/customers/CustomerFactoringQueueReverseSection";
      <CustomerFactoringQueueReverseSection operatingCompanyId={operatingCompanyId} customerId={id} />
    `,
    [SELF]: `/** @matrix-built {"modules":["factoring"],"cols":["reverse_link"],"leaves":["dispatch.queue"],"task":"FACT-F5837-DISPATCH-QUEUE-REVERSE-EXACT-LEAF"} */`,
    [REQUIRED]: `{"leaves":[{"id": "dispatch.queue", "required": ["customer", "load", "connectivity", "reverse_link"]}]}`,
  };
  const goodProblems = assertFactoringDispatchQueueReverse(good);
  if (goodProblems.length) {
    console.error(`${LABEL} SELFTEST FAIL — known-good fixture flagged: ${goodProblems.join("; ")}`);
    process.exit(1);
  }

  const mutations = [
    { ...good, [ROUTES]: good[ROUTES].replace("customer_id: z.string().uuid().optional(),", "") },
    { ...good, [ROUTES]: good[ROUTES].replace("load_id: z.string().uuid().optional(),", "") },
    { ...good, [ROUTES]: good[ROUTES].replace('customerFilter = `AND c.id = $${filterParams.length}::uuid`;', "") },
    { ...good, [ROUTES]: good[ROUTES].replace('loadFilter = `AND l.id = $${filterParams.length}::uuid`;', "") },
    { ...good, [QUEUE_PAGE]: good[QUEUE_PAGE].replace(/setSearchParams/g, "setUrlParams") },
    { ...good, [QUEUE_PAGE]: good[QUEUE_PAGE].replace('searchParams.get("customer_id")', '""') },
    { ...good, [QUEUE_PAGE]: good[QUEUE_PAGE].replace('params.set("customer_id", effectiveCustomerId);', "") },
    { ...good, [QUEUE_PAGE]: good[QUEUE_PAGE].replace('dataTestId="factoring-dispatch-filter-customer"', 'dataTestId="x"') },
    { ...good, [FACTORING_TAB]: good[FACTORING_TAB].replace('kind="factoring_queue_load"', 'kind="load"') },
    { ...good, [SECTION]: good[SECTION].replace("customer_id=${encodeURIComponent(customerId)}", "") },
    { ...good, [CUSTOMER_DETAIL]: good[CUSTOMER_DETAIL].replace("import { CustomerFactoringQueueReverseSection }", "// removed") },
    { ...good, [CUSTOMER_DETAIL]: good[CUSTOMER_DETAIL].replace("customerId={id}", "") },
    { ...good, [SELF]: good[SELF].replace('"modules":["factoring"]', '"modules":["factoring","dispatch"]') },
    { ...good, [REQUIRED]: good[REQUIRED].replace('"reverse_link"', '"qbo_chrome"') },
  ];
  for (const [i, mutated] of mutations.entries()) {
    if (assertFactoringDispatchQueueReverse(mutated).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — mutation ${i} escaped detection`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} SELFTEST PASS — ${mutations.length} mutations all detected`);
  process.exit(0);
}

if (SELFTEST) selftest();

const failures = assertFactoringDispatchQueueReverse();
if (failures.length) {
  console.error(`${LABEL} FAIL:\n${failures.map((f) => ` - ${f}`).join("\n")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS`);
