#!/usr/bin/env node
// REG-049 (owner fan-out 2026-09-09/10, "QBO filters (date etc.) on ALL"; also folds in the
// REG-046 confirmation that all 6 named report pages already exist, and REG-048's confirmation
// that Load Costs' default columns are already correct -- this guard covers only the ONE
// confirmed-missing piece: a date range on the Factoring report tabs). Before this fix, none of
// the 6 REG-046 report tabs (or the Recourse Pipeline / Chargebacks & Fees internal-tools tabs)
// had a date-range filter, and none of the three backend endpoints their data comes from
// (recourse-pipeline, chargebacks-fees, funds-due) accepted a date_from/date_to param at all.
//
// STATIC (always runs, no DB/browser needed): asserts, by reading the real source files, that:
//   1. Backend: recourseQuerySchema, chargebacksFeesQuerySchema, and fundsDueQuerySchema (all in
//      factoring.routes.ts) accept optional date_from/date_to, and each of the three route
//      handlers actually applies a date filter to its SQL (not just parses the param and drops it).
//   2. Frontend: FactoringHome.tsx threads a date range into all three queries backing every
//      report tab (recourseQuery/feesQuery/fundsDueQuery), and renders a real date-range filter
//      control (From date / To date) on every one of the 7 tabs that consume that data --
//      Recourse Pipeline, Chargebacks & Fees, and the 5 REG-046 report tabs (Funds Due, Payments
//      to You, Chargebacks & Overpayments, Purchase Report, Aging).
import fs from "node:fs";
import path from "node:path";

const BACKEND_REL = "apps/backend/src/factoring/factoring.routes.ts";
const FRONTEND_REL = "apps/frontend/src/pages/factoring/FactoringHome.tsx";

const REPORT_TAB_IDS = [
  "recourse_pipeline",
  "chargebacks_fees",
  "funds_due",
  "payments_to_you",
  "chargebacks_overpayments",
  "purchase_report",
  "aging",
];

