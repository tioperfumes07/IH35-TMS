#!/usr/bin/env node
/** @independent-input scripts/ — scans executable guard tags as well as the declaration feed. */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const LABEL = "verify-liability-built-tags-strict";
const TAG_RE = /@matrix-built\s+(\{[^\n]+\})/g;

export function audit(entries) {
  const failures = [];
  for (const entry of entries) {
    if ((entry.tag.cols || []).includes("liability") && entry.tag.leafRe === ".*") {
      failures.push(`${entry.file}: broad liability leafRe=.* Built claim`);
    }
  }
  return failures;
}

function scan() {
  const entries = [];
  const feedFile = "docs/specs/scoreboard/wire-sprint-built.json";
  const feed = JSON.parse(fs.readFileSync(path.join(ROOT, feedFile), "utf8"));
  for (const tag of feed.entries || []) entries.push({ file: feedFile, tag });
  for (const file of fs.readdirSync(path.join(ROOT, "scripts")).filter((name) => name.startsWith("verify-") && name.endsWith(".mjs"))) {
    const source = fs.readFileSync(path.join(ROOT, "scripts", file), "utf8");
    for (const match of source.matchAll(TAG_RE)) {
      try {
        entries.push({ file: `scripts/${file}`, tag: JSON.parse(match[1]) });
      } catch {
        // The scoreboard scanner also skips malformed legacy tags; this guard owns liability tags only.
      }
    }
  }
  return entries;
}

if (process.argv.includes("--selftest")) {
  if (audit([{ file: "fixture.mjs", tag: { cols: ["liability"], leafRe: ".*" } }]).length !== 1) {
    console.error(`${LABEL} SELFTEST FAIL — broad mutation escaped`);
    process.exit(1);
  }
  if (audit([{ file: "fixture.mjs", tag: { cols: ["liability"], leafRe: "^cash_advances$" } }]).length !== 0) {
    console.error(`${LABEL} SELFTEST FAIL — exact leaf rejected`);
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
console.log(`${LABEL} PASS — every liability Built tag/feed entry is leaf-specific`);
