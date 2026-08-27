#!/usr/bin/env node
/**
 * 0441-mod2-dvir-followup-wo-wrong-table
 *
 * Locks the DVIR defect triage convert-to-WO path:
 *  1. follow_up_wo_id UPDATE must target safety.dvir_defects (per-defect), NOT dvir_submissions
 *  2. WO source_type must be in the chk_maintenance_wo_source_type allowlist (IS|ES|AC|ET|RT|IT|RS)
 *  3. next_wo_display_id must use the same valid source_type (not invent 'DV')
 *
 * Self-test: node scripts/verify-dvir-followup-wo-target.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-dvir-followup-wo-target";
const ROUTES = "apps/backend/src/maintenance/defects.routes.ts";
const ALLOWED_SOURCE_TYPES = new Set(["IS", "ES", "AC", "ET", "RT", "IT", "RS"]);

function stripComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

/** Extract the convert_to_wo / triage WO-create body from defects.routes.ts */
function convertBlock(src) {
  // From alreadyConverted / next_wo_display_id through converted_to_wo audit.
  const start = src.search(/lockedDefectRes|next_wo_display_id|alreadyConverted/);
  const end = src.search(/converted_to_wo/);
  if (start < 0 || end < 0 || end <= start) return src;
  return src.slice(start, end + "converted_to_wo".length + 200);
}

