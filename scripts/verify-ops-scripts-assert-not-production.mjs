#!/usr/bin/env node
/**
 * GUARD — ROUND 293 P0 (owner-ordered, every seat, ahead of all other work).
 *
 * THE INCIDENT THIS EXISTS FOR: a rehearsal script on 2026-09-30 reused a stale connection string
 * instead of fetching its intended Neon rehearsal branch's own, and called voidDocument against
 * PRODUCTION on a real, funded factoring advance (FAC-2026-00001). No harm resulted only because
 * the destructive stamp lives one function-call layer above where the script actually touched --
 * luck, not a control. The Lead's ruling: "I verified afterwards that nothing was damaged is not a
 * control... the control runs BEFORE the write," enforced as a real assertion, not a naming
 * convention or a comment.
 *
 * WHAT THIS GUARD CHECKS: every ops script under scripts/ops/**, and any script anywhere under
 * scripts/ whose filename contains "rehearsal" or "test" (case-insensitive), that performs a
 * write (a raw SQL INSERT/UPDATE/DELETE, or a call to a known mutating engine function) must call
 * assertNotProduction(...) or assertIsIntendedProduction(...) (scripts/lib/assert-not-production.mjs)
 * TEXTUALLY BEFORE its first such write, in file source order.
 *
 * HONEST LIMITATION, stated plainly per this repo's own house rule for guards that approximate:
 * this is a textual-order check, not real control-flow analysis. It does not prove the assertion
 * runs on every code path before every write (an early return, a conditional, or a call ordering
 * that differs from lexical order at runtime could defeat it) -- it proves the assertion call is
 * PRESENT and appears before the first write occurrence in the file's own text. That is a large,
 * real improvement over "nothing checks this at all" (today's actual state), and it is exactly the
 * class of check this repo's other static guards already rely on (see e.g.
 * verify-no-write-to-generated-column.mjs) -- but it is not a substitute for a human reading the
 * script's actual control flow when the stakes are this high.
 *
 * Run:  node scripts/verify-ops-scripts-assert-not-production.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-ops-scripts-assert-not-production";
const ASSERT_MODULE_BASENAME = "assert-not-production";

// Files that are exempt: the assertion module itself, this guard, and any file that only READS
// (a DRY_RUN-only or pure-report script never reaches this guard's write markers at all, so it
// naturally passes without needing the call -- exemption by content, not by name).
const SELF_FILES = new Set([
  "scripts/lib/assert-not-production.mjs",
  "scripts/verify-ops-scripts-assert-not-production.mjs",
]);

export function stripComments(src) {
  return src.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
}

// The import line itself mentions both identifiers by name but is not a USE of either -- strip it
// before searching for the assertion call, or a file that merely imports the function (and never
// calls it) would incorrectly pass.
function stripAssertImportLine(src) {
  return src.replace(/^import\s*\{[^}]*\}\s*from\s*["'][^"']*assert-not-production\.mjs["'];?\s*$/gm, "");
}

// Raw-SQL write keywords, matched as the start of a SQL statement inside a template string / query
// call -- deliberately broad (case-insensitive, word-boundary) since ops scripts build SQL as
// plain strings, not through a query builder.
const SQL_WRITE_RE = /\b(INSERT\s+INTO|UPDATE\s+\w|DELETE\s+FROM)/i;

// Known mutating engine functions this session's ops scripts actually call. Add to this list as
// new mutating engines are introduced -- do NOT remove an entry to make a script pass.
const MUTATING_FUNCTIONS = [
  "voidDocument",
  "reinstateDocument",
  "reinstateDocumentThenVoidReversal",
  "postFactoringAdvanceEventInClientTx",
  "postSourceTransactionInClientTx",
  "reversePostedSourceTransactionInClientTx",
  "reverseJournalEntryNoFlip",
  "reverseFactoringAdvanceEventInClientTx",
  "createExpenseFromFuelTransaction",
  "createBill",
  "postBillGlIfEnabled",
  "updateDispatchLoad",
  "createLoadWithFullSideEffects",
  "sendDraftInvoice",
  "postInvoiceGlIfEnabled",
  "postVoidReversal",
  "createDriverBillArtifacts",
];

// Matches either a direct call `assertNotProduction(` or a reference used in a conditional-call
// shape like `(cond ? assertIsIntendedProduction : assertNotProduction)(client, ...)` -- both are
// real uses of the assertion; requiring an immediately-following "(" would miss the second, valid
// shape (this session's own retrofit uses exactly that pattern to pick prod-vs-rehearsal at
// runtime from OWNER_AUTH_ID).
const ASSERT_CALL_RE = /\b(assertNotProduction|assertIsIntendedProduction)\b/;

/**
 * Returns { hasWrite, writeIdx, assertIdx } -- character indices of the FIRST write marker and
 * FIRST assertion call in the (comment-stripped) source, or -1 if absent.
 */
