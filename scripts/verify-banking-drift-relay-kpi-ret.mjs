#!/usr/bin/env node
/**
 * verify-banking-drift-relay-kpi-ret — ROUND 8.20 board3.
 * Banking Home Drift alerts + Relay feed KPIs must attach ret (not bare paths).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-banking-drift-relay-kpi-ret";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGE = "apps/frontend/src/pages/banking/components/BankingHomeBoard.tsx";

export function check(src) {
  const f = [];
  if (!src) return ["BankingHomeBoard.tsx missing"];
  if (!/const driftHref = withReturnContext\(BANKING_TAB_PATH\.reconciliation/.test(src)) {
    f.push("driftHref must wrap reconciliation with withReturnContext");
  }
  if (!/const relayHref = withReturnContext\(BANKING_TAB_PATH\.relay_card/.test(src)) {
    f.push("relayHref must wrap relay_card with withReturnContext");
  }
  if (!/href=\{driftHref\}/.test(src)) f.push("drift KPI must use href={driftHref}");
  if (!/href=\{relayHref\}/.test(src)) f.push("relay KPI must use href={relayHref}");
  if (/testId="banking-kpi-drift-alerts"[\s\S]{0,80}href=\{BANKING_TAB_PATH\.reconciliation\}/.test(src)) {
    f.push("drift KPI still bare BANKING_TAB_PATH.reconciliation");
  }
  if (/testId="banking-kpi-relay-feed"[\s\S]{0,120}href="\/banking\/relay-card"/.test(src)) {
    f.push("relay KPI still bare /banking/relay-card");
  }
  return f;
}

function selftest(src) {
  const cases = [
    ["no driftHref", src.replace(/driftHref/g, "noop")],
    ["bare drift", src.replace(/href=\{driftHref\}/, "href={BANKING_TAB_PATH.reconciliation}")],
    ["bare relay", src.replace(/href=\{relayHref\}/, 'href="/banking/relay-card"')],
  ];
  let pass = check(src).length === 0 ? 1 : 0;
  if (!pass) console.error(`${LABEL} --selftest: live tree fails`, check(src));
  for (const [name, s] of cases) {
    if (check(s).length > 0) pass += 1;
    else console.error(`${LABEL} --selftest: did not catch "${name}"`);
  }
  const total = cases.length + 1;
  if (pass !== total) {
    console.error(`${LABEL} --selftest FAIL ${pass}/${total}`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS ${pass}/${total}`);
}

const src = fs.existsSync(path.join(ROOT, PAGE)) ? fs.readFileSync(path.join(ROOT, PAGE), "utf8") : "";
if (process.argv.includes("--selftest")) selftest(src);
else {
  const f = check(src);
  if (f.length) {
    for (const x of f) console.error(`${LABEL}: FAIL — ${x}`);
    process.exit(1);
  }
  console.log(`${LABEL}: PASS — Banking drift/relay KPIs carry ret`);
}
