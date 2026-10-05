#!/usr/bin/env node
/**
 * ACCT-F412 — THE CASH-BASIS P&L MUST BE COMPUTED FROM TRANSACTIONS, NOT CONVERTED FROM A TOTAL.
 *
 * The defect this guards against does not look like a bug. `transformProfitLossToCashBasis(accrual,
 * anchorDate)` reads like a cash-basis report and returns accrual numbers, because the report it is
 * handed is already GROUP BY account / SUM(amount_cents) and an aggregate cannot be disaggregated.
 * Nothing throws, every total foots, and the cash column equals the accrual column forever.
 *
 * So this guard asserts the SHAPE that makes that impossible, not a number:
 *   RULE 1 — no module may define or export a P&L cash transform that takes a finished report.
 *   RULE 2 — no production file may import one.
 *   RULE 3 — the cash-basis service's posting scan must NOT filter by je.entry_date. An invoice
 *            raised in February and paid in March belongs in March; filtering postings by their own
 *            entry date puts February's revenue out of reach and silently restores the defect.
 *   RULE 4 — the cash-basis route must call the transaction-level service, not the accrual one.
 *   RULE 5 — the period-close snapshot must compute on the close's OWN client, or it freezes
 *            pre-close numbers into the permanent record (@decision Q9).
 *
 * --selftest proves each rule can FAIL. A proof command that cannot fail is worse than no proof.
 */
import { readFileSync, existsSync } from "node:fs";

const NAME = "verify-cash-basis-pl-is-computed-from-transactions";
const SERVICE = "apps/backend/src/accounting/cash-basis/profit-loss-cash.service.ts";
const ROUTE = "apps/backend/src/accounting/profit-loss.routes.ts";
const SNAPSHOT = "apps/backend/src/accounting/cash-basis/period-close-snapshot.service.ts";
const TRANSFORMS = "apps/backend/src/accounting/cash-basis/report-transforms.ts";
const BANNED = "transformProfitLossToCashBasis";

const failures = [];
const read = (p) => (existsSync(p) ? readFileSync(p, "utf8") : null);

function rule1(transforms) {
  // A comment may name the deleted function (the tombstone explains why). A declaration may not.
  const declared = /^\s*(export\s+)?(async\s+)?function\s+transformProfitLossToCashBasis\b/m.test(transforms ?? "");
  if (declared) {
    return `RULE 1: ${TRANSFORMS} still declares ${BANNED}. It converts a finished accrual report and can only ever return accrual numbers.`;
  }
  return null;
}

function rule2(files) {
  const importers = files.filter(([, body]) => new RegExp(`import[^;]*\\b${BANNED}\\b`).test(body));
  if (importers.length > 0) {
    return `RULE 2: ${importers.map(([p]) => p).join(", ")} imports ${BANNED}.`;
  }
  return null;
}

function rule3(service) {
  if (service === null) return `RULE 3: ${SERVICE} is missing.`;
  const scan = service.slice(service.indexOf("const POSTINGS_SQL"), service.indexOf("const AR_SETTLEMENTS_SQL"));
  if (/je\.entry_date\s*(>=|<=|>|<|BETWEEN)/i.test(scan)) {
    return "RULE 3: the posting scan filters by je.entry_date. An invoice raised before the window and paid inside it becomes unreachable, which is the ACCT-F412 defect returning.";
  }
  return null;
}

function rule4(route) {
  if (route === null) return `RULE 4: ${ROUTE} is missing.`;
  if (!/getCashBasisProfitLossReport/.test(route)) {
    return `RULE 4: ${ROUTE} does not call getCashBasisProfitLossReport, so basis=cash is not answered from transactions.`;
  }
  return null;
}

