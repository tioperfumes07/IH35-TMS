#!/usr/bin/env node
/**
 * ND-ESC-01 (draw-catalog half) — the escrow forfeit gate reads the CANONICAL recovery-reason
 * catalog, and free text can never move money again.
 *
 * WHAT THIS BITES. Before this, POST /driver-finance/escrow/:driverId/forfeit accepted
 * `reason: z.string().min(3).max(500)` — free text on a call that permanently takes money out of a
 * driver's held funds. An auditor cannot total "escrow forfeited for abandonment" across free text,
 * and two operators will never spell the same reason the same way. The reason is now a catalog code
 * the route validates, and a code that is not marked drawable is refused.
 *
 * WHICH CATALOG — owner ruling 2026-07-27, after two lanes built this on two different tables.
 * CANONICAL: catalogs.driver_deduction_types. NOT catalogs.escrow_types. escrow_types defines escrow
 * BUCKETS (its original seed carries target_amount_cents, and the UI calls it "Escrow bucket
 * definitions"), so recovery reasons seeded there would appear as funds to accumulate into. More
 * decisively, a policy hung off escrow can only ever express the escrow rail — it structurally
 * cannot represent "settlement first", which is 00_LOCKED_DECISIONS 9.3's primary rule. This guard
 * therefore asserts BOTH directions: the canonical table is wired, AND the policy flag has not
 * drifted back onto the bucket catalog.
 *
 * SCOPE. This guard owns the WIRING. The migration, the rail vocabulary and the seeded situations
 * are owned by verify-driver-recovery-policy-single-vocabulary (step 1638) and must not be asserted
 * twice — the two land in separate PRs, and a guard that asserts another PR's file is red for
 * reasons its own branch cannot fix.
 *
 * Usage: node scripts/verify-escrow-draw-catalog-editable.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-escrow-draw-catalog-editable";
const SELFTEST = process.argv.includes("--selftest");

const FILES = {
  forfeit: "apps/backend/src/driver-finance/escrow-forfeit.routes.ts",
  factory: "apps/backend/src/catalogs/driver/factory.ts",
  index: "apps/backend/src/catalogs/driver/index.ts",
  modal: "apps/frontend/src/pages/safety/components/EscrowForfeitModal.tsx",
  deductionList: "apps/frontend/src/pages/lists/driver/DriverDeductionTypesListPage.tsx",
  escrowList: "apps/frontend/src/pages/lists/driver/EscrowTypesListPage.tsx",
};

const CANONICAL = "catalogs.driver_deduction_types";

export function check(s) {
  const problems = [];

  // --- the gate -------------------------------------------------------------------------------
  if (!s.forfeit) problems.push("missing escrow-forfeit.routes.ts");
  else {
    if (!/reason_code/.test(s.forfeit)) problems.push("forfeit route must require reason_code");
    if (/\breason:\s*z\.string\(\)/.test(s.forfeit)) {
      problems.push("forfeit route still accepts a free-text `reason` — free text on a call that permanently removes a driver's held funds is unauditable and unreportable");
    }
    if (!new RegExp(CANONICAL.replace(".", "\\.")).test(s.forfeit)) {
      problems.push(`forfeit route must read ${CANONICAL} — the canonical recovery-reason catalog (owner ruling 2026-07-27)`);
    }
    if (/catalogs\.escrow_types/.test(s.forfeit)) {
      problems.push("forfeit route reads catalogs.escrow_types — that catalog defines escrow BUCKETS (funding targets) and cannot express settlement-first recovery");
    }
    if (!/may_draw_escrow\s*=\s*true/.test(s.forfeit)) {
      problems.push("forfeit route must require may_draw_escrow = true — otherwise any catalog code authorises an escrow draw");
    }
    if (!/escrow_draw_reason_not_allowed/.test(s.forfeit)) {
      problems.push("forfeit route must refuse loudly with escrow_draw_reason_not_allowed");
    }
  }

  // --- the factory must not 500 a Lists page before the held migration is applied ---------------
  if (!s.factory) problems.push("missing catalogs/driver/factory.ts");
  else {
    if (!/optionalBooleans/.test(s.factory)) problems.push("catalog factory must support optionalBooleans");
    if (!/information_schema\.columns/.test(s.factory)) {
      problems.push("catalog factory must resolve optional boolean columns against information_schema — selecting a column that only exists after the owner applies a held migration throws 42703 and 500s the whole Lists page in the merge-to-apply window (CI cannot see this: CI builds a fresh DB where every migration has run)");
    }
  }

  // --- registration: canonical yes, bucket catalog no ------------------------------------------
  if (!s.index) problems.push("missing catalogs/driver/index.ts");
  else {
    const ddtBlock = s.index.match(/tableName:\s*"driver_deduction_types"[\s\S]*?\}\);/);
    const escrowBlock = s.index.match(/tableName:\s*"escrow_types"[\s\S]*?\}\);/);
    if (!ddtBlock || !/optionalBooleans/.test(ddtBlock[0])) {
      problems.push("driver_deduction_types must register optionalBooleans (may_draw_escrow) — it is the canonical recovery-reason catalog");
    }
    if (escrowBlock && /optionalBooleans/.test(escrowBlock[0])) {
      problems.push("escrow_types registers optionalBooleans — the recovery policy drifted back onto the escrow BUCKET catalog");
    }
    // The rail must be editable from Lists, or "policy is data" is only half true: the owner could
    // toggle whether escrow may be drawn but not change WHICH rail is pre-selected without a deploy.
    if (!ddtBlock || !/optionalEnums/.test(ddtBlock[0]) || !/default_recovery_rail/.test(ddtBlock[0])) {
      problems.push("driver_deduction_types must register optionalEnums for default_recovery_rail — otherwise changing the pre-selected recovery rail still needs a deployment");
    }
    // ...and its values must be IMPORTED from the single owner-locked declaration. A literal list of
    // the four words here is a second dialect waiting to drift, which is the defect this whole block
    // exists to prevent.
    if (/optionalEnums[\s\S]{0,200}?values:\s*\[\s*["']/.test(s.index)) {
      problems.push("the rail vocabulary is written as a literal array in index.ts — import INSURANCE_CLAIM_RECOVERY_RAIL_VALUES instead so one lock governs both sides");
    }
    if (!/INSURANCE_CLAIM_RECOVERY_RAIL_VALUES/.test(s.index)) {
      problems.push("index.ts does not import INSURANCE_CLAIM_RECOVERY_RAIL_VALUES — the rail options must come from the owner-locked declaration");
    }
  }

  // --- surfaces ---------------------------------------------------------------------------------
  if (!s.modal) problems.push("missing EscrowForfeitModal.tsx");
  else {
    if (!/reason_code/.test(s.modal)) problems.push("EscrowForfeitModal must submit reason_code");
    if (!/may_draw_escrow/.test(s.modal)) problems.push("EscrowForfeitModal must offer only may_draw_escrow reasons");
    if (/escrowTypesCatalogClient/.test(s.modal)) {
      problems.push("EscrowForfeitModal still reads escrowTypesCatalogClient — it must read the canonical deduction-types catalog");
    }
  }

  if (!s.deductionList) problems.push("missing DriverDeductionTypesListPage.tsx");
  else {
    if (!/may_draw_escrow/.test(s.deductionList)) {
      problems.push("DriverDeductionTypesListPage must expose may_draw_escrow so the owner can edit the policy without a deployment");
    }
    if (!/default_recovery_rail/.test(s.deductionList) || !/INSURANCE_CLAIM_RECOVERY_RAIL_VALUES/.test(s.deductionList)) {
      problems.push("DriverDeductionTypesListPage must expose default_recovery_rail with the IMPORTED rail options — re-typing the four words on the page is how the picker drifts from the database CHECK");
    }
  }

  if (s.escrowList && /may_draw_escrow/.test(s.escrowList)) {
    problems.push("EscrowTypesListPage exposes may_draw_escrow — the bucket catalog must not carry recovery policy");
  }

  return problems;
}

function read(rel) {
  const p = path.join(ROOT, rel);
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : "";
}

function live() {
  return Object.fromEntries(Object.entries(FILES).map(([k, rel]) => [k, read(rel)]));
}

function selftest() {
  let ok = true;
  const real = live();

  const clean = check(real);
  if (clean.length) {
    console.error(`SELFTEST FAIL: the real repointed sources are flagged — false positive:`);
    for (const p of clean) console.error(`   ✗ ${p}`);
    ok = false;
  } else {
    console.log("SELFTEST: repointed sources not flagged — OK");
  }

  // Every case MUTATES the real sources, so none can silently stop testing anything.
  const cases = [
    ["free-text reason restored", { ...real, forfeit: real.forfeit.replace(/reason_code:\s*z\.string\(\)/, "reason: z.string()") }],
    ["gate repointed at the bucket catalog", { ...real, forfeit: real.forfeit.replace(/catalogs\.driver_deduction_types/g, "catalogs.escrow_types") }],
    ["drawable check removed", { ...real, forfeit: real.forfeit.replace(/may_draw_escrow\s*=\s*true/g, "is_active = true") }],
    ["silent refusal", { ...real, forfeit: real.forfeit.replace(/escrow_draw_reason_not_allowed/g, "ok") }],
    ["factory back to unconditional select", { ...real, factory: real.factory.replace(/information_schema\.columns/g, "pg_class") }],
    ["policy drifts onto the bucket catalog", { ...real, escrowList: `${real.escrowList}\nmay_draw_escrow` }],
    ["modal reads the wrong catalog", { ...real, modal: real.modal.replace(/driverDeductionTypesCatalogClient/g, "escrowTypesCatalogClient") }],
    ["rail no longer editable", { ...real, index: real.index.replace(/optionalEnums/g, "unusedEnums") }],
    ["rail vocabulary re-typed as a literal", { ...real, index: real.index.replace(/values:\s*INSURANCE_CLAIM_RECOVERY_RAIL_VALUES/, `values: ["escrow", "settlement", "split", "ask"]`) }],
    ["list page drops the rail column", { ...real, deductionList: real.deductionList.replace(/default_recovery_rail/g, "unused_col") }],
  ];

  for (const [name, mutated] of cases) {
    const changed = Object.keys(mutated).some((k) => mutated[k] !== real[k]);
    if (!changed) {
      console.error(`SELFTEST FAIL: '${name}' did not mutate anything — the case cannot fail, so it proves nothing`);
      ok = false;
      continue;
    }
    if (check(mutated).length === 0) {
      console.error(`SELFTEST FAIL: '${name}' was not caught`);
      ok = false;
    } else {
      console.log(`SELFTEST: '${name}' -> caught as expected`);
    }
  }

  if (!ok) process.exit(1);
  console.log(`[${LABEL}] SELFTEST PASS`);
}

if (SELFTEST) selftest();
else {
  const problems = check(live());
  if (problems.length) {
    console.error(`[${LABEL}] FAILED — ${problems.length} issue(s):`);
    for (const p of problems) console.error(`  ✗ ${p}`);
    process.exit(1);
  }
  console.log(`[${LABEL}] OK — escrow forfeit is gated on ${CANONICAL}.may_draw_escrow, free text cannot move money, and the policy has not drifted onto the escrow bucket catalog`);
}
