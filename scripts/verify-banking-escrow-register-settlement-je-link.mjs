#!/usr/bin/env node
/**
 * BANKING-DRIVER-ESCROW-REGISTER-MISSING-SETTLEMENT-JE-LINK — the register endpoint's "escrow" branch
 * (`GET /api/v1/banking/accounts/:id/register`, banking.routes.ts) never selected settlement_id/
 * journal_entry_id at all, even though accounting.escrow_postings.source_id/linked_journal_entry_id are
 * populated on real rows (live-confirmed 2 USMCA settlement-deposit postings, both fields non-null) and
 * the frontend (DriverEscrowTabContent.tsx) was already correctly written to render an EntityLink for
 * both columns — it never got the chance. escrow-visualizer.routes.ts, a SEPARATE endpoint in the same
 * file/schema, already had the correct CASE/join shape (ACCT-F5703 comment); this guard locks that the
 * register branch now uses the identical pattern, so the two endpoints cannot drift apart again.
 *
 * Self-test: node scripts/verify-banking-escrow-register-settlement-je-link.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TARGET = "apps/backend/src/banking/banking.routes.ts";
const LABEL = "verify-banking-escrow-register-settlement-je-link";

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

export function checkEscrowRegisterLinkage(src) {
  const problems = [];

  // Isolate the "escrow" branch of the register query (between `if (virtual === "escrow")` and the
  // next `if (virtual === "advance_pool")`), so a match elsewhere in the file (e.g. the visualizer
  // endpoint, or the driver_id CASE a few lines up) can't produce a false pass.
  const start = src.indexOf('if (virtual === "escrow")');
  const end = src.indexOf('if (virtual === "advance_pool")');
  if (start === -1 || end === -1 || end <= start) {
    return [`${TARGET}: could not locate the register endpoint's "escrow" branch between its virtual===\"escrow\" and virtual===\"advance_pool\" markers`];
  }
  const branch = src.slice(start, end);

  if (!/CASE\s+WHEN\s+ep\.source_type\s*=\s*'driver_settlement'\s+THEN\s+ep\.source_id::text\s+ELSE\s+NULL\s+END\s+AS\s+settlement_id/.test(branch)) {
    problems.push(`${TARGET}: escrow branch no longer selects settlement_id via the source_type='driver_settlement' CASE`);
  }
  if (!/ep\.linked_journal_entry_id::text\s+AS\s+journal_entry_id/.test(branch)) {
    problems.push(`${TARGET}: escrow branch no longer selects journal_entry_id from ep.linked_journal_entry_id`);
  }
  if (!/LEFT JOIN accounting\.journal_entries je\s*\n\s*ON je\.id\s*=\s*ep\.linked_journal_entry_id/.test(branch)) {
    problems.push(`${TARGET}: escrow branch no longer LEFT JOINs accounting.journal_entries for a human JE label`);
  }
  if (!/je\.memo\s+AS\s+journal_entry_memo/.test(branch)) {
    problems.push(`${TARGET}: escrow branch no longer selects journal_entry_memo (the label DriverEscrowTabContent.tsx renders for the EntityLink)`);
  }

  return problems;
}

function selftest() {
  const good = `
    if (virtual === "escrow") {
      const res = await client.query(\`
        SELECT
          ep.id,
          CASE WHEN ea.holder_type = 'driver' THEN ea.holder_id::text ELSE NULL END AS driver_id,
          CASE WHEN ep.source_type = 'driver_settlement' THEN ep.source_id::text ELSE NULL END AS settlement_id,
          ep.linked_journal_entry_id::text AS journal_entry_id,
          je.memo AS journal_entry_memo
        FROM accounting.escrow_postings ep
        JOIN accounting.escrow_accounts ea ON ea.id = ep.escrow_account_id
        LEFT JOIN accounting.journal_entries je
          ON je.id = ep.linked_journal_entry_id
         AND je.operating_company_id = ep.operating_company_id
      \`);
    }
    if (virtual === "advance_pool") {
  `;
  const goodProblems = checkEscrowRegisterLinkage(good);
  if (goodProblems.length) {
    console.error(`${LABEL} SELFTEST FAIL — known-good fixture flagged: ${goodProblems.join("; ")}`);
    process.exit(1);
  }

  const mutations = [
    good.replace("CASE WHEN ep.source_type = 'driver_settlement' THEN ep.source_id::text ELSE NULL END AS settlement_id,\n", ""),
    good.replace("ep.linked_journal_entry_id::text AS journal_entry_id,\n", ""),
    good.replace(/LEFT JOIN accounting\.journal_entries je[\s\S]*?operating_company_id\n/, ""),
    good.replace("je.memo AS journal_entry_memo\n", ""),
  ];
  for (const [i, mutated] of mutations.entries()) {
    if (checkEscrowRegisterLinkage(mutated).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — regression mutation ${i} escaped detection`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} SELFTEST PASS — ${mutations.length} regression mutations all detected`);
  process.exit(0);
}

if (process.argv.includes("--selftest")) selftest();

const src = read(TARGET);
const failures = checkEscrowRegisterLinkage(src);
if (failures.length) {
  console.error(`${LABEL} FAIL:\n${failures.map((f) => ` - ${f}`).join("\n")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — the register endpoint's escrow branch selects settlement_id/journal_entry_id/journal_entry_memo, matching escrow-visualizer.routes.ts's already-correct pattern`);
