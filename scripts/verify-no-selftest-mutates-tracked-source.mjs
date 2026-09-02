#!/usr/bin/env node
// verify:no-selftest-mutates-tracked-source
// Root-cause guard (new P-A item, 2026-08-31): `docs/bus/GUARD-SELFTEST-MUTATES-SOURCE-2026-08-31.md`
// — 611 guard scripts both run a --selftest AND call writeFileSync; 401 restore the
// original in a `finally` block, 210 have no `finally` at all (corrupt the tree on ANY
// failure); a killed verify-static run left apps/backend/src/dispatch/book-load.service.ts
// mutated in the shared working tree, plus two orphaned scratch dirs. A `finally` cannot
// run through SIGKILL — the fix is ONE RULE, not more finally blocks:
//
//   A selftest must NEVER mutate tracked source. Copy the target to a temp path, plant
//   the failure in the copy, assert against the copy. Nothing in the working tree is
//   ever touched.
//
// This guard is a static source scan (matching the class of checks already in this repo
// — e.g. verify-verify-step-runner-return-status.mjs) over every scripts/verify*.mjs and
// scripts/verify-steps/*.mjs file: it flags any `writeFileSync`/`writeFile`/`appendFileSync`
// call whose target path resolves — directly as a string literal, or one hop through an
// intermediate variable/path constant (the dominant real pattern here: `const DISPATCH =
// path.join(ROOT, "apps/...")` then `writeFileSync(path.join(DISPATCH, FILE), ...)`) — to
// somewhere under apps/ or packages/, UNLESS the target is traceably temp-derived
// (mkdtempSync/os.tmpdir()). It is necessarily a heuristic, not a full data-flow analysis
// — a clean run means "no obvious violation found," not an absolute proof, exactly like
// the guard population it audits.
//
// Shrink-only ratchet (matching verify-a11y-input-labels.mjs's convention): the live scan
// found 696 pre-existing call sites across 282 files at introduction time — baselined in
// scripts/.no-selftest-mutates-tracked-source-baseline.json as a ceiling, not a target.
// This guard fails only when the live count goes ABOVE that baseline (a NEW violation);
// it does not retroactively block every other PR on 282 files of pre-existing debt. Lower
// the baseline as files are fixed to the real rule: copy-to-temp, never mutate tracked
// source.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPTS_DIR = path.join(ROOT, "scripts");

