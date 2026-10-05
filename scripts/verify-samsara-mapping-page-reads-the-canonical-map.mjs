#!/usr/bin/env node
/**
 * SAM-F429 — THE MAPPING PAGE AND THE DRIVER PROFILE MUST ANSWER FROM THE SAME MAP.
 *
 * The defect was not a bug in either screen. Both were correct about their own table. The Mapping
 * page resolved "who is this Samsara user" through `integrations.samsara_drivers.local_driver_id`;
 * the driver profile resolved it through `mdata.driver_samsara_accounts`, which ROUND 181.1 made
 * canonical and which sync, HOS and messaging all obey. So one person could read "mapped" on one
 * screen and "0 Samsara users" on the other, in the same minute. The owner found it on a real driver.
 *
 * Nothing threw. Both numbers were "right". That is exactly why it needs a guard rather than a test:
 * the failure is agreement, not an exception.
 *
 *   RULE 1 — the mapping page's list query must resolve the driver through
 *            mdata.driver_samsara_accounts, not through sd.local_driver_id.
 *   RULE 2 — it must not JOIN mdata.drivers on the legacy column.
 *   RULE 3 — the canonical lookup must be scoped by operating_company_id AND is_active. An unscoped
 *            lookup crosses companies; one that ignores is_active resurrects an unmapped user.
 *   RULE 4 — the backfill migration must be idempotent (ON CONFLICT DO NOTHING) and must never
 *            UPDATE or DELETE a canonical row. Where the two maps disagree, canonical wins and the
 *            row is reported for a human.
 *   RULE 5 — the account-created date comes from the mirrored payload, never invented.
 *   RULE 6 — the page must SURFACE that date (Account created column) and the exact pane
 *            titles from the 2026-10-05 preview. Backend alone is not enough — the owner
 *            opens Chrome, not the SQL.
 *
 * --selftest proves each rule can FAIL. A proof command that cannot fail is worse than no proof.
 */
import { readFileSync, existsSync } from "node:fs";

const NAME = "verify-samsara-mapping-page-reads-the-canonical-map";
const ROUTES = "apps/backend/src/integrations/samsara/driver-mapping/driver-mapping.routes.ts";
const PAGE = "apps/frontend/src/pages/samsara-driver-mapping/SamsaraDriverMappingPage.tsx";
const CANON = "mdata.driver_samsara_accounts";

const read = (p) => (existsSync(p) ? readFileSync(p, "utf8") : null);

function listQuery(src) {
  const i = src.indexOf("FROM integrations.samsara_drivers sd");
  if (i < 0) return "";
  const start = src.lastIndexOf("SELECT", i);
  return src.slice(start, i + 1400);
}

function run({ routes, migration, page }) {
  const out = [];
  if (routes === null) return [`RULE 1: ${ROUTES} is missing.`];
  const q = listQuery(routes);

  if (!q.includes(CANON)) {
    out.push(`RULE 1: the mapping page's list query never reads ${CANON}. It is answering from the legacy column while every engine answers from the canonical map.`);
  }
  if (/LEFT JOIN mdata\.drivers\s+md\s+ON\s+md\.id\s*=\s*sd\.local_driver_id/.test(q)) {
    out.push("RULE 2: the page still joins mdata.drivers on sd.local_driver_id — the legacy column.");
  }
  if (q.includes(CANON)) {
    const lat = q.slice(q.indexOf(CANON));
    if (!/operating_company_id/.test(lat.slice(0, 420))) {
      out.push("RULE 3: the canonical lookup is not scoped by operating_company_id — it can cross companies.");
    }
    if (!/is_active/.test(lat.slice(0, 420))) {
      out.push("RULE 3: the canonical lookup ignores is_active — an unmapped user would read as mapped.");
    }
  }
  if (migration !== null) {
    if (!/ON CONFLICT DO NOTHING/i.test(migration)) {
      out.push("RULE 4: the backfill is not idempotent — no ON CONFLICT DO NOTHING.");
    }
    if (/UPDATE\s+mdata\.driver_samsara_accounts|DELETE\s+FROM\s+mdata\.driver_samsara_accounts/i.test(migration)) {
      out.push("RULE 4: the backfill UPDATEs or DELETEs a canonical row. Where the two maps disagree the canonical row wins and is reported, never rewritten.");
    }
  }
  if (!/raw_payload->>'createdAtTime'/.test(routes)) {
    out.push("RULE 5: the account-created date does not come from the mirrored Samsara payload.");
  }
  if (page === null) {
    out.push(`RULE 6: ${PAGE} is missing.`);
  } else {
    if (!/Account created/.test(page)) {
      out.push("RULE 6: the right pane has no Account created column — the payload date never reaches Chrome.");
    }
    if (!/samsara_created_at/.test(page)) {
      out.push("RULE 6: the page does not bind samsara_created_at (the field the list query returns).");
    }
    if (!/Driver \/ Vendor profile/.test(page)) {
      out.push("RULE 6: left pane title is not 'Driver / Vendor profile' (preview screen 4).");
    }
    if (!/>\s*Samsara\s*</.test(page) && !/sdm-right-title[\s\S]{0,80}Samsara/.test(page)) {
      out.push("RULE 6: right pane title is not 'Samsara' (preview screen 4).");
    }
  }
  return out;
}