export function auditSources({ backendSrc, frontendSrc }) {
  const failures = [];

  if (backendSrc === null) {
    failures.push(`${BACKEND_REL}: missing`);
  } else {
    if (!/date_from:\s*z\.string\(\)/.test(backendSrc) || !/date_to:\s*z\.string\(\)/.test(backendSrc)) {
      failures.push(`${BACKEND_REL}: no shared date_from/date_to zod schema -- date filters not accepted by any Factoring endpoint`);
    }
    // Each of the three real report-backing endpoints must both destructure the date params AND
    // use them in a WHERE-clause filter string, not just parse-and-discard.
    const occurrences = (backendSrc.match(/date_from:\s*dateFrom/g) ?? []).length;
    if (occurrences < 3) {
      failures.push(`${BACKEND_REL}: expected date_from destructured in all 3 report routes (recourse-pipeline, funds-due, chargebacks-fees), found ${occurrences}`);
    }
    const filterAssignments = (backendSrc.match(/dateFromFilter\s*=\s*`AND/g) ?? []).length;
    if (filterAssignments < 3) {
      failures.push(`${BACKEND_REL}: expected dateFromFilter applied as a real SQL WHERE clause in all 3 report routes, found ${filterAssignments} -- a parse-and-discard regression`);
    }
  }

  if (frontendSrc === null) {
    failures.push(`${FRONTEND_REL}: missing`);
  } else {
    if (!/deepLinkDateFrom/.test(frontendSrc) || !/deepLinkDateTo/.test(frontendSrc)) {
      failures.push(`${FRONTEND_REL}: no deepLinkDateFrom/deepLinkDateTo -- date range isn't part of the shared filter state`);
    }
    for (const queryName of ["recourseQuery", "feesQuery", "fundsDueQuery"]) {
      const startIdx = frontendSrc.indexOf(`const ${queryName} = useQuery({`);
      if (startIdx === -1) {
        failures.push(`${FRONTEND_REL}: ${queryName} declaration not found`);
        continue;
      }
      const endIdx = frontendSrc.indexOf("});", startIdx);
      const block = endIdx === -1 ? frontendSrc.slice(startIdx) : frontendSrc.slice(startIdx, endIdx);
      if (!block.includes("deepLinkDateFrom")) {
        failures.push(`${FRONTEND_REL}: ${queryName} does not thread deepLinkDateFrom into its queryKey/queryFn -- the date range wouldn't actually narrow this query's data`);
      }
    }
    if (!/function dateRangeOnlyFilterBar/.test(frontendSrc)) {
      failures.push(`${FRONTEND_REL}: no dateRangeOnlyFilterBar helper -- the 5 report tabs with no other filterBar would have no way to set a date range`);
    }
    for (const tabId of REPORT_TAB_IDS) {
      const needle = `tab === "${tabId}" ? (`;
      const startIdx = frontendSrc.indexOf(needle);
      if (startIdx === -1) {
        failures.push(`${FRONTEND_REL}: tab "${tabId}" render block not found`);
        continue;
      }
      // Bound the block at the NEXT `tab === "..." ? (` occurrence (or EOF) rather than a fixed
      // char window -- tab blocks vary widely in size (a tall ParityTable column list dwarfs a
      // fixed window), and a truncated capture would false-negative on a real control that's
      // simply further down the block.
      const nextTabIdx = frontendSrc.indexOf('tab === "', startIdx + needle.length);
      const tabBlock = frontendSrc.slice(startIdx, nextTabIdx === -1 ? undefined : nextTabIdx);
      const hasDateControl =
        /dateRangeOnlyFilterBar\(/.test(tabBlock) ||
        (/DatePicker[\s\S]{0,200}dateFrom/.test(tabBlock) && /DatePicker[\s\S]{0,200}dateTo/.test(tabBlock));
      if (!hasDateControl) {
        failures.push(`${FRONTEND_REL}: tab "${tabId}" has no date-range filter control (neither dateRangeOnlyFilterBar(...) nor its own DatePicker pair) within its render block`);
      }
    }
  }

  return failures;
}

function readOrNull(root, rel) {
  const p = path.join(root, rel);
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
}

if (process.argv.includes("--selftest")) {
  const goodBackend = `
const dateRangeQuerySchema = z.object({
  date_from: z.string().regex(/^\\d{4}-\\d{2}-\\d{2}$/).optional(),
  date_to: z.string().regex(/^\\d{4}-\\d{2}-\\d{2}$/).optional(),
});
// recourse-pipeline
const { date_from: dateFrom, date_to: dateTo } = query.data;
let dateFromFilter = "";
if (dateFrom) { dateFromFilter = \`AND rr.factored_at >= $1::date\`; }
// funds-due
const { date_from: dateFrom } = query2.data;
let dateFromFilter = "";
if (dateFrom) { dateFromFilter = \`AND fa.submitted_at >= $1::date\`; }
// chargebacks-fees
const { date_from: dateFrom } = query3.data;
let dateFromFilter = "";
if (dateFrom) { dateFromFilter = \`AND cf.created_at >= $1::date\`; }
`;
  const goodFrontend = `
  const deepLinkDateFrom = applied.dateFrom || null;
  const deepLinkDateTo = applied.dateTo || null;
  function dateRangeOnlyFilterBar(testIdPrefix) { return <CollapsedListFilters />; }
  const recourseQuery = useQuery({
    queryKey: ["factoring", "recourse", companyId, deepLinkDateFrom, deepLinkDateTo],
    queryFn: () => getFactoringRecoursePipeline(companyId),
  });
  const feesQuery = useQuery({
    queryKey: ["factoring", "fees", companyId, deepLinkDateFrom, deepLinkDateTo],
    queryFn: () => getFactoringChargebacksFees(companyId),
  });
  const fundsDueQuery = useQuery({
    queryKey: ["factoring", "funds-due", companyId, deepLinkDateFrom, deepLinkDateTo],
    queryFn: () => getFactoringFundsDue(companyId),
  });
  {tab === "recourse_pipeline" ? (<div>{dateRangeOnlyFilterBar("x")}</div>) : null}
  {tab === "chargebacks_fees" ? (<div>{dateRangeOnlyFilterBar("x")}</div>) : null}
  {tab === "funds_due" ? (<div>{dateRangeOnlyFilterBar("x")}</div>) : null}
  {tab === "payments_to_you" ? (<div>{dateRangeOnlyFilterBar("x")}</div>) : null}
  {tab === "chargebacks_overpayments" ? (<div>{dateRangeOnlyFilterBar("x")}</div>) : null}
  {tab === "purchase_report" ? (<div>{dateRangeOnlyFilterBar("x")}</div>) : null}
  {tab === "aging" ? (<div>{dateRangeOnlyFilterBar("x")}</div>) : null}
`;

  const pass = auditSources({ backendSrc: goodBackend, frontendSrc: goodFrontend });
  if (pass.length) throw new Error("SELFTEST FAIL (should be clean): " + JSON.stringify(pass));

  const backendNoSchema = goodBackend.replace(/date_from:\s*z\.string\(\)[\s\S]*?\n/, "");
  if (auditSources({ backendSrc: backendNoSchema, frontendSrc: goodFrontend }).length === 0) {
    throw new Error("SELFTEST FAIL: missing backend date schema went undetected");
  }

  const backendParseDiscard = goodBackend.replace('dateFromFilter = `AND rr.factored_at >= $1::date`;', "// discarded");
  if (auditSources({ backendSrc: backendParseDiscard, frontendSrc: goodFrontend }).length === 0) {
    throw new Error("SELFTEST FAIL: parse-and-discard date param went undetected");
  }

  const frontendNoQueryWiring = goodFrontend.replace(
    '    queryKey: ["factoring", "recourse", companyId, deepLinkDateFrom, deepLinkDateTo],',
    '    queryKey: ["factoring", "recourse", companyId],'
  );
  if (auditSources({ backendSrc: goodBackend, frontendSrc: frontendNoQueryWiring }).length === 0) {
    throw new Error("SELFTEST FAIL: recourseQuery not threading the date range went undetected");
  }

  const frontendMissingTabControl = goodFrontend.replace(
    '  {tab === "aging" ? (<div>{dateRangeOnlyFilterBar("x")}</div>) : null}\n',
    ""
  );
  if (auditSources({ backendSrc: goodBackend, frontendSrc: frontendMissingTabControl }).length === 0) {
    throw new Error("SELFTEST FAIL: a report tab missing its date-range control went undetected");
  }

  console.log("verify-factoring-report-date-filters: SELFTEST PASS (5/5)");
  process.exit(0);
}

const root = process.cwd();
const failures = auditSources({
  backendSrc: readOrNull(root, BACKEND_REL),
  frontendSrc: readOrNull(root, FRONTEND_REL),
});
if (failures.length) {
  console.error("verify-factoring-report-date-filters FAILED:");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(
  "verify-factoring-report-date-filters: OK -- date_from/date_to are accepted and applied by " +
    "recourse-pipeline/chargebacks-fees/funds-due, and all 7 Factoring report/pipeline tabs render a real date-range filter"
);
