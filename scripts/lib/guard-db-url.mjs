// guard-db-url.mjs — Lead 2026-10-03 (owner ordered repaired): GUARDS NEVER READ AS ih35_app.
//
// The app pool runs a session-level SET ROLE ih35_app on connect (apps/backend/src/auth/db.ts:55, :80).
// Behind Neon's pgbouncer (transaction mode) that SET survives on the server backend, so a guard that
// borrows a pooled backend as the same login arrives with current_user = ih35_app (session_user
// neondb_owner). Under that role a company-scoped RLS policy hides rows even with the bypass set —
// measured 2026-10-03: dispatch.load_charge_lines read 0 rows pooled, 284 rows / 136 company-less direct.
// A bare 0 from a pooled connection is MASKED, not empty.
//
// THE RULE, in the harness and not per script: every database URL handed to a guard is the DIRECT
// endpoint. A direct connection is a private backend; nothing another client SET survives into it.
// Applied by money-pr-local-gate (runNode), scripts/lib/run-required-guards.mjs (CI) and
// scripts/lib/require-live-db.mjs (every guard run by hand). Enforced by
// scripts/verify-guards-do-not-run-as-ih35_app.mjs.

export const GUARD_DB_ENV_KEYS = Object.freeze(["DATABASE_URL", "DATABASE_DIRECT_URL", "DATABASE_URL_READONLY"]);

// Neon pooled endpoints are the compute host with "-pooler" on the first label:
//   ep-broad-block-akykk7bw-pooler.c-3.us-west-2.aws.neon.tech -> ep-broad-block-akykk7bw.c-3.us-west-2.aws.neon.tech
const NEON_POOLER_LABEL = /^(ep-[a-z0-9-]+?)-pooler(\.)/i;

export function isPooledHost(hostname) {
  return NEON_POOLER_LABEL.test(String(hostname || ""));
}

/** Returns the same connection string on the direct endpoint. Credentials, database and query are untouched. */
export function directGuardUrl(url) {
  if (!url || typeof url !== "string") return url;
  const m = url.match(/^(postgres(?:ql)?:\/\/(?:[^@/]*@)?)([^/:?#]+)(.*)$/i);
  if (!m) return url;
  return m[1] + m[2].replace(NEON_POOLER_LABEL, "$1$2") + m[3];
}

/** A copy of env with every guard database URL moved to the direct endpoint. */
export function guardDbEnv(env = process.env) {
  const out = { ...env };
  for (const k of GUARD_DB_ENV_KEYS) if (out[k]) out[k] = directGuardUrl(out[k]);
  return out;
}

/** current_user a guard connection must never carry. */
export const FORBIDDEN_GUARD_ROLE = "ih35_app";
