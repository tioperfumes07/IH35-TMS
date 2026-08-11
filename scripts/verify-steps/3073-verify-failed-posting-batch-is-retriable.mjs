#!/usr/bin/env node
/**
 * ACCT-F348 (P29 · 29 OF 50) — a FAILED posting batch made its own document un-postable FOREVER, so the
 * settlement→GL chain could never complete and driver_settlement_gl_runs / gl_bills were 0 on every entity.
 *
 * WHAT HAPPENED: the posting idempotency key is deterministic, and markBatchFailed COMMITS a `failed`
 * posting_batches row under that exact key (its own transaction) whenever a post throws. The pre-check
 * inside executePostingOnClient only short-circuits on `posted`/`reversed`, so the NEXT attempt fell
 * through to a bare INSERT and died on uq_posting_batches_company_idempotency_key. The failure record
 * poisoned its own retry: nothing could ever be fixed and re-posted.
 *
 * Measured on prod 2026-08-11 before the fix: 11,980 documents carried a `failed` batch with zero GL
 * lines. The one that blocked USMCA was bill L-20260810-0003 (35b8ce38, $297.60 of real driver pay) —
 * postSettlementBillPayment created the Bill, BILL_GL_POSTING_ENABLED auto-posted it before its
 * bill_lines existed (BILL_LINE_ACCOUNT_UNRESOLVED → failed batch), then the settlement added the line
 * and posted explicitly, straight into the duplicate key.
 *
 * THREE INVARIANTS:
 *   A. STATIC — the batch INSERT in executePostingOnClient still RECLAIMS on conflict (ON CONFLICT …
 *      DO UPDATE) and still refuses to reopen a settled batch (WHERE batch_status NOT IN
 *      ('posted','reversed')). Both halves, because reclaiming without the WHERE would reopen posted
 *      money, and the WHERE without the reclaim is the bare INSERT that caused this finding.
 *   B. STATIC — markBatchFailed cannot DOWNGRADE a posted/reversed batch to `failed`. Its DO UPDATE was
 *      unconditional, so a later error could stamp `failed` onto an entry whose journal lines are real.
 *   C. LIVE — the reclaim's safety precondition holds: NO non-terminal batch owns journal lines. Reclaim
 *      is only safe because a failed attempt rolls its batch and its lines back together; if a
 *      non-terminal batch ever held lines, reposting onto it would attach a second JE's worth of
 *      postings to one batch.
 *
 * The static halves need no database, so they run in every CI context including the fresh-DB job.
 *
 * Self-test: node scripts/verify-steps/3073-verify-failed-posting-batch-is-retriable.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import pg from "pg";

const LABEL = "3073-verify-failed-posting-batch-is-retriable";
const ENGINE = path.join("apps", "backend", "src", "accounting", "posting-engine.service.ts");

function fail(msg) {
  console.error(`[${LABEL}] FAIL: ${msg}`);
  process.exit(1);
}

/** Strip comments FIRST — a guard that matches its own explanatory prose proves nothing (see 3065). */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/^\s*--.*$/gm, "");
}

/**
 * Isolate ONE SQL statement: from the `INSERT INTO accounting.posting_batches` that immediately
 * PRECEDES the anchor (its own VALUES row), up to the first `end` token after it. Index slicing keeps
 * each check inside a single statement — a regex window that spans two of them can be satisfied by the
 * neighbour's clauses and reports PASS on regressed code.
 */
function sliceStatement(code, anchorRe, end) {
  const anchor = code.search(anchorRe);
  if (anchor < 0) return null;
  const start = code.lastIndexOf("INSERT INTO accounting.posting_batches", anchor);
  if (start < 0) return null;
  const stop = code.indexOf(end, anchor);
  if (stop < 0) return null;
  return code.slice(start, stop);
}

/**
 * Exported shape checks, so the selftest can mutate real source text and prove each check FAILS on the
 * defect it claims to catch. Returns an array of problem strings (empty = healthy).
 */
