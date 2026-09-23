#!/usr/bin/env node
// PROTECT-LIST GUARD (owner, P0) — USMCA master/reference data is real, live, and catastrophic to
// lose (geofences, customer/vendor/driver/account/item rosters, the entire banking transaction
// feed). Two independent checks, both required:
//   (1) STATIC — no DELETE statement in db/migrations/** or scripts/ops/** may name any protected
//       schema/table.
//   (2) LIVE — every protected table's row count, scoped to USMCA, must never drop below its
//       measured floor. banking.bank_transactions is EXACT (this session made no INSERT/DELETE
//       against it, only UPDATEs releasing dead-load references — any drift up or down is wrong).
// Floors RISE only, by hand, as the feed adds real records — never auto-generated, never lowered.
// No --write-baseline flag exists on purpose: a floor is a deliberate, reviewed edit to this file,
// not a number a script gets to pick for itself.
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-master-data-protected";
const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";

// table -> { floor, exact } — exact:true means the count must equal floor precisely, never rise
// or fall; exact:false (default) means the count must be >= floor (the feed can only add rows).
const FLOORS = {
  "banking.bank_transactions": { floor: 1133, exact: true },
  "geo.geofences": { floor: 611 },
  "mdata.locations": { floor: 621 },
  "mdata.customers": { floor: 1239 },
  "mdata.vendors": { floor: 623 },
  "catalogs.accounts": { floor: 193 },
  "mdata.drivers": { floor: 167 },
  "catalogs.items": { floor: 148 },
};

// Schema/table patterns a DELETE must never name, in db/migrations/** or scripts/ops/**. Broader
// than FLOORS on purpose — org.companies/identity.users have no row-count floor here (they are not
// "grows over time" reference data the same way) but are exactly as catastrophic to lose a row from.
const FORBIDDEN_DELETE_PATTERNS = [
  /\bgeo\./i,
  /\bmdata\.locations\b/i,
  /\bmdata\.location_contacts\b/i,
  /\bcatalogs\./i,
  /\bbanking\.bank_transactions\b/i,
  /\bbanking\.bank_accounts\b/i,
  /\bbanking\.transaction_categories\b/i,
  /\borg\.companies\b/i,
  /\bidentity\.users\b/i,
  /\bmdata\.customers\b/i,
  /\bmdata\.vendors\b/i,
  /\bmdata\.drivers\b/i,
  /\bmdata\.units\b/i,
];

const SCAN_DIRS = ["db/migrations", "scripts/ops"];
const SCAN_EXTENSIONS = new Set([".sql", ".mjs", ".ts", ".js"]);

const fail = (m) => {
  console.error(`\n${LABEL}: FAIL — ${m}\n`);
  process.exit(1);
};
const ok = (m) => console.log(`${LABEL}: ${m}`);

// A destructive statement is any line containing "DELETE FROM" or "TRUNCATE" (case-insensitive,
// TRUNCATE with or without the optional TABLE keyword) immediately followed by the schema.table
// name on the SAME line — never a multi-line window, which over-matches a DELETE FROM some_other_
// table WHERE x IN (SELECT id FROM catalogs.accounts) as if it deleted FROM catalogs.accounts.
// Comment lines (SQL `--`, JS/TS `//`) and REVOKE/GRANT statements (which legitimately list
// DELETE/TRUNCATE as PRIVILEGE NAMES, not as an executed statement) are excluded before matching.
const DELETE_FROM_RE = /\b(?:DELETE\s+FROM|TRUNCATE(?:\s+TABLE)?)\s+([A-Za-z_][\w]*\.[A-Za-z_][\w]*)/i;
const REVOKE_GRANT_RE = /^\s*(REVOKE|GRANT)\b/i;

function stripCommentLines(source) {
  return source.split("\n").map((line) => {
    const trimmed = line.trim();
    if (trimmed.startsWith("--") || trimmed.startsWith("//") || trimmed.startsWith("*")) return "";
    return line;
  });
}

