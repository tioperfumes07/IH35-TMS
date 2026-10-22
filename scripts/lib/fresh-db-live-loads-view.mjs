import { assertNotProduction } from './assert-not-production.mjs';

export const LIVE_LOADS_MIGRATION = '202616070100_live_loads_exclude_voided.sql';
const quote = (name) => '"' + String(name).replaceAll('"', '""') + '"';

// Round 443.234: called INSIDE the pending migration's transaction. Never a
// production repair; immutable migration SQL and checksums remain untouched.
export async function prepareFreshLiveLoadsView(client, { file, hostname, database }) {
  if (file !== LIVE_LOADS_MIGRATION || !['localhost','127.0.0.1','::1','[::1]'].includes(hostname)) return null;
  const identity = await assertNotProduction(client, {
    label: 'fresh live-loads view', freshLoopbackMigration: {
      hostname, database, systemIdentifier: process.env.IH35_FRESH_DB_SYSTEM_IDENTIFIER,
    },
  });
  if (identity.branchId !== null) throw new Error('Fresh view repair refuses every Neon branch');
  await client.query('SET LOCAL row_security = off');
  await client.query('LOCK TABLE mdata.loads IN ACCESS EXCLUSIVE MODE');
  const population = await client.query('SELECT count(*)::text AS count FROM mdata.loads');
  if (population.rows[0]?.count !== '0') throw new Error('Fresh view repair requires zero load rows');
  const meta = await client.query(`SELECT pg_get_userbyid(c.relowner) AS owner,
    obj_description(c.oid, 'pg_class') AS comment
    FROM pg_class c WHERE c.oid = to_regclass('views.live_loads')`);
  const grants = await client.query(`SELECT CASE WHEN a.grantee=0 THEN 'PUBLIC'
    ELSE pg_get_userbyid(a.grantee) END AS grantee, a.privilege_type, a.is_grantable
    FROM pg_class c CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a
    WHERE c.oid=to_regclass('views.live_loads')`);
  await client.query(`ALTER TABLE mdata.loads
    ADD COLUMN IF NOT EXISTS reinstated_at timestamptz,
    ADD COLUMN IF NOT EXISTS reinstate_reason text,
    ADD COLUMN IF NOT EXISTS reinstated_by_user_id uuid,
    ADD COLUMN IF NOT EXISTS reinstated_from_void_je_id uuid,
    ADD COLUMN IF NOT EXISTS status_before_void text`);
  // RESTRICT intentionally refuses dependencies. Never cascade-delete another object.
  await client.query('DROP VIEW IF EXISTS views.live_loads RESTRICT');
  return async () => {
    if (!meta.rows.length) return;
    const currentGrants = await client.query(`SELECT DISTINCT CASE WHEN a.grantee=0 THEN 'PUBLIC'
      ELSE pg_get_userbyid(a.grantee) END AS grantee FROM pg_class c
      CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a
      WHERE c.oid='views.live_loads'::regclass`);
    for (const {grantee} of currentGrants.rows) {
      await client.query(`REVOKE ALL ON views.live_loads FROM ${grantee === 'PUBLIC' ? 'PUBLIC' : quote(grantee)}`);
    }
    await client.query(`ALTER VIEW views.live_loads OWNER TO ${quote(meta.rows[0].owner)}`);
    for (const {grantee, privilege_type, is_grantable} of grants.rows) {
      if (!['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'].includes(privilege_type)) throw new Error('Unknown view privilege');
      await client.query(`GRANT ${privilege_type} ON views.live_loads TO ${grantee === 'PUBLIC' ? 'PUBLIC' : quote(grantee)}${is_grantable ? ' WITH GRANT OPTION' : ''}`);
    }
    if (meta.rows[0].comment !== null) {
      await client.query(`COMMENT ON VIEW views.live_loads IS '${meta.rows[0].comment.replaceAll("'", "''")}'`);
    }
  };
}
