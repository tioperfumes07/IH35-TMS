#!/usr/bin/env node
/**
 * GUARD — 5780 fork rehearsal (2026-10-11): the Settlement Creator books its loads as source "historical_backfill" (they
 * already ran, per a signed AlwaysTrack settlement) so a driver's CURRENT HOS clock never blocks a past load; the gate is
 * recorded as an exception (book-load FEED PARITY). Never live_feed from the Creator.
 * Run: node scripts/verify-settlement-creator-books-historical.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILE = "apps/backend/src/driver-finance/settlement-creator-seed-loads.ts";
const LABEL = "verify-settlement-creator-books-historical";
export const problems = (s) => (/bookLoadOnClient\(client as never, input, \{ source: "historical_backfill" \}\)/.test(s) ? [] : ["the Creator books its loads as live_feed"]);
if (process.argv.includes("--selftest")) {
  const g = fs.readFileSync(path.join(ROOT, FILE), "utf8");
  const pl = g.replace('{ source: "historical_backfill" }', '{ source: "live_feed" }');
  if (problems(g).length || pl === g || !problems(pl).length) { console.error(`${LABEL} selftest FAIL`); process.exit(1); }
  console.log(`${LABEL} selftest PASS (1 plant caught)`);
} else { const p = problems(fs.readFileSync(path.join(ROOT, FILE), "utf8")); if (p.length) { console.error(`${LABEL} FAIL\n- ${p.join("\n- ")}`); process.exit(1); } console.log(`${LABEL} PASS`); }
