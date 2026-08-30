#!/usr/bin/env node
/**
 * HOS-VIOL-UX guard — locks:
 *  1. Backend void endpoint must NOT persist the hardcoded literal 'voided via endpoint'
 *  2. Body `reason` must be validated (zod min/max) before persist
 *  3. Frontend API + UI must pass a user-supplied reason (VoidReasonModal / body.reason)
 *  4. HOS dashboard "+ Create" must open a real create modal (not a dead Link)
 *
 * Self-test: node scripts/verify-hos-violation-void-reason.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-hos-violation-void-reason";

const FILES = {
  backend: "apps/backend/src/routes/safety/hos-violations.ts",
  api: "apps/frontend/src/api/safetyV64.ts",
  tab: "apps/frontend/src/pages/safety/tabs/HOSViolationsTab.tsx",
  dashboard: "apps/frontend/src/pages/safety/HoursOfServicePage.tsx",
  createModal: "apps/frontend/src/pages/safety/components/HosViolationCreateModal.tsx",
};

function stripComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

export function assertGuard(sources) {
  const errors = [];
  const backend = stripComments(sources.backend);
  const api = stripComments(sources.api);
  const tab = stripComments(sources.tab);
  const dashboard = stripComments(sources.dashboard);
  const createModal = stripComments(sources.createModal);

  if (/voided via endpoint/.test(backend)) {
    errors.push(`${FILES.backend}: must not persist hardcoded 'voided via endpoint' as void_reason`);
  }
  if (!/voidHosViolationSchema/.test(backend) && !/reason:\s*z\.string\(\)\.trim\(\)\.min\(/.test(backend)) {
    errors.push(`${FILES.backend}: void body must validate required reason (zod trim + min)`);
  }
  if (!/\.max\(\s*500\s*\)/.test(backend)) {
    errors.push(`${FILES.backend}: void reason must have a reasonable max length`);
  }
  if (!/void_reason\s*=\s*\$4/.test(backend) && !/void_reason\s*=\s*\$\d/.test(backend)) {
    errors.push(`${FILES.backend}: UPDATE must set void_reason from the validated body parameter`);
  }
  if (!/void_reason:\s*body\.data\.reason/.test(backend)) {
    errors.push(`${FILES.backend}: audit event must include the real void_reason`);
  }

  if (!/function voidHosViolation\([^)]*reason:\s*string/.test(api)) {
    errors.push(`${FILES.api}: voidHosViolation must accept a user-supplied reason string`);
  }
  if (!/body:\s*\{\s*reason\s*\}/.test(api)) {
    errors.push(`${FILES.api}: voidHosViolation must POST body { reason }`);
  }

  if (!/VoidReasonModal/.test(tab)) {
    errors.push(`${FILES.tab}: HOSViolationsTab must prompt via VoidReasonModal`);
  }
  // Accept typed mutation envelopes (`input.companyId`, `input.id`) as well as
  // destructured locals. The contract is semantic: the third argument must be
  // the operator-supplied reason; identifier spelling is not architecture.
  if (!/voidHosViolation\(\s*[\w.]+\s*,\s*(?:String\([^)]*\)|[\w.]+)\s*,\s*(?:[A-Za-z_$][\w$]*\.)?reason\s*\)/.test(tab)) {
    errors.push(`${FILES.tab}: void mutation must pass user-supplied reason to voidHosViolation`);
  }

  if (/safety-hos-create-violation-link/.test(dashboard) || /to="\/safety\/hos-violations"[\s\S]{0,200}\+\s*Create violation/.test(dashboard)) {
    errors.push(`${FILES.dashboard}: "+ Create" must not be a dead Link labeled create-violation`);
  }
  if (!/data-testid="safety-hos-create-violation"/.test(dashboard)) {
    errors.push(`${FILES.dashboard}: primary create control must use data-testid safety-hos-create-violation`);
  }
  if (!/HosViolationCreateModal/.test(dashboard)) {
    errors.push(`${FILES.dashboard}: must open HosViolationCreateModal for a real create action`);
  }
  if (!/createHosViolation\(/.test(createModal)) {
    errors.push(`${FILES.createModal}: create modal must call createHosViolation`);
  }
  if (!/\+\s*Create/.test(createModal) && !/>\s*\+\s*Create\s*</.test(createModal)) {
    errors.push(`${FILES.createModal}: submit label must be "+ Create" (repo primary-button law)`);
  }

  // Create INSERT must match prod safety.hos_violations (Neon br-fancy-credit) — no phantom columns.
  const insertBlock = backend.match(/INSERT INTO safety\.hos_violations\s*\(([\s\S]*?)\)\s*VALUES/i)?.[1] ?? "";
  if (!insertBlock) {
    errors.push(`${FILES.backend}: POST create must INSERT INTO safety.hos_violations`);
  } else {
    for (const col of ["violation_type", "occurred_at", "source", "created_by", "operating_company_id", "driver_id"]) {
      if (!new RegExp(`\\b${col}\\b`).test(insertBlock)) {
        errors.push(`${FILES.backend}: INSERT must include prod column ${col}`);
      }
    }
    for (const phantom of ["unit_id", "violation_code", "violation_description", "duty_status", "severity"]) {
      if (new RegExp(`\\b${phantom}\\b`).test(insertBlock)) {
        errors.push(`${FILES.backend}: INSERT must not use phantom column ${phantom} (not on prod)`);
      }
    }
  }
  if (!/z\.enum\(\[\s*"samsara_auto"\s*,\s*"manual_office"\s*,\s*"dot_citation"\s*\]\)/.test(backend)) {
    errors.push(`${FILES.backend}: create source enum must match prod CHECK (samsara_auto|manual_office|dot_citation)`);
  }
  // Both inline forms and typed submission envelopes are canonical callers.
  if (!/violation_type:\s*(?:[A-Za-z_$][\w$]*\.)*violation_type(?:\.trim\(\))?/.test(createModal)) {
    errors.push(`${FILES.createModal}: must POST violation_type (prod column), not violation_code`);
  }
  if (/source:\s*"manual"\s*as/.test(createModal) || /value="manual"(?!_)/.test(createModal)) {
    errors.push(`${FILES.createModal}: source values must be prod CHECK enums, not manual/eld_import`);
  }
  if (!/toISOString\(\)/.test(createModal)) {
    errors.push(`${FILES.createModal}: occurred_at must be sent as ISO datetime with offset (toISOString)`);
  }

  return errors;
}

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

function selftest() {
  const good = {
    backend: `
      const voidHosViolationSchema = z.object({
        reason: z.string().trim().min(3, "a reason is required").max(500),
      });
      SET voided_at = now(), voided_by = $2, void_reason = $4
      { hos_violation_id: row.id, void_reason: body.data.reason }
    `,
    api: `
      export function voidHosViolation(companyId: string, id: string, reason: string) {
        return apiRequest(url, { method: "POST", body: { reason } });
      }
    `,
    tab: `
      import { VoidReasonModal } from "...";
      mutationFn: (input: { id: string; reason: string; companyId: string }) => voidHosViolation(input.companyId, input.id, input.reason),
      <VoidReasonModal onSubmit={async (reason) => { await voidMutation.mutateAsync({ id, reason }); }} />
    `,
    dashboard: `
      <button data-testid="safety-hos-create-violation" onClick={() => setCreateOpen(true)}>+ Create</button>
      <HosViolationCreateModal open={createOpen} />
    `,
    createModal: `
      createHosViolation(input.companyId, { driver_id: input.draft.driver_id, violation_type: input.draft.violation_type.trim(), occurred_at: new Date().toISOString(), source: "manual_office" });
      <Button type="submit">+ Create</Button>
      <option value="manual_office">manual_office</option>
    `,
  };
  // Inject a minimal valid INSERT into good.backend for create-schema checks
  good.backend += `
      INSERT INTO safety.hos_violations (
            operating_company_id, driver_id, violation_type, occurred_at, source, created_by
          )
          VALUES ($1,$2,$3,$4::timestamptz,$5,$6)
      source: z.enum(["samsara_auto", "manual_office", "dot_citation"]).default("manual_office"),
    `;
  const pass = assertGuard(good);
  if (pass.length) {
    console.error(`[${LABEL}] --selftest FAIL: good fixture produced errors`, pass);
    process.exit(1);
  }

  const legacy = {
    ...good,
    backend: `
      SET void_reason = COALESCE(void_reason, 'voided via endpoint')
      { hos_violation_id: row.id }
    `,
    api: `export function voidHosViolation(companyId: string, id: string) { return apiRequest(url, { method: "POST" }); }`,
    dashboard: `<Link to="/safety/hos-violations" data-testid="safety-hos-create-violation-link">+ Create violation</Link>`,
  };
  const fail = assertGuard(legacy);
  if (
    !fail.some((e) => e.includes("voided via endpoint")) ||
    !fail.some((e) => e.includes("voidHosViolation must accept")) ||
    !fail.some((e) => e.includes("dead Link"))
  ) {
    console.error(`[${LABEL}] --selftest FAIL: legacy defects not rejected`, fail);
    process.exit(1);
  }

  const droppedReason = assertGuard({
    ...good,
    tab: good.tab.replace("input.reason", '"voided via UI"'),
  });
  if (!droppedReason.some((e) => e.includes("must pass user-supplied reason"))) {
    console.error(`[${LABEL}] --selftest FAIL: typed mutation dropping reason was not rejected`, droppedReason);
    process.exit(1);
  }

  const phantomCreate = assertGuard({
    ...good,
    createModal: good.createModal.replace("violation_type: input.draft.violation_type", "violation_code: input.draft.violation_type"),
  });
  if (!phantomCreate.some((e) => e.includes("must POST violation_type"))) {
    console.error(`[${LABEL}] --selftest FAIL: phantom create field was not rejected`, phantomCreate);
    process.exit(1);
  }

  console.log(`[${LABEL}] --selftest OK`);
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }

  const errors = assertGuard(Object.fromEntries(Object.entries(FILES).map(([key, file]) => [key, read(file)])));
  if (errors.length) {
    console.error(`[${LABEL}] FAILED:`);
    for (const error of errors) console.error(`  - ${error}`);
    process.exit(1);
  }
  console.log(`[${LABEL}] OK — HOS void reason + real create action locked`);
}

main();
