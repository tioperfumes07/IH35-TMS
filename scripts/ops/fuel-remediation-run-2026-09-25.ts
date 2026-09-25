#!/usr/bin/env -S npx tsx
/**
 * R-153.6/153.7 STEP 3 — THE REMEDIATION RUN.
 *
 * Voids every wrongly-1090-credited fuel journal entry (via the SAME audited voidJournalEntry
 * engine a human uses from the JE screen — Option-1 reversing-entry, flag-gated, role-checked,
 * reason-required) and reposts each fuel transaction through the NOW-FIXED
 * createExpenseFromFuelTransaction writer, which resolves the real Dreamline(2510)/Relay(1295)
 * rail per R-153.7's owner rule and sets payment_account_uuid so the existing posting-engine
 * credits the correct account. Duplicates (R-153.7 dedupe pass) get voided, not reposted.
 *
 * NO NEW GL MATH. Reuses: voidDocument -> voidJournalEntry (journal-entries.service.ts),
 * createExpenseFromFuelTransaction (fuel-expense-document.service.ts, already fixed this
 * session), and the existing posting-engine for the fresh posting.
 *
 * Source of truth for WHAT to do per row: docs/bus/fuel-remediation-classification-2026-09-25.json
 * (built by fuel-remediation-classify-2026-09-25.mjs, read-only, live-verified against the SAME
 * DATABASE_URL this script runs against — re-classify before every run, never reuse a stale file
 * across branches).
 *
 * SAFE BY DEFAULT: dry-run unless --execute is passed. Idempotent: safe to re-run (a row already
 * in its target state is skipped; a row whose live state no longer matches its planned action is
 * reported, not blindly forced).
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import pg from "pg";

const EXECUTE_EARLY = process.argv.includes("--execute");
const REHEARSAL_EARLY = process.argv.includes("--rehearsal");
if (EXECUTE_EARLY && !REHEARSAL_EARLY) {
  // ROUND 133 P0 (owner law): a production financial write is authorized ONLY by an OPEN,
  // unexpired AUTH-<NNN> on origin/main. Same preflight pattern as
  // scripts/ops/2026-09-25-cc1-r153-item2-faro-aging-receipts.ts (PR #22579's own fix).
  // --rehearsal explicitly opts out of this check for a Neon CHILD branch only (never production)
  // -- the rehearsal step itself is what R-153.7's own instruction pre-authorizes; requiring a
  // real AUTH-<NNN> there would conflate rehearsal with the production authorization it exists to
  // gate. The caller names the flag explicitly, so the choice is auditable in the command line
  // that ran, not silently assumed.
  const authId = process.env.OWNER_AUTH_ID;
  if (!authId) {
    throw new Error(
      "OWNER_AUTH_ID is required; refusing a production financial write without an OPEN authorization on main (pass --rehearsal for a Neon child branch run instead)",
    );
  }
  const authCheck = spawnSync("node", ["scripts/verify-owner-authorization.mjs", authId], {
    cwd: process.cwd(),
    stdio: "inherit",
  });
  if (authCheck.status !== 0) {
    throw new Error(`verify-owner-authorization.mjs rejected ${authId}`);
  }
}
// Defense in depth: --rehearsal must never be pointed at the known production Neon endpoint.
const PROD_HOST_FRAGMENT = "ep-broad-block-akykk7bw";
if (EXECUTE_EARLY && REHEARSAL_EARLY && (process.env.DATABASE_URL ?? "").includes(PROD_HOST_FRAGMENT)) {
  throw new Error("--rehearsal was passed but DATABASE_URL points at the known PRODUCTION endpoint -- refusing.");
}

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
// Real Owner-role account (this session's own user) -- required for canVoid() (Owner/Accountant
// only, per Jorge 2026-06-14). Administrator is explicitly excluded from voiding.
const OWNER_ACTOR = { userId: "e4117991-d2c0-406d-8cda-74e98d95bccd", role: "Owner" };
// System actor for document creation only (not permission-gated) -- matches the writer's own
// FUEL_EXPENSE_SYSTEM_ACTOR convention.
const SYSTEM_ACTOR_ID = "00000000-0000-4000-8000-000000000001";
const TODAY = "2026-09-25";
const VOID_REASON_WRONG_ACCOUNT =
  "R-153.6/153.7 remediation: USMCA fuel was wrongly credited to 1090 (Undeposited Funds) instead " +
  "of the real card rail (Dreamline 2510 / Relay 1295). Voided to repost through the fixed writer.";
const VOID_REASON_DUPLICATE = (keeperId: string) =>
  `R-153.7 dedupe: duplicate fuel line, same fill as ${keeperId} (Dreamline-tagged row kept).`;

const EXECUTE = process.argv.includes("--execute");
const LIMIT_ARG = process.argv.find((a) => a.startsWith("--limit="));
const LIMIT = LIMIT_ARG ? Number(LIMIT_ARG.split("=")[1]) : Infinity;
const VERBOSE = process.argv.includes("--verbose");
const log = (...args: unknown[]) => {
  if (VERBOSE) console.log(new Date().toISOString(), ...args);
};
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error("DATABASE_URL not set");

type Row = {
  fuelId: string;
  bucket: string;
  je_id: string | null;
  credit_code: string | null;
  expense_id: string | null;
  expense_status: string | null;
  pay_acct_code: string | null;
  action: string;
};

const classPath = new URL(
  "../../docs/bus/fuel-remediation-classification-2026-09-25.json",
  import.meta.url,
);
const ONLY_ARG = process.argv.find((a) => a.startsWith("--only="));
let rows: Row[] = JSON.parse(fs.readFileSync(classPath, "utf8"));
if (ONLY_ARG) {
  const onlyIds = new Set(ONLY_ARG.split("=")[1].split(","));
  rows = rows.filter((r) => onlyIds.has(r.fuelId));
}

const counts: Record<string, number> = {};
const errors: { fuelId: string; action: string; error: string }[] = [];

// Raw client for simple status UPDATEs (accounting.expenses.status). All GL-affecting writes go
// through the real engines (voidDocument/voidJournalEntry, createExpenseFromFuelTransaction) --
// this client never touches journal_entries/journal_entry_postings directly.
const raw = new pg.Client({ connectionString: DATABASE_URL });
await raw.connect();

async function withScope<T>(fn: () => Promise<T>): Promise<T> {
  await raw.query("BEGIN");
  await raw.query("SELECT set_config('app.bypass_rls', 'lucia', true)");
  await raw.query(`SELECT set_config('app.operating_company_id', '${USMCA}', true)`);
  try {
    const out = await fn();
    await raw.query("COMMIT");
    return out;
  } catch (err) {
    await raw.query("ROLLBACK");
    throw err;
  }
}

async function markExpenseVoid(expenseId: string, reversingJeId: string | null, reason: string) {
  await withScope(() =>
    raw.query(
      `UPDATE accounting.expenses
         SET status='void',
             posting_status = CASE WHEN posting_status='posted' THEN 'reversed' ELSE posting_status END,
             reversed_by_je_id = COALESCE($2::uuid, reversed_by_je_id),
             voided_at = now(), voided_by_user_id = $3::uuid, void_reason = $4, updated_at = now()
       WHERE id = $1::uuid AND voided_at IS NULL`,
      [expenseId, reversingJeId, OWNER_ACTOR.userId, reason],
    ),
  );
}

async function reconfirmJeStillLive(jeId: string): Promise<boolean> {
  return withScope(async () => {
    const r = await raw.query(
      `SELECT 1 FROM accounting.journal_entries WHERE id = $1::uuid AND voided_at IS NULL AND status = 'posted'`,
      [jeId],
    );
    return r.rows.length > 0;
  });
}

async function main() {
  const { voidDocument } = await import(
    "../../apps/backend/src/accounting/void-document.service.js"
  );
  const { createExpenseFromFuelTransaction } = await import(
    "../../apps/backend/src/fuel/fuel-expense-document.service.js"
  );

  let processed = 0;
  for (const row of rows) {
    if (processed >= LIMIT) break;
    processed++;
    counts[row.action] = (counts[row.action] || 0) + 1;
    log("BEGIN row", row.fuelId, row.action);
    try {
      switch (row.action) {
        case "EXPENSE_ALREADY_CORRECT_no_op":
        case "VOID_DUPLICATE_already_clean":
          continue;

        case "ORPHAN_VOID_JE_ONLY":
        case "PRE_EXISTING_CORRECT_EXPENSE_VOID_JE_ONLY": {
          if (!row.je_id) throw new Error(`${row.action} with no je_id`);
          const stillLive = await reconfirmJeStillLive(row.je_id);
          if (!stillLive) {
            errors.push({
              fuelId: row.fuelId,
              action: row.action,
              error: `JE ${row.je_id} no longer live -- skipped, re-classify.`,
            });
            break;
          }
          if (EXECUTE) {
            log("  voidDocument(journal_entry, pre-existing-correct-expense case) start", row.je_id);
            await voidDocument(raw, {
              operatingCompanyId: USMCA,
              type: "journal_entry",
              id: row.je_id,
              reason: VOID_REASON_WRONG_ACCOUNT,
              actor: OWNER_ACTOR,
              currentBusinessDate: TODAY,
            });
            log("  voidDocument(journal_entry) done -- expense document left untouched (already correct)");
          }
          break;
        }

        case "VOID_DUPLICATE_expense_needs_void":
        case "VOID_DUPLICATE_expense_and_je_need_void":
        case "VOID_DUPLICATE_je_needs_void_only": {
          // BUG FOUND 2026-09-25: this bucket previously only ever voided the expense document,
          // never the underlying JE -- a duplicate with no expense but a live wrong-1090 JE was
          // silently left untouched. Every duplicate with a live JE gets it voided; the expense
          // (if any) is also voided, but a duplicate is NEVER recreated afterward.
          if (row.action !== "VOID_DUPLICATE_je_needs_void_only" && !row.expense_id) {
            throw new Error(`${row.action} with no expense_id`);
          }
          if (row.action !== "VOID_DUPLICATE_expense_needs_void" && !row.je_id) {
            throw new Error(`${row.action} with no je_id`);
          }
          if (EXECUTE) {
            if (row.expense_id) {
              await voidDocument(raw, {
                operatingCompanyId: USMCA,
                type: "expense",
                id: row.expense_id,
                reason: VOID_REASON_DUPLICATE(row.fuelId),
                actor: OWNER_ACTOR,
                currentBusinessDate: TODAY,
              });
              await markExpenseVoid(row.expense_id, null, VOID_REASON_DUPLICATE(row.fuelId));
            }
            if (row.je_id) {
              const stillLive = await reconfirmJeStillLive(row.je_id);
              if (!stillLive) {
                errors.push({ fuelId: row.fuelId, action: row.action, error: `JE ${row.je_id} no longer live -- skipped, re-classify.` });
              } else {
                log("  voidDocument(journal_entry, duplicate) start", row.je_id);
                await voidDocument(raw, {
                  operatingCompanyId: USMCA,
                  type: "journal_entry",
                  id: row.je_id,
                  reason: VOID_REASON_DUPLICATE(row.fuelId),
                  actor: OWNER_ACTOR,
                  currentBusinessDate: TODAY,
                });
                log("  voidDocument(journal_entry, duplicate) done");
              }
            }
          }
          break;
        }

        case "NO_EXPENSE_HAS_WRONG_JE_void_then_create":
        case "EXPENSE_ADOPTED_WRONG_JE_void_je_and_expense_then_recreate": {
          if (!row.je_id) throw new Error(`${row.action} with no je_id`);
          const stillLive = await reconfirmJeStillLive(row.je_id);
          if (!stillLive) {
            errors.push({
              fuelId: row.fuelId,
              action: row.action,
              error: `JE ${row.je_id} is no longer live (voided/reversed since classification) -- skipped, re-classify.`,
            });
            break;
          }
          if (EXECUTE) {
            log("  voidDocument(journal_entry) start", row.je_id);
            await voidDocument(raw, {
              operatingCompanyId: USMCA,
              type: "journal_entry",
              id: row.je_id,
              reason: VOID_REASON_WRONG_ACCOUNT,
              actor: OWNER_ACTOR,
              currentBusinessDate: TODAY,
            });
            log("  voidDocument(journal_entry) done");
            if (row.expense_id) {
              log("  markExpenseVoid start", row.expense_id);
              await markExpenseVoid(row.expense_id, null, VOID_REASON_WRONG_ACCOUNT);
              log("  markExpenseVoid done");
            }
            log("  createExpenseFromFuelTransaction start");
            const outcome = await createExpenseFromFuelTransaction(raw as never, {
              operating_company_id: USMCA,
              fuel_transaction_id: row.fuelId,
              requesting_user_uuid: SYSTEM_ACTOR_ID,
            });
            log("  createExpenseFromFuelTransaction done", outcome.outcome);
            if (outcome.outcome === "refused") {
              errors.push({ fuelId: row.fuelId, action: row.action, error: `create refused: ${outcome.reason}` });
            }
          }
          break;
        }

        case "NO_EXPENSE_NO_JE_create_fresh":
        case "EXPENSE_ALREADY_VOID_needs_recreate": {
          if (EXECUTE) {
            const outcome = await createExpenseFromFuelTransaction(raw as never, {
              operating_company_id: USMCA,
              fuel_transaction_id: row.fuelId,
              requesting_user_uuid: SYSTEM_ACTOR_ID,
            });
            if (outcome.outcome === "refused") {
              errors.push({ fuelId: row.fuelId, action: row.action, error: `create refused: ${outcome.reason}` });
            }
          }
          break;
        }

        default:
          errors.push({ fuelId: row.fuelId, action: row.action, error: "UNCLASSIFIED -- not handled" });
      }
    } catch (err) {
      errors.push({ fuelId: row.fuelId, action: row.action, error: String((err as Error)?.message ?? err) });
    }
  }

  console.log(EXECUTE ? "=== EXECUTED ===" : "=== DRY RUN (pass --execute to write) ===");
  console.log("Counts by action:", counts);
  console.log(`Errors: ${errors.length}`);
  if (errors.length) console.log(JSON.stringify(errors, null, 2));

  await raw.end();
}

main().catch(async (err) => {
  console.error(err);
  await raw.end();
  process.exit(1);
});
