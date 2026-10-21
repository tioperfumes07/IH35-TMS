#!/usr/bin/env node
// BCF-09: a chosen native pay item determines the line AND the downstream A/P posting account.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const paths = {
  writer: 'apps/backend/src/driver-finance/settlement-pay-line.service.ts',
  close: 'apps/backend/src/driver-finance/settlement-payrun-close.service.ts',
  route: 'apps/backend/src/driver-finance/settlements.routes.ts',
  ui: 'apps/frontend/src/components/driver-finance/AddPayLineModal.tsx',
  // 443.203 R (ACCT-F4432034) — every reimbursement settlement line posts by THE ONE RULE.
  rule: 'apps/backend/src/driver-finance/reimbursement-line-account.ts',
  creator: 'apps/backend/src/driver-finance/settlement-creator.service.ts',
  materialize: 'apps/backend/src/driver-finance/settlement-lines-materialize.service.ts',
  categorize: 'apps/backend/src/driver-finance/creator-document-categorization.service.ts',
};
import { existsSync } from 'node:fs';
// A missing source reads as '' so its contract is reported as a failure, never a crash.
const sources = Object.fromEntries(Object.entries(paths).map(([key, path]) => [key, existsSync(path) ? readFileSync(path, 'utf8') : '']));
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
  // 443.203 R — reimbursement line account: stamped account, else its item's account, type map only when item-less.
  const rule = s.rule;
  const iStamp = rule.indexOf('if (line.posting_account_id) return { accountId: line.posting_account_id }');
  const iItem = rule.indexOf('resolveLineItemAndAccount(client, operatingCompanyId, { item_id: line.item_id })');
  const iType = rule.indexOf('await byType(line.reimbursement_type)');
  if (iStamp < 0 || iItem < 0 || iType < 0 || !(iStamp < iItem && iItem < iType)) bad.push('reimbursement rule must be stamped account -> item account -> type map (item-less only)');
  if (!/if \("refused" in picked\) return \{ refused: picked\.refused \}/.test(rule)) bad.push('reimbursement item that does not resolve must refuse, never fall to the type map');
  const reimbLoader = s.close.slice(s.close.indexOf('async function loadReimbursementPayItems'), s.close.indexOf('async function loadRecoverableAdvances'));
  if (!/resolveReimbursementLineAccount\(client as never, operatingCompanyId, r, reimbursementByType\)/.test(reimbLoader)) bad.push('close reimbursement lines must resolve through the one rule');
  if (/posting_account_id \?\? \(await accounts\.reimbursementByType/.test(s.close)) bad.push('close must not fall to the type map for an itemed reimbursement line');
  if (!/items\.push\(\.\.\.\(await loadReimbursementPayItems\(client, operatingCompanyId, settlementId, accounts\.reimbursementByType\)\)\)/.test(close)) bad.push('A/P chain reimbursements must come from the one-rule loader');
  if (!/for \(const it of await loadReimbursementPayItems\(client, opco, settlementId, previewByType\)\)/.test(s.close)) bad.push('pay-run JE preview reimbursements must use the one-rule loader');
  const crAt = s.creator.indexOf('for (const r of draft.reimbursements ?? [])', s.creator.indexOf('// Reimbursable expenses + explicit reimbursements → settlement_lines'));
  const cr = crAt < 0 ? '' : s.creator.slice(crAt, s.creator.indexOf('for (const exp of draft.expenses ?? [])', crAt));
  if (!/load_id, posting_account_id/.test(cr) || !/rAccount\.id,/.test(cr)) bad.push('Creator explicit reimbursement line must carry its item posting account');
  if (!/item_id: group\.item_id, reimbursement_type: group\.reimbursement_type/.test(s.materialize) || !/GROUP BY dr\.reimbursement_type, sl\.item_id/.test(s.materialize)) bad.push('materialize backfill must give an itemed line its item account');
  if (!/posting_account_id = \$4::uuid/.test(s.categorize) || !/itemAcct\.account_id\]/.test(s.categorize)) bad.push('categorizer that items a reimbursement line must stamp the item account');
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
    // 443.203 R plants
    ['rule', 'const picked = await resolveLineItemAndAccount(client, operatingCompanyId, { item_id: line.item_id });', 'const picked = null;'],
    ['rule', 'if ("refused" in picked) return { refused: picked.refused };', 'if ("refused" in picked) return { accountId: (await byType(null))! };'],
    ['close', 'resolveReimbursementLineAccount(client as never, operatingCompanyId, r, reimbursementByType)', '({ accountId: r.posting_account_id ?? (await reimbursementByType(r.reimbursement_type))! })'],
    ['close', 'for (const it of await loadReimbursementPayItems(client, opco, settlementId, previewByType))', 'for (const it of [] as ApChainPayItem[])'],
    ['creator', '        rAccount.id,\n', '        null,\n'],
    ['materialize', 'item_id: group.item_id, reimbursement_type', 'item_id: null, reimbursement_type'],
    ['categorize', 'posting_account_id = $4::uuid, ', ''],
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
