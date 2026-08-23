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
 * BANK-F5751 (2026-08-22) — the fix above still left the Settlement column's label hardcoded null on
 * the frontend: only settlement_id (the raw uuid) was returned, never a human display_id. Extended to
 * also lock the driver_finance.driver_settlements join (settlement_display_id) and the frontend
 * threading it in DriverEscrowTabContent.tsx — live-confirmed against the same 2 rows the original
 * fix cited: S-20260802-0258 / S-2026-0002.
 *
 * Self-test: node scripts/verify-banking-escrow-register-settlement-je-link.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TARGET = "apps/backend/src/banking/banking.routes.ts";
const FRONTEND_TARGET = "apps/frontend/src/pages/banking/components/DriverEscrowTabContent.tsx";
const LABEL = "verify-banking-escrow-register-settlement-je-link";

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

export function checkEscrowRegisterLinkage(src, frontendSrc) {
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
  if (!/ds\.display_id\s+AS\s+settlement_display_id/.test(branch)) {
    problems.push(`${TARGET}: escrow branch no longer selects settlement_display_id from driver_finance.driver_settlements`);
  }
  if (!/LEFT JOIN driver_finance\.driver_settlements ds\s*\n\s*ON ds\.id\s*=\s*ep\.source_id/.test(branch)) {
    problems.push(`${TARGET}: escrow branch no longer LEFT JOINs driver_finance.driver_settlements for a human settlement label`);
  }

  if (frontendSrc !== undefined) {
    if (!/visibleDocumentLabel\(String\(row\.settlement_display_id[^)]*\)[^,]*,\s*sid,\s*"Settlement"\)/.test(frontendSrc)) {
      problems.push(`${FRONTEND_TARGET}: Settlement column no longer threads row.settlement_display_id into visibleDocumentLabel — tombstone entityLabel or reverted`);
    }
    if (!/settlement_display_id: String\(row\.settlement_display_id/.test(frontendSrc)) {
      problems.push(`${FRONTEND_TARGET}: registerToEscrowRow no longer copies settlement_display_id from the register payload — BANK-F6050 live tombstone class`);
    }
    if (!/journal_entry_id: String\(row\.journal_entry_id/.test(frontendSrc)) {
      problems.push(`${FRONTEND_TARGET}: registerToEscrowRow no longer copies journal_entry_id from the register payload`);
    }
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
          ds.display_id AS settlement_display_id,
          ep.linked_journal_entry_id::text AS journal_entry_id,
          je.memo AS journal_entry_memo
        FROM accounting.escrow_postings ep
        JOIN accounting.escrow_accounts ea ON ea.id = ep.escrow_account_id
        LEFT JOIN accounting.journal_entries je
          ON je.id = ep.linked_journal_entry_id
         AND je.operating_company_id = ep.operating_company_id
        LEFT JOIN driver_finance.driver_settlements ds
          ON ds.id = ep.source_id
         AND ep.source_type = 'driver_settlement'
      \`);
    }
    if (virtual === "advance_pool") {
  `;
  const goodFrontend = `label={visibleDocumentLabel(String(row.settlement_display_id ?? "") || null, sid, "Settlement")}
    settlement_display_id: String(row.settlement_display_id ?? ""),
    journal_entry_id: String(row.journal_entry_id ?? ""),`;
  const goodProblems = checkEscrowRegisterLinkage(good, goodFrontend);
  if (goodProblems.length) {
    console.error(`${LABEL} SELFTEST FAIL — known-good fixture flagged: ${goodProblems.join("; ")}`);
    process.exit(1);
  }

  const mutations = [
    { src: good.replace("CASE WHEN ep.source_type = 'driver_settlement' THEN ep.source_id::text ELSE NULL END AS settlement_id,\n", ""), frontend: goodFrontend },
    { src: good.replace("ep.linked_journal_entry_id::text AS journal_entry_id,\n", ""), frontend: goodFrontend },
    { src: good.replace(/LEFT JOIN accounting\.journal_entries je[\s\S]*?operating_company_id\n/, ""), frontend: goodFrontend },
    { src: good.replace("je.memo AS journal_entry_memo\n", ""), frontend: goodFrontend },
    { src: good.replace("ds.display_id AS settlement_display_id,\n", ""), frontend: goodFrontend },
    { src: good.replace(/LEFT JOIN driver_finance\.driver_settlements ds[\s\S]*?'driver_settlement'\n/, ""), frontend: goodFrontend },
    { src: good, frontend: goodFrontend.replace("row.settlement_display_id ?? \"\") || null", "null") },
    { src: good, frontend: goodFrontend.replace("settlement_display_id: String(row.settlement_display_id ?? \"\"),", "") },
  ];
  for (const [i, mutated] of mutations.entries()) {
    if (checkEscrowRegisterLinkage(mutated.src, mutated.frontend).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — regression mutation ${i} escaped detection`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} SELFTEST PASS — ${mutations.length} regression mutations all detected`);
  process.exit(0);
}

if (process.argv.includes("--selftest")) selftest();

const src = read(TARGET);
const frontendSrc = read(FRONTEND_TARGET);
const failures = checkEscrowRegisterLinkage(src, frontendSrc);
if (failures.length) {
  console.error(`${LABEL} FAIL:\n${failures.map((f) => ` - ${f}`).join("\n")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — the register endpoint's escrow branch selects settlement_id/settlement_display_id/journal_entry_id/journal_entry_memo, matching escrow-visualizer.routes.ts's already-correct pattern, and the frontend threads settlement_display_id into its EntityLink label`);
