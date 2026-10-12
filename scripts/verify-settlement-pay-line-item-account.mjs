#!/usr/bin/env node
// BCF-09: a chosen native pay item determines the line AND the downstream A/P posting account.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const paths = {
  writer: 'apps/backend/src/driver-finance/settlement-pay-line.service.ts',
  close: 'apps/backend/src/driver-finance/settlement-payrun-close.service.ts',
  route: 'apps/backend/src/driver-finance/settlements.routes.ts',
  ui: 'apps/frontend/src/components/driver-finance/AddPayLineModal.tsx',
};
const sources = Object.fromEntries(Object.entries(paths).map(([key, path]) => [key, readFileSync(path, 'utf8')]));
function failures(s) {
  const bad = [];
  if (!/if \(!input\.itemId\)/.test(s.writer)) bad.push('missing item must refuse');
  if (!/i\.operating_company_id = \$2::uuid/.test(s.writer) || !/a\.operating_company_id = i\.operating_company_id/.test(s.writer)) bad.push('item and account must share company');
  if (!/i\.deactivated_at IS NULL AND a\.deactivated_at IS NULL AND a\.is_postable = true/.test(s.writer)) bad.push('item/account must be usable');
  if (!/const postingAccountId = payItem\.account_id/.test(s.writer)) bad.push('account must come from chosen item');
  if (!/posting_account_id, item_id, quantity, rate_cents, unit_of_measure/.test(s.writer) || !/payItem\.id, input\.amountCents/.test(s.writer)) bad.push('write item and computed quantity/rate contract');
  if (!s.writer.includes("'manual_entry'")) bad.push('use the schema-approved manual entry source');
  const close = s.close.slice(s.close.indexOf('async function loadSettlementPayItems'), s.close.indexOf('async function loadRecoverableAdvances'));
  if (!/accountId: r\.posting_account_id \?\? accounts\.driverPay/.test(close)) bad.push('earnings must retain selected account');
  if (!/const accountId = r\.posting_account_id \?\? accounts\.detention/.test(close)) bad.push('detention must retain selected account');
  const route = s.route.slice(s.route.indexOf('app.post("/api/v1/driver-finance/settlements/:id/pay-lines"'));
  if (!/item_id: z\.string\(\)\.uuid\(\)/.test(route) || !/itemId: body\.data\.item_id/.test(route)) bad.push('route requires and forwards item');
  if (!/item_id: itemId/.test(s.ui)) bad.push('picker selection must reach API');
  return bad;
}
if (process.argv.includes('--selftest')) {
  assert.deepEqual(failures(sources), []);
  const mutations = [
    ['writer', 'if (!input.itemId)', 'if (false)'],
    ['writer', 'i.operating_company_id = $2::uuid', 'true'],
    ['writer', 'a.is_postable = true', 'true'],
    ['writer', 'const postingAccountId = payItem.account_id', 'const postingAccountId = genericAccount'],
    ['writer', 'posting_account_id, item_id, quantity, rate_cents, unit_of_measure', 'posting_account_id'],
    ['close', 'accountId: r.posting_account_id ?? accounts.driverPay', 'accountId: accounts.driverPay'],
    ['close', 'const accountId = r.posting_account_id ?? accounts.detention', 'const accountId = accounts.detention'],
    ['ui', 'item_id: itemId', 'item_id: undefined'],
    ['writer', "'manual_entry'", "'settlement_pay_line'"],
    ['route', 'itemId: body.data.item_id', 'itemId: undefined'],
  ];
  for (const [key, from, to] of mutations) {
    assert(sources[key].includes(from), `mutation target absent: ${from}`);
    assert(failures({ ...sources, [key]: sources[key].replace(from, to) }).length > 0, `mutation survived: ${from}`);
  }
  console.log(`PASS BCF-09 selftest: ${mutations.length}/${mutations.length} regressions rejected`);
} else {
  const bad = failures(sources);
  for (const failure of bad) console.error(`FAIL BCF-09: ${failure}`);
  console.log(`BCF-09: ${bad.length} failures`);
  process.exitCode = bad.length ? 1 : 0;
}