export function analyze(src) {
  const clean = stripAssertImportLine(stripComments(src));

  let writeIdx = -1;
  const sqlMatch = SQL_WRITE_RE.exec(clean);
  if (sqlMatch) writeIdx = sqlMatch.index;

  for (const fn of MUTATING_FUNCTIONS) {
    const re = new RegExp(`\\b${fn}\\s*\\(`);
    const m = re.exec(clean);
    if (m && (writeIdx === -1 || m.index < writeIdx)) writeIdx = m.index;
  }

  const assertMatch = ASSERT_CALL_RE.exec(clean);
  const assertIdx = assertMatch ? assertMatch.index : -1;

  return { hasWrite: writeIdx !== -1, writeIdx, assertIdx };
}

/**
 * A file is a violation iff it has a write AND (no assertion call at all, OR the assertion call
 * appears at or after the first write in file order).
 */
export function isViolation(src) {
  const { hasWrite, writeIdx, assertIdx } = analyze(src);
  if (!hasWrite) return false;
  if (assertIdx === -1) return true;
  return assertIdx > writeIdx;
}

function shouldCheck(relPath) {
  if (SELF_FILES.has(relPath)) return false;
  if (relPath.startsWith("scripts/ops/") && relPath.endsWith(".ts")) return true;
  const base = path.basename(relPath).toLowerCase();
  if (relPath.startsWith("scripts/") && /rehearsal|test/i.test(base) && (base.endsWith(".ts") || base.endsWith(".mjs"))) return true;
  return false;
}

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== "node_modules") walk(p, out);
    } else {
      out.push(p);
    }
  }
  return out;
}

export function collectProblems(sources) {
  const problems = [];
  for (const { file, src } of sources) {
    if (isViolation(src)) {
      const { writeIdx, assertIdx } = analyze(src);
      const lineOf = (idx) => src.slice(0, idx).split("\n").length;
      problems.push(
        `${file}: performs a write at line ~${lineOf(writeIdx)} without assertNotProduction()/` +
          `assertIsIntendedProduction() appearing before it` +
          (assertIdx === -1
            ? " (the assertion is not called anywhere in this file)."
            : ` (the assertion IS present, at line ~${lineOf(assertIdx)}, but that is AFTER the first write).`) +
          " Call scripts/lib/assert-not-production.mjs's assertNotProduction(client) (rehearsal) " +
          "or assertIsIntendedProduction(client) (a real AUTH-gated prod run) immediately after " +
          "opening the connection, before this or any earlier write."
      );
    }
  }
  return problems;
}

