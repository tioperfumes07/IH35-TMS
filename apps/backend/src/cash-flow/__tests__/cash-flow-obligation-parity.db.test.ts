import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { refuseProductionConnectionString, refuseProductionDatabase } from '../../../test-helpers/refuse-production.js';
import { cashFlowSettlementEligibilitySql } from '../cash-flow-obligations.sql.js';
import { openDriverBill, driverBillAmountKnown } from '../../accounting/live-document-predicates.sql.js';

const url = process.env.CASH_FLOW_PARITY_DATABASE_URL ?? (process.env.CI ? process.env.DATABASE_URL : undefined);
describe.skipIf(!url)('settlement cash eligibility on isolated PostgreSQL', () => {
  let client: pg.Client;
  beforeAll(async () => {
    refuseProductionConnectionString(url);
    client = new pg.Client({connectionString:url}); await client.connect();
    await refuseProductionDatabase(client);
    await client.query('BEGIN READ ONLY');
    const branch = (await client.query("SELECT current_setting('neon.branch_id',true) AS id")).rows[0].id;
    if (branch) {
      expect(branch).not.toBe('br-fancy-credit-akjnd07a');
      expect(branch).toBe(process.env.CASH_FLOW_PARITY_FORK_ID);
    } else {
      expect(['127.0.0.1','localhost','[::1]']).toContain(new URL(url!).hostname);
    }
  });
  afterAll(async () => { if(client) { await client.query('ROLLBACK'); await client.end(); } });
  it('finalized and queued live obligations survive; void/reversed/paid/open-unscheduled do not', async () => {
    const result = await client.query(`SELECT s.id FROM (VALUES
      (1,'approved','unpaid',100::numeric,NULL::timestamptz,NULL::timestamptz,NULL::date),
      (2,'closed','unpaid',100,NULL,NULL,NULL),
      (3,'open','queued',100,NULL,NULL,NULL),
      (4,'cancelled','unpaid',100,now(),now(),NULL),
      (5,'closed','cleared',100,NULL,NULL,NULL),
      (6,'closed','unpaid',100,NULL,now(),NULL),
      (7,'open','unpaid',100,NULL,NULL,NULL),
      (8,'open','unpaid',100,NULL,NULL,DATE '2030-01-01'),
      (9,'posted','manual_paid',100,NULL,NULL,NULL),
      (10,'final','unpaid',0,NULL,NULL,NULL)
    ) AS s(id,status,payment_state,net_pay,voided_at,reversed_at,bank_settle_date)
    WHERE ${cashFlowSettlementEligibilitySql('s')} ORDER BY s.id`);
    expect(result.rows.map(r=>r.id)).toEqual([1,2,3,8]);
  });
  it('canonical open bills include approved, disputed and awaiting amounts without resurrecting voids', async () => {
    const result=await client.query(`SELECT db.status FROM (
      SELECT gen_random_uuid() AS id, '11111111-1111-4111-8111-111111111111'::uuid AS operating_company_id,
             status,NULL::timestamptz AS voided_at
      FROM unnest(ARRAY['open','approved','disputed','awaiting_short_miles','paid','void']) AS status
    ) db WHERE ${openDriverBill('db')} ORDER BY db.status`);
    expect(result.rows.map(r=>r.status)).toEqual(['approved','awaiting_short_miles','disputed','open']);
  });
  it('unknown bill costs are explicit and excluded from known aggregates, not priced at zero', async () => {
    const result=await client.query(`SELECT count(*) FILTER (WHERE NOT ${driverBillAmountKnown('db')})::int AS unknown_count,
      sum(gross_amount_cents) FILTER (WHERE ${driverBillAmountKnown('db')})::int AS known_cents
      FROM (VALUES ('open',200),('approved',300),('awaiting_short_miles',999)) db(status,gross_amount_cents)`);
    expect(result.rows).toEqual([{unknown_count:1,known_cents:500}]);
  });
});
