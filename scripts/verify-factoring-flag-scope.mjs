#!/usr/bin/env node
/**
 * FACT-01 — FACTORING_GL_POSTING_ENABLED overrides must be TRANSP-only.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-factoring-flag-scope";
const SELFTEST = process.argv.includes("--selftest");

const SERVICE = path.join(ROOT, "apps/backend/src/lib/feature-flags/service.ts");
const MIG = path.join(ROOT, "db/migrations/202609100040_fact_01_factoring_flag_transp_only.sql");

/** @param {string} service @param {string} mig */
export function check(service, mig) {
  const problems = [];
  if (!service) problems.push("missing feature-flags/service.ts");
  if (!mig) problems.push("missing migration 202609100040_fact_01_factoring_flag_transp_only.sql");

  if (service) {
    if (!/FACTORING_GL_POSTING_ENABLED/.test(service)) {
      problems.push("service must mention FACTORING_GL_POSTING_ENABLED");
    }
    if (!/factoring_flag_transp_only/.test(service)) {
      problems.push("setOverride must throw factoring_flag_transp_only for non-TRANSP enable");
    }
    if (!/code\s*!==\s*["']TRANSP["']/.test(service) && !/code !== "TRANSP"/.test(service)) {
      problems.push("setOverride must require company code === TRANSP when enabling factoring flag");
    }
  }
  if (mig) {
    if (!/HOLD-FOR-JORGE/.test(mig)) problems.push("migration must HOLD-FOR-JORGE");
    if (!/DO NOT RUN ON PROD/.test(mig)) problems.push("migration must DO NOT RUN ON PROD");
    if (!/TRK/.test(mig) || !/USMCA/.test(mig)) {
      problems.push("migration must disable TRK and USMCA overrides");
    }
    if (!/enabled\s*=\s*false/i.test(mig)) {
      problems.push("migration must set enabled = false for non-TRANSP");
    }
  }
  return problems;
}

function selftest() {
  const goodService = `
    if (input.flag_key === "FACTORING_GL_POSTING_ENABLED" && input.enabled) {
      if (code !== "TRANSP") throw new Error("factoring_flag_transp_only");
    }
  `;
  const goodMig = `HOLD-FOR-JORGE\nDO NOT RUN ON PROD\nTRK USMCA\nenabled = false`;
  if (check(goodService, goodMig).length) throw new Error("compliant flagged");
  if (!check("FACTORING_GL_POSTING_ENABLED only", goodMig).length) throw new Error("missing throw not caught");
  console.log(`[${LABEL}] SELFTEST PASS`);
}

if (SELFTEST) {
  selftest();
  process.exit(0);
}

const read = (p) => (fs.existsSync(p) ? fs.readFileSync(p, "utf8") : "");
const problems = check(read(SERVICE), read(MIG));
if (problems.length) {
  console.error(`[${LABEL}] FAILED:`);
  for (const p of problems) console.error(`  ✗ ${p}`);
  process.exit(1);
}
console.log(`[${LABEL}] OK — FACTORING_GL_POSTING_ENABLED enable gated TRANSP-only; TRK/USMCA disabled in mig`);
