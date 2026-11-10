#!/usr/bin/env node
// ACCT-F11108 — the AlwaysTrack LOAD HISTORY export is imported as ONE file, through the ONE historical load engine.
//
// Root cause: the app had no importer for this export. The only HTTP load path books live_feed (city-only stops refused,
// a load that already ran judged on the driver's current hours); historical_backfill was reachable only through the
// Settlement Creator, one signed settlement at a time. Owner order 2026-11-09: "not manually not one by one".
//
// RULE 1 — the route exists, is registered in index.ts, and is Owner-only.
// RULE 2 — the service books ONLY through bookLoadOnClient(..., { source: "historical_backfill" }) — no raw INSERT into
//          mdata.loads / mdata.load_stops / accounting.*, no live_feed.
// RULE 3 — a Completed load is delivered through deliverLoadThroughDispatch (driver bill, revenue latch, invoice) after
//          stampStopsFromTracking — never a status UPDATE.
// RULE 4 — delta only: the service looks the load number up in mdata.loads and skips it (skipped_existing) before booking.
// RULE 5 — the parser ties the read rows to the export's own Totals line (count AND charges) and refuses a mismatch.
// RULE 6 — nothing is created: no customer / driver / unit / equipment INSERT; an unmatched name is a refusal.
// RULE 7 (part 2, measured 2026-11-09: 18 of 35 real loads refused by loads_miles_shortest_not_over_practical) — AT's paid
//          miles are loaded + empty: miles_shortest is loadedPayMiles (paid less E.Miles) and E.Miles goes to miles_deadhead;
//          the raw payMiles total is never booked as miles_shortest.
// RULE 8 — the service checks short <= practical itself (pay_miles_over_practical) so a preview answers what a commit does.
import fs from "node:fs";

const PARSER = "apps/backend/src/dispatch/alwaystrack-load-history-import.ts";
const SERVICE = "apps/backend/src/dispatch/alwaystrack-load-history-import.service.ts";
const ROUTES = "apps/backend/src/dispatch/alwaystrack-load-history-import.routes.ts";
const INDEX = "apps/backend/src/index.ts";
const FILES = [PARSER, SERVICE, ROUTES, INDEX];

export function audit(files) {
  const out = [];
  for (const f of FILES) if (files[f] == null) out.push(`${f} is missing`);
  if (out.length) return out;
  const routes = files[ROUTES];
  const svc = files[SERVICE];
  const parser = files[PARSER];
  const index = files[INDEX];

  if (!/registerAlwaysTrackLoadHistoryImportRoutes\(app\)/.test(index)) out.push("RULE 1: the import route is not registered in index.ts");
  if (!/\/api\/v1\/dispatch\/loads\/import\/alwaystrack-load-history/.test(routes)) out.push("RULE 1: the import route path is gone");
  if (!/role \?\? ""\) !== "Owner"\) return reply\.code\(403\)/.test(routes)) out.push("RULE 1: the import route is not Owner-only");

  if (!/bookLoadOnClient\(client as never, input, \{ source: "historical_backfill" \}\)/.test(svc)) {
    out.push('RULE 2: the service does not book through bookLoadOnClient(..., { source: "historical_backfill" })');
  }
  if (/live_feed/.test(svc)) out.push("RULE 2: the service names live_feed");
  if (/INSERT\s+INTO\s+(mdata|accounting|driver_finance|dispatch)\./i.test(svc)) out.push("RULE 2/6: the service writes a raw INSERT");
  if (/UPDATE\s+mdata\.loads/i.test(svc)) out.push("RULE 3: the service updates mdata.loads directly (status must move through dispatch)");

  const stampAt = svc.indexOf("await stampStopsFromTracking(");
  const deliverAt = svc.indexOf("await deliverLoadThroughDispatch(");
  if (deliverAt < 0) out.push("RULE 3: a completed load is not delivered through deliverLoadThroughDispatch");
  if (stampAt < 0 || (deliverAt >= 0 && stampAt > deliverAt)) out.push("RULE 3: stops are not stamped from tracking before delivery");

  const existAt = svc.indexOf('outcome: "skipped_existing"');
  const bookAt = svc.indexOf("await bookLoadOnClient(");
  if (existAt < 0 || !/FROM mdata\.loads\s+WHERE operating_company_id = \$1::uuid AND load_number = \$2/.test(svc)) {
    out.push("RULE 4: the service no longer skips a load number already in the company");
  } else if (bookAt >= 0 && existAt > bookAt) out.push("RULE 4: the delta check runs after booking");

  if (!/const short = loadedPayMiles\(row\) \?\? practical;/.test(svc)) out.push("RULE 7: miles_shortest is not loadedPayMiles (AT's paid miles include empty miles)");
  if (/const short = payMiles\(row\)/.test(svc)) out.push("RULE 7: the raw paid-miles total (loaded + empty) is booked as miles_shortest");
  if (!/miles_deadhead: empty \?\? undefined,/.test(svc) || !/const empty = emptyPayMiles\(row\);/.test(svc)) out.push("RULE 7: E.Miles is not booked as miles_deadhead");
  if (!/return Math\.round\(\(paid - \(emptyPayMiles\(row\) \?\? 0\)\) \* 10\) \/ 10;/.test(parser)) out.push("RULE 7: loadedPayMiles no longer subtracts E.Miles");
  const overAt = svc.indexOf('"pay_miles_over_practical"');
  const previewAt = svc.indexOf("if (!ctx.commit) {");
  if (overAt < 0 || !/short > practical/.test(svc)) out.push("RULE 8: the service no longer refuses short > practical itself");
  else if (previewAt >= 0 && overAt > previewAt) out.push("RULE 8: the short <= practical check runs after the preview returns");
  if (!/totals_count_mismatch/.test(parser) || !/totals_charges_mismatch/.test(parser)) out.push("RULE 5: the parser no longer ties to the export's Totals line");
  if (/\bfindIndex\(\(l\) => l && l\[0\] === "Load#"\)/.test(parser) === false) out.push("RULE 5: the header is no longer found by content");
  return out;
}

