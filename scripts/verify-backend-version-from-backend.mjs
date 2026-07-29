#!/usr/bin/env node
/**
 * A UI label that says "Backend version" must come from the BACKEND.
 *
 * It read `import.meta.env.VITE_BUILD_COMMIT` — a frontend build-time constant, and one that is not
 * set in the frontend build — so prod displayed "Backend version: not available" on every Home load
 * while /api/v1/healthz/shallow was returning the real sha the whole time. Wrong source AND wrong
 * value, under a label that claimed otherwise.
 *
 * That matters beyond cosmetics: deploy verification in this repo IS "poll healthz/shallow until
 * version == the merge sha". A footer that silently reports a different thing under that name teaches
 * everyone to distrust it.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const SRC = join(process.cwd(), "apps", "frontend", "src");

function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(e.name) && !e.name.includes(".test.")) out.push(p);
  }
  return out;
}

/**
 * Flag a file that renders the words "Backend version" AND references a build-time env constant
 * within the same file. Scoped to the label so an unrelated VITE_ constant elsewhere is not a hit.
 */
/**
 * Strip comments before matching. The fix component's own doc comment names both the label and the
 * old constant while explaining the defect, and tripped this guard on its first run — the same
 * comment-prose false positive other guards in this repo have hit.
 */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .split("\n")
    .map((l) => {
      const i = l.indexOf("//");
      return i === -1 ? l : l.slice(0, i);
    })
    .join("\n");
}

export function offenders(files) {
  const bad = [];
  for (const { path, src: raw } of files) {
    const src = stripComments(raw);
    if (!/Backend version/i.test(src)) continue;
    if (/import\.meta\.env\.VITE_[A-Z_]*(COMMIT|SHA|VERSION|BUILD)/.test(src)) {
      bad.push(path);
    }
  }
  return bad;
}

function selftest() {
  const cases = [
    { name: "label + build-time constant is caught",
      files: [{ path: "a.tsx", src: `<footer>Backend version: {import.meta.env.VITE_BUILD_COMMIT}</footer>` }], expect: 1 },
    { name: "label sourced from healthz passes",
      files: [{ path: "b.tsx", src: `fetch("/api/v1/healthz/shallow"); <footer>Backend version: {v}</footer>` }], expect: 0 },
    { name: "an unrelated VITE_ constant without the label is ignored",
      files: [{ path: "c.tsx", src: `const x = import.meta.env.VITE_BUILD_COMMIT;` }], expect: 0 },
  ];
  let bad = 0;
  for (const c of cases) {
    const got = offenders(c.files).length;
    if (got !== c.expect) { console.error(`  selftest FAIL — ${c.name}: expected ${c.expect}, got ${got}`); bad++; }
    else console.log(`  selftest OK — ${c.name}`);
  }
  if (bad) { console.error(`SELFTEST FAIL — ${bad}/${cases.length}`); process.exit(1); }
  console.log(`verify-backend-version-from-backend SELFTEST OK — ${cases.length}/${cases.length}`);
}

function main() {
  if (process.argv.includes("--selftest")) return selftest();
  const files = walk(SRC).map((p) => ({ path: p.replace(process.cwd() + "/", ""), src: readFileSync(p, "utf8") }));
  if (files.length === 0) {
    console.error("verify-backend-version-from-backend FAIL — scanned 0 files; refusing to report green");
    process.exit(1);
  }
  const bad = offenders(files);
  if (bad.length) {
    console.error('verify-backend-version-from-backend FAIL — "Backend version" sourced from a build-time constant:');
    for (const p of bad) console.error(`  ${p}`);
    console.error("\nRead it from GET /api/v1/healthz/shallow (BackendVersionFooter does this), or rename the label");
    console.error("to say what it actually shows.");
    process.exit(1);
  }
  console.log(`verify-backend-version-from-backend OK — ${files.length} files scanned; the label is backend-sourced`);
}

main();
