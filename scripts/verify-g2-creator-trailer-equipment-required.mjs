#!/usr/bin/env node
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

const paths = {
  resolver: 'apps/backend/src/driver-finance/creator-trailer-choice.ts',
  preview: 'apps/backend/src/driver-finance/settlement-creator-preflight.ts',
  seed: 'apps/backend/src/driver-finance/settlement-creator-seed-loads.ts',
  routes: 'apps/backend/src/driver-finance/settlement-creator.routes.ts',
};
const ref = process.argv.find(a => a.startsWith('--ref='))?.slice(6);
const tree = Object.fromEntries(Object.entries(paths).map(([key, path]) => [key,
  ref ? execFileSync('git', ['show', `${ref}:${path}`], { encoding: 'utf8' }) : fs.readFileSync(path, 'utf8'),
]));
const contracts = [
  ['resolver', 'if (!code) throw new SettlementCreatorError(', 'unresolved fleet type refuses'],
  ['resolver', 'if (!id) throw new SettlementCreatorError(', 'missing active catalog refuses'],
  ['resolver', 'operating_company_id = $1::uuid AND code = $2 AND is_active = true', 'active catalog is company scoped'],
  ['resolver', 'owner_company_id = $2::uuid OR currently_leased_to_company_id = $2::uuid', 'fleet type is company scoped'],
  ['preview', 'await creatorLoadTrailerEquipmentId(client, co, choice);', 'preview uses the same resolver'],
  ['preview', 'if (!(err instanceof SettlementCreatorError)) throw err;', 'preview never swallows database errors'],
  ['seed', 'const trailerTypeId = await creatorLoadTrailerEquipmentId(client, draft.operating_company_id, trailerChoice);', 'booking resolves the document type'],
  // LEAD 443.203 (20:22Z, 5851 / 13689): each load's printed trailer decides that load — 13689 (customer 10204) was born on
  // the settlement's fleet trailer 10209 because every load took the settlement-level choice.
  ['resolver', 'if (printed) return printedTrailerChoice(client, draft.operating_company_id, printed, false);', 'a load row\'s printed trailer decides that load'],
  ['seed', 'const trailerChoice = await creatorLoadTrailerChoice(client, draft, load);', 'booking decides the trailer per load'],
  ['seed', 'assigned_trailer_unit_id: trailerChoice.kind === "company" ? trailerChoice.equipment_id : undefined,', 'a customer / none load never takes the settlement fleet trailer'],
  ['preview', 'const choice = await creatorLoadTrailerChoice(client, draft, load);', 'preview decides the trailer per load'],
  ['routes', '// LEAD 443.203 — the trailer printed on this load\'s row', 'the draft load accepts its printed trailer'],
  ['resolver', 'lowboy: "LOWBOY"', 'supported Lowboy maps to its existing catalog code'],
  ['seed', 'load_trailer_equipment_id: trailerTypeId ?? undefined,', 'booking receives the resolved type'],
];
function failures(sources) {
  const errors = contracts.filter(([key, needle]) => !sources[key].includes(needle)).map(([, , label]) => label);
  if (/creatorTrailerChoice\(client, draft\)/.test(sources.seed)) errors.push('booking must not apply the settlement-level trailer to every load');
  const resolve = sources.seed.indexOf('const trailerTypeId = await creatorLoadTrailerEquipmentId(');
  const book = sources.seed.indexOf('const booked = await bookLoadOnClient(');
  const adoption = sources.seed.indexOf('if (existing.rows[0] && draft.edit_void_repost');
  if (resolve < 0 || book < 0 || resolve >= book) errors.push('type must resolve before booking');
  if (adoption < 0 || resolve <= adoption) errors.push('existing-load adoption precedes type resolution');
  return errors;
}
const errors = failures(tree);
if (errors.length) {
  console.error(`G2 FAIL: ${errors.join('; ')}`);
  process.exit(1);
}
if (process.argv.includes('--selftest')) {
  for (const [key, needle, label] of contracts) {
    assert(failures({ ...tree, [key]: tree[key].replaceAll(needle, 'MUTATED') }).length, label);
  }
  const late = tree.seed.replace('const trailerTypeId = await creatorLoadTrailerEquipmentId(', 'const movedTrailerTypeId = await creatorLoadTrailerEquipmentId(')
    + '\nconst trailerTypeId = await creatorLoadTrailerEquipmentId();';
  assert(failures({ ...tree, seed: late }).includes('type must resolve before booking'));
  assert(failures({ ...tree, seed: 'const trailerTypeId = await creatorLoadTrailerEquipmentId();\n' + tree.seed }).includes('existing-load adoption precedes type resolution'));
  assert(failures({ ...tree, seed: tree.seed + '\nconst x = await creatorTrailerChoice(client, draft);' }).includes('booking must not apply the settlement-level trailer to every load'));
  console.log(`G2 SELFTEST PASS: ${contracts.length + 3}/${contracts.length + 3} mutations refused`);
} else console.log(`G2 PASS: ${contracts.length + 3} shared-resolver contracts`);
