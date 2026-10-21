import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Client } from 'pg';
import { randomUUID } from 'node:crypto';
import { repairReassignedPresettlementBoundaries, suggestPresettlementLink, confirmPresettlementLink } from '../presettlement-link.service.js';
const { audit } = vi.hoisted(() => ({ audit: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../../audit/crud-audit.js', () => ({ appendCrudAudit: audit }));
const enabled = Boolean(process.env.TEST_DATABASE_URL) || process.env.GITHUB_ACTIONS === 'true';
const url = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
const database = `codex_443200c_${randomUUID().replaceAll('-', '')}`;
let c: Client;
let admin: Client;
const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
describe.skipIf(!enabled)('reassigned boundary repair — isolated local database only', () => {
beforeAll(async () => {
  if (!url || !['localhost', '127.0.0.1', 'postgres'].includes(new URL(url).hostname)) {
    throw new Error('Requires loopback/CI PostgreSQL; never production');
  }
  admin = new Client({ connectionString: url });
  await admin.connect();
  await admin.query(`CREATE DATABASE "${database}"`);
  const isolated = new URL(url); isolated.pathname = `/${database}`;
  c = new Client({ connectionString: isolated.toString() });
  await c.connect();
  await c.query(`CREATE SCHEMA driver_finance; CREATE SCHEMA mdata;
    CREATE TABLE driver_finance.driver_settlements (id uuid PRIMARY KEY, operating_company_id uuid, driver_id uuid,
      tour_id uuid, status text, trip_closed_at timestamptz, voided_at timestamptz, posted_at timestamptz,
      first_load_id uuid, last_load_id uuid, updated_at timestamptz, display_id text, created_at timestamptz DEFAULT now());
    CREATE TABLE driver_finance.driver_settlement_gl_runs (settlement_id uuid, operating_company_id uuid, status text);
    CREATE TABLE mdata.loads (id uuid PRIMARY KEY, operating_company_id uuid, presettlement_link_id uuid,
      soft_deleted_at timestamptz, voided_at timestamptz, status text, created_at timestamptz,
      assigned_unit_id uuid, assigned_primary_driver_id uuid, trip_type text, tour_id uuid, updated_at timestamptz);
    CREATE TABLE driver_finance.presettlement_link_suggestions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), operating_company_id uuid, load_id uuid, driver_id uuid,
      unit_id uuid, trip_type text, tour_id uuid, suggested_settlement_id uuid, suggested_reason text,
      status text DEFAULT 'pending', assigned_settlement_id uuid, assigned_at timestamptz, assigned_by_user_id uuid, updated_at timestamptz);`);
});
afterAll(async () => {
  await c?.end();
  if (admin) {
    await admin.query(`DROP DATABASE IF EXISTS "${database}"`);
    await admin.end();
  }
});
  it.each(['open', 'closed'])('repairs only an unposted open header (%s)', async status => {
    await c.query('BEGIN');
    try {
      audit.mockClear();
      await c.query(`INSERT INTO driver_finance.driver_settlements
        (id,operating_company_id,driver_id,tour_id,status,first_load_id,last_load_id)
        VALUES ($1,$3,$4,$5,$6,$7,$7),($2,$3,$4,$5,'paid',$7,$7)`,
      [id(1),id(2),id(3),id(4),id(5),status,id(6)]);
      await c.query(`INSERT INTO mdata.loads (id,operating_company_id,presettlement_link_id,soft_deleted_at,voided_at,status,created_at) VALUES ($1,$2,$3,NULL,NULL,'invoiced',now())`, [id(6),id(3),id(2)]);
      await repairReassignedPresettlementBoundaries(c, {operating_company_id:id(3),driver_id:id(4),tour_id:id(5),actor_user_id:id(9)});
      const r = await c.query('SELECT id, first_load_id,last_load_id,status FROM driver_finance.driver_settlements ORDER BY id');
      expect(r.rows[0]).toMatchObject({first_load_id:status==='open'?null:id(6),last_load_id:status==='open'?null:id(6),status});
      expect(r.rows[1]).toMatchObject({first_load_id:id(6),last_load_id:id(6),status:'paid'});
      expect(audit).toHaveBeenCalledTimes(status==='open'?1:0);
    } finally { await c.query('ROLLBACK'); }
  });
  it('re-derives both boundaries from actual links, excludes cancelled rows, and is idempotent', async () => {
    await c.query('BEGIN');
    try {
      audit.mockClear();
      await c.query(`INSERT INTO driver_finance.driver_settlements
        (id,operating_company_id,driver_id,tour_id,status,first_load_id,last_load_id)
        VALUES ($1,$3,$4,$5,'open',$6,$6),($2,$3,$4,$5,'paid',$6,$6)`, [id(1),id(2),id(3),id(4),id(5),id(6)]);
      await c.query(`INSERT INTO mdata.loads (id,operating_company_id,presettlement_link_id,soft_deleted_at,voided_at,status,created_at) VALUES
        ($1,$5,$6,NULL,NULL,'invoiced','2026-10-01'),
        ($2,$5,$7,NULL,NULL,'dispatched','2026-10-02'),
        ($3,$5,$7,NULL,NULL,'dispatched','2026-10-03'),
        ($4,$5,$7,NULL,NULL,'cancelled','2026-10-04')`,[id(6),id(7),id(8),id(10),id(3),id(2),id(1)]);
      const input={operating_company_id:id(3),driver_id:id(4),tour_id:id(5),actor_user_id:id(9)};
      await repairReassignedPresettlementBoundaries(c,input);
      await repairReassignedPresettlementBoundaries(c,input);
      expect((await c.query('SELECT first_load_id,last_load_id FROM driver_finance.driver_settlements WHERE id=$1',[id(1)])).rows[0])
        .toEqual({first_load_id:id(7),last_load_id:id(8)});
      expect(audit).toHaveBeenCalledTimes(1);
    } finally { await c.query('ROLLBACK'); }
  });
  it.each(['reassigned', 'empty', 'posted-run', 'other-unit'])('real suggest/confirm handles %s eligibility', async mode => {
    await c.query('BEGIN');
    try {
      audit.mockClear();
      await c.query(`INSERT INTO driver_finance.driver_settlements
        (id,operating_company_id,driver_id,tour_id,status,first_load_id,last_load_id)
        VALUES ($1,$3,$4,$5,'open',$6,$6),($2,$3,$4,$5,'paid',NULL,NULL)`,
      [id(1),id(2),id(3),id(4),id(5), mode==='reassigned'||mode==='other-unit'?id(6):null]);
      if (mode==='reassigned'||mode==='other-unit') await c.query(`INSERT INTO mdata.loads
        (id,operating_company_id,presettlement_link_id,status,created_at,assigned_unit_id,assigned_primary_driver_id,trip_type,tour_id)
        VALUES ($1,$2,$3,'invoiced',now(),$4,$5,'NB',$6)`,
      [id(6),id(3),mode==='reassigned'?id(2):id(1),mode==='other-unit'?id(20):id(10),id(4),id(5)]);
      if (mode==='posted-run') await c.query(`INSERT INTO driver_finance.driver_settlement_gl_runs VALUES ($1,$2,'posted')`,[id(1),id(3)]);
      await c.query(`INSERT INTO mdata.loads
        (id,operating_company_id,status,created_at,assigned_unit_id,assigned_primary_driver_id,trip_type,tour_id)
        VALUES ($1,$2,'dispatched',now(),$3,$4,'NB',$5)`, [id(7),id(3),id(10),id(4),id(5)]);
      const suggestion = await suggestPresettlementLink(c,{operating_company_id:id(3),load_id:id(7),driver_id:id(4),
        unit_id:id(10),trip_type:'NB',tour_id:id(5),actor_user_id:id(9)});
      const rejected=mode==='posted-run'||mode==='other-unit';
      expect(suggestion.suggested_settlement_id).toBe(rejected?null:id(1));
      const confirmation = confirmPresettlementLink(c,{operating_company_id:id(3),suggestion_id:suggestion.suggestion_id,
        action:'link_existing',override_settlement_id:id(1),actor_user_id:id(9)});
      if(rejected) await expect(confirmation).rejects.toMatchObject({code:'target_settlement_not_open'});
      else {
        expect(await confirmation).toMatchObject({settlement_id:id(1),status:'confirmed'});
        expect((await c.query('SELECT first_load_id,last_load_id,status FROM driver_finance.driver_settlements WHERE id=$1',[id(1)])).rows[0])
          .toEqual({first_load_id:id(7),last_load_id:id(7),status:'open'});
        expect((await c.query('SELECT presettlement_link_id FROM mdata.loads WHERE id=$1',[id(7)])).rows[0].presettlement_link_id).toBe(id(1));
      }
    } finally { await c.query('ROLLBACK'); }
  });
});