const WRITE_CALL_RE = /\b(writeFileSync|writeFile|appendFileSync|appendFile)\s*\(\s*([^,)]+)/g;
const TMP_SAFE_RE = /mkdtempSync|mkdtemp\s*\(|os\.tmpdir\(\)|tmpdir\(\)/;
const TARGETS_TRACKED_SOURCE_RE = /(["'`])(?:\.\.\/)*apps\//;
const TARGETS_PACKAGES_RE = /(["'`])(?:\.\.\/)*packages\//;

const SELF_PATH = fileURLToPath(import.meta.url);

function listScriptFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "__tests__") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listScriptFiles(full));
      continue;
    }
    if (full === SELF_PATH) continue; // this file's own --selftest fixtures are fabricated
    // strings, not real writeFileSync calls against tracked source — excluding this file
    // from its own scan avoids a self-inflicted false positive, not a blind spot: its
    // fixtures are asserted directly (see --selftest above), not via the file scan below.
    if (entry.isFile() && (entry.name.startsWith("verify-") || entry.name === "verify-pre-commit.mjs") && entry.name.endsWith(".mjs")) {
      out.push(full);
    } else if (entry.isFile() && /^\d+.*verify.*\.mjs$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

const TMP_NAME_HINT_RE = /tmp|temp|scratch/i;

function variableLooksTempDerived(src, varName) {
  if (!varName || !/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(varName)) return false;
  if (!TMP_NAME_HINT_RE.test(varName)) return false;
  // Heuristic, one hop: the named variable's own declaration references a temp
  // primitive OR another temp-hinted identifier that does, AND the file calls a real
  // temp-directory primitive somewhere. Not a full data-flow proof — a text-scan
  // ratchet, like the rest of this guard population.
  const assignRe = new RegExp(`\\b(?:const|let|var)\\s+${varName}\\s*=([^;\\n]*)`);
  const match = src.match(assignRe);
  if (!match) return false;
  return TMP_SAFE_RE.test(match[1]) || (TMP_NAME_HINT_RE.test(match[1]) && TMP_SAFE_RE.test(src));
}

// Two-hop trace, the dominant real pattern in this repo (e.g. verify-driver-qualification
// -gate-shared.mjs: `const DISPATCH = path.join(ROOT, "apps/backend/src/dispatch")`, then
// `const p = path.join(DISPATCH, SHARED_FILE); writeFileSync(p, planted)`). A write-target
// identifier that isn't itself a path-literal is still a violation if its OWN declaration
// references a path constant (any const/let/var whose right-hand side textually contains
// an apps/ or packages/ literal) — one hop of tracing, not a full data-flow analysis.
function collectPathConstantNames(src) {
  const names = new Set();
  const declRe = /\b(?:const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=([^;\n]*)/g;
  let m;
  while ((m = declRe.exec(src)) !== null) {
    const [, name, rhs] = m;
    if (TARGETS_TRACKED_SOURCE_RE.test(rhs) || TARGETS_PACKAGES_RE.test(rhs)) {
      names.add(name);
    }
  }
  return names;
}

function collectPathPropertyNames(src, pathConstantNames) {
  const names = new Set();
  const objectRe = /\b(?:const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*\{([\s\S]*?)\n\s*\};/g;
  let objectMatch;
  while ((objectMatch = objectRe.exec(src)) !== null) {
    const [, objectName, body] = objectMatch;
    const propertyRe = /(?:^|\n)\s*([A-Za-z_$][A-Za-z0-9_$]*)\s*:\s*([^\n]+?)(?:,\s*)?(?=\n|$)/g;
    let propertyMatch;
    while ((propertyMatch = propertyRe.exec(body)) !== null) {
      const [, propertyName, rhs] = propertyMatch;
      const identifiers = rhs.match(/[A-Za-z_$][A-Za-z0-9_$]*/g) ?? [];
      if (
        TARGETS_TRACKED_SOURCE_RE.test(rhs) ||
        TARGETS_PACKAGES_RE.test(rhs) ||
        identifiers.some((id) => pathConstantNames.has(id))
      ) {
        names.add(`${objectName}.${propertyName}`);
      }
    }
  }
  return names;
}

function identifierTracesToPathConstant(src, varName, pathConstantNames) {
  if (!varName || !/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(varName)) return false;
  if (pathConstantNames.has(varName)) return true;
  const assignRe = new RegExp(`\\b(?:const|let|var)\\s+${varName}\\s*=([^;\\n]*)`);
  const match = src.match(assignRe);
  if (!match) return false;
  const referenced = match[1].match(/[A-Za-z_$][A-Za-z0-9_$]*/g) ?? [];
  return referenced.some((id) => pathConstantNames.has(id));
}

function scanSource(src) {
  const pathConstantNames = collectPathConstantNames(src);
  const pathPropertyNames = collectPathPropertyNames(src, pathConstantNames);
  const violations = [];
  let match;
  WRITE_CALL_RE.lastIndex = 0;
  while ((match = WRITE_CALL_RE.exec(src)) !== null) {
    const [, fn, rawArg] = match;
    const arg = rawArg.trim();
    const identifiers = arg.match(/[A-Za-z_$][A-Za-z0-9_$]*/g) ?? [];
    const properties = arg.match(/[A-Za-z_$][A-Za-z0-9_$]*\.[A-Za-z_$][A-Za-z0-9_$]*/g) ?? [];
    const targetsTrackedSourceDirectly = TARGETS_TRACKED_SOURCE_RE.test(arg) || TARGETS_PACKAGES_RE.test(arg);
    const targetsTrackedSourceViaConstant = identifiers.some((id) =>
      identifierTracesToPathConstant(src, id, pathConstantNames)
    ) || properties.some((property) => pathPropertyNames.has(property));
    if (!targetsTrackedSourceDirectly && !targetsTrackedSourceViaConstant) continue;

    // Allow-list: the call itself is built from a temp primitive inline
    // (e.g. writeFileSync(path.join(mkdtempSync(...), "book-load.service.ts"), ...)).
    if (TMP_SAFE_RE.test(arg)) continue;
    // Allow-list: any identifier referenced in the target expression (bare, or inside
    // path.join(...)/string concatenation) is itself temp-hinted and traceable back to
    // a real temp-directory primitive in this file — a copy-to-temp pattern.
    if (identifiers.some((id) => variableLooksTempDerived(src, id))) continue;

    const line = src.slice(0, match.index).split("\n").length;
    violations.push({ fn, arg, line });
  }
  return violations;
}

function scanFile(filePath) {
  return scanSource(fs.readFileSync(filePath, "utf8"));
}

const BASELINE_REL = "scripts/.no-selftest-mutates-tracked-source-baseline.json";

function loadBaseline() {
  try {
    return Number(JSON.parse(fs.readFileSync(path.join(ROOT, BASELINE_REL), "utf8")).count) || 0;
  } catch {
    return 0;
  }
}

function runChecks() {
  const files = listScriptFiles(SCRIPTS_DIR);
  const failures = [];
  for (const file of files) {
    const rel = path.relative(ROOT, file);
    const violations = scanFile(file);
    for (const v of violations) {
      failures.push(
        `${rel}:${v.line} — ${v.fn}(${v.arg}, ...) targets tracked source under apps/ or packages/. ` +
          `Copy the target to a temp path first (mkdtempSync/os.tmpdir()) and write/assert there instead.`
      );
    }
  }
  return failures;
}

function selftest() {
  // No file on disk is ever touched by this selftest — every assertion below is a pure
  // in-memory regex check against fabricated source strings, per the very rule this
  // guard enforces.
  const violatingSrc = `
    import { writeFileSync } from "node:fs";
    writeFileSync("apps/backend/src/dispatch/book-load.service.ts", "corrupted");
  `;
  WRITE_CALL_RE.lastIndex = 0;
  const m = WRITE_CALL_RE.exec(violatingSrc);
  assert.ok(m, "regex must find the planted writeFileSync call");
  assert.ok(TARGETS_TRACKED_SOURCE_RE.test(m[2]), "planted call must be flagged as targeting apps/");

  const safeSrc = `
    import { writeFileSync, mkdtempSync } from "node:fs";
    import os from "node:os";
    const tmpDir = mkdtempSync(path.join(os.tmpdir(), "guard-"));
    const tmpCopyPath = path.join(tmpDir, "book-load.service.ts");
    writeFileSync(tmpCopyPath, "planted failure, copy only");
  `;
  WRITE_CALL_RE.lastIndex = 0;
  const m2 = WRITE_CALL_RE.exec(safeSrc);
  assert.ok(m2, "regex must still find the writeFileSync call in the safe sample");
  assert.equal(variableLooksTempDerived(safeSrc, m2[2].trim()), true, "copy-to-temp target must not be flagged");

  // Two-hop trace: the dominant real-repo pattern (constant -> intermediate var -> write
  // call), none of which mention "apps/" at the call site itself.
  const twoHopSrc = `
    const DISPATCH = path.join(ROOT, "apps/backend/src/dispatch");
    function selftest() {
      const p = path.join(DISPATCH, SHARED_FILE);
      fs.writeFileSync(p, planted, "utf8");
    }
  `;
  const constants = collectPathConstantNames(twoHopSrc);
  assert.ok(constants.has("DISPATCH"), "DISPATCH must be recognized as a path constant");
  assert.equal(
    identifierTracesToPathConstant(twoHopSrc, "p", constants),
    true,
    "p must trace back to DISPATCH one hop away"
  );
  const twoHopViolations = scanSource(twoHopSrc);
  assert.equal(twoHopViolations.length, 1, "the two-hop DISPATCH -> p -> writeFileSync chain must be flagged");

  const propertyPathSrc = `
    const paths = {
      service: path.join(ROOT, "apps/backend/src/dispatch/detention.service.ts"),
      fixture: path.join(ROOT, "docs/fixtures/detention.json"),
    };
    function selftest() {
      fs.writeFileSync(paths.service, planted, "utf8");
    }
  `;
  const propertyConstants = collectPathConstantNames(propertyPathSrc);
  assert.ok(
    collectPathPropertyNames(propertyPathSrc, propertyConstants).has("paths.service"),
    "paths.service must be recognized as a tracked-source path property"
  );
  assert.equal(scanSource(propertyPathSrc).length, 1, "an object-property tracked path must be flagged");

  // And the paired restore-in-finally form (the dominant 401-of-611 real pattern) must
  // also be flagged for BOTH the plant and the restore call — restoring afterward does
  // not make the intervening mutation of the shared working tree safe.
  const financeRestoreSrc = `
    const DISPATCH = path.join(ROOT, "apps/backend/src/dispatch");
    function selftest() {
      const p = path.join(DISPATCH, SHARED_FILE);
      const backup = fs.readFileSync(p, "utf8");
      try {
        fs.writeFileSync(p, planted, "utf8");
      } finally {
        fs.writeFileSync(p, backup, "utf8");
      }
    }
  `;
  assert.equal(scanSource(financeRestoreSrc).length, 2, "both the plant and the finally-restore write must be flagged");

  console.log("verify:no-selftest-mutates-tracked-source --selftest PASS");
}

if (process.argv.includes("--selftest")) {
  // Exercise the guard's real scanner, rather than duplicating its regex checks here.
  // This explicit entrypoint is also inspected by verify-selftests-can-fail.mjs, which
  // must be able to prove that this selftest invokes the production assertion path.
  selftest();
  process.exit(0);
}

const failures = runChecks();
const live = failures.length;
const baseline = loadBaseline();
console.log(
  `verify:no-selftest-mutates-tracked-source — ${live} call site(s) writing into apps/ or packages/ (baseline ${baseline})`
);
if (live > baseline) {
  console.error(
    `verify:no-selftest-mutates-tracked-source FAIL — ${live - baseline} NEW violation(s) above the baseline of ${baseline}:`
  );
  for (const f of failures) console.error("  ✗ " + f);
  console.error(
    "A selftest must never mutate tracked source — copy the target to a temp path (mkdtempSync/os.tmpdir()), " +
      "plant the failure in the copy, assert against the copy. Existing debt is baselined; new debt is not."
  );
  process.exit(1);
}
if (live < baseline) {
  console.log(`  ↓ improved: lower the baseline in ${BASELINE_REL} to ${live} to tighten the ratchet.`);
}
console.log("verify:no-selftest-mutates-tracked-source PASS");
