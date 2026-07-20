#!/usr/bin/env node
/**
 * 0441-mod6-hos-create-violation-mislabeled-link guard.
 *
 * Locks Safety HOS dashboard create control:
 *  - Primary CTA is a button that opens HosViolationCreateModal (not a dead nav Link)
 *  - Label follows repo "+ Create" law (not "+ Create violation" masquerading as navigation)
 *  - ELD violations tab defers create/void to Safety with honest copy
 *
 * Self-test: node scripts/verify-hos-create-violation-link.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-hos-create-violation-link";

const FILES = {
  dashboard: "apps/frontend/src/pages/safety/HoursOfServicePage.tsx",
  createModal: "apps/frontend/src/pages/safety/components/HosViolationCreateModal.tsx",
  eldViolations: "apps/frontend/src/pages/eld/tabs/ViolationsTab.tsx",
};

function stripComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

export function assertGuard(sources) {
  const errors = [];
  const dashboard = stripComments(sources.dashboard);
  const createModal = stripComments(sources.createModal);
  const eldViolations = stripComments(sources.eldViolations);

  if (/data-testid="safety-hos-create-violation-link"/.test(dashboard)) {
    errors.push(`${FILES.dashboard}: must not use dead Link test id safety-hos-create-violation-link`);
  }
  if (/<Link[^>]*data-testid="safety-hos-create-violation"/.test(dashboard)) {
    errors.push(`${FILES.dashboard}: safety-hos-create-violation must not be a Link (opens modal via button)`);
  }
  if (/to="\/safety\/hos-violations"[\s\S]{0,240}\+\s*Create violation/i.test(dashboard)) {
    errors.push(`${FILES.dashboard}: must not label a nav Link "+ Create violation" to /safety/hos-violations`);
  }
  if (!/data-testid="safety-hos-create-violation"/.test(dashboard)) {
    errors.push(`${FILES.dashboard}: primary create control must use data-testid safety-hos-create-violation`);
  }
  if (!/<button[\s\S]{0,500}data-testid="safety-hos-create-violation"/.test(dashboard)) {
    errors.push(`${FILES.dashboard}: safety-hos-create-violation must be a <button type="button">`);
  }
  if (!/setCreateOpen\(true\)/.test(dashboard)) {
    errors.push(`${FILES.dashboard}: create button must open modal state (setCreateOpen(true))`);
  }
  if (!/HosViolationCreateModal/.test(dashboard)) {
    errors.push(`${FILES.dashboard}: must render HosViolationCreateModal for in-place create`);
  }
  if (/>\s*\+\s*Create violation\s*</i.test(dashboard)) {
    errors.push(`${FILES.dashboard}: primary CTA label must be "+ Create" (repo button law), not "+ Create violation"`);
  }
  if (!/>\s*\+\s*Create\s*</.test(dashboard)) {
    errors.push(`${FILES.dashboard}: primary CTA must display "+ Create"`);
  }

  if (!/createHosViolation\(/.test(createModal)) {
    errors.push(`${FILES.createModal}: modal must call createHosViolation`);
  }
  if (!/data-testid="hos-violation-create-modal"/.test(createModal)) {
    errors.push(`${FILES.createModal}: modal must expose data-testid hos-violation-create-modal`);
  }

  if (!/to="\/safety\/hos-violations"/.test(eldViolations)) {
    errors.push(`${FILES.eldViolations}: ELD tab must link to Safety violations for create/void`);
  }
  if (/\+\s*Create violation/i.test(eldViolations)) {
    errors.push(`${FILES.eldViolations}: ELD tab must not mislabel nav as "+ Create violation"`);
  }
  if (!/Open Safety violations/.test(eldViolations)) {
    errors.push(`${FILES.eldViolations}: ELD handoff link must say "Open Safety violations"`);
  }

  return errors;
}

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

function selftest() {
  const good = {
    dashboard: `
      <button type="button" data-testid="safety-hos-create-violation" aria-label="Create HOS violation" onClick={() => setCreateOpen(true)}>+ Create</button>
      <HosViolationCreateModal open={createOpen} />
      Log new HOS violations with <span>+ Create</span> above
      <Link to="/safety/hos-violations">Open violations tab</Link>
    `,
    createModal: `
      createHosViolation(operatingCompanyId, { driver_id: form.driver_id });
      data-testid="hos-violation-create-modal"
    `,
    eldViolations: `
      <Link to="/safety/hos-violations">Open Safety violations</Link>
    `,
  };
  const pass = assertGuard(good);
  if (pass.length) {
    console.error(`[${LABEL}] --selftest FAIL: good fixture produced errors`, pass);
    process.exit(1);
  }

  const legacy = {
    ...good,
    dashboard: `<Link to="/safety/hos-violations" data-testid="safety-hos-create-violation-link">+ Create violation</Link>`,
  };
  const fail = assertGuard(legacy);
  if (!fail.some((e) => e.includes("safety-hos-create-violation-link"))) {
    console.error(`[${LABEL}] --selftest FAIL: legacy dead Link not rejected`, fail);
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
  console.log(`[${LABEL}] OK — HOS create control is modal button, not mislabeled nav Link`);
}

main();
