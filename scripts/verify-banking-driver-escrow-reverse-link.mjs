#!/usr/bin/env node
/** @matrix-built {"modules":["banking"],"cols":["reverse_link"],"leaves":["driver_escrow"],"task":"BANK-F5849-DRIVER-ESCROW-REVERSE-EXACT-LEAF","vertical":"column-wave"} */
/**
 * GUARD: the driver's own profile can jump straight into the company-wide Driver Escrow visualizer
 * pre-scoped to that driver, and the visualizer itself honors the deep link on load
 * (LINK-F5171 reverse_link sweep gap banking:driver_escrow).
 *
 * EscrowHistoryView.tsx (mounted on the driver profile) already drills OUT to settlement/
 * journal_entry/bank_transaction for each escrow movement, but nothing linked back INTO
 * /banking/driver-escrow, and even a hand-typed driver_id query param would have been silently
 * ignored -- DriverEscrowTabContent.tsx's driver combobox always started at "All drivers" and
 * required a manual re-select.
 *
 * Fix contract this guard pins:
 *   1. EscrowHistoryView.tsx links to /banking/driver-escrow?driver_id=<this driver>.
 *   2. DriverEscrowTabContent.tsx reads driver_id from the URL on load to pre-select the driver
 *      filter (server-side query is already driver-scoped via getEscrowDriverTimeline -- this pins
 *      only that the FE actually initializes selectedDriverId from the URL, not a fresh empty state).
 *   3. DriverEscrowTabContent.tsx keeps the URL in sync when the combobox changes, so the deep link
 *      is shareable/bookmarkable, not just a one-way landing.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HISTORY_VIEW = "apps/frontend/src/pages/drivers/operations/EscrowHistoryView.tsx";
const TAB_CONTENT = "apps/frontend/src/pages/banking/components/DriverEscrowTabContent.tsx";
const MATRIX = "docs/specs/scoreboard/modules/banking.required.json";
const SELF = "scripts/verify-banking-driver-escrow-reverse-link.mjs";
const FILES = [HISTORY_VIEW, TAB_CONTENT];
const LABEL = "verify-banking-driver-escrow-reverse-link";
const SELFTEST = process.argv.includes("--selftest");

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

export function assertBankingDriverEscrowReverse(sources) {
  const src = {};
  for (const rel of FILES) src[rel] = sources?.[rel] ?? read(rel);
  const problems = [];
  const historyView = src[HISTORY_VIEW];
  const tabContent = src[TAB_CONTENT];
  const matrixSource = sources?.[MATRIX] ?? read(MATRIX);
  const selfSource = sources?.[SELF] ?? read(SELF);

  if (!/\/banking\/driver-escrow\?driver_id=\$\{driverId\}/.test(historyView)) {
    problems.push(`${HISTORY_VIEW}: must link to /banking/driver-escrow?driver_id=\${driverId}`);
  }
  if (!/useSearchParams/.test(tabContent)) {
    problems.push(`${TAB_CONTENT}: must import/use useSearchParams to read the deep link`);
  }
  if (!/searchParams\.get\("driver_id"\)/.test(tabContent)) {
    problems.push(`${TAB_CONTENT}: must read driver_id from the URL search params`);
  }
  if (!/setSearchParams/.test(tabContent)) {
    problems.push(`${TAB_CONTENT}: must keep the URL in sync (setSearchParams) when the driver filter changes`);
  }
  if (
    !/dataTestId="banking-escrow-filter-driver"/.test(tabContent) ||
    !/kind=["']driver["']/.test(tabContent) ||
    !/allowCreate=\{false\}/.test(tabContent)
  ) {
    problems.push(`${TAB_CONTENT}: must render EntityPicker kind=driver filter (allowCreate=false)`);
  }
  const leaf = JSON.parse(matrixSource).leaves?.find((candidate) => candidate.id === "driver_escrow");
  if (!leaf?.required?.includes("reverse_link")) {
    problems.push(`${MATRIX}: driver_escrow must require reverse_link`);
  }
  const annotationLines = selfSource.split("\n").filter((line) => line.includes("@matrix-built"));
  if (!annotationLines.includes('/** @matrix-built {"modules":["banking"],"cols":["reverse_link"],"leaves":["driver_escrow"],"task":"BANK-F5849-DRIVER-ESCROW-REVERSE-EXACT-LEAF","vertical":"column-wave"} */')) {
    problems.push(`${SELF}: Built annotation must credit only driver_escrow:reverse_link`);
  }
  return problems;
}

function selftest() {
  const good = {
    [HISTORY_VIEW]: `
      import { Link } from "react-router-dom";
      <Link to={\`/banking/driver-escrow?driver_id=\${driverId}\`}>View in Banking</Link>
    `,
    [TAB_CONTENT]: `
      import { useSearchParams } from "react-router-dom";
      const [searchParams, setSearchParams] = useSearchParams();
      const [selectedDriverId, setSelectedDriverIdState] = useState(() => searchParams.get("driver_id") ?? "");
      const setSelectedDriverId = (driverId) => {
        setSelectedDriverIdState(driverId);
        setSearchParams((prev) => prev);
      };
      kind="driver"
      dataTestId="banking-escrow-filter-driver"
      allowCreate={false}
    `,
    [MATRIX]: read(MATRIX),
    [SELF]: read(SELF),
  };
  const goodProblems = assertBankingDriverEscrowReverse(good);
  if (goodProblems.length) {
    console.error(`${LABEL} SELFTEST FAIL — known-good fixture flagged: ${goodProblems.join("; ")}`);
    process.exit(1);
  }

  const mutations = [
    { ...good, [HISTORY_VIEW]: good[HISTORY_VIEW].replace("/banking/driver-escrow?driver_id=${driverId}", "/banking/driver-escrow") },
    { ...good, [TAB_CONTENT]: good[TAB_CONTENT].replace(/useSearchParams/g, "useState") },
    { ...good, [TAB_CONTENT]: good[TAB_CONTENT].replace('searchParams.get("driver_id")', '""') },
    { ...good, [TAB_CONTENT]: good[TAB_CONTENT].replace(/setSearchParams/g, "") },
    { ...good, [TAB_CONTENT]: good[TAB_CONTENT].replace('dataTestId="banking-escrow-filter-driver"', 'dataTestId="x"') },
  ];
  const missingRequired = JSON.parse(good[MATRIX]);
  const escrowLeaf = missingRequired.leaves.find((candidate) => candidate.id === "driver_escrow");
  escrowLeaf.required = escrowLeaf.required.filter((column) => column !== "reverse_link");
  mutations.push({ ...good, [MATRIX]: JSON.stringify(missingRequired) });
  mutations.push({ ...good, [SELF]: good[SELF].replace('"leaves":["driver_escrow"]', '"leaves":["transactions.list"]') });
  for (const [i, mutated] of mutations.entries()) {
    if (assertBankingDriverEscrowReverse(mutated).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — mutation ${i} escaped detection`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} SELFTEST PASS — ${mutations.length} mutations all detected`);
  process.exit(0);
}

if (SELFTEST) selftest();

const failures = assertBankingDriverEscrowReverse();
if (failures.length) {
  console.error(`${LABEL} FAIL:\n${failures.map((f) => ` - ${f}`).join("\n")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS`);
