#!/usr/bin/env node
/**
 * PROG-PRFEED-PRIVATE-EMPTY — the Programs "last 10 PRs" panel must be LEDGER-sourced, never fed by a
 * GitHub API call at runtime.
 *
 * WHAT HAPPENED: the panel rendered but was permanently empty. It was populated from
 * `GET /api/v1/program/audit-scoreboard`, whose backend fetches api.github.com/repos/.../pulls. The
 * moment this repo was made private that call stopped returning anything, so the endpoint answered
 * 200 with `recentActivity: []` and the UI showed "No recent PRs returned yet" forever. Verified live
 * 2026-08-07: the endpoint returned HTTP 200 with recentActivity length 0.
 *
 * "Last synced" on the same page survived the identical event, because it is derived from the ledger
 * (`meta.generatedAt` = `git log %cI`). That is the contract enforced here.
 *
 * WHY AN EMPTY ARRAY IS THE DANGEROUS PART: `[]` is indistinguishable from "nothing has merged yet".
 * A GitHub-sourced feed does not fail loudly when it loses access — it goes quiet, and the board
 * silently misreports. So this guard does not merely check that a fallback exists; it forbids the
 * runtime GitHub path from being the source at all.
 *
 * CHECKED:
 *   1. AuditScoreboardPage assigns recentActivity from PROGRAM_SCOREBOARD (the generated ledger data).
 *   2. It never assigns recentActivity from the live API payload (`live.recentActivity`) — not even as
 *      a fallback, because a fallback reintroduces the silent-empty state.
 *   3. The generator emits at least one ledger row, so the pipeline is actually producing data.
 *   4. The shipped data file carries recentActivity rows.
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const BACKEND = "apps/backend/src/program/audit-scoreboard.routes.ts";
const DATA = "apps/frontend/src/pages/program/programScoreboard.data.ts";
const LEDGER_JSON = "docs/audit/program-scoreboard.json";
const GEN = "scripts/audit-coverage-scoreboard.mjs";
const LABEL = "verify-recent-activity-ledger-sourced";

/** Strip comments so prose describing the old GitHub path is not read as the code doing it. */
function maskComments(src) {
  const out = Array.from(src);
  let i = 0, quote = null;
  while (i < src.length) {
    const c = src[i], n = src[i + 1];
    if (quote) { if (c === "\\") { i += 2; continue; } if (c === quote) quote = null; i++; continue; }
    if (c === "'" || c === '"' || c === "`") { quote = c; i++; continue; }
    if (c === "/" && n === "/") { while (i < src.length && src[i] !== "\n") { out[i] = " "; i++; } continue; }
    if (c === "/" && n === "*") { const e = src.indexOf("*/", i + 2); const stop = e === -1 ? src.length : e + 2; for (let k = i; k < stop; k++) if (out[k] !== "\n") out[k] = " "; i = stop; continue; }
    i++;
  }
  return out.join("");
}

export function auditBackend(raw) {
  const problems = [];
  const src = maskComments(raw);
  // The endpoint must consult the committed ledger artifact BEFORE any GitHub call. Order matters:
  // GitHub-first would still answer 200 with [] on a private repo, which renders as "no PRs" rather
  // than failing — the silent-empty state this whole finding is about.
  // Match the CALL SITE, not the declaration: `function readRecentActivityFromLedger(` would
  // otherwise satisfy this check even after every caller was deleted — the same
  // definition-counts-as-usage bug found in four other guards (CLS-GUARD-READS-COMMENTS).
  const ledgerAt = src.search(/(?<!function\s)\breadRecentActivityFromLedger\s*\(/);
  const githubAt = src.search(/fetch\(\s*GITHUB_PULLS_URL/);
  if (ledgerAt === -1) {
    problems.push(`${BACKEND}: recentActivity is not read from the ledger artifact (docs/audit/program-scoreboard.json). A GitHub-only feed empties silently the moment the repo is private.`);
  } else if (githubAt !== -1 && githubAt < ledgerAt) {
    problems.push(`${BACKEND}: the GitHub fetch runs BEFORE the ledger read — GitHub must be the fallback, never the primary source.`);
  }
  return problems;
}

export function auditGenerator(raw) {
  const src = maskComments(raw);
  const problems = [];
  if (!/recentActivity\s*:\s*ledgerRecentActivity\s*\(/.test(src)) {
    problems.push(`${GEN}: does not emit recentActivity from ledgerRecentActivity() — the ledger feed would be empty.`);
  }
  if (!/execSync\([^)]*git log/.test(src) && !/"git log "/.test(src)) {
    problems.push(`${GEN}: ledgerRecentActivity does not read git history.`);
  }
  return problems;
}

if (process.argv.includes("--selftest")) {
  const cases = [
    ["backend: ledger first, github fallback", `const l = readRecentActivityFromLedger(10); if (l.length) return l; const res = await fetch(GITHUB_PULLS_URL, {});`, auditBackend, 0],
    ["backend: github before ledger is forbidden", `const res = await fetch(GITHUB_PULLS_URL, {}); const l = readRecentActivityFromLedger(10);`, auditBackend, 1],
    ["backend: no ledger read at all", `const res = await fetch(GITHUB_PULLS_URL, {});`, auditBackend, 1],
    ["gen: emits from ledger", `const out = { recentActivity: ledgerRecentActivity(10) };
execSync("git log " + ref);`, auditGenerator, 0],
    ["gen: emission removed", `const out = { modules };`, auditGenerator, 1],
  ];
  let bad = 0;
  for (const [name, src, fn, expect] of cases) {
    const got = fn(src).length;
    const ok = expect === 0 ? got === 0 : got >= 1;
    if (!ok) { bad++; console.error(`  selftest FAIL: ${name} — expected ${expect ? ">=1" : "0"}, got ${got}`); }
  }
  if (bad) { console.error(`${LABEL} --selftest: ${bad} case(s) failed`); process.exit(1); }
  console.log(`${LABEL} --selftest: ${cases.length} cases pass`);
  process.exit(0);
}

const problems = [
  ...auditBackend(readFileSync(join(ROOT, BACKEND), "utf8")),
  ...auditGenerator(readFileSync(join(ROOT, GEN), "utf8")),
];

// The pipeline must actually be producing rows — an empty ledger feed is the very failure being fixed.
for (const [rel, key] of [[LEDGER_JSON, "json"]]) {
  const full = join(ROOT, rel);
  if (!existsSync(full)) { problems.push(`${rel}: missing — cannot confirm the ledger feed has rows.`); continue; }
  const txt = readFileSync(full, "utf8");
  const n = key === "json"
    ? (JSON.parse(txt).recentActivity ?? []).length
    : (txt.match(/"mergedAtCt"/g) ?? []).length;
  if (n < 1) problems.push(`${rel}: recentActivity has 0 rows — regenerate with \`npm run gen:program-scoreboard\`.`);
}

if (problems.length) {
  console.error(`FAIL ${LABEL} — PROG-PRFEED-PRIVATE-EMPTY:`);
  for (const p of problems) console.error(`  · ${p}`);
  process.exit(1);
}
console.log(`${LABEL}: OK — last-10 feed is ledger-sourced and populated; no runtime GitHub dependency`);
