#!/usr/bin/env node
/**
 * LEAD 443.183 (443.161 load-wiring gaps reassigned from Codex) — the Settlement Creator group, one gate:
 *
 *   G3  no fallback to the company's oldest active customer: an unmatched document customer REFUSES by name
 *       (findCreatorCustomer, preview + post)                         -> scripts/verify-settlement-creator-every-line-has-load.mjs
 *   G5  every reimbursement / additional pay / reimbursable expense / fuel line carries its load or REFUSES; unit required
 *                                                                     -> scripts/verify-settlement-creator-every-line-has-load.mjs
 *   G4  the "owed" company-expense bill posts through the bill engine, id kept, voided on Edit, on the load spine
 *                                                                     -> scripts/verify-settlement-creator-owed-bill-posted.mjs
 *   G13 company expenses go through THE shared expense writer (load link, duplicate refusal, item / quantity / rate on the line)
 *                                                                     -> scripts/verify-settlement-creator-expense-stamped-and-sourced.mjs
 *   G14 every deduction posts by its own type (resolveCreatorDeductionType), never all "other" -> 7200   (static, below)
 *
 * All five were built in ROUND 443.110 (#26621 G3+G5, #26624 G4, #26629 G13, #26623 G14). 443.183 measured them still in
 * place on origin/main 0aa77cf874; the G13 guard itself was RED there — its pins still read the route module the shared
 * writer left in #26691 (expenses.routes.ts -> expense-writer.service.ts) and the pre-443.128 header stamp — and is
 * repointed in this round, so this gate is RED on that main and GREEN here.
 *
 *   --selftest       plants a regression per clause and asserts the gate catches each
 *   --against-main   runs the same gate on an origin/main checkout (temporary detached worktree)
 */
import { readFileSync, existsSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";

const HERE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const SERVICE = "apps/backend/src/driver-finance/settlement-creator.service.ts";
const DED = "apps/backend/src/driver-finance/settlement-creator-deduction-type.ts";
const DELEGATES = [
  ["G3+G5", "scripts/verify-settlement-creator-every-line-has-load.mjs"],
  ["G4", "scripts/verify-settlement-creator-owed-bill-posted.mjs"],
  ["G13", "scripts/verify-settlement-creator-expense-stamped-and-sourced.mjs"],
];

/** G14 — the deduction loop resolves each line's type and passes it to the one deduction writer. */
export function checkG14(service, ded) {
  const out = [];
  // the POSTING loop (the preview has its own deductions loop): the one that calls applyDeduction
  const loop = (service.match(/for \(const d of draft\.deductions \?\? \[\]\) \{[\s\S]{0,900}?await applyDeduction\([^)]*\);/) ?? [""])[0];
  if (!loop) out.push(`${SERVICE}: the Creator deduction loop is missing (G14)`);
  if (!/const \{ deductionType \} = await resolveCreatorDeductionType\(/.test(loop)) out.push(`${SERVICE}: a deduction's type is not resolved from its item (G14)`);
  if (!/await applyDeduction\([^)]*deductionType\)/.test(loop)) out.push(`${SERVICE}: the resolved deduction type is not what the deduction posts with (G14)`);
  if (/applyDeduction\([^)]*["']other["']\)/.test(service)) out.push(`${SERVICE}: a deduction is posted as a hard-coded "other" (G14)`);
  if (!/export async function resolveCreatorDeductionType\(/.test(ded)) out.push(`${DED}: resolveCreatorDeductionType is missing (G14)`);
  if (!/ADMIN_FEE_LINE_RE/.test(ded)) out.push(`${DED}: the admin fee is not typed by name (G14)`);
  return out;
}

function runGate(root) {
  const findings = [];
  for (const [label, rel] of DELEGATES) {
    if (!existsSync(join(root, rel))) { findings.push(`${rel}: missing (${label})`); continue; }
    const r = spawnSync(process.execPath, [join(root, rel)], { cwd: root, encoding: "utf8" });
    if (r.status !== 0) findings.push(`${rel} (${label}): ${((r.stderr || "") + (r.stdout || "")).split("\n").filter((l) => /FAIL|✗|^\s+-/.test(l)).slice(0, 3).join(" | ") || `exit ${r.status}`}`);
  }
  const read = (rel) => (existsSync(join(root, rel)) ? readFileSync(join(root, rel), "utf8") : "");
  findings.push(...checkG14(read(SERVICE), read(DED)));
  return findings;
}

if (process.argv.includes("--selftest")) {
  const service = readFileSync(join(HERE_ROOT, SERVICE), "utf8");
  const ded = readFileSync(join(HERE_ROOT, DED), "utf8");
  if (checkG14(service, ded).length) { console.error("SELFTEST FAIL: G14 baseline not clean", checkG14(service, ded)); process.exit(1); }
  const plants = [
    ["G14 type not resolved", service.replace("const { deductionType } = await resolveCreatorDeductionType(", "const { deductionType } = await noop("), ded],
    ["G14 posts as other", service.replace(/await applyDeduction\(d\.amount_cents, reason, d\.load_number, deductionType\)/, 'await applyDeduction(d.amount_cents, reason, d.load_number, "other")'), ded],
    ["G14 resolver gone", service, ded.replace("export async function resolveCreatorDeductionType(", "async function resolveCreatorDeductionTypeX(")],
  ];
  for (const [name, s, d] of plants) if (!checkG14(s, d).length) { console.error(`SELFTEST FAIL: plant "${name}" not caught`); process.exit(1); }
  // Each delegate carries its own per-clause plants (G3/G5 11, G4, G13 8): run them.
  for (const [label, rel] of DELEGATES) {
    const r = spawnSync(process.execPath, [join(HERE_ROOT, rel), "--selftest"], { cwd: HERE_ROOT, encoding: "utf8" });
    if (r.status !== 0) { console.error(`SELFTEST FAIL: ${rel} --selftest (${label})`); process.exit(1); }
  }
  console.log(`SELFTEST PASS: ${plants.length} G14 plants caught; ${DELEGATES.length} delegate selftests pass (G3+G5, G4, G13)`);
  process.exit(0);
}

let root = HERE_ROOT;
let tmp = null;
if (process.argv.includes("--against-main")) {
  tmp = mkdtempSync(join(tmpdir(), "v18535-"));
  const wt = spawnSync("git", ["worktree", "add", "--detach", tmp, "origin/main"], { cwd: HERE_ROOT, encoding: "utf8" });
  if (wt.status !== 0) { console.error(wt.stderr); process.exit(2); }
  try { symlinkSync(join(HERE_ROOT, "node_modules"), join(tmp, "node_modules")); } catch { /* present */ }
  root = tmp;
}
try {
  const findings = runGate(root);
  if (findings.length) {
    console.error(`verify-creator-refuses-unmatched-customer-and-loadless-lines FAIL (${findings.length})${tmp ? " [origin/main]" : ""}:`);
    for (const f of findings) console.error(`  ${f}`);
    process.exitCode = 1;
  } else {
    console.log("verify-creator-refuses-unmatched-customer-and-loadless-lines PASS — G3 no customer fallback, G5 every line carries its load, G4 owed bill posted, G13 shared expense writer, G14 deductions by type");
  }
} finally {
  if (tmp) {
    spawnSync("git", ["worktree", "remove", "--force", tmp], { cwd: HERE_ROOT });
    try { rmSync(tmp, { recursive: true, force: true }); } catch { /* gone */ }
  }
}
