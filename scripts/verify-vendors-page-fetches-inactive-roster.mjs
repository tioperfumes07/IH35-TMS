#!/usr/bin/env node
/**
 * ACCT-F5793 — VENDORS-MASTER-LIST-NEVER-FETCHES-INACTIVE (+ pager total mismatch). The exact
 * Vendors.tsx sibling of ACCT-F5790/ACCT-F5792 (Customers.tsx): vendorsRoster's base fetch
 * (`active_company_only: true`, no status param) is scoped by mdata.vendors' vendors_select RLS
 * to active-only rows, so the page's "Inactive" tab was ALWAYS computed as 0 regardless of real
 * data — fixing the backend status=inactive branch (ACCT-F5768) did not change what the visible
 * tab renders, because the master-list page never called that branch. Live-confirmed via Chrome
 * post-deploy: real "Inactive (0)" tab on USMCA despite real deactivated vendors existing. The
 * pager total underneath the table had the same PAGER-SERVERTOTAL-01 mismatch ACCT-F5792 fixed
 * for Customers.tsx (always the active-only server total, regardless of the selected tab).
 *
 * Fixed additively, mirroring both Customers.tsx fixes exactly: a SEPARATE, explicit
 * status=inactive fetch (inactiveVendorsQuery), merged with the existing active-only roster into
 * fullVendorsRoster for the list/table view, tab counts, and empty-state gating ONLY.
 * vendorTypes/categoryOptions (catalog-derived filter options) stay sourced from the original
 * active-only vendorsRoster, unchanged. vendorsServerTotal branches on listStatus the same way
 * ACCT-F5792 branches customersServerTotal.
 *
 * INVARIANT (static — no database): Vendors.tsx must define inactiveVendorsQuery (status:
 * "inactive"), must define fullVendorsRoster combining the active and inactive rosters, must
 * source visibleVendors and vendorTabCounts from fullVendorsRoster (not the active-only
 * vendorsRoster alone), and vendorsServerTotal must branch on listStatus (inactive -> its own
 * total, all -> summed total, otherwise -> the original active-only total).
 *
 * Self-test: node scripts/verify-vendors-page-fetches-inactive-roster.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGE_FILE = "apps/frontend/src/pages/Vendors.tsx";
const LABEL = "verify-vendors-page-fetches-inactive-roster";

export function checkPageSource(src) {
  const problems = [];
  if (!/status:\s*"inactive"/.test(src)) {
    problems.push("no explicit status: \"inactive\" fetch found — the Inactive tab has nothing to source from");
  }
  if (!/const fullVendorsRoster = useMemo/.test(src)) {
    problems.push("fullVendorsRoster (active + inactive merge) is missing");
  }
  if (!/const visibleVendors = useMemo\(\(\) => \{\s*let all = fullVendorsRoster;/.test(src)) {
    problems.push("visibleVendors no longer sources from fullVendorsRoster — the Inactive/All tabs would go back to active-only");
  }
  if (!/all: fullVendorsRoster\.length/.test(src)) {
    problems.push("vendorTabCounts no longer sources from fullVendorsRoster — tab counts would go back to active-only");
  }
  if (!/for \(const vendor of vendorsRoster\)/.test(src)) {
    problems.push("vendorTypes/categoryOptions no longer sourced from the active-only vendorsRoster — a filter catalog must not start offering deactivated-only values ahead of intent");
  }
  if (!/listStatus === "inactive"\s*\n\s*\? inactiveVendorsQuery\.data\?\.total \?\? 0/.test(src)) {
    problems.push("vendorsServerTotal no longer branches to inactiveVendorsQuery's own total for the Inactive tab");
  }
  if (!/listStatus === "all"\s*\n\s*\? \(vendorsQuery\.data\?\.total \?\? 0\) \+ \(inactiveVendorsQuery\.data\?\.total \?\? 0\)/.test(src)) {
    problems.push("vendorsServerTotal no longer sums both server totals for the All tab");
  }
  // LST-F9104 — the inactive vendors query must surface errors (not silently show "No vendors
  // found." on the Inactive tab). The active query already had ListErrorState; the inactive
  // query must also have its own error state.
  if (!/inactiveVendorsQuery\.isError/.test(src)) {
    problems.push("inactiveVendorsQuery.isError is not checked — a failed inactive fetch silently shows 'No vendors found.' on the Inactive tab (LST-F9104)");
  }
  // LST-F9105 — the balances query and payment-methods query must surface errors (not silently
  // show $0 balance or "Not on file"). A failed balances fetch silently shows $0 open balance;
  // a failed payment-methods fetch silently shows "Not on file".
  if (!/balancesQuery\.isError/.test(src)) {
    problems.push("balancesQuery.isError is not checked — a failed balances fetch silently shows $0 open balance (LST-F9105)");
  }
  if (!/vendorPaymentMethodsQuery\.isError/.test(src)) {
    problems.push("vendorPaymentMethodsQuery.isError is not checked — a failed payment-methods fetch silently shows 'Not on file' (LST-F9105)");
  }
  return problems;
}

function selftest() {
  const goodSrc = `
    const vendorsRoster = vendorsQuery.data?.vendors ?? [];
    const inactiveVendorsQuery = useQuery({
      queryKey: ["vendors", "inactive", companyId],
      queryFn: () => listVendors({ operating_company_id: companyId, limit: 5000, status: "inactive" }),
      enabled: Boolean(companyId),
    });
    const inactiveVendorsRoster = inactiveVendorsQuery.data?.vendors ?? [];
    const fullVendorsRoster = useMemo(
      () => [...vendorsRoster, ...inactiveVendorsRoster],
      [vendorsRoster, inactiveVendorsRoster]
    );
    const vendorsServerTotal =
      listStatus === "inactive"
        ? inactiveVendorsQuery.data?.total ?? 0
        : listStatus === "all"
          ? (vendorsQuery.data?.total ?? 0) + (inactiveVendorsQuery.data?.total ?? 0)
          : vendorsQuery.data?.total ?? 0;
    for (const vendor of vendorsRoster) {
      doSomethingActiveOnly(vendor);
    }
    const visibleVendors = useMemo(() => {
      let all = fullVendorsRoster;
      if (listStatus === "inactive") all = all.filter((vendor) => vendor.deactivated_at != null);
      return all;
    }, [fullVendorsRoster, listStatus]);
    const vendorTabCounts = useMemo(
      () => ({
        all: fullVendorsRoster.length,
      }),
      [fullVendorsRoster]
    );
    if (inactiveVendorsQuery.isError) {
      return <ListErrorState title="Couldn't load inactive vendors" />;
    }
    if (balancesQuery.isError) {
      return <span>Failed to load balances</span>;
    }
    if (vendorPaymentMethodsQuery.isError) {
      return <span>Failed to load payment methods</span>;
    }
  `;

  const cases = [
    { name: "good source", src: goodSrc, expectProblems: false },
    {
      name: "no inactive fetch",
      src: goodSrc.replace(`status: "inactive"`, `status: "active"`),
      expectProblems: true,
    },
    {
      name: "fullVendorsRoster missing",
      src: goodSrc.replace("const fullVendorsRoster = useMemo", "const notFullVendorsRoster = useMemo"),
      expectProblems: true,
    },
    {
      name: "visibleVendors reverted to vendorsRoster",
      src: goodSrc.replace("let all = fullVendorsRoster;", "let all = vendorsRoster;"),
      expectProblems: true,
    },
    {
      name: "vendorTabCounts reverted to vendorsRoster",
      src: goodSrc.replace("all: fullVendorsRoster.length,", "all: vendorsRoster.length,"),
      expectProblems: true,
    },
    {
      name: "vendorTypes/categoryOptions widened off fullVendorsRoster",
      src: goodSrc.replace("for (const vendor of vendorsRoster) {", "for (const vendor of fullVendorsRoster) {"),
      expectProblems: true,
    },
    {
      name: "vendorsServerTotal reverted to always active-only",
      src: goodSrc.replace(
        /const vendorsServerTotal =[\s\S]*?: vendorsQuery\.data\?\.total \?\? 0;/,
        `const vendorsServerTotal = vendorsQuery.data?.total ?? 0;`
      ),
      expectProblems: true,
    },
  ];

  let failed = 0;
  for (const c of cases) {
    const problems = checkPageSource(c.src);
    const hasProblems = problems.length > 0;
    const ok = hasProblems === c.expectProblems;
    console.log(`${ok ? "OK" : "FAIL"} [${c.name}] expectProblems=${c.expectProblems} got=${problems.length}`);
    if (!ok) {
      failed++;
      for (const p of problems) console.log(`    - ${p}`);
    }
  }
  if (failed > 0) {
    console.error(`${LABEL} --selftest FAILED: ${failed} case(s)`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest OK — ${cases.length} cases`);
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }

  const pagePath = path.join(ROOT, PAGE_FILE);
  if (!fs.existsSync(pagePath)) {
    console.error(`${LABEL}: FAIL — ${PAGE_FILE} not found`);
    process.exit(1);
  }

  const src = fs.readFileSync(pagePath, "utf8");
  const problems = checkPageSource(src);

  if (problems.length > 0) {
    console.error(`${LABEL}: FAIL`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }

  console.log(`${LABEL}: OK — Vendors.tsx fetches a real inactive roster (fullVendorsRoster merges active + inactive), visibleVendors/vendorTabCounts source from it, vendorsServerTotal picks the correct authoritative server total per listStatus, and the active-only vendorTypes/categoryOptions catalogs are unchanged.`);
}

main();
