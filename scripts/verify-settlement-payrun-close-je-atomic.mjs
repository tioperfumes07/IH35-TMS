#!/usr/bin/env node
/**
 * ACCT-F5652 — `closeSettlementPayRun` (`driver-finance/settlement-payrun-close.service.ts`, the
 * canonical driver-settlement close path) runs its ENTIRE body inside one caller-owned transaction,
 * already holding `FOR UPDATE` locks (`loadSettlement`, `loadRecoverableAdvances`) and an uncommitted
 * `payrun_gl_runs` idempotency claim + `driver_advances` recovery stamps, then called
 * `createJournalEntry(...)` with NO client option — opening a SECOND, independent connection that
 * BEGINs, inserts, and COMMITs the JE on its own. A failure anywhere after that call (escrow posting,
 * disbursement recording, the audit insert) rolled back the outer transaction (undoing the
 * `payrun_gl_runs` claim + recovery stamps) while the JE stayed permanently posted with no settlement
 * linkage — and because the idempotency claim rolled back too, a natural retry would post a SECOND
 * balanced JE for the same settlement.
 *
 * FAIL if createJournalEntry is called without passing `client` (the caller's own connection). PASS
 * when the call passes `{ client, suppressSideEffects: true }` (or equivalent) and the JE's side
 * effects are deferred to run after the transaction commits via enqueueJournalEntrySideEffects.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-settlement-payrun-close-je-atomic";
const FILE = path.join(ROOT, "apps/backend/src/driver-finance/settlement-payrun-close.service.ts");

export function analyzeSource(src) {
  const failures = [];
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

  const callMatch = code.match(/const je = await createJournalEntry\(([\s\S]{0,600}?)\);/);
  if (!callMatch) {
    failures.push(`${path.relative(ROOT, FILE)}: could not locate the createJournalEntry call in closeSettlementPayRun`);
    return failures;
  }
  const callArgs = callMatch[1];
  if (!/\bclient\b/.test(callArgs)) {
    failures.push(
      `${path.relative(ROOT, FILE)}: createJournalEntry is called WITHOUT passing the caller's own client — this ` +
        `opens a second, independent connection that commits the JE on its own while this connection's row ` +
        `locks + payrun_gl_runs idempotency claim are still uncommitted (ACCT-F5652: permanently-orphaned JE ` +
        `on later rollback, unguarded double-post on retry).`
    );
  }
  if (!/suppressSideEffects\s*:\s*true/.test(callArgs)) {
    failures.push(`${path.relative(ROOT, FILE)}: createJournalEntry must pass suppressSideEffects: true when a client is supplied, so QBO sync-job/push side effects are deferred rather than enqueued inside a still-open transaction`);
  }
  if (!/enqueueJournalEntrySideEffects\(/.test(code)) {
    failures.push(`${path.relative(ROOT, FILE)}: must call enqueueJournalEntrySideEffects after the transaction commits to preserve the JE's QBO sync-job/push side effects`);
  }
  return failures;
}

export function run() {
  const src = fs.readFileSync(FILE, "utf8");
  return analyzeSource(src);
}

if (process.argv.includes("--selftest")) {
  const GOOD = `
export async function closeSettlementPayRun(input, actor) {
  const scopedResult = await scoped(actor, opco, async (client) => {
    const je = await createJournalEntry(
      jeInput,
      { userId: actor.userId, role: "system" },
      { client, suppressSideEffects: true }
    );
    return { ...publicFields, __freshJeInput: jeInput, __freshJeId: je.id };
  });
  const { __freshJeInput, __freshJeId, ...result } = scopedResult;
  if (__freshJeInput && __freshJeId) {
    await enqueueJournalEntrySideEffects(__freshJeInput, __freshJeId, actor.userId);
  }
  return result;
}
`;
  const goodFailures = analyzeSource(GOOD);
  if (goodFailures.length) {
    throw new Error(`[${LABEL}] selftest PASS fixture FAILED: ${goodFailures.join("; ")}`);
  }

  const BAD_NO_CLIENT = `
export async function closeSettlementPayRun(input, actor) {
  return scoped(actor, opco, async (client) => {
    const je = await createJournalEntry(
      jeInput,
      { userId: actor.userId, role: "system" }
    );
    return { ...publicFields, journal_entry_id: je.id };
  });
}
`;
  if (!analyzeSource(BAD_NO_CLIENT).length) {
    throw new Error(`[${LABEL}] selftest REGRESSION fixture (createJournalEntry with no client — the original bug shape) should FAIL but passed`);
  }

  console.log(`[${LABEL}] selftest: PASS — good/regressed fixtures classify correctly`);
  process.exit(0);
}

const failures = run();
if (failures.length) {
  console.error(`[${LABEL}] FAILED — ${failures.length} check(s) regressed:`);
  for (const f of failures) console.error("  ✗", f);
  process.exit(1);
}
console.log(`[${LABEL}] PASS — closeSettlementPayRun posts its JE on the caller's own connection (atomic with its row locks + idempotency claim), deferring QBO side effects until after commit`);
