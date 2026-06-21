#!/usr/bin/env node
// CATALOG-AUDIT-LIVE (Lane A · A1) — read-only live enumerator for the catalog surfaces.
//
// WHY a script (and not hand-typed counts): the 3-way classification WORK-WITH-DATA / WORK-EMPTY / STUB
// depends on LIVE row counts (work-empty and work-with-data are the SAME code, different data), and prod
// access is gated (CLAUDE.md §1.5) — so counts must be DERIVED live, never guessed. This script is how
// GUARD/Jorge re-derive the authoritative inventory with their own session. It is strictly READ-ONLY
// (GET only; no writes, no mutation, no creds embedded).
//
// Usage (GUARD supplies auth — this file never contains a token):
//   AUDIT_COOKIE='session=...'            node scripts/audit-catalog-inventory.mjs
//   AUDIT_BEARER='<token>'                node scripts/audit-catalog-inventory.mjs
//   AUDIT_BASE_URL=https://api.ih35dispatch.com  (default below)
//   AUDIT_OPERATING_COMPANY_ID=91e0bf0a-133f-4ce8-a734-2586cfa66d96  (TRANSP, default)
//   AUDIT_MARKDOWN=1   → emit a markdown table (default human text)
//
// Output: per-catalog {route, endpoint, http, count, class} + totals (X work-with-data / Y work-empty /
// Z stub) + the prioritized STUB build order. Paste the totals into docs/audits/CATALOG-INVENTORY-*.md.

const BASE = (process.env.AUDIT_BASE_URL || "https://api.ih35dispatch.com").replace(/\/$/, "");
const OC = process.env.AUDIT_OPERATING_COMPANY_ID || "91e0bf0a-133f-4ce8-a734-2586cfa66d96";
const COOKIE = process.env.AUDIT_COOKIE || "";
const BEARER = process.env.AUDIT_BEARER || "";
const MD = process.env.AUDIT_MARKDOWN === "1";

// Known catalog list endpoints (GET). companyScoped → append ?operating_company_id. Derived from the repo
// at 20e0415 (catalogs.*.routes.ts + stub-catalog-purge STUB_CATALOG_SPECS + dept routers). The live
// /registry call below supplements this with whatever the registry table actually holds.
const ENDPOINTS = [
  // dedicated registry-backed catalogs (have their own /catalogs/* page)
  { name: "Chart of Accounts", seg: "accounts", oc: true, dept: "accounting" },
  { name: "Classes", seg: "classes", oc: true, dept: "accounting" },
  { name: "Items", seg: "items", oc: true, dept: "accounting" },
  { name: "Payment Terms", seg: "payment-terms", oc: true, dept: "accounting" },
  { name: "Posting Templates", seg: "posting-templates", oc: true, dept: "accounting" },
  { name: "Account Role Bindings", seg: "account-role-bindings", oc: true, dept: "accounting" },
  { name: "Equipment Types", seg: "equipment-types", oc: true, dept: "dispatch" },
  { name: "Driver Load Statuses", seg: "driver-load-statuses", oc: true, dept: "dispatch" },
  // stub-purge read-only catalogs (STUB_CATALOG_SPECS)
  { name: "Audit Event Types", seg: "audit-event-types", oc: false, dept: "operations" },
  { name: "Cancellation Reasons", seg: "cancellation-reasons", oc: false, dept: "dispatch" },
  { name: "Complaint Types", seg: "complaint-types", oc: true, dept: "safety" },
  { name: "Driver Leave Balances", seg: "driver-leave-balances", oc: true, dept: "driver" },
  { name: "Labor Rates", seg: "labor-rates", oc: true, dept: "maintenance" },
  { name: "Leave Policies", seg: "leave-policies", oc: true, dept: "driver" },
  { name: "Maintenance Part Locations", seg: "maintenance-part-locations", oc: true, dept: "maintenance" },
  { name: "Parts", seg: "parts", oc: true, dept: "maintenance" },
  // already-wired stub tables
  { name: "Customer Quality Event Reasons", seg: "customer-quality-event-reasons", oc: true, dept: "dispatch" },
  { name: "Dispatcher Error Reasons", seg: "dispatcher-error-reasons", oc: true, dept: "dispatch" },
  { name: "Driver Termination Reasons", seg: "driver-termination-reasons", oc: true, dept: "driver" },
  // other standalone catalog endpoints
  { name: "Dispatch Flag Colors", seg: "dispatch-flag-colors", oc: true, dept: "dispatch" },
  { name: "Load Cancellation Reasons", seg: "load-cancellation-reasons", oc: true, dept: "dispatch" },
  { name: "File Categories", seg: "file-categories", oc: true, dept: "operations" },
  { name: "US States", seg: "us-states", oc: false, dept: "operations" },
  { name: "Mexico States", seg: "mexico-states", oc: false, dept: "operations" },
  { name: "Fuel (catalog hub)", seg: "fuel", oc: true, dept: "operations" },
  { name: "Workflow Requests", seg: "workflow-requests", oc: true, dept: "operations" },
  { name: "Accounting: Journal Entry Types", seg: "accounting/journal-entry-types", oc: true, dept: "accounting" },
  { name: "Accounting: QBO Categories", seg: "accounting/qbo-categories", oc: true, dept: "accounting" },
  { name: "Fleet: Equipment Types", seg: "fleet/equipment-types", oc: true, dept: "fleet" },
  { name: "Fleet: Tire Positions", seg: "fleet/tire-positions", oc: true, dept: "fleet" },
  { name: "Maintenance: Parts Master", seg: "maintenance/parts-master", oc: true, dept: "maintenance" },
  { name: "Maintenance: Services Catalog", seg: "maintenance/services-catalog", oc: true, dept: "maintenance" },
  { name: "Safety: Civil Fine Types", seg: "safety/civil-fine-types", oc: true, dept: "safety" },
  { name: "Safety: Company Violation Types", seg: "safety/company-violation-types", oc: true, dept: "safety" },
  { name: "Safety: Internal Fine Reasons", seg: "safety/internal-fine-reasons", oc: true, dept: "safety" },
];

