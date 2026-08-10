#!/usr/bin/env node
/**
 * ACCT-F603 — Bill→vendor drill must use canonical mdata.vendors uuid (vendor_uuid /
 * mdata_vendor_id / billVendorDrillId), never legacy accounting.bills.vendor_id QBO text.
 *
 * Root cause (prod br-fancy-credit-akjnd07a, 2026-08-03): EntityLink kind="vendor" built
 * /vendors/:id from vendor_id ("472", "256") which 404s; vendor_uuid holds the real uuid on
 * 16,248/16,248 bills and TMS create writes it on every new bill.
 *
 *   node scripts/verify-acct-bill-vendor-uuid-link.mjs
 *   node scripts/verify-acct-bill-vendor-uuid-link.mjs --selftest
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const LABEL = "verify-acct-bill-vendor-uuid-link";

const SURFACES = [
  "apps/frontend/src/pages/accounting/BillsPage.tsx",
  "apps/frontend/src/pages/accounting/BillDetailPage.tsx",
  "apps/frontend/src/pages/accounting/AllocationsPage.tsx",
];

const LEGACY_ID_IN_LINK = /\bid=\{[^}]*\b(?:bill|payment|row)\.vendor_id\b[^}]*\}/;

export function auditSurface(rel, src) {
  const problems = [];
  if (LEGACY_ID_IN_LINK.test(src)) {
    problems.push(
      `${rel}: EntityLink kind="vendor" still uses legacy bill.vendor_id in id={…} — builds /vendors/<qbo-id> and 404s`
    );
  }
  const vendorLinks = [...src.matchAll(/<EntityLink\b[^>]*kind="vendor"[^>]*\/>/gs)];
  for (const m of vendorLinks) {
    const tag = m[0];
    const idExpr = /\bid=\{([^}]*)\}/.exec(tag);
    if (!idExpr) continue;
    const expr = idExpr[1];
    if (
      /billVendorDrillId/.test(expr) ||
      /vendor_uuid/.test(expr) ||
      /mdata_vendor_id/.test(expr)
    ) {
      continue;
    }
    if (/\bvendor_id\b/.test(expr)) {
      problems.push(
        `${rel}: vendor EntityLink id=\`${expr.trim()}\` must use billVendorDrillId or vendor_uuid/mdata_vendor_id`
      );
    }
  }
  return problems;
}

export function auditBackend(src) {
  const problems = [];
  if (!src.includes("billVendorDrillId")) {
    problems.push("accounting.ts: missing billVendorDrillId() helper");
  }
  if (!/vendor_uuid:\s*string\s*\|\s*null/.test(src)) {
    problems.push("accounting.ts: VendorBill must declare vendor_uuid for drill-through");
  }
  const service = readFileSync(join(ROOT, "apps/backend/src/accounting/bills.service.ts"), "utf8");
  if (!service.includes("BILL_VENDOR_RESOLVE_JOIN_SQL")) {
    problems.push("bills.service.ts: getBillDetail must join vendors via BILL_VENDOR_RESOLVE_JOIN_SQL (vendor_uuid/mdata_vendor_id)");
  }
  if (!service.includes("BILL_PAYMENT_MDATA_VENDOR_ID_SQL")) {
    problems.push("bills.service.ts: getBillPaymentDetail must resolve mdata_vendor_id for bill-payment vendor drill");
  }
  if (/ON v\.id::text = COALESCE\(b\.vendor_id/.test(service)) {
    problems.push("bills.service.ts: getBillDetail still joins vendors on legacy vendor_id text");
  }
  // LV-BILLS-VENDOR-UUID — resolveVendorDisplayMap read ONLY qbo_archive.entities_snapshot, which is the
  // QBO identifier space. A TMS-native (USMCA) bill carries an mdata.vendors uuid in vendor_uuid and has no
  // snapshot row, so every such list row fell back to rendering a raw UUID. QBO stays primary under
  // parallel books; mdata is the fallback for uuid-shaped ids only.
  const resolverStart = service.indexOf("export async function resolveVendorDisplayMap");
  const resolver = resolverStart === -1 ? "" : service.slice(resolverStart, resolverStart + 4000);
  if (!resolverStart) {
    problems.push("bills.service.ts: resolveVendorDisplayMap not found — anchor drifted");
  } else {
    if (!/FROM mdata\.vendors/.test(resolver)) {
      problems.push(
        "bills.service.ts: resolveVendorDisplayMap must also resolve names from mdata.vendors — the QBO " +
          "snapshot alone leaves every TMS-native bill showing a raw UUID"
      );
    }
    if (!/vendor_name/.test(resolver)) {
      problems.push("bills.service.ts: resolveVendorDisplayMap must select mdata.vendors.vendor_name");
    }
  }
  return problems;
}

function auditTree() {
  const problems = [];
  for (const rel of SURFACES) {
    problems.push(...auditSurface(rel, readFileSync(join(ROOT, rel), "utf8")));
  }
  problems.push(...auditBackend(readFileSync(join(ROOT, "apps/frontend/src/api/accounting.ts"), "utf8")));
  return problems;
}

function selftest() {
  const failures = [];

  const goodBillPage = `
    import { billVendorDrillId } from "../../api/accounting";
    <EntityLink kind="vendor" id={billVendorDrillId(bill)} label={entityLabel(bill.vendor_name, bill.vendor_id, "Vendor")} />
  `;
  if (auditSurface("good.tsx", goodBillPage).length !== 0) {
    failures.push("selftest: canonical billVendorDrillId form was flagged");
  }

  const badBillPage = `<EntityLink kind="vendor" id={bill.vendor_id} label={bill.vendor_name} />`;
  if (!auditSurface("bad.tsx", badBillPage).some((p) => p.includes("legacy bill.vendor_id"))) {
    failures.push("selftest: id={bill.vendor_id} was NOT caught");
  }

  const badMdataOnly = `<EntityLink kind="vendor" id={row.vendor_id} />`;
  if (!auditSurface("bad2.tsx", badMdataOnly).some((p) => p.includes("must use billVendorDrillId"))) {
    failures.push("selftest: id={row.vendor_id} was NOT caught");
  }

  if (auditTree().length !== 0) {
    failures.push(`selftest: real tree has regressions: ${auditTree().join(" | ")}`);
  }

  if (failures.length) {
    for (const f of failures) console.error(`  ✗ ${LABEL}: ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL}: selftest PASS — legacy vendor_id link blocked, billVendorDrillId required`);
}

function main() {
  if (process.argv.includes("--selftest")) return selftest();
  const problems = auditTree();
  if (problems.length) {
    for (const p of problems) console.error(`  ✗ ${p}`);
    process.exit(1);
  }
  console.log(`${LABEL} OK — bills grid/detail vendor drill uses vendor_uuid canonical path`);
}

main();
