// Shared harness for CC-3's 2026-10-01 approved data scripts: dry run by default; --apply needs
// --auth AUTH-NNN, verified OPEN on main by scripts/verify-owner-authorization.mjs first.
import { execFileSync } from "node:child_process";
import pg from "pg";

export const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";

export function args() {
  const apply = process.argv.includes("--apply");
  const i = process.argv.indexOf("--auth");
  const authId = i > 0 ? process.argv[i + 1] : null;
  if (apply) {
    if (!authId || !/^AUTH-\d+$/.test(authId)) throw new Error("--apply requires --auth AUTH-NNN");
    execFileSync("node", ["scripts/verify-owner-authorization.mjs", authId], { stdio: "inherit" });
  }
  return { apply, authId };
}

export async function run(label, body, opts = {}) {
  const { apply, authId } = args();
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL required");
  const c = new pg.Client({ connectionString: url });
  await c.connect();
  try {
    // asTableOwner: only for an approved DELETE on a table whose RLS has no DELETE policy for the app
    // role (by design nothing is deletable through the app); the AUTH entry names this explicitly.
    if (opts.asTableOwner) await c.query("RESET ROLE");
    await c.query("BEGIN");
    await c.query("SELECT set_config('app.bypass_rls','lucia',true)");
    await c.query("SELECT set_config('app.operating_company_id',$1,true)", [USMCA]);
    const result = await body(c, { apply, authId });
    if (apply) {
      await c.query("SELECT audit.append_event($1,'info',$2::jsonb,NULL,$3)", [
        `cc3.${label}`, JSON.stringify({ auth_id: authId, operating_company_id: USMCA, ...result }), `CC-3-${authId}`,
      ]);
      await c.query("COMMIT");
      console.log(`${label}: APPLIED under ${authId}`, JSON.stringify(result));
    } else {
      await c.query("ROLLBACK");
      console.log(`${label}: DRY RUN (rolled back)`, JSON.stringify(result));
    }
  } catch (e) {
    await c.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    await c.end();
  }
}
