#!/usr/bin/env node
/**
 * ENG-33 (443.325) — BankingTransactionsDesignView must not describe MatchDrawer as "orphaned".
 * MatchDrawer is the canonical USMCA bank matcher (443.163); stale comment misleads maintainers.
 *
 *   node scripts/verify-banking-designview-matchdrawer-canonical-comment.mjs
 *   node scripts/verify-banking-designview-matchdrawer-canonical-comment.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-banking-designview-matchdrawer-canonical-comment";
const FILE = "apps/frontend/src/pages/banking/components/BankingTransactionsDesignView.tsx";
const STALE = /orphaned\s+MatchDrawer/i;

export function check(source) {
  const problems = [];
  if (source == null) {
    problems.push(`${FILE}: missing`);
    return problems;
  }
  if (STALE.test(source)) {
    problems.push(
      `${FILE}: must not call MatchDrawer "orphaned" — it is the canonical matcher (443.163)`,
    );
  }
  return problems;
}

function main() {
  if (process.argv.includes("--selftest")) {
    const good = `{/* reuses MatchDrawer (canonical bank matcher, 443.163) */}`;
    if (check(good).length) {
      console.error(`${LABEL} --selftest FAIL: good fixture`, check(good));
      process.exit(1);
    }
    const bad = `{/* the orphaned MatchDrawer */}`;
    if (!check(bad).length) {
      console.error(`${LABEL} --selftest FAIL: bad fixture passed`);
      process.exit(1);
    }
    console.log(`${LABEL} --selftest OK`);
    return;
  }

  const abs = path.join(ROOT, FILE);
  const source = fs.existsSync(abs) ? fs.readFileSync(abs, "utf8") : null;
  const problems = check(source);
  if (problems.length) {
    console.error(`${LABEL} FAIL\n${problems.map((p) => `  - ${p}`).join("\n")}`);
    process.exit(1);
  }
  console.log(`${LABEL} PASS`);
}

main();
