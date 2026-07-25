#!/usr/bin/env node
/**
 * GUARD (ACCT-LINK-05): catalogs.posting_templates inbound FK from consumers (WF-053 / MUST 3.18.5).
 *
 * ROOT CAUSE it exists for — verified on Neon br-fancy-credit-akjnd07a 2026-07-24 (SET
 * app.bypass_rls='lucia', re-checked so a 0 isn't RLS-masked):
 *   catalogs.posting_templates had an admin CRUD UI (Templates subnav tab) and ZERO inbound FKs — a
 *   pure island catalog. The real GL posting engine (posting-engine.service.ts) and the fuel poster
 *   (fuel-posting/poster.service.ts) never read or wrote it; every posting_batches row was written with
 *   no reference back to a template at all.
 *
 * This guard asserts the SUBSTANCE (every production writer of accounting.posting_batches actually
 * stamps posting_template_id + source_template_code on INSERT), not the shape (that a migration file
 * merely exists) — see docs/trackers/GUARD-SHAPE-VS-SUBSTANCE-REGISTER.md.
 *
 * Usage: node scripts/verify-posting-batches-template-link.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-posting-batches-template-link";

const MIGRATION = "db/migrations/202607950000_posting_batches_template_link.sql";
const HELD_MANIFEST = "db/migrations/.held-migrations.json";
const ENGINE = "apps/backend/src/accounting/posting-engine.service.ts";
const FUEL_POSTER = "apps/backend/src/accounting/fuel-posting/poster.service.ts";

/** Every INSERT INTO accounting.posting_batches ( ... ) column-list block in a source string. */
function insertBlocks(source) {
  const blocks = [];
  const re = /INSERT INTO accounting\.posting_batches\s*\(([\s\S]*?)\)/g;
  let m;
  while ((m = re.exec(source)) !== null) blocks.push(m[1]);
  return blocks;
}