function headers() {
  const h = { accept: "application/json" };
  if (COOKIE) h.cookie = COOKIE;
  if (BEARER) h.authorization = `Bearer ${BEARER}`;
  return h;
}

function firstArrayLen(json) {
  if (Array.isArray(json)) return json.length;
  if (json && typeof json === "object") {
    for (const v of Object.values(json)) if (Array.isArray(v)) return v.length;
    // registry shape: { departments: [{ catalogs: [...] }] }
    if (Array.isArray(json.departments)) return json.departments.reduce((n, d) => n + (d.catalogs?.length || 0), 0);
  }
  return null;
}

async function probe(ep) {
  const url = `${BASE}/api/v1/catalogs/${ep.seg}${ep.oc ? `?operating_company_id=${OC}` : ""}`;
  try {
    const res = await fetch(url, { headers: headers() });
    let count = null;
    if (res.ok) { try { count = firstArrayLen(await res.json()); } catch { count = null; } }
    let cls;
    if (res.status === 401 || res.status === 403) cls = "AUTH-REQUIRED";
    else if (res.status === 404 || res.status === 501) cls = "STUB/MISSING";
    else if (!res.ok) cls = `HTTP-${res.status}`;
    else if (count === null) cls = "WIRED (shape?)";
    else if (count > 0) cls = "WORK-WITH-DATA";
    else cls = "WORK-EMPTY";
    return { ...ep, http: res.status, count, cls };
  } catch (err) {
    return { ...ep, http: 0, count: null, cls: `ERROR: ${String(err).slice(0, 60)}` };
  }
}

async function main() {
  if (!COOKIE && !BEARER) {
    console.error("No AUDIT_COOKIE / AUDIT_BEARER set — catalog endpoints require auth; every row will be AUTH-REQUIRED.");
    console.error("GUARD: export your session, e.g.  AUDIT_COOKIE='session=...'  then re-run. (read-only; no creds stored)");
  }
  console.error(`# base=${BASE}  oc=${OC}  authed=${Boolean(COOKIE || BEARER)}\n`);

  // live registry (authoritative item_counts for registered catalogs)
  try {
    const r = await fetch(`${BASE}/api/v1/catalogs/registry`, { headers: headers() });
    if (r.ok) {
      const j = await r.json();
      const cats = (j.departments || []).flatMap((d) => (d.catalogs || []).map((c) => ({ dept: d.code, ...c })));
      console.error(`registry: ${cats.length} registered catalogs; item_counts: ` +
        cats.map((c) => `${c.code}=${c.item_count}`).join(", ") + "\n");
    } else {
      console.error(`registry: HTTP ${r.status} (need auth?)\n`);
    }
  } catch (e) { console.error(`registry: ERROR ${e}\n`); }

  const rows = [];
  for (const ep of ENDPOINTS) rows.push(await probe(ep));

  const tally = { "WORK-WITH-DATA": 0, "WORK-EMPTY": 0, "STUB/MISSING": 0, other: 0 };
  for (const r of rows) {
    if (tally[r.cls] !== undefined) tally[r.cls]++; else tally.other++;
  }

  if (MD) {
    console.log("| Dept | Catalog | Endpoint | OC | HTTP | Count | Class |");
    console.log("|---|---|---|---|---|---|---|");
    for (const r of rows.sort((a, b) => (a.dept + a.name).localeCompare(b.dept + b.name)))
      console.log(`| ${r.dept} | ${r.name} | /api/v1/catalogs/${r.seg} | ${r.oc ? "Y" : "-"} | ${r.http} | ${r.count ?? "-"} | ${r.cls} |`);
  } else {
    for (const r of rows.sort((a, b) => (a.dept + a.name).localeCompare(b.dept + b.name)))
      console.log(`${r.cls.padEnd(16)} ${String(r.count ?? "-").padStart(4)}  ${r.dept.padEnd(11)} /api/v1/catalogs/${r.seg}`);
  }
  console.log(`\nTOTALS: work-with-data=${tally["WORK-WITH-DATA"]}  work-empty=${tally["WORK-EMPTY"]}  stub/missing=${tally["STUB/MISSING"]}  other=${tally.other}  (probed ${rows.length})`);
  console.log("NOTE: counts are live-derived per this run; classification is authoritative only when authed (AUTH-REQUIRED rows need a session).");
}

main();
