#!/usr/bin/env node
/**
 * verify-no-fabricated-owner-ruling-cites.mjs
 *
 * Extended from verify-steps/10243 (owner 2026-09-03): fail the build if any code comment
 * cites an "owner ruling" with no matching text under docs/. Invented citations must never merge.
 *
 * Hard ban: the exact fabricated phrase `B4 (owner ruling` (never existed in any GO-21 doc).
 * Soft ban: comments that claim `owner ruling, GO-N register` must have that GO-N string appear
 * somewhere under docs/ or claude/. Bare "owner ruling YYYY-MM-DD" date notes without a register
 * claim are allowed (they are attributions, not document cites).
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SCAN_DIRS = ["apps/frontend/src", "apps/backend/src"];
const DOCS_DIRS = ["docs", "claude"];

function walk(dir, out = [], exts = /\.(tsx?|jsx?|mjs|cjs|md)$/i) {
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === "node_modules" || ent.name === "dist" || ent.name.startsWith(".")) continue;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(full, out, exts);
    else if (exts.test(ent.name)) out.push(full);
  }
  return out;
}

function loadDocsCorpus() {
  const files = DOCS_DIRS.flatMap((d) => walk(path.join(ROOT, d), [], /\.md$/i));
  return files.map((f) => fs.readFileSync(f, "utf8")).join("\n").toLowerCase();
}

function violations() {
  const corpus = loadDocsCorpus();
  const errors = [];
  for (const file of SCAN_DIRS.flatMap((d) => walk(path.join(ROOT, d), [], /\.(tsx?|jsx?|mjs|cjs)$/i))) {
    const src = fs.readFileSync(file, "utf8");
    const rel = path.relative(ROOT, file);
    if (/B4\s*\(\s*owner\s+ruling/i.test(src)) {
      errors.push(`${rel}: fabricated "B4 (owner ruling" citation`);
    }
    const registerClaims = src.match(/owner\s+ruling[^\n*]{0,80}GO-\d+[^\n*]{0,40}register[^\n*]{0,40}/gi) ?? [];
    for (const claim of registerClaims) {
      const go = claim.match(/GO-\d+/i)?.[0]?.toLowerCase();
      if (go && !corpus.includes(go)) {
        errors.push(`${rel}: owner-ruling register cite has no docs/ match — "${claim.replace(/\s+/g, " ").trim().slice(0, 120)}"`);
      }
      const quoted = claim.match(/"([^"]{8,})"/);
      if (quoted && !corpus.includes(quoted[1].toLowerCase())) {
        errors.push(`${rel}: owner-ruling quote not found in docs/ — "${quoted[1]}"`);
      }
    }
  }
  return errors;
}

function selftest() {
  const planted = "/* B4 (owner ruling, GO-21 register 2026-09-02): Equipment/load type moved to section B */";
  const tmpDir = path.join(ROOT, "apps/frontend/src");
  const tmp = path.join(tmpDir, `_fabricated_ruling_selftest_${process.pid}.tsx`);
  fs.writeFileSync(tmp, planted);
  try {
    const errs = violations();
    const hit = errs.some((e) => /B4\s*\(\s*owner\s+ruling/i.test(e) || e.includes("fabricated"));
    if (!hit) {
      throw new Error(`selftest did not catch planted B4 fabricated cite; errs=${JSON.stringify(errs)}`);
    }
  } finally {
    try {
      fs.unlinkSync(tmp);
    } catch {
      /* ignore */
    }
  }
  console.log("PASS verify-no-fabricated-owner-ruling-cites --selftest");
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  const errs = violations();
  if (errs.length) {
    console.error("FAIL verify-no-fabricated-owner-ruling-cites");
    for (const e of errs) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log("PASS verify-no-fabricated-owner-ruling-cites");
}
