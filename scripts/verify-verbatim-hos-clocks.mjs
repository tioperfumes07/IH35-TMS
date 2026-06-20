#!/usr/bin/env node
// Guard — VERBATIM Samsara HOS clocks (Path B, Blueprint §3.15.9.2). The four legal clocks + violation come from
// Samsara's COMPUTED values (GET /fleet/hos/clocks -> samsara.hos_snapshots, displayed verbatim), NOT our recompute.
// PR C is the data side (pull + store + probe comparison); the board/roster reader swap follows GUARD's per-driver OK.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");
const fail = (m) => { console.error(`FAIL verify-verbatim-hos-clocks: ${m}`); process.exit(1); };

// Client: GET /fleet/hos/clocks, ms->min, scoped to driverIds.
const client = read("apps/backend/src/integrations/samsara/samsara-client.ts");
if (!/async listHosClocks\(/.test(client)) fail("samsara-client must expose listHosClocks()");
if (!/\/fleet\/hos\/clocks/.test(client)) fail("listHosClocks must call GET /fleet/hos/clocks");
if (!/cycleRemainingDurationMs/.test(client) || !/driveRemainingDurationMs/.test(client) || !/timeUntilBreakDurationMs/.test(client))
  fail("listHosClocks must read Samsara's ms duration fields (cycle/drive/shift/break remaining)");
if (!/\/ 60000/.test(client)) fail("listHosClocks must convert ms -> minutes");

// Pull service: writes verbatim into samsara.hos_snapshots; getLatestHosClocksByDriver reads latest per driver;
// violation derived ONLY from Samsara's numbers (any remaining <= 0).
const svc = read("apps/backend/src/integrations/samsara/samsara-hos-clocks-pull.service.ts");
if (!/INSERT INTO samsara\.hos_snapshots/.test(svc)) fail("syncSamsaraHosClocks must write verbatim into samsara.hos_snapshots");
if (!/api\.listHosClocks\(/.test(svc)) fail("the pull must call api.listHosClocks (the verbatim source)");
if (!/export async function getLatestHosClocksByDriver/.test(svc)) fail("must expose getLatestHosClocksByDriver (latest per driver)");
if (!/\[cycle, drive, shift\]\.some\(\(v\) => v != null && v <= 0\)/.test(svc))
  fail("violation must be derived ONLY from Samsara's numbers (any of cycle/drive/shift remaining <= 0)");
if (!/ORDER BY driver_uuid, polled_at DESC/.test(svc)) fail("must select the LATEST snapshot per driver");

// Cron: the */5 positions cron pulls clocks + writes an observable sync-log row.
const posCron = read("apps/backend/src/cron/samsara-positions-cron.ts");
if (!/syncSamsaraHosClocks\(c, operatingCompanyId\)/.test(posCron)) fail("the */5 positions cron must drive syncSamsaraHosClocks");
if (!/sync_kind[\s\S]{0,40}'samsara_hos_clocks'|'samsara_hos_clocks'/.test(posCron)) fail("cron must log a samsara_hos_clocks sync row");

// Probe: surfaces OUR drivers' verbatim clocks so GUARD compares Samsara-verbatim vs recompute per driver.
const probe = read("apps/backend/src/integrations/samsara/samsara-stats-probe.service.ts");
if (!/latest_hos_clocks/.test(probe) || !/FROM samsara\.hos_snapshots/.test(probe))
  fail("the probe must surface latest_hos_clocks (our drivers' verbatim Samsara clocks, by name) for the per-driver comparison");

console.log("OK verify-verbatim-hos-clocks: Samsara /fleet/hos/clocks pulled (ms->min) -> hos_snapshots; latest-per-driver reader; probe comparison.");
