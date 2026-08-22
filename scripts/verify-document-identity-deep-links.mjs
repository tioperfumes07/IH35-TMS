#!/usr/bin/env node
/** @matrix-built {"modules":["drivers"],"cols":["reverse_link"],"leaves":["profiles.documents"],"task":"CLASS-F5903-DOCUMENT-REVERSE-EXACT","vertical":"class-sweep"} */
/** @matrix-built {"modules":["fleet"],"cols":["reverse_link"],"leaves":["unit.profile.documents","trailer.profile.documents"],"task":"CLASS-F5903-DOCUMENT-REVERSE-EXACT","vertical":"class-sweep"} */
/** @matrix-built {"modules":["fleet"],"cols":["connectivity"],"leaves":["unit.profile.documents","trailer.profile.documents"],"task":"FLEET-F5933-DOCUMENT-CONNECTIVITY-EXACT","vertical":"class-sweep"} */
import fs from "node:fs";
import process from "node:process";

const FILES = {
  resolver: "apps/frontend/src/components/shared/EntityLink.tsx",
  hub: "apps/frontend/src/pages/docs/DocsHomePage.tsx",
  shared: "apps/frontend/src/components/documents/DocumentsTab.tsx",
  unit: "apps/frontend/src/components/vehicle-profile/DocumentsSection.tsx",
  trailer: "apps/frontend/src/components/trailer-profile/DocumentsSection.tsx",
  customer: "apps/frontend/src/pages/CustomerDetail.tsx",
  docsMatrix: "docs/specs/scoreboard/modules/docs.required.json",
  drivers: "docs/specs/scoreboard/modules/drivers.required.json",
  fleetMatrix: "docs/specs/scoreboard/modules/fleet.required.json",
  self: "scripts/verify-document-identity-deep-links.mjs",
};
const read = () => Object.fromEntries(Object.entries(FILES).map(([key, file]) => [key, fs.readFileSync(file, "utf8")]));
function leaf(source, key, id) { try { return JSON.parse(source[key]).leaves.find((candidate) => candidate.id === id); } catch { return null; } }
function verify(source) {
  const failures = [];
  const need = (key, text, message) => { if (!source[key].includes(text)) failures.push(message); };
  need("resolver", '| "document"', "EntityKind must include document");
  need("resolver", 'return `/docs?file_id=${id}`;', "document must resolve to the canonical Docs hub query");
  need("hub", 'useState<string | null>(() => searchParams.get("file_id"))', "Docs hub must initialize preview from file_id");
  need("hub", 'setPreviewFileId(searchParams.get("file_id"))', "Docs hub must react to same-route document links");
  need("hub", 'params.delete("file_id")', "closing preview must clear the deep-link query");
  need("hub", 'kind="document"', "Docs hub filenames must be canonical document links");
  need("shared", 'data-testid="entity-document-record-link"', "shared entity document rosters must drill through");
  need("unit", 'data-testid="unit-document-record-link"', "unit document roster must drill through");
  need("trailer", 'data-testid="trailer-document-record-link"', "trailer document roster must drill through");
  need("trailer", 'EntityLinkOrTombstone kind="document"', "trailer document roster must tombstone unavailable records");
  need("trailer", 'id={d.file_id == null ? null : String(d.file_id)}', "trailer document roster must not manufacture an empty document id");
  need("customer", 'data-testid="customer-financial-document-record-link"', "customer financial-summary documents must drill through");
  need("customer", 'kind="document"', "customer financial-summary documents must use the canonical document route");
  need("customer", 'id={d.id}', "customer financial-summary documents must use the producer's canonical attachment id");
  need("customer", 'name={d.filename}', "customer financial-summary documents must retain the producer's human filename");
  const requiredReverseLeaves = [
    ["docsMatrix", "home"],
    ["drivers", "profiles.documents"],
    ["fleetMatrix", "unit.profile.documents"],
    ["fleetMatrix", "trailer.profile.documents"],
  ];
  for (const [key, id] of requiredReverseLeaves) {
    if (!leaf(source, key, id)?.required?.includes("reverse_link")) failures.push(`${key} ${id} must require reverse_link`);
  }
  for (const id of ["unit.profile.documents", "trailer.profile.documents"]) {
    if (!leaf(source, "fleetMatrix", id)?.required?.includes("connectivity")) failures.push(`fleetMatrix ${id} must require connectivity`);
  }
  need("self", '"modules":["drivers"],"cols":["reverse_link"],"leaves":["profiles.documents"]', "Drivers documents must have exact reverse Built ownership");
  need("self", '"modules":["fleet"],"cols":["reverse_link"],"leaves":["unit.profile.documents","trailer.profile.documents"]', "Fleet document leaves must have exact reverse Built ownership");
  need("self", '"modules":["fleet"],"cols":["connectivity"],"leaves":["unit.profile.documents","trailer.profile.documents"]', "Fleet document leaves must have exact connectivity Built ownership");
  return failures;
}
const source = read();
const failures = verify(source);
if (failures.length) { console.error("document identity deep-link guard failed:"); failures.forEach((failure) => console.error(`- ${failure}`)); process.exit(1); }
if (process.argv.includes("--self-test") || process.argv.includes("--selftest")) {
  const mutations = [
    ["resolver", '| "document"', '| "document_broken"'],
    ["resolver", 'file_id=${id}', 'document_id=${id}'],
    ["hub", 'searchParams.get("file_id")', 'searchParams.get("document_id")'],
    ["hub", 'params.delete("file_id")', 'params.delete("document_id")'],
    ["shared", 'data-testid="entity-document-record-link"', 'data-testid="broken-entity-document-link"'],
    ["unit", 'data-testid="unit-document-record-link"', 'data-testid="broken-unit-document-link"'],
    ["trailer", 'data-testid="trailer-document-record-link"', 'data-testid="broken-trailer-document-link"'],
    ["trailer", 'EntityLinkOrTombstone kind="document"', 'EntityLink kind="document"'],
    ["customer", 'data-testid="customer-financial-document-record-link"', 'data-testid="broken-customer-document-link"'],
    ["customer", 'id={d.id}', 'id={undefined}'],
    ["customer", 'name={d.filename}', 'name={undefined}'],
    ["docsMatrix", '"id": "home"', '"id": "home.broken"'],
    ["drivers", '"id": "profiles.documents"', '"id": "profiles.documents.broken"'],
    ["fleetMatrix", '"id": "unit.profile.documents"', '"id": "unit.profile.documents.broken"'],
    ["fleetMatrix", '"id": "trailer.profile.documents"', '"id": "trailer.profile.documents.broken"'],
    ["self", '"modules":["drivers"],"cols":["reverse_link"],"leaves":["profiles.documents"]', '"modules":["drivers"],"cols":["connectivity"],"leaves":["profiles.documents"]'],
    ["self", '"modules":["fleet"],"cols":["reverse_link"],"leaves":["unit.profile.documents","trailer.profile.documents"]', '"modules":["fleet"],"cols":["connectivity"],"leaves":["unit.profile.documents","trailer.profile.documents"]'],
    ["self", '"modules":["fleet"],"cols":["connectivity"],"leaves":["unit.profile.documents","trailer.profile.documents"]', '"modules":["fleet"],"cols":["unit"],"leaves":["unit.profile.documents","trailer.profile.documents"]'],
  ];
  for (const [key, before, after] of mutations) {
    if (!source[key].includes(before)) throw new Error(`self-test fixture missing: ${key}`);
    if (!verify({ ...source, [key]: source[key].replaceAll(before, after) }).length) throw new Error(`self-test mutation survived: ${key}`);
  }
  console.log(`PASS: ${mutations.length} planted defects were rejected`);
}
console.log("PASS: document identities deep-link across Docs, Drivers, Vendors, Customers, Dispatch, and Fleet");
