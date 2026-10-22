import { describe, expect, it } from 'vitest';
import { getDailyPrediction, getRollingLedgerRows } from '../cash-flow.service.js';
import { BILL_OPEN_BALANCE_SQL } from '../../accounting/bills.service.js';

async function consumerQueries() {
  const queries: string[] = [];
  const client = { query: async (sql: string) => {
    queries.push(sql);
    return { rows: sql.includes('information_schema.columns') ? [{}, {}, {}] : [] };
  }};
  await getDailyPrediction(client as never, '11111111-1111-4111-8111-111111111111', '2030-01-01', true);
  const daily = [...queries]; queries.length = 0;
  await getRollingLedgerRows(client as never, '11111111-1111-4111-8111-111111111111', '2030-01-01');
  return { daily, rolling: queries };
}

describe('cash-flow obligation parity across actual consumer SQL', () => {
  it('rolling includes the same finalized or scheduled unpaid settlements as daily and strip', async () => {
    const {daily, rolling} = await consumerQueries();
    const candidates = [...daily, ...rolling].filter(q => q.includes('FROM driver_finance.driver_settlements s'));
    expect(candidates.length).toBeGreaterThanOrEqual(3);
    for (const sql of candidates) {
      expect(sql).toContain("s.status IN ('locked', 'final', 'approved', 'posted', 'closed')");
      expect(sql).toContain("IN ('queued', 'sent_to_bank')");
      expect(sql).toContain('s.voided_at IS NULL');
      expect(sql).toContain('s.reversed_at IS NULL');
      expect(sql).toContain("NOT IN ('cleared', 'manual_paid', 'bounced')");
    }
  });
  it('daily strip and rolling bills use the same balance net of credits and applications', async () => {
    const {daily, rolling} = await consumerQueries();
    const candidates = [...daily, ...rolling].filter(q => q.includes('FROM accounting.bills b'));
    expect(candidates.length).toBeGreaterThanOrEqual(3);
    for (const sql of candidates) {
      expect(sql).toContain(BILL_OPEN_BALANCE_SQL);
      expect(sql).toContain("'partially_paid'");
      expect(sql).toContain('b.voided_at IS NULL');
      expect(sql).toContain('b.revoked_at IS NULL');
    }
  });
  it('both driver-bill consumers recognize every outstanding bill status', async () => {
    const {daily,rolling}=await consumerQueries();
    const candidates=[...daily,...rolling].filter(q=>q.includes('FROM driver_finance.driver_bills db'));
    expect(candidates).toHaveLength(2);
    for(const sql of candidates){
      for(const status of ['open','approved','disputed','awaiting_short_miles']) expect(sql).toContain(`'${status}'`);
      expect(sql).toContain('db.voided_at IS NULL');
      expect(sql).toContain('source_driver_bill_id = db.id');
      expect(sql).toContain("(db.status <> 'awaiting_short_miles') AS amount_known");
      expect(sql).toContain("OR NOT (db.status <> 'awaiting_short_miles')");
    }
  });
});
