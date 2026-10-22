#!/usr/bin/env node
/**
 * LEAD 443.208R (CC-2) — ONE load-change signal, every writer, every screen. Owner 10-21 16:10 CT: "if data is updated in
 * one location it is automatically and instantly updated in all locations." Pinned:
 *  1. Migration 202616060700: trg_notify_load_changed → mdata.notify_load_changed() on EVERY table a load view reads
 *     (REQUIRED below), each with the column holding its load id.
 *  2. apps/backend/src/realtime/load-change-bus.ts LISTENs on the DIRECT endpoint (a "-pooler" endpoint never delivers
 *     LISTEN), reconnects, and CATCHES UP on reconnect; index.ts starts it beside the outbox processor.
 *  3. notifications/stream.routes.ts forwards it as a NAMED event `load.changed`, filtered to
 *     org.user_accessible_company_ids(), coalesced.
 *  4. The frontend bus is mounted ONCE (main.tsx), listens for `load.changed`, calls invalidateLoadViews, and RECONNECTS
 *     (the bell's EventSource closed for good on its first error).
 *  5. invalidateLoadViews covers Truck Line, List, Kanban and Load Costs (the four boards the owner watches).
 * Static, <1s. --selftest plants each regression.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-load-change-signal-complete";
const MIG = "db/migrations/202616060700_load_changed_notify.sql";
const BUS = "apps/backend/src/realtime/load-change-bus.ts";
const INDEX = "apps/backend/src/index.ts";
const SSE = "apps/backend/src/notifications/stream.routes.ts";
const MAIN = "apps/frontend/src/main.tsx";
const HOOK = "apps/frontend/src/hooks/useRealtimeBus.ts";
const HELPER = "apps/frontend/src/lib/invalidateLoadViews.ts";
const FILES = [MIG, BUS, INDEX, SSE, MAIN, HOOK, HELPER];
export const REQUIRED = [
  ["mdata", "loads", "id"], ["mdata", "load_stops", "load_id"], ["driver_finance", "driver_settlements", "settlement"],
  ["driver_finance", "settlement_lines", "load_id"], ["driver_finance", "driver_bills", "load_id"],
  ["accounting", "invoices", "source_load_id"], ["dispatch", "load_cancellations", "load_id"], ["accounting", "expenses", "load_id"],
  ["accounting", "bills", "load_id"], ["accounting", "bill_lines", "load_id"], ["fuel", "fuel_transactions", "load_id"],
];

export function check(f) {
  const p = [];
  const mig = f[MIG] ?? "", bus = f[BUS] ?? "", index = f[INDEX] ?? "", sse = f[SSE] ?? "", main = f[MAIN] ?? "", hook = f[HOOK] ?? "", helper = f[HELPER] ?? "";
  if (!/PERFORM pg_notify\('load_changed'/.test(mig)) p.push(`${MIG}: notify_load_changed does not pg_notify('load_changed')`);
  if (!/AFTER INSERT OR UPDATE OR DELETE ON %I\.%I/.test(mig)) p.push(`${MIG}: the trigger is not AFTER INSERT OR UPDATE OR DELETE`);
  for (const [s, t, c] of REQUIRED) {
    if (!mig.includes(`('${s}', '${t}', '${c}')`)) p.push(`${MIG}: ${s}.${t} (${c}) carries no load_changed trigger — its writes never reach the screens`);
  }
  if (!/LISTEN \$\{LOAD_CHANGED_CHANNEL\}/.test(bus)) p.push(`${BUS}: the bus does not LISTEN load_changed`);
  if (!/replace\(\/\(@\[\^\/\?\]\*\?\)-pooler\(\\\.\)\//.test(bus)) p.push(`${BUS}: the bus may LISTEN on a "-pooler" endpoint (never delivered)`);
  if (!/await catchUp\(c, log\)/.test(bus)) p.push(`${BUS}: no catch-up on reconnect (a notify missed while disconnected is lost)`);
  if (!/while \(!stopping\)/.test(bus)) p.push(`${BUS}: no reconnect loop`);
  if (!/startLoadChangeBus\(/.test(index)) p.push(`${INDEX}: the load-change bus is never started`);
  if (!/event: load\.changed\\ndata:/.test(sse)) p.push(`${SSE}: load.changed is not a NAMED SSE event`);
  if (!/org\.user_accessible_company_ids\(\)/.test(sse) || !/accessible\.has\(event\.company_id\)/.test(sse)) p.push(`${SSE}: load.changed is not filtered to the user's companies`);
  if (!/onLoadChanged\(/.test(sse)) p.push(`${SSE}: the stream does not subscribe to the bus`);
  if ((main.match(/<RealtimeBus \/>/g) ?? []).length !== 1) p.push(`${MAIN}: the realtime bus is not mounted exactly once`);
  if (!/addEventListener\("load\.changed"/.test(hook) || !/invalidateLoadViews\(qc/.test(hook)) p.push(`${HOOK}: load.changed does not refresh the load views`);
  if (!/timer = setTimeout\(connect, delay\)/.test(hook)) p.push(`${HOOK}: the bus never reconnects after an error`);
  for (const k of ["truck-line", "loads", "kanban", "load-costs", "load-costs-board"]) {
    if (!new RegExp(`"${k}"`).test(helper)) p.push(`${HELPER}: invalidateLoadViews does not cover "${k}"`);
  }
  return p;
}
const readAll = () => Object.fromEntries(FILES.map((f) => [f, fs.existsSync(path.join(ROOT, f)) ? fs.readFileSync(path.join(ROOT, f), "utf8") : ""]));

if (process.argv.includes("--selftest")) {
  const real = readAll();
  const base = check(real);
  if (base.length) { console.error(`${LABEL} --selftest: real tree not clean:\n  ${base.join("\n  ")}`); process.exit(1); }
  const plant = (file, from, to) => ({ ...real, [file]: real[file].replace(from, to) });
  const plants = [
    ["fuel rows silent", plant(MIG, "('fuel', 'fuel_transactions', 'load_id')", "('fuel', 'x', 'load_id')")],
    ["settlement headers silent", plant(MIG, "('driver_finance', 'driver_settlements', 'settlement'),", "")],
    ["no notify", plant(MIG, "PERFORM pg_notify('load_changed'", "PERFORM 1 /*")],
    ["LISTEN on pooler", plant(BUS, 'return pooled.replace(/(@[^/?]*?)-pooler(\\.)/, "$1$2");', "return pooled;")],
    ["no catch-up", plant(BUS, "await catchUp(c, log);", "")],
    ["bus never started", plant(INDEX, "startLoadChangeBus({", "void ({")],
    ["unnamed SSE", plant(SSE, "event: load.changed\\ndata:", "data:")],
    ["no company filter", plant(SSE, "!accessible.has(event.company_id)", "false")],
    ["bus not mounted", plant(MAIN, "<RealtimeBus />", "")],
    ["no reconnect", plant(HOOK, "timer = setTimeout(connect, delay);", "")],
    ["truck line not refreshed", plant(HELPER, '"truck-line", ', "")],
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
console.log(`${LABEL} PASS — every load table signals at commit; the bus listens on the direct endpoint, catches up, and every open screen of the company refreshes`);
