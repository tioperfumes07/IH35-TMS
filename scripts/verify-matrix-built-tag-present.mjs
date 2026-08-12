#!/usr/bin/env node
/**
 * MATRIX-BUILT-OPTIONAL — meta-ratchet (not a surface wiring guard).
 *
 * Ratchet: wiring guards that ratchet EntityLink/FK surfaces must declare @matrix-built
 * so the Program matrix auto-greens Box 3 on deploy (no manual wire-sprint feed edit).
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

const WIRING_HINT =
  /EntityLink|FK|fk_|reverse_link|connectivity|picker_law|leafRe|@matrix-built/i;

function listVerifyScripts() {
  return fs
    .readdirSync(path.join(ROOT, "scripts"))
    .filter((n) => n.startsWith("verify-") && n.endsWith(".mjs"))
    .map((n) => path.join("scripts", n));
}

function missingTag(rel) {
  const src = fs.readFileSync(path.join(ROOT, rel), "utf8");
  if (!WIRING_HINT.test(src)) return null;
  if (/@matrix-built\s+\{/.test(src)) return null;
  if (/MATRIX-BUILT-OPTIONAL|wire-sprint-built\.json only/i.test(src)) return null;
  return `${rel}: wiring ratchet missing @matrix-built { modules, cols, leafRe, task } header`;
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

if (process.argv.includes("--selftest")) {
  const tmp = path.join(ROOT, "scripts", `verify-matrix-built-selftest-tmp-${process.pid}.mjs`);
  const bad = `#!/usr/bin/env node\n// EntityLink reverse_link connectivity FK test fixture — deliberately missing tag\nconsole.log("tmp");\n`;
  try {
    fs.writeFileSync(tmp, bad);
    const miss = missingTag(path.relative(ROOT, tmp).replace(/\\/g, "/"));
    if (!miss) throw new Error("expected missingTag on fixture");
    console.log(`${LABEL} selftest: missingTag catches fixture OK`);
    process.exit(0);
  } catch (e) {
    console.error(`${LABEL} selftest FAIL`, e);
    process.exit(1);
  } finally {
    try {
      fs.unlinkSync(tmp);
    } catch {
      /* ignore */
    }
  }
}

const forward = goingForwardFailures();
if (forward.length) {
  console.error(
    `${LABEL} FAIL — ${forward.length} NEW/CHANGED wiring guard(s) on this branch lack @matrix-built (VERTICAL Box 3 auto):`,
  );
  for (const line of forward) console.error(`  - ${line}`);
  console.error(`\nFix: add /** @matrix-built {"modules":[…],"cols":[…],"leafRe":"…","task":"…"} */ or run inject-matrix-built-tags.mjs --write`);
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
