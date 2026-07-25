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
// DESIGN CHOICE — fixture writers fail CLOSED. There is no override env var, and (H2, 2026-07-25) env
// marker lists can only WIDEN the refusal, never replace it. The decision is an ALLOWLIST: a writer may
// proceed only against a demonstrably local host, so a prod endpoint named via Neon's options=endpoint SNI
// form, or reached through a localhost tunnel, is refused too.
//
// A script that INSERTs test rows has no legitimate reason to run against production, so there is
// deliberately no override env var. In particular this must never reuse `ALLOW_PROD_MIGRATE`: prod
// deploys set that for the real migration step, so honouring it here would re-open the hole on every
// deploy.

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

// Host substrings that identify the production compute endpoint.
//
// CORRECTED 2026-07-25 (independent review, finding H2). The first version of this read
//   (env.PROD_HOST_BLOCKLIST || env.PROD_MIGRATE_BLOCKLIST || DEFAULT_PROD_HOST_MARKERS)
// which REPLACES the default rather than extending it, so `PROD_MIGRATE_BLOCKLIST=zzz` disarmed the
// refusal entirely and prod was ALLOWED. That variable is legitimately used by scripts/db-migrate.mjs,
// so any shell or CI job that set it for the migrator silently disabled this guard for every fixture
// writer — while the comment claimed "Extend via" and the header claimed "there is NO override flag".
// Both were false. Env markers are now UNIONED with the default, which can therefore only ever widen.
export function prodHostMarkers(env = process.env) {
  const extra = [env.PROD_HOST_BLOCKLIST, env.PROD_MIGRATE_BLOCKLIST]
    .filter(Boolean)
    .join(",");
  return [DEFAULT_PROD_HOST_MARKERS, extra]
    .filter(Boolean)
    .join(",")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

// Hosts a fixture writer is permitted to touch. A blocklist can only ever enumerate the prod endpoints
// somebody remembered; an allowlist fails closed on everything else — including a localhost pgbouncer or
// SSH tunnel that forwards to prod, which no host blocklist can detect.
const LOCAL_HOST_ALLOWLIST = [/^localhost$/i, /^127\.0\.0\.1$/, /^::1$/, /^\[::1\]$/, /^\/.*/ /* unix socket path */];

// Neon also accepts the endpoint id OUTSIDE the hostname, as a libpq option:
//   postgres://user:pw@pg.neon.tech/db?options=endpoint%3Dep-broad-block-akykk7bw
// The hostname there carries no marker at all, so hostname matching alone misses it.
function connectionStringNamesProdEndpoint(connectionString, markers) {
  if (!connectionString) return false;
  const decoded = (() => {
    try {
      return decodeURIComponent(connectionString);
    } catch {
      return connectionString;
    }
  })();
  return markers.some((marker) => decoded.includes(marker));
}

export function targetIsProd(connectionString, env = process.env) {
  const host = resolveTargetHost(connectionString);
  const markers = prodHostMarkers(env);

  // Any appearance of a prod endpoint id anywhere in the connection string — hostname, or the
  // `options=endpoint%3D…` SNI form — is production.
  if (connectionStringNamesProdEndpoint(connectionString, markers)) return true;
  if (host && markers.some((marker) => host.includes(marker))) return true;

  // Allowlist tail: anything that is not demonstrably local is treated as production for a writer.
  if (!host) return false; // no host at all = local unix socket
  return !LOCAL_HOST_ALLOWLIST.some((re) => re.test(host));
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
