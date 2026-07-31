#!/usr/bin/env node
/**
 * GUARD — SAF-ORPH-04. The PER-UNIT Form 2290 due date must be WIRED, not merely correct.
 *
 * THE FAILURE THIS COMES FROM, and it is a nastier shape than a wrong answer.
 * `form2290DueDateForFirstUse()` was written correctly and unit-tested hard: all 12 first-use months,
 * leap year, Labor Day, Memorial Day landing on May 31, the observed-holiday rule. Its guard
 * (verify-form-2290-due-date-irs, step 1500) was GREEN. And nothing in the application called it.
 *
 * The only consumer of a 2290 due date was the route, which called `upcomingForm2290Deadline()` — by its
 * own docstring "the July-first-use case, i.e. Aug 31". So a truck placed in service in October remained
 * silently absent from every deadline surface, due Nov 30 and shown nowhere, while a green guard said the
 * due-date logic was correct. It WAS correct. It was also dead.
 *
 * A correctness guard cannot catch this: it proves the function returns the right date when called, and
 * says nothing about whether anyone calls it. That is the gap this guard closes. Per IRS Form 2290
 * instructions the tax is due the last day of the month following the month of first use — a per-vehicle
 * rule — so a company-wide Aug 31 banner is not a simplification, it is a missed federal filing date.
 *
 * WHAT IS ASSERTED: form2290DueDateForFirstUse has at least one caller in apps/backend/src that is NOT
 * its own definition file and NOT a test/spec. Import-only does not count — a name can be imported and
 * never invoked, which is the same dead end wearing a different hat.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const LABEL = "verify:form-2290-per-unit-deadline-wired";
const FN = "form2290DueDateForFirstUse";
const DEFINITION_FILE = "form-2290-generator.ts";

/** Files that may legitimately mention the symbol without proving it is wired into the product. */
export function isExcludedFile(file) {
  const base = path.basename(file);
  if (base === DEFINITION_FILE) return true;
  return /\.(test|spec)\.[cm]?tsx?$/.test(base);
}

/** An invocation, not a mere mention. `import { fn }` and `type X = typeof fn` are not calls. */
export function callsFunction(source, fn) {
  const withoutImports = source.replace(/^\s*import[\s\S]*?from\s+["'][^"']+["'];?\s*$/gm, "");
  return new RegExp(`\\b${fn}\\s*\\(`).test(withoutImports);
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "dist" || entry.startsWith(".")) continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.[cm]?tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

export function analyse(files) {
  const callers = files
    .filter((f) => !isExcludedFile(f.file))
    .filter((f) => callsFunction(f.source, FN))
    .map((f) => f.file);
  const problems = [];
  if (callers.length === 0) {
    problems.push(
      `${FN}() has NO production caller. It computes the IRS per-unit due date (last day of the month ` +
        `FOLLOWING first use) correctly and is fully unit-tested, but nothing invokes it — so every ` +
        `deadline surface still shows only the company-wide July/Aug-31 date and a vehicle first used ` +
        `after July is never surfaced. A green correctness guard does not prove a function is reachable. ` +
        `Wire it into the compliance deadline route (or wherever a per-unit due date is shown).`
    );
  }
  return { problems, callers };
}

export function run() {
  const root = "apps/backend/src";
  const files = walk(root).map((file) => ({ file, source: readFileSync(file, "utf8") }));
  const { problems, callers } = analyse(files);
  if (problems.length > 0) return { ok: false, message: `${LABEL} FAILED:\n  - ${problems.join("\n  - ")}` };
  return { ok: true, message: `${LABEL} OK — ${FN}() invoked by ${callers.length} production file(s): ${callers.join(", ")}` };
}

function selftest() {
  let bad = 0;
  const t = (name, cond) => {
    if (!cond) {
      console.error(`  SELFTEST FAIL: ${name}`);
      bad++;
    }
  };
  const DEF = { file: `apps/backend/src/compliance/${DEFINITION_FILE}`, source: `export function ${FN}(x){return x} ${FN}(1)` };
  const TEST = { file: "apps/backend/src/compliance/form-2290.test.ts", source: `${FN}("2026-10-01")` };
  const IMPORT_ONLY = { file: "apps/backend/src/compliance/form-2290.routes.ts", source: `import { ${FN} } from "./form-2290-generator.js";\nconst d = upcomingForm2290Deadline();` };
  const REAL = { file: "apps/backend/src/compliance/form-2290.routes.ts", source: `import { ${FN} } from "./x.js";\nconst d = ${FN}(row.acquired_date);` };

  t("no caller at all fails", analyse([DEF, TEST]).problems.length === 1);
  t("the definition file does not count as a caller", isExcludedFile(DEF.file) === true);
  t("a test file does not count as a caller", isExcludedFile(TEST.file) === true);
  t("IMPORT-ONLY does not count as wired", analyse([DEF, IMPORT_ONLY]).problems.length === 1);
  t("a real invocation passes", analyse([DEF, REAL]).problems.length === 0);
  t("failure text names the function", analyse([DEF]).problems[0].includes(FN));
  // Mutation arms: each detector must be able to return the OTHER answer, or the arms above prove nothing.
  t("mutation: callsFunction is false on an import-only source", callsFunction(IMPORT_ONLY.source, FN) === false);
  t("mutation: callsFunction is true on a real call", callsFunction(REAL.source, FN) === true);
  t("mutation: a route file is NOT excluded", isExcludedFile("apps/backend/src/compliance/form-2290.routes.ts") === false);
  return bad;
}

const INVOKED_DIRECTLY = process.argv[1] && process.argv[1].endsWith("verify-form-2290-per-unit-deadline-wired.mjs");
if (INVOKED_DIRECTLY) {
  if (process.argv.includes("--selftest")) {
    const bad = selftest();
    console.log(bad === 0 ? `${LABEL} SELFTEST PASS — 9 cases` : `${LABEL} SELFTEST FAILED (${bad})`);
    process.exit(bad === 0 ? 0 : 1);
  }
  const res = run();
  console.log(res.message);
  process.exit(res.ok ? 0 : 1);
}
