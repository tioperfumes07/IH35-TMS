/**
 * ENG-11 G10 (row 249) — CC-2 verify-step 18799
 *
 * Claimed: 2026-10-25 via PR chore/claim-reserve-cc2-row249 (#27701), merged to main before this
 * file was authored.
 *
 * Guard: scripts/verify-one-active-linehaul-per-load.mjs
 *
 * Invariant: no USMCA load has more than 1 active linehaul charge line at a time.
 * A rate change REPLACES the linehaul (engine rule): update-load.service.ts deactivates all
 * active charge lines and inserts the new set in one transaction.
 *
 * Root cause: settlement-creator-seed-loads.ts was re-booking existing loads during
 * Edit+void+repost (before the 2026-10-11 adoption guard). Repaired 2026-10-16 on 10 loads.
 *
 * Baseline: 0 failures (verified 2026-10-25 on prod br-fancy-credit-akjnd07a).
 */
import { execFileSync } from "child_process";
import { fileURLToPath } from "url";
import { resolve, dirname } from "path";

const here = dirname(fileURLToPath(import.meta.url));
const guardPath = resolve(here, "..", "verify-one-active-linehaul-per-load.mjs");

execFileSync(process.execPath, [guardPath, ...process.argv.slice(2)], { stdio: "inherit" });
