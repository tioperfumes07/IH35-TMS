#!/usr/bin/env node
/**
 * LV-BILLPAY-VOID-NO-REVERSAL sub-finding — "reversal postings are untagged". `postVoidReversal`
 * (the shared primitive all 6 void callers pass through) INSERTed reversal postings with
 * source_transaction_type/source_transaction_id = NULL, so any source-typed report (revenue-by-type,
 * P&L drill-through, a subledger-vs-GL tie-out grouped by source type) summed the ORIGINAL posting
 * into its type bucket and never saw the reversal — overstating that bucket by the full reversed
 * amount even though the account-level trial balance (which doesn't group by source type) stayed
 * correct. Live-reproduced 2026-08-12: every reversal posting on prod (WHERE je.reverses_je_id IS NOT
 * NULL) had source_transaction_type/id NULL, 100%.
 *
 * INVARIANT (static — no database, runs in every CI context including fresh-DB): the reversal-posting
 * INSERT in void.service.ts's postVoidReversal must populate source_transaction_type and
 * source_transaction_id (bound to the same params.entityType / params.entityId the reversal itself
 * reverses) — not leave them unbound/NULL.
 *
 * Self-test: node scripts/verify-void-reversal-posting-source-tagged.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";

const LABEL = "verify-void-reversal-posting-source-tagged";
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const TARGET = "apps/backend/src/accounting/void.service.ts";

function fail(msg) {
  console.error(`[${LABEL}] FAIL: ${msg}`);
  process.exit(1);
}

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

/**
 * Isolates the INSERT INTO accounting.journal_entry_postings block inside postVoidReversal (anchored
 * on the function name, since this file has only one such INSERT) and checks the column list carries
 * source_transaction_type + source_transaction_id, AND that the bound values are params.entityType /
 * params.entityId (not a literal, not omitted).
 */
export function checkReversalPostingSourceTag(src) {
  const code = stripComments(src);

  const fnAnchor = /export async function postVoidReversal/;
  const fnMatch = fnAnchor.exec(code);
  if (!fnMatch) return { ok: false, reason: "postVoidReversal function not found" };

  const insertAnchor = /INSERT INTO accounting\.journal_entry_postings/;
  const insertMatch = insertAnchor.exec(code.slice(fnMatch.index));
  if (!insertMatch) return { ok: false, reason: "INSERT INTO accounting.journal_entry_postings not found inside postVoidReversal" };

  const block = code.slice(fnMatch.index + insertMatch.index, fnMatch.index + insertMatch.index + 1200);

  const hasColumns = /source_transaction_type/.test(block) && /source_transaction_id/.test(block);
  if (!hasColumns) {
    return { ok: false, reason: "the reversal-posting INSERT's column list does not include source_transaction_type/source_transaction_id" };
  }
  const hasBoundValues = /params\.entityType/.test(block) && /params\.entityId/.test(block);
  if (!hasBoundValues) {
    return {
      ok: false,
      reason: "source_transaction_type/id columns are listed but not bound to params.entityType/params.entityId — likely NULL or a stray literal",
    };
  }
  return { ok: true };
}

const isEntryPoint = import.meta.url === `file://${process.argv[1]}`;

if (isEntryPoint && process.argv.includes("--selftest")) {
  const good = `
    export async function postVoidReversal(client, params, actor) {
      const lineRes = await client.query(
        \`
          INSERT INTO accounting.journal_entry_postings
            (operating_company_id, journal_entry_uuid, line_sequence, account_id, class_id, entity_uuid, debit_or_credit, amount_cents, description, idempotency_key, source_transaction_type, source_transaction_id)
          VALUES ($1::uuid, $2::uuid, $3, $4::uuid, $5::uuid, $6, $7, $8::bigint, $9, $10, $11, $12)
        \`,
        [
          params.operatingCompanyId, reversalJeId, seq++, line.account_id, line.class_id, line.entity_uuid,
          line.debit_or_credit, line.amount_cents, line.description, \`void:\${params.entityType}:\${params.entityId}\`,
          params.entityType,
          params.entityId,
        ]
      );
    }
  `;
  const goodResult = checkReversalPostingSourceTag(good);
  if (!goodResult.ok) fail(`selftest: known-good fixture should pass — ${goodResult.reason}`);

  const regressedNoColumns = `
    export async function postVoidReversal(client, params, actor) {
      const lineRes = await client.query(
        \`
          INSERT INTO accounting.journal_entry_postings
            (operating_company_id, journal_entry_uuid, line_sequence, account_id, class_id, entity_uuid, debit_or_credit, amount_cents, description, idempotency_key)
          VALUES ($1::uuid, $2::uuid, $3, $4::uuid, $5::uuid, $6, $7, $8::bigint, $9, $10)
        \`,
        [
          params.operatingCompanyId, reversalJeId, seq++, line.account_id, line.class_id, line.entity_uuid,
          line.debit_or_credit, line.amount_cents, line.description, \`void:\${params.entityType}:\${params.entityId}\`,
        ]
      );
    }
  `;
  const regressedResult = checkReversalPostingSourceTag(regressedNoColumns);
  if (regressedResult.ok) fail("selftest: regressed fixture (columns omitted entirely) should FAIL but passed");

  const commentTrap = `
    export async function postVoidReversal(client, params, actor) {
      // TODO: add source_transaction_type, source_transaction_id bound to params.entityType, params.entityId
      const lineRes = await client.query(
        \`
          INSERT INTO accounting.journal_entry_postings
            (operating_company_id, journal_entry_uuid, line_sequence, account_id, class_id, entity_uuid, debit_or_credit, amount_cents, description, idempotency_key)
          VALUES ($1::uuid, $2::uuid, $3, $4::uuid, $5::uuid, $6, $7, $8::bigint, $9, $10)
        \`,
        [params.operatingCompanyId, reversalJeId]
      );
    }
  `;
  const trapResult = checkReversalPostingSourceTag(commentTrap);
  if (trapResult.ok) fail("selftest: comment-trap fixture (fix mentioned only in a comment) should FAIL but the guard matched its own prose");

  console.log(`[${LABEL}] selftest: PASS — good/regressed/comment-trap fixtures all classify correctly`);
  process.exit(0);
}

if (isEntryPoint) {
  const filePath = path.join(ROOT, TARGET);
  if (!fs.existsSync(filePath)) fail(`${TARGET}: file not found`);
  const src = fs.readFileSync(filePath, "utf8");
  const result = checkReversalPostingSourceTag(src);
  if (!result.ok) fail(`${TARGET}: ${result.reason}`);
  console.log(`[${LABEL}] PASS — postVoidReversal's reversal postings carry source_transaction_type/id bound to what they reverse`);
}
