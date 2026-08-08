#!/usr/bin/env node
/**
 * CLS-BOL-FIELD-COMPLETENESS — a generated Bill of Lading must carry the fields the law and the
 * commercial standard require, and a field that is on it today may never be dropped to make a check
 * pass. ADDITIVE-ONLY, enforced as a ratchet.
 *
 * THE LEGAL FLOOR — 49 CFR 373.101, for-hire non-exempt motor carrier, verbatim:
 *   (a) Names of consignor and consignee.
 *   (b) Origin and destination points.
 *   (c) Number of packages.
 *   (d) Description of freight.
 *   (e) Weight, volume, or measurement of freight (if applicable to the rating of the freight).
 *
 * THE COMMERCIAL STANDARD — the NMFTA Uniform Straight Bill of Lading / VICS BOL that McLeod and Alvys
 * both emit: shipper and consignee party blocks with full address, third-party bill-to, carrier name
 * with USDOT/MC, a BOL number distinct from the load number, ship date, a commodity table carrying
 * NMFC item + freight class + package type + piece count + weight, freight charge terms
 * (prepaid/collect/third party), declared value, special instructions, trailer and seal numbers, a
 * hazmat block, and signature lines for shipper, driver and consignee.
 *
 * HAZMAT — 49 CFR 172.202 / 172.203 / 172.604, when the load is hazmat: identification number, proper
 * shipping name, hazard class or division, packing group, number and type of packages in plain terms,
 * technical name in parentheses for "G" entries, `RQ` when reportable, and a 24-hour emergency
 * response telephone number.
 *
 * WHY A RATCHET AND NOT A HARD REQUIREMENT: most of the standard has no data model in this database
 * yet (prod-verified 2026-08-07 — `mdata.loads` has 98 columns and none matching
 * `shipper|consign|bill_to|terms|declared|nmfc|class|seal`). Failing the build on all of it would get
 * this guard disabled within a day. So the missing set is PINNED and may only SHRINK: implementing a
 * field lets you tighten the baseline; DROPPING a field that is on the document today fails
 * immediately, which is the half that protects the work already done.
 *
 * Usage: node scripts/verify-bol-field-completeness.mjs [--write-baseline] [--selftest]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const SERVICE = "apps/backend/src/dispatch/bol-generator.service.ts";
const TEMPLATE = "apps/backend/src/dispatch/pdf-template/bol.hbs";
const BASELINE_PATH = "scripts/bol-field-completeness-baseline.json";
const LABEL = "verify-bol-field-completeness";

/**
 * Every field the reference standard wants on the document, keyed by a stable id. `cfr` marks the
 * five that 49 CFR 373.101 REQUIRES — those are the legal floor, not parity nice-to-haves.
 */
export const REQUIRED_FIELDS = [
  { id: "consignor_name", cfr: "373.101(a)", why: "names of consignor and consignee" },
  { id: "consignee_name", cfr: "373.101(a)", why: "names of consignor and consignee" },
  { id: "origin_point", cfr: "373.101(b)", why: "origin and destination points" },
  { id: "destination_point", cfr: "373.101(b)", why: "origin and destination points" },
  { id: "package_count", cfr: "373.101(c)", why: "number of packages" },
  { id: "freight_description", cfr: "373.101(d)", why: "description of freight" },
  { id: "freight_weight", cfr: "373.101(e)", why: "weight, volume or measurement" },
  { id: "bol_number", why: "NMFTA uniform BOL — a BOL number distinct from the load number" },
  { id: "ship_date", why: "NMFTA uniform BOL — date of shipment, not the render timestamp" },
  { id: "carrier_name", why: "NMFTA uniform BOL — carrier party block" },
  { id: "carrier_address_full", why: "carrier block: street, city, state, ZIP — not line 1 alone" },
  { id: "carrier_usdot", why: "carrier identification McLeod/Alvys both print" },
  { id: "carrier_mc", why: "carrier identification McLeod/Alvys both print" },
  { id: "consignee_address_full", why: "consignee block: street, city, state, ZIP" },
  { id: "bill_to_party", why: "NMFTA uniform BOL — third-party bill-to" },
  { id: "freight_charge_terms", why: "prepaid / collect / third party" },
  { id: "declared_value", why: "excess valuation — carrier liability above the per-pound default" },
  { id: "nmfc_item", why: "NMFC item number" },
  { id: "freight_class", why: "NMFC freight class" },
  { id: "package_type", why: "plain-terms package type (pallets, drums, boxes)" },
  { id: "special_instructions", why: "mdata.loads.driver_instructions_text already exists" },
  { id: "trailer_number", why: "trailer identification" },
  { id: "seal_number", why: "seal identification" },
  { id: "hazmat_block", cfr: "172.202/172.203", why: "UN id, proper shipping name, hazard class, packing group" },
  { id: "hazmat_emergency_phone", cfr: "172.604", why: "24-hour emergency response telephone number" },
  { id: "signature_shipper", why: "signature line" },
  { id: "signature_carrier", why: "signature line" },
  { id: "signature_consignee", why: "signature line" },
];

/**
 * How each required field is DETECTED as present. Matched against the payload type and the template
 * together, because a field that exists in the type but is never rendered is not on the document —
 * and a placeholder in the template with nothing feeding it renders empty. Both must be true.
 */
