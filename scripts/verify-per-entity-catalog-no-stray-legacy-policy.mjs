#!/usr/bin/env node
/**
 * verify-per-entity-catalog-no-stray-legacy-policy.mjs
 *
 * CC3-TERMREASON-LEAK-CLASS-20260822 — a repeatable bug class, not a one-off. Several catalog
 * tables started life GLOBAL (one shared row set for every operating company), guarded by a
 * PERMISSIVE `<prefix>_select_authenticated` (`USING (true)`) + `<prefix>_modify_owner_only` /
 * `<prefix>_select_owner_admin` (Owner-role-only, no company predicate) policy pair. When a table
 * was later converted to PER-ENTITY (a `company_scope` PERMISSIVE policy added, gating on
 * `app.operating_company_id`), the conversion migration sometimes forgot to DROP the earlier
 * global-era policies. Postgres combines multiple PERMISSIVE policies for the same command with
 * OR, never AND — so the leftover global-era policy silently defeats company_scope: SELECT reads
 * every company's rows commingled, and any Owner-role caller can write into another company's rows.
 *
 * Confirmed live on prod (2026-08-22, Neon tiny-field-89581227) on TWO tables before this guard
 * existed: catalogs.driver_termination_reasons (fixed
 * 202608222245_driver_termination_reasons_drop_legacy_permissive_policies.sql) and
 * catalogs.customer_quality_event_reasons (fixed
 * 202608222310_customer_quality_event_reasons_drop_legacy_permissive_policies.sql). A THIRD table
 * with the same originating shape, catalogs.dispatcher_error_reasons, already got this right —
 * its own per-entity migration (202608010000) drops both legacy policies before creating
 * company_scope, proving the correct pattern was known, just not applied uniformly.
 *
 * INVARIANT (static, no live DB needed): for every table where some migration creates a policy
 * matching the global-era naming convention (`_select_authenticated`, `_modify_owner_only`,
 * `_select_owner_admin` suffixes) AND some migration (the same or a later one) creates a
 * `company_scope` policy on that same table, every one of those global-era policy names must be
 * DROPped by SOME migration in the set (dropped-before-recreation in the same migration counts,
 * as does a later cleanup migration). A table that was never converted to per-entity (no
 * company_scope ever created — e.g. catalogs.file_categories, genuinely global) is correctly
 * exempt: `USING (true)` is the RIGHT shape for a table with no entity dimension at all.
 *
 * Self-test: node scripts/verify-per-entity-catalog-no-stray-legacy-policy.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-per-entity-catalog-no-stray-legacy-policy";
const MIGRATIONS_DIR = "db/migrations";

const LEGACY_POLICY_RE = /^\w*_(select_authenticated|modify_owner_only|select_owner_admin)$/;

// CREATE POLICY <name> ON <schema>.<table>   /   DROP POLICY [IF EXISTS] <name> ON <schema>.<table>
const CREATE_POLICY_RE = /CREATE\s+POLICY\s+(\w+)\s+ON\s+([\w]+\.[\w]+)/gi;
const DROP_POLICY_RE = /DROP\s+POLICY\s+(?:IF\s+EXISTS\s+)?(\w+)\s+ON\s+([\w]+\.[\w]+)/gi;

export function run(root = ROOT) {
  const failures = [];
  const dir = path.join(root, MIGRATIONS_DIR);
  if (!fs.existsSync(dir)) {
    failures.push(`missing migrations directory ${MIGRATIONS_DIR}`);
    return failures;
  }

  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  // table -> Set(legacy policy names ever CREATEd)
  const legacyCreated = new Map();
  // table -> Set(policy names ever DROPped, anywhere)
  const everDropped = new Map();
  // table -> ever had company_scope CREATEd
  const hasCompanyScope = new Set();

  const addTo = (map, table, value) => {
    if (!map.has(table)) map.set(table, new Set());
    map.get(table).add(value);
  };

  for (const file of files) {
    const src = fs.readFileSync(path.join(dir, file), "utf8");

    for (const m of src.matchAll(CREATE_POLICY_RE)) {
      const [, polname, table] = m;
      if (polname === "company_scope") hasCompanyScope.add(table);
      if (LEGACY_POLICY_RE.test(polname)) addTo(legacyCreated, table, polname);
    }
    for (const m of src.matchAll(DROP_POLICY_RE)) {
      const [, polname, table] = m;
      addTo(everDropped, table, polname);
    }
  }

  for (const [table, legacyNames] of legacyCreated) {
    if (!hasCompanyScope.has(table)) continue; // never converted to per-entity -- global by design, exempt
    const droppedForTable = everDropped.get(table) ?? new Set();
    for (const polname of legacyNames) {
      if (!droppedForTable.has(polname)) {
        failures.push(
          `${table}: legacy policy '${polname}' was created and this table was later converted to per-entity ` +
            `(company_scope exists), but '${polname}' was never DROPped anywhere -- it PERMISSIVE-OR-defeats ` +
            `company_scope on every command it covers.`
        );
      }
    }
  }

  return failures;
}

async function main() {
  if (process.argv.includes("--selftest")) {
    const os = await import("node:os");
    const tmp = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "verify-per-entity-legacy-"));
    const migDir = path.join(tmp, MIGRATIONS_DIR);
    fs.mkdirSync(migDir, { recursive: true });

    function writeMigrations(files) {
      for (const f of fs.readdirSync(migDir)) fs.rmSync(path.join(migDir, f));
      for (const [name, sql] of Object.entries(files)) fs.writeFileSync(path.join(migDir, name), sql);
    }

    // Bug shape: global-era policy created, later converted to per-entity, legacy policy never dropped -- must FAIL.
    writeMigrations({
      "0001_global.sql": `
        CREATE POLICY foo_select_authenticated ON catalogs.foo FOR SELECT USING (true);
        CREATE POLICY foo_modify_owner_only ON catalogs.foo FOR ALL USING (role = 'Owner');
      `,
      "0002_per_entity.sql": `
        CREATE POLICY company_scope ON catalogs.foo FOR ALL USING (operating_company_id = current_setting('app.operating_company_id'));
      `,
    });
    if (!run(tmp).length) throw new Error("bug shape (legacy policy never dropped) must FAIL");

    // Fixed shape: a later migration drops both legacy policies -- must PASS.
    writeMigrations({
      "0001_global.sql": `
        CREATE POLICY foo_select_authenticated ON catalogs.foo FOR SELECT USING (true);
        CREATE POLICY foo_modify_owner_only ON catalogs.foo FOR ALL USING (role = 'Owner');
      `,
      "0002_per_entity.sql": `
        CREATE POLICY company_scope ON catalogs.foo FOR ALL USING (operating_company_id = current_setting('app.operating_company_id'));
      `,
      "0003_cleanup.sql": `
        DROP POLICY IF EXISTS foo_select_authenticated ON catalogs.foo;
        DROP POLICY IF EXISTS foo_modify_owner_only ON catalogs.foo;
      `,
    });
    if (run(tmp).length) throw new Error("fixed shape (both legacy policies dropped later) must PASS");

    // Correct-by-construction shape: the SAME migration drops-before-recreating (the dispatcher_error_reasons
    // pattern) -- must PASS.
    writeMigrations({
      "0001_global.sql": `
        CREATE POLICY bar_select_owner_admin ON catalogs.bar FOR SELECT USING (role = 'Owner');
        CREATE POLICY bar_modify_owner_only ON catalogs.bar FOR ALL USING (role = 'Owner');
      `,
      "0002_per_entity_correct.sql": `
        DROP POLICY IF EXISTS bar_select_owner_admin ON catalogs.bar;
        DROP POLICY IF EXISTS bar_modify_owner_only ON catalogs.bar;
        DROP POLICY IF EXISTS company_scope ON catalogs.bar;
        CREATE POLICY company_scope ON catalogs.bar FOR ALL USING (operating_company_id = current_setting('app.operating_company_id'));
      `,
    });
    if (run(tmp).length) throw new Error("correct-by-construction shape must PASS");

    // Never converted to per-entity (genuinely global table, no company_scope ever) -- must PASS, exempt.
    writeMigrations({
      "0001_global_only.sql": `
        CREATE POLICY baz_select_authenticated ON catalogs.baz FOR SELECT USING (true);
        CREATE POLICY baz_modify_owner_only ON catalogs.baz FOR ALL USING (role = 'Owner');
      `,
    });
    if (run(tmp).length) throw new Error("genuinely-global table (no company_scope) must PASS, exempt");

    fs.rmSync(tmp, { recursive: true, force: true });
    console.log(`${LABEL} --selftest OK`);
    return;
  }

  const failures = run();
  if (failures.length > 0) {
    console.error(`${LABEL}: FAIL`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL}: OK — every per-entity-converted catalog table has dropped its global-era legacy policies`);
}

await main();
