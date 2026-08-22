#!/usr/bin/env node
/**
 * MATRIX-BUILT-OPTIONAL — meta-ratchet (not a surface wiring guard).
 *
 * Ratchet: wiring guards that ratchet EntityLink/FK surfaces must declare @matrix-built
 * so the Program matrix auto-greens Box 3 on deploy (no manual wire-sprint feed edit).
 *
 * Accepted tag forms (must match apps/backend/src/program/matrix-built-auto.ts):
 *   - JSON: @matrix-built { "modules":[…], "cols":[…], "leafRe":"…", "task":"…" }
 *   - shorthand: @matrix-built modules=a,b cols=x,y …
 *   - csv-only: @matrix-built maintenance,fleet
 *
 * Going-forward HARD FAIL: any NEW or CHANGED scripts/verify-*.mjs on this branch
 * (vs origin/main) that matches the wiring hint MUST carry @matrix-built.
 * Legacy corpus without tags = WARN only (inject grows coverage).
 *
 * Exempt: guards without EntityLink/FK/matrix wiring scope; MATRIX-BUILT-OPTIONAL marker.
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-matrix-built-tag-present";
const AUTO_TS = "apps/backend/src/program/matrix-built-auto.ts";

const WIRING_HINT =
  /EntityLink|FK|fk_|reverse_link|connectivity|picker_law|leafRe|@matrix-built/i;

const HAS_JSON = /@matrix-built\s+\{/;
const HAS_SHORTHAND = /@matrix-built\s+modules=/;
const HAS_CSV = /@matrix-built\s+(?!modules=|\{)[a-z][a-z0-9_-]*(?:,[a-z][a-z0-9_-]+)+/i;

function listVerifyScripts() {
  return fs
    .readdirSync(path.join(ROOT, "scripts"))
    .filter((n) => n.startsWith("verify-") && n.endsWith(".mjs"))
    .map((n) => path.join("scripts", n));
}

function hasMatrixBuiltTag(src) {
  return HAS_JSON.test(src) || HAS_SHORTHAND.test(src) || HAS_CSV.test(src);
}

function missingTag(rel) {
  const src = fs.readFileSync(path.join(ROOT, rel), "utf8");
  if (!WIRING_HINT.test(src)) return null;
  if (hasMatrixBuiltTag(src)) return null;
  if (/MATRIX-BUILT-OPTIONAL|wire-sprint-built\.json only/i.test(src)) return null;
  return `${rel}: wiring ratchet missing @matrix-built {…} | modules=… | csv header`;
}

function problems() {
  return listVerifyScripts().map(missingTag).filter(Boolean);
}

/** Files added or modified on this branch vs origin/main (scripts/verify-*.mjs only). */
function branchTouchedVerifyScripts() {
  try {
    const out = execSync(
      "git diff --name-only --diff-filter=ACMR origin/main...HEAD -- 'scripts/verify-*.mjs'",
      { cwd: ROOT, encoding: "utf8" },
    );
    return out
      .split("\n")
      .map((s) => s.trim())
      .filter((s) => s.startsWith("scripts/verify-") && s.endsWith(".mjs"));
  } catch {
    return [];
  }
}

function goingForwardFailures() {
  const out = [];
  for (const rel of branchTouchedVerifyScripts()) {
    if (!fs.existsSync(path.join(ROOT, rel))) continue;
    const miss = missingTag(rel);
    if (miss) out.push(miss);
  }
  return out;
}

