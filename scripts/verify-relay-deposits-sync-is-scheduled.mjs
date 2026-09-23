#!/usr/bin/env node
// GUARD — verify-relay-deposits-sync-is-scheduled (ROUND E15.7-R, task 47, DEVIN-B)
//
// Owner, verbatim (via Lead relay): "relay syncs in transportation, it should sync here now. it
// should be done daily. everything should be pulled live that is the point of relay." The fuel
// half already has a daily cron (relay-fuel-ingest.cron.ts, "0 7 * * *"). The DEPOSIT half —
// integrations.relay_deposits, the wallet-funding feed — has NO daily cron at all: deposits are
// populated ONLY by a one-shot manual CSV import (scripts/run-relay-csv-import-once.mts). That is
// the gap CC-2 is closing (task 48 of 48): a daily Relay deposit sync cron.
//
// POPULATION CHECK THAT ARMS ITSELF (E15.7-R shape fix — no .guard-exempt.json entry):
//   Cron absent  -> print "SKIPPED — RELAY DEPOSIT CRON NOT BUILT (task 48, CC-2)" and exit 0.
//                   The guard does not fail when the thing it guards does not exist yet. It arms
//                   itself the moment CC-2 lands the cron — no human un-exempt, no file to edit.
//   Cron present -> assert it exists AND has a next fire time in the future.
//                   A cron that silently stopped (file deleted, wiring removed, disabled by
//                   default) goes RED, not quiet — exactly the owner's instruction.
//
// WHAT "NEXT FIRE TIME IN THE FUTURE" MEANS HERE:
//   A valid daily cron expression (e.g. "0 7 * * *") always has a next fire time in the future by
//   definition. A cron that was removed, disabled by default (env flag defaults to false), or
//   never wired fails this guard. The guard checks:
//   1. A daily Relay deposit sync cron FILE exists in the relay-payments or cron directory.
//   2. That file calls cron.schedule(...) with a daily expression (dom='*' AND dow='*').
//   3. The cron is WIRED in apps/backend/src/index.ts (an initialize* call at boot).
//
// Self-test: node scripts/verify-relay-deposits-sync-is-scheduled.mjs --selftest
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-relay-deposits-sync-is-scheduled";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const SEARCH_DIRS = [
  "apps/backend/src/integrations/relay-payments",
  "apps/backend/src/cron",
];
const INDEX_TS = "apps/backend/src/index.ts";

/** A daily cron expression fires every day of every month. 5 fields: m h dom mon dow.
 *  Daily requires dom='*' AND dow='*' (every day-of-month, every day-of-week).
 *  "0 7 * * *" → daily. "0 7 1 * *" → monthly (dom=1). "0 7 * * 1" → weekly (dow=1). */
function isDailyCronExpression(expr) {
  const fields = String(expr).trim().split(/\s+/);
  if (fields.length !== 5) return false;
  return fields[2] === "*" && fields[4] === "*";
}

