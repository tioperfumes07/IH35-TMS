#!/usr/bin/env node
/**
 * GUARD: the fleet catalog factory does not ACCEPT a metadata field it cannot persist (LST audit).
 *
 * WHY THIS EXISTS (2026-07-24, verified on the prod branch)
 * The fleet catalog factory's create/update zod schemas accepted a `metadata` object, and the INSERT
 * then discarded it — the RETURNING hardcoded `'{}'::jsonb AS metadata`. Verified on prod: NONE of the
 * nine fleet catalog tables (tractor_statuses, trailer_statuses, asset_condition_codes,
 * equipment_types, unit_ownership_types, trailer_types, lease_terms, asset_statuses, asset_locations)
 * has a metadata column. So the field was "accepted by the API and silently dropped" — the exact
 * DoD Layer-C anti-pattern. The audit called it "silent field loss"; verifying against prod showed
 * the narrower truth (no column, and the modal renders no metadata input, so no OPERATOR loss — it is
 * an API-contract lie, not lost keystrokes). This guard keeps metadata out of the fleet write path.
 *
 * If fleet catalogs are ever given a real metadata column by an owner-gated migration, this guard is
 * updated in that same PR — never before.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FACTORY = "apps/backend/src/catalogs/fleet/factory.ts";
const LABEL = "verify-fleet-catalog-no-metadata-phantom";
const SELFTEST = process.argv.includes("--selftest");

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

export function assertNoMetadataPhantom(sources) {
  const src = stripComments(sources?.[FACTORY] ?? read(FACTORY));
  const problems = [];

  // The write schemas must not declare a metadata field.
  if (/metadata:\s*z\.record/.test(src)) {
    problems.push(`${FACTORY}: a create/update schema declares \`metadata: z.record(...)\` — no fleet catalog table has a metadata column, so it is accepted and discarded (DoD Layer C: "accepted by the API" is not persisted).`);
  }
  // The INSERT must not name a metadata column (it does not exist on these tables).
  const insertBlocks = src.match(/INSERT INTO catalogs\.\$\{[^}]+\}\s*\(([^)]*)\)/g) ?? [];
  for (const block of insertBlocks) {
    if (/\bmetadata\b/.test(block)) {
      problems.push(`${FACTORY}: an INSERT names a \`metadata\` column that does not exist on any fleet catalog table — this would 500 at runtime.`);
    }
  }

  // Inline `--` inside SQL template strings breaks RETURNING lists (42601 on POST create — P47).
  const sqlTemplates = src.match(/`[^`]*`/gs) ?? [];
  for (const tpl of sqlTemplates) {
    if (/\b(SELECT|INSERT|UPDATE|DELETE|RETURNING)\b/i.test(tpl) && /--/.test(tpl)) {
      problems.push(
        `${FACTORY}: SQL template contains inline \`--\` comment — PostgreSQL treats it as end-of-statement; move comment to JS above the template (P47 fleet create 42601).`,
      );
      break;
    }
  }

  return problems;
}

if (SELFTEST) {
  const live = { [FACTORY]: read(FACTORY) };
  const failures = [];
  const expectCaught = (name, mutated, needle) => {
    if (JSON.stringify(mutated) === JSON.stringify(live)) { failures.push(`${name}: inert mutation`); return; }
    const p = assertNoMetadataPhantom(mutated);
    if (!p.some((x) => x.includes(needle))) failures.push(`${name}: NOT caught (got: ${p.join(" | ") || "none"})`);
  };
  expectCaught("schema-reaccepts-metadata",
    { [FACTORY]: live[FACTORY].replace("is_active: z.boolean().default(true),", "metadata: z.record(z.string(), z.unknown()).optional(),\n    is_active: z.boolean().default(true),") },
    "accepted and discarded");
  expectCaught("insert-names-metadata",
    { [FACTORY]: live[FACTORY].replace("(code, name, description, is_active, sort_order, created_by_user_id, updated_by_user_id)", "(code, name, description, metadata, is_active, sort_order, created_by_user_id, updated_by_user_id)") },
    "does not exist on any fleet catalog table");
  expectCaught("inline-sql-dash-comment",
    { [FACTORY]: live[FACTORY].replace("RETURNING id, code, name AS display_name", "RETURNING id, code, name AS display_name -- oops") },
    "inline `--` comment");
  const liveProblems = assertNoMetadataPhantom(live);
  if (liveProblems.length) failures.push(`live sources FAIL: ${liveProblems.join(" | ")}`);
  if (failures.length) { console.error(`${LABEL} SELFTEST FAILED:`); for (const f of failures) console.error(`  ${f}`); process.exit(1); }
  console.log(`${LABEL} SELFTEST PASS — 3 planted defects caught, live sources clean`);
  process.exit(0);
}

const problems = assertNoMetadataPhantom();
if (problems.length) { console.error(`${LABEL} FAILED:`); for (const p of problems) console.error(`  ${p}`); process.exit(1); }
console.log(`${LABEL} OK — the fleet catalog factory does not accept or insert a metadata field that no fleet table can store.`);
