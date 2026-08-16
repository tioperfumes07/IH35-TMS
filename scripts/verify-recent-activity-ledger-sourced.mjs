#!/usr/bin/env node
/**
 * PROG-PRFEED — Programs "last 10 PRs" must not silently empty when GitHub is private,
 * and must not freeze on a stale committed ledger when live git history is available.
 *
 * Law (PROG-PRFEED-STALE-LEDGER #4860, supersedes PRIVATE-EMPTY GitHub-only ban):
 *   1. request-time `git log` first (works on private repos; moves with deploy tip)
 *   2. GitHub pulls API second (token when present)
 *   3. committed ledger artifact LAST (labeled stale)
 *
 * Guard asserts CALL order of those three helpers inside the loader — not the textual
 * position of `fetch(GITHUB_PULLS_URL)` inside a helper defined above the loader
 * (that offset comparison falsely failed after STALE-LEDGER extracted the fetch).
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const BACKEND = "apps/backend/src/program/audit-scoreboard.routes.ts";
const LEDGER_JSON = "docs/audit/program-scoreboard.json";
const GEN = "scripts/audit-coverage-scoreboard.mjs";
const LABEL = "verify-recent-activity-ledger-sourced";

/** Strip comments so prose describing alternate orders is not read as the code doing it. */
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

/** Call-site only — skip `function name(` / `async function name(`. */
function callSite(src, name) {
  const re = new RegExp(String.raw`(?<!function\s)\b${name}\s*\(`, "g");
  const m = re.exec(src);
  return m ? m.index : -1;
}

export function auditBackend(raw) {
  const problems = [];
  const src = maskComments(raw);
  const gitAt = callSite(src, "readRecentActivityFromGitLog");
  const ghAt = callSite(src, "fetchRecentActivityFromGitHubApi");
  const ledgerAt = callSite(src, "readRecentActivityFromLedger");

  if (gitAt === -1) {
    problems.push(`${BACKEND}: missing readRecentActivityFromGitLog() — live private-repo feed requires request-time git log first (PROG-PRFEED-STALE-LEDGER).`);
  }
  if (ghAt === -1) {
    problems.push(`${BACKEND}: missing fetchRecentActivityFromGitHubApi() — GitHub is the second-tier fallback when git log is empty.`);
  }
  if (ledgerAt === -1) {
    problems.push(`${BACKEND}: missing readRecentActivityFromLedger() — committed ledger must remain the last-resort fallback.`);
  }
  if (gitAt !== -1 && ghAt !== -1 && gitAt > ghAt) {
    problems.push(`${BACKEND}: GitHub API is consulted before git log — git log must be primary (private-repo safe).`);
  }
  if (ghAt !== -1 && ledgerAt !== -1 && ghAt > ledgerAt) {
    problems.push(`${BACKEND}: committed ledger is consulted before GitHub — ledger must be LAST so a stale snapshot cannot freeze the panel.`);
  }
  if (gitAt !== -1 && ledgerAt !== -1 && gitAt > ledgerAt) {
    problems.push(`${BACKEND}: committed ledger is consulted before git log — ledger must be LAST.`);
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
    [
      "backend: git → github → ledger",
      `async function load(){ const a=readRecentActivityFromGitLog(10); const b=await fetchRecentActivityFromGitHubApi(10); const c=readRecentActivityFromLedger(10); }`,
      auditBackend,
      0,
    ],
    [
      "backend: github before git forbidden",
      `async function load(){ const b=await fetchRecentActivityFromGitHubApi(10); const a=readRecentActivityFromGitLog(10); const c=readRecentActivityFromLedger(10); }`,
      auditBackend,
      1,
    ],
    [
      "backend: ledger before github forbidden",
      `async function load(){ const a=readRecentActivityFromGitLog(10); const c=readRecentActivityFromLedger(10); const b=await fetchRecentActivityFromGitHubApi(10); }`,
      auditBackend,
      1,
    ],
    [
      "backend: no git log",
      `async function load(){ const b=await fetchRecentActivityFromGitHubApi(10); const c=readRecentActivityFromLedger(10); }`,
      auditBackend,
      1,
    ],
    [
      "gen: emits from ledger",
      `const out = { recentActivity: ledgerRecentActivity(10) };
execSync("git log " + ref);`,
      auditGenerator,
      0,
    ],
    ["gen: emission removed", `const out = { modules };`, auditGenerator, 1],
  ];
  let bad = 0;
  for (const [name, src, fn, expect] of cases) {
    const got = fn(src).length;
    const ok = expect === 0 ? got === 0 : got >= 1;
    if (!ok) {
      bad++;
      console.error(`  selftest FAIL: ${name} — expected ${expect ? ">=1" : "0"}, got ${got}`);
    }
  }
  if (bad) {
    console.error(`${LABEL} --selftest: ${bad} case(s) failed`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest: ${cases.length} cases pass`);
  process.exit(0);
}

const problems = [
  ...auditBackend(readFileSync(join(ROOT, BACKEND), "utf8")),
  ...auditGenerator(readFileSync(join(ROOT, GEN), "utf8")),
];

for (const [rel] of [[LEDGER_JSON]]) {
  const full = join(ROOT, rel);
  if (!existsSync(full)) {
    problems.push(`${rel}: missing — cannot confirm the ledger feed has rows.`);
    continue;
  }
  const n = (JSON.parse(readFileSync(full, "utf8")).recentActivity ?? []).length;
  if (n < 1) problems.push(`${rel}: recentActivity has 0 rows — regenerate with \`npm run gen:program-scoreboard\`.`);
}

if (problems.length) {
  console.error(`FAIL ${LABEL} — PROG-PRFEED:`);
  for (const p of problems) console.error(`  · ${p}`);
  process.exit(1);
}
console.log(`${LABEL}: OK — last-10 feed order is git_log → GitHub → ledger; ledger artifact populated`);
