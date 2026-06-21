#!/usr/bin/env node
// HOLD-MERGE-GATE — root-cause control for the 2026-06-20 near-miss, where a leftover background
// `gh pr merge` loop title-blindly merged 5 [HOLD-FOR-JORGE] PRs (#1266-1270). A title is a request,
// not a control. This script IS the control: it runs as a CI job on every pull_request and goes RED on
// any HOLD / financial / posting / migration / flag-flip PR unless the human label `JORGE-APPROVED` is
// present. A required red check physically blocks `gh pr merge` (and the merge button), so a generic
// merge loop can no longer bypass a HOLD/financial PR.
//
// Decision (classify()):
//   PROTECTED if ANY of:
//     • title contains "[HOLD-FOR-JORGE]" (case-insensitive), OR
//     • a changed file matches a PROTECTED_GLOBS entry (*posting* tooling), OR
//     • a changed migration is NOT provably additive-new-table (CREATE-TABLE-only neutral, 2026-06-20:
//       a migration is neutral ONLY if it CREATEs a new table and does nothing dangerous — no ALTER /
//       DROP / DELETE / TRUNCATE / UPDATE-SET, no financial/accounting table, no INSERT into an existing
//       table; INSERT into the same new table is allowed. Anything else stays PROTECTED — conservative), OR
//     • a changed backend accounting/driver-finance .ts file whose DIFF shows GL-write markers, OR
//     • the diff flips a *_ENABLED / *_FLAG / FEATURE_* from false/OFF -> true/ON.
//   Verdict:
//     • PROTECTED and label JORGE-APPROVED absent  -> FAIL (exit 1, RED)   <- blocks the merge
//     • PROTECTED and label JORGE-APPROVED present  -> pass
//     • not PROTECTED                               -> pass (neutral)
//
// Honest limitation (see docs/specs/HOLD-MERGE-GATE.md): this stops accidental / title-blind loops. It
// does NOT stop a script that deliberately applies JORGE-APPROVED with Jorge's token. The standing rule
// remains: kill all sweepers + never run a write-token merge loop during a HOLD window.
//
// Inputs (CI provides via env; all optional — missing => derived/empty):
//   GATE_PR_TITLE   the PR title
//   GATE_PR_LABELS  JSON array of label names, e.g. ["JORGE-APPROVED"]
//   GATE_BASE_SHA   base commit (diff base); default origin/main
//   GATE_HEAD_SHA   head commit;            default HEAD
// Run modes:  (default) gate this PR   |   --self-test  run the embedded behavior fixtures.

import { execSync } from "node:child_process";