/** Assertions run against the real posting-engine.service.ts source. */
export function assertEngine(source) {
  const problems = [];

  if (!/export\s+async\s+function\s+resolvePostingTemplateId\s*\(/.test(source)) {
    problems.push(`${ENGINE}: resolvePostingTemplateId() resolver is missing — no consumer write path.`);
  }
  if (!/FROM\s+catalogs\.posting_templates\s+WHERE\s+template_code\s*=/i.test(source)) {
    problems.push(`${ENGINE}: resolvePostingTemplateId() does not query catalogs.posting_templates by template_code.`);
  }

  const blocks = insertBlocks(source);
  if (blocks.length < 3) {
    problems.push(`${ENGINE}: expected >= 3 INSERT INTO accounting.posting_batches sites, found ${blocks.length} — did a writer move?`);
  }
  blocks.forEach((cols, i) => {
    if (!/\bposting_template_id\b/.test(cols)) {
      problems.push(`${ENGINE}: posting_batches INSERT #${i + 1} does not write posting_template_id (the ACCT-LINK-05 inbound FK).`);
    }
    if (!/\bsource_template_code\b/.test(cols)) {
      problems.push(`${ENGINE}: posting_batches INSERT #${i + 1} does not write source_template_code (the MUST 3.18.5.4 code-constant stamp).`);
    }
  });

  return problems;
}

/** Assertions run against the real fuel-posting/poster.service.ts source. */
export function assertFuelPoster(source) {
  const problems = [];

  if (!/resolvePostingTemplateId\s*\(/.test(source)) {
    problems.push(`${FUEL_POSTER}: does not call resolvePostingTemplateId() — the fuel_event writer bypasses the ACCT-LINK-05 stamp.`);
  }

  const blocks = insertBlocks(source);
  if (blocks.length < 1) {
    problems.push(`${FUEL_POSTER}: no INSERT INTO accounting.posting_batches found — did the writer move?`);
  }
  blocks.forEach((cols, i) => {
    if (!/\bposting_template_id\b/.test(cols)) {
      problems.push(`${FUEL_POSTER}: posting_batches INSERT #${i + 1} does not write posting_template_id.`);
    }
    if (!/\bsource_template_code\b/.test(cols)) {
      problems.push(`${FUEL_POSTER}: posting_batches INSERT #${i + 1} does not write source_template_code.`);
    }
  });

  return problems;
}

/** The migration itself must add the inbound FK + code stamp column, additively. */
export function assertMigration(sql) {
  const problems = [];
  if (!/ADD COLUMN IF NOT EXISTS posting_template_id uuid REFERENCES catalogs\.posting_templates\s*\(\s*id\s*\)/i.test(sql)) {
    problems.push(`${MIGRATION}: missing an additive posting_template_id uuid REFERENCES catalogs.posting_templates(id) column.`);
  }
  if (!/ADD COLUMN IF NOT EXISTS source_template_code text/i.test(sql)) {
    problems.push(`${MIGRATION}: missing an additive source_template_code text column.`);
  }
  if (!/^\s*ALTER TABLE accounting\.posting_batches$/im.test(sql)) {
    problems.push(`${MIGRATION}: does not target accounting.posting_batches.`);
  }
  return problems;
}

/** The migration must be registered in the held-migrations manifest (financial cluster gate). */
export function assertHeldManifest(json) {
  const problems = [];
  let parsed;
  try {
    parsed = JSON.parse(json);
  } catch {
    problems.push(`${HELD_MANIFEST}: not valid JSON.`);
    return problems;
  }
  const entries = Array.isArray(parsed?.held) ? parsed.held : Array.isArray(parsed) ? parsed : [];
  const fileName = path.basename(MIGRATION);
  const found = entries.some((e) => (typeof e === "string" ? e === fileName : e?.file === fileName));
  if (!found) {
    problems.push(`${HELD_MANIFEST}: ${fileName} is not registered — financial migrations must be HOLD-listed for owner Neon-apply.`);
  }
  return problems;
}

const IS_MAIN = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (IS_MAIN && process.argv.includes("--selftest")) {
  const failures = [];
  const realEngine = fs.readFileSync(path.join(ROOT, ENGINE), "utf8");
  const realFuel = fs.readFileSync(path.join(ROOT, FUEL_POSTER), "utf8");
  const realMigration = fs.readFileSync(path.join(ROOT, MIGRATION), "utf8");
  const realHeld = fs.readFileSync(path.join(ROOT, HELD_MANIFEST), "utf8");

  const mutate = (name, real, fn, assertFn, needle) => {
    const mutated = fn(real);
    if (mutated === real) {
      failures.push(`${name}: mutation did not change the source — the case is INERT, fix the mutation`);
      return;
    }
    if (!assertFn(mutated).some((p) => p.includes(needle))) {
      failures.push(`${name}: planted defect NOT caught (expected "${needle}")`);
    }
  };

  mutate(
    "engine-drops-resolver",
    realEngine,
    (s) => s.replace(/export\s+async\s+function\s+resolvePostingTemplateId/, "async function _renamedResolvePostingTemplateId"),
    assertEngine,
    "resolver is missing"
  );
  mutate(
    "engine-drops-posting_template_id-from-one-insert",
    realEngine,
    (s) =>
      s.replace(
        "VALUES ($1::uuid, 'queued', $2, $3, $4, $5::uuid, $6::uuid, $7, now(), now())",
        "VALUES ($1::uuid, 'queued', $2, $3, $4, $5::uuid, now(), now())"
      ).replace(
        /INSERT INTO accounting\.posting_batches \(\n(\s+operating_company_id,\n\s+batch_status,\n\s+source_transaction_type,\n\s+source_transaction_id,\n\s+idempotency_key,\n\s+created_by_user_id,\n)\s+posting_template_id,\n\s+source_template_code,\n(\s+created_at,\n\s+updated_at\n\s+\)\n\s+VALUES \(\$1::uuid, 'queued')/,
        "INSERT INTO accounting.posting_batches (\n$1$2"
      ),
    assertEngine,
    "does not write posting_template_id"
  );
  mutate(
    "fuel-drops-resolvePostingTemplateId-call",
    realFuel,
    (s) => s.replace(/const postingTemplateId = await resolvePostingTemplateId\(client, FUEL_EVENT_TEMPLATE_CODE\);\n/, ""),
    assertFuelPoster,
    "does not call resolvePostingTemplateId"
  );
  mutate(
    "migration-drops-fk",
    realMigration,
    (s) =>
      s.replace(
        "ADD COLUMN IF NOT EXISTS posting_template_id uuid REFERENCES catalogs.posting_templates(id) ON DELETE SET NULL;",
        "ADD COLUMN IF NOT EXISTS posting_template_id uuid;"
      ),
    assertMigration,
    "missing an additive posting_template_id"
  );
  mutate(
    "held-manifest-drops-entry",
    realHeld,
    (s) => s.replace(/,\s*\{\s*"file":\s*"202607950000_posting_batches_template_link\.sql"[\s\S]*?\}\s*(?=\])/, ""),
    assertHeldManifest,
    "is not registered"
  );

  const cleanProblems = [
    ...assertEngine(realEngine),
    ...assertFuelPoster(realFuel),
    ...assertMigration(realMigration),
    ...assertHeldManifest(realHeld),
  ];
  if (cleanProblems.length) failures.push(`false positive on the fixed source: ${cleanProblems.join(" | ")}`);

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const f of failures) console.error(`  ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — 5 planted defects caught; fixed source not flagged`);
  process.exit(0);
}

if (IS_MAIN && !process.argv.includes("--selftest")) {
  const problems = [];

  const enginePath = path.join(ROOT, ENGINE);
  const fuelPath = path.join(ROOT, FUEL_POSTER);
  const migrationPath = path.join(ROOT, MIGRATION);
  const heldPath = path.join(ROOT, HELD_MANIFEST);

  for (const [label, p] of [
    ["posting-engine", enginePath],
    ["fuel-poster", fuelPath],
    ["migration", migrationPath],
    ["held-manifest", heldPath],
  ]) {
    if (!fs.existsSync(p)) problems.push(`${label}: missing file ${p}`);
  }

  if (!problems.length) {
    problems.push(...assertEngine(fs.readFileSync(enginePath, "utf8")));
    problems.push(...assertFuelPoster(fs.readFileSync(fuelPath, "utf8")));
    problems.push(...assertMigration(fs.readFileSync(migrationPath, "utf8")));
    problems.push(...assertHeldManifest(fs.readFileSync(heldPath, "utf8")));
  }

  if (problems.length) {
    console.error(`${LABEL} FAILED — ACCT-LINK-05 consumer stamp path is not fully wired:`);
    for (const p of problems) console.error(`  ${p}`);
    process.exit(1);
  }
  console.log(
    `${LABEL} OK — accounting.posting_batches gets posting_template_id + source_template_code stamped on every ` +
      `INSERT (posting-engine.service.ts x3 + fuel-posting/poster.service.ts x1); migration adds the inbound FK ` +
      `additively and is HOLD-registered. NOTE: catalogs.posting_templates is 0 rows on prod (owner/CPA-seeded, ` +
      `Rule 13) so posting_template_id resolves NULL until seeded + Neon-applied — that density gap is a named ` +
      `follow-up, not this guard's scope.`
  );
}
