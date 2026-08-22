#!/usr/bin/env node
/**
 * ACCT-F5790 — CUSTOMERS-MASTER-LIST-NEVER-FETCHES-INACTIVE. Customers.tsx's base roster fetch
 * (`active_company_only: true`, no status param) is scoped by mdata.customers' customers_select RLS
 * to active-only rows, so the page's "Inactive" tab was ALWAYS computed as 0 regardless of real data —
 * fixing the backend status=inactive branch (ACCT-F5789) did not change what the visible tab renders,
 * because the master-list page never called that branch. Live-confirmed via Chrome: real "Inactive (0)"
 * tab on a company with 13 real deactivated customers.
 *
 * Fixed additively: a SEPARATE, explicit status=inactive fetch (inactiveCustomersQuery), merged with
 * the existing active-only roster into fullCustomersRoster for the list/table view and tab counts
 * ONLY. parentCustomerOptions (a picker) stays sourced from the original active-only customersRoster,
 * unchanged — active-only picker semantics must not regress.
 *
 * INVARIANT (static — no database): Customers.tsx must define inactiveCustomersQuery (status:
 * "inactive"), must define fullCustomersRoster combining the active and inactive rosters, must source
 * visibleCustomers and customerTabCounts from fullCustomersRoster (not the active-only customersRoster
 * alone), and parentCustomerOptions must stay sourced from customersRoster (active-only, unchanged).
 *
 * Self-test: node scripts/verify-customers-page-fetches-inactive-roster.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGE_FILE = "apps/frontend/src/pages/Customers.tsx";
const LABEL = "verify-customers-page-fetches-inactive-roster";

export function checkPageSource(src) {
  const problems = [];
  if (!/status:\s*"inactive"/.test(src)) {
    problems.push("no explicit status: \"inactive\" fetch found — the Inactive tab has nothing to source from");
  }
  if (!/const fullCustomersRoster = useMemo/.test(src)) {
    problems.push("fullCustomersRoster (active + inactive merge) is missing");
  }
  if (!/const visibleCustomers = useMemo\(\(\) => \{\s*let all = fullCustomersRoster;/.test(src)) {
    problems.push("visibleCustomers no longer sources from fullCustomersRoster — the Inactive/All tabs would go back to active-only");
  }
  if (!/all: fullCustomersRoster\.length/.test(src)) {
    problems.push("customerTabCounts no longer sources from fullCustomersRoster — tab counts would go back to active-only");
  }
  if (!/const parentCustomerOptions = useMemo\(\s*\(\) =>\s*customersRoster/.test(src)) {
    problems.push("parentCustomerOptions no longer sourced from the active-only customersRoster — a picker must not start offering deactivated customers");
  }
  return problems;
}

function selftest() {
  const goodSrc = `
    const customersRoster = customersQuery.data?.customers ?? [];
    const inactiveCustomersQuery = useQuery({
      queryKey: ["customers", "inactive", companyId],
      queryFn: () => listCustomers({ operating_company_id: companyId, limit: 5000, status: "inactive" }),
      enabled: Boolean(companyId),
    });
    const inactiveCustomersRoster = inactiveCustomersQuery.data?.customers ?? [];
    const fullCustomersRoster = useMemo(
      () => [...customersRoster, ...inactiveCustomersRoster],
      [customersRoster, inactiveCustomersRoster]
    );
    const parentCustomerOptions = useMemo(
      () =>
        customersRoster
          .filter((c) => !c.parent_customer_id && c.status !== "inactive" && !c.deactivated_at)
          .map((c) => ({ id: c.id, name: c.name })),
      [customersRoster]
    );
    const visibleCustomers = useMemo(() => {
      let all = fullCustomersRoster;
      if (listStatus === "inactive") all = all.filter((customer) => customer.deactivated_at != null);
      return all;
    }, [fullCustomersRoster, listStatus]);
    const customerTabCounts = useMemo(
      () => ({
        all: fullCustomersRoster.length,
        inactive: fullCustomersRoster.filter((customer) => customer.deactivated_at != null).length,
      }),
      [fullCustomersRoster]
    );
  `;
  const cases = [
    { name: "good page (inactive fetch + merge + correct sourcing)", src: goodSrc, expectProblems: false },
    {
      name: "inactive status fetch removed",
      src: goodSrc.replace(`, status: "inactive" }`, ` }`),
      expectProblems: true,
    },
    {
      name: "fullCustomersRoster removed",
      src: goodSrc.replace(/const fullCustomersRoster = useMemo\(([\s\S]*?)\);\n/, ""),
      expectProblems: true,
    },
    {
      name: "visibleCustomers reverted to customersRoster (active-only)",
      src: goodSrc.replace("let all = fullCustomersRoster;", "let all = customersRoster;"),
      expectProblems: true,
    },
    {
      name: "customerTabCounts reverted to customersRoster (active-only)",
      src: goodSrc.replace("all: fullCustomersRoster.length,", "all: customersRoster.length,"),
      expectProblems: true,
    },
    {
      name: "parentCustomerOptions switched to fullCustomersRoster (forbidden — picker would leak inactive)",
      src: goodSrc.replace(
        "const parentCustomerOptions = useMemo(\n      () =>\n        customersRoster",
        "const parentCustomerOptions = useMemo(\n      () =>\n        fullCustomersRoster"
      ),
      expectProblems: true,
    },
  ];

  let failed = 0;
  for (const c of cases) {
    const problems = checkPageSource(c.src);
    const hasProblems = problems.length > 0;
    const ok = hasProblems === c.expectProblems;
    if (!ok) failed += 1;
    console.log(`${ok ? "OK" : "FAIL"} [${c.name}] problems=${JSON.stringify(problems)}`);
  }
  if (failed > 0) {
    console.error(`${LABEL} --selftest: ${failed}/${cases.length} mutation case(s) failed`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest: ${cases.length}/${cases.length} mutation case(s) PASS`);
}

function main() {
  if (process.argv.includes("--selftest")) return selftest();
  const src = fs.readFileSync(path.join(ROOT, PAGE_FILE), "utf8");
  const problems = checkPageSource(src);
  if (problems.length > 0) {
    console.error(`${LABEL}: FAIL`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log(`${LABEL}: OK — Customers.tsx fetches an explicit inactive roster and sources the list/tab counts from the merged roster, parentCustomerOptions stays active-only`);
}

main();
