#!/usr/bin/env node
/**
 * Guard for P40 (WIRING-PLAN-50-TASKS-LOCKED.md) — Drivers page "hub tiles" wired to canonical
 * driver_id paths.
 *
 * ROOT: live click-through on app.ih35dispatch.com (USMCA) found the "Debt Alert" and "Active
 * Drivers · Samsara" tiles on the /drivers overview render driver names as PLAIN TEXT, with no
 * href back to the driver profile — while the near-identical "Settlements Ready" and "Permit /
 * Document Expirations" tiles on the same page already link correctly. Verified via
 * find()/read_page in a live browser session, not a code guess: the two broken tiles' driver
 * names came back as `generic` (no href); the two working tiles came back as
 * `link (href="/drivers/{uuid}")`.
 *
 * Two distinct causes, both closed here:
 *  1. Debt Alert (drivers-tab copy) — a second, near-duplicate rendering of the same panel that
 *     exists (correctly) under the cash_advances tab. The cash_advances copy already wraps the
 *     name in EntityLink; the drivers-tab copy dropped it in the copy-paste.
 *  2. Active Drivers · Samsara — driver_short_name is joined server-side from
 *     `mdata.drivers d ON d.id = l.assigned_primary_driver_id`, so the FK exists one column away
 *     in the same query, but the response field was never declared in the frontend DispatchLoad
 *     type, so activeDriverLoadRows (keyed by NAME, not id) never captured it. Live-verified via
 *     fetch() against the deployed API that assigned_primary_driver_id is already present in the
 *     JSON payload for GET /dispatch/loads?view=home.
 *
 * Asserts:
 *  1. apps/frontend/src/api/dispatch.ts declares assigned_primary_driver_id on DispatchLoad.
 *  2. apps/frontend/src/pages/Drivers.tsx: activeDriverLoadRows captures a driver_id (not just a
 *     name) from each load, and keys the aggregation map by driver_id when present — so two
 *     different drivers sharing a short display name never collapse into one tile row.
 *  3. Both the "Debt Alert" and "Active Drivers" tile renders (drivers-tab copies) wrap their
 *     driver name in <EntityLink kind="driver" .../> rather than rendering it as bare text.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-drivers-hub-tiles-driver-link";
const DISPATCH_API = "apps/frontend/src/api/dispatch.ts";
const DRIVERS_PAGE = "apps/frontend/src/pages/Drivers.tsx";

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, (m, p1) => p1);
}

function extractBlock(src, marker, spanChars = 1200) {
  const idx = src.indexOf(marker);
  if (idx === -1) return null;
  return src.slice(idx, idx + spanChars);
}

export function assertGuard({ dispatchApi, driversPage }) {
  const errs = [];
  const api = stripComments(dispatchApi);
  const page = stripComments(driversPage);

  if (!/DispatchLoad\s*=\s*\{[\s\S]*?assigned_primary_driver_id\s*:/.test(api)) {
    errs.push(`${DISPATCH_API}: DispatchLoad type must declare assigned_primary_driver_id`);
  }

  const memoBlock = extractBlock(page, "const activeDriverLoadRows = useMemo", 2000);
  if (!memoBlock) {
    errs.push(`${DRIVERS_PAGE}: missing activeDriverLoadRows memo`);
  } else {
    if (!/driver_id\s*:/.test(memoBlock)) {
      errs.push(`${DRIVERS_PAGE}: activeDriverLoadRows must carry a driver_id field per row, not just driver_name`);
    }
    if (!/assigned_primary_driver_id/.test(memoBlock)) {
      errs.push(`${DRIVERS_PAGE}: activeDriverLoadRows must read load.assigned_primary_driver_id`);
    }
  }

  // Scope BOTH checks to the drivers-tab overview tile block specifically, not the cash_advances-tab
  // copy of Debt Alert that appears earlier in the file and was already correct — an unscoped
  // indexOf() would match that first (already-good) copy and pass vacuously even when the
  // drivers-tab copy still renders bare text. `subnavTab === "drivers"` is NOT a unique anchor (it
  // also gates an unrelated roster-table conditional earlier in the file) — `title="Settlements
  // Ready"` is the genuinely unique string that opens this specific tile block.
  const driversTabBlock = extractBlock(page, 'title="Settlements Ready"', 9000);
  // Include the complete error/retry branch plus mapped rows; 500 chars ended before the real link
  // after fail-closed debt loading was added and falsely reported the linked tile as bare text.
  const debtAlertDriversTab = driversTabBlock ? extractBlock(driversTabBlock, "Debt Alert", 1400) : null;
  const activeDriversTile = driversTabBlock ? extractBlock(driversTabBlock, "activeDriverLoadRows.map((row)", 400) : null;

  if (!debtAlertDriversTab || !/EntityLink/.test(debtAlertDriversTab)) {
    errs.push(`${DRIVERS_PAGE}: the drivers-tab Debt Alert tile must wrap the driver name in <EntityLink kind="driver" .../>, not render it as bare text`);
  }
  if (!activeDriversTile || !/EntityLink/.test(activeDriversTile)) {
    errs.push(`${DRIVERS_PAGE}: the Active Drivers · Samsara tile must wrap the driver name in <EntityLink kind="driver" .../>, not render it as bare text`);
  }
  if (!/dispatchLoadsQuery\.isError[\s\S]*dispatchLoadsQuery\.refetch\(\)/.test(page)) {
    errs.push(`${DRIVERS_PAGE}: failed dispatch movement GET must expose exact recovery`);
  }
  if (!/samsaraHealthQuery\.isError[\s\S]*samsaraHealthQuery\.refetch\(\)/.test(page)) {
    errs.push(`${DRIVERS_PAGE}: failed Samsara health GET must expose exact recovery`);
  }
  if (!/dispatchLoadsQuery\.isError \? null : Math\.max/.test(page) || !/availableCount == null \? "—"/.test(page)) {
    errs.push(`${DRIVERS_PAGE}: failed dispatch feed must not publish a fabricated availability count`);
  }

  return errs;
}

function selftest() {
  const goodApi = `
    export type DispatchLoad = {
      id: string;
      driver_short_name: string | null;
      assigned_primary_driver_id: string | null;
    };
  `;
  const badApiNoField = `
    export type DispatchLoad = {
      id: string;
      driver_short_name: string | null;
    };
  `;
  // A decoy "Debt Alert" copy BEFORE the drivers-tab marker, always correctly linked — this mirrors
  // the real file's shape (cash_advances tab is a separate, correct copy that appears earlier) and
  // exercises the scoping fix: an unscoped indexOf() would match this decoy and pass vacuously even
  // when the drivers-tab copy below is broken.
  // Two decoys, matching the exact real-file ambiguity that caused a false-pass earlier: (1) an
  // UNRELATED earlier "subnavTab === "drivers"" conditional (mirrors the real file's line-702 roster
  // table, nothing to do with the tiles) and (2) the correctly-linked cash_advances-tab copy of Debt
  // Alert. Both must be ignored by the extraction; only `title="Settlements Ready"` is unique.
  const decoyRosterConditional = `
    {subnavTab === "drivers" ? (
      <ParityTable rows={driversRowsFiltered} onRowClick={(row) => navigate(\`/drivers/\${row.id}\`)} />
    ) : null}
  `;
  const decoyDebtAlert = `
    {subnavTab === "cash_advances" ? (
    <DataPanel title="Debt Alert · before any payment" accentColor={colors.crit.strong}>
                {debtAlertRows.map((row) => (
                  <DataPanelRow key={row.driver_id}>
                    <span><EntityLink kind="driver" id={row.driver_id} label={row.driver_name} /> · x</span>
                  </DataPanelRow>
                ))}
    </DataPanel>
    ) : null}
  `;
  const decoys = decoyRosterConditional + decoyDebtAlert;
  const goodPage = decoys + `
    const availableCount = dispatchLoadsQuery.isError ? null : Math.max(1, 0);
    const availability = availableCount == null ? "—" : String(availableCount);
    {dispatchLoadsQuery.isError ? <ListErrorState onRetry={() => void dispatchLoadsQuery.refetch()} /> : null}
    {samsaraHealthQuery.isError ? <ListErrorState onRetry={() => void samsaraHealthQuery.refetch()} /> : null}
    const activeDriverLoadRows = useMemo(() => {
      const byDriver = new Map();
      for (const load of loads) {
        const driverId = isUuid(load.assigned_primary_driver_id) ? load.assigned_primary_driver_id : null;
        byDriver.set(key, { driver_id: driverId, driver_name: name });
      }
      return Array.from(byDriver.values());
    }, [x]);
    {subnavTab === "drivers" ? (
      <PreSettlementsPanel rows={settlementsReadyRows} loading={settlementsQuery.isLoading} title="Settlements Ready" />
    <DataPanel title="Debt Alert · before any payment" accentColor={colors.crit.strong}>
                {debtAlertRows.map((row) => (
                  <DataPanelRow key={row.driver_id}>
                    <span><EntityLink kind="driver" id={row.driver_id} label={row.driver_name} /> · x</span>
                  </DataPanelRow>
                ))}
    {activeDriverLoadRows.map((row) => (
      <DataPanelRow key={row.driver_id}>
        <span><EntityLink kind="driver" id={row.driver_id} label={row.driver_name} /> · x</span>
      </DataPanelRow>
    ))}
    ) : null}
  `;
  const badPageNoId = decoys + `
    const activeDriverLoadRows = useMemo(() => {
      const byDriver = new Map();
      for (const load of loads) {
        byDriver.set(name, { driver_name: name });
      }
      return Array.from(byDriver.values());
    }, [x]);
    {subnavTab === "drivers" ? (
      <PreSettlementsPanel rows={settlementsReadyRows} loading={settlementsQuery.isLoading} title="Settlements Ready" />
    <DataPanel title="Debt Alert · before any payment" accentColor={colors.crit.strong}>
                {debtAlertRows.map((row) => (
                  <DataPanelRow key={row.driver_id}>
                    <span><EntityLink kind="driver" id={row.driver_id} label={row.driver_name} /> · x</span>
                  </DataPanelRow>
                ))}
    {activeDriverLoadRows.map((row) => (
      <DataPanelRow key={row.driver_name}>
        <span>{row.driver_name} · x</span>
      </DataPanelRow>
    ))}
    ) : null}
  `;
  // This is the exact real-world bug shape: BOTH decoys are correctly linked / unrelated, but the
  // drivers-tab copy below renders bare text for BOTH tiles. Must still flag 2 — proves the fix isn't
  // just matching whichever "subnavTab === drivers" or "Debt Alert" occurrence comes first in the file.
  const badPageNoLinks = decoys + `
    const activeDriverLoadRows = useMemo(() => {
      const byDriver = new Map();
      for (const load of loads) {
        const driverId = isUuid(load.assigned_primary_driver_id) ? load.assigned_primary_driver_id : null;
        byDriver.set(key, { driver_id: driverId, driver_name: name });
      }
      return Array.from(byDriver.values());
    }, [x]);
    {subnavTab === "drivers" ? (
      <PreSettlementsPanel rows={settlementsReadyRows} loading={settlementsQuery.isLoading} title="Settlements Ready" />
    <DataPanel title="Debt Alert · before any payment" accentColor={colors.crit.strong}>
                {debtAlertRows.map((row) => (
                  <DataPanelRow key={row.driver_id}>
                    <span>{row.driver_name} · x</span>
                  </DataPanelRow>
                ))}
    {activeDriverLoadRows.map((row) => (
      <DataPanelRow key={row.driver_id}>
        <span>{row.driver_name} · x</span>
      </DataPanelRow>
    ))}
    ) : null}
  `;

  const cases = [
    { n: "good → 0", in: { dispatchApi: goodApi, driversPage: goodPage }, want: 0 },
    { n: "type missing assigned_primary_driver_id → flag", in: { dispatchApi: badApiNoField, driversPage: goodPage }, min: 1 },
    { n: "memo missing driver_id → flag", in: { dispatchApi: goodApi, driversPage: badPageNoId }, min: 1 },
    { n: "tiles render bare text, no EntityLink → flag", in: { dispatchApi: goodApi, driversPage: badPageNoLinks }, min: 2 },
  ];
  let f = 0;
  for (const c of cases) {
    const n = assertGuard(c.in).length;
    const ok = c.want !== undefined ? n === c.want : n >= c.min;
    if (!ok) f++;
    console.log(`${ok ? "ok  " : "FAIL"}  ${c.n}  (errors=${n})`);
  }
  if (f) {
    console.error(`\n${LABEL} SELFTEST FAILED: ${f}`);
    process.exit(1);
  }
  console.log(`\n${LABEL} SELFTEST PASS`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const apiPath = path.join(ROOT, DISPATCH_API);
const pagePath = path.join(ROOT, DRIVERS_PAGE);
if (!fs.existsSync(apiPath)) {
  console.error(`[${LABEL}] FAILED — missing ${DISPATCH_API}`);
  process.exit(1);
}
if (!fs.existsSync(pagePath)) {
  console.error(`[${LABEL}] FAILED — missing ${DRIVERS_PAGE}`);
  process.exit(1);
}

const errs = assertGuard({
  dispatchApi: fs.readFileSync(apiPath, "utf8"),
  driversPage: fs.readFileSync(pagePath, "utf8"),
});
if (errs.length) {
  console.error(`[${LABEL}] FAILED — ${errs.length} issue(s):`);
  for (const e of errs) console.error(`  ✗ ${e}`);
  process.exit(1);
}
console.log(`[${LABEL}] OK — Drivers page hub tiles (Debt Alert, Active Drivers · Samsara) link driver names to canonical /drivers/:id.`);