export const DETECT = {
  consignor_name: /consignorName|shipperName/,
  consignee_name: /customerName|consigneeName/,
  origin_point: /stops/,
  destination_point: /stops/,
  package_count: /\bpieces\b/,
  freight_description: /\bcommodity\b/,
  freight_weight: /\bweight\b/,
  bol_number: /bolNumber/,
  ship_date: /shipDate/,
  carrier_name: /carrierName/,
  carrier_address_full: /carrierCityStateZip|carrierAddressFull/,
  carrier_usdot: /carrierUsdot/,
  carrier_mc: /carrierMc/,
  consignee_address_full: /customerCityStateZip|consigneeAddressFull/,
  bill_to_party: /billToName/,
  freight_charge_terms: /freightChargeTerms/,
  declared_value: /declaredValue/,
  nmfc_item: /nmfcItem/,
  freight_class: /freightClass/,
  package_type: /packageType/,
  special_instructions: /specialInstructions/,
  trailer_number: /trailerNumber/,
  seal_number: /sealNumber/,
  hazmat_block: /hazmat/i,
  hazmat_emergency_phone: /hazmatEmergencyPhone/,
  signature_shipper: /signatureShipper/,
  signature_carrier: /signatureCarrier/,
  signature_consignee: /signatureConsignee/,
};

/**
 * A field counts as ON THE DOCUMENT only when it is present in the payload AND rendered by the
 * template — tested SEPARATELY, never against the two concatenated.
 *
 * The first draft concatenated them, and mutating the real files exposed it at exit 0: deleting
 * `carrierName` from both the payload type and the template still passed, because the string survives
 * in `fetchBolPayload`'s return object. A leftover mention is not a rendered field. This is the same
 * shape as the sources-array defect in verify-pod-bol-evidence-linkage, caught the same way, and both
 * selftests now pin it.
 */
export function missingFields(serviceSrc, templateSrc) {
  return REQUIRED_FIELDS.filter((f) => {
    const re = DETECT[f.id];
    return !(re.test(serviceSrc) && re.test(templateSrc));
  }).map((f) => f.id);
}

if (process.argv.includes("--selftest")) {
  const cases = [
    ["a field present in BOTH type and template is not missing", "carrierName: string;", "{{carrierName}}", "carrier_name", false],
    ["a field in neither is missing", "loadNumber: string;", "{{loadNumber}}", "carrier_name", true],
    ["the CFR package-count field is detected as `pieces`", "pieces: string;", "{{pieces}}", "package_count", false],
    ["hazmat is detected case-insensitively", "hazmatBlock: string;", "{{hazmatBlock}}", "hazmat_block", false],
    // The regression this guard shipped with and had to be mutated out of: a field mentioned ONLY in
    // the service (a leftover return-object key) is not on the document, and must still read MISSING.
    ["present in the service but NOT rendered is still missing", "carrierName: String(x)", "{{loadNumber}}", "carrier_name", true],
    ["rendered but absent from the payload is still missing", "loadNumber: string;", "{{carrierName}}", "carrier_name", true],
  ];
  let bad = 0;
  for (const [name, svc, tpl, id, expectMissing] of cases) {
    const got = missingFields(svc, tpl).includes(id);
    if (got !== expectMissing) {
      bad++;
      console.error(`  selftest FAIL: ${name} — expected missing=${expectMissing}, got ${got}`);
    }
  }
  if (bad) {
    console.error(`${LABEL} --selftest: ${bad} case(s) failed`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest: ${cases.length} cases pass`);
  process.exit(0);
}

const serviceSrc = readFileSync(join(ROOT, SERVICE), "utf8");
const templateSrc = readFileSync(join(ROOT, TEMPLATE), "utf8");
const current = missingFields(serviceSrc, templateSrc).sort();

if (process.argv.includes("--write-baseline")) {
  writeFileSync(join(ROOT, BASELINE_PATH), `${JSON.stringify(current, null, 2)}\n`);
  console.log(`${LABEL}: baseline written — ${current.length} field(s) still missing from the BOL.`);
  process.exit(0);
}

let baseline;
try {
  baseline = JSON.parse(readFileSync(join(ROOT, BASELINE_PATH), "utf8"));
} catch {
  console.error(`FAIL ${LABEL}: baseline missing at ${BASELINE_PATH} — run with --write-baseline.`);
  process.exit(1);
}
const baselineSet = new Set(baseline);
const regressed = current.filter((id) => !baselineSet.has(id));

if (regressed.length) {
  console.error(`FAIL ${LABEL} — field(s) DROPPED from the generated Bill of Lading:`);
  for (const id of regressed) {
    const f = REQUIRED_FIELDS.find((x) => x.id === id);
    console.error(`  · ${id}${f?.cfr ? `  [49 CFR ${f.cfr}]` : ""} — ${f?.why}`);
  }
  console.error(`\n  A BOL is a legal shipping document. This guard is ADDITIVE-ONLY: fields may be`);
  console.error(`  added and the baseline tightened, never removed to make a check pass.`);
  process.exit(1);
}

const fixed = baseline.filter((id) => !current.includes(id));
if (fixed.length) {
  console.log(`${LABEL}: OK — ${fixed.length} field(s) now on the BOL. Re-run with --write-baseline to tighten.`);
} else {
  console.log(`${LABEL}: OK — ratchet holding at ${current.length} missing field(s); 0 dropped.`);
}
