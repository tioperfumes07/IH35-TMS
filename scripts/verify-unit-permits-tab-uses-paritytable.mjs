#!/usr/bin/env node
/**
 * verify-unit-permits-tab-uses-paritytable — qbo-parity-a1 (UnitPermitsTab surface)
 *
 * Unit detail Permits tab must use shared ParityTable grammar (sort/resize/gear),
 * not a hand-rolled <table>. Columns Type / State / Number / Expires / Cost preserved
 * 1:1; CertExpiryBadge + Archive action + ListErrorState retained; unit-permits-tab
 * testid preserved. Archive mutations must snapshot unit/company scope and ignore
 * callbacks after the profile scope changes.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-unit-permits-tab-uses-paritytable";
const PAGE = "apps/frontend/src/pages/units/UnitPermitsTab.tsx";

const REQUIRED_LABELS = ["Type", "State", "Number", "Expires", "Cost"];

function assertMigrated(src) {
  const errors = [];
  if (
    !src.includes('from "../../components/parity/ParityTable"') &&
    !src.includes("from '../../components/parity/ParityTable'")
  ) {
    errors.push(`${PAGE}: must import ParityTable from components/parity/ParityTable`);
  }
  if ((src.match(/<ParityTable\b/g) ?? []).length < 1) {
    errors.push(`${PAGE}: expected ≥1 <ParityTable>`);
  }
  if (/<table[\s>]/.test(src)) {
    errors.push(`${PAGE}: must not contain hand-rolled <table>`);
  }
  if (/<thead[\s>]/.test(src)) {
    errors.push(`${PAGE}: must not contain hand-rolled <thead>`);
  }
  for (const label of REQUIRED_LABELS) {
    if (!src.includes(`label: "${label}"`)) {
      errors.push(`${PAGE}: missing column label: "${label}"`);
    }
  }
  if (!src.includes('storageKey="unit-permits"')) {
    errors.push(`${PAGE}: must set storageKey="unit-permits"`);
  }
  if (!src.includes('data-testid="unit-permits-tab"')) {
    errors.push(`${PAGE}: must preserve data-testid="unit-permits-tab"`);
  }
  if (!src.includes('tableTestId="unit-permits-table"')) {
    errors.push(`${PAGE}: must set tableTestId="unit-permits-table"`);
  }
  if (!src.includes("No active permits on file for this unit.")) {
    errors.push(`${PAGE}: must keep emptyText for empty permits`);
  }
  if (!src.includes("CertExpiryBadge")) {
    errors.push(`${PAGE}: must keep CertExpiryBadge on expiration column`);
  }
  if (!src.includes("Archive")) {
    errors.push(`${PAGE}: must keep Archive action`);
  }
  if (!src.includes("ListErrorState")) {
    errors.push(`${PAGE}: must keep ListErrorState on query failure`);
  }
  if (!src.includes("/api/units/")) {
    errors.push(`${PAGE}: must keep permits API call`);
  }
  for (const field of ["permitUuid", "unitId", "companyId", "generation"]) {
    if (!src.includes(`${field}:`)) {
      errors.push(`${PAGE}: archive mutation must snapshot ${field}`);
    }
  }
  if (!src.includes("`/api/units/${input.unitId}/permits/${input.permitUuid}?operating_company_id=${encodeURIComponent(input.companyId)}`")) {
    errors.push(`${PAGE}: archive API must use the initiating unit/company snapshot`);
  }
  if ((src.match(/input\.generation !== scopeGenerationRef\.current/g) ?? []).length < 2) {
    errors.push(`${PAGE}: archive success and error callbacks must reject stale scope generations`);
  }
  if (!src.includes('queryKey: ["unit-permits", input.unitId, input.companyId]')) {
    errors.push(`${PAGE}: archive success must invalidate the initiating unit/company cache`);
  }
  if (!src.includes("exact: true")) {
    errors.push(`${PAGE}: archive success invalidation must be exact`);
  }
  return errors;
}

function selftest() {
  const good = `
    import { ListErrorState } from "../../components/ListErrorState";
    import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
    import { CertExpiryBadge } from "../../components/safety/CertExpiryBadge";
    const scopeGenerationRef = { current: 1 };
    const input = { permitUuid: "permit", unitId: "unit", companyId: "company", generation: 1 };
    apiRequest(\`/api/units/\${input.unitId}/permits/\${input.permitUuid}?operating_company_id=\${encodeURIComponent(input.companyId)}\`);
    if (input.generation !== scopeGenerationRef.current) return;
    if (input.generation !== scopeGenerationRef.current) return;
    queryClient.invalidateQueries({ queryKey: ["unit-permits", input.unitId, input.companyId], exact: true });
    deleteMutation.mutate({ permitUuid: "permit", unitId: "unit", companyId: "company", generation: 1 });
    const COLUMNS = [
      { key: "permit_type", label: "Type" },
      { key: "issuing_state", label: "State" },
      { key: "permit_number", label: "Number" },
      { key: "expiration_date", label: "Expires" },
      { key: "cost", label: "Cost" },
    ];
    function Tab() {
      return (
        <section data-testid="unit-permits-tab">
          <ListErrorState title="x" status={0} onRetry={() => {}} />
          <CertExpiryBadge label="Expiry" expiresAt="2026-01-01" />
          <ParityTable
            storageKey="unit-permits"
            tableTestId="unit-permits-table"
            emptyText="No active permits on file for this unit."
            columns={COLUMNS}
          />
          <Button>Archive</Button>
          apiRequest("/api/units/");
        </section>
      );
    }
  `;
  const bad = `
    export function UnitPermitsTab() {
      return (
        <section data-testid="unit-permits-tab">
          <table><thead><tr><th>Type</th></tr></thead></table>
        </section>
      );
    }
  `;
  const goodErrors = assertMigrated(good);
  const badErrors = assertMigrated(bad);
  if (goodErrors.length) {
    console.error(`${LABEL} --selftest FAIL good fixture:`, goodErrors);
    process.exit(1);
  }
  if (badErrors.length < 3) {
    console.error(`${LABEL} --selftest FAIL bad fixture should fail hard:`, badErrors);
    process.exit(1);
  }
  const staleScope = good.replace(
    /input\.generation !== scopeGenerationRef\.current/g,
    "input.generation !== input.generation"
  );
  if (!assertMigrated(staleScope).some((error) => error.includes("stale scope generations"))) {
    console.error(`${LABEL} --selftest FAIL stale-scope mutation survived`);
    process.exit(1);
  }
  const mutableApiScope = good.replace("${input.unitId}", "${unitId}");
  if (!assertMigrated(mutableApiScope).some((error) => error.includes("initiating unit/company snapshot"))) {
    console.error(`${LABEL} --selftest FAIL mutable API scope mutation survived`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS`);
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }
  const src = fs.readFileSync(path.join(ROOT, PAGE), "utf8");
  const errors = assertMigrated(src);
  if (errors.length) {
    console.error(`${LABEL} FAIL:`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log(`${LABEL} PASS`);
}

main();
