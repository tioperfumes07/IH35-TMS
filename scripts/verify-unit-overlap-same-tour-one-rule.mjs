#!/usr/bin/env node
/**
 * LEAD 443.209 (CC-2, moved from Codex) — ONE unit-overlap rule in both layers.
 * Ruling 20:32Z: "a load on the same tour whose pickup is after the prior leg's scheduled delivery is not an overlap."
 * Measured 10-21: 13694 (T148, TR, Avenel NJ pickup 10-20) refused "unit already active on 13688" (T148, delivers 10-19).
 * Pinned:
 *  1. App gate (unit-active-load-guard.ts): the ONLY exception is a conflicting load on THIS (non-null) tour whose stops
 *     ALL carry a time and whose latest stop time is at or before this leg's pickup; untimed -> still a conflict.
 *  2. Book Load passes the exception only for a TR / SB leg, with the tour the trip pairing joins and the first pickup.
 *  3. DB (202616050700): unit_legs_are_same_tour_sequential is the same rule (same tour, every stop timed, one ends at or
 *     before the other starts), used by the deferred backstop.
 * Static, <1s. --selftest plants each regression.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-unit-overlap-same-tour-one-rule";
const GATE = "apps/backend/src/dispatch/unit-active-load-guard.ts";
const BOOK = "apps/backend/src/dispatch/book-load.service.ts";
const MIG = "db/migrations/202616050700_unit_overlap_trigger_tracked_same_tour_legs.sql";
const FILES = [GATE, BOOK, MIG];

export function check(f) {
  const p = [];
  const gate = f[GATE] ?? "", book = f[BOOK] ?? "", mig = f[MIG] ?? "";
  if (!/if \(leg\?\.tour_id && leg\.pickup_at\)/.test(gate)) p.push(`${GATE}: the same-tour exception does not require both a tour and a pickup time`);
  if (!/l\.tour_id = \$\$\{t\}::uuid/.test(gate)) p.push(`${GATE}: the exception is not limited to this tour`);
  if (!/AND NOT EXISTS \(\s*SELECT 1 FROM mdata\.load_stops s1[\s\S]*?IS NULL\s*\)/.test(gate)) p.push(`${GATE}: an untimed stop on the prior leg no longer keeps the conflict`);
  if (!/max\(COALESCE\(s2\.appointment_end_at, s2\.appointment_start_at, s2\.scheduled_arrival_at\)\)[\s\S]*?<= \$\$\{t \+ 1\}::timestamptz/.test(gate)) p.push(`${GATE}: the prior leg is not required to end (by schedule) at or before this pickup`);
  if (!/if \(input\.trip_type === "TR" \|\| input\.trip_type === "SB"\) \{/.test(book)) p.push(`${BOOK}: the exception is not limited to a TR / SB leg`);
  if (!/same_tour_next_leg: nextLegTour\s*\?/.test(book)) p.push(`${BOOK}: Book Load does not pass the same-tour leg to the unit gate`);
  if (!/a\.tour_id IS NOT NULL AND a\.tour_id = b\.tour_id/.test(mig)) p.push(`${MIG}: the DB rule is not limited to the same non-null tour`);
  if (!/a\.untimed = 0 AND b\.untimed = 0/.test(mig)) p.push(`${MIG}: the DB rule excuses an untimed leg`);
  if (!/\(a\.ends <= b\.starts OR b\.ends <= a\.starts\)/.test(mig)) p.push(`${MIG}: the DB rule does not require sequential windows`);
  if (!/DEFERRABLE INITIALLY DEFERRED/.test(mig)) p.push(`${MIG}: the backstop is not deferred (a Book Load INSERT has no tour / stops yet)`);
  return p;
}
const readAll = () => Object.fromEntries(FILES.map((f) => [f, fs.existsSync(path.join(ROOT, f)) ? fs.readFileSync(path.join(ROOT, f), "utf8") : ""]));

if (process.argv.includes("--selftest")) {
  const real = readAll();
  const base = check(real);
  if (base.length) { console.error(`${LABEL} --selftest: real tree not clean:\n  ${base.join("\n  ")}`); process.exit(1); }
  const plant = (file, from, to) => ({ ...real, [file]: real[file].replace(from, to) });
  const plants = [
    ["any tour excused", plant(GATE, "l.tour_id = $${t}::uuid", "true")],
    ["untimed leg excused", plant(GATE, "s1.scheduled_arrival_at) IS NULL\n          )", "s1.scheduled_arrival_at) IS NULL AND false\n          )")],
    ["no time order", plant(GATE, "<= $${t + 1}::timestamptz", ">= '-infinity'::timestamptz")],
    ["NB excused too", plant(BOOK, 'if (input.trip_type === "TR" || input.trip_type === "SB") {', "if (true) {")],
    ["Book Load drops the leg", plant(BOOK, "same_tour_next_leg: nextLegTour\n          ?", "same_tour_next_leg: false\n          ?")],
    ["DB any tour", plant(MIG, "a.tour_id IS NOT NULL AND a.tour_id = b.tour_id", "true")],
    ["DB untimed excused", plant(MIG, "a.untimed = 0 AND b.untimed = 0", "true")],
    ["DB overlap excused", plant(MIG, "(a.ends <= b.starts OR b.ends <= a.starts)", "true")],
    ["DB immediate", plant(MIG, "DEFERRABLE INITIALLY DEFERRED", "")],
  ];
  let ok = 0;
  for (const [name, files] of plants) {
    const changed = FILES.some((k) => files[k] !== real[k]);
    const pass = changed && check(files).length > 0;
    console.log(`  ${pass ? "PASS" : "FAIL"}  ${name}${changed ? "" : " (plant did not apply)"}`);
    if (pass) ok++;
  }
  console.log(`${LABEL} --selftest ${ok}/${plants.length}`);
  process.exit(ok === plants.length ? 0 : 1);
}
const problems = check(readAll());
if (problems.length) { console.error(`${LABEL} FAIL — ${problems.length}:`); for (const x of problems) console.error(`  ✗ ${x}`); process.exit(1); }
console.log(`${LABEL} PASS — one unit rule in both layers: the same tour's sequential leg is not an overlap; every other second active load on a unit is refused`);
