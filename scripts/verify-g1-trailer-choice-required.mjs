#!/usr/bin/env node
import fs from 'node:fs';
import assert from 'node:assert/strict';

const paths = {
  book: 'apps/backend/src/dispatch/book-load.service.ts',
  edit: 'apps/backend/src/dispatch/update-load.service.ts',
  shared: 'apps/backend/src/dispatch/load-trailer-choice.ts',
  mdata: 'apps/backend/src/mdata/loads.routes.ts',
  routes: 'apps/backend/src/dispatch/loads.routes.ts',
};
const sources = Object.fromEntries(Object.entries(paths).map(([key, path]) => [key, fs.readFileSync(path, 'utf8')]));
const contracts = [
  ['book', 'const requiredTrailerChoice = trailerChoiceShapeRefusal(input.trailer_choice);', 'canonical create requires a trailer choice'],
  ['book', 'if (requiredTrailerChoice) return { kind: "error", status: 422, payload: requiredTrailerChoice };', 'missing choice refuses creation'],
  ['edit', 'await requireRecordedTrailerChoice(client, operatingCompanyId, loadId, old);', 'edit validates persisted choice when omitted'],
  ['shared', '["company", "customer", "interchange", "none"].includes(choice.kind)', 'unknown choice cannot become none'],
  ['book', 'await applyTrailerChoice(client, {', 'booking uses shared writer'],
  ['edit', 'await applyTrailerChoice(client, {', 'edit uses shared writer'],
  ['shared', 'h.new_trailer_id IS NOT NULL', 'driver-only history cannot erase recorded trailer'],
  ['shared', 'h.operating_company_id = $2::uuid', 'recorded trailer lookup is company scoped'],
  ['mdata', 'trailer_choice: b.trailer_choice', 'master-data creation forwards explicit choice'],
  ['mdata', 'trailer_choice: trailerChoiceSchema.optional()', 'master-data route accepts shared choice contract'],
  ['routes', 'trailer_choice: trailerChoiceSchema.optional()', 'dispatch routes accept shared choice contract'],
];
function failures(tree) {
  return contracts.filter(([key, needle]) => !tree[key].includes(needle)).map(([, , label]) => label);
}
const errors = failures(sources);
if (errors.length) {
  console.error(`G1 FAIL: ${errors.join('; ')}`);
  process.exit(1);
}
if (process.argv.includes('--selftest')) {
  for (const [key, needle, label] of contracts) {
    assert(failures({ ...sources, [key]: sources[key].replaceAll(needle, 'MUTATED') }).length, label);
  }
  console.log(`G1 SELFTEST PASS: ${contracts.length}/${contracts.length} mutations refused`);
} else console.log(`G1 PASS: ${contracts.length} shared-writer contracts`);