function load(root) {
  const files = {};
  for (const f of FILES) {
    try {
      files[f] = fs.readFileSync(`${root}/${f}`, "utf8");
    } catch {
      files[f] = null;
    }
  }
  return files;
}

if (process.argv.includes("--selftest")) {
  const good = load(process.cwd());
  const clean = audit(good);
  if (clean.length) throw new Error("SELFTEST FAIL (live tree should be clean): " + JSON.stringify(clean));
  const plant = (file, from, to) => {
    const f = { ...good };
    if (!f[file] || !f[file].includes(from)) throw new Error(`SELFTEST setup broken: '${from}' not in ${file}`);
    f[file] = f[file].replace(from, to);
    return f;
  };
  const cases = [
    ["route unregistered", plant(INDEX, "await registerAlwaysTrackLoadHistoryImportRoutes(app);", "")],
    ["route not owner-only", plant(ROUTES, 'role ?? "") !== "Owner") return reply.code(403)', 'role ?? "") === "Nobody") return reply.code(403)')],
    ["books live_feed", plant(SERVICE, '{ source: "historical_backfill" })', '{ source: "live_feed" })')],
    ["raw insert", plant(SERVICE, "const booked = await bookLoadOnClient(", "await client.query(`INSERT INTO mdata.loads (id) VALUES (gen_random_uuid())`);\n  const booked = await bookLoadOnClient(")],
    ["status written directly", plant(SERVICE, "await deliverLoadThroughDispatch(client as never, ctx.actor.uuid, ctx.opco, loadId, row.delivery_date);", "await client.query(`UPDATE mdata.loads SET status = 'delivered' WHERE id = $1`, [loadId]);")],
    ["no tracking stamp", plant(SERVICE, "await stampStopsFromTracking(client as never, loadId,", "void (client as never, loadId,")],
    ["delta check removed", plant(SERVICE, 'outcome: "skipped_existing"', 'outcome: "refused"')],
    ["totals not tied", plant(PARSER, "totals_charges_mismatch", "totals_ignored")],
    ["paid total booked as short", plant(SERVICE, "const short = loadedPayMiles(row) ?? practical;", "const short = payMiles(row) ?? practical;")],
    ["empty miles dropped", plant(SERVICE, "miles_deadhead: empty ?? undefined,", "")],
    ["loaded miles not net of empty", plant(PARSER, "return Math.round((paid - (emptyPayMiles(row) ?? 0)) * 10) / 10;", "return paid;")],
    ["preview blind to the CHECK", plant(SERVICE, "if (short != null && practical != null && short > practical) {", "if (false) {")],
  ];
  let caught = 0;
  for (const [name, files] of cases) {
    if (audit(files).length === 0) throw new Error(`SELFTEST FAIL: planted defect '${name}' went undetected`);
    caught += 1;
  }
  console.log(`verify-alwaystrack-load-history-import: SELFTEST PASS (${caught}/${cases.length} planted defects caught)`);
  process.exit(0);
}

const failures = audit(load(process.cwd()));
if (failures.length) {
  console.error("verify-alwaystrack-load-history-import FAILED:");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("verify-alwaystrack-load-history-import: PASS — one Owner-only route, historical_backfill engine, delivered through dispatch, delta-only, tied to the export's Totals");
