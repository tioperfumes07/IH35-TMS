#!/usr/bin/env node
// ACCT-F11122 — a Relay fill's day is the company's Central business day, never the UTC date.
//
// Measured on prod 2026-11-09 (USMCA): GET /api/v1/fuel/relay-fills?from=2026-10-01&to=2026-10-31 compared
// relay_created_at (timestamptz) with a bare $n::date — the session zone is GMT — and returned 117 fills / $57,640.75.
// Relay's own October export (owner CSV, "processing time" CDT) has 112 fills / $54,553.79. The 5 extra fills were
// processed 2026-09-30 19:02–22:31 CT (txn_ALsxDZuxjp2HYP, txn_Eznea2z1Qaxt1C, txn_6SudtjS7vX7uYM, txn_CMNHfL5KgEbj9q,
// txn_9KGf6fsRUDFVT3; $3,086.96): real September fills, not duplicates. With the Central filter: Oct 112 / $54,553.79,
// Sep 141 → 146.
//
// RULE 1 — fuel/relay-fill-day.sql.ts converts through COMPANY_TIME_ZONE (relayFillDaySql, relayFillOnOrAfterDaySql,
//          relayFillOnOrBeforeDaySql).
// RULE 2 — relay-fills.routes.ts from/to and reefer-fuel.service.ts feed day go through those helpers.
// RULE 3 — no backend source compares or casts relay_created_at to a UTC date (`relay_created_at::date`,
//          `(…relay_created_at)::date`, `relay_created_at >= $n::date`, `< ($n::date + 1)`) outside the pinned list
//          below (shrink-only; a pin that disappears must be removed).
import fs from "node:fs";
import path from "node:path";

const ROOT = "apps/backend/src";
const HELPER = "fuel/relay-fill-day.sql.ts";
const ROUTE = "fuel/relay-fills.routes.ts";
const REEFER = "fuel/reefer-fuel.service.ts";

// file → count of UTC-date uses still present (11-09). Not owner-visible day buckets:
//   bank-recon/match.service.ts — bank-line candidate windows (±days around a bank date; the bank-match lane owns it);
//   relay-fuel-ingest.cron.ts — the API pull floor (max day already pulled; Relay's API takes UTC dates).
export const PINNED = { "accounting/bank-recon/match.service.ts": 3, "integrations/relay-payments/relay-fuel-ingest.cron.ts": 1 };

const UTC_DATE = /relay_created_at\)?::date|relay_created_at\s*(?:>=|<=|<|>)\s*\(?\$\d+::date/g;

export function audit(files) {
  const out = [];
  const h = files[HELPER];
  if (h == null) out.push(`RULE 1: ${HELPER} is missing`);
  else {
    if (!/import \{ COMPANY_TIME_ZONE \} from "\.\.\/lib\/company-business-date\.js"/.test(h)) out.push("RULE 1: helper does not read COMPANY_TIME_ZONE");
    for (const fn of ["relayFillDaySql", "relayFillOnOrAfterDaySql", "relayFillOnOrBeforeDaySql"]) {
      const i = h.indexOf(`export function ${fn}`);
      const body = i < 0 ? "" : h.slice(i, h.indexOf("\n}", i));
      if (!body) out.push(`RULE 1: ${fn} missing`);
      else if (!/AT TIME ZONE '\$\{COMPANY_TIME_ZONE\}'/.test(body)) out.push(`RULE 1: ${fn} no longer converts through COMPANY_TIME_ZONE`);
    }
  }
  const r = files[ROUTE] ?? "";
  if (!/relayFillOnOrAfterDaySql\("r", `\$\$\{values\.length\}`\)/.test(r) || !/relayFillOnOrBeforeDaySql\("r", `\$\$\{values\.length\}`\)/.test(r)) {
    out.push("RULE 2: relay-fills.routes.ts from/to no longer use the Central-day helpers");
  }
  const rf = files[REEFER] ?? "";
  if ((rf.match(/\$\{relayFillDaySql\("t"\)\}/g) ?? []).length < 3) out.push("RULE 2: reefer-fuel.service.ts feed day no longer uses relayFillDaySql (3 uses)");

  for (const [rel, src] of Object.entries(files)) {
    if (rel === HELPER || src == null) continue;
    const code = src.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
    const n = (code.match(UTC_DATE) ?? []).length;
    const pin = PINNED[rel] ?? 0;
    if (n > pin) out.push(`RULE 3: ${rel} buckets/filters relay_created_at on the UTC date (${n} uses, pinned ${pin}) — use fuel/relay-fill-day.sql.ts`);
    else if (n < pin) out.push(`RULE 3: ${rel} pinned ${pin} UTC-date uses but has ${n} — lower the pin (shrink-only)`);
  }
  return out;
}

function walk(dir, acc) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name === "__tests__") continue;
      walk(p, acc);
    } else if (e.name.endsWith(".ts") && !/\.(test|spec)\.ts$/.test(e.name)) acc.push(p);
  }
  return acc;
}

function load(root) {
  const files = {};
  const base = path.join(root, ROOT);
  for (const p of walk(base, [])) files[path.relative(base, p).split(path.sep).join("/")] = fs.readFileSync(p, "utf8");
  for (const k of [HELPER, ROUTE, REEFER]) if (!(k in files)) files[k] = null;
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
    ["route back to UTC from", plant(ROUTE, 'where.push(relayFillOnOrAfterDaySql("r", `$${values.length}`));', "where.push(`r.relay_created_at >= $${values.length}::date`);")],
    ["route back to UTC to", plant(ROUTE, 'where.push(relayFillOnOrBeforeDaySql("r", `$${values.length}`));', "where.push(`r.relay_created_at < ($${values.length}::date + 1)`);")],
    ["reefer feed back to UTC", plant(REEFER, '${relayFillDaySql("t")} BETWEEN', "(t.relay_created_at)::date BETWEEN")],
    ["helper loses the zone", plant(HELPER, "return `(${alias}.relay_created_at AT TIME ZONE '${COMPANY_TIME_ZONE}')::date`;", "return `(${alias}.relay_created_at)::date`;")],
    ["a new UTC bucket elsewhere", { ...good, "reports/new.ts": "const q = `SELECT date_trunc('day', x) FROM y r WHERE r.relay_created_at::date = $1::date`;" }],
    ["a pinned file grows", plant("accounting/bank-recon/match.service.ts", "r.relay_created_at::date::text AS event_date,", "r.relay_created_at::date::text AS event_date, r.relay_created_at::date AS d2,")],
  ];
  let caught = 0;
  for (const [name, files] of cases) {
    if (audit(files).length === 0) throw new Error(`SELFTEST FAIL: planted defect '${name}' went undetected`);
    caught += 1;
  }
  console.log(`verify-relay-fill-dates-central: SELFTEST PASS (${caught}/${cases.length} planted defects caught)`);
  process.exit(0);
}

const failures = audit(load(process.cwd()));
if (failures.length) {
  console.error("verify-relay-fill-dates-central FAILED:");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`verify-relay-fill-dates-central: PASS — Relay fill days on ${"America/Chicago"}; ${Object.values(PINNED).reduce((a, b) => a + b, 0)} pinned non-report UTC uses`);
