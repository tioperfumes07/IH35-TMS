#!/usr/bin/env node
/**
 * DISP-F6445 — LINK-F5171 group (b): `mdata.customer_quality_events.related_load_id` has always
 * been in the API contract (backend accepts+validates it on POST, the type carries it, the
 * FORWARD direction already rendered it as an EntityLink from Customer Detail's Quality & History
 * tab) but two things were missing: (1) `LoadDetailDrawer` had no REVERSE section at all -- a load
 * involved in a quality event showed nothing about it; (2) the Create Quality Event form never had
 * a field to actually SET `related_load_id` -- the FK existed everywhere except where a user could
 * populate it, so the forward link (and therefore anything that would exercise the new reverse
 * section) could never be created through the UI at all.
 *
 * This guard ratchets both halves: the reverse-read section (reuses the EXISTING customer-scoped
 * quality-events query, no new backend route) and the create-form write path (form state, mutation
 * payload, and the picker field itself).
 *
 * Self-test: node scripts/verify-load-quality-events-reverse-link.mjs --selftest
 */
import fs from "node:fs";

const LABEL = "verify-load-quality-events-reverse-link";
const F = {
  section: "apps/frontend/src/components/dispatch/LoadQualityEventsReverseSection.tsx",
  drawer: "apps/frontend/src/components/dispatch/LoadDetailDrawer.tsx",
  detail: "apps/frontend/src/pages/CustomerDetail.tsx",
  api: "apps/frontend/src/api/mdata.ts",
};

const CHECKS = [
  { name: "reverse section reuses the existing customer-scoped quality-events query (no new backend route)", file: F.section, pattern: /listCustomerQualityEvents\(customerId, operatingCompanyId\)/ },
  { name: "reverse section filters to exactly this load's id", file: F.section, pattern: /\(query\.data \?\? \[\]\)\.filter\(\(event\) => event\.related_load_id === loadId\)/ },
  { name: "reverse section hides cached rows on failure", file: F.section, pattern: /const rows: CustomerQualityEvent\[\] = query\.isError\s*\n\s*\? \[\]/ },
  { name: "reverse section failure retries the exact query", file: F.section, pattern: /<ListErrorState[\s\S]{0,180}onRetry=\{\(\) => void query\.refetch\(\)\}/ },
  { name: "reverse section marker", file: F.section, pattern: /data-testid="load-reverse-quality-events"/ },
  { name: "reverse section renders a legitimate zero-dollar impact", file: F.section, pattern: /event\.dollar_impact_amount != null \? \(/ },
  { name: "load drawer imports the reverse section", file: F.drawer, pattern: /import \{ LoadQualityEventsReverseSection \}/ },
  { name: "load drawer mounts the reverse section bound to the load's own customer_id", file: F.drawer, pattern: /<LoadQualityEventsReverseSection\s+operatingCompanyId=\{load\.operating_company_id\}\s+customerId=\{load\.customer_id\}\s+loadId=\{load\.id\}/ },
  { name: "customer-loads query also fires while the Create Quality Event modal is open (feeds the picker)", file: F.detail, pattern: /enabled: Boolean\(id && operatingCompanyId && \(activeTab === "Loads" \|\| qualityModalOpen\)\)/ },
  { name: "quality form state carries related_load_id", file: F.detail, pattern: /const \[qualityForm, setQualityForm\] = useState\(\{[\s\S]{0,1000}related_load_id: "",/ },
  { name: "create mutation sends related_load_id to the backend", file: F.detail, pattern: /days_late: qualityForm\.days_late \? Number\(qualityForm\.days_late\) : undefined,\s*\n\s*related_load_id: qualityForm\.related_load_id \|\| undefined,/ },
  { name: "create form renders a Related Load picker sourced from this customer's own loads", file: F.detail, pattern: /options=\{customerLoads\.map\(\(load\) => \(\{ value: load\.id, label: load\.load_number \?\? load\.id \}\)\)\}\s*\n\s*value=\{qualityForm\.related_load_id \|\| null\}/ },
  { name: "customer detail renders a legitimate zero-dollar impact", file: F.detail, pattern: /event\.dollar_impact_amount != null \? <strong className="text-sm">/ },
  { name: "backend client type still accepts related_load_id (unchanged contract, not silently dropped)", file: F.api, pattern: /export function createCustomerQualityEvent\([\s\S]{0,500}related_load_id\?: string/ },
];

const stripComments = (text) =>
  text
    .replace(/\/\*[\s\S]*?\*\//g, (match) => match.replace(/[^\n]/g, " "))
    .replace(/\/\/[^\n]*/g, (match) => " ".repeat(match.length));

function readSources() {
  return Object.fromEntries(Object.values(F).map((file) => [file, stripComments(fs.readFileSync(file, "utf8"))]));
}

export function collectFailures(sources) {
  return CHECKS.filter(({ file, pattern }) => !pattern.test(sources[file])).map(({ name }) => name);
}

const sources = readSources();
if (process.argv.includes("--selftest")) {
  const baseline = collectFailures(sources);
  if (baseline.length) {
    console.error(`[${LABEL}] SELFTEST baseline FAIL:\n- ${baseline.join("\n- ")}`);
    process.exit(1);
  }
  const inert = [];
  for (const check of CHECKS) {
    const original = sources[check.file];
    const planted = original.replace(check.pattern, "/* planted DISP-F6445 quality-load reverse defect */");
    if (planted === original || !collectFailures({ ...sources, [check.file]: planted }).includes(check.name)) inert.push(check.name);
  }
  if (inert.length) {
    console.error(`[${LABEL}] SELFTEST FAIL: inert plants: ${inert.join(", ")}`);
    process.exit(1);
  }
  console.log(`[${LABEL}] --selftest PASS: rejected ${CHECKS.length}/${CHECKS.length} independent quality-event/load reverse plants`);
  process.exit(0);
}

const failures = collectFailures(sources);
if (failures.length) {
  console.error(`[${LABEL}] FAIL:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`[${LABEL}] PASS: ${CHECKS.length} exact quality-event↔load reverse-link obligations ratcheted (read + write)`);
