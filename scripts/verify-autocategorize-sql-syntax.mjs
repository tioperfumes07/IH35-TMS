#!/usr/bin/env node
// BANK-F30022 (2026-09-09) — integrations/plaid/plaid.service.ts's autoCategorize() UPDATE
// statement carried a JS-style `//` comment INSIDE the SQL template literal -- `//` is not valid
// SQL syntax. Confirmed live via EXPLAIN: "syntax error at or near //". Every non-dry-run call to
// autoCategorize() threw immediately. Because the Plaid-sync caller runs each row inside its own
// SAVEPOINT and rolls the WHOLE row back on any thrown error, a newly ingested transaction that
// matched one of USMCA's 4 active banking.transaction_categories rules was silently dropped from
// banking.bank_transactions entirely -- not just left uncategorized. Also added voided_at IS NULL
// to the same WHERE clause (same class as BANK-F30012-F30021) while fixing this statement.
import fs from "node:fs";

const REL = "apps/backend/src/integrations/plaid/plaid.service.ts";

export function auditFile(src) {
  const failures = [];
  const fnMatch = src.match(/async function autoCategorize\([\s\S]*?\n\}/);
  if (!fnMatch) {
    failures.push(`autoCategorize function body not found in ${REL} -- guard's own parsing may be stale`);
    return failures;
  }
  const body = fnMatch[0];

  // Scope the // check to ONLY the SQL passed to client.query(`...`) -- a bare // is completely
  // normal JS elsewhere in this function (e.g. its scoring-loop comments); it is only a bug inside
  // the query template literal, where // is not valid SQL syntax.
  const queryStatements = body.split(/client\.query[<(]/g).slice(1);
  let checkedUpdate = false;
  for (const stmt of queryStatements) {
    const qm = stmt.match(/`([\s\S]*?)`/);
    if (!qm) continue;
    const sql = qm[1];
    if (!/UPDATE\s+banking\.bank_transactions/i.test(sql)) continue;
    checkedUpdate = true;
    const badLine = sql.split("\n").find((line) => /^\s*\/\//.test(line));
    if (badLine) {
      failures.push(`autoCategorize's UPDATE SQL template literal contains a // (JS comment syntax) line -- not valid SQL, a syntax error at runtime: "${badLine.trim().slice(0, 80)}"`);
    }
    if (!/voided_at\s+IS\s+NULL/i.test(sql)) {
      failures.push("autoCategorize's UPDATE has no voided_at IS NULL filter");
    }
  }
  if (!checkedUpdate) {
    failures.push("could not find autoCategorize's UPDATE banking.bank_transactions statement -- guard's own parsing may be stale");
  }
  return failures;
}

export function run(root = process.cwd()) {
  let src;
  try {
    src = fs.readFileSync(`${root}/${REL}`, "utf8");
  } catch {
    return [`${REL}: missing`];
  }
  return auditFile(src);
}

if (process.argv.includes("--selftest")) {
  const root = process.cwd();
  const good = fs.readFileSync(`${root}/${REL}`, "utf8");
  const passFailures = auditFile(good);
  if (passFailures.length) throw new Error("SELFTEST FAIL (should be clean): " + JSON.stringify(passFailures));

  const brokenComment = good.replace(
    `          -- GO-23 (owner FINISH LAW 2026-09-03, "record who and when"): opts.actorUserUuid is
          -- the human who clicked "Apply to Historical Transactions" (apply-historical route,
          -- dry_run=false); NULL here is honest, not a bug, for any future fully-automatic caller
          -- with no human in the loop -- COALESCE never overwrites an already-attributed row.`,
    `          // GO-23 (owner FINISH LAW 2026-09-03, "record who and when"): opts.actorUserUuid is
          // the human who clicked "Apply to Historical Transactions" (apply-historical route,
          // dry_run=false); NULL here is honest, not a bug, for any future fully-automatic caller
          // with no human in the loop -- COALESCE never overwrites an already-attributed row.`
  );
  if (brokenComment === good) throw new Error("SELFTEST setup broken -- the -- comment text to swap back to // was not found");
  if (auditFile(brokenComment).length === 0) throw new Error("SELFTEST FAIL: reintroducing the // JS-comment-in-SQL bug went undetected");

  const brokenVoided = good.replace(
    "AND categorization_gl_account_id IS NULL\n          AND voided_at IS NULL\n          AND COALESCE(status,",
    "AND categorization_gl_account_id IS NULL\n          AND COALESCE(status,"
  );
  if (brokenVoided === good) throw new Error("SELFTEST setup broken -- the voided_at filter text to remove was not found");
  if (auditFile(brokenVoided).length === 0) throw new Error("SELFTEST FAIL: removed voided_at filter from autoCategorize went undetected");

  console.log("verify-autocategorize-sql-syntax: SELFTEST PASS (2/2 mutations caught)");
  process.exit(0);
}

const failures = run();
if (failures.length) {
  console.error("verify-autocategorize-sql-syntax FAILED:");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("verify-autocategorize-sql-syntax OK — autoCategorize's UPDATE is valid SQL and excludes voided rows");
