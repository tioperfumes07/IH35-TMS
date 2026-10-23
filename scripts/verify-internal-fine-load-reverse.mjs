#!/usr/bin/env node
/** @matrix-built {"modules":["safety"],"cols":["load","driver","connectivity","reverse_link","picker_law"],"leafRe":"^internal_fines\\.(list|create)$","task":"THEATER-INTERNAL-FINE-LOAD-LEAFRE","vertical":"column-wave"} */
/** @matrix-built {"modules":["dispatch"],"cols":["load","driver","connectivity","picker_law"],"leafRe":"^load\\.detail$","task":"THEATER-INTERNAL-FINE-LOAD-LEAFRE","vertical":"column-wave"} */
import fs from "node:fs";
import { multiSelectFilterProblems, selftestMultiSelectFilterContract } from './lib/entity-multiselect-filter-contract.mjs';
const L = "verify-internal-fine-load-reverse",
  c = fs.readFileSync(
    "apps/frontend/src/pages/safety/InternalFinesPage.tsx",
    "utf8",
  ),
  r = fs.readFileSync("apps/backend/src/safety/safety-v5.routes.ts", "utf8"),
  a = fs.readFileSync("apps/frontend/src/api/safety.ts", "utf8"),
  v = fs.readFileSync(
    "apps/frontend/src/components/safety/LoadSafetyReverseSection.tsx",
    "utf8",
  );
function audit(w, x, y, z) {
  const f = [];
  if (
    !/kind="load"/.test(w) ||
    !/related_load_uuid = form\.related_load_uuid/.test(w) ||
    !/body\.related_load_uuid = form\.related_load_uuid/.test(w)
  )
    f.push("canonical load picker payload");
  if (
    !/related_load_uuid: z\.string\(\)\.uuid\(\)\.optional/.test(x) ||
    !/body\.data\.related_load_uuid \?\? null/.test(x)
  )
    f.push("validated writer");
  if (
    !/load_id: entityIdFilterSchema\.optional/.test(x) ||
    !x.includes('f.related_load_id = ANY($${values.length}::uuid[])') ||
    !x.includes('values.push(entityIdFilterValues(query.data.load_id))') ||
    !x.includes('f.operating_company_id = $1::uuid')
  )
    f.push("exact scoped reverse");
  if (
    !/getInternalFines\(companyId: string, params: \{ driver_id\?: string; load_id\?: string; limit\?: number; offset\?: number \}/.test(
      y,
    ) ||
    !/params\.load_id/.test(y)
  )
    f.push("typed API filter");
  if (
    !/getInternalFines\(operatingCompanyId, \{[\s\S]{0,160}load_id: loadId,[\s\S]{0,120}limit: internalFinePageSize,[\s\S]{0,120}offset: \(internalFinePage - 1\) \* internalFinePageSize/.test(
      z,
    )
  )
    f.push("load reverse");
  if (
    !/load-safety-reverse-internal-fines/.test(z) ||
    !/kind="internal_fine"/.test(z) ||
    !/kind="driver"/.test(z)
  )
    f.push("load drawer drills");
  if (!/kind="internal_fines_load"/.test(z))
    f.push("load drawer Open Internal Fines filtered queue");
  if (
    !/searchParams\.get\("load_id"\)/.test(w) ||
    !/load_id: effectiveLoadId/.test(w)
  )
    f.push("internal fines list must honor load_id Open-queue URL filter");
  if (
    ['driver','load'].some(kind => multiSelectFilterProblems(w, {file: 'apps/frontend/src/pages/safety/InternalFinesPage.tsx', kind, testId: `internal-fines-filter-${kind}`}).length) ||
    !/setSearchParams/.test(w)
  )
    f.push("list reverse EntityPicker filters");
  if (
    !/internalFinesQ\.isError/.test(z) ||
    !/No internal fines linked to this load/.test(z)
  )
    f.push("honest states");
  return f;
}
if (process.argv.includes("--selftest")) {
  if (audit(c,r,a,v).length) throw new Error(audit(c,r,a,v).join('; '));
  const shared = selftestMultiSelectFilterContract();
  const m = [
    ...['values.push(entityIdFilterValues(query.data.load_id))', 'f.operating_company_id = $1::uuid'].map(token => [token, c, r.replaceAll(token,'REMOVED'), a, v]),
    ["picker", c.replaceAll('kind="load"', 'kind="driver"'), r, a, v],
    [
      "payload",
      c.replaceAll(
        "body.related_load_uuid = form.related_load_uuid",
        "body.related_load_uuid = ''",
      ),
      r,
      a,
      v,
    ],
    [
      "writer",
      c,
      r.replaceAll("body.data.related_load_uuid ?? null", "null"),
      a,
      v,
    ],
    [
      "schema",
      c,
      r.replaceAll(
        "load_id: entityIdFilterSchema.optional()",
        "wrong_id: z.string()",
      ),
      a,
      v,
    ],
    [
      "sql",
      c,
      r.replace("f.related_load_id = ANY($${values.length}::uuid[])", "TRUE"),
      a,
      v,
    ],
    ["api", c, r, a.replaceAll("load_id?: string", "wrong_id?: string"), v],
    ["reverse", c, r, a, v.replaceAll("load_id: loadId", "load_id: ''")],
    [
      "section",
      c,
      r,
      a,
      v.replaceAll("load-safety-reverse-internal-fines", "missing"),
    ],
    [
      "open queue",
      c,
      r,
      a,
      v.replaceAll('kind="internal_fines_load"', 'kind="internal_fine"'),
    ],
    [
      "url filter",
      c
        .replaceAll("loadIdFromUrl", "missingLoadFromUrl")
        .replaceAll("effectiveLoadId", "missingEffectiveLoad"),
      r,
      a,
      v,
    ],
    [
      "list-filter",
      c.replaceAll('dataTestId="internal-fines-filter-load"', 'dataTestId="x"'),
      r,
      a,
      v,
    ],
    ["list-url", c.replaceAll("setSearchParams", "setUrlParams"), r, a, v],
    ["error", c, r, a, v.replaceAll("internalFinesQ.isError", "false")],
    [
      "empty",
      c,
      r,
      a,
      v.replace("No internal fines linked to this load", "No rows"),
    ],
  ];
  for (const [n, w, x, y, z] of m)
    if (!audit(w, x, y, z).length) {
      console.error(`${L} SELFTEST FAIL — ${n}`);
      process.exit(1);
    }
  console.log(`${L} SELFTEST PASS — ${m.length} mutations detected + ${shared} shared plants`);
  process.exit(0);
}
const f = audit(c, r, a, v);
if (f.length) {
  console.error(`${L} FAIL\n- ${f.join("\n- ")}`);
  process.exit(1);
}
console.log(
  `${L} PASS — internal-fine load picker/FK→exact reverse→load drawer→fine/driver drills + list filters`,
);
