#!/usr/bin/env node
/**
 * LEAD 443.281-E — person names are normalized at WRITE, not only at read.
 *
 * Measured 10-23: 78 of 170 USMCA drivers stored ALL-CAPS first names ("EDUARDO AZAEL FLORES ORTIZ", "HUGO GAYTAN…");
 * screens proper-cased them through the frontend's formatPersonName, so every reader that skipped it (exports, PDFs,
 * QBO, search) showed raw caps. Migration 202616210300 adds mdata.proper_person_name + a BEFORE INSERT/UPDATE trigger
 * on mdata.drivers (every writer), and normalized the existing USMCA rows through it.
 *
 * STATIC: the migration keeps the trigger on first_name/last_name and the same word rules as formatPersonName
 *         (II/III/IV upper, Jr/Sr, deliberate mixed case kept, initcap per hyphen/apostrophe part).
 * LIVE (DATABASE_URL / gate read-only credential): no USMCA driver whose stored first/last name differs from
 *         mdata.proper_person_name(name).
 * --selftest plants each regression and requires a FAIL.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ALLOW_OFFLINE_SKIP =
  "mixed guard: the static arm (migration trigger + casing rules) always runs; the live row arm needs the gate's read-only credential and says LIVE NOT RUN without it";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-person-names-normalized-at-write";
const MIGRATION = "db/migrations/202616210300_driver_names_normalized_at_write.sql";
const FE = "apps/frontend/src/lib/formatPersonName.ts";

// ROW 5 (register): the DISPLAY arm. PEOPLE render proper-cased on every screen; ORGANISATIONS keep their casing.
const FILE = (p) => `apps/frontend/src/${p}`;
export const PERSON_SURFACES = [
  [FILE("pages/DriverDetail.tsx"), /title=\{formatPersonName\(`\$\{driver\.first_name\} \$\{driver\.last_name\}`\)\}/, "driver profile title"],
  [FILE("pages/Drivers.tsx"), /const v = formatPersonName\(`\$\{row\.first_name\} \$\{row\.last_name\}`\)/, "drivers roster name column"],
  [FILE("pages/customers/components/PortalUsersTab.tsx"), /formatPersonName\(row\.full_name\)/, "customer portal users name"],
  [FILE("pages/Customers.tsx"), /formatPersonName\(customer\.main_contact_name\)/, "customer main contact"],
  [FILE("pages/tasks/TasksChatPage.tsx"), /formatPersonName\(c\.author_name\)/, "task comment author"],
  [FILE("components/dispatch/LoadDetailDrawer.tsx"), /formatPersonName\(load\.assigned_primary_driver_name\)/, "load drawer driver"],
];
// Org names are written exactly as typed — never through the person-name proper-caser ("ACME" must not become "Acme").
export const ORG_WRITES = [
  [FILE("components/customers/CustomerProfileForm.tsx"), /properPersonOrPlaceName\(v\.name|properOr(?:Undef|Null)\(v\.print_on_invoice_name/, "customer name / print-on-invoice name"],
  [FILE("components/vendors/VendorCreateModal.tsx"), /properPersonOrPlaceName\((?:name|printOnCheckName)\.trim\(\)\)/, "vendor display / print-on-check name"],
  [FILE("pages/maintenance/components/CreateWorkOrderModal.tsx"), /properPersonOrPlaceName\(values\.shop_name\)/, "shop (vendor) name"],
];

export function displayFailures(files) {
  const f = [];
  const el = files[FILE("lib/entity-label.ts")] ?? "";
  if (!/const PERSON_NOUNS = new Set\(\["driver", "user"\]\);/.test(el)) f.push("entityLabel PERSON_NOUNS must be exactly driver|user (orgs keep their casing)");
  for (const [file, re, what] of PERSON_SURFACES) if (!re.test(files[file] ?? "")) f.push(`${what} is not rendered through formatPersonName (${file})`);
  for (const [file, re, what] of ORG_WRITES) if (re.test(files[file] ?? "")) f.push(`${what} is proper-cased — an organisation name must keep its casing (${file})`);
  return f;
}

export function staticFailures(sql, fe) {
  const f = [];
  if (!/CREATE TRIGGER trg_drivers_proper_names\s+BEFORE INSERT OR UPDATE OF first_name, last_name ON mdata\.drivers/.test(sql)) {
    f.push("mdata.drivers has no BEFORE INSERT/UPDATE name-normalizing trigger");
  }
  if (!/NEW\.first_name := mdata\.proper_person_name\(NEW\.first_name\)/.test(sql) || !/NEW\.last_name := mdata\.proper_person_name\(NEW\.last_name\)/.test(sql)) {
    f.push("the trigger does not normalize BOTH first_name and last_name");
  }
  if (!/bare IN \('II', 'III', 'IV'\)/.test(sql) || !/bare IN \('JR', 'SR'\)/.test(sql)) f.push("suffix rules (II/III/IV, Jr/Sr) differ from formatPersonName");
  if (!/w <> upper\(w\) AND w <> lower\(w\) AND substr\(w, 2\) <> lower\(substr\(w, 2\)\)/.test(sql)) f.push("deliberate mixed case (McDonald) is not kept");
  if (!/initcap\(lower\(w\)\)/.test(sql)) f.push("ALL-CAPS / lowercase words are not proper-cased per hyphen/apostrophe part");
  if (!/KEEP_UPPER = new Set\(\["II", "III", "IV", "JR", "SR"\]\)/.test(fe)) f.push("frontend formatPersonName suffix set changed — keep the DB rule in step");
  return f;
}

const displayFiles = Object.fromEntries(
  [FILE("lib/entity-label.ts"), ...PERSON_SURFACES.map((x) => x[0]), ...ORG_WRITES.map((x) => x[0])].map((p) => [p, fs.readFileSync(path.join(ROOT, p), "utf8")]),
);
const src = {
  sql: fs.readFileSync(path.join(ROOT, MIGRATION), "utf8"),
  fe: fs.readFileSync(path.join(ROOT, FE), "utf8"),
};

if (process.argv.includes("--selftest")) {
  const plant = (key, from, to) => (src[key].includes(from) ? staticFailures(...Object.values({ ...src, [key]: src[key].replace(from, to) })).length > 0 : null);
  const cases = [
    ["clean sources pass", staticFailures(src.sql, src.fe).length === 0],
    ["no trigger FAILS", plant("sql", "CREATE TRIGGER trg_drivers_proper_names", "-- CREATE TRIGGER x")],
    ["last_name not normalized FAILS", plant("sql", "NEW.last_name := mdata.proper_person_name(NEW.last_name);", "")],
    ["mixed case clobbered FAILS", plant("sql", "w <> upper(w) AND w <> lower(w) AND substr(w, 2) <> lower(substr(w, 2))", "false")],
    ["suffixes dropped FAIL", plant("sql", "bare IN ('II', 'III', 'IV')", "false")],
    ["no proper-casing FAILS", plant("sql", "initcap(lower(w))", "w")],
    ["display: clean sources pass", displayFailures(displayFiles).length === 0],
    ["display: org noun proper-cased FAILS", displayFailures({ ...displayFiles, [FILE("lib/entity-label.ts")]: displayFiles[FILE("lib/entity-label.ts")].replace('new Set(["driver", "user"])', 'new Set(["driver", "user", "customer"])') }).length > 0],
    ["display: raw driver title FAILS", displayFailures({ ...displayFiles, [FILE("pages/DriverDetail.tsx")]: displayFiles[FILE("pages/DriverDetail.tsx")].replace("title={formatPersonName(`${driver.first_name} ${driver.last_name}`)}", "title={`${driver.first_name} ${driver.last_name}`}") }).length > 0],
    ["display: raw portal user name FAILS", displayFailures({ ...displayFiles, [FILE("pages/customers/components/PortalUsersTab.tsx")]: displayFiles[FILE("pages/customers/components/PortalUsersTab.tsx")].replace("formatPersonName(row.full_name)", "row.full_name") }).length > 0],
    ["display: customer name proper-cased FAILS", displayFailures({ ...displayFiles, [FILE("components/customers/CustomerProfileForm.tsx")]: displayFiles[FILE("components/customers/CustomerProfileForm.tsx")].replace("const name = v.name.trim();", "const name = properPersonOrPlaceName(v.name.trim());") }).length > 0],
    ["display: vendor name proper-cased FAILS", displayFailures({ ...displayFiles, [FILE("components/vendors/VendorCreateModal.tsx")]: displayFiles[FILE("components/vendors/VendorCreateModal.tsx")].replace("const displayName = name.trim();", "const displayName = properPersonOrPlaceName(name.trim());") }).length > 0],
    ["frontend rule drift FAILS", plant("fe", 'KEEP_UPPER = new Set(["II", "III", "IV", "JR", "SR"])', 'KEEP_UPPER = new Set(["II"])')],
  ];
  let bad = 0;
  for (const [n, ok] of cases) {
    console.log(`  ${ok ? "✓" : "✗"} ${n}${ok === null ? " (plant anchor missing)" : ""}`);
    if (!ok) bad += 1;
  }
  console.log(bad ? `${LABEL} --selftest FAIL` : `${LABEL} --selftest PASS (${cases.length}/${cases.length})`);
  process.exit(bad ? 1 : 0);
}

const failures = [...staticFailures(src.sql, src.fe), ...displayFailures(displayFiles)];
if (process.env.DATABASE_URL || process.env.IH35_GATE_READONLY_DB_URL) {
  const { requireLiveDbOrExit } = await import("./lib/require-live-db.mjs");
  const { client, pool } = await requireLiveDbOrExit({ label: LABEL });
  try {
    await client.query("BEGIN READ ONLY");
    await client.query(`SET LOCAL app.bypass_rls = 'lucia'`);
    const fn = await client.query(`SELECT to_regprocedure('mdata.proper_person_name(text)') IS NOT NULL AS ok`);
    if (!fn.rows[0]?.ok) {
      console.log(`${LABEL}: LIVE arm — migration 202616210300 not applied yet on this database (deploy pending)`);
    } else {
      const r = await client.query(
        `SELECT d.id::text FROM mdata.drivers d JOIN org.companies c ON c.id = d.operating_company_id AND c.code = 'USMCA'
          WHERE d.first_name IS DISTINCT FROM mdata.proper_person_name(d.first_name)
             OR d.last_name IS DISTINCT FROM mdata.proper_person_name(d.last_name)`
      );
      if (r.rows.length) failures.push(`${r.rows.length} USMCA driver name(s) stored without the write-time casing (ids: ${r.rows.slice(0, 5).map((x) => x.id).join(", ")}…)`);
    }
    await client.query("ROLLBACK");
  } finally {
    client.release?.();
    await pool?.end?.();
  }
} else {
  console.log(`${LABEL}: LIVE arm NOT RUN (no DATABASE_URL) — static checks only`);
}

if (failures.length) {
  console.error(`${LABEL}: FAIL — ${failures.length}`);
  for (const x of failures) console.error(`  ✗ ${x}`);
  process.exit(1);
}
console.log(`${LABEL}: OK — driver names are proper-cased at write (trigger + rules in step with formatPersonName)`);
