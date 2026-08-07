#!/usr/bin/env node
/**
 * HELP-S04 — every HELP_MANIFEST slug has a docs/help/<slug>.md body that is
 * not a Phase-7 seed stub (min lines, no seed footer, no Missing article).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-help-article-content-floor";
const MANIFEST = "apps/frontend/src/help/helpCenterContent.ts";
const HELP_DIR = "docs/help";
const MIN_NON_EMPTY_LINES = 12;
const FORBIDDEN = [
  /Phase 7 help center seed/i,
  /content TBD/i,
  /The article "[^"]+" could not be loaded/,
  /^# Missing article/m,
];

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function slugsFromManifest(src) {
  const out = [];
  const re = /\{\s*slug:\s*"([^"]+)"/g;
  let m;
  while ((m = re.exec(src))) out.push(m[1]);
  return out;
}

export function collectProblems(sources = { manifest: read(MANIFEST) }) {
  const problems = [];
  const slugs = slugsFromManifest(sources.manifest);
  if (slugs.length < 8) {
    problems.push(`${MANIFEST}: expected ≥8 HELP_MANIFEST slugs, got ${slugs.length}`);
  }
  for (const slug of slugs) {
    const rel = `${HELP_DIR}/${slug}.md`;
    const full = path.join(ROOT, rel);
    if (!fs.existsSync(full)) {
      problems.push(`${rel}: missing for manifest slug "${slug}"`);
      continue;
    }
    const body = fs.readFileSync(full, "utf8");
    const lines = body.split("\n").filter((l) => l.trim().length > 0);
    if (lines.length < MIN_NON_EMPTY_LINES) {
      problems.push(`${rel}: only ${lines.length} non-empty lines (need ≥${MIN_NON_EMPTY_LINES})`);
    }
    for (const bad of FORBIDDEN) {
      if (bad.test(body)) {
        problems.push(`${rel}: forbidden stub marker ${bad}`);
      }
    }
  }
  return problems;
}

const IS_MAIN = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (IS_MAIN && process.argv.includes("--selftest")) {
  const realManifest = read(MANIFEST);
  const problemsGood = collectProblems({ manifest: realManifest });
  if (problemsGood.length) {
    console.error(`${LABEL} --selftest FAIL (real):\n${problemsGood.map((p) => `  - ${p}`).join("\n")}`);
    process.exit(1);
  }
  // Plant: temporarily require a fake slug via a fake manifest string
  const broken = {
    manifest: realManifest.replace(
      '{ slug: "welcome", title: "Welcome to IH 35 Dispatch", category: "Getting Started" },',
      '{ slug: "welcome", title: "Welcome to IH 35 Dispatch", category: "Getting Started" },\n  { slug: "__no_such_help_slug__", title: "X", category: "Getting Started" },',
    ),
  };
  if (collectProblems(broken).length === 0) {
    console.error(`${LABEL} --selftest FAIL: missing slug not flagged`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest OK`);
  process.exit(0);
}

if (IS_MAIN) {
  const problems = collectProblems();
  if (problems.length) {
    console.error(`${LABEL} FAIL:`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log(`${LABEL} PASS — HELP_MANIFEST articles meet content floor (HELP-S04)`);
}
