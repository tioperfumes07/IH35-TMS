#!/usr/bin/env node
/** @matrix-built {"modules":["fleet"],"cols":["trailer","connectivity","qbo_chrome","reverse_link"],"leaves":["home.create_trailer","fleet.modal.create_trailer"],"task":"CLASS-F6521-CREATE-TRAILER-KIND-LIFECYCLE","vertical":"class-sweep"} */
import fs from "node:fs";

const file = "apps/frontend/src/components/fleet/CreateTrailerModal.tsx";
const source = fs.readFileSync(file, "utf8");

function failures(input = source) {
  return [
    ["initial draft derives exact picker kind", /equipment_type: equipmentKind === "chassis" \? "Chassis" as const : "DryVan" as const/.test(input)],
    ["kind participates in complete draft reset", /\[equipmentKind, operatingCompanyId\]\s*\);/.test(input) && /if \(open\) setDraft\(initialDraft\);/.test(input)],
    ["no partial type-only kind mutation", !/setDraft\(\(current\) => \(\{\s*\.\.\.current,\s*equipment_type: equipmentKind/.test(input)],
    ["drawer title matches creator kind", input.includes('title={equipmentKind === "chassis" ? "Create Chassis" : "Create Trailer"}')],
    ["canonical equipment writer remains", input.includes("return createEquipment({") && input.includes("equipment_type: input.draft.equipment_type")],
  ].filter(([, ok]) => !ok).map(([name]) => name);
}

if (process.argv.includes("--selftest")) {
  const staleKind = source.replace("[equipmentKind, operatingCompanyId]", "[operatingCompanyId]");
  const wrongDefault = source.replace('equipmentKind === "chassis" ? "Chassis" as const : "DryVan" as const', '"DryVan" as const');
  const wrongTitle = source.replace('title={equipmentKind === "chassis" ? "Create Chassis" : "Create Trailer"}', 'title="Create Trailer"');
  const checks = [
    failures(staleKind).includes("kind participates in complete draft reset"),
    failures(wrongDefault).includes("initial draft derives exact picker kind"),
    failures(wrongTitle).includes("drawer title matches creator kind"),
  ];
  if (checks.some((ok) => !ok)) process.exit(1);
  console.log("verify-create-trailer-kind-lifecycle selftest PASS — 3/3 stale-kind/chrome mutations red");
  process.exit(0);
}

const missing = failures();
if (missing.length) {
  console.error(`verify-create-trailer-kind-lifecycle FAIL — ${missing.join(", ")}`);
  process.exit(1);
}
console.log("verify-create-trailer-kind-lifecycle PASS — trailer/chassis creators reset complete kind-scoped drafts");
