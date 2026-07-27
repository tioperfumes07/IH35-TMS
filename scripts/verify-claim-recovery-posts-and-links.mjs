#!/usr/bin/env node
/**
 * INS-02 — claim recovery must post via createJournalEntry + linkage table (flag OFF default).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-claim-recovery-posts-and-links";
const SELFTEST = process.argv.includes("--selftest");

const POSTER = path.join(
  ROOT,
  "apps/backend/src/accounting/insurance-claim-recovery-posting/poster.service.ts"
);
const ROUTES = path.join(ROOT, "apps/backend/src/insurance/claim.routes.ts");
const MIG = path.join(ROOT, "db/migrations/202609100020_ins_02_claim_recovery_gl_hop.sql");

/** @param {string} poster @param {string} routes @param {string} mig */
export function check(poster, routes, mig) {
  const problems = [];
  if (!poster) problems.push("missing insurance-claim-recovery-posting/poster.service.ts");
  if (!routes) problems.push("missing claim.routes.ts");
  if (!mig) problems.push("missing migration 202609100020_ins_02_claim_recovery_gl_hop.sql");

  if (poster) {
    if (!/createJournalEntry/.test(poster)) problems.push("poster must reuse createJournalEntry");
    if (!/insurance_recovery/.test(poster)) problems.push("poster must credit insurance_recovery role");
    if (!/cash_clearing/.test(poster)) problems.push("poster must debit cash_clearing");
    if (!/INSURANCE_CLAIM_RECOVERY_GL_POSTING_ENABLED/.test(poster)) {
      problems.push("poster must gate on INSURANCE_CLAIM_RECOVERY_GL_POSTING_ENABLED");
    }
    if (!/insurance_claim_recovery_postings/.test(poster)) {
      problems.push("poster must write accounting.insurance_claim_recovery_postings linkage");
    }
  }
  if (routes && !/postInsuranceClaimRecovery/.test(routes)) {
    problems.push("claim PATCH must call postInsuranceClaimRecovery when amount_paid_cents changes");
  }
  if (mig) {
    if (!/HOLD-FOR-JORGE/.test(mig)) problems.push("migration must HOLD-FOR-JORGE");
    if (!/DO NOT RUN ON PROD/.test(mig)) problems.push("migration must DO NOT RUN ON PROD");
    if (!/INSURANCE_CLAIM_RECOVERY_GL_POSTING_ENABLED/.test(mig)) {
      problems.push("migration must seed flag default OFF");
    }
    if (!/insurance_claim_recovery_postings/.test(mig)) {
      problems.push("migration must create insurance_claim_recovery_postings");
    }
    if (!/REFERENCES\s+insurance\.claim/i.test(mig)) {
      problems.push("postings.claim_id must FK insurance.claim");
    }
    if (!/REFERENCES\s+accounting\.journal_entries/i.test(mig)) {
      problems.push("postings.journal_entry_id must FK journal_entries");
    }
    if (!/default_enabled\)[\s\S]*false|default_enabled[\s\S]*false/i.test(mig)) {
      problems.push("flag must default_enabled false");
    }
  }
  return problems;
}

function selftest() {
  const goodPoster = `
    INSURANCE_CLAIM_RECOVERY_GL_POSTING_ENABLED
    createJournalEntry; cash_clearing; insurance_recovery;
    INSERT INTO accounting.insurance_claim_recovery_postings
  `;
  const goodRoutes = `postInsuranceClaimRecovery({ amount_paid_cents`;
  const goodMig = `HOLD-FOR-JORGE\nDO NOT RUN ON PROD\nINSURANCE_CLAIM_RECOVERY_GL_POSTING_ENABLED\ndefault_enabled)\nVALUES (..., false\ninsurance_claim_recovery_postings\nREFERENCES insurance.claim(id)\nREFERENCES accounting.journal_entries(id)`;
  if (check(goodPoster, goodRoutes, goodMig).length) throw new Error("compliant flagged");
  if (!check("createJournalEntry only", goodRoutes, goodMig).length) throw new Error("incomplete poster not caught");
  console.log(`[${LABEL}] SELFTEST PASS`);
}

if (SELFTEST) {
  selftest();
  process.exit(0);
}

const read = (p) => (fs.existsSync(p) ? fs.readFileSync(p, "utf8") : "");
const problems = check(read(POSTER), read(ROUTES), read(MIG));
if (problems.length) {
  console.error(`[${LABEL}] FAILED:`);
  for (const p of problems) console.error(`  ✗ ${p}`);
  process.exit(1);
}
console.log(`[${LABEL}] OK — claim recovery posts JE + links via insurance_claim_recovery_postings (flag OFF)`);
