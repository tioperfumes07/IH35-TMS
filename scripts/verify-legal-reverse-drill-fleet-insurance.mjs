#!/usr/bin/env node
/** @matrix-built {"modules":["legal"],"cols":["driver","unit","connectivity","reverse_link"],"leafRe":"^matters\\.","task":"P34","pr":"#5840"} */
/**
 * verify-legal-reverse-drill-fleet-insurance.mjs
 *
 * 0441-mod12-legal-no-reverse-drill-through (fleet + insurance + driver half):
 *  1. VehicleProfilePage mounts LegalMattersReverseSection / unit_id filter
 *  2. ClaimsTab mounts insurance_claim_id and LawsuitsTab mounts insurance_lawsuit_id reverse sections
 *  3. DriverProfilePage mounts LegalMattersReverseSection / related_driver_id filter
 *     (P34/WIRING-PLAN-50 — this side of the double-linkage had real, working code on
 *     origin/main but no guard asserted it, so a future edit could silently drop the
 *     mount and nothing would fail red. Same class of gap the other three sides already
 *     had a guard for.)
 *  4. legalMattersApi.list accepts unit_id + insurance_claim_id + related_driver_id
 *  5. Backend listMatters filters those columns
 *  6. Owner/Administrator gate present on the shared reverse section
 *
 * Static invariants (no DB, no network).
 *
 * Usage:
 *   node scripts/verify-legal-reverse-drill-fleet-insurance.mjs
 *   node scripts/verify-legal-reverse-drill-fleet-insurance.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-legal-reverse-drill-fleet-insurance";

const FILES = {
  vehicle: "apps/frontend/src/pages/fleet/VehicleProfilePage.tsx",
  claims: "apps/frontend/src/pages/insurance/ClaimsTab.tsx",
  lawsuits: "apps/frontend/src/pages/insurance/LawsuitsTab.tsx",
  driver: "apps/frontend/src/pages/drivers/DriverProfilePage.tsx",
  section: "apps/frontend/src/components/legal/LegalMattersReverseSection.tsx",
  api: "apps/frontend/src/api/legal-matters.ts",
  routes: "apps/backend/src/legal/matters.routes.ts",
  service: "apps/backend/src/legal/matters.service.ts",
};

/** Pure checks — takes texts so --selftest can inject fixtures. */
export function check(texts) {
  const f = [];

  if (!texts.vehicle) f.push(`${FILES.vehicle}: missing`);
  else {
    if (!/LegalMattersReverseSection/.test(texts.vehicle)) {
      f.push(`${FILES.vehicle}: must mount LegalMattersReverseSection`);
    }
    if (!/unit_id/.test(texts.vehicle)) {
      f.push(`${FILES.vehicle}: must filter legal matters by unit_id`);
    }
  }

  if (!texts.claims) f.push(`${FILES.claims}: missing`);
  else {
    if (!/LegalMattersReverseSection/.test(texts.claims)) {
      f.push(`${FILES.claims}: must mount LegalMattersReverseSection`);
    }
    if (!/insurance_claim_id/.test(texts.claims)) {
      f.push(`${FILES.claims}: must filter by insurance_claim_id`);
    }
  }

  if (!texts.lawsuits) f.push(`${FILES.lawsuits}: missing`);
  else {
    if (!/LegalMattersReverseSection/.test(texts.lawsuits)) {
      f.push(`${FILES.lawsuits}: must mount LegalMattersReverseSection`);
    }
    if (!/insurance_lawsuit_id/.test(texts.lawsuits)) {
      f.push(`${FILES.lawsuits}: must filter by insurance_lawsuit_id`);
    }
  }

  if (!texts.driver) f.push(`${FILES.driver}: missing`);
  else {
    if (!/LegalMattersReverseSection/.test(texts.driver)) {
      f.push(`${FILES.driver}: must mount LegalMattersReverseSection`);
    }
    if (!/related_driver_id/.test(texts.driver)) {
      f.push(`${FILES.driver}: must filter legal matters by related_driver_id`);
    }
  }

  if (!texts.section) f.push(`${FILES.section}: missing`);
  else {
    if (!/Owner/.test(texts.section) || !/Administrator/.test(texts.section)) {
      f.push(`${FILES.section}: must Owner/Administrator-gate like DriverDetail`);
    }
    if (!/legalMattersApi\.list/.test(texts.section)) {
      f.push(`${FILES.section}: must query legalMattersApi.list`);
    }
    if (!/kind\s*=\s*["']matter["']/.test(texts.section) || !/EntityLinkOrTombstone/.test(texts.section) || !/legal-matters-reverse-matter-link/.test(texts.section)) {
      f.push(`${FILES.section}: must EntityLinkOrTombstone kind="matter" with legal-matters-reverse-matter-link`);
    }
  }

  if (!texts.api) f.push(`${FILES.api}: missing`);
  else {
    if (!/unit_id/.test(texts.api) || !/insurance_claim_id/.test(texts.api)) {
      f.push(`${FILES.api}: list() must accept unit_id and insurance_claim_id`);
    }
    if (!/related_driver_id/.test(texts.api)) {
      f.push(`${FILES.api}: list() must accept related_driver_id`);
    }
  }

  if (!texts.routes) f.push(`${FILES.routes}: missing`);
  else {
    if (!/unit_id:\s*z\.string\(\)\.uuid\(\)\.optional\(\)/.test(texts.routes)) {
      f.push(`${FILES.routes}: listQuerySchema must accept unit_id`);
    }
    if (!/insurance_claim_id:\s*z\.string\(\)\.uuid\(\)\.optional\(\)/.test(texts.routes)) {
      f.push(`${FILES.routes}: listQuerySchema must accept insurance_claim_id`);
    }
    if (!/related_driver_id:\s*z\.string\(\)\.uuid\(\)\.optional\(\)/.test(texts.routes)) {
      f.push(`${FILES.routes}: listQuerySchema must accept related_driver_id`);
    }
  }

  if (!texts.service) f.push(`${FILES.service}: missing`);
  else {
    if (!/m\.unit_id\s*=/.test(texts.service)) {
      f.push(`${FILES.service}: listMatters must filter m.unit_id`);
    }
    if (!/m\.insurance_claim_id\s*=/.test(texts.service)) {
      f.push(`${FILES.service}: listMatters must filter m.insurance_claim_id`);
    }
    if (!/m\.related_driver_id\s*=/.test(texts.service)) {
      f.push(`${FILES.service}: listMatters must filter m.related_driver_id`);
    }
  }

  return f;
}

export function run() {
  const read = (rel) => {
    try {
      return fs.readFileSync(path.join(ROOT, rel), "utf8");
    } catch {
      return null;
    }
  };
  return check({
    vehicle: read(FILES.vehicle),
    claims: read(FILES.claims),
    lawsuits: read(FILES.lawsuits),
    driver: read(FILES.driver),
    section: read(FILES.section),
    api: read(FILES.api),
    routes: read(FILES.routes),
    service: read(FILES.service),
  });
}

function main() {
  const failures = run();
  if (failures.length) {
    console.error(`${LABEL}: FAIL`);
    for (const line of failures) console.error(`  - ${line}`);
    process.exit(1);
  }
  console.log(`${LABEL}: PASS`);
}

function selftest() {
  const good = {
    vehicle: `import { LegalMattersReverseSection } from "...";\nfilter={{ unit_id: id }}`,
    claims: `LegalMattersReverseSection\ninsurance_claim_id`,
    lawsuits: `LegalMattersReverseSection\ninsurance_lawsuit_id`,
    driver: `import { LegalMattersReverseSection } from "...";\nfilter={{ related_driver_id: id }}`,
    section: `Owner Administrator legalMattersApi.list\n<EntityLinkOrTombstone kind="matter" id={id} data-testid="legal-matters-reverse-matter-link" />`,
    api: `unit_id insurance_claim_id related_driver_id`,
    routes: `unit_id: z.string().uuid().optional(),\ninsurance_claim_id: z.string().uuid().optional(),\nrelated_driver_id: z.string().uuid().optional(),`,
    service: `m.unit_id = $n\nm.insurance_claim_id = $n\nm.related_driver_id = $n`,
  };
  const bad = {
    vehicle: "export function VehicleProfilePage(){return null}",
    claims: "export function ClaimsTab(){return null}",
    lawsuits: "export function LawsuitsTab(){return null}",
    driver: "export function DriverProfilePage(){return null}",
    section: "export function X(){return null}",
    api: "list() {}",
    routes: "const listQuerySchema = z.object({})",
    service: "export async function listMatters() {}",
  };
  if (check(good).length) throw new Error(`${LABEL}: selftest good fixture failed: ${check(good).join("; ")}`);
  if (!check(bad).length) throw new Error(`${LABEL}: selftest expected planted miss`);
  console.log(`${LABEL}: selftest PASS`);
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  main();
}
