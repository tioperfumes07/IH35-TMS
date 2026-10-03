// gate-db-credential.mjs — ONE resolver for the read-only guard credential.
//
// ROUND 370 (Lead, 2026-10-03). Before this file existed, the only code that knew how to find the
// `ih35_ci_readonly` credential lived inside scripts/money-pr-local-gate.mjs. Two consequences,
// both measured, both expensive:
//
//   1. A guard run BY HAND — how every seat debugs one, and how the Lead measures production — had
//      no DATABASE_URL and failed closed with "DATABASE_URL not set" (ROUND 29.9-B). Failing closed
//      is correct; failing closed while a working credential sits unread two files away is not.
//      CC-3 reported the same shape from the other side: three separate entry points each deciding
//      independently how a guard gets its connection.
//   2. .husky/pre-push deliberately does not source .env (Rule 18 / CURSOR-PIPELINE-REPAIR P0-1), so
//      every push ran with DATABASE_URL unset and the gate's substitution — itself gated on
//      DATABASE_URL already being set — never fired. Docs-only branches were unpushable for weeks.
//
// So resolution lives here, once. money-pr-local-gate.mjs and lib/require-live-db.mjs both call it.
// Adding a third caller is fine. Writing a fourth copy of this logic is not.
//
// WHAT THIS DOES NOT CHANGE:
//   * It returns a READ-ONLY credential. `ih35_ci_readonly` cannot write, and a guard that must
//     INSERT or SET ROLE ih35_app (verify-workflow-requests-entity-scoped) is handed the caller's
//     own writer URL explicitly — never this one.
//   * When nothing resolves it returns undefined and the caller fails closed exactly as before. A
//     live money guard that cannot connect is a FAIL, never a pass (ROUND 29.9-B owner ruling).
//   * The value is read once, memoized, and NEVER logged. It is a live credential: not in an error
//     message, not in a bus file, not in a commit message or a PR body (standing order, owner).
//
// Precedence, highest first:
//   1. process.env.DATABASE_URL_READONLY — lets CI inject its own scoped secret, and lets a seat
//      without the master-keys file opt in without touching any source file.
//   2. The owner-designated master credentials file, reading ONLY its dedicated
//      "READONLY GATE CREDENTIAL (ih35_ci_readonly)" section. ROUND 210 (CC-1) moved this here from
//      ~/.config/ih35/neon-prod-readonly.url, which was silently overwritten on 2026-09-28 with
//      neondb_owner credentials — a read-only gate credential quietly became a real-bypass one with
//      nothing in the repo to notice. The section-scoped regex means a stray edit elsewhere in that
//      document cannot be misread as this credential.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const MASTER_KEYS_FILE = path.join(
  os.homedir(),
  "Desktop/09-28-2026-IH35-MASTER-KEYS-ENVS-SINGLE-SOURCE-OF-TRUTH.md"
);

export const READONLY_SECTION_RE =
  /## READONLY GATE CREDENTIAL[^\n]*\n(?:(?!\n## )[^\n]*\n)*?\s*(postgresql:\/\/\S+)/;

let cached;

/**
 * The gate's own read-only credential, or undefined when none can be resolved.
 * Never logged. Memoized for the life of the process.
 * @returns {string | undefined}
 */
export function resolveGateReadonlyDbUrl() {
  // verify-no-silent-db-skip strips every credential to prove a live guard FAILS CLOSED with none; this switch lets it
  // strip the fallback too (otherwise a stripped guard quietly finds this credential and runs live — a different test).
  if (process.env.IH35_NO_GATE_CREDENTIAL_FALLBACK === "1") return undefined;
  if (cached !== undefined) return cached || undefined;

  if (process.env.DATABASE_URL_READONLY) {
    cached = process.env.DATABASE_URL_READONLY;
    return cached;
  }

  try {
    const doc = fs.readFileSync(MASTER_KEYS_FILE, "utf8");
    const match = doc.match(READONLY_SECTION_RE);
    cached = match ? match[1].trim() : "";
  } catch {
    // No file, no permission, not this machine — all the same answer: no credential, and the caller
    // fails closed. Never surface the path or the error.
    cached = "";
  }

  return cached || undefined;
}
