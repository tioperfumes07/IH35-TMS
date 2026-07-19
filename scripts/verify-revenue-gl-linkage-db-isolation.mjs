#!/usr/bin/env node
/**
 * verify-revenue-gl-linkage-db-isolation
 *
 * ROOT CAUSE: revenue-gl-linkage.db.test.ts used getOperatingCompanyId() (shared TRANSP).
 * Parallel CI forks seeded Income credits under the same company/date window → flake
 * expected 28500 received 368500 on "reversed + posted compensating same-day nets zero".
 *
 * FIX: suite MUST use createIsolatedOperatingCompany() and MUST NOT call getOperatingCompanyId().
 * Rule 17: verify-step only (no package.json / workflow thrash). Self-test: --selftest.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TARGET = path.join(ROOT, "apps/backend/src/home/__tests__/revenue-gl-linkage.db.test.ts");
const LABEL = "verify:revenue-gl-linkage-db-isolation";

export function collectFailures(src) {
  const failures = [];
  if (!/createIsolatedOperatingCompany/.test(src)) {
    failures.push("revenue-gl-linkage.db.test.ts must call createIsolatedOperatingCompany()");
  }
  if (/\bgetOperatingCompanyId\s*\(/.test(src)) {
    failures.push("revenue-gl-linkage.db.test.ts must not use getOperatingCompanyId() (shared TRANSP race)");
  }
  if (!/deactivateIsolatedOperatingCompany/.test(src)) {
    failures.push("revenue-gl-linkage.db.test.ts must teardown via deactivateIsolatedOperatingCompany");
  }
  return failures;
}

function selftest() {
  const good = `
    import { createIsolatedOperatingCompany, deactivateIsolatedOperatingCompany } from "...";
    const isolated = await createIsolatedOperatingCompany({ codePrefix: "RGL" });
    await deactivateIsolatedOperatingCompany(db, isolated);
  `;
  if (collectFailures(good).length) {
    console.error(`${LABEL} SELFTEST FAIL — good fixture rejected`);
    process.exit(1);
  }
  const plants = [
    {
      name: "missing isolation helper",
      src: "companyId = 'x'; await deactivateIsolatedOperatingCompany(db, x);",
      expect: (f) => f.some((x) => /createIsolatedOperatingCompany/i.test(x)),
    },
    {
      name: "shared TRANSP getOperatingCompanyId",
      src: `
        import { createIsolatedOperatingCompany, deactivateIsolatedOperatingCompany } from "x";
        companyId = getOperatingCompanyId();
        await createIsolatedOperatingCompany({});
        await deactivateIsolatedOperatingCompany(db, isolated);
      `,
      expect: (f) => f.some((x) => /getOperatingCompanyId|TRANSP/i.test(x)),
    },
    {
      name: "missing deactivate teardown",
      src: `
        import { createIsolatedOperatingCompany } from "x";
        await createIsolatedOperatingCompany({});
      `,
      expect: (f) => f.some((x) => /deactivateIsolatedOperatingCompany/i.test(x)),
    },
  ];
  for (const p of plants) {
    const failures = collectFailures(p.src);
    if (!p.expect(failures)) {
      console.error(`${LABEL} SELFTEST FAIL — plant "${p.name}" not detected`, failures);
      process.exit(1);
    }
  }
  console.log(`${LABEL} SELFTEST PASS (${plants.length} plants)`);
}

function main() {
  if (!fs.existsSync(TARGET)) {
    console.error(`${LABEL} FAIL: missing ${TARGET}`);
    process.exit(1);
  }
  const failures = collectFailures(fs.readFileSync(TARGET, "utf8"));
  if (failures.length) {
    console.error(`${LABEL} FAIL:`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL} OK — revenue-gl-linkage.db.test.ts uses isolated companies`);
}

const isMain = path.resolve(process.argv[1] ?? "") === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  if (process.argv.includes("--selftest")) selftest();
  else main();
}
