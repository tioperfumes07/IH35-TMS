#!/usr/bin/env node
// verify-block-stub-artifacts.mjs — kills the FALSE-PENDING / FALSE-DONE class permanently (3rd recurrence:
// block-10, DISP-OVERVIEW, the 17-module queue). A docs/blocks stub that CLAIMS completion but names no
// real artifact is invisible to the evidence classifier (reconcile-block-status.mjs) — it reads PENDING
// forever, or its "DONE" can never be verified.
//
// RULE: any stub that self-claims completion (filename `-DONE`, or body says STATUS: DONE / shipped / live
// on main / ✅ / tracked complete) MUST name >=1 signature artifact path (apps/**/*.ts(x), scripts/verify-*,
// db/migrations/*.sql) that ACTUALLY EXISTS on origin/main. Genuinely-unbuilt forward specs (no done-claim)
// are exempt — they correctly have no artifacts yet. Exit 1 on any violation.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BLOCKS = path.join(ROOT, "docs/blocks");
let mainFiles = new Set();
try { mainFiles = new Set(execFileSync("git", ["ls-tree", "-r", "origin/main", "--name-only"], { cwd: ROOT, encoding: "utf8" }).split(/\r?\n/).filter(Boolean)); }
catch { console.warn("[block-stub-artifacts] WARN: origin/main unavailable; falling back to working-tree existence"); }
const onMain = (p) => (mainFiles.size ? mainFiles.has(p) : fs.existsSync(path.join(ROOT, p)));

const ART = /\b(apps\/[A-Za-z0-9_./-]+\.(?:ts|tsx)|scripts\/verify-[A-Za-z0-9_-]+\.(?:mjs|ts|cjs)|db\/migrations\/[A-Za-z0-9_]+\.sql|(?:\d{4}|\d{12})_[a-z0-9_]+\.sql)\b/g;
// SELF-completion claim only — explicit. NOT bare "shipped" (that's used to cite dependency PRs, e.g.
// "D5 register shipped #976", which is not the block claiming itself done).
const DONE_CLAIM = /\bSTATUS\s*:\s*DONE\b|✅|GUARD-verified live|tracked complete/i;

function walk(d) { const out = []; for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) out.push(...walk(p)); else if (e.name.endsWith(".txt") && !e.name.startsWith("00-")) out.push(p); } return out; }

const violations = [];
for (const f of walk(BLOCKS)) {
  const rel = path.relative(ROOT, f);
  const body = fs.readFileSync(f, "utf8");
  const claimsDone = /-DONE\b/i.test(path.basename(f)) || DONE_CLAIM.test(body);
  if (!claimsDone) continue; // forward/unbuilt spec — exempt
  const named = [...new Set((body.match(ART) || []).map((a) => (/^(?:\d{4}|\d{12})_/.test(a) ? `db/migrations/${a}` : a)))];
  const present = named.filter(onMain);
  if (present.length === 0) {
    violations.push({ rel, why: named.length ? `names ${named.length} artifact(s) but NONE exist on main: ${named.slice(0, 3).join(", ")}` : "claims DONE but names ZERO artifact paths" });
  }
}

if (violations.length === 0) {
  console.log("[block-stub-artifacts] PASS — every completion-claiming stub names >=1 real artifact on main.");
  process.exit(0);
}
console.error("\nBLOCK-STUB-ARTIFACTS GUARD FAILED");
console.error("=".repeat(70));
console.error("A stub that claims DONE/shipped must name >=1 real artifact path on main, or the evidence");
console.error("classifier can't verify it (the false-PENDING/false-DONE class). Add the real path(s):");
for (const v of violations) console.error(`  ${v.rel}\n     ${v.why}`);
console.error("=".repeat(70));
process.exit(1);
