#!/usr/bin/env node
/**
 * One-time / maintenance: copy wire-sprint-built.json rows into @matrix-built tags
 * on the underlying guard scripts so Box 3 auto-greens on deploy without manual feed edits.
 *
 * Usage: node scripts/ops/inject-matrix-built-tags.mjs [--write]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const WRITE = process.argv.includes("--write");
const FEED = path.join(ROOT, "docs/specs/scoreboard/wire-sprint-built.json");

function resolveGuardScript(guardRel) {
  if (guardRel.includes("verify-steps/")) {
    const stepAbs = path.join(ROOT, guardRel);
    if (!fs.existsSync(stepAbs)) return null;
    const stepSrc = fs.readFileSync(stepAbs, "utf8");
    const runMatch = stepSrc.match(
      /ctx\.run\(\s*["']node["']\s*,\s*\[\s*["'](scripts\/verify-[^"']+\.mjs)["']/,
    );
    if (runMatch && fs.existsSync(path.join(ROOT, runMatch[1]))) return runMatch[1];
    const m = stepSrc.match(/["'](scripts\/verify-[^"']+\.mjs)["']/);
    if (m && fs.existsSync(path.join(ROOT, m[1]))) return m[1];
    return null;
  }
  if (guardRel.startsWith("scripts/verify-") && fs.existsSync(path.join(ROOT, guardRel))) {
    return guardRel;
  }
  return null;
}

function tagLine(entry) {
  const payload = {
    modules: entry.modules,
    cols: entry.cols,
    leafRe: entry.leafRe,
    task: entry.task,
    ...(entry.pr && entry.pr !== "this PR" ? { pr: entry.pr } : {}),
  };
  return `/** @matrix-built ${JSON.stringify(payload)} */`;
}

const feed = JSON.parse(fs.readFileSync(FEED, "utf8"));
const byGuard = new Map();

for (const entry of feed.entries ?? []) {
  const guardField = String(entry.guard ?? "").split("\n")[0].trim();
  if (!guardField || guardField.includes(" ")) {
    console.warn("skip invalid guard field:", entry.task);
    continue;
  }
  const guard = resolveGuardScript(guardField);
  if (!guard) {
    console.warn("skip unresolved guard:", entry.task, entry.guard);
    continue;
  }
  if (!byGuard.has(guard)) byGuard.set(guard, []);
  byGuard.get(guard).push(tagLine(entry));
}

let touched = 0;
for (const [guard, tags] of byGuard) {
  const abs = path.join(ROOT, guard);
  let src = fs.readFileSync(abs, "utf8");
  src = src.replace(/\/\*\* @matrix-built [\s\S]*? \*\/\n?/g, "");
  const insert = `${tags.join("\n")}\n`;
  if (src.startsWith("#!/usr/bin/env node\n")) {
    src = `#!/usr/bin/env node\n${insert}${src.slice("#!/usr/bin/env node\n".length)}`;
  } else {
    src = `${insert}${src}`;
  }
  if (WRITE) {
    fs.writeFileSync(abs, src);
    touched++;
  }
  console.log(`${WRITE ? "WROTE" : "DRY"} ${guard} (+${tags.length} tags)`);
}

console.log(`\n${WRITE ? "Updated" : "Would update"} ${touched} guard file(s). Re-run matrix API — Built auto from deploy.`);
