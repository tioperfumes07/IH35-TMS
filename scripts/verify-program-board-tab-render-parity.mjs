#!/usr/bin/env node
/**
 * verify-program-board-tab-render-parity.mjs
 *
 * CI guard for the "Audit & Bug Sweep renders blank" regression.
 *
 * Root cause it locks down: apps/frontend/src/pages/program/ProgramBoardPage.tsx builds
 * `baseRows` via an if / else-if chain — one branch per shared-table tab
 * (`all`, `focus`, `pending`, `owner`, `dispatch`, `audit`). Those rows are shaped
 * identically (extra-track tabs go through `extraToRow`) and are meant to render in the
 * SAME table block, which is gated by a single render-guard condition:
 *
 *   {!isLoading && !isError && (tab === "focus" || tab === "all" || ... ) ? ( <table> ) : ...}
 *
 * The `audit` tab was wired everywhere (TABS entry, `auditRows` memo, the tab-selection
 * switch) EXCEPT this render guard — so audit rows computed but the table never rendered
 * and the tab was blank. A future added extra-track tab could regress the same silent way.
 * (The tab-selection switch was later hoisted from `activeRows` into a `baseRows` memo so
 * the unfiltered total count has its own denominator; this guard reads `baseRows`.)
 *
 * Rule enforced here: EVERY tab id that has a `baseRows` switch branch (i.e. is meant to
 * render the shared table) MUST also appear in the table-render guard condition. If any tab
 * is in the switch but missing from the guard, this fails (exit 1) and names it.
 *
 * Run: node scripts/verify-program-board-tab-render-parity.mjs
 * Self-test: node scripts/verify-program-board-tab-render-parity.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const TARGET = path.join(ROOT, "apps/frontend/src/pages/program/ProgramBoardPage.tsx");

/** Extract every distinct `tab === "x"` id from a chunk of source text. */
function tabIds(text) {
  const set = new Set();
  const re = /tab\s*===\s*"([a-z0-9-]+)"/gi;
  let m;
  while ((m = re.exec(text)) !== null) set.add(m[1]);
  return set;
}

/**
 * Given the full source, return { switchTabs, guardTabs }.
 *  - switchTabs: tab ids that have a branch in the `baseRows = useMemo(...)` if/else-if chain
 *    (the tabs meant to render the shared table).
 *  - guardTabs: tab ids present in the table-render guard condition (the guard line that carries
 *    the `tab === "all"` branch — the shared table block, distinct from the merged/hold/questions
 *    /ideas guards which each render their own bespoke block).
 */
function extract(src) {
  const memoMatch = src.match(/const\s+baseRows\s*=\s*useMemo<Row\[\]>\(\(\)\s*=>\s*\{([\s\S]*?)\},\s*\[/);
  if (!memoMatch) {
    throw new Error("could not locate the `baseRows = useMemo<Row[]>(...)` block");
  }
  const switchTabs = tabIds(memoMatch[1]);

  const guardLine = src
    .split("\n")
    .find((l) => l.includes("!isLoading") && l.includes("!isError") && /tab\s*===\s*"all"/.test(l) && l.includes("? ("));
  if (!guardLine) {
    throw new Error("could not locate the table-render guard line (the `!isLoading ... tab === \"all\" ... ? (` line)");
  }
  const guardTabs = tabIds(guardLine);

  return { switchTabs, guardTabs, guardLine };
}

/** The core assertion, factored out so the self-test can exercise it directly. */
function findMissing(switchTabs, guardTabs) {
  return [...switchTabs].filter((t) => !guardTabs.has(t)).sort();
}

function runSelftest() {
  const failures = [];

  // NEGATIVE: audit is in the switch but dropped from the guard → MUST be flagged.
  const switchSet = new Set(["all", "focus", "pending", "owner", "dispatch", "audit"]);
  const guardMissingAudit = new Set(["focus", "all", "pending", "owner", "dispatch"]);
  const missing = findMissing(switchSet, guardMissingAudit);
  if (!missing.includes("audit")) {
    failures.push(`negative-test FAILED: dropping "audit" from the guard was not detected (missing=${JSON.stringify(missing)})`);
  }

  // POSITIVE: guard covers every switch tab → MUST pass clean.
  const guardComplete = new Set(["focus", "all", "pending", "owner", "dispatch", "audit"]);
  const ok = findMissing(switchSet, guardComplete);
  if (ok.length !== 0) {
    failures.push(`positive-test FAILED: complete guard reported spurious missing tabs=${JSON.stringify(ok)}`);
  }

  if (failures.length > 0) {
    console.error("verify-program-board-tab-render-parity --selftest: FAIL");
    for (const f of failures) console.error("  - " + f);
    process.exit(1);
  }
  console.log("verify-program-board-tab-render-parity --selftest: PASS (negative + positive checks both behave)");
}

function main() {
  if (process.argv.includes("--selftest")) {
    runSelftest();
    return;
  }

  if (!fs.existsSync(TARGET)) {
    console.error(`verify-program-board-tab-render-parity: FAIL — target not found: ${path.relative(ROOT, TARGET)}`);
    process.exit(1);
  }

  const src = fs.readFileSync(TARGET, "utf8");
  const { switchTabs, guardTabs } = extract(src);
  const missing = findMissing(switchTabs, guardTabs);

  if (missing.length > 0) {
    console.error("verify-program-board-tab-render-parity: FAIL — tab(s) render blank:\n");
    for (const t of missing) {
      console.error(
        `  - tab "${t}" has a \`baseRows\` switch branch but is MISSING from the table-render guard ` +
          `condition in ProgramBoardPage.tsx. Its rows compute but the table never renders (blank tab). ` +
          `Add \`|| tab === "${t}"\` to the guard.`
      );
    }
    console.error(`\n${missing.length} tab(s) out of parity.`);
    process.exit(1);
  }

  console.log(
    `verify-program-board-tab-render-parity: PASS — every shared-table tab ` +
      `[${[...switchTabs].sort().join(", ")}] is present in the render guard.`
  );
}

main();
