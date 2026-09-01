#!/usr/bin/env node
// verify-local-ci-parity — locks verify:local-ci to the EXACT CI gate so it can never drift into a curated
// subset (the #2432 → #2435/#2431 "green-locally / red-in-CI" regression mode). Asserts, on every CI run:
//   (1) CI's build-typecheck job still runs `npm run verify:pre-commit` as its gate,
//   (2) scripts/verify-local-ci.mjs invokes that SAME command (faithful delegation),
//   (3) verify-local-ci.mjs does NOT re-run a curated subset (verify:arch-design / verify:schema-parity /
//       build:backend as a gate run-step) — the drift signature.
// If CI's gate command ever changes, this forces verify:local-ci to change in lockstep. --selftest self-checks.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-local-ci-parity";
const LOCAL_CI = "scripts/verify-local-ci.mjs";
const CI_YML = ".github/workflows/ci.yml";
const GATE = "verify:pre-commit";
// The old curated-subset signatures — their presence as run-args means someone re-implemented the gate.
const SUBSET_MARKERS = ["verify:arch-design", "verify:schema-parity", "build:backend"];

export function check(ciYml, localCi) {
  const errs = [];
  // scope to the build-typecheck job block (including build-typecheck-heavy which runs the gate)
  const job = ciYml.split(/\n(?=\s{2}\S)/).find((b) => /^\s{2}build-typecheck[-:]?/m.test(b) && /verify:pre-commit/.test(b)) || ciYml;
  if (!new RegExp(GATE).test(job))
    errs.push(`CI build-typecheck no longer runs '${GATE}' — update this guard AND ${LOCAL_CI} to the new gate command in lockstep.`);
  if (!new RegExp(`["'\`]${GATE}["'\`]`).test(localCi))
    errs.push(`${LOCAL_CI} does not invoke '${GATE}' — it must run the EXACT CI gate (not a hand-picked subset; that subset drift is what reddens PRs).`);
  for (const m of SUBSET_MARKERS)
    if (new RegExp(`\\[\\s*["'\`]run["'\`]\\s*,\\s*["'\`]${m}["'\`]`).test(localCi))
      errs.push(`${LOCAL_CI} runs '${m}' directly as a gate step — a curated subset. Delegate to '${GATE}' (which runs it dynamically) instead.`);
  return errs;
}

export function runGuard() {
  const errs = check(readFileSync(path.join(ROOT, CI_YML), "utf8"), readFileSync(path.join(ROOT, LOCAL_CI), "utf8"));
  return { ok: errs.length === 0, errs };
}

function selftest() {
  const goodCi = `  build-typecheck:\n    steps:\n      - run: npm run ${GATE}\n  other-job:\n    steps: []`;
  const goodLocal = `const res = sh("npm", ["run", "${GATE}"], { env });`;
  const badLocal = `step("arch", "npm", ["run", "verify:arch-design"]); step("sp","npm",["run","verify:schema-parity"]);`;
  const noGateCi = `  build-typecheck:\n    steps:\n      - run: npm run something-else`;
  const g = check(goodCi, goodLocal);
  const b = check(goodCi, badLocal);
  const c = check(noGateCi, goodLocal);
  let bad = 0;
  const say = (ok, n) => { if (!ok) bad++; console.log(`${ok ? "ok  " : "FAIL"}  ${n}`); };
  say(g.length === 0, "good delegating file passes");
  say(b.length >= 2, "curated-subset file flagged (>=2 markers)");
  say(c.length >= 1, "changed CI gate flagged");
  if (bad) { console.error(`\n${LABEL} SELFTEST FAILED: ${bad}`); process.exit(1); }
  console.log(`\n${LABEL} SELFTEST PASS`);
}

if (process.argv.includes("--selftest")) { selftest(); process.exit(0); }

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { ok, errs } = runGuard();
  if (!ok) { console.error(`[${LABEL}] FAIL:\n         ${errs.join("\n         ")}`); process.exit(1); }
  console.log(`[${LABEL}] OK — ${LOCAL_CI} runs the exact CI gate (${GATE}); no subset drift.`);
}