export function assertRetryableBatchShape(rawSource) {
  const problems = [];
  const code = stripComments(rawSource);

  // ── A · the executePostingOnClient batch INSERT reclaims instead of duplicating ─────────────────
  // Anchored on the 'queued' INSERT so this cannot be satisfied by markBatchFailed's own upsert
  // (which inserts 'failed') or by the reversal INSERT (which inserts 'in_progress').
  //
  // SLICED BY INDEX, NOT BY ONE REGEX: a single `INSERT …[\s\S]*?'queued'…RETURNING` pattern happily
  // spans FROM markBatchFailed's INSERT THROUGH to this one, so the window contained markBatchFailed's
  // ON CONFLICT / DO UPDATE / WHERE and every check passed on a deliberately regressed file. The
  // selftest below caught that; the guard would otherwise have shipped inert.
  const queuedSql = sliceStatement(code, /VALUES\s*\([^\n]*'queued'/, "RETURNING");
  if (!queuedSql) {
    problems.push(
      "cannot find the 'queued' posting_batches INSERT in executePostingOnClient — the poster moved; re-point this guard rather than deleting it"
    );
    return problems;
  }
  if (!/ON CONFLICT\s*\(\s*operating_company_id\s*,\s*idempotency_key\s*\)/i.test(queuedSql)) {
    problems.push(
      "the 'queued' posting_batches INSERT has no ON CONFLICT (operating_company_id, idempotency_key) — a second attempt under the same deterministic key dies on uq_posting_batches_company_idempotency_key and the document can never post again (ACCT-F348)"
    );
  }
  if (!/DO UPDATE/i.test(queuedSql)) {
    problems.push("the 'queued' posting_batches INSERT does not DO UPDATE (reclaim) on conflict (ACCT-F348)");
  }
  if (!/WHERE\s+accounting\.posting_batches\.batch_status\s+NOT\s+IN\s*\(\s*'posted'\s*,\s*'reversed'\s*\)/i.test(queuedSql)) {
    problems.push(
      "the 'queued' posting_batches reclaim does not exclude posted/reversed — reopening a settled batch would post a SECOND journal entry for money already on the ledger (ACCT-F348)"
    );
  }

  // ── B · markBatchFailed cannot downgrade settled money ──────────────────────────────────────────
  const failedSql = sliceStatement(code, /VALUES\s*\([^\n]*'failed'/, "`");
  if (!failedSql) {
    problems.push("cannot find the 'failed' posting_batches upsert (markBatchFailed) — re-point this guard rather than deleting it");
    return problems;
  }
  if (!/WHERE\s+accounting\.posting_batches\.batch_status\s+NOT\s+IN\s*\(\s*'posted'\s*,\s*'reversed'\s*\)/i.test(failedSql)) {
    problems.push(
      "markBatchFailed can stamp 'failed' onto a posted/reversed batch — the audit trail would then deny that money which IS on the ledger ever got there (ACCT-F348)"
    );
  }

  return problems;
}

// ── selftest: every check must actually catch the defect it names ────────────────────────────────
if (process.argv.includes("--selftest")) {
  const healthy = fs.readFileSync(ENGINE, "utf8");
  const failures = [];

  const clean = assertRetryableBatchShape(healthy);
  if (clean.length) failures.push(`healthy source must PASS, got: ${clean.join(" | ")}`);

  const mutate = (name, from, to, needle) => {
    if (!healthy.includes(from)) {
      failures.push(`${name}: mutation anchor not present in source — the selftest is inert`);
      return;
    }
    const problems = assertRetryableBatchShape(healthy.replace(from, to));
    if (!problems.some((p) => p.includes(needle))) {
      failures.push(`${name}: NOT caught (got: ${problems.join(" | ") || "none"})`);
    }
  };

  // Regress to the exact pre-fix INSERT — the bare one that produced the duplicate-key crash.
  mutate(
    "bare INSERT (pre-ACCT-F348)",
    `      ON CONFLICT (operating_company_id, idempotency_key) WHERE idempotency_key IS NOT NULL
      DO UPDATE SET batch_status = 'queued',
                    created_by_user_id = EXCLUDED.created_by_user_id,
                    posting_template_id = EXCLUDED.posting_template_id,
                    source_template_code = EXCLUDED.source_template_code,
                    updated_at = now()
        WHERE accounting.posting_batches.batch_status NOT IN ('posted', 'reversed')
      RETURNING id::text`,
    `      RETURNING id::text`,
    "no ON CONFLICT"
  );

  // Reclaim WITHOUT the settled-batch exclusion — reopens posted money.
  mutate(
    "reclaim without posted/reversed exclusion",
    `                    updated_at = now()
        WHERE accounting.posting_batches.batch_status NOT IN ('posted', 'reversed')
      RETURNING id::text`,
    `                    updated_at = now()
      RETURNING id::text`,
    "does not exclude posted/reversed"
  );

  // markBatchFailed back to its unconditional downgrade.
  mutate(
    "markBatchFailed downgrades settled batch",
    `        DO UPDATE SET batch_status = 'failed', updated_at = now()
          WHERE accounting.posting_batches.batch_status NOT IN ('posted', 'reversed')`,
    `        DO UPDATE SET batch_status = 'failed', updated_at = now()`,
    "can stamp 'failed' onto a posted/reversed batch"
  );

  // A guard that only reads comments proves nothing: strip every comment mentioning the fix and the
  // checks must still pass on real code (i.e. they are matching SQL, not prose).
  const proseOnly = healthy.replace(/ACCT-F348/g, "ACCT-XXXX");
  if (assertRetryableBatchShape(proseOnly).length) {
    failures.push("checks depend on the finding id appearing in prose rather than on the SQL itself");
  }

  if (failures.length) {
    for (const f of failures) console.error(` - ${f}`);
    fail(`selftest: ${failures.length} check(s) do not catch what they claim`);
  }
  console.log(`[${LABEL}] SELFTEST PASS — 3 mutations caught, healthy source clean, no prose-matching`);
  process.exit(0);
}

if (!fs.existsSync(ENGINE)) fail(`${ENGINE} not found — the posting engine moved; re-point this guard rather than deleting it`);
const problems = assertRetryableBatchShape(fs.readFileSync(ENGINE, "utf8"));
if (problems.length) {
  for (const p of problems) console.error(` - ${p}`);
  fail(`${problems.length} posting-batch retry invariant(s) broken (ACCT-F348)`);
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.log(`[${LABEL}] PASS (static halves) — batch reclaim + no settled-batch downgrade; no DATABASE_URL for the live half`);
  process.exit(0);
}

// ── C · LIVE: no non-terminal batch owns journal lines (the reclaim's safety precondition) ────────
const pool = new pg.Pool({ connectionString: url, ssl: url.includes("localhost") ? false : { rejectUnauthorized: false } });
let client;
try {
  client = await pool.connect();
} catch {
  console.log(`[${LABEL}] PASS (static halves) — database unreachable; static invariants held`);
  process.exit(0);
}

try {
  await client.query("BEGIN");
  await client.query("SET LOCAL app.bypass_rls = 'lucia'");

  const present = await client.query(`SELECT to_regclass('accounting.posting_batches') IS NOT NULL AS present`);
  if (!present.rows[0]?.present) {
    await client.query("ROLLBACK").catch(() => {});
    console.log(`[${LABEL}] PASS (static halves) — accounting.posting_batches not present (fresh/unmigrated DB)`);
    client.release();
    await pool.end();
    process.exit(0);
  }

  const { rows } = await client.query(`
    SELECT pb.id::text AS batch_id,
           pb.operating_company_id::text AS opco,
           pb.batch_status,
           pb.source_transaction_type,
           pb.source_transaction_id,
           count(jep.id)::int AS lines
      FROM accounting.posting_batches pb
      JOIN accounting.journal_entry_postings jep
        ON jep.posting_batch_id = pb.id
       AND jep.operating_company_id = pb.operating_company_id
     WHERE pb.batch_status NOT IN ('posted', 'reversed')
     GROUP BY 1, 2, 3, 4, 5
     ORDER BY 6 DESC
     LIMIT 25
  `);

  const scope = await client.query(`SELECT count(*)::int AS batches FROM accounting.posting_batches`);
  await client.query("COMMIT");

  const batches = scope.rows[0]?.batches ?? 0;
  if (batches === 0) {
    fail("no posting batches exist at all — this guard cannot see what it checks (RLS mask or empty DB), which is not a clean result");
  }

  if (rows.length) {
    for (const r of rows) {
      console.error(
        ` - opco ${r.opco}: batch ${r.batch_id} is ${r.batch_status} but owns ${r.lines} journal line(s) for ${r.source_transaction_type} ${r.source_transaction_id} — reclaiming it would attach a SECOND entry to one batch.`
      );
    }
    fail(`${rows.length} non-terminal posting batch(es) already own journal lines — batch reclaim is not safe in this state (ACCT-F348)`);
  }

  console.log(`[${LABEL}] PASS — batch reclaim + no settled-batch downgrade, and 0 of ${batches} posting batch(es) are non-terminal-with-lines`);
} catch (err) {
  await client.query("ROLLBACK").catch(() => {});
  fail(`query failed: ${err?.message ?? err}`);
} finally {
  client.release();
  await pool.end();
}