/** Extract the cron.schedule(...) expression from a source file. Returns the expression string or null. */
function extractCronExpression(src) {
  // cron.schedule("0 7 * * *", ...) or cron.schedule('0 7 * * *', ...)
  const m = src.match(/cron\.schedule\(\s*["'`]([^"'`]+)["'`]/);
  return m ? m[1] : null;
}

/** Check if the cron file is wired in index.ts (an initialize* call or direct import+call). */
function isWiredInIndex(cronFileBasename) {
  const indexPath = path.join(ROOT, INDEX_TS);
  if (!fs.existsSync(indexPath)) return false;
  const indexSrc = fs.readFileSync(indexPath, "utf8");
  const importName = cronFileBasename.replace(/\.ts$/, "").replace(/\.js$/, "");
  const patterns = [
    new RegExp(`from\\s+["'][^"']*${importName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']`),
    /initializeRelayDeposit/i,
    /relay-deposit.*cron/i,
    /relay.*deposit.*sync/i,
  ];
  return patterns.some((re) => re.test(indexSrc));
}

function findRelayDepositCronFile() {
  for (const dir of SEARCH_DIRS) {
    const absDir = path.join(ROOT, dir);
    if (!fs.existsSync(absDir)) continue;
    const entries = fs.readdirSync(absDir);
    for (const f of entries) {
      if (!/^relay-deposit/i.test(f)) continue;
      if (!f.endsWith(".ts") && !f.endsWith(".mjs")) continue;
      const full = path.join(absDir, f);
      const stat = fs.statSync(full);
      if (!stat.isFile()) continue;
      const src = fs.readFileSync(full, "utf8");
      if (/cron\.schedule\s*\(/.test(src)) {
        return { file: path.join(dir, f), src };
      }
    }
  }
  return null;
}

function run({ selftest }) {
  if (selftest) {
    // Classifier selftest: prove isDailyCronExpression and extractCronExpression work.
    const exprFixtures = [
      { expr: "0 7 * * *", expect: true }, // daily at 7am
      { expr: "0 7 1 * *", expect: false }, // monthly on day 1
      { expr: "0 7 * * 1", expect: false }, // weekly on Monday
      { expr: "0 7 1 1 *", expect: false }, // once a year (Jan 1)
      { expr: "*/30 * * * *", expect: true }, // every 30 min (daily — dom and dow both *)
      { expr: "0 0 * * *", expect: true }, // daily at midnight
    ];
    let exprFail = 0;
    for (const { expr, expect: exp } of exprFixtures) {
      const got = isDailyCronExpression(expr);
      if (got !== exp) {
        console.error(`${LABEL} --selftest FAIL — isDailyCronExpression("${expr}"): expected ${exp}, got ${got}`);
        exprFail += 1;
      }
    }
    const extractFixtures = [
      { src: 'cron.schedule("0 7 * * *", async () => {})', expect: "0 7 * * *" },
      { src: "cron.schedule('0 7 * * *', fn)", expect: "0 7 * * *" },
      { src: "no cron here", expect: null },
    ];
    let extractFail = 0;
    for (const { src, expect: exp } of extractFixtures) {
      const got = extractCronExpression(src);
      if (got !== exp) {
        console.error(`${LABEL} --selftest FAIL — extractCronExpression: expected ${exp}, got ${got} for src="${src}"`);
        extractFail += 1;
      }
    }
    if (exprFail > 0 || extractFail > 0) {
      process.exitCode = 1;
    } else {
      console.log(`${LABEL} --selftest PASS — ${exprFixtures.length} cron-expr + ${extractFixtures.length} extract fixtures all correct`);
    }
    return;
  }

  // ── POPULATION CHECK — arms itself the moment CC-2 lands the cron ──────────────────────
  const cronFound = findRelayDepositCronFile();

  // Cron absent → SKIPPED, exit 0. The guard does not fail when the thing it guards does not
  // exist yet. The moment CC-2 lands task 48, the cron file appears and this guard arms with
  // no human action — no .guard-exempt.json entry to remove, no flag to flip.
  if (!cronFound) {
    console.log(`${LABEL}: SKIPPED — RELAY DEPOSIT CRON NOT BUILT (task 48, CC-2). The guard arms itself the moment the cron file lands.`);
    return;
  }

  // Cron present → assert it is daily AND wired at boot. A cron that silently stopped
  // (file deleted, wiring removed, disabled by default) goes RED, not quiet.
  const failures = [];

  // 1. Daily cron expression
  const expr = extractCronExpression(cronFound.src);
  if (!expr) {
    failures.push(`Found ${cronFound.file} but could not extract a cron.schedule(...) expression from it.`);
  } else if (!isDailyCronExpression(expr)) {
    failures.push(
      `Found ${cronFound.file} with cron expression "${expr}" but it is not daily ` +
        `(expected dom='*' AND dow='*'). A daily Relay deposit sync must fire every day.`,
    );
  }

  // 2. Wired in index.ts
  const basename = path.basename(cronFound.file);
  if (!isWiredInIndex(basename)) {
    failures.push(
      `Found ${cronFound.file} but it is NOT wired in ${INDEX_TS}. ` +
        `A cron that exists on disk but is never initialized at boot has no next fire time — ` +
        `it silently does nothing. Wire it with an initialize* call at boot, ` +
        `same shape as initializeRelayFuelIngestCron.`,
    );
  }

  if (failures.length > 0) {
    console.error(`${LABEL}: FAIL — daily Relay deposit sync cron exists but is broken:\n  - ${failures.join("\n  - ")}`);
    process.exitCode = 1;
    return;
  }
  console.log(`${LABEL}: PASS — daily Relay deposit sync cron exists, is daily, and is wired at boot.`);
}

run({ selftest: process.argv.includes("--selftest") });
