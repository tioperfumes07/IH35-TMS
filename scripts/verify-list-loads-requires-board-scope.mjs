#!/usr/bin/env node
// ROUND 283.3 (Lead restate 2026-09-30) — No listAllLoads / listLoads / GET /mdata/loads call
// site may omit board_scope. Fail the BUILD (exit 1), not a lint warning. Status alone is NOT
// enough — the whole defect was a caller not being explicit about scope. drafts_only is the
// only exception (backend replaces status/board_scope filtering for the Drafts pill).
//
// Scans:
//   1. FE call sites of listAllLoads({...}) / listLoads({...})
//   2. Raw `/api/v1/mdata/loads` / `/mdata/loads` query strings in FE (excluding /:id paths)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-list-loads-requires-board-scope";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FE_SRC = path.join(ROOT, "apps/frontend/src");

const CALL_RE = /\b(listAllLoads|listLoads)\s*\(\s*\{([\s\S]*?)\}\s*\)/g;
// Template or string literals that hit the LIST endpoint (not /loads/:id...)
const RAW_GET_RE = /[`'"]\/(?:api\/v1\/)?mdata\/loads(?:\?|\$\{|['"`])/g;

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === "node_modules" || ent.name === "__tests__" || ent.name.endsWith(".test.tsx") || ent.name.endsWith(".test.ts")) continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(ent.name)) out.push(p);
  }
  return out;
}

