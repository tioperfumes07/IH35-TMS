#!/usr/bin/env node
/**
 * Owner: "THAT ACCOUNT MUST STAY HIGHLIGHTED."
 * Highlight is keyed to APPLIED accountIds (not the draft filter), with an accent bar and aria-current.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-reclassify-account-stays-highlighted";
const PAGE = "apps/frontend/src/pages/accounting/ReclassifyTransactionsPage.tsx";

function stripComments(src) {
  return String(src ?? "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

export function findProblems(src) {
  const problems = [];
  const s = stripComments(src);
  if (!/aria-current/.test(s)) {
    problems.push(`${PAGE}: missing aria-current on the applied account`);
  }
  if (!/applied\?\.accountIds/.test(s) && !/applied\.accountIds/.test(s)) {
    problems.push(`${PAGE}: highlight must key off applied.accountIds, not the draft filter`);
  }
  if (/f\.accountIds\.includes\(a\.account_id\)/.test(s)) {
    problems.push(`${PAGE}: still highlights from draft f.accountIds — Find/click must keep APPLIED highlighted`);
  }
  if (!/borderLeft/.test(s) || !/colors\.accent/.test(s)) {
    problems.push(`${PAGE}: applied account needs the accent bar (borderLeft + colors.accent)`);
  }
  return problems;
}

function selftest() {
  const good = `
    <button aria-current={applied?.accountIds.length === 1 && applied.accountIds[0] === a.account_id ? "true" : undefined}
      className={applied?.accountIds.length === 1 ? "bg-slate-100" : ""}
      style={{ borderLeft: \`3px solid \${colors.accent}\` }} />
  `;
  const cases = [
    { name: "applied + accent + aria-current", src: good, expectFail: false },
    { name: "draft filter highlight", src: good.replace("applied?.accountIds.length === 1", "f.accountIds.includes(a.account_id)") + " f.accountIds.includes(a.account_id)", expectFail: true },
    { name: "missing aria-current", src: good.replace(/aria-current/g, "aria-selected"), expectFail: true },
    { name: "missing accent bar", src: good.replace("borderLeft", "borderRight").replace("colors.accent", "colors.navy"), expectFail: true },
  ];
  let pass = 0;
  for (const c of cases) {
    const problems = findProblems(c.src);
    const failed = problems.length > 0;
    if (failed === c.expectFail) {
      pass += 1;
      console.log(`ok    ${c.name}`);
    } else {
      console.error(`FAIL  ${c.name}`);
      if (problems.length) console.error(`      ${problems.join("\n      ")}`);
    }
  }
  console.log(`\n${LABEL} --selftest: ${pass}/${cases.length} ${pass === cases.length ? "PASS" : "FAIL"}`);
  process.exit(pass === cases.length ? 0 : 1);
}

function main() {
  if (process.argv.includes("--selftest")) return selftest();
  const problems = findProblems(fs.readFileSync(path.join(ROOT, PAGE), "utf8"));
  if (problems.length) {
    console.error(`${LABEL} FAIL:`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log(`${LABEL} OK — Reclassify highlight is applied + accent bar + aria-current.`);
}

main();
