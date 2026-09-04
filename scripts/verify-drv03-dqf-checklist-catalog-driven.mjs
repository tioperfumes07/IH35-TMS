#!/usr/bin/env node
/**
 * DRV-03 (owner order, board row `docs/bus/OWNER-DEFECT-REGISTER-2026-09-03.md`): "New-driver creation
 * has NO DQ FILE CHECKLIST and no sequence. Build the checklist and enforce the order."
 *
 * ROOT CAUSE: CreateDriverModal.tsx's Step 4 ("DQ docs & drug screen") was a flat, hand-picked 5-slot
 * upload list (identity/mexican_federal_license/passport/cdl/medical) that did not match the real DQF
 * catalog (compliance.required_document_types, entity_kind='driver' — 12 live codes on USMCA, not 5),
 * had no per-item status, and gated Save on nothing but one unverifiable checkbox.
 *
 * FIX: Step 4 now fetches the LIVE catalog (listRequiredDocumentTypes) and renders it in the catalog's
 * own sort_order — the "sequence" the owner asked for. Save is gated on any ACTIVE catalog item whose
 * live `enforcement === 'hard_block'` this driver would not satisfy (dormant today since every seeded
 * code is 'warn', but real and wired the instant the owner promotes one — never a hardcoded guess of
 * which items are required).
 *
 * This guard is a NAMED regression lock, not a re-derivation of the checklist's own logic:
 *   1. The file must fetch the live catalog (listRequiredDocumentTypes), not a second hardcoded list.
 *   2. The checklist must render in the catalog's own sort_order (Array.sort by sort_order), not a
 *      fixed JSX order.
 *   3. Save's disabled condition must include the live hard_block gate
 *      (unsatisfiedHardBlockDqfItems.length > 0) — the "enforce the order" half of the ask.
 *   4. The old 5-slot flat literal array (identity/mexican_federal_license/passport/cdl/medical as ONE
 *      hardcoded array feeding the DQF step) must not return — regressing back to it is exactly how
 *      this defect shipped the first time.
 *
 * Run: node scripts/verify-drv03-dqf-checklist-catalog-driven.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-drv03-dqf-checklist-catalog-driven";
const REL = "apps/frontend/src/components/drivers/CreateDriverModal.tsx";

const OLD_HARDCODED_SLOT_LIST_RE =
  /\[\s*\[\s*"identity"[\s\S]{0,40}\[\s*"mexican_federal_license"[\s\S]{0,40}\[\s*"passport"[\s\S]{0,40}\[\s*"cdl"[\s\S]{0,40}\[\s*"medical"/;

export function run(root = ROOT) {
  const problems = [];
  let src;
  try {
    src = fs.readFileSync(path.join(root, REL), "utf8");
  } catch {
    return [`${REL}: missing`];
  }

  if (!/listRequiredDocumentTypes\(/.test(src)) {
    problems.push(`${REL}: no live listRequiredDocumentTypes(...) call found — DQF checklist regressed to a hardcoded list`);
  }
  if (!/\.sort\(\s*\(a,\s*b\)\s*=>\s*a\.sort_order\s*-\s*b\.sort_order\s*\)/.test(src)) {
    problems.push(`${REL}: checklist no longer sorts by the catalog's own sort_order — the "enforce the order" sequence is gone`);
  }
  if (!/unsatisfiedHardBlockDqfItems/.test(src)) {
    problems.push(`${REL}: unsatisfiedHardBlockDqfItems gate is missing — DQF hard_block enforcement removed`);
  }
  if (!/disabled=\{[\s\S]{0,800}unsatisfiedHardBlockDqfItems\.length > 0/.test(src)) {
    problems.push(`${REL}: unsatisfiedHardBlockDqfItems is defined but no longer wired into Save's disabled condition`);
  }
  if (OLD_HARDCODED_SLOT_LIST_RE.test(src)) {
    problems.push(`${REL}: the old hardcoded 5-slot [identity, mexican_federal_license, passport, cdl, medical] array is back — this is the exact pre-fix shape`);
  }

  return problems;
}

function selftest() {
  const dir = fs.mkdtempSync("/tmp/drv03-dqf-checklist-selftest-");
  const write = (content) => {
    const abs = path.join(dir, REL);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
  };

  const fixed = `
    const requiredDocTypesQuery = useQuery({ queryFn: () => listRequiredDocumentTypes(companyId, "driver") });
    const driverDqfChecklist = useMemo(() => (requiredDocTypesQuery.data ?? []).sort((a, b) => a.sort_order - b.sort_order), []);
    const unsatisfiedHardBlockDqfItems = driverDqfChecklist.filter((item) => item.enforcement === "hard_block");
    <SaveDropdown disabled={
      !identityStepReady ||
      unsatisfiedHardBlockDqfItems.length > 0
    } />
  `;
  write(fixed);
  const clean = run(dir);
  if (clean.length) throw new Error("PASS fail (should be clean): " + JSON.stringify(clean));

  // Regress: drop the live catalog fetch, revert to the exact old hardcoded slot list.
  const regressed = `
    const DQF_SLOTS = [["identity","INE"],["mexican_federal_license","MX"],["passport","Passport"],["cdl","CDL"],["medical","Medical"]];
  `;
  write(regressed);
  const caught = run(dir);
  if (!caught.some((p) => p.includes("hardcoded"))) throw new Error("FAIL to catch: old hardcoded 5-slot list regression went undetected");
  if (!caught.some((p) => p.includes("listRequiredDocumentTypes"))) throw new Error("FAIL to catch: missing live catalog fetch went undetected");

  // Regress: catalog fetch + gate variable both present, but silently unwired from Save's disabled prop.
  write(`
    const requiredDocTypesQuery = useQuery({ queryFn: () => listRequiredDocumentTypes(companyId, "driver") });
    const driverDqfChecklist = useMemo(() => (requiredDocTypesQuery.data ?? []).sort((a, b) => a.sort_order - b.sort_order), []);
    const unsatisfiedHardBlockDqfItems = driverDqfChecklist.filter((item) => item.enforcement === "hard_block");
    <SaveDropdown disabled={!identityStepReady} />
    <span>{unsatisfiedHardBlockDqfItems.length}</span>
  `);
  const unwired = run(dir);
  if (!unwired.some((p) => p.includes("no longer wired"))) {
    throw new Error("FAIL to catch: hard_block gate silently removed from Save's disabled prop went undetected");
  }

  fs.rmSync(dir, { recursive: true, force: true });
  console.log(`${LABEL} --selftest OK`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const problems = run();
if (problems.length) {
  console.error(`${LABEL} FAILED:`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`${LABEL} OK — driver-create DQF checklist is live-catalog-driven, sorted by sort_order, and gates Save on any unsatisfied hard_block item`);
