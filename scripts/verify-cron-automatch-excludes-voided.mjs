#!/usr/bin/env node
// BANK-F30018 (2026-09-09) — the nightly bank-recon auto-match cron
// (cron/bank-recon-auto-match.cron.ts) selected "unmatched" banking.bank_transactions with no
// voided_at filter. findCandidates() itself already refuses a voided row (loadTransaction excludes
// voided_at, BANK-F9998) and returns [] for one, so this was never a correctness bug, only wasted
// nightly work: every voided row that happens to be unmatched occupies one of the query's 500-row
// LIMIT slots and one findCandidates() DB round trip that can only ever return nothing.
// Live-measured on USMCA: 106 of 327 (32%) rows the query returned were already voided.
import fs from "node:fs";

const REL = "apps/backend/src/cron/bank-recon-auto-match.cron.ts";

export function auditFile(src) {
  const failures = [];
  const statements = src.split(/client\.query[<(]/g).slice(1);
  let checked = 0;
  for (const stmt of statements) {
    const m = stmt.match(/`([\s\S]*?)`/);
    if (!m) continue;
    const sql = m[1];
    if (!/banking\.bank_transactions/i.test(sql)) continue;
    if (!/^\s*(SELECT|WITH)\b/i.test(sql)) continue;
    checked += 1;
    if (!/voided_at\s+IS\s+NULL/i.test(sql)) {
      const snippet = sql.trim().replace(/\s+/g, " ").slice(0, 100);
      failures.push(`a query reading banking.bank_transactions has no voided_at IS NULL filter: "${snippet}..."`);
    }
  }
  if (checked < 1) {
    failures.push(`expected at least 1 banking.bank_transactions query site in ${REL}, found ${checked} -- guard's own parsing may be stale`);
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

  const broken = good.replace(
    "AND bt.transaction_date >= (now() - interval '90 days')::date\n            AND bt.voided_at IS NULL\n            AND NOT EXISTS (",
    "AND bt.transaction_date >= (now() - interval '90 days')::date\n            AND NOT EXISTS ("
  );
  if (broken === good) throw new Error("SELFTEST setup broken -- the cron's voided_at filter text to remove was not found");
  if (auditFile(broken).length === 0) throw new Error("SELFTEST FAIL: removed voided_at filter from the cron's candidate query went undetected");

  console.log("verify-cron-automatch-excludes-voided: SELFTEST PASS (1/1 mutation caught)");
  process.exit(0);
}

const failures = run();
if (failures.length) {
  console.error("verify-cron-automatch-excludes-voided FAILED:");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("verify-cron-automatch-excludes-voided OK — the nightly bank-recon auto-match cron excludes voided bank_transactions rows");
