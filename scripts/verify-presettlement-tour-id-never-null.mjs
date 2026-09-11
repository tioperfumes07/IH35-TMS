#!/usr/bin/env node
/**
 * BUG 2 fix (owner's standing order, verbatim: "ALL LOADS MUST AUTOMATICALLY BE ASSIGNED A LOAD
 * AND TO A TOUR" — Lead ruling 2026-09-11 16:25 Central). presettlement-link.service.ts's
 * confirmPresettlementLink, action === "create_new" branch, used to mint a fresh tour_id ONLY for
 * NB legs — an SB/TR/LOCAL leg confirmed via create_new with no tour_id already captured silently
 * kept propagating null (root cause of loads 13508/13581/13584 having tour_id NULL). tour_id IS
 * NULL is never a valid outcome.
 *
 * Static check: the create_new branch must, for a non-NB leg with no tour_id, first look up the
 * unit's own open tour (findOpenPresettlementTourForUnit — the same lookup TR/SB suggestions
 * already use) and mint a new tour_id only if none exists. Never leave it unset.
 *
 * Live check: 0 active, non-cancelled USMCA loads have tour_id IS NULL, EXCLUDING the frozen
 * 2026-09-11 reverse+repost rebuild-seed rows (13502, 13505, 13507 — ALL-SEATS FREEZE order,
 * these are rebuild seeds with no unit, not a defect in the code path this guard verifies).
 */
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

const LABEL = 'verify-presettlement-tour-id-never-null';

// FROZEN 2026-09-11 (ALL SEATS order): rebuild-seed loads with no unit, explicitly excluded from
// this guard's live check until the owner rules on the reverse+repost rebuild. Never expand this
// list to hide a real regression — every id here must trace to that exact freeze order.
export const FROZEN_REBUILD_SEED_LOAD_NUMBERS = ['13502', '13505', '13507'];

export function verifyStaticSource(source) {
  assert(
    source.includes('findOpenPresettlementTourForUnit(client,'),
    'create_new must look up the unit\'s own open tour before minting a new one for a non-NB leg'
  );
  assert(
    /if \(!suggestion\.tour_id\) suggestion\.tour_id = randomUUID\(\);/.test(source),
    'create_new must mint a fresh tour_id when no open tour exists for this unit — tour_id must never stay null'
  );
  // Regression guard for the exact prior shape: an `if (trip_type === "NB")` with no `else`
  // branch handling every other trip_type.
  const createNewBlock = source.split('if (input.action === "create_new")')[1]?.split('} else {')[0];
  assert(createNewBlock, 'create_new branch must be extractable');
  assert(
    createNewBlock.includes('} else if (!suggestion.tour_id) {'),
    'create_new must have an else-if branch for non-NB legs with no captured tour_id — an NB-only `if` with no else is the exact regression this guards'
  );
}

if (process.argv.includes('--selftest')) {
  const good = `
    if (input.action === "create_new") {
      if (suggestion.trip_type === "NB") {
        suggestion.tour_id = randomUUID();
      } else if (!suggestion.tour_id) {
        suggestion.tour_id = suggestion.unit_id
          ? await findOpenPresettlementTourForUnit(client, {})
          : null;
        if (!suggestion.tour_id) suggestion.tour_id = randomUUID();
      }
    } else {
      // link_existing
    }
  `;
  verifyStaticSource(good);
  assert.throws(() => verifyStaticSource(good.replace("await findOpenPresettlementTourForUnit(client, {})", "null")),
    /must look up the unit's own open tour/);
  assert.throws(() => verifyStaticSource(good.replace('if (!suggestion.tour_id) suggestion.tour_id = randomUUID();', '')),
    /must mint a fresh tour_id/);
  const regressed = `
    if (input.action === "create_new") {
      if (suggestion.trip_type === "NB") {
        suggestion.tour_id = randomUUID();
      }
    } else {
      // link_existing
    }
  `;
  assert.throws(() => verifyStaticSource(regressed));
  console.log(`${LABEL} --selftest PASS (3/3 cases)`);
  process.exit(0);
}

const source = read('apps/backend/src/dispatch/presettlement-link.service.ts');
verifyStaticSource(source);
console.log(`${LABEL} static OK — create_new never leaves tour_id null for any trip_type`);
console.log(`${LABEL} live check NOT run by this static guard — see docs/audit/GUARD-WORKORDERS.md's BUG-2 entry for the live Neon count (frozen rebuild seeds ${FROZEN_REBUILD_SEED_LOAD_NUMBERS.join(', ')} excluded per the 2026-09-11 ALL-SEATS freeze order)`);
