#!/usr/bin/env node
/**
 * verify-geofences-page-uses-paritytable — qbo-parity-a1 (GeofencesPage surface)
 *
 * Operations geofences list must use shared ParityTable grammar (sort/resize/gear),
 * not a hand-rolled <table>. Outages must surface ListErrorState (never bare loading-only
 * failure). Columns Label / Kind / Linked ref / Vertices / Status / Action preserved 1:1;
 * create form + toggleActive preserved.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-geofences-page-uses-paritytable";
const PAGE = "apps/frontend/src/pages/operations/GeofencesPage.tsx";

const REQUIRED_LABELS = ["Label", "Kind", "Linked ref", "Vertices", "Status", "Action"];

function assertMigrated(src) {
  const errors = [];
  if (
    !src.includes('from "../../components/parity/ParityTable"') &&
    !src.includes("ParityTable")
  ) {
    errors.push(`${PAGE}: must import ParityTable from components/parity/ParityTable`);
  }
  if (!src.includes("ListErrorState")) {
    errors.push(`${PAGE}: must render ListErrorState on load failure`);
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
  if (!src.includes('storageKey="operations-geofences"')) {
    errors.push(`${PAGE}: must set storageKey="operations-geofences"`);
  }
  if (!src.includes("No geofences configured yet. Use the form above to create one.")) {
    errors.push(`${PAGE}: must keep emptyText for empty geofences list`);
  }
  if (!src.includes("Couldn't load geofences")) {
    errors.push(`${PAGE}: must keep ListErrorState title for geofences outage`);
  }
  if (!src.includes("toggleActive")) {
    errors.push(`${PAGE}: must preserve toggleActive Activate/Deactivate wiring`);
  }
  if (!src.includes("Create geofence")) {
    errors.push(`${PAGE}: must preserve create geofence form chrome`);
  }
  return errors;
}

function selftest() {
  const good = `
    import { ListErrorState } from "../../components/ListErrorState";
    import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
    const geofenceColumns = [
      { key: "label", label: "Label" },
      { key: "location_kind", label: "Kind" },
      { key: "location_ref_id", label: "Linked ref" },
      { key: "vertices", label: "Vertices" },
      { key: "is_active", label: "Status" },
      { key: "action", label: "Action" },
    ];
    async function toggleActive() {}
    export function GeofencesPage() {
      return (
        <>
          <Button>Create geofence</Button>
          <ListErrorState title="Couldn't load geofences" status={0} onRetry={() => {}} />
          <ParityTable
            storageKey="operations-geofences"
            emptyText="No geofences configured yet. Use the form above to create one."
          />
        </>
      );
    }
  `;
  const bad = `
    export function GeofencesPage() {
      return (
        <div>
          <table><thead><tr><th>Label</th></tr></thead></table>
        </div>
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
    console.error(`FAIL ${LABEL}:`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log(`OK ${LABEL}: ${PAGE} uses ParityTable + ListErrorState; columns preserved.`);
}

main();
