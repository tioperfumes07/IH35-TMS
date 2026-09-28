// require-non-bypass-rls.mjs — ROUND 210 interim fix. Owner-approved Option 1 (strip BYPASSRLS from
// ih35_ci_readonly) is blocked on a genuine Neon platform ceiling: no customer-facing role in this
// project — old or new, verified twice — can ever hold ADMIN OPTION over another role, so no
// GRANT/REVOKE/ALTER ROLE fix is executable until Neon support acts. Until then, this closes the
// hole at the application layer: every RLS-security-assertion guard calls this immediately after
// connecting, and it refuses to let the guard report anything but FAIL when the connection it is
// actually running on cannot enforce RLS in the first place.
//
// A guard that cannot fail is not a guard. This makes "cannot prove anything on this connection" a
// real, loud FAIL instead of a silent, meaningless PASS.
//
// Usage:
//   import { requireNonBypassRlsOrExit } from "./lib/require-non-bypass-rls.mjs";
//   const { client, pool } = await requireLiveDbOrExit({ label: LABEL });
//   await requireNonBypassRlsOrExit(client, LABEL);
//   // ... the guard's real RLS-security assertions, now backed by a connection that can enforce them

/**
 * @param {import("pg").PoolClient} client
 * @param {string} label
 * @returns {Promise<void>} resolves if the connection's current_user cannot bypass RLS; calls
 *   process.exit(1) and never returns otherwise.
 */
export async function requireNonBypassRlsOrExit(client, label) {
  const r = await client.query(`SELECT current_user AS role, rolbypassrls FROM pg_roles WHERE rolname = current_user`);
  const row = r.rows[0];
  if (!row) {
    console.error(`${label}: FAIL — could not resolve current_user in pg_roles; cannot prove anything about RLS enforcement on this connection.`);
    process.exit(1);
  }
  if (row.rolbypassrls) {
    console.error(
      `${label}: FAIL — connected as '${row.role}', which has BYPASSRLS. This connection cannot enforce ` +
        `row-level security, so this guard cannot prove anything it asserts — a PASS here would be a fake ` +
        `green (ROUND 205.5/210). Re-run with a genuinely non-bypass connection.`
    );
    process.exit(1);
  }
}

// Real, live, mutation-proof selftest — not a mocked fixture. Proves both directions against the
// actual database: `SET ROLE`-ing to a real bypass-capable role must exit 1; the ordinary pooled
// connection (current_user resolves to a non-bypass role) must proceed. Requires DATABASE_URL and a
// role this connection may SET ROLE into that has BYPASSRLS=true (neondb_owner on this project).
// Run directly: `node scripts/lib/require-non-bypass-rls.mjs --selftest`.
if (process.argv[1] && process.argv[1].endsWith("require-non-bypass-rls.mjs") && process.argv.includes("--selftest")) {
  const pgMod = await import("pg");
  const pg = pgMod.default ?? pgMod;
  const url = process.env.DATABASE_DIRECT_URL || process.env.DATABASE_URL;
  if (!url) {
    console.error("require-non-bypass-rls --selftest: FAIL — DATABASE_URL required to selftest against a real bypass-capable role.");
    process.exit(1);
  }

  const failures = [];

  // Case 1: a connection that IS bypass-capable must exit 1. Run in a child process since
  // process.exit(1) inside this same process would kill the second case too.
  const { spawnSync } = await import("node:child_process");
  const bypassCase = spawnSync(
    process.execPath,
    [
      "-e",
      `import("${new URL(import.meta.url).pathname}").then(async (m) => {
        const pgMod = await import("pg"); const pg = pgMod.default ?? pgMod;
        const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
        const client = await pool.connect();
        // Wrapped in an explicit transaction, matching every real guard's own convention -- ROUND
        // 210 found this pool hands out a genuine MIX of role-downgraded and raw-bypass backends
        // (measured live: 1 of 8 rapid connections landed on a real, undowngraded neondb_owner
        // backend), and RESET ROLE issued as a bare autocommit statement does not reliably persist
        // to the next autocommit statement on this pool -- only within one explicit transaction.
        await client.query("BEGIN");
        await client.query("RESET ROLE");
        await m.requireNonBypassRlsOrExit(client, "selftest-bypass-case");
        console.log("SHOULD-NOT-REACH-HERE");
      });`,
    ],
    { env: process.env, encoding: "utf8" }
  );
  if (bypassCase.status !== 1) {
    failures.push(`bypass-capable connection (RESET ROLE) exited ${bypassCase.status}, expected 1 — the helper is not stopping a fake-green connection`);
  }

  // Case 2: an ordinary connection whose backend is genuinely non-bypass must proceed without
  // exiting. This same pool hands out a real mix (see the comment above), so retry a handful of
  // times to land on a non-bypass backend for this assertion rather than treating a randomly-drawn
  // bypass-capable backend here as a failure -- that outcome is the helper working correctly, just
  // not what this specific case is trying to isolate.
  let reached = false;
  for (let attempt = 0; attempt < 5 && !reached; attempt++) {
    const pool = new pg.Pool({ connectionString: url, max: 1 });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const { rows } = await client.query("SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user");
      if (rows[0]?.rolbypassrls) {
        await client.query("ROLLBACK");
        continue; // drew a bypass-capable backend this attempt; retry for a clean one
      }
      await requireNonBypassRlsOrExit(client, "selftest-nonbypass-case");
      await client.query("ROLLBACK");
      reached = true;
    } finally {
      client.release();
      await pool.end();
    }
  }
  if (!reached) failures.push("could not draw a non-bypass backend in 5 attempts to verify the ordinary-connection path (or the helper wrongly blocked one)");

  if (failures.length > 0) {
    console.error("require-non-bypass-rls --selftest FAIL:");
    for (const f of failures) console.error(`  ✗ ${f}`);
    process.exit(1);
  }
  console.log("require-non-bypass-rls --selftest PASS — bypass-capable connection correctly exits 1; ordinary connection correctly proceeds.");
}
