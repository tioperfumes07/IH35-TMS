#!/usr/bin/env node
// verify-settlement-payment-state-guard.mjs
//
// Anti-regression guard for the settlement double-pay fix (FOUNDATION-FIRST Priority 2 / Phase 2;
// design: docs/specs/DESIGN-settlement-double-pay-row-lock-state-guard.md §3, drop-audit D2/D3/D4 in
// docs/specs/SETTLEMENT-ENGINE-PHASE0-REVERIFY-2026-07-21.md).
//
// Static (no DB — cannot silently SKIP): parses settlement-payment.service.ts and FAILS if any of the
// restored safety properties regresses:
//   1. Every `UPDATE driver_finance.driver_settlements ... SET payment_state` carries the CAS predicate
//      `payment_state IS NOT DISTINCT FROM` in its WHERE clause (IS NOT DISTINCT FROM, never `=`).
//   2. The settlement lookup supports FOR UPDATE and every payment mutator takes the row lock.
//   3. A 0-row UPDATE is resolved through the idempotency latch (resolveGuardedUpdateMiss), never a
//      bare generic throw.
//   4. The payment-event INSERT is idempotent (idempotency_key + ON CONFLICT ... DO NOTHING).
//
// --selftest proves both directions on embedded fixtures (a deliberately unguarded fixture must FAIL).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-settlement-payment-state-guard";
const SERVICE = "apps/backend/src/driver-finance/settlement-payment.service.ts";
const MUTATORS = ["queuePayment", "markSentToBank", "markCleared", "markBounced", "markPaidManually"];

/** Extract every backtick template literal that contains an UPDATE of the settlements header. */
function extractHeaderUpdates(source) {
  const updates = [];
  const re = /`([^`]*UPDATE\s+driver_finance\.driver_settlements[^`]*)`/g;
  let m;
  while ((m = re.exec(source)) !== null) updates.push(m[1]);
  return updates;
}

export function checkSource(source) {
  const errors = [];

  // (1) CAS predicate on every payment_state UPDATE
  const updates = extractHeaderUpdates(source).filter((u) => /SET[\s\S]*payment_state\s*=/.test(u));
  if (updates.length < 5) {
    errors.push(
      `expected >= 5 payment_state UPDATE statements on driver_finance.driver_settlements, found ${updates.length} — a mutator was removed or its SQL no longer parses as a template literal`
    );
  }
  updates.forEach((u, i) => {
    if (!/payment_state\s+IS\s+NOT\s+DISTINCT\s+FROM/i.test(u)) {
      errors.push(`payment_state UPDATE #${i + 1} lacks the CAS predicate 'payment_state IS NOT DISTINCT FROM' — this reopens the double-pay TOCTOU race`);
    }
    if (/WHERE[\s\S]*payment_state\s*=\s*\$/i.test(u)) {
      errors.push(`payment_state UPDATE #${i + 1} uses '=' in its WHERE guard — must be IS NOT DISTINCT FROM (a plain '=' never matches a NULL row and breaks the first transition)`);
    }
  });

  // (2) row lock: lookup supports FOR UPDATE and every mutator requests it
  if (!/FROM\s+driver_finance\.driver_settlements[\s\S]{0,400}FOR UPDATE/.test(source)) {
    errors.push("settlement lookup no longer supports FOR UPDATE — row-lock defense (drop-audit D2) removed");
  }
  for (const fn of MUTATORS) {
    const fnStart = source.indexOf(`function ${fn}(`);
    if (fnStart === -1) {
      errors.push(`mutator ${fn} not found — if renamed, update this guard in the same commit`);
      continue;
    }
    const body = source.slice(fnStart, source.indexOf("\nexport ", fnStart + 1) === -1 ? undefined : source.indexOf("\nexport ", fnStart + 1));
    if (!/forUpdate:\s*true/.test(body)) {
      errors.push(`mutator ${fn} does not take the row lock (loadSettlement forUpdate: true missing)`);
    }
    if (!/resolveGuardedUpdateMiss/.test(body)) {
      errors.push(`mutator ${fn} does not route a 0-row UPDATE through the idempotency latch (resolveGuardedUpdateMiss) — a healthy concurrency rejection would surface as a generic failure or, worse, a duplicate write path`);
    }
  }

  // (4) idempotent event insert
  const eventInsert = /INSERT INTO driver_finance\.settlement_payment_events[\s\S]{0,700}?ON CONFLICT[\s\S]{0,200}?DO NOTHING/.test(source);
  if (!eventInsert) {
    errors.push("settlement_payment_events INSERT lost its ON CONFLICT ... DO NOTHING idempotency — a re-run would write a duplicate transition event");
  }
  if (!/idempotency_key/.test(source)) {
    errors.push("idempotency_key is no longer written on payment events — event de-duplication (drop-audit) removed");
  }

  return errors;
}

function selftest() {
  const good = fs.readFileSync(path.join(ROOT, SERVICE), "utf8");
  const goodErrors = checkSource(good);
  if (goodErrors.length > 0) {
    console.error(`[${LABEL}] SELFTEST FAILED — the live service does not pass its own guard:`);
    for (const e of goodErrors) console.error(`  ✗ ${e}`);
    process.exit(1);
  }

  // Planted violation: the pre-fix shape (no CAS, no lock, no latch, bare insert) MUST fail.
  const bad = `
    async function loadSettlement(client, settlementId, operatingCompanyId) {
      return client.query(\`SELECT id FROM driver_finance.driver_settlements WHERE id = $1 LIMIT 1\`);
    }
    export async function queuePayment() {
      await client.query(\`UPDATE driver_finance.driver_settlements SET payment_state = 'queued' WHERE id = $1 AND operating_company_id = $2 RETURNING id\`);
      await client.query(\`INSERT INTO driver_finance.settlement_payment_events (settlement_id) VALUES ($1)\`);
    }
    export async function markSentToBank() {}
    export async function markCleared() {}
    export async function markBounced() {}
    export async function markPaidManually() {}
  `;
  const badErrors = checkSource(bad);
  if (badErrors.length === 0) {
    console.error(`[${LABEL}] SELFTEST FAILED — planted pre-fix fixture passed (guard is blind)`);
    process.exit(1);
  }
  console.log(`[${LABEL}] selftest OK — live source clean, planted violation caught (${badErrors.length} findings)`);
}

function main() {
  if (process.argv.includes("--selftest")) return selftest();
  const source = fs.readFileSync(path.join(ROOT, SERVICE), "utf8");
  const errors = checkSource(source);
  if (errors.length > 0) {
    console.error(`[${LABEL}] FAILED — ${errors.length} regression(s) of the double-pay fix:`);
    for (const e of errors) console.error(`  ✗ ${e}`);
    process.exit(1);
  }
  console.log(`[${LABEL}] OK — CAS predicates, row lock, idempotency latch, and keyed event inserts all intact.`);
}

main();
