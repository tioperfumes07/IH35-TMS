#!/usr/bin/env node
// ============================================================================
// verify-program-board-no-autocommit.mjs — STATIC CI GUARD (NON-FINANCIAL)
// ----------------------------------------------------------------------------
// Locks the fix for the "every-20-min auto-commit prod-deploy storm":
//   * The program-board-sync workflow MUST NOT commit/push generated JSON to
//     `main` (every merge to main is a prod deploy → ~72 redeploys/day).
//   * It MUST refresh the board LIVE by writing a snapshot to R2 (`--to-r2`).
//
// FAILS if the workflow reintroduces a push-to-main, or drops the R2 write.
// Self-test: node scripts/verify-program-board-no-autocommit.mjs --selftest
// ============================================================================
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WF_REL = ".github/workflows/program-board-sync.yml";
const WF_PATH = path.join(ROOT, WF_REL);

// Patterns that reintroduce the deploy storm (commit/push generated board JSON to main).
const FORBIDDEN = [
  { re: /git\s+push\s+.*HEAD:main/i, why: "pushes generated JSON to main (triggers a prod deploy)" },
  { re: /git\s+push\s+origin\s+main/i, why: "pushes to main (triggers a prod deploy)" },
  { re: /git\s+commit\b[^\n]*program-board/i, why: "commits generated program-board JSON" },
];
// The live-refresh path MUST go to R2 instead.
const REQUIRED = [{ re: /--to-r2|board:sync:r2/, why: "the R2 live-snapshot write (`--to-r2`)" }];

function check(text) {
  const failures = [];
  for (const f of FORBIDDEN) if (f.re.test(text)) failures.push(`FORBIDDEN present — ${f.why} (${f.re})`);
  for (const r of REQUIRED) if (!r.re.test(text)) failures.push(`REQUIRED missing — ${r.why} (${r.re})`);
  return failures;
}

if (process.argv.includes("--selftest")) {
  const bad = `run: |\n  git commit -m "x"\n  git push origin HEAD:main`;
  const good = `run: npm run board:sync:r2`;
  const badFails = check(bad);
  const goodFails = check(good);
  const ok = badFails.length > 0 && goodFails.length === 0;
  if (!ok) {
    console.error("verify-program-board-no-autocommit --selftest: FAIL");
    console.error("  bad-config failures (expected >0):", badFails);
    console.error("  good-config failures (expected 0):", goodFails);
    process.exit(1);
  }
  console.log("verify-program-board-no-autocommit --selftest: PASS (negative + positive both behave)");
  process.exit(0);
}

if (!fs.existsSync(WF_PATH)) {
  console.error(`verify-program-board-no-autocommit: FAIL — workflow not found: ${WF_REL}`);
  process.exit(1);
}
const text = fs.readFileSync(WF_PATH, "utf8");
const failures = check(text);
if (failures.length) {
  console.error(`verify-program-board-no-autocommit: FAIL — ${WF_REL}`);
  for (const f of failures) console.error(`  - ${f}`);
  console.error(
    "\nThe program board must refresh LIVE via an R2 snapshot (`board:sync:r2` / `--to-r2`), " +
      "NEVER by committing generated JSON to `main` (every merge to main is a prod deploy)."
  );
  process.exit(1);
}
console.log(
  `verify-program-board-no-autocommit: PASS — ${WF_REL} refreshes live via R2, no commit/push to main.`
);
