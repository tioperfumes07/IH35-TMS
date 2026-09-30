#!/usr/bin/env node
// ROUND 283.3 — No call to listAllLoads / listLoads may omit both status and board_scope
// (and drafts_only). Fail closed: an unscoped caller used to dump every load in the company.
// Static FE scan; ratchet starts at today's unscoped count (must be 0 after ROUND 283.2).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-list-loads-requires-board-scope";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FE_SRC = path.join(ROOT, "apps/frontend/src");

const CALL_RE = /\b(listAllLoads|listLoads)\s*\(\s*\{([\s\S]*?)\}\s*\)/g;

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === "node_modules" || ent.name === "__tests__" || ent.name.endsWith(".test.tsx") || ent.name.endsWith(".test.ts")) continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(ent.name)) out.push(p);
  }
  return out;
}

export function findUnscopedCalls(src, fileRel) {
  const problems = [];
  let m;
  const re = new RegExp(CALL_RE.source, "g");
  while ((m = re.exec(src))) {
    const body = m[2];
    const hasStatus = /\bstatus\s*:/.test(body) || /(^|[,{\s])status(\s*,|\s*$)/.test(body);
    const hasScope = /\bboard_scope\s*:/.test(body) || /(^|[,{\s])board_scope(\s*,|\s*$)/.test(body);
    const hasDrafts = /\bdrafts_only\s*:/.test(body) || /(^|[,{\s])drafts_only(\s*,|\s*$)/.test(body);
    // spread of a filters object that already carries scope (Dispatch.tsx loadListFilters) — allow
    // when the call site spreads an identifier that is not a bare empty object.
    const isSpreadOnly = /^\s*\.\.\.[A-Za-z_][\w]*\s*,?\s*$/.test(body) || /\.\.\.[A-Za-z_]/.test(body);
    if (isSpreadOnly && !hasStatus && !hasScope && !hasDrafts) continue;
    if (!hasStatus && !hasScope && !hasDrafts) {
      const line = src.slice(0, m.index).split("\n").length;
      problems.push(`${fileRel}:${line} — ${m[1]}({...}) omits status, board_scope, and drafts_only (ROUND 283.3)`);
    }
  }
  return problems;
}

function main() {
  const files = walk(FE_SRC);
  const all = [];
  for (const f of files) {
    const rel = path.relative(ROOT, f);
    // api/loads.ts defines the helpers — skip the definitions themselves
    if (rel.endsWith("api/loads.ts")) continue;
    all.push(...findUnscopedCalls(fs.readFileSync(f, "utf8"), rel));
  }
  if (all.length) {
    console.error(`${LABEL}: FAIL — ${all.length} unscoped listLoads/listAllLoads call(s):`);
    for (const p of all) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log(`${LABEL}: PASS — every listLoads/listAllLoads call declares status, board_scope, or drafts_only`);
}

if (process.argv.includes("--selftest")) {
  const bad = findUnscopedCalls(`listAllLoads({ operating_company_id: [id] })`, "x.tsx");
  const good = findUnscopedCalls(`listAllLoads({ board_scope: "live", operating_company_id: [id] })`, "x.tsx");
  const spread = findUnscopedCalls(`listAllLoads({ ...loadListFilters })`, "x.tsx");
  if (bad.length !== 1 || good.length !== 0 || spread.length !== 0) {
    console.error("SELFTEST FAIL", { bad, good, spread });
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS`);
  process.exit(0);
}

main();
