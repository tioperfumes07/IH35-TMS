#!/usr/bin/env node
/**
 * verify-bills-page-bill-id-deeplink.mjs
 *
 * GUARD 2026-07-16 (Desktop audit 14-MAINTENANCE + 99-CROSSCUTTING-ENTITYLINK):
 * Work-order / list deep-links to `/accounting/bills?bill_id=` must land on a BillsPage
 * that honors the param (highlight + select). Silently dropping bill_id is fake connectivity.
 *
 * Also locks the preferred WO path: EntityLink kind="bill" → /accounting/bills/:id
 * (detail route) so WO linked bills are not plain text / dead hrefs.
 *
 * Static invariants (no DB, no network):
 *  1. BillsPage uses useSearchParams and reads searchParams.get("bill_id")
 *  2. BillsPage selects/highlights from that id (allocationBillId / highlightedBillId)
 *  3. WorkOrderDetailPage renders EntityLink kind="bill" for linked bills
 *  4. EntityLink resolves bill → /accounting/bills/:id
 *  5. manifest registers /accounting/bills/:id
 *
 * Usage:
 *   node scripts/verify-bills-page-bill-id-deeplink.mjs            # scan
 *   node scripts/verify-bills-page-bill-id-deeplink.mjs --selftest # planted-bug harness
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-bills-page-bill-id-deeplink";
const BILLS_PAGE = "apps/frontend/src/pages/accounting/BillsPage.tsx";
const WO_DETAIL = "apps/frontend/src/pages/maintenance/WorkOrderDetailPage.tsx";
const ENTITY_LINK = "apps/frontend/src/components/shared/EntityLink.tsx";
const MANIFEST = "apps/frontend/src/routes/manifest.tsx";

/** Pure checks — takes text so --selftest can inject fixtures. */
export function check({ billsPage, woDetail, entityLink, manifest }) {
  const f = [];

  if (!billsPage) {
    f.push(`${BILLS_PAGE}: missing`);
  } else {
    if (!/useSearchParams/.test(billsPage)) {
      f.push(`${BILLS_PAGE}: must use useSearchParams to honor ?bill_id=`);
    }
    if (!/searchParams\.get\(\s*["']bill_id["']\s*\)/.test(billsPage)) {
      f.push(`${BILLS_PAGE}: must read searchParams.get("bill_id")`);
    }
    if (!/highlightedBillId|allocationBillId/.test(billsPage)) {
      f.push(`${BILLS_PAGE}: must highlight/select the deep-linked bill (highlightedBillId or allocationBillId)`);
    }
    if (!/deepLinkBillId/.test(billsPage)) {
      f.push(`${BILLS_PAGE}: must bind deepLinkBillId from ?bill_id=`);
    }
  }

  if (!woDetail) {
    f.push(`${WO_DETAIL}: missing`);
  } else if (!/kind\s*=\s*["']bill["']/.test(woDetail) || !/EntityLink/.test(woDetail)) {
    f.push(`${WO_DETAIL}: linked bills must use EntityLink kind="bill"`);
  }

  if (!entityLink) {
    f.push(`${ENTITY_LINK}: missing`);
  } else if (!/case\s+["']bill["']\s*:\s*return\s+`\/accounting\/bills\/\$\{id\}`/.test(entityLink)) {
    f.push(`${ENTITY_LINK}: resolveEntityRoute(bill) must return /accounting/bills/:id`);
  }

  if (!manifest) {
    f.push(`${MANIFEST}: missing`);
  } else if (!/path\s*=\s*["']\/accounting\/bills\/:id["']/.test(manifest)) {
    f.push(`${MANIFEST}: must register /accounting/bills/:id detail route`);
  }

  return f;
}

export function run() {
  const read = (rel) => {
    try {
      return fs.readFileSync(path.join(ROOT, rel), "utf8");
    } catch {
      return null;
    }
  };
  return check({
    billsPage: read(BILLS_PAGE),
    woDetail: read(WO_DETAIL),
    entityLink: read(ENTITY_LINK),
    manifest: read(MANIFEST),
  });
}

if (process.argv.includes("--selftest")) {
  const goodBills = `
    import { useNavigate, useSearchParams } from "react-router-dom";
    const [searchParams] = useSearchParams();
    const deepLinkBillId = searchParams.get("bill_id");
    const [highlightedBillId, setHighlightedBillId] = useState(deepLinkBillId);
    const [allocationBillId, setAllocationBillId] = useState(deepLinkBillId);
  `;
  const goodWo = `
    import { EntityLink } from "../../components/shared/EntityLink";
    <EntityLink kind="bill" id={bill.id} label={bill.bill_number} />
  `;
  const goodEntity = `
    case "bill":
      return \`/accounting/bills/\${id}\`;
  `;
  const goodManifest = `path="/accounting/bills/:id"`;

  const checks = [
    ["healthy emit + consume pass", check({ billsPage: goodBills, woDetail: goodWo, entityLink: goodEntity, manifest: goodManifest }).length === 0],
    [
      "missing bill_id read caught",
      check({
        billsPage: goodBills.replace('searchParams.get("bill_id")', 'searchParams.get("status")'),
        woDetail: goodWo,
        entityLink: goodEntity,
        manifest: goodManifest,
      }).some((x) => x.includes('searchParams.get("bill_id")')),
    ],
    [
      "missing deepLinkBillId caught",
      check({
        billsPage: goodBills.replace(/deepLinkBillId/g, "ignoredId"),
        woDetail: goodWo,
        entityLink: goodEntity,
        manifest: goodManifest,
      }).some((x) => x.includes("deepLinkBillId")),
    ],
    [
      "missing WO EntityLink bill caught",
      check({
        billsPage: goodBills,
        woDetail: `<a href={"/accounting/bills?bill_id=" + bill.id}>{bill.bill_number}</a>`,
        entityLink: goodEntity,
        manifest: goodManifest,
      }).some((x) => x.includes('kind="bill"')),
    ],
    [
      "missing bill detail route caught",
      check({
        billsPage: goodBills,
        woDetail: goodWo,
        entityLink: goodEntity,
        manifest: `path="/accounting/bills"`,
      }).some((x) => x.includes("/accounting/bills/:id")),
    ],
  ];

  const failed = checks.filter(([, ok]) => !ok);
  if (failed.length) {
    console.error(`${LABEL} --selftest FAIL:`);
    for (const [n] of failed) console.error("  ✗ " + n);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS (${checks.length} checks)`);
  process.exit(0);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const f = run();
  if (f.length) {
    console.error(`${LABEL} FAIL:`);
    for (const x of f) console.error("  ✗ " + x);
    process.exit(1);
  }
  console.log(
    `${LABEL}: OK — BillsPage honors ?bill_id=; WO EntityLink bill → /accounting/bills/:id`,
  );
  process.exit(0);
}
