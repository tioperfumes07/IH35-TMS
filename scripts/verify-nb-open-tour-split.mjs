#!/usr/bin/env node
/** @matrix-built modules=settlements cols=connectivity task=NB-OPEN-TOUR-SPLIT */
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const source = readFileSync(root + 'apps/backend/src/dispatch/presettlement-link.service.ts', 'utf8');
function assertSeparation(code) {
  for (const required of [
    'input.trip_type === "NB" && !open.is_closed && open.has_other_nb',
    'nb.id <> $5::uuid AND nb.trip_type = \'NB\'',
    'suggestion.trip_type === "NB" && target.status === "open" && !target.trip_closed_at',
    'open_settlement_already_has_nb',
    'SET presettlement_link_id = $1::uuid, tour_id = $3::uuid',
    'suggestion.tour_id = randomUUID()',
    'reopenSettlementForContinuationInClientTx(client,',
  ]) if (!code.includes(required)) throw new Error('NB tour separation missing: ' + required);
}
const MUTATIONS = [
  ['occupied-open NB check disabled', source.replace('!open.is_closed && open.has_other_nb', 'false')],
  ['second NB allowed', source.replace('open_settlement_already_has_nb', 'allow_second_nb')],
  ['tour_id not stamped', source.replace('SET presettlement_link_id = $1::uuid, tour_id = $3::uuid', 'SET presettlement_link_id = $1::uuid')],
];
if (process.argv.includes('--selftest')) {
  const throws = (code) => { try { assertSeparation(code); return false; } catch { return true; } };
  const cases = [['the real service passes', !throws(source)], ...MUTATIONS.map(([n, code]) => [`${n} fails`, throws(code)])];
  for (const [n, p] of cases) console.log(`  ${p ? '✓' : '✗'} ${n}`);
  const bad = cases.filter(([, p]) => !p).length;
  console.log(bad ? 'verify-nb-open-tour-split --selftest FAIL' : `verify-nb-open-tour-split --selftest PASS (${cases.length}/${cases.length})`);
  process.exit(bad ? 1 : 0);
}
assertSeparation(source);
for (const oldBehavior of [
  source.replace('!open.is_closed && open.has_other_nb', 'false'),
  source.replace('open_settlement_already_has_nb', 'allow_second_nb'),
  source.replace('SET presettlement_link_id = $1::uuid, tour_id = $3::uuid', 'SET presettlement_link_id = $1::uuid'),
]) {
  let caught = false;
  try { assertSeparation(oldBehavior); } catch { caught = true; }
  if (!caught) throw new Error('NB old-behavior mutation escaped');
}
const result = spawnSync(process.execPath, [root + 'node_modules/vitest/vitest.mjs', 'run', '--config',
  root + 'apps/backend/vitest.config.ts', 'apps/backend/src/dispatch/__tests__/presettlement-link.service.test.ts'],
  { cwd: root, stdio: 'inherit', timeout: 120000 });
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
console.log('verify-nb-open-tour-split PASS: occupied open NB separates; closed continuation and TR/SB preserved');
