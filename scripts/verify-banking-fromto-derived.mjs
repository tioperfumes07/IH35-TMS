#!/usr/bin/env node
// B-A4 GUARD — the money-in/out categorize From/To must stay DERIVED (BANK → category/payee, locked FIX-04),
// never a free-text input. A re-added editable `value={draft.fromTo}` input updates only local draft state and
// is dropped before persistence, so it reads as an unwired field (the 2026-07-15 "From/To not wired" report).
// The Transfer / CC-Payment branches keep their modal buttons — those persist via their own endpoint.
import fs from "node:fs";

const FILE = "apps/frontend/src/pages/banking/components/BankingTransactionsDesignView.tsx";
// An editable From/To input = an <input ... value={draft.fromTo} ...> (whitespace-insensitive).
const FREETEXT_INPUT = /<input[^>]*value=\{\s*draft\.fromTo\s*\}/s;

export function checkFile(src) {
  const s = String(src || "");
  const reasons = [];
  if (FREETEXT_INPUT.test(s)) reasons.push(`${FILE}: re-introduced a free-text From/To <input value={draft.fromTo}> — From/To is DERIVED (FIX-04); show computeFromTo() read-only instead`);
  if (!/computeFromTo\(/.test(s)) reasons.push(`${FILE}: must render the derived From/To via computeFromTo()`);
  return reasons;
}

function selfTest() {
  const cases = [
    { name: "derived read-only -> ok", got: checkFile('<div>{computeFromTo(tx, draft)}</div>').length, want: 0 },
    { name: "free-text input -> flagged", got: checkFile('<input className="x" value={draft.fromTo} onChange={e=>0} /> computeFromTo(').some((r) => /free-text/.test(r)), want: true },
    { name: "free-text input multiline -> flagged", got: checkFile('<input\n  className="x"\n  value={ draft.fromTo }\n/>\ncomputeFromTo(').some((r) => /free-text/.test(r)), want: true },
    { name: "missing computeFromTo -> flagged", got: checkFile("<div>from/to</div>").some((r) => /computeFromTo/.test(r)), want: true },
  ];
  let failed = 0;
  for (const c of cases) {
    const ok = c.got === c.want;
    if (!ok) failed++;
    console.log(`${ok ? "ok  " : "FAIL"}  ${c.name}  (got ${JSON.stringify(c.got)}, want ${JSON.stringify(c.want)})`);
  }
  if (failed) { console.error(`\nself-test FAILED: ${failed}/${cases.length}`); process.exit(1); }
  console.log(`\nself-test PASS: ${cases.length}/${cases.length}`);
}

function main() {
  if (process.argv.includes("--self-test")) { selfTest(); return; }
  selfTest();
  let src = "";
  try { src = fs.readFileSync(FILE, "utf8"); } catch { console.error(`FAIL: cannot read ${FILE}`); process.exit(1); }
  const reasons = checkFile(src);
  if (reasons.length) {
    console.error("\nFAIL verify-banking-fromto-derived:");
    reasons.forEach((r) => console.error(`  • ${r}`));
    process.exit(1);
  }
  console.log("\nPASS verify-banking-fromto-derived — From/To stays derived, no free-text input.");
}

main();