function hasBoardScope(body) {
  return /\bboard_scope\s*:/.test(body) || /(^|[,{\s])board_scope(\s*,|\s*$)/.test(body);
}
function hasDraftsOnly(body) {
  return /\bdrafts_only\s*:/.test(body) || /(^|[,{\s])drafts_only(\s*,|\s*$)/.test(body);
}
function isSpreadOfNamedFilters(body) {
  // Dispatch.tsx: listAllLoads(loadListFilters) / listLoads({ ...loadListFilters, limit, offset })
  // — loadListFilters is built with board_scope: boardScope in the same file. Allow spreads that
  // include a named filters object; the same-file board_scope assignment is asserted separately
  // when the identifier is loadListFilters (see findMissingBoardScopeInFile).
  return /\.\.\.[A-Za-z_][\w]*/.test(body);
}

export function findUnscopedCalls(src, fileRel) {
  const problems = [];
  let m;
  const re = new RegExp(CALL_RE.source, "g");
  while ((m = re.exec(src))) {
    const body = m[2];
    if (hasDraftsOnly(body) && hasBoardScope(body)) continue; // both fine
    if (hasDraftsOnly(body) && !hasBoardScope(body)) {
      // drafts_only alone is the Drafts-pill exception — backend replaces board_scope filtering
      continue;
    }
    if (hasBoardScope(body)) continue;
    if (isSpreadOfNamedFilters(body)) {
      // Require the spread source to be a known scoped bag, or fail.
      // loadListFilters / filters with board_scope in same file is checked below.
      if (/\.\.\.(loadListFilters|filters)\b/.test(body)) continue;
      const line = src.slice(0, m.index).split("\n").length;
      problems.push(`${fileRel}:${line} — ${m[1]}({...spread}) omits board_scope (ROUND 283.3 — declare board_scope on the spread source)`);
      continue;
    }
    const line = src.slice(0, m.index).split("\n").length;
    problems.push(`${fileRel}:${line} — ${m[1]}({...}) omits board_scope (ROUND 283.3 — status alone is not enough)`);
  }
  return problems;
}

/** Bare listAllLoads(loadListFilters) without object literal — still a call site. */
export function findBareIdentifierCalls(src, fileRel) {
  const problems = [];
  const re = /\b(listAllLoads|listLoads)\s*\(\s*([A-Za-z_][\w]*)\s*\)/g;
  let m;
  while ((m = re.exec(src))) {
    const id = m[2];
    // Same-file must assign board_scope onto that identifier (object literal or property write).
    const assignsScope =
      new RegExp(`${id}\\s*=\\s*\\{[\\s\\S]*?\\bboard_scope\\s*:`).test(src) ||
      new RegExp(`${id}\\.board_scope\\s*=`).test(src);
    if (assignsScope) continue;
    const line = src.slice(0, m.index).split("\n").length;
    problems.push(`${fileRel}:${line} — ${m[1]}(${id}) — identifier has no board_scope assignment in this file (ROUND 283.3)`);
  }
  return problems;
}

/** Raw GET list URL builders in FE — must set board_scope= in the query (api/loads.ts is the hub). */
export function findRawListGets(src, fileRel) {
  const problems = [];
  // Only flag files that build the list URL outside api/loads.ts
  if (fileRel.endsWith("api/loads.ts")) {
    // Hub must still put board_scope on the query when provided — and must not invent a silent default.
    // Assert listLoads forwards board_scope when present.
    if (!/if\s*\(\s*filters\.board_scope\s*\)\s*query\.set\(\s*["']board_scope["']/.test(src)) {
      problems.push(`${fileRel} — listLoads must query.set("board_scope", ...) when filters.board_scope is set`);
    }
    return problems;
  }
  let m;
  const re = new RegExp(RAW_GET_RE.source, "g");
  while ((m = re.exec(src))) {
    // Skip detail/audit/status subpaths constructed nearby — only pure list endpoints
    const window = src.slice(m.index, m.index + 120);
    if (/\/loads\/\$\{|\/loads\/['"`]|\/loads\/:/.test(window)) continue;
    if (/needs-driver-bill|settlement-refs|remint-driver-bill/.test(window)) continue;
    // If this file builds board_scope into the same string/template, OK
    const chunk = src.slice(Math.max(0, m.index - 200), m.index + 250);
    if (/board_scope/.test(chunk)) continue;
    const line = src.slice(0, m.index).split("\n").length;
    problems.push(`${fileRel}:${line} — raw GET /mdata/loads list URL without board_scope nearby (ROUND 283.3 — use listLoads/listAllLoads with board_scope)`);
  }
  return problems;
}

function main() {
  const files = walk(FE_SRC);
  const all = [];
  for (const f of files) {
    const rel = path.relative(ROOT, f);
    const src = fs.readFileSync(f, "utf8");
    if (!rel.endsWith("api/loads.ts")) {
      all.push(...findUnscopedCalls(src, rel));
      all.push(...findBareIdentifierCalls(src, rel));
    }
    all.push(...findRawListGets(src, rel));
  }
  if (all.length) {
    console.error(`${LABEL}: FAIL — ${all.length} call site(s) omit board_scope (build must fail):`);
    for (const p of all) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log(`${LABEL}: PASS — every listLoads/listAllLoads/GET /mdata/loads list call declares board_scope (or drafts_only)`);
}

if (process.argv.includes("--selftest")) {
  let bad = 0;
  const t = (name, cond) => {
    if (!cond) {
      console.error(`  SELFTEST FAIL: ${name}`);
      bad++;
    }
  };
  t("bare unscoped fails", findUnscopedCalls(`listAllLoads({ operating_company_id: [id] })`, "x.tsx").length === 1);
  t("status alone fails", findUnscopedCalls(`listAllLoads({ status: ["dispatched"], operating_company_id: [id] })`, "x.tsx").length === 1);
  t("board_scope live passes", findUnscopedCalls(`listAllLoads({ board_scope: "live", operating_company_id: [id] })`, "x.tsx").length === 0);
  t("board_scope shorthand passes", findUnscopedCalls(`listAllLoads({ board_scope, status })`, "x.tsx").length === 0);
  t("drafts_only alone passes", findUnscopedCalls(`listLoads({ drafts_only: true })`, "x.tsx").length === 0);
  t("spread loadListFilters passes", findUnscopedCalls(`listLoads({ ...loadListFilters, limit, offset })`, "x.tsx").length === 0);
  t(
    "bare id with board_scope assignment passes",
    findBareIdentifierCalls(`const loadListFilters = { board_scope: boardScope };\nlistAllLoads(loadListFilters)`, "x.tsx").length === 0
  );
  t(
    "bare id without board_scope fails",
    findBareIdentifierCalls(`const loadListFilters = { sort: "x" };\nlistAllLoads(loadListFilters)`, "x.tsx").length === 1
  );
  if (bad) process.exit(1);
  console.log(`${LABEL} SELFTEST PASS`);
  process.exit(0);
}

main();
