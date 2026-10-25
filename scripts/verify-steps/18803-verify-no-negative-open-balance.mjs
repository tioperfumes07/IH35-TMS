/**
 * Row 21 (QBO unapplied credit) — CC-2 verify-step 18803
 *
 * Claimed: 2026-10-25 via PR chore/claim-reserve-cc2-row21 (#27719), merged to main before this
 * file was authored.
 *
 * Guard: scripts/verify-no-negative-open-balance.mjs
 *
 * Invariant: no USMCA bill has paid_cents > amount_cents, and no USMCA invoice has
 * amount_paid_cents > total_cents. A bill/invoice reduced below what was already collected
 * must generate an unapplied vendor credit / credit memo — never a negative open balance.
 *
 * Baseline: 0 overpaid bills, 0 overpaid invoices (measured 2026-10-25 on prod br-fancy-credit-akjnd07a).
 */
import { execFileSync } from "child_process";
import { fileURLToPath } from "url";
import { resolve, dirname } from "path";

const here = dirname(fileURLToPath(import.meta.url));
const guardPath = resolve(here, "..", "verify-no-negative-open-balance.mjs");

execFileSync(process.execPath, [guardPath, ...process.argv.slice(2)], { stdio: "inherit" });