function rule5(snapshot) {
  if (snapshot === null) return `RULE 5: ${SNAPSHOT} is missing.`;
  if (!/buildCashBasisProfitLossOnClient\s*\(\s*client/.test(snapshot)) {
    return "RULE 5: the period close does not compute the cash-basis P&L on its own client. A snapshot read on a second connection freezes pre-close numbers permanently (@decision Q9).";
  }
  return null;
}

function run(sources) {
  const out = [];
  for (const check of [
    rule1(sources.transforms),
    rule2(sources.importers),
    rule3(sources.service),
    rule4(sources.route),
    rule5(sources.snapshot),
  ]) {
    if (check) out.push(check);
  }
  return out;
}

if (process.argv.includes("--selftest")) {
  const cases = [
    ["rule 1 catches a re-declared transform", { transforms: "export function transformProfitLossToCashBasis(r, d) { return r; }", importers: [], service: "const POSTINGS_SQL = ``\nconst AR_SETTLEMENTS_SQL", route: "getCashBasisProfitLossReport", snapshot: "buildCashBasisProfitLossOnClient(client, {" }, 1],
    ["rule 1 allows the tombstone comment", { transforms: " * `transformProfitLossToCashBasis` WAS HERE AND IS DELETED", importers: [], service: "const POSTINGS_SQL = ``\nconst AR_SETTLEMENTS_SQL", route: "getCashBasisProfitLossReport", snapshot: "buildCashBasisProfitLossOnClient(client, {" }, 0],
    ["rule 2 catches an importer", { transforms: "", importers: [["x.ts", "import { transformProfitLossToCashBasis } from './y.js';"]], service: "const POSTINGS_SQL = ``\nconst AR_SETTLEMENTS_SQL", route: "getCashBasisProfitLossReport", snapshot: "buildCashBasisProfitLossOnClient(client, {" }, 1],
    ["rule 3 catches a date filter on the posting scan", { transforms: "", importers: [], service: "const POSTINGS_SQL = `WHERE je.entry_date >= $2`\nconst AR_SETTLEMENTS_SQL", route: "getCashBasisProfitLossReport", snapshot: "buildCashBasisProfitLossOnClient(client, {" }, 1],
    ["rule 4 catches a route still on the accrual path", { transforms: "", importers: [], service: "const POSTINGS_SQL = ``\nconst AR_SETTLEMENTS_SQL", route: "const r = await getProfitLossReport({})", snapshot: "buildCashBasisProfitLossOnClient(client, {" }, 1],
    ["rule 5 catches a snapshot on a second connection", { transforms: "", importers: [], service: "const POSTINGS_SQL = ``\nconst AR_SETTLEMENTS_SQL", route: "getCashBasisProfitLossReport", snapshot: "getCashBasisProfitLossReport({ userId })" }, 1],
    ["a clean tree passes", { transforms: "", importers: [], service: "const POSTINGS_SQL = ``\nconst AR_SETTLEMENTS_SQL", route: "getCashBasisProfitLossReport", snapshot: "buildCashBasisProfitLossOnClient(client, {" }, 0],
  ];
  let ok = 0;
  for (const [label, sources, expected] of cases) {
    const got = run(sources).length;
    if (got === expected) ok += 1;
    else console.error(`${NAME} SELFTEST FAIL — ${label}: expected ${expected} failure(s), got ${got}`);
  }
  console.log(`${NAME} SELFTEST ${ok === cases.length ? "OK" : "FAILED"} — ${ok}/${cases.length}`);
  process.exit(ok === cases.length ? 0 : 1);
}

const { execSync } = await import("node:child_process");
const tracked = execSync("git ls-files 'apps/backend/src/**/*.ts' 'apps/frontend/src/**/*.ts' 'apps/frontend/src/**/*.tsx'", {
  encoding: "utf8",
  maxBuffer: 64 * 1024 * 1024,
})
  .split("\n")
  .filter((p) => p && !p.includes("__tests__") && !p.endsWith(".test.ts") && !p.endsWith(".test.tsx"));

const importers = tracked.map((p) => [p, read(p) ?? ""]).filter(([, body]) => body.includes(BANNED));

failures.push(
  ...run({
    transforms: read(TRANSFORMS),
    importers,
    service: read(SERVICE),
    route: read(ROUTE),
    snapshot: read(SNAPSHOT),
  })
);

if (failures.length > 0) {
  for (const f of failures) console.error(`${NAME}: ${f}`);
  console.error(`${NAME}: FAIL — ${failures.length} rule(s) broken.`);
  process.exit(1);
}
console.log(`${NAME}: PASS — the cash-basis P&L is computed from postings; 5/5 rules hold across ${tracked.length} source file(s).`);
