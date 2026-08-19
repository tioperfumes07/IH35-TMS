#!/usr/bin/env node
/** @matrix-built {"modules":["factoring"],"cols":["reverse_link"],"leafRe":"^submit\\.queue$","task":"LINK-F5181-factoring-submit-queue-reverse"} */
/**
 * GUARD: a customer's and a load's own pages can jump into the factoring submission queue
 * pre-scoped to them, and both the backend route + SubmissionQueue.tsx honor the deep link
 * (LINK-F5171 reverse_link sweep gap factoring:submit.queue).
 *
 * listSubmissionQueueInvoices already selects real customer_id/load_id FKs off accounting.invoices;
 * LINK-F5181 exposes both as optional server-side filters.
 *
 * Fix contract this guard pins:
 *   1. submission-queue.service.ts's listSubmissionQueueInvoices accepts optional customerId/loadId
 *      and applies them server-side in SQL.
 *   2. submission-queue.routes.ts's query schema accepts optional customer_id/load_id and forwards
 *      them to the service.
 *   3. SubmissionQueue.tsx reads customer_id/load_id from the URL and forwards them to the API.
 *   4. FactoringTab.tsx (load-side) renders EntityLink kind="factoring_submit_queue_load".
 *   5. EntityLink.tsx defines "factoring_submit_queue_load" -> /factoring/submit?load_id=.
 *   6. CustomerFactoringSubmitQueueReverseSection.tsx (new) queries the customer-scoped endpoint;
 *      CustomerDetail.tsx mounts it.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SERVICE = "apps/backend/src/factoring/submission-queue.service.ts";
const ROUTES = "apps/backend/src/factoring/submission-queue.routes.ts";
const QUEUE_PAGE = "apps/frontend/src/pages/factoring/SubmissionQueue.tsx";
const FACTORING_TAB = "apps/frontend/src/components/dispatch/tabs/FactoringTab.tsx";
const ENTITY_LINK = "apps/frontend/src/components/shared/EntityLink.tsx";
const SECTION = "apps/frontend/src/components/customers/CustomerFactoringSubmitQueueReverseSection.tsx";
const CUSTOMER_DETAIL = "apps/frontend/src/pages/CustomerDetail.tsx";
const FILES = [SERVICE, ROUTES, QUEUE_PAGE, FACTORING_TAB, ENTITY_LINK, SECTION, CUSTOMER_DETAIL];
const LABEL = "verify-factoring-submit-queue-reverse-section";
const SELFTEST = process.argv.includes("--selftest");

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

export function assertFactoringSubmitQueueReverse(sources) {
  const src = {};
  for (const rel of FILES) src[rel] = sources?.[rel] ?? read(rel);
  const problems = [];
  const service = src[SERVICE];
  const routes = src[ROUTES];
  const queuePage = src[QUEUE_PAGE];
  const factoringTab = src[FACTORING_TAB];
  const entityLink = src[ENTITY_LINK];
  const section = src[SECTION];
  const customerDetail = src[CUSTOMER_DETAIL];

  if (!/customerFilter\s*=\s*`AND i\.customer_id/.test(service)) {
    problems.push(`${SERVICE}: SQL must filter by customer_id server-side when provided`);
  }
  if (!/loadFilter\s*=\s*`AND i\.source_load_id/.test(service)) {
    problems.push(`${SERVICE}: SQL must filter by load_id server-side when provided`);
  }
  if (!/customer_id:\s*z\.string\(\)\.uuid\(\)\.optional\(\)/.test(routes) || !/load_id:\s*z\.string\(\)\.uuid\(\)\.optional\(\)/.test(routes)) {
    problems.push(`${ROUTES}: querySchema must accept optional customer_id/load_id`);
  }
  if (!/customerId:\s*query\.data\.customer_id/.test(routes)) {
    problems.push(`${ROUTES}: must forward customer_id to listSubmissionQueueInvoices`);
  }
  if (!/searchParams\.get\("customer_id"\)/.test(queuePage) || !/searchParams\.get\("load_id"\)/.test(queuePage)) {
    problems.push(`${QUEUE_PAGE}: must read customer_id and load_id from URL search params`);
  }
  // LST-F5163N: visible reverse filters (URL-only is not list chrome).
  if (!/dataTestId="factoring-submit-filter-customer"/.test(queuePage) || !/dataTestId="factoring-submit-filter-load"/.test(queuePage) || !/allowCreate=\{false\}/.test(queuePage)) {
    problems.push(`${QUEUE_PAGE}: must render EntityPicker customer+load filters (allowCreate=false)`);
  }
  if (!/kind="factoring_submit_queue_load"/.test(factoringTab)) {
    problems.push(`${FACTORING_TAB}: must render EntityLink kind="factoring_submit_queue_load"`);
  }
  if (!/case "factoring_submit_queue_load":/.test(entityLink) || !/\/factoring\/submit\?load_id=\$\{id\}/.test(entityLink)) {
    problems.push(`${ENTITY_LINK}: must define factoring_submit_queue_load -> /factoring/submit?load_id=<id>`);
  }
  if (!/listSubmissionQueue\(operatingCompanyId,\s*\{\s*customer_id:\s*customerId\s*\}\)/.test(section)) {
    problems.push(`${SECTION}: must query submission queue scoped to customer_id`);
  }
  if (!/import\s*\{\s*CustomerFactoringSubmitQueueReverseSection\s*\}/.test(customerDetail)) {
    problems.push(`${CUSTOMER_DETAIL}: must import CustomerFactoringSubmitQueueReverseSection`);
  }
  if (!/<CustomerFactoringSubmitQueueReverseSection[\s\S]*?customerId=\{id\}/.test(customerDetail)) {
    problems.push(`${CUSTOMER_DETAIL}: must mount <CustomerFactoringSubmitQueueReverseSection customerId={id} .../>`);
  }

  if (!/factoring_submit_queue_customer/.test(section)) {
    problems.push(`${SECTION}: must use EntityLink kind factoring_submit_queue_customer`);
  }
  if (/from "react-router-dom"/.test(section)) {
    problems.push(`${SECTION}: must not import react-router Link`);
  }
  if (!/entityLabel\(item\.display_id, item\.invoice_id, "Invoice"\)/.test(section)) {
    problems.push(`${SECTION}: invoice label must reject raw invoice-id fallback`);
  }

  if (!/setSearchParams/.test(queuePage)) {
    problems.push(`${QUEUE_PAGE}: submit queue filters must sync to URL (setSearchParams)`);
  }
  return problems;
}

function selftest() {
  const good = {
    [SERVICE]: `
      let customerFilter = "";
      if (deps.customerId) { customerFilter = \`AND i.customer_id = $\${filterParams.length}::uuid\`; }
      let loadFilter = "";
      if (deps.loadId) { loadFilter = \`AND i.source_load_id = $\${filterParams.length}::uuid\`; }
    `,
    [ROUTES]: `
      const submissionQueueQuerySchema = companyQuerySchema.extend({
        customer_id: z.string().uuid().optional(),
        load_id: z.string().uuid().optional(),
      });
      listSubmissionQueueInvoices(query.data.operating_company_id, {
        client,
        customerId: query.data.customer_id,
        loadId: query.data.load_id,
      })
    `,
    [QUEUE_PAGE]: `
      const [searchParams, setSearchParams] = useSearchParams();
      const deepLinkCustomerId = searchParams.get("customer_id");
      const deepLinkLoadId = searchParams.get("load_id");
      dataTestId="factoring-submit-filter-customer"
      dataTestId="factoring-submit-filter-load"
      allowCreate={false}
    `,
    [FACTORING_TAB]: `<EntityLink kind="factoring_submit_queue_load" id={loadId} label="View" />`,
    [ENTITY_LINK]: `
      case "factoring_submit_queue_load":
        return \`/factoring/submit?load_id=\${id}\`;
    `,
    [SECTION]: `listSubmissionQueue(operatingCompanyId, { customer_id: customerId }).then((r) => r.items)
      factoring_submit_queue_customer
      entityLabel(item.display_id, item.invoice_id, "Invoice")`,
    [CUSTOMER_DETAIL]: `
      import { CustomerFactoringSubmitQueueReverseSection } from "../components/customers/CustomerFactoringSubmitQueueReverseSection";
      <CustomerFactoringSubmitQueueReverseSection operatingCompanyId={operatingCompanyId} customerId={id} />
    `,
  };
  const goodProblems = assertFactoringSubmitQueueReverse(good);
  if (goodProblems.length) {
    console.error(`${LABEL} SELFTEST FAIL — known-good fixture flagged: ${goodProblems.join("; ")}`);
    process.exit(1);
  }

  const mutations = [
    { ...good, [SERVICE]: good[SERVICE].replace('customerFilter = `AND i.customer_id = $${filterParams.length}::uuid`;', "") },
    { ...good, [SERVICE]: good[SERVICE].replace('loadFilter = `AND i.source_load_id = $${filterParams.length}::uuid`;', "") },
    { ...good, [ROUTES]: good[ROUTES].replace("customer_id: z.string().uuid().optional(),\n        load_id: z.string().uuid().optional(),", "") },
    { ...good, [ROUTES]: good[ROUTES].replace("customerId: query.data.customer_id,", "") },
    { ...good, [QUEUE_PAGE]: good[QUEUE_PAGE].replace('searchParams.get("customer_id")', '""') },
    { ...good, [QUEUE_PAGE]: good[QUEUE_PAGE].replace(/setSearchParams/g, "setUrlParams") },
    { ...good, [QUEUE_PAGE]: good[QUEUE_PAGE].replace('dataTestId="factoring-submit-filter-customer"', 'dataTestId="x"') },
    { ...good, [FACTORING_TAB]: good[FACTORING_TAB].replace('kind="factoring_submit_queue_load"', 'kind="factoring_queue_load"') },
    { ...good, [ENTITY_LINK]: good[ENTITY_LINK].replace('case "factoring_submit_queue_load":', "// removed") },
    { ...good, [SECTION]: good[SECTION].replace("customer_id: customerId", "") },
    { ...good, [CUSTOMER_DETAIL]: good[CUSTOMER_DETAIL].replace("import { CustomerFactoringSubmitQueueReverseSection }", "// removed") },
    { ...good, [CUSTOMER_DETAIL]: good[CUSTOMER_DETAIL].replace("customerId={id}", "") },
    { ...good, [SECTION]: good[SECTION].replace("entityLabel", "rawLabel") },
  ];
  for (const [i, mutated] of mutations.entries()) {
    if (assertFactoringSubmitQueueReverse(mutated).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — mutation ${i} escaped detection`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} SELFTEST PASS — ${mutations.length} mutations all detected`);
  process.exit(0);
}

if (SELFTEST) selftest();

const failures = assertFactoringSubmitQueueReverse();
if (failures.length) {
  console.error(`${LABEL} FAIL:\n${failures.map((f) => ` - ${f}`).join("\n")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS`);
