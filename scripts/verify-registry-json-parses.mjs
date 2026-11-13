#!/usr/bin/env node
/**
 * verify-registry-json-parses — step 20165
 * Every file tracked with merge=json-union in .gitattributes must be valid JSON.
 * Called from .husky/pre-commit (--staged: staged files only) and CI (all files).
 * --selftest: 5-check test; exits 1 on a broken inline fixture.
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { resolve, dirname, join, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = resolve(fileURLToPath(import.meta.url), "..", "..");
const STAGED = process.argv.includes("--staged");
const SELFTEST = process.argv.includes("--selftest");

function getJsonUnionPatterns() {
  const attrs = readFileSync(join(ROOT, ".gitattributes"), "utf8");
  return [
    ...new Set(
      attrs
        .split("\n")
        .filter((l) => l.trim() && !l.startsWith("#") && l.includes("merge=json-union"))
        .map((l) => l.trim().split(/\s+/)[0])
        .filter(Boolean),
    ),
  ];
}

function expandPattern(pattern) {
  if (pattern.includes("*")) {
    const starIdx = pattern.indexOf("*");
    const prefix = pattern.slice(0, starIdx);
    const suffix = pattern.slice(pattern.lastIndexOf("*") + 1);
    const dir = join(ROOT, prefix.endsWith("/") ? prefix.slice(0, -1) : dirname(prefix));
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
      .filter((f) => !suffix || f.endsWith(suffix))
      .map((f) => join(dir, f));
  }
  const full = join(ROOT, pattern);
  return existsSync(full) ? [full] : [];
}

function getStagedFiles() {
  const r = spawnSync("git", ["diff", "--cached", "--name-only"], { cwd: ROOT, encoding: "utf8" });
  return r.stdout.trim().split("\n").filter(Boolean).map((f) => join(ROOT, f));
}

function checkFiles(files) {
  let failed = false;
  for (const f of files) {
    if (!existsSync(f)) continue;
    try {
      JSON.parse(readFileSync(f, "utf8"));
    } catch (e) {
      const rel = f.startsWith(ROOT) ? f.slice(ROOT.length + 1) : f;
      console.error(`FAIL: ${rel} is not valid JSON: ${e.message}`);
      failed = true;
    }
  }
  return !failed;
}

if (SELFTEST) {
  let pass = 0;
  const check = (label, cond) => {
    if (cond) { pass++; console.log(`✔ ${label}`); }
    else { console.error(`✘ ${label}`); process.exitCode = 1; }
  };

  // 1. Known-broken fixture exits 1
  const broken = '{\n  "  "20159": {\n    "claimed_by": "cursor"\n  }\n}';
  let threw = false;
  try { JSON.parse(broken); } catch { threw = true; }
  check("broken fixture with malformed key throws JSON.parse", threw);

  // 2. Known-good JSON parses OK
  const good = '{\n  "20159": {\n    "claimed_by": "cursor"\n  }\n}';
  let ok = false;
  try { JSON.parse(good); ok = true; } catch { /* */ }
  check("well-formed JSON parses without error", ok);

  // 3. getJsonUnionPatterns finds at least one entry
  const patterns = getJsonUnionPatterns();
  check("getJsonUnionPatterns finds json-union entries in .gitattributes", patterns.length > 0);

  // 4. expandPattern resolves CLAIMED-NUMBERS.json
  const expandedClaimed = patterns.flatMap(expandPattern).filter((f) => basename(f) === "CLAIMED-NUMBERS.json");
  check("expandPattern resolves CLAIMED-NUMBERS.json", expandedClaimed.length > 0);

  // 5. All current json-union files on disk parse OK
  const allFiles = patterns.flatMap(expandPattern);
  const allOk = checkFiles(allFiles);
  check("all json-union files on disk currently parse OK", allOk);

  const total = 5;
  console.log(`\nverify-registry-json-parses: selftest ${process.exitCode !== 1 ? total : 0}/${total} ${process.exitCode !== 1 ? "PASS" : "FAIL"}`);
  process.exit(process.exitCode !== 1 ? 0 : 1);
}

// Normal run
const patterns = getJsonUnionPatterns();
let targetFiles;
if (STAGED) {
  const stagedSet = new Set(getStagedFiles());
  targetFiles = patterns.flatMap(expandPattern).filter((f) => stagedSet.has(f));
} else {
  targetFiles = patterns.flatMap(expandPattern);
}

if (targetFiles.length === 0) {
  console.log("verify-registry-json-parses: no json-union files to check");
  process.exit(0);
}

const ok = checkFiles(targetFiles);
if (ok) {
  console.log(`verify-registry-json-parses: OK — ${targetFiles.length} json-union file(s) parse`);
} else {
  process.exit(1);
}
