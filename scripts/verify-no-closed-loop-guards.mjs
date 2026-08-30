#!/usr/bin/env node
/**
 * CLOSED-LOOP GUARD DETECTOR
 *
 * THE CLASS THIS KILLS — it has now appeared three times on this project:
 *   1. verify-economic-columns-c25-c31-present.mjs read columns.shared.json and asserted the
 *      seven ids were present in columns.shared.json. It printed OK while 28 of 29 modules
 *      rendered no ECON group at all. (Found 2026-08-28.)
 *   2. The module matrix proves a LEDGER column by text-matching LEDGER PROSE that names that
 *      column. Writing the sentence turns the cell green. (Found 2026-08-30.)
 *   3. Item status: prose evidence asserted PASS, and the only reader of that prose was a human.
 *      (DRV-S04, the proof engine's founding case.)
 *
 * All three are one shape:
 *   A CHECK WHOSE ONLY INPUT IS THE ARTIFACT THAT MAKES THE CLAIM CANNOT DETECT ITS OWN FAILURE.
 *
 * THE RULE THIS ENFORCES
 *   A verifier that reads exactly ONE repo file is a DECLARATION RATCHET. A ratchet is a
 *   legitimate and useful thing — it stops a spec from silently regressing. What it is NOT is
 *   evidence that a product behaves. So a ratchet must SAY SO, in its own header, with @ratchet.
 *
 *   Undeclared single-source verifiers fail this guard. Not because they are wrong, but because
 *   an undeclared one gets cited later as proof of behaviour, and by then nobody rereads it.
 *
 *   Second assertion: a script tagged @ratchet may never be named as the guard for an item that
 *   claims Live / prod_verified. A ratchet cannot see production. Citing one there is the exact
 *   substitution that produced failure #1.
 *
 * USAGE
 *   node scripts/verify-no-closed-loop-guards.mjs            normal
 *   node scripts/verify-no-closed-loop-guards.mjs --report   list every verifier and its inputs
 *   node scripts/verify-no-closed-loop-guards.mjs --selftest  plant defects, demand rejection
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = process.env.IH35_REPO || path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-no-closed-loop-guards";

/** Repo-relative paths a script reads. Literal-only on purpose: a dynamic path is not evidence. */
export function inputsOf(src) {
  const found = new Set();
  // "docs/specs/x.json", 'scripts/y.sql', `apps/z.ts`  — any repo-rooted literal
  for (const m of src.matchAll(/["'`]((?:docs|scripts|apps|db|\.cursor|\.github)\/[A-Za-z0-9._@/-]+)["'`]/g)) {
    found.add(m[1]);
  }
  return [...found];
}

/** A directory input is many files — it is not single-source. */
function countsAsMultiple(inputs) {
  return inputs.some((p) => !path.extname(p));
}

/**
 * The closed loop is NARROWER than "reads one file", and saying otherwise would be a false
 * accusation against 3,500 honest source-read guards. Reading ONE product-source file
 * (apps/**.tsx) and asserting that source contains X is a SOURCE-READ guard: weaker than a
 * live proof, but its input is the product, not the claim.
 *
 * The closed loop is: the ONLY input is a SPEC / DECLARATION under docs/ — the same artifact
 * that makes the claim. That is failure #1 exactly, and nothing else.
 *
 * A verifier with no literal repo path is UNKNOWN, not guilty. It may build its path from a
 * glob or env. Reported, never failed. Judging a record from a partial view is the error this
 * whole guard exists to prevent; it must not commit that error itself.
 */
export function classify(name, src) {
  const inputs = inputsOf(src);
  const declared = /@ratchet\b/.test(src);
  const dirInput = countsAsMultiple(inputs);
  const specOnly =
    inputs.length === 1 && !dirInput &&
    /^docs\//.test(inputs[0]) && /\.(json|md)$/.test(inputs[0]);
  const unknown = inputs.length === 0;
  return { name, inputs, declared, specOnly, unknown };
}

export function check(files) {
  const failures = [];
  const rows = [];
  for (const { name, src } of files) {
    const c = classify(name, src);
    rows.push(c);
    if (c.specOnly && !c.declared) {
      failures.push(
        `${name}: its ONLY input is the spec ${c.inputs[0]}, and it asserts about that same spec. ` +
        `This is a DECLARATION RATCHET and cannot detect the product diverging from the spec. ` +
        `Either add "@ratchet" to its header comment (honest, and then it may never back a Live ` +
        `claim), or give it an independent input — the rendered source, the live route, or prod.`
      );
    }
  }
  return { failures, rows };
}

/** A ratchet may never back a Live / prod_verified claim. */
export function checkRatchetNotCitedAsLive(ratchetNames, items) {
  const failures = [];
  for (const it of items) {
    const claimsLive = it.prod_verified === true || it.status === "PASS";
    if (!claimsLive) continue;
    for (const p of it.proofs || []) {
      if (p.kind !== "guard" || !p.script) continue;
      const base = path.basename(p.script).replace(/\.mjs$/, "");
      if (ratchetNames.has(base))
        failures.push(
          `${it.id}: cites ratchet "${base}" as the guard for a Live/prod_verified claim. ` +
          `A declaration ratchet cannot see production.`);
    }
  }
  return failures;
}

function loadVerifiers() {
  const dirs = [path.join(ROOT, "scripts"), path.join(ROOT, "scripts/verify-steps")];
  const out = [];
  for (const d of dirs) {
    if (!fs.existsSync(d)) continue;
    for (const f of fs.readdirSync(d)) {
      if (!/^\d*-?verify-.*\.mjs$/.test(f) && !/^verify-.*\.mjs$/.test(f)) continue;
      if (/\.selftest\.mjs$/.test(f)) continue;
      out.push({ name: path.relative(ROOT, path.join(d, f)), src: fs.readFileSync(path.join(d, f), "utf8") });
    }
  }
  return out;
}

const BASELINE_PATH = path.join(ROOT, "docs/specs/CLOSED-LOOP-BASELINE.json");

function loadBaseline() {
  if (!fs.existsSync(BASELINE_PATH)) {
    throw new Error(`MISSING ${BASELINE_PATH} — freeze today's undeclared closed loops before enabling CI`);
  }
  return JSON.parse(fs.readFileSync(BASELINE_PATH, "utf8"));
}

/** Baseline may only shrink vs origin/main (or be identical). New paths in the baseline file are forbidden. */
export function assertBaselineOnlyShrinks(baseline, mainBaseline) {
  if (!mainBaseline?.paths) return [];
  const mainSet = new Set(mainBaseline.paths);
  return (baseline.paths || []).filter((p) => !mainSet.has(p)).map(
    (p) => `CLOSED-LOOP-BASELINE.json grew: added ${p} — baseline may only SHRINK`,
  );
}

function run() {
  const files = loadVerifiers();
  const { failures, rows } = check(files);
  if (process.argv.includes("--report")) {
    for (const r of rows.sort((a, b) => a.inputs.length - b.inputs.length)) {
      const tag = r.specOnly ? (r.declared ? "RATCHET " : "CLOSED  ") : r.unknown ? "UNKNOWN " : "SOURCED ";
      console.log(`${tag} ${r.inputs.length}  ${r.name}`);
    }
    console.log(`\n${rows.length} verifiers · ${rows.filter((r) => r.specOnly).length} spec-only · ` +
                `${rows.filter((r) => r.specOnly && !r.declared).length} UNDECLARED CLOSED LOOP · ` +
                `${rows.filter((r) => r.unknown).length} unknown (no literal path — reported, not failed)`);
    return;
  }

  // Frozen baseline: the 29 may remain until retired. Any NEW undeclared closed loop FAILS.
  // The baseline file itself may only shrink (checked vs origin/main when available).
  const baseline = loadBaseline();
  const baselineSet = new Set(baseline.paths || []);
  const undeclared = rows.filter((r) => r.specOnly && !r.declared).map((r) => r.name);
  const novel = undeclared.filter((n) => !baselineSet.has(n));
  const out = [];
  if (novel.length) {
    for (const n of novel) {
      out.push(
        `${n}: NEW undeclared closed loop (not in CLOSED-LOOP-BASELINE.json). ` +
          `The 30th may never be born. Fix with @ratchet or a second input.`,
      );
    }
  }
  if ((baseline.count ?? 0) !== (baseline.paths || []).length) {
    out.push(
      `CLOSED-LOOP-BASELINE.json count=${baseline.count} but paths.length=${(baseline.paths || []).length}`,
    );
  }

  // Shrink-only vs origin/main (best-effort; missing file on main = first land)
  try {
    const raw = execFileSync("git", ["show", "origin/main:docs/specs/CLOSED-LOOP-BASELINE.json"], {
      encoding: "utf8",
      cwd: ROOT,
      stdio: ["ignore", "pipe", "ignore"],
    });
    out.push(...assertBaselineOnlyShrinks(baseline, JSON.parse(raw)));
  } catch {
    /* first land or no origin/main — skip shrink check */
  }

  if (out.length) {
    console.error(`FAIL: ${LABEL} — ${out.length} closed-loop ratchet violation(s)`);
    for (const f of out.slice(0, 40)) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(
    `PASS: ${LABEL} — ${files.length} verifiers; undeclared closed loops ${undeclared.length} ⊆ baseline ${baselineSet.size} (may only shrink)`,
  );
}

function selftest() {
  let pass = 0, fail = 0;
  const t = (n, ok, d) => { ok ? (pass++, console.log(`  PASS  ${n}`)) : (fail++, console.log(`  FAIL  ${n}${d ? " -> " + d : ""}`)); };
  console.log("CLOSED-LOOP DETECTOR SELFTEST — each arm plants a defect and demands rejection\n");

  // 1. The exact historical offender: reads columns.shared.json, asserts about columns.shared.json.
  const offender = `
    const SHARED = path.join(ROOT, "docs/specs/scoreboard/columns.shared.json");
    const NEED = ["gl_delta"]; // assert present in SHARED`;
  t("the 2026-08-28 offender shape is CAUGHT",
    check([{ name: "verify-econ.mjs", src: offender }]).failures.length === 1);

  // 2. Same script, honestly declared, is allowed.
  t("declaring @ratchet makes the same script legal",
    check([{ name: "verify-econ.mjs", src: "/** @ratchet */" + offender }]).failures.length === 0);

  // 3. The fixed version — reads the modules dir AND the catalog AND the view — is clean.
  const fixed = `
    const MODULES_DIR = path.join(ROOT, "docs/specs/scoreboard/modules");
    const SHARED = path.join(ROOT, "docs/specs/scoreboard/columns.shared.json");
    const CATALOG = path.join(ROOT, "apps/frontend/src/pages/program/moduleMatrixCatalog.ts");`;
  t("the repaired multi-source version PASSES",
    check([{ name: "verify-econ.mjs", src: fixed }]).failures.length === 0);

  // 4. A verifier reading NO repo file at all is still single-source (it asserts on nothing).
  t("a verifier with no literal path is NOT accused (unknown, not guilty)",
    check([{ name: "verify-nothing.mjs", src: "console.log('ok')" }]).failures.length === 0);

  // 4b. A single PRODUCT-SOURCE read is a source-read guard, not a closed loop.
  t("reading one product source file is NOT a closed loop",
    check([{ name: "verify-x.mjs", src: 'path.join(ROOT,"apps/frontend/src/pages/Foo.tsx")' }]).failures.length === 0);

  // 4c. A single SPEC read IS a closed loop.
  t("reading only a docs/ spec and asserting on it IS a closed loop",
    check([{ name: "verify-y.mjs", src: 'path.join(ROOT,"docs/specs/scoreboard/columns.shared.json")' }]).failures.length === 1);

  // 5. A ratchet cited as a Live guard is rejected.
  const f5 = checkRatchetNotCitedAsLive(new Set(["verify-econ"]), [
    { id: "ACCT-X", status: "PASS", prod_verified: true, proofs: [{ kind: "guard", script: "scripts/verify-econ.mjs" }] },
  ]);
  t("a @ratchet cited as the guard for a Live claim is REJECTED", f5.length === 1, JSON.stringify(f5));

  // 6. ...but the same ratchet on a non-Live item is fine.
  t("a @ratchet on a non-Live item is allowed",
    checkRatchetNotCitedAsLive(new Set(["verify-econ"]),
      [{ id: "ACCT-Y", status: "OPEN", proofs: [{ kind: "guard", script: "scripts/verify-econ.mjs" }] }]).length === 0);

  console.log(`\nSELFTEST ${fail === 0 ? "PASS" : "FAIL"} ${pass}/${pass + fail}`);
  process.exit(fail === 0 ? 0 : 1);
}

const isMain =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  process.argv.includes("--selftest") ? selftest() : run();
}