export function assertGuard(sourceText) {
  const errors = [];
  const src = stripComments(sourceText);
  const block = convertBlock(src);

  if (/UPDATE\s+safety\.dvir_submissions[\s\S]{0,200}follow_up_wo_id/i.test(block)) {
    errors.push(
      `${ROUTES}: convert-to-WO must NOT UPDATE safety.dvir_submissions.follow_up_wo_id (wrong table)`
    );
  }

  if (!/UPDATE\s+safety\.dvir_defects[\s\S]{0,200}follow_up_wo_id/i.test(block)) {
    errors.push(
      `${ROUTES}: convert-to-WO must UPDATE safety.dvir_defects SET follow_up_wo_id (per-defect)`
    );
  }

  if (!/WHERE\s+id\s*=\s*\$1/i.test(block.match(/UPDATE\s+safety\.dvir_defects[\s\S]{0,400}/i)?.[0] ?? "")) {
    errors.push(`${ROUTES}: dvir_defects UPDATE must key on defect id (WHERE id = $1)`);
  }
  if (!/FOR UPDATE OF dd/i.test(block)) {
    errors.push(`${ROUTES}: convert-to-WO must lock the defect before allocating a WO`);
  }
  if (!/UPDATE\s+safety\.dvir_defects[\s\S]{0,300}follow_up_wo_id IS NULL[\s\S]{0,100}RETURNING id::text/i.test(block)) {
    errors.push(`${ROUTES}: follow-up linkage must be a null-only returning transition`);
  }
  if (!/if \(!linked\.rows\[0\]\) throw new Error\("dvir_defect_follow_up_link_lost"\)/.test(block)) {
    errors.push(`${ROUTES}: a lost follow-up linkage must fail the transaction`);
  }

  // source_type literal or bound variable used in INSERT / next_wo_display_id
  const insertMatch = block.match(
    /INSERT\s+INTO\s+maintenance\.work_orders[\s\S]{0,800}?VALUES\s*\(([\s\S]{0,400}?)\)/i
  );
  const valuesClause = insertMatch?.[1] ?? "";
  const literalSource = valuesClause.match(/'([A-Z]{2})'/);
  const usesBoundSource =
    /woSourceType|source_type/.test(block) &&
    /VALUES\s*\([^)]*\$3/.test(block + valuesClause);

  let sourceType = literalSource?.[1] ?? null;
  if (!sourceType) {
    const constMatch = block.match(
      /(?:const|let)\s+woSourceType\s*=\s*["']([A-Z]{2})["']/
    );
    sourceType = constMatch?.[1] ?? null;
  }

  if (!sourceType && !usesBoundSource) {
    errors.push(`${ROUTES}: convert-to-WO INSERT must set a source_type from the allowlist`);
  } else if (sourceType && !ALLOWED_SOURCE_TYPES.has(sourceType)) {
    errors.push(
      `${ROUTES}: source_type '${sourceType}' is not in chk_maintenance_wo_source_type allowlist (${[...ALLOWED_SOURCE_TYPES].join("|")})`
    );
  }

  if (/'DV'/.test(block)) {
    errors.push(
      `${ROUTES}: must not use source_type 'DV' (invalid CHECK + next_wo_display_id reject)`
    );
  }

  const displayCall = block.match(
    /next_wo_display_id\s*\(\s*\$1\s*,\s*(['"][A-Z]{2}['"]|\$2)/
  );
  if (!displayCall) {
    errors.push(`${ROUTES}: next_wo_display_id must receive a valid 2-char source_type (not 'DV')`);
  } else if (/['"]DV['"]/.test(displayCall[0])) {
    errors.push(`${ROUTES}: next_wo_display_id must not be called with 'DV'`);
  }

  return errors;
}

function readRoutes() {
  const p = path.join(ROOT, ROUTES);
  if (!fs.existsSync(p)) throw new Error(`missing ${ROUTES}`);
  return fs.readFileSync(p, "utf8");
}

function runSelftest() {
  const good = `
    FROM maintenance.next_wo_display_id($1, $2, CURRENT_DATE, $3)
    const lockedDefectRes = SELECT dd.follow_up_wo_id FROM safety.dvir_defects dd FOR UPDATE OF dd
    const woSourceType = "IS";
    INSERT INTO maintenance.work_orders (source_type) VALUES ($1,$2,$3,'open',$4)
    UPDATE safety.dvir_defects
      SET follow_up_wo_id = $2
      WHERE id = $1 AND follow_up_wo_id IS NULL RETURNING id::text
    if (!linked.rows[0]) throw new Error("dvir_defect_follow_up_link_lost");
    converted_to_wo
  `;
  const badTable = `
    next_wo_display_id($1, 'IS', CURRENT_DATE, $2)
    VALUES ($1,$2,'IS','open',$3)
    UPDATE safety.dvir_submissions SET follow_up_wo_id = COALESCE(follow_up_wo_id, $2) WHERE id = $1
    converted_to_wo
  `;
  const badSource = `
    next_wo_display_id($1, 'DV', CURRENT_DATE, $2)
    VALUES ($1,$2,'DV','open',$3)
    UPDATE safety.dvir_defects SET follow_up_wo_id = $2 WHERE id = $1
    converted_to_wo
  `;

  const checks = [
    ["good path passes", assertGuard(good).length === 0],
    ["wrong table fails", assertGuard(badTable).some((e) => /dvir_submissions/.test(e))],
    ["invalid DV source fails", assertGuard(badSource).some((e) => /'DV'/.test(e) || /allowlist/.test(e))],
    ["missing lock fails", assertGuard(good.replace("FOR UPDATE OF dd", "")).some((e) => /lock/.test(e))],
    ["missing CAS fails", assertGuard(good.replace(" AND follow_up_wo_id IS NULL", "")).some((e) => /null-only/.test(e))],
    ["missing lost-link failure fails", assertGuard(good.replace('if (!linked.rows[0]) throw new Error("dvir_defect_follow_up_link_lost");', "")).some((e) => /fail the transaction/.test(e))],
  ];
  const failed = checks.filter(([, ok]) => !ok);
  if (failed.length) {
    console.error(`${LABEL} --selftest FAIL:`);
    for (const [n] of failed) console.error(`  ✗ ${n}`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS (${checks.length} checks)`);
}

function main() {
  if (process.argv.includes("--selftest")) {
    runSelftest();
    return;
  }
  const errors = assertGuard(readRoutes());
  if (errors.length) {
    console.error(`${LABEL} FAIL:`);
    for (const e of errors) console.error(`  ✗ ${e}`);
    process.exit(1);
  }
  console.log(`${LABEL} PASS`);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main();
