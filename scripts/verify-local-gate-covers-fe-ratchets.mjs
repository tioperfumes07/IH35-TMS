#!/usr/bin/env node
/**
 * META-GUARD: the local pre-push gate must carry every GLOBAL FE component ratchet that CI runs.
 *
 * WHY THIS EXISTS (measured, 2026-08-05): PR #4484 red'd CI five times in a row on repo UI standards
 * that a 0.1s static scan catches — money-fields-use-moneyinput, no-raw-date-input,
 * no-native-datetime-input (bare ISO date in JSX), referenceselect-coverage-ratchet — each a one-line
 * component swap, each costing a full build-typecheck cycle (5m37s+).
 *
 * I first fixed that by hand-listing FE guards in money-pr-local-gate.mjs. That list MISSED
 * verify-referenceselect-coverage-ratchet, because I grepped locked-guards.yml for
 * `node scripts/verify-*.mjs` and that guard is invoked as `npm run verify:*`. The next CI cycle
 * burned on the guard my fix had just failed to include. A hand-maintained mirror of another list
 * rots the moment someone adds a guard — so this asserts the mirror instead of trusting it.
 *
 * WHAT IT ASSERTS: every guard CI invokes (either form) whose name matches the GLOBAL FE-standard
 * shape must appear in money-pr-local-gate.mjs's STEPS. Add a new global FE ratchet to CI and this
 * fails until the local gate carries it too — the gate maintains itself.
 *
 * DELIBERATELY OUT OF SCOPE: the ~100 per-page `*-uses-paritytable` guards. They only fire when you
 * touch their own page, and running them all would make the gate slow enough that people skip it,
 * which is how a gate dies. Scope is global ratchets — the ones ANY new FE file can trip.
 */
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const LABEL = "verify-local-gate-covers-fe-ratchets";
const WORKFLOW = ".github/workflows/locked-guards.yml";
const GATE = "scripts/money-pr-local-gate.mjs";
const PKG = "package.json";

/**
 * A GLOBAL FE component ratchet: enforces "use the shared component / helper, not the raw element"
 * across all of apps/frontend/src. Per-page guards (`<page>-uses-paritytable`) are excluded.
 */
const GLOBAL_FE_RATCHET = /^verify-(no-raw-|no-native-|money-fields-use-|referenceselect-|no-internal-language-)/;
const PER_PAGE_EXCLUDE = /-uses-paritytable$/;

export function isGlobalFeRatchet(scriptName) {
  return GLOBAL_FE_RATCHET.test(scriptName) && !PER_PAGE_EXCLUDE.test(scriptName);
}

/** Guards CI invokes, in BOTH forms: `node scripts/verify-x.mjs` and `npm run verify:x`. */
export function guardsInvokedByCi(workflowYml, pkgJson) {
  const names = new Set();
  for (const m of workflowYml.matchAll(/node\s+scripts\/(verify-[a-z0-9-]+)\.mjs/g)) names.add(m[1]);
  for (const m of workflowYml.matchAll(/npm\s+run\s+(verify:[a-z0-9:-]+)/g)) {
    const script = pkgJson.scripts?.[m[1]];
    if (!script) continue;
    // Resolve the npm alias to the underlying script file — this indirection is what the first
    // hand-written list missed.
    for (const s of script.matchAll(/scripts\/(verify-[a-z0-9-]+)\.mjs/g)) names.add(s[1]);
  }
  return [...names];
}

/** Guards the local gate already runs. */
export function guardsInLocalGate(gateSrc) {
  return [...gateSrc.matchAll(/scripts\/(verify-[a-z0-9-]+)\.mjs/g)].map((m) => m[1]);
}

export function audit({ workflowYml, pkgJson, gateSrc }) {
  const ci = guardsInvokedByCi(workflowYml, pkgJson);
  const gate = new Set(guardsInLocalGate(gateSrc));
  const required = ci.filter(isGlobalFeRatchet);
  if (required.length === 0) {
    return [
      `${LABEL}: found ZERO global FE ratchets in ${WORKFLOW} — the parser is stale (CI invocation ` +
        `style changed?). Refusing to pass vacuously.`,
    ];
  }
  const missing = required.filter((n) => !gate.has(n));
  return missing.map(
    (n) =>
      `${GATE} is missing "${n}", which CI runs. A screens PR can pass the whole local gate and still ` +
      `red CI on it — the exact loop that cost PR #4484 five cycles. Add it to STEPS in ${GATE}.`
  );
}

function auditTree() {
  for (const rel of [WORKFLOW, GATE, PKG]) {
    if (!existsSync(join(ROOT, rel))) return [`${rel} not found — cannot verify local/CI parity.`];
  }
  return audit({
    workflowYml: readFileSync(join(ROOT, WORKFLOW), "utf8"),
    pkgJson: JSON.parse(readFileSync(join(ROOT, PKG), "utf8")),
    gateSrc: readFileSync(join(ROOT, GATE), "utf8"),
  });
}

function selftest() {
  const failures = [];
  const pkg = { scripts: { "verify:referenceselect-coverage-ratchet": "node scripts/verify-referenceselect-coverage-ratchet.mjs" } };
  const wf = `
      - run: node scripts/verify-no-raw-date-input.mjs
      - run: npm run verify:referenceselect-coverage-ratchet
      - run: node scripts/verify-account-register-page-uses-paritytable.mjs
  `;

  // The exact miss that burned #4484: the npm-run-aliased guard absent from the gate.
  const gateMissing = `["verify-no-raw-date-input", "scripts/verify-no-raw-date-input.mjs"],`;
  const missed = audit({ workflowYml: wf, pkgJson: pkg, gateSrc: gateMissing });
  if (!missed.some((p) => p.includes("referenceselect-coverage-ratchet")))
    failures.push("case1 FAIL — an npm-run-aliased CI guard missing from the gate was NOT caught");

  // Both present → clean.
  const gateFull =
    gateMissing + `["verify-referenceselect-coverage-ratchet", "scripts/verify-referenceselect-coverage-ratchet.mjs"],`;
  if (audit({ workflowYml: wf, pkgJson: pkg, gateSrc: gateFull }).length !== 0)
    failures.push("case2 FAIL — a complete gate was flagged");

  // Per-page paritytable guards must NOT be demanded.
  if (audit({ workflowYml: wf, pkgJson: pkg, gateSrc: gateFull }).some((p) => p.includes("paritytable")))
    failures.push("case3 FAIL — a per-page paritytable guard was demanded of the local gate");

  // Stale parser must fail loudly, not pass on an empty set.
  if (audit({ workflowYml: "- run: echo nothing", pkgJson: {}, gateSrc: gateFull }).length === 0)
    failures.push("case4 FAIL — a stale parser passed vacuously");

  const tree = auditTree();
  if (tree.length !== 0) failures.push(`case5 FAIL — real tree flagged: ${tree.join(" | ")}`);

  if (failures.length) {
    for (const f of failures) console.error(`  ✗ ${LABEL}: ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL}: selftest PASS — npm-alias miss caught, per-page guards excluded, stale parser fails loudly`);
}

function main() {
  if (process.argv.includes("--selftest")) return selftest();
  const problems = auditTree();
  if (problems.length) {
    for (const p of problems) console.error(`  ✗ ${p}`);
    process.exit(1);
  }
  console.log(`${LABEL} OK — local gate carries every global FE ratchet CI runs`);
}

main();
