#!/usr/bin/env node
/** ROUND 319 — Customer Details wires locations (geocode badge), Faro factoring, documents, complaints. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const LABEL = "verify-r319-customer-details-engines";
const file = "apps/frontend/src/pages/Customers.tsx";
const text = fs.readFileSync(path.join(ROOT, file), "utf8");
const needles = [
  "CustomerLocationsSection",
  "CustomerFactoringReverseSection",
  "ComplaintsReverseSection",
  'entityType="customer"',
  "customer-details-r319",
  "GeocodePrecisionBadge", // via locations section file — also assert section file exists
];
const problems = [];
for (const n of needles) {
  if (n === "GeocodePrecisionBadge") {
    const badge = path.join(ROOT, "apps/frontend/src/components/customers/GeocodePrecisionBadge.tsx");
    const loc = path.join(ROOT, "apps/frontend/src/components/customers/CustomerLocationsSection.tsx");
    if (!fs.existsSync(badge) || !fs.existsSync(loc)) problems.push("geocode badge / locations section missing");
    else if (!fs.readFileSync(loc, "utf8").includes("GeocodePrecisionBadgeChip")) problems.push("locations section missing badge chip");
    continue;
  }
  if (!text.includes(n)) problems.push(`${file}: missing ${JSON.stringify(n)}`);
}
if (problems.length) {
  console.error(`${LABEL} FAIL:\n  - ${problems.join("\n  - ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — Customer Details: locations+geocode · factoring · docs · complaints`);
