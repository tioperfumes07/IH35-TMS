#!/usr/bin/env node
/**
 * LST-PICKER-01 slice — EscrowForfeitModal draw reason must use ReferenceSelect with
 * createKind=escrow_draw_reason (same-table write to catalogs.driver_deduction_types with may_draw_escrow=true).
 * Cursor even claim: 1826.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-lst-picker01-escrow-draw-reason-inline-create";

const MODAL = "apps/frontend/src/pages/safety/components/EscrowForfeitModal.tsx";
const REGISTRY = "apps/frontend/src/components/parity/catalogPickerRegistry.ts";
const FACTORY = "apps/backend/src/catalogs/driver/factory.ts";
const INDEX = "apps/backend/src/catalogs/driver/index.ts";

function readRel(root, rel, overrides) {
  if (overrides && Object.prototype.hasOwnProperty.call(overrides, rel)) return overrides[rel];
  const p = path.join(root, rel);
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, "utf8");
}

/** @returns {string[]} */
export function collectProblems(root = ROOT, overrides = null) {
  const problems = [];
  const modal = readRel(root, MODAL, overrides);
  const registry = readRel(root, REGISTRY);
  const factory = readRel(root, FACTORY);
  const index = readRel(root, INDEX);

  if (!modal) problems.push(`missing ${MODAL}`);
  else {
    const code = modal.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    if (!/createKind=["']escrow_draw_reason["']/.test(code)) {
      problems.push(`${MODAL}: draw reason must use createKind=escrow_draw_reason`);
    }
    if (!/ReferenceSelect/.test(code)) {
      problems.push(`${MODAL}: must import/use ReferenceSelect`);
    }
    if (!/createdValueField=["']code["']/.test(code)) {
      problems.push(`${MODAL}: must select by code (createdValueField=code)`);
    }
    if (/data-testid=["']escrow-forfeit-reason["'][\s\S]{0,200}<Combobox/.test(code)) {
      problems.push(`${MODAL}: must not keep Combobox dual path for draw reason`);
    }
    if (/configure in Lists/.test(modal) || /Lists → Driver → Escrow Types/.test(modal)) {
      problems.push(`${MODAL}: must not send operators to Lists-only path`);
    }
    // BANK-F91246 leftover refuse — EscrowForfeitModal only
    if (modal.includes("text-[11px]")) problems.push("leftover text-[11px]");
    if (modal.includes("#8A92AB") || modal.includes("#334155")) problems.push("leftover off-scale muted");
  }

  if (!registry) problems.push(`missing ${REGISTRY}`);
  else {
    if (!/escrow_draw_reason:\s*\{/.test(registry)) {
      problems.push(`${REGISTRY}: missing escrow_draw_reason entry`);
    }
    if (!/writeTable:\s*"catalogs\.driver_deduction_types"/.test(registry)) {
      problems.push(`${REGISTRY}: writeTable must be catalogs.driver_deduction_types`);
    }
    if (!/may_draw_escrow:\s*true/.test(registry)) {
      problems.push(`${REGISTRY}: create must POST may_draw_escrow: true`);
    }
    if (!/\/api\/v1\/catalogs\/driver\/deduction-types/.test(registry)) {
      problems.push(`${REGISTRY}: must POST driver/deduction-types`);
    }
  }

  if (!factory) problems.push(`missing ${FACTORY}`);
  else if (!/INSERT INTO catalogs\.\$\{config\.tableName\}/.test(factory)) {
    problems.push(`${FACTORY}: must INSERT catalogs.\${tableName}`);
  }

  if (!index) problems.push(`missing ${INDEX}`);
  else if (!/driver_deduction_types/.test(index) || !/may_draw_escrow/.test(index)) {
    problems.push(`${INDEX}: deduction-types must declare may_draw_escrow`);
  }

  return problems;
}

if (process.argv.includes("--selftest")) {
  const baseline = collectProblems();
  if (baseline.length) {
    console.error(`${LABEL} SELFTEST FAIL:`);
    for (const p of baseline) console.error("  - " + p);
    process.exit(1);
  }
  // BANK-F91246 leftover plant on EscrowForfeitModal
  const original = fs.readFileSync(path.join(ROOT, MODAL), "utf8");
  const leftover = collectProblems(ROOT, {
    [MODAL]: `${original}\n<div className="text-[11px] text-[#8A92AB]">plant</div>\n`,
  });
  if (!leftover.includes("leftover text-[11px]") || !leftover.includes("leftover off-scale muted")) {
    console.error(`${LABEL} SELFTEST FAIL leftover plant escaped`, leftover);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST OK — leftover plant rejected`);
} else {
  const problems = collectProblems();
  if (problems.length) {
    console.error(`${LABEL} FAIL:`);
    for (const p of problems) console.error("  - " + p);
    process.exit(1);
  }
  console.log(`${LABEL} OK — EscrowForfeitModal draw reason inline create`);
}