const APPROVE_LABEL = "JORGE-APPROVED";
const HOLD_TITLE_RE = /\[HOLD-FOR-JORGE/i;

// Path globs that are ALWAYS protected (financial / posting / migration tooling).
const PROTECTED_GLOBS = [
  "**/*posting*.ts",
  "**/*posting*.mjs",
];

// Migration safety (CREATE-TABLE-only neutral, Jorge-approved 2026-06-20). A migration is NEUTRAL only if
// it is PROVABLY additive-new-table: it CREATEs a new table and does nothing dangerous. Anything else stays
// PROTECTED (RED until JORGE-APPROVED). Conservative by construction — if we can't prove it's additive,
// it's protected.
const isMigrationFile = (f) => /\.sql$/i.test(f) || /(^|\/)migrations\//i.test(f);
// Dangerous DML/DDL statement forms (precise, so a `BEFORE UPDATE` trigger or `ON DELETE CASCADE` FK clause
// does NOT trip — only real ALTER/DROP/DELETE-FROM/TRUNCATE/UPDATE-SET statements).
const MIG_FORBIDDEN = [
  /\balter\s+table\b/i,
  /\bdrop\s+(table|schema|index|type|view|materialized|sequence|function|trigger|column|constraint|database|policy)\b/i,
  /\bdelete\s+from\b/i,
  /\btruncate\b/i,
  /\bupdate\s+[\w".]+\s+set\b/i,
];
// Financial/accounting markers — substring match (conservative: over-protect anything money-adjacent, incl.
// payment_terms / invoices / bills tables that the word-boundary form would miss).
const MIG_FINANCIAL_RE = /accounting\.|banking\.|driver_finance\.|payment|invoice|\bbill|ledger|journal|posting|settlement|escrow|\btax\b|\bgl_|\bap_|\bar_/i;
const normTable = (t) => String(t).replace(/["']/g, "").toLowerCase();
/** Decide whether a changed migration's diff is provably additive-new-table-only. Returns {additive, reason}. */
export function analyzeMigrationSql(diffText) {
  // Only the ADDED lines (a new migration file is all-added; a touched one is judged by what it introduces).
  const added = String(diffText || "")
    .split("\n")
    .filter((l) => l.startsWith("+") && !l.startsWith("+++"))
    .map((l) => l.slice(1))
    .join("\n");
  const sql = added.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " "); // strip comments
  if (!/\bcreate\s+table\b/i.test(sql)) return { additive: false, reason: "no CREATE TABLE (not additive-new-table)" };
  for (const re of MIG_FORBIDDEN) if (re.test(sql)) return { additive: false, reason: `forbidden op ${re}` };
  if (MIG_FINANCIAL_RE.test(sql)) return { additive: false, reason: "references a financial/accounting table" };
  const created = new Set();
  for (const m of sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?["']?([a-z0-9_."]+)["']?/gi)) created.add(normTable(m[1]));
  for (const m of sql.matchAll(/insert\s+into\s+["']?([a-z0-9_."]+)["']?/gi)) {
    if (!created.has(normTable(m[1]))) return { additive: false, reason: `INSERT INTO non-new table ${m[1]}` };
  }
  return { additive: true, reason: "additive new-table only" };
}

// Backend GL-writing surfaces: a changed .ts here is protected ONLY when its diff shows GL-write markers
// (so benign accounting UI/route edits stay neutral, per Jorge's "accounting/**/*.ts that write the GL").
// Content-based detectors (GL markers, flag-flip) scan diff TEXT, so they false-positive on files that
// merely *mention* flags/GL in fixtures, tests, or prose. Exclude those from content scans — the
// always-protected path globs (real migrations / *.sql / *posting* tooling) still catch the real thing.
const CONTENT_SCAN_EXCLUDE = [
  /^scripts\/verify-hold-merge-gate\.mjs$/, // this gate's own fixtures look like flips/GL writes
  /\.md$/,
  /(\.test\.|\.spec\.)/,
  /(^|\/)__tests__\//,
];
const isExcludedFromContentScan = (f) => CONTENT_SCAN_EXCLUDE.some((re) => re.test(f));

const GL_CONTENT_PATH_RE = /(apps\/backend\/src\/accounting\/|apps\/backend\/src\/driver-finance\/).*\.ts$/;
const GL_WRITE_MARKERS = [
  /INSERT\s+INTO\s+accounting\.journal/i,
  /journal_entry_postings/i,
  /journal_entries/i,
  /postJournalEntry|insertJournalEntry|createJournalEntry|buildBalancedJe|postBalancedJe/i,
  /payment_applications/i,
];

// A flag flip to ON: an added line turning a *_ENABLED / *_FLAG / FEATURE_* to a truthy on-value.
const FLAG_FLIP_RE = /^\+(?!\+).*(?:[A-Z][A-Z0-9_]*_ENABLED|[A-Z][A-Z0-9_]*_FLAG|FEATURE_[A-Z0-9_]+)\b[^\n]*(?:=|:|\bset\b|\(['"]).*\b(?:true|on|enabled|1)\b/i;

function globToRegExp(glob) {
  // minimal glob -> regex: ** => any (incl /), * => any non-slash, escape the rest.
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*") {
      if (glob[i + 1] === "*") { re += ".*"; i++; if (glob[i + 1] === "/") i++; }
      else re += "[^/]*";
    } else if ("\\^$+?.()|{}[]".includes(c)) { re += "\\" + c; }
    else re += c;
  }
  return new RegExp("^" + re + "$");
}
const PROTECTED_GLOB_RES = PROTECTED_GLOBS.map(globToRegExp);

/**
 * Pure decision function — fully unit-testable (see --self-test). No I/O.
 * @param {{title:string, labels:string[], changedFiles:string[], diffByFile:Record<string,string>}} input
 */
export function classify(input) {
  const title = input.title || "";
  const labels = (input.labels || []).map((l) => String(l).toUpperCase());
  const changedFiles = input.changedFiles || [];
  const diffByFile = input.diffByFile || {};
  const reasons = [];

  if (HOLD_TITLE_RE.test(title)) reasons.push("title contains [HOLD-FOR-JORGE]");

  for (const f of changedFiles) {
    if (PROTECTED_GLOB_RES.some((re) => re.test(f))) reasons.push(`protected path: ${f}`);
  }

  // Migrations: neutral ONLY if provably additive-new-table; ALTER / financial / DML-into-existing → protected.
  for (const f of changedFiles) {
    if (!isMigrationFile(f)) continue;
    const res = analyzeMigrationSql(diffByFile[f] || "");
    if (!res.additive) reasons.push(`migration not additive-new-table (${f}): ${res.reason}`);
  }

  for (const f of changedFiles) {
    if (isExcludedFromContentScan(f)) continue;
    if (GL_CONTENT_PATH_RE.test(f)) {
      const d = diffByFile[f] || "";
      if (GL_WRITE_MARKERS.some((re) => re.test(d))) reasons.push(`GL-write diff in: ${f}`);
    }
  }

  for (const f of changedFiles) {
    if (isExcludedFromContentScan(f)) continue;
    const d = diffByFile[f] || "";
    for (const line of d.split("\n")) {
      if (FLAG_FLIP_RE.test(line)) { reasons.push(`flag flip ON in ${f}: ${line.trim().slice(0, 80)}`); break; }
    }
  }

  const protectedPr = reasons.length > 0;
  const approved = labels.includes(APPROVE_LABEL);
  let verdict;
  if (!protectedPr) verdict = "pass-neutral";
  else if (approved) verdict = "pass-approved";
  else verdict = "fail";
  return { protected: protectedPr, approved, reasons, verdict };
}

// ---- I/O helpers (only used in gate mode) ----
function sh(cmd) { try { return execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }); } catch { return ""; } }

function gatherFromGit() {
  const base = (process.env.GATE_BASE_SHA || "origin/main").trim();
  const head = (process.env.GATE_HEAD_SHA || "HEAD").trim();
  let range = `${base}...${head}`;
  let names = sh(`git diff --name-only ${range}`).trim();
  if (!names) { range = `${base} ${head}`; names = sh(`git diff --name-only ${range}`).trim(); }
  const changedFiles = names ? names.split("\n").filter(Boolean) : [];
  const diffByFile = {};
  for (const f of changedFiles) diffByFile[f] = sh(`git diff ${range} -- "${f}"`);
  return { changedFiles, diffByFile };
}

function parseLabels(raw) {
  if (!raw) return [];
  try { const j = JSON.parse(raw); if (Array.isArray(j)) return j.map((x) => (typeof x === "string" ? x : x?.name)).filter(Boolean); } catch { /* fall through */ }
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

// ---- self-test (acceptance: every behavior covered by the script itself) ----
function selfTest() {
  const cases = [
    { name: "HOLD title, no label -> fail", in: { title: "[HOLD-FOR-JORGE — TIER 1] X", labels: [], changedFiles: ["docs/blocks/HOLD-01.md"], diffByFile: {} }, want: "fail" },
    { name: "HOLD title + JORGE-APPROVED -> pass", in: { title: "[HOLD-FOR-JORGE] X", labels: ["JORGE-APPROVED"], changedFiles: ["docs/x.md"], diffByFile: {} }, want: "pass-approved" },
    { name: "migration path, no label -> fail", in: { title: "feat: thing", labels: [], changedFiles: ["db/migrations/0500_x.sql"], diffByFile: {} }, want: "fail" },
    { name: "nested migrations path -> fail", in: { title: "x", labels: [], changedFiles: ["apps/backend/migrations/9.ts"], diffByFile: {} }, want: "fail" },
    { name: "posting tooling -> fail", in: { title: "x", labels: [], changedFiles: ["apps/backend/src/accounting/posting-engine.service.ts"], diffByFile: {} }, want: "fail" },
    { name: "accounting .ts WITHOUT GL markers -> neutral", in: { title: "x", labels: [], changedFiles: ["apps/backend/src/accounting/ar-aging.service.ts"], diffByFile: { "apps/backend/src/accounting/ar-aging.service.ts": "+ const x = 1;" } }, want: "pass-neutral" },
    { name: "accounting .ts WITH GL write -> fail", in: { title: "x", labels: [], changedFiles: ["apps/backend/src/accounting/bills.service.ts"], diffByFile: { "apps/backend/src/accounting/bills.service.ts": "+ await client.query('INSERT INTO accounting.journal_entries ...')" } }, want: "fail" },
    { name: "flag flip ON -> fail", in: { title: "x", labels: [], changedFiles: ["apps/backend/src/accounting/expenses.routes.ts"], diffByFile: { "apps/backend/src/accounting/expenses.routes.ts": "-  EXPENSE_GL_POSTING_ENABLED = false\n+  EXPENSE_GL_POSTING_ENABLED = true" } }, want: "fail" },
    { name: "flag flip ON, but JORGE-APPROVED -> pass", in: { title: "x", labels: ["JORGE-APPROVED"], changedFiles: ["a.ts"], diffByFile: { "a.ts": "+ FEATURE_VOID_ENABLED = 'on'" } }, want: "pass-approved" },
    { name: "plain frontend PR -> neutral", in: { title: "feat(ux): table", labels: [], changedFiles: ["apps/frontend/src/pages/Vendors.tsx"], diffByFile: { "apps/frontend/src/pages/Vendors.tsx": "+ <div/>" } }, want: "pass-neutral" },
    { name: "label case-insensitive -> pass", in: { title: "[hold-for-jorge] x", labels: ["jorge-approved"], changedFiles: [], diffByFile: {} }, want: "pass-approved" },
    { name: "the gate script's own fixtures do NOT self-trip -> neutral", in: { title: "fix(ci): gate", labels: [], changedFiles: ["scripts/verify-hold-merge-gate.mjs"], diffByFile: { "scripts/verify-hold-merge-gate.mjs": "+ EXPENSE_GL_POSTING_ENABLED = true\n+ INSERT INTO accounting.journal_entries" } }, want: "pass-neutral" },
    { name: "a test file mentioning a flag flip -> neutral", in: { title: "test: x", labels: [], changedFiles: ["apps/backend/src/accounting/bills.service.test.ts"], diffByFile: { "apps/backend/src/accounting/bills.service.test.ts": "+ FOO_ENABLED = true\n+ journal_entries" } }, want: "pass-neutral" },
    { name: "a .md mentioning flags -> neutral", in: { title: "docs", labels: [], changedFiles: ["docs/x.md"], diffByFile: { "docs/x.md": "+ FEATURE_VOID_ENABLED = on; INSERT INTO accounting.journal_entries" } }, want: "pass-neutral" },
    // --- migration: CREATE-TABLE-only neutral (Jorge-approved 2026-06-20) ---
    { name: "additive new catalog table -> neutral", in: { title: "feat(catalog): trailer types", labels: [], changedFiles: ["db/migrations/0500_trailer_types.sql"], diffByFile: { "db/migrations/0500_trailer_types.sql": "+CREATE TABLE IF NOT EXISTS catalogs.trailer_types (\n+  id uuid PRIMARY KEY,\n+  code text NOT NULL,\n+  display_name text NOT NULL\n+);\n+GRANT SELECT, INSERT, UPDATE, DELETE ON catalogs.trailer_types TO ih35_app;" } }, want: "pass-neutral" },
    { name: "additive new table + seed OWN table -> neutral", in: { title: "x", labels: [], changedFiles: ["db/migrations/0501_cargo_types.sql"], diffByFile: { "db/migrations/0501_cargo_types.sql": "+CREATE TABLE catalogs.cargo_types (id uuid, code text);\n+INSERT INTO catalogs.cargo_types (id, code) VALUES (gen_random_uuid(), 'DRY');" } }, want: "pass-neutral" },
    { name: "additive new table + updated_at trigger (BEFORE UPDATE) -> neutral", in: { title: "x", labels: [], changedFiles: ["db/migrations/0507_svc.sql"], diffByFile: { "db/migrations/0507_svc.sql": "+CREATE TABLE catalogs.svc (id uuid, updated_at timestamptz);\n+CREATE TRIGGER t BEFORE UPDATE ON catalogs.svc FOR EACH ROW EXECUTE FUNCTION touch();" } }, want: "pass-neutral" },
    { name: "migration with ALTER existing -> fail", in: { title: "x", labels: [], changedFiles: ["db/migrations/0502_x.sql"], diffByFile: { "db/migrations/0502_x.sql": "+CREATE TABLE catalogs.foo (id uuid);\n+ALTER TABLE catalogs.existing ADD COLUMN y text;" } }, want: "fail" },
    { name: "migration INSERT into EXISTING table -> fail", in: { title: "x", labels: [], changedFiles: ["db/migrations/0503_x.sql"], diffByFile: { "db/migrations/0503_x.sql": "+CREATE TABLE catalogs.foo (id uuid);\n+INSERT INTO catalogs.other_existing (id) VALUES (1);" } }, want: "fail" },
    { name: "migration creating a FINANCIAL table -> fail", in: { title: "x", labels: [], changedFiles: ["db/migrations/0504_x.sql"], diffByFile: { "db/migrations/0504_x.sql": "+CREATE TABLE accounting.new_journal (id uuid);" } }, want: "fail" },
    { name: "financial catalog (payment_terms) table -> fail", in: { title: "x", labels: [], changedFiles: ["db/migrations/0508_x.sql"], diffByFile: { "db/migrations/0508_x.sql": "+CREATE TABLE catalogs.payment_terms (id uuid, code text);" } }, want: "fail" },
    { name: "migration with DROP -> fail", in: { title: "x", labels: [], changedFiles: ["db/migrations/0505_x.sql"], diffByFile: { "db/migrations/0505_x.sql": "+CREATE TABLE catalogs.foo (id uuid);\n+DROP TABLE catalogs.old;" } }, want: "fail" },
    { name: "migration with NO create table (index only) -> fail (conservative)", in: { title: "x", labels: [], changedFiles: ["db/migrations/0506_x.sql"], diffByFile: { "db/migrations/0506_x.sql": "+CREATE INDEX idx ON catalogs.existing (code);" } }, want: "fail" },
    { name: "additive new table BUT title is HOLD -> fail (title still wins)", in: { title: "[HOLD-FOR-JORGE] x", labels: [], changedFiles: ["db/migrations/0509_x.sql"], diffByFile: { "db/migrations/0509_x.sql": "+CREATE TABLE catalogs.bar (id uuid);" } }, want: "fail" },
  ];
  let failed = 0;
  for (const c of cases) {
    const got = classify(c.in).verdict;
    const ok = got === c.want;
    if (!ok) failed++;
    console.log(`${ok ? "ok  " : "FAIL"}  ${c.name}  (got ${got}, want ${c.want})`);
  }
  if (failed) { console.error(`\nself-test FAILED: ${failed}/${cases.length} cases`); process.exit(1); }
  console.log(`\nself-test PASS: ${cases.length}/${cases.length}`);
}

function main() {
  if (process.argv.includes("--self-test")) { selfTest(); return; }
  // Always run the self-test first so the gate's own logic is locked on every CI run.
  selfTest();

  const title = process.env.GATE_PR_TITLE || "";
  const labels = parseLabels(process.env.GATE_PR_LABELS || "");
  const { changedFiles, diffByFile } = gatherFromGit();
  const result = classify({ title, labels, changedFiles, diffByFile });

  console.log("\n=== HOLD-MERGE-GATE ===");
  console.log(`title:    ${title || "(none)"}`);
  console.log(`labels:   ${labels.join(", ") || "(none)"}`);
  console.log(`changed:  ${changedFiles.length} file(s)`);
  console.log(`protected: ${result.protected}  approved: ${result.approved}`);
  if (result.reasons.length) result.reasons.forEach((r) => console.log(`  • ${r}`));

  if (result.verdict === "fail") {
    console.error(`\nFAIL hold-merge-gate: this PR is PROTECTED (HOLD / financial / posting / migration / flag-flip) and is NOT labelled "${APPROVE_LABEL}".`);
    console.error("Only Jorge applies that label, by hand, after his Tier-1 ceremony — never a script/token in an unattended run.");
    process.exit(1);
  }
  console.log(`\nPASS hold-merge-gate (${result.verdict}).`);
}

main();
