#!/usr/bin/env node
/**
 * verify-legal-no-gl-writes.mjs — LEGAL-CONTRACT-CREATOR-01 scope guard.
 *
 * The legal module records contract TERMS only; it must NEVER post to the GL / accounting ledger.
 * (Lease payments posting, if ever wanted, is a separate Tier-1 money block with its own flag + GUARD
 * sign-off.) This BLOCKS any GL/posting write or import from apps/backend/src/legal/**.
 *
 * Real static assert (no DB): scans legal/*.ts (excluding tests), strips comments, fails on any
 * forbidden GL/posting reference. Exit 1 on violation.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const LEGAL_DIR = path.join(ROOT, "apps", "backend", "src", "legal");

// GL/posting writes the legal module must never make. (Reads of nothing here — there are no legitimate
// accounting writes from legal/*.) Patterns chosen to match the real posting surface, not prose.
const FORBIDDEN = [
  /\baccounting\.(journal_entries|journal_entry_postings|bill_lines|payments|bill_payments)\b/i,
  /INSERT\s+INTO\s+accounting\./i,
  /\bpostToGl\b|\bpost_gl\b|\bpostJournalEntry\b/i,
  /\bexpense_lines\b/i,
  /\bBILL_GL_POSTING_ENABLED\b/i,
  /from\s+["']\.\.\/accounting\/.*post/i,
];

function stripComments(s) {
  return s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
}
function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return walk(p);
    if (e.isFile() && p.endsWith(".ts") && !/\.test\.ts$|\.spec\.ts$/.test(p)) return [p];
    return [];
  });
}

function main() {
  const files = walk(LEGAL_DIR);
  const violations = [];
  for (const f of files) {
    const code = stripComments(fs.readFileSync(f, "utf8"));
    code.split(/\r?\n/).forEach((line, i) => {
      for (const re of FORBIDDEN) {
        if (re.test(line)) violations.push({ file: path.relative(ROOT, f), line: i + 1, text: line.trim().slice(0, 120) });
      }
    });
  }
  if (violations.length === 0) {
    console.log(`[legal-no-gl] PASS — no GL/posting writes in legal/** (${files.length} files scanned).`);
    process.exit(0);
  }
  console.error("\nLEGAL NO-GL GUARD FAILED");
  console.error("=".repeat(60));
  console.error("apps/backend/src/legal/** must not write to the GL/accounting ledger:");
  for (const v of violations) console.error(`  ${v.file}:${v.line}\n     ${v.text}`);
  console.error("=".repeat(60));
  process.exit(1);
}
main();
