#!/usr/bin/env node
/** @independent-input scripts/ — scans executable guard tags as well as the declaration feed. */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const LABEL = "verify-expense-built-tags-strict";
const TAG_RE = /@matrix-built\s+(\{[^\n]+\})/g;

export function audit(entries) {
  return entries
    .filter((entry) => (entry.tag.cols || []).includes("expense") && entry.tag.leafRe === ".*")
    .map((entry) => `${entry.file}: broad expense leafRe=.* Built claim`);
}

function scan() {
  const feedFile = "docs/specs/scoreboard/wire-sprint-built.json";
  const feed = JSON.parse(fs.readFileSync(path.join(ROOT, feedFile), "utf8"));
  const entries = (feed.entries || []).map((tag) => ({ file: feedFile, tag }));
  for (const file of fs.readdirSync(path.join(ROOT, "scripts")).filter((name) => name.startsWith("verify-") && name.endsWith(".mjs"))) {
    const source = fs.readFileSync(path.join(ROOT, "scripts", file), "utf8");
    for (const match of source.matchAll(TAG_RE)) {
      try {
        entries.push({ file: `scripts/${file}`, tag: JSON.parse(match[1]) });
      } catch {
        // Match scoreboard discovery: malformed legacy tags are ignored, not treated as coverage.
      }
    }
  }
  return entries;
}

if (process.argv.includes("--selftest")) {
  if (audit([{ file: "fixture", tag: { cols: ["expense"], leafRe: ".*" } }]).length !== 1) {
    console.error(`${LABEL} SELFTEST FAIL — broad mutation escaped`);
    process.exit(1);
  }
  if (audit([{ file: "fixture", tag: { cols: ["expense"], leafRe: "^transactions\\.(list|categorize)$" } }]).length) {
    console.error(`${LABEL} SELFTEST FAIL — exact tag rejected`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — broad rejected, exact accepted`);
  process.exit(0);
}

const failures = audit(scan());
if (failures.length) {
  console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — every expense Built tag/feed entry is leaf-specific`);
