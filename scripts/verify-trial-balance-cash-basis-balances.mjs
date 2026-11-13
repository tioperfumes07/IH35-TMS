#!/usr/bin/env node
/**
 * verify-trial-balance-cash-basis-balances — BOARD 26 (LEAD ROUND 8.25).
 * Root cause it guards (live, BOARD-45-STATUS row 26): explicit Cash TB showed "Out of balance" while Accrual
 * balanced, because the cash plug used the balance-sheet identity A − (L + E) (ignores Revenue / Expense rows,
 * |net| on L and E, and booked an excess of debits as another debit); and ?basis=cash opened Accrual.
 *   1. the TB transform plugs Σ debits − Σ credits to the opposite side (credit when debits exceed);
 *   2. it no longer feeds balance-sheet totals into the TB plug;
 *   3. the TB page reads basis/from/to from the URL and writes them back on Apply.
 * Usage: node scripts/verify-trial-balance-cash-basis-balances.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-trial-balance-cash-basis-balances";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const XF = "apps/backend/src/accounting/cash-basis/report-transforms.ts";
const PAGE = "apps/frontend/src/pages/reports/TrialBalancePage.tsx";

function tbBody(src) {
  const i = src.indexOf("export function transformTrialBalanceToCashBasis");
  return i < 0 ? "" : src.slice(i, src.indexOf("\n}\n", i));
}

export function check(files) {
  const f = [];
  const tb = tbBody(files[XF] ?? "");
  const page = files[PAGE] ?? "";
  if (!tb) return ["transformTrialBalanceToCashBasis missing"];
  if (!/const excessDebits = preDebits - preCredits;/.test(tb)) f.push("TB plug is not the trial balance's own debit − credit difference");
  if (!/total_debits: excessDebits < 0 \? -excessDebits : 0,\s+total_credits: excessDebits > 0 \? excessDebits : 0,/.test(tb)) f.push("TB plug is not booked to the opposite side");
  if (/filter\(\(row\) => row\.account_type === "Asset"\)/.test(tb)) f.push("TB plug still derives from balance-sheet totals");
  if (!/useState\(\(\) => readTrialBalanceUrlState\(searchParams, emptyFilters\)\)/.test(page)) f.push("TB page does not read basis/period from the URL");
  if (!/setSearchParams\(writeTrialBalanceUrlState\(searchParams, next\), \{ replace: true \}\)/.test(page)) f.push("TB page does not write basis/period back to the URL on Apply");
  if (!/basis === "cash" \|\| basis === "accrual" \? basis : defaults\.basis/.test(page)) f.push("URL basis is not honored");
  return f;
}

function readAll() {
  const out = {};
  for (const rel of [XF, PAGE]) {
    const abs = path.join(ROOT, rel);
    out[rel] = fs.existsSync(abs) ? fs.readFileSync(abs, "utf8") : "";
  }
  return out;
}

function selftest() {
  const live = readAll();
  const mut = (key, from, to) => ({ ...live, [key]: live[key].replace(from, to) });
  const cases = [
    ["plug from BS identity", mut(XF, "const excessDebits = preDebits - preCredits;", "const excessDebits = assetsTotal - liabilitiesAndEquity;")],
    ["plug on the same side", mut(XF, "total_debits: excessDebits < 0 ? -excessDebits : 0,", "total_debits: excessDebits > 0 ? excessDebits : 0,")],
    ["URL ignored", mut(PAGE, "useState(() => readTrialBalanceUrlState(searchParams, emptyFilters))", "useState(emptyFilters)")],
    ["URL not written", mut(PAGE, "setSearchParams(writeTrialBalanceUrlState(searchParams, next), { replace: true })", "void 0")],
    ["cash basis dropped", mut(PAGE, 'basis === "cash" || basis === "accrual" ? basis : defaults.basis', "defaults.basis")],
    ["transform deleted", { ...live, [XF]: "" }],
  ];
  let pass = 0;
  const liveF = check(live);
  if (liveF.length === 0) pass += 1; else console.error(`${LABEL} --selftest: live tree fails`, liveF);
  for (const [name, files] of cases) {
    if (check(files).length > 0) pass += 1; else console.error(`${LABEL} --selftest: did not catch "${name}"`);
  }
  const total = cases.length + 1;
  if (pass !== total) { console.error(`${LABEL} --selftest FAIL ${pass}/${total}`); process.exit(1); }
  console.log(`${LABEL} --selftest PASS ${pass}/${total}`);
}

if (process.argv.includes("--selftest")) selftest();
else {
  const f = check(readAll());
  if (f.length) { for (const x of f) console.error(`${LABEL}: FAIL — ${x}`); process.exit(1); }
  console.log(`${LABEL}: PASS — cash-basis TB plug = its own debit/credit difference, opposite side; basis + period round-trip the URL`);
}
