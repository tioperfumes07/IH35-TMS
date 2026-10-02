#!/usr/bin/env node
// ROUND 301 audit (CC-1, proven on a Neon fork) — reversing a cash advance (1) voids the cash_advance_repayment
// deduction its approval minted, so the next settlement stops withholding money for an advance that no longer exists,
// and (2) stamps the liability status 'voided' (driver_liabilities_status_matches_voided_at) — 'reversed' made every
// reverse with a liability throw 23514. Fails if the reverse stops voiding the repayment through voidSettlementDeduction,
// if either approval writer changes the "Cash advance <display_id> (" reason key the reverse matches on, or if the
// liability is stamped anything but 'voided' alongside voided_at.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-advance-reverse-voids-repayment";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const F = {
  reverse: "apps/backend/src/cash-advances/cash-advance-create.ts",
  requests: "apps/backend/src/driver-finance/cash-advance-requests.service.ts",
  owner: "apps/backend/src/driver-finance/cash-advance-owner-approval.service.ts",
};

export function problems(s) {
  const p = [];
  const fn = s.reverse.slice(s.reverse.indexOf("export async function reverseDriverAdvanceInClientTx"));
  if (!/deduction_type = 'cash_advance_repayment'[\s\S]{0,200}left\(reason, length\(\$3\) \+ 2\) = \$3 \|\| ' \('/.test(fn) || !/`Cash advance \$\{advRow\.display_id\}`/.test(fn)) p.push(`${F.reverse}: the reverse must find the advance's repayment deduction by its "Cash advance <display_id> (" key`);
  if (!/await voidSettlementDeduction\(/.test(fn)) p.push(`${F.reverse}: the repayment deduction must be voided through voidSettlementDeduction`);
  const liab = fn.slice(fn.indexOf("UPDATE driver_finance.driver_liabilities"), fn.indexOf("UPDATE driver_finance.driver_liabilities") + 700);
  if (!/status = 'voided',/.test(liab) || /status = 'reversed'/.test(liab)) p.push(`${F.reverse}: the liability must be stamped status 'voided' with voided_at (check constraint)`);
  for (const k of ["requests", "owner"]) {
    if (!/sourceType: "cash_advance_repayment",\s*reason: `Cash advance \$\{core\.displayId\} \(/.test(s[k])) p.push(`${F[k]}: the repayment deduction reason must start "Cash advance \${core.displayId} (" (the reverse matches on it)`);
  }
  return p;
}

const load = () => Object.fromEntries(Object.entries(F).map(([k, v]) => [k, readFileSync(path.join(ROOT, v), "utf8")]));
export function run() { return problems(load()); }

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const s = load();
  const own = problems(s);
  if (process.argv.includes("--selftest")) {
    if (own.length) { console.error(`${LABEL} --selftest FAIL on the real tree — ${own.join("; ")}`); process.exit(1); }
    const plants = [
      ["no void", { ...s, reverse: s.reverse.replace("await voidSettlementDeduction(", "await noop(") }],
      ["status reversed", { ...s, reverse: s.reverse.replace("status = 'voided',", "status = 'reversed',") }],
      ["writer key drift", { ...s, owner: s.owner.replace("reason: `Cash advance ${core.displayId} (", "reason: `Advance ${core.displayId} (") }],
    ];
    for (const [name, planted] of plants) if (!problems(planted).length) { console.error(`${LABEL} --selftest FAIL — plant "${name}" not caught`); process.exit(1); }
    console.log(`${LABEL} --selftest PASS (real tree clean; ${plants.length}/${plants.length} plants caught)`);
    process.exit(0);
  }
  if (own.length) { console.error(`${LABEL}: FAIL —\n  ${own.join("\n  ")}`); process.exit(1); }
  console.log(`${LABEL}: OK — reversing an advance voids its repayment deduction and stamps the liability 'voided'.`);
}
