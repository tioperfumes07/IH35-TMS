#!/usr/bin/env node
/** FACT-S02 — /factoring/submit submission queue entity-scoped + honest empty. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-fact-s02-submit-surface";
const SELFTEST = process.argv.includes("--selftest");
const PAGE = "apps/frontend/src/pages/factoring/SubmissionQueue.tsx";
const MANIFEST = "apps/frontend/src/routes/manifest.tsx";

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

// LEAD 443.187 — REPOINTED, same rule ("the submission queue is reachable at /factoring/submit"): fa84b19c33 (ACCT-F9331,
// one purchase engine, OWNER LAW 2026-10-02) made /factoring/submit redirect to the canonical /factoring/submit-invoice tab,
// and ACCT-F2026100619 mounts <SubmissionQueue /> inside FactoringHome under that tab. The queue must stay reachable by that
// route: /factoring/submit -> /factoring/submit-invoice -> FactoringHome show("submit_invoice") -> <SubmissionQueue />.
const HOME = "apps/frontend/src/pages/factoring/FactoringHome.tsx";
function assertLive(pageOverride, homeOverride) {
  const problems = [];
  const src = pageOverride ?? read(PAGE);
  const manifest = read(MANIFEST);
  const home = homeOverride ?? read(HOME);
  if (!/path="\/factoring\/submit"/.test(manifest)) problems.push("submit route missing");
  const redirects = /path="\/factoring\/submit"[\s\S]{0,200}?<Navigate to="\/factoring\/submit-invoice"/.test(manifest);
  const tabRoute = /path="\/factoring\/submit-invoice"[\s\S]{0,300}?tabId="submit_invoice"/.test(manifest);
  const mountedInTab = /show\("submit_invoice"\)[\s\S]{0,1500}?<SubmissionQueue \/>/.test(home);
  if (!manifest.includes("SubmissionQueue") && !(redirects && tabRoute && mountedInTab)) problems.push("SubmissionQueue not mounted");
  if (!src.includes('data-testid="factoring-submit-need-company"')) problems.push("need-company missing");
  if (!src.includes('data-testid="factoring-submit-honest-empty"')) problems.push("honest empty missing");
  if (!src.includes("ListErrorBanner")) problems.push("ListErrorBanner missing");
  if (!src.includes("enabled: Boolean(companyId)")) problems.push("query not company-gated");
  if (!src.includes("listSubmissionQueue")) problems.push("listSubmissionQueue missing");
  return problems;
}

if (SELFTEST) {
  const live = assertLive();
  if (live.length) {
    console.error(`${LABEL} SELFTEST FAILED live: ${live.join(" | ")}`);
    process.exit(1);
  }
  const pagePath = path.join(ROOT, PAGE);
  const orig = fs.readFileSync(pagePath, "utf8");
  const planted = orig.replace(/data-testid="factoring-submit-honest-empty"/, 'data-testid="x"');
  {
    if (!assertLive(planted).length) {
      console.error(`${LABEL} SELFTEST FAILED: planted defect not caught`);
      process.exit(1);
    }
  }
  {
    const homeOrig = read(HOME);
    if (!assertLive(undefined, homeOrig.replace("<SubmissionQueue />", "")).length) {
      console.error(`${LABEL} SELFTEST FAILED: queue unmounted from the submit-invoice tab not caught`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} SELFTEST PASS`);
  process.exit(0);
}

const problems = assertLive();
if (problems.length) {
  console.error(`${LABEL} FAILED:`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`${LABEL} OK`);
