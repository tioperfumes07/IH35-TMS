#!/usr/bin/env node
/**
 * INS-04 — safety.damage_continuity_chains.insurance_claim_id must FK insurance.claim.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-damage-chain-claim-fk";
const SELFTEST = process.argv.includes("--selftest");
const MIG = path.join(ROOT, "db/migrations/202609010090_ins_04_damage_chain_claim_fk.sql");

/** @param {string} mig */
export function check(mig) {
  const problems = [];
  if (!mig) {
    problems.push("missing migration 202609010090_ins_04_damage_chain_claim_fk.sql");
    return problems;
  }
  if (!/HOLD-FOR-JORGE/.test(mig)) problems.push("migration must carry HOLD-FOR-JORGE");
  if (!/DO NOT RUN ON PROD/.test(mig)) problems.push("migration must carry DO NOT RUN ON PROD");
  if (!/damage_continuity_chains_insurance_claim_id_fkey/.test(mig)) {
    problems.push("must ADD CONSTRAINT damage_continuity_chains_insurance_claim_id_fkey");
  }
  if (!/REFERENCES\s+insurance\.claim\s*\(\s*id\s*\)/i.test(mig)) {
    problems.push("FK must REFERENCES insurance.claim(id) — Neon-canonical (not insurance_claims)");
  }
  if (/REFERENCES\s+insurance\.insurance_claims\b/i.test(mig) || /REFERENCES\s+insurance_claims\b/i.test(mig)) {
    problems.push("must NOT REFERENCES RETIRE/phantom insurance_claims");
  }
  if (!/ON DELETE RESTRICT/i.test(mig)) problems.push("FK must ON DELETE RESTRICT");
  if (!/dangling/i.test(mig) || !/ABORT/i.test(mig)) {
    problems.push("must abort when dangling insurance_claim_id rows exist");
  }
  return problems;
}

function selftest() {
  const good = `HOLD-FOR-JORGE\nDO NOT RUN ON PROD\nABORT dangling\nADD CONSTRAINT damage_continuity_chains_insurance_claim_id_fkey\nFOREIGN KEY (insurance_claim_id) REFERENCES insurance.claim(id)\nON DELETE RESTRICT`;
  const bad = `REFERENCES insurance.insurance_claims(id) ON DELETE CASCADE`;
  if (check(good).length) throw new Error("compliant flagged");
  if (!check(bad).length) throw new Error("phantom insurance_claims not caught");
  console.log(`[${LABEL}] SELFTEST PASS`);
}

if (SELFTEST) {
  selftest();
  process.exit(0);
}

const mig = fs.existsSync(MIG) ? fs.readFileSync(MIG, "utf8") : "";
const problems = check(mig);
if (problems.length) {
  console.error(`[${LABEL}] FAILED:`);
  for (const p of problems) console.error(`  ✗ ${p}`);
  process.exit(1);
}
console.log(`[${LABEL}] OK — damage_continuity_chains.insurance_claim_id FK to insurance.claim`);
