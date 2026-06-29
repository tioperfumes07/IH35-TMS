#!/usr/bin/env node
/**
 * FIN-18 settlement + deduction GL posting guard (Tier-1 financial integrity).
 *
 * Three invariants — each FAILS the build if regressed:
 *   (1) FLAG GATE: the poster reads SETTLEMENT_GL_POSTING_ENABLED via isEnabled and RETURNS the
 *       skipped_flag_off no-op BEFORE any INSERT INTO accounting.journal_entr* — so with the flag OFF
 *       zero journal entries / financial rows are written.
 *   (2) CONSENT GATE: the poster calls hasSignedDeductionAuthorization and BLOCKS (CONSENT_MISSING)
 *       when a deduction has no signed authorization on file — never silently drops it.
 *   (3) FLOOR GUARDRAIL: the net-pay floor path THROWS NET_PAY_FLOOR_BREACH (a BLOCK) and never
 *       silently caps / spreads / amortizes the deduction to fit the floor.
 *   + the flag migration registers SETTLEMENT_GL_POSTING_ENABLED with default_enabled=false.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const SERVICE = path.join(ROOT, "apps/backend/src/accounting/settlement-posting/settlement-posting.service.ts");
const MIGRATION = path.join(ROOT, "db/migrations/202606290010_settlement_gl_posting_foundation.sql");

let failed = 0;
const fail = (m) => { console.error(`verify-settlement-gl-flag-gate: ${m}`); failed = 1; };

if (!fs.existsSync(SERVICE)) fail(`missing settlement poster ${path.relative(ROOT, SERVICE)}`);
if (!fs.existsSync(MIGRATION)) fail(`missing flag migration ${path.relative(ROOT, MIGRATION)}`);

if (fs.existsSync(SERVICE)) {
  const src = fs.readFileSync(SERVICE, "utf8");
  // strip comments so a guard-describing comment cannot satisfy (or trip) the checks
  const code = src.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");

  // (1) flag gate: isEnabled(SETTLEMENT_GL_POSTING_FLAG_KEY) + an early skipped_flag_off return that
  // precedes the first journal_entries INSERT.
  const flagCheckIdx = code.search(/isEnabled\([^)]*SETTLEMENT_GL_POSTING_FLAG_KEY/);
  const skipReturnIdx = code.search(/skipped_flag_off/);
  const firstJeInsertIdx = code.search(/INSERT\s+INTO\s+accounting\.journal_entries/i);
  if (flagCheckIdx < 0) fail("poster does not gate on isEnabled(SETTLEMENT_GL_POSTING_FLAG_KEY).");
  if (skipReturnIdx < 0) fail("poster has no skipped_flag_off no-op return.");
  if (firstJeInsertIdx < 0) fail("poster never inserts a journal entry (unexpected).");
  if (flagCheckIdx >= 0 && firstJeInsertIdx >= 0 && flagCheckIdx > firstJeInsertIdx) {
    fail("flag check must run BEFORE any INSERT INTO accounting.journal_entries.");
  }
  if (skipReturnIdx >= 0 && firstJeInsertIdx >= 0 && skipReturnIdx > firstJeInsertIdx) {
    fail("skipped_flag_off return must precede any INSERT INTO accounting.journal_entries.");
  }

  // (2) consent gate present + blocks.
  if (!/hasSignedDeductionAuthorization\s*\(/.test(code)) {
    fail("poster does not call hasSignedDeductionAuthorization (FLSA consent gate).");
  }
  if (!/CONSENT_MISSING/.test(code)) {
    fail("poster does not BLOCK with CONSENT_MISSING when a deduction lacks a signed authorization.");
  }

  // (3) floor BLOCKS, never silently caps/spreads.
  if (!/NET_PAY_FLOOR_BREACH/.test(code)) {
    fail("poster does not BLOCK with NET_PAY_FLOOR_BREACH when deductions breach the net-pay floor.");
  }
  if (!/throw\s+new\s+SettlementPostingError\(\s*["']NET_PAY_FLOOR_BREACH/.test(code)) {
    fail("the net-pay floor breach must THROW (block) — not be handled by capping/spreading.");
  }
  if (/(auto[-_]?cap|autocap|spread|amortiz|installment_plan)/i.test(code)) {
    fail("poster appears to auto-cap / spread / amortize deductions — the floor must BLOCK, owner sets amounts per event.");
  }
}

if (fs.existsSync(MIGRATION)) {
  const mig = fs.readFileSync(MIGRATION, "utf8");
  if (!/SETTLEMENT_GL_POSTING_ENABLED/.test(mig)) fail("flag migration does not register SETTLEMENT_GL_POSTING_ENABLED.");
  // the feature-flag INSERT row must seed default_enabled = false (the literal `false` after the flag key)
  if (!/SETTLEMENT_GL_POSTING_ENABLED[\s\S]{0,400}?,\s*\n?\s*false\s*,/.test(mig)) {
    fail("flag migration must seed SETTLEMENT_GL_POSTING_ENABLED with default_enabled=false (DEFAULT OFF).");
  }
}

if (failed) process.exit(1);
console.log("verify-settlement-gl-flag-gate: OK — flag-gated (OFF=no-op), consent gate blocks, net-pay floor blocks (no silent cap/spread).");