if (process.argv.includes("--selftest")) {
  const failures = [];

  const violationSql = `
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    const client = await pool.connect();
    await client.query("UPDATE accounting.expenses SET voided_at = now() WHERE id = $1", [id]);
  `;
  if (!isViolation(violationSql)) failures.push("a write with NO assertion call anywhere was not flagged");

  const violationAfter = `
    const client = await pool.connect();
    await client.query("UPDATE accounting.expenses SET voided_at = now() WHERE id = $1", [id]);
    await assertNotProduction(client);
  `;
  if (!isViolation(violationAfter)) failures.push("a write BEFORE the assertion call was not flagged");

  const goodRehearsal = `
    const client = await pool.connect();
    await assertNotProduction(client, { label: "my-script" });
    await client.query("UPDATE accounting.expenses SET voided_at = now() WHERE id = $1", [id]);
  `;
  if (isViolation(goodRehearsal)) failures.push("a write correctly AFTER assertNotProduction was flagged");

  const goodProd = `
    const client = await pool.connect();
    await assertIsIntendedProduction(client, { label: "auth-999" });
    await voidDocument(client, { type: "expense", id });
  `;
  if (isViolation(goodProd)) failures.push("assertIsIntendedProduction before a mutating-function write was flagged");

  const goodFunctionCall = `
    const client = await pool.connect();
    await assertNotProduction(client);
    await postFactoringAdvanceEventInClientTx(client, input);
  `;
  if (isViolation(goodFunctionCall)) failures.push("a mutating-function-only write, correctly guarded, was flagged");

  const violationFunctionCall = `
    const client = await pool.connect();
    await reinstateDocument(client, input);
  `;
  if (!isViolation(violationFunctionCall)) failures.push("a mutating-function write with no assertion was not flagged");

  const readOnly = `
    const client = await pool.connect();
    const res = await client.query("SELECT id FROM accounting.expenses WHERE voided_at IS NULL");
    console.log(res.rows);
  `;
  if (isViolation(readOnly)) failures.push("a pure SELECT with no write was flagged");

  const commentedOut = `
    const client = await pool.connect();
    // await client.query("UPDATE accounting.expenses SET voided_at = now() WHERE id = $1", [id]);
    await client.query("SELECT 1");
  `;
  if (isViolation(commentedOut)) failures.push("a write inside a comment was flagged as a real write");

  if (collectProblems([{ file: "x.ts", src: violationSql }]).length !== 1) {
    failures.push("collectProblems did not surface the unguarded write");
  }

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const f of failures) console.error("  - " + f);
    process.exit(1);
  }
  console.log(
    `${LABEL} SELFTEST OK — 8/8 (no assertion anywhere caught, assertion-after-write caught, ` +
      `assertNotProduction-then-write passes, assertIsIntendedProduction-then-mutating-fn passes, ` +
      `mutating-function-only guarded case passes, mutating-function-only unguarded caught, ` +
      `read-only script passes, commented-out write ignored, end-to-end)`
  );
  process.exit(0);
}

// SHRINK-ONLY BASELINE, same discipline as this repo's other new-guard-vs-large-backlog cases
// (e.g. verify-fuel-cost-posts-exactly-once.mjs check D). This guard is introduced 2026-09-30
// against a repo that already has ~125 pre-existing ops/test scripts writing without this control.
// Failing CI on the entire historical backlog on day one would either get the guard reverted or
// --no-verify'd around -- neither closes the real gap. Every script actually touched THIS SESSION
// (the AUTH-14x through AUTH-16x scripts named in the ROUND 293 P0 order) is retrofitted with the
// real call, not baselined. The baseline may only SHRINK (a file removed once retrofitted) --
// adding a file to hide a NEW violation is exactly the "baseline raise" anti-pattern this repo's
// own standing law forbids, and this guard treats a growth of the baseline set as a hard fail.
const BASELINE_PATH = path.join(root, "scripts/verify-ops-scripts-assert-not-production.baseline.json");

function loadBaseline() {
  if (!fs.existsSync(BASELINE_PATH)) return new Set();
  const doc = JSON.parse(fs.readFileSync(BASELINE_PATH, "utf8"));
  return new Set(doc.files ?? []);
}

const allFiles = walk(path.join(root, "scripts"));
const sources = allFiles
  .map((p) => path.relative(root, p))
  .filter(shouldCheck)
  .map((rel) => ({ file: rel, src: fs.readFileSync(path.join(root, rel), "utf8") }));

const problems = collectProblems(sources);
const violatingFiles = new Set(
  problems.map((p) => p.slice(0, p.indexOf(":")))
);
const baseline = loadBaseline();
const newViolations = [...violatingFiles].filter((f) => !baseline.has(f));

console.error(`${LABEL}: checked ${sources.length} file(s) under scripts/ops/** and *rehearsal*/*test* scripts.`);
console.error(`${LABEL}: ${violatingFiles.size} total unguarded write(s) (${baseline.size} pre-existing, baselined, shrink-only).`);

if (newViolations.length) {
  console.error(`${LABEL} FAIL — ${newViolations.length} NEW script(s) write without asserting the target first (not in the shrink-only baseline):`);
  for (const p of problems) {
    const file = p.slice(0, p.indexOf(":"));
    if (newViolations.includes(file)) console.error("  - " + p);
  }
  process.exit(1);
}
console.log(`${LABEL}: PASS — no new unguarded writes beyond the shrink-only baseline (${baseline.size} pre-existing, 0 new).`);
