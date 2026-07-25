// Shared PROD-TARGET refusal for any script that WRITES fixtures to a database.
//
// Why this exists (LST-SEED-01, 2026-07-25): scripts in this repo call `dotenv.config()` and resolve
// `DATABASE_DIRECT_URL || DATABASE_URL`. When `.env` carries the prod Neon URL — and it does — an inline
// local `DATABASE_URL` is silently overridden by dotenv and the script connects to PRODUCTION.
// `scripts/db-migrate.mjs` has carried its own refusal for this since 2026-06-28. The RLS cross-carrier
// leak harness did NOT, and it INSERTs fixture rows: it wrote 259 `USMCA-1 leak test <hex>` rows into live
// `catalogs.complaint_types` on TRANSP, which a later audit misread as a TRK/USMCA "seed gap" and nearly
// got seeded to all three entities. CI was never the source (ci.yml points these at an ephemeral
// postgres:16-alpine on localhost); the pollution came from local runs.
//
// The control belongs in ONE place so a second fixture-writing script cannot repeat it.
//
// DESIGN CHOICE — fixture writers fail CLOSED with NO escape hatch. A script that INSERTs test rows has
// no legitimate reason to run against production, so there is deliberately no override env var. In
// particular this must never reuse `ALLOW_PROD_MIGRATE`: prod deploys set that for the real migration
// step, so honouring it here would re-open the exact hole on every deploy.

const DEFAULT_PROD_HOST_MARKERS = "ep-broad-block-akykk7bw";

export function resolveTargetHost(connectionString) {
  if (!connectionString) return "";
  try {
    const u = new URL(connectionString);
    if (u.hostname) return u.hostname;
  } catch {
    /* not a standard URL — fall through to the query-string host= form (unix socket) */
  }
  const m = /[?&]host=([^&\s]+)/.exec(connectionString);
  return m ? decodeURIComponent(m[1]) : "";
}

export function resolveTargetDb(connectionString) {
  if (!connectionString) return "?";
  try {
    const u = new URL(connectionString);
    const p = (u.pathname || "").replace(/^\//, "");
    if (p) return p;
  } catch {
    /* fall through */
  }
  const m = /\/([^/?]+)(\?|$)/.exec(connectionString);
  return m ? m[1] : "?";
}

// Host substrings that identify the production compute endpoint. Extend via PROD_HOST_BLOCKLIST
// (comma-separated) if the prod endpoint ever changes; PROD_MIGRATE_BLOCKLIST is honoured too so this
// stays in step with the marker list db-migrate.mjs already uses.
export function prodHostMarkers(env = process.env) {
  return (env.PROD_HOST_BLOCKLIST || env.PROD_MIGRATE_BLOCKLIST || DEFAULT_PROD_HOST_MARKERS)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function targetIsProd(connectionString, env = process.env) {
  const host = resolveTargetHost(connectionString);
  if (!host) return false; // local unix socket / no host — never the prod endpoint
  return prodHostMarkers(env).some((marker) => host.includes(marker));
}

/**
 * Print the resolved target and REFUSE to continue when it is production.
 * Call this BEFORE opening a pool or inserting anything.
 * Exits the process with a non-zero code on a prod target; returns {host, db} otherwise.
 */
export function assertNotProdTarget({ label, connectionString, env = process.env, exit = true }) {
  const host = resolveTargetHost(connectionString);
  const db = resolveTargetDb(connectionString);
  console.error(`[${label}] target: host=${host || "(local socket)"} db=${db}`);

  if (targetIsProd(connectionString, env)) {
    console.error(`[${label}] REFUSED — this script writes fixture rows and the target is PRODUCTION.`);
    console.error(`             host=${host}`);
    console.error("  dotenv loads .env, and DATABASE_DIRECT_URL there points at prod — it overrides an");
    console.error("  inline DATABASE_URL. Point this at a throwaway or Neon-branch database instead:");
    console.error(`    DATABASE_DIRECT_URL= DATABASE_URL='postgres://…@localhost:54329/ih35_verify' npm run ${label}`);
    console.error("  There is NO override flag: a fixture writer must never touch production.");
    if (exit) process.exit(1);
    return { host, db, refused: true };
  }
  return { host, db, refused: false };
}
