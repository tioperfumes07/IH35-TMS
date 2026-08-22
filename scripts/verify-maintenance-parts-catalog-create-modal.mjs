#!/usr/bin/env node
/**
 * LISTS-PARTS-MASTER-CANONICAL-TABLE-MISSING / LISTS-F5967 — the CODEX HANDOFF board row claimed
 * mdata.maintenance_parts (and the schema/migration to create it) was missing. Live-verified
 * 2026-08-22 (Neon prod): the table exists with the exact shape the backend route already
 * expects (db/migrations/202606281030_maintenance_parts_catalog.sql), and the GET endpoint
 * returns real data live. The genuine remaining gap was narrower: no UI create surface existed
 * for the already-built POST /api/v1/catalogs/maintenance/parts-master route.
 *
 * This guard asserts the create modal exists, is wired to the existing useCreateMaintPart hook,
 * and is mounted from MaintenancePartsCatalog.tsx — closing catalog.maintenance.parts_catalog.
 * create:connectivity for real.
 */
import fs from "node:fs";

const LABEL = "verify-maintenance-parts-catalog-create-modal";
const F = {
  modal: "apps/frontend/src/pages/lists/CreateMaintPartModal.tsx",
  page: "apps/frontend/src/pages/lists/MaintenancePartsCatalog.tsx",
  hook: "apps/frontend/src/hooks/useMaintenancePartsCatalog.ts",
};
const checks = [
  ["hook", /export function useCreateMaintPart/, "the create mutation hook exists (was already built, unused)"],
  ["modal", /import \{ useCreateMaintPart \} from "\.\.\/\.\.\/hooks\/useMaintenancePartsCatalog";/, "modal imports the existing create hook, not a new one"],
  ["modal", /createMutation\.mutateAsync\(\{[\s\S]{0,400}operating_company_id: operatingCompanyId/, "modal actually calls the mutation with a real operating_company_id"],
  ["page", /import \{ CreateMaintPartModal \} from "\.\/CreateMaintPartModal";/, "page imports the create modal"],
  ["page", /<CreateMaintPartModal[\s\S]{0,200}onCreated=\{\(\) => void query\.refetch\(\)\}/, "page mounts the modal and refetches the list on create"],
];
const live = Object.fromEntries(Object.entries(F).map(([k, file]) => [k, fs.readFileSync(file, "utf8")]));
const audit = (src) => checks.filter(([k, re]) => !re.test(src[k])).map(([, , msg]) => msg);
const failures = audit(live);
if (failures.length) {
  console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
if (process.argv.includes("--selftest")) {
  for (const [k, re, msg] of checks) {
    const flags = re.flags.includes("g") ? re.flags : `${re.flags}g`;
    const planted = live[k].replace(new RegExp(re.source, flags), "/* planted LISTS-F5967 defect */");
    if (planted === live[k] || !audit({ ...live, [k]: planted }).includes(msg)) {
      console.error(`${LABEL} SELFTEST FAIL — plant escaped: ${msg}`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} SELFTEST PASS — ${checks.length}/${checks.length} regressions rejected`);
  process.exit(0);
}
console.log(`${LABEL} PASS — Maintenance Parts Catalog has a real Create surface wired to the existing hook/route`);