/** Mirror of matrix-built-auto shorthand+csv parse (keeps CI green without importing TS). */
function parseShorthandAndCsv(guardRel, content) {
  const out = [];
  const sh =
    /@matrix-built\s+modules=([^\s]+)(?:\s+cols=([^\s]+))?(?:\s+leafRe=([^\s]+))?(?:\s+task=([^\s]+))?(?:\s+pr=([^\s]+))?/g;
  for (const m of content.matchAll(sh)) {
    const modules = String(m[1] ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const cols = String(m[2] ?? "connectivity,reverse_link")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (!modules.length || !cols.length) continue;
    out.push({ modules, cols, leafRe: String(m[3] ?? ".*"), task: m[4] ?? path.basename(guardRel) });
  }
  const csv = /@matrix-built\s+(?!modules=|\{)([a-z][a-z0-9_-]*(?:,[a-z][a-z0-9_-]*)+)(?=\s|\*|\/|$)/gi;
  for (const m of content.matchAll(csv)) {
    const modules = String(m[1] ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (modules.length < 2) continue;
    out.push({
      modules,
      cols: ["connectivity", "reverse_link"],
      leafRe: ".*",
      task: path.basename(guardRel),
    });
  }
  return out;
}

function assertAutoTsParsesShorthand() {
  const abs = path.join(ROOT, AUTO_TS);
  if (!fs.existsSync(abs)) throw new Error(`missing ${AUTO_TS}`);
  const src = fs.readFileSync(abs, "utf8");
  if (!src.includes("SCOREBOARD-MATRIX-BUILT-SHORTHAND")) {
    throw new Error(`${AUTO_TS} missing SCOREBOARD-MATRIX-BUILT-SHORTHAND parser`);
  }
  if (!src.includes("MATRIX_BUILT_SHORTHAND_RE") || !src.includes("MATRIX_BUILT_CSV_RE")) {
    throw new Error(`${AUTO_TS} missing shorthand/csv regex exports`);
  }
  const fixture = [
    "/** @matrix-built modules=maintenance,fleet cols=unit,connectivity leafRe=^home$ task=T1 */",
    "/** @matrix-built safety,drivers */",
    '/** @matrix-built {"modules":["accounting"],"cols":["connectivity"],"leafRe":"^je","task":"J"} */',
  ].join("\n");
  const parsed = parseShorthandAndCsv("scripts/verify-fixture.mjs", fixture);
  if (parsed.length < 2) throw new Error(`expected ≥2 shorthand/csv entries, got ${parsed.length}`);
  const sh = parsed.find((p) => p.modules.includes("maintenance"));
  if (!sh || !sh.cols.includes("unit") || sh.leafRe !== "^home$") {
    throw new Error("shorthand parse mismatch");
  }
  const csv = parsed.find((p) => p.modules.includes("safety") && p.modules.includes("drivers"));
  if (!csv) throw new Error("csv-only parse mismatch");
}

if (process.argv.includes("--selftest")) {
  // NOTE: process.exit() does not run pending `finally` blocks in Node — calling it inside the try
  // (as this used to on both the success and the catch path) skipped the finally's fs.unlinkSync(tmp)
  // cleanup and leaked scripts/verify-matrix-built-selftest-tmp-<pid>.mjs into the tree on every
  // single --selftest run (found live: 2 separate leaked copies from unrelated runs, each one
  // itself then flagged by verify-guard-wired.mjs/verify-matrix-built-leaf-specific.mjs as an
  // orphan/broad-leafRe guard). Record the outcome instead and exit only after the shared
  // finally-based cleanup below has actually run.
  const tmp = path.join(ROOT, "scripts", `verify-matrix-built-selftest-tmp-${process.pid}.mjs`);
  const bad = `#!/usr/bin/env node\n// EntityLink reverse_link connectivity FK test fixture — deliberately missing tag\nconsole.log("tmp");\n`;
  let failure = null;
  try {
    assertAutoTsParsesShorthand();
    console.log(`${LABEL} selftest: matrix-built-auto shorthand/csv parser present OK`);
    fs.writeFileSync(tmp, bad);
    const miss = missingTag(path.relative(ROOT, tmp).replace(/\\/g, "/"));
    if (!miss) throw new Error("expected missingTag on fixture");
    const goodSh = `#!/usr/bin/env node\n/** @matrix-built modules=legal,insurance cols=connectivity */\n// EntityLink\n`;
    fs.writeFileSync(tmp, goodSh);
    if (missingTag(path.relative(ROOT, tmp).replace(/\\/g, "/"))) {
      throw new Error("shorthand tag should satisfy missingTag");
    }
    console.log(`${LABEL} selftest: missingTag + shorthand accept OK`);
  } catch (e) {
    failure = e;
  } finally {
    try {
      fs.unlinkSync(tmp);
    } catch {
      /* ignore */
    }
  }
  if (failure) {
    console.error(`${LABEL} selftest FAIL`, failure);
    process.exit(1);
  }
  process.exit(0);
}

const forward = goingForwardFailures();
if (forward.length) {
  console.error(
    `${LABEL} FAIL — ${forward.length} NEW/CHANGED wiring guard(s) on this branch lack @matrix-built (VERTICAL Box 3 auto):`,
  );
  for (const line of forward) console.error(`  - ${line}`);
  console.error(
    `\nFix: add /** @matrix-built {"modules":[…],"cols":[…],"leafRe":"…","task":"…"} */ or modules=… / csv form`,
  );
  process.exit(1);
}

const legacy = problems();
if (legacy.length) {
  console.log(
    `${LABEL} WARN — ${legacy.length} legacy wiring guard(s) still missing @matrix-built (inject backlog; new/changed OK).`,
  );
  for (const line of legacy.slice(0, 8)) console.log(`  - ${line}`);
  if (legacy.length > 8) console.log(`  ... and ${legacy.length - 8} more`);
  process.exit(0);
}
console.log(`${LABEL} OK`);
