/**
 * ENG-03 (CC-1 443.322) — every driver_finance.escrow_ledger row must carry a load_id.
 *
 * Root cause: recordEscrowContribution wrote 'hold' rows without load_id or settlement_id;
 * unwindPayRunSubledgersInClientTx wrote 'release' rows with settlement_id but no load_id.
 * Both are now fixed. Migration 202616240000 backfills the 58 existing NULL rows.
 *
 * Guard: scripts/verify-escrow-ledger-row-has-load.mjs
 * Step: 18773 (CC-1 ≡1 mod 4, claimed 2026-10-24)
 */
import { execFileSync } from "child_process";
import { fileURLToPath } from "url";
import { resolve, dirname } from "path";

const here = dirname(fileURLToPath(import.meta.url));
const guardPath = resolve(here, "..", "verify-escrow-ledger-row-has-load.mjs");

execFileSync(process.execPath, [guardPath, ...process.argv.slice(2)], { stdio: "inherit" });
