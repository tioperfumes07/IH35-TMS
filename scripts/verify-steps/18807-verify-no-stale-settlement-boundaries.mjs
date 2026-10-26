/**
 * Row 84 (443.260) — CC-2 verify-step 18807
 *
 * Claimed: 2026-10-25 via PR chore/claim-reserve-cc2-row84 (#27724), merged to main before this
 * file was authored.
 *
 * Guard: scripts/verify-no-stale-settlement-boundaries.mjs
 *
 * Invariant: no USMCA settlement may have first_load_id = last_load_id while its active lines
 * name 2+ distinct load_ids. The incremental COALESCE boundary writers that caused this class
 * (repairReassignedPresettlementBoundaries + pre-settlement link) were replaced by the single
 * boundary engine (rederiveSettlementBoundariesInClientTx via settlement-boundaries.service.ts).
 *
 * Baseline: 0 stale boundaries (AUTH-454 repair ran 2026-10-25 on prod; all 5 verified fixed).
 */
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const guardPath = resolve(here, "..", "verify-no-stale-settlement-boundaries.mjs");

execFileSync(process.execPath, [guardPath, ...process.argv.slice(2)], { stdio: "inherit" });
