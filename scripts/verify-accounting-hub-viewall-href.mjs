#!/usr/bin/env node
/**
 * verify-accounting-hub-viewall-href — ROUND 8.20 board1.
 * Accounting Hub View-all must be shareable hrefs (viewAllHref + withReturnContext),
 * not onClick navigate. A/R aging Back must resolveBackHref (hub ret).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-accounting-hub-viewall-href";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HUB = "apps/frontend/src/pages/accounting/AccountingHubPage.tsx";
const BOARD = "apps/frontend/src/components/v3/BoardSection.tsx";
const AR = "apps/frontend/src/pages/reports/ARAgingPage.tsx";

export function checkHub(src) {
  const f = [];
  if (!src) return ["AccountingHubPage.tsx missing"];
  if (!/viewAllHref=\{hubHref\("\/accounting\/month-close"\)\}/.test(src)) {
    f.push("close calendar View-all must be viewAllHref hubHref(/accounting/month-close)");
  }
  if (!/viewAllHref=\{hubHref\("\/reports\/ar-aging"\)\}/.test(src)) {
    f.push("receivables View-all must be viewAllHref hubHref(/reports/ar-aging)");
  }
  if (!/viewAllHref=\{hubHref\("\/cash-flow"\)\}/.test(src)) {
    f.push("cash pulse View-all must be viewAllHref hubHref(/cash-flow)");
  }
  if (!/viewAllHref=\{hubHref\("\/driver-finance\/settlements\?state=open"\)\}/.test(src)) {
    f.push("settlements View-all must be viewAllHref hubHref(settlements?state=open)");
  }
  if (/onViewAll=\{\(\) => navigate\(hubHref/.test(src)) {
    f.push("View-all still uses onClick navigate(hubHref) — Class R requires href");
  }
  if (/useNavigate/.test(src)) {
    f.push("AccountingHub must not import useNavigate for View-all drills");
  }
  return f;
}

export function checkBoard(src) {
  const f = [];
  if (!src) return ["BoardSection.tsx missing"];
  if (!/viewAllHref\?:/.test(src)) f.push("BoardSection must accept viewAllHref");
  if (!/Link to=\{viewAllHref\}/.test(src)) f.push("BoardSection must Link to viewAllHref");
  return f;
}

export function checkAr(src) {
  const f = [];
  if (!src) return ["ARAgingPage.tsx missing"];
  if (!/resolveBackHref/.test(src)) f.push("ARAgingPage must use resolveBackHref");
  if (!/backHref=\{reportsBackHref\}/.test(src)) f.push("ARAgingPage backHref must be reportsBackHref");
  if (/backHref="\/reports"/.test(src)) f.push("ARAgingPage still hardcodes backHref=/reports");
  return f;
}

function selftest() {
  const hub = fs.readFileSync(path.join(ROOT, HUB), "utf8");
  const board = fs.readFileSync(path.join(ROOT, BOARD), "utf8");
  const ar = fs.readFileSync(path.join(ROOT, AR), "utf8");
  let pass = 0;
  const total = 7;
  if (checkHub(hub).length === 0) pass += 1;
  else console.error(`${LABEL} --selftest: live hub fails`, checkHub(hub));
  if (checkBoard(board).length === 0) pass += 1;
  else console.error(`${LABEL} --selftest: live BoardSection fails`, checkBoard(board));
  if (checkAr(ar).length === 0) pass += 1;
  else console.error(`${LABEL} --selftest: live ARAging fails`, checkAr(ar));
  const badHub = hub.replace(/viewAllHref=\{hubHref\("\/reports\/ar-aging"\)\}/, 'onViewAll={() => navigate(hubHref("/reports/ar-aging"))}');
  if (checkHub(badHub).length > 0) pass += 1;
  else console.error(`${LABEL} --selftest: did not catch navigate View-all`);
  const bareAr = ar.replace(/backHref=\{reportsBackHref\}/, 'backHref="/reports"');
  if (checkAr(bareAr).length > 0) pass += 1;
  else console.error(`${LABEL} --selftest: did not catch bare AR back`);
  if (checkHub("").length > 0) pass += 1;
  else console.error(`${LABEL} --selftest: did not catch missing hub`);
  if (checkBoard(board.replace(/viewAllHref\?:/, "viewAllX?:")).length > 0) pass += 1;
  else console.error(`${LABEL} --selftest: did not catch missing viewAllHref prop`);
  if (pass !== total) {
    console.error(`${LABEL} --selftest FAIL ${pass}/${total}`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS ${pass}/${total}`);
}

const hub = fs.existsSync(path.join(ROOT, HUB)) ? fs.readFileSync(path.join(ROOT, HUB), "utf8") : "";
const board = fs.existsSync(path.join(ROOT, BOARD)) ? fs.readFileSync(path.join(ROOT, BOARD), "utf8") : "";
const ar = fs.existsSync(path.join(ROOT, AR)) ? fs.readFileSync(path.join(ROOT, AR), "utf8") : "";

if (process.argv.includes("--selftest")) selftest();
else {
  const f = [...checkHub(hub), ...checkBoard(board), ...checkAr(ar)];
  if (f.length) {
    for (const x of f) console.error(`${LABEL}: FAIL — ${x}`);
    process.exit(1);
  }
  console.log(`${LABEL}: PASS — Accounting Hub View-all href+ret; AR aging Back resolves ret`);
}