// Diff-scoped, matching every other guard in this repo's own convention: a historical, already-
// applied migration or an already-live ops script (e.g. the pre-existing lane_mileage recompute
// scripts, which legitimately DELETE+re-INSERT a non-master-reference cache table under
// catalogs.lane_mileage) is not re-flagged forever just for existing — only a NEWLY ADDED line in
// the current branch's own diff is checked. A guard that fails on the whole historical tree would
// be permanently red for every push in the repo, which is not what "never one PR per page" protects.
function addedLinesUnderScanDirs() {
  const res = spawnSync("git", ["diff", "--unified=0", "--no-color", `origin/main...HEAD`, "--", ...SCAN_DIRS], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  if ((res.status ?? 1) !== 0 && !res.stdout) return null; // cannot diff — caller fails closed
  const out = [];
  let currentFile = null;
  for (const line of (res.stdout || "").split("\n")) {
    if (line.startsWith("+++ b/")) {
      currentFile = line.slice(6);
      continue;
    }
    if (line.startsWith("+++ /dev/null")) {
      currentFile = null;
      continue;
    }
    if (currentFile && line.startsWith("+") && !line.startsWith("+++")) {
      out.push({ file: currentFile, text: line.slice(1) });
    }
  }
  return out;
}

function checkStaticNoForbiddenDeletes() {
  const added = addedLinesUnderScanDirs();
  if (added === null) {
    fail(`could not diff against origin/main. A guard that cannot see the diff must never pass.`);
  }
  const violations = [];
  // Group added lines back per-file so comment-stripping applies per real source file, not per
  // isolated diff hunk (a `--` continuation can't be seen one line at a time).
  const byFile = new Map();
  for (const { file, text } of added) {
    if (!byFile.has(file)) byFile.set(file, []);
    byFile.get(file).push(text);
  }
  for (const [file, lines] of byFile) {
    const cleaned = stripCommentLines(lines.join("\n"));
    for (let i = 0; i < cleaned.length; i++) {
      const line = cleaned[i];
      if (REVOKE_GRANT_RE.test(line)) continue;
      const m = DELETE_FROM_RE.exec(line);
      if (!m) continue;
      const tableRef = m[1];
      const hit = FORBIDDEN_DELETE_PATTERNS.find((re) => re.test(tableRef));
      if (hit) {
        violations.push(`${file} (new line) — ${m[0].trim()} matches ${hit} : ${line.trim()}`);
      }
    }
  }
  if (violations.length) {
    fail(
      `${violations.length} forbidden DELETE/TRUNCATE statement(s) newly added against protected master/reference data:\n` +
        violations.map((v) => `    ${v}`).join("\n"),
    );
  }
  ok(`static scan PASS — no new DELETE/TRUNCATE against protected schemas/tables in ${SCAN_DIRS.join(", ")}`);
}

async function checkLiveFloors() {
  const { client, pool } = await requireLiveDbOrExit({ label: LABEL });
  try {
    // `set_config(..., true)` is LOCAL to the current transaction. The pooled endpoint
    // (DATABASE_URL's "-pooler" host, PgBouncer transaction-mode) does not guarantee separate
    // statements land on the same physical backend outside an explicit transaction — confirmed
    // live: without BEGIN/COMMIT, every count came back 0 even for tables known to be at their
    // real floor (same root cause the Neon MCP's own run_sql_transaction tool exists to avoid).
    // READ ONLY makes the "this guard never writes" contract explicit, not just implicit.
    await client.query(`BEGIN`);
    await client.query(`SET TRANSACTION READ ONLY`);
    await client.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);
    const violations = [];
    const measured = [];
    for (const [table, { floor, exact }] of Object.entries(FLOORS)) {
      const { rows } = await client.query(
        `SELECT count(*)::int AS n FROM ${table} WHERE operating_company_id = $1::uuid`,
        [USMCA_COMPANY_ID],
      );
      const n = rows[0]?.n ?? 0;
      measured.push(`${table}=${n}`);
      if (exact ? n !== floor : n < floor) {
        violations.push(
          `${table}: expected ${exact ? "exactly" : "at least"} ${floor}, measured ${n} ` +
            `(${n < floor ? "DROPPED" : "drifted"} by ${Math.abs(n - floor)})`,
        );
      }
    }
    await client.query(`COMMIT`);
    if (violations.length) {
      fail(`${violations.length} table(s) below their protected floor:\n` + violations.map((v) => `    ${v}`).join("\n"));
    }
    ok(`live floors PASS — ${measured.join(", ")}`);
  } finally {
    client.release();
    await pool.end();
  }
}

if (process.argv.includes("--selftest")) {
  // Static self-check: every FORBIDDEN_DELETE_PATTERNS entry actually matches a real DELETE (and a
  // real TRUNCATE) naming the table it protects, and a harmless SELECT never matches.
  const REAL_SAMPLES = [
    "DELETE FROM geo.geofences WHERE id = $1",
    "DELETE FROM mdata.locations WHERE id = $1",
    "DELETE FROM mdata.location_contacts WHERE id = $1",
    "DELETE FROM catalogs.accounts WHERE id = $1",
    "DELETE FROM banking.bank_transactions WHERE id = $1",
    "DELETE FROM banking.bank_accounts WHERE id = $1",
    "DELETE FROM banking.transaction_categories WHERE id = $1",
    "DELETE FROM org.companies WHERE id = $1",
    "DELETE FROM identity.users WHERE id = $1",
    "DELETE FROM mdata.customers WHERE id = $1",
    "DELETE FROM mdata.vendors WHERE id = $1",
    "DELETE FROM mdata.drivers WHERE id = $1",
    "DELETE FROM mdata.units WHERE id = $1",
    "TRUNCATE TABLE geo.geofences",
    "TRUNCATE mdata.customers",
  ];
  let realPassed = 0;
  for (const sample of REAL_SAMPLES) {
    if (FORBIDDEN_DELETE_PATTERNS.some((re) => re.test(sample))) realPassed++;
    else console.error(`${LABEL} SELFTEST FAIL — no pattern matched: ${sample}`);
  }
  if (realPassed !== REAL_SAMPLES.length) {
    console.error(`${LABEL} SELFTEST FAIL — ${realPassed}/${REAL_SAMPLES.length} real DELETE samples matched`);
    process.exit(1);
  }
  const harmless = "SELECT * FROM geo.geofences WHERE id = $1";
  if (DELETE_FROM_RE.test(harmless)) {
    console.error(`${LABEL} SELFTEST FAIL — a harmless SELECT was treated as a DELETE`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — ${realPassed}/${REAL_SAMPLES.length} real DELETE samples caught, 0 false positives on SELECT`);
  process.exit(0);
}

checkStaticNoForbiddenDeletes();
await checkLiveFloors();
ok("PASS — static DELETE scan clean, all protected tables at or above their floor.");