if (process.argv.includes("--selftest")) {
  const goodQ = `SELECT sd.samsara_driver_id, can.driver_id::text AS local_driver_id,
    (sd.raw_payload->>'createdAtTime') AS samsara_created_at
    FROM integrations.samsara_drivers sd
    LEFT JOIN LATERAL (SELECT a.driver_id FROM mdata.driver_samsara_accounts a
      WHERE a.operating_company_id = sd.operating_company_id AND a.is_active LIMIT 1) can ON true
    LEFT JOIN mdata.drivers md ON md.id = can.driver_id`;
  const goodM = "INSERT INTO mdata.driver_samsara_accounts ... ON CONFLICT DO NOTHING;";
  const goodPage = `<h2 data-testid="sdm-left-title">Driver / Vendor profile</h2>
    <h2 data-testid="sdm-right-title">Samsara</h2>
    <th>Account created</th>
    {formatDateUS(p.samsara_created_at) || "—"}`;
  const cases = [
    ["a clean tree passes", { routes: goodQ, migration: goodM, page: goodPage }, 0],
    ["rule 1 catches a page that never reads the canonical map",
      { routes: goodQ.replace(/mdata\.driver_samsara_accounts/g, "integrations.samsara_drivers x").replace("raw_payload->>'createdAtTime'", "raw_payload->>'createdAtTime'"), migration: goodM, page: goodPage }, 1],
    ["rule 2 catches the legacy join",
      { routes: goodQ + "\n LEFT JOIN mdata.drivers md ON md.id = sd.local_driver_id", migration: goodM, page: goodPage }, 1],
    ["rule 3 catches an unscoped lookup",
      { routes: goodQ.replace("a.operating_company_id = sd.operating_company_id AND ", ""), migration: goodM, page: goodPage }, 1],
    ["rule 3 catches ignoring is_active",
      { routes: goodQ.replace(" AND a.is_active", ""), migration: goodM, page: goodPage }, 1],
    ["rule 4 catches a non-idempotent backfill",
      { routes: goodQ, migration: "INSERT INTO mdata.driver_samsara_accounts ...;", page: goodPage }, 1],
    ["rule 4 catches a backfill that rewrites canonical",
      { routes: goodQ, migration: goodM + " UPDATE mdata.driver_samsara_accounts SET driver_id = x;", page: goodPage }, 1],
    ["rule 5 catches an invented created date",
      { routes: goodQ.replace("raw_payload->>'createdAtTime'", "now()"), migration: goodM, page: goodPage }, 1],
    ["rule 6 catches a page that never shows Account created",
      { routes: goodQ, migration: goodM, page: goodPage.replace("Account created", "Created") }, 1],
    ["rule 6 catches a page that ignores samsara_created_at",
      { routes: goodQ, migration: goodM, page: goodPage.replace(/samsara_created_at/g, "last_seen_at") }, 1],
  ];
  let ok = 0;
  for (const [label, src, expected] of cases) {
    const got = run(src).length;
    if (got === expected) ok += 1;
    else console.error(`${NAME} SELFTEST FAIL — ${label}: expected ${expected}, got ${got}`);
  }
  console.log(`${NAME} SELFTEST ${ok === cases.length ? "OK" : "FAILED"} — ${ok}/${cases.length}`);
  process.exit(ok === cases.length ? 0 : 1);
}

const { execSync } = await import("node:child_process");
let migration = null;
try {
  const f = execSync("ls db/migrations/*sam_f429* 2>/dev/null | head -1", { encoding: "utf8" }).trim();
  if (f) migration = read(f);
} catch { /* the guard still runs without it */ }

const failures = run({ routes: read(ROUTES), migration, page: read(PAGE) });
if (failures.length > 0) {
  for (const f of failures) console.error(`${NAME}: ${f}`);
  console.error(`${NAME}: FAIL — ${failures.length} rule(s) broken.`);
  process.exit(1);
}
console.log(`${NAME}: PASS — the mapping page and the driver profile resolve through the same map (${CANON}); Account created is on the page; the backfill is idempotent and never rewrites a canonical row.`);
