#!/usr/bin/env node
/**
 * verify-banking-matchdrawer-uses-paritydrawer.mjs
 *
 * CLS-BANKING-MATCHDRAWER-NOT-PARITYDRAWER — MatchDrawer.tsx (banking's primary categorize surface)
 * used to hand-roll its own <aside className="fixed right-0..."> shell instead of the canonical
 * ParityDrawer component (DEFINITION-OF-DONE.md VERIFY-1: "Money creators are right-side
 * ParityDrawer, not a thin full page"). ParityDrawer is not cosmetic — it renders via
 * createPortal(..., document.body) specifically to avoid the INLINE-CREATE-NESTED-FORM defect class
 * (a drawer mounted inline inside another <form> loses its own <form> tag to the HTML5 parser).
 *
 * This guard locks the fix in place: MatchDrawer must import and render <ParityDrawer>, and must
 * NOT reintroduce a hand-rolled fixed-position <aside> shell.
 *
 * Usage:
 *   node scripts/verify-banking-matchdrawer-uses-paritydrawer.mjs
 *   node scripts/verify-banking-matchdrawer-uses-paritydrawer.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-banking-matchdrawer-uses-paritydrawer";
const FILE = "apps/frontend/src/pages/banking/components/MatchDrawer.tsx";

export function check(source) {
  const problems = [];
  if (source == null) {
    problems.push(`${FILE}: missing`);
    return problems;
  }
  if (!/import\s*\{\s*ParityDrawer\s*\}\s*from\s*["']\.\.\/\.\.\/\.\.\/components\/parity\/ParityDrawer["']/.test(source)) {
    problems.push(`${FILE}: must import ParityDrawer from ../../../components/parity/ParityDrawer`);
  }
  if (!/<ParityDrawer\b/.test(source)) {
    problems.push(`${FILE}: must render <ParityDrawer>`);
  }
  // The regression this guard exists to catch: a hand-rolled fixed-position shell standing in for
  // ParityDrawer (the exact pre-fix shape — fixed right-0 top-0 ... h-full w-[…]).
  if (/className="fixed right-0 top-0[^"]*h-full/.test(source)) {
    problems.push(`${FILE}: must not hand-roll a fixed right-0/h-full shell — use ParityDrawer instead`);
  }
  return problems;
}

function main() {
  if (process.argv.includes("--selftest")) {
    const good = `
      import { ParityDrawer } from "../../../components/parity/ParityDrawer";
      return (
        <ParityDrawer open={open} title="Match transaction" onClose={onClose}>
          <div>body</div>
        </ParityDrawer>
      );
    `;
    if (check(good).length) {
      console.error(`${LABEL} --selftest FAIL: good fixture failed`, check(good));
      process.exit(1);
    }
    const bad = `
      return (
        <aside className="fixed right-0 top-0 z-50 h-full w-[480px] overflow-y-auto border-l">
          body
        </aside>
      );
    `;
    if (!check(bad).length) {
      console.error(`${LABEL} --selftest FAIL: bad fixture passed`);
      process.exit(1);
    }
    if (!check(null).length) {
      console.error(`${LABEL} --selftest FAIL: missing-file fixture passed`);
      process.exit(1);
    }
    console.log(`${LABEL} --selftest OK`);
    return;
  }

  const source = fs.existsSync(path.join(ROOT, FILE)) ? fs.readFileSync(path.join(ROOT, FILE), "utf8") : null;
  const problems = check(source);
  if (problems.length) {
    console.error(`${LABEL} FAIL:`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log(`${LABEL} OK — MatchDrawer uses the canonical ParityDrawer shell`);
}

main();
