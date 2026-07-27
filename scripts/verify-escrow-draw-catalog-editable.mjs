#!/usr/bin/env node
/**
 * ND-ESC-01 (draw-catalog half) — catalogs.escrow_types.may_draw_escrow + forfeit gate + Lists edit.
 * Cap half already shipped (#3611). This guard bites free-text forfeit / missing catalog wiring.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-escrow-draw-catalog-editable";
const SELFTEST = process.argv.includes("--selftest");

const MIG = path.join(ROOT, "db/migrations/202609100080_nd_esc_01_escrow_draw_catalog.sql");
const FORFEIT = path.join(ROOT, "apps/backend/src/driver-finance/escrow-forfeit.routes.ts");
const FACTORY = path.join(ROOT, "apps/backend/src/catalogs/driver/factory.ts");
const INDEX = path.join(ROOT, "apps/backend/src/catalogs/driver/index.ts");
const MODAL = path.join(ROOT, "apps/frontend/src/pages/safety/components/EscrowForfeitModal.tsx");
const LIST = path.join(ROOT, "apps/frontend/src/pages/lists/driver/EscrowTypesListPage.tsx");
const HELD = path.join(ROOT, "db/migrations/.held-migrations.json");

/** @param {{ mig: string, forfeit: string, factory: string, index: string, modal: string, list: string, held: string }} sources */
export function check(sources) {
  const problems = [];
  const { mig, forfeit, factory, index, modal, list, held } = sources;

  if (!mig) problems.push("missing migration 202609100080_nd_esc_01_escrow_draw_catalog.sql");
  else {
    if (!/HOLD-FOR-JORGE/.test(mig)) problems.push("migration must carry HOLD-FOR-JORGE");
    if (!/DO NOT RUN ON PROD/.test(mig)) problems.push("migration must carry DO NOT RUN ON PROD");
    if (!/may_draw_escrow/.test(mig)) problems.push("migration must ADD may_draw_escrow");
    if (!/ABANDONMENT/.test(mig) || !/DAMAGE/.test(mig) || !/SAFETY-FINE/.test(mig)) {
      problems.push("migration must seed ABANDONMENT, DAMAGE, SAFETY-FINE");
    }
  }

  if (!forfeit) problems.push("missing escrow-forfeit.routes.ts");
  else {
    if (!/reason_code/.test(forfeit)) problems.push("forfeit route must require reason_code");
    if (/reason:\s*z\.string\(\)/.test(forfeit) && !/reason_code/.test(forfeit)) {
      problems.push("forfeit must not accept free-text reason alone");
    }
    if (!/may_draw_escrow\s*=\s*true/.test(forfeit)) {
      problems.push("forfeit must validate catalogs.escrow_types.may_draw_escrow=true");
    }
    if (!/escrow_draw_reason_not_allowed/.test(forfeit)) {
      problems.push("forfeit must fail loud with escrow_draw_reason_not_allowed");
    }
  }

  if (!factory) problems.push("missing catalogs/driver/factory.ts");
  else if (!/optionalBooleans/.test(factory)) {
    problems.push("catalog factory must support optionalBooleans (may_draw_escrow)");
  }

  if (!index) problems.push("missing catalogs/driver/index.ts");
  else if (!/optionalBooleans:\s*\[\s*["']may_draw_escrow["']\s*\]/.test(index)) {
    problems.push("escrow_types catalog must register optionalBooleans: [may_draw_escrow]");
  }

  if (!modal) problems.push("missing EscrowForfeitModal.tsx");
  else {
    if (!/reason_code/.test(modal)) problems.push("EscrowForfeitModal must submit reason_code");
    if (!/may_draw_escrow/.test(modal)) {
      problems.push("EscrowForfeitModal must filter may_draw_escrow draw reasons");
    }
  }

  if (!list) problems.push("missing EscrowTypesListPage.tsx");
  else if (!/may_draw_escrow/.test(list)) {
    problems.push("EscrowTypesListPage must expose may_draw_escrow for edit");
  }

  if (!held) problems.push("missing .held-migrations.json");
  else if (!/202609100080_nd_esc_01_escrow_draw_catalog\.sql/.test(held)) {
    problems.push("held registry must list 202609100080_nd_esc_01_escrow_draw_catalog.sql");
  }

  return problems;
}

function read(p) {
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : "";
}

function selftest() {
  const good = {
    mig: `HOLD-FOR-JORGE\nDO NOT RUN ON PROD\nmay_draw_escrow\nABANDONMENT\nDAMAGE\nSAFETY-FINE`,
    forfeit: `reason_code\nmay_draw_escrow = true\nescrow_draw_reason_not_allowed`,
    factory: `optionalBooleans`,
    index: `optionalBooleans: ["may_draw_escrow"]`,
    modal: `reason_code\nmay_draw_escrow`,
    list: `may_draw_escrow`,
    held: `202609100080_nd_esc_01_escrow_draw_catalog.sql`,
  };
  const bad = {
    mig: `ADD COLUMN something`,
    forfeit: `reason: z.string().trim().min(3)`,
    factory: `createCatalogRoutes`,
    index: `tableName: "escrow_types"`,
    modal: `reason: reason.trim()`,
    list: `Escrow Types`,
    held: `[]`,
  };
  if (check(good).length) throw new Error(`${LABEL} selftest: compliant flagged`);
  if (!check(bad).length) throw new Error(`${LABEL} selftest: free-text / missing catalog not caught`);
  console.log(`[${LABEL}] SELFTEST PASS`);
}

if (SELFTEST) {
  selftest();
  process.exit(0);
}

const problems = check({
  mig: read(MIG),
  forfeit: read(FORFEIT),
  factory: read(FACTORY),
  index: read(INDEX),
  modal: read(MODAL),
  list: read(LIST),
  held: read(HELD),
});
if (problems.length) {
  console.error(`[${LABEL}] FAIL`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`[${LABEL}] PASS`);
