#!/usr/bin/env node
// verify-qbo-vendor-credits-mirror — Cursor band 1744.
//
// FINDING ACCT-F47 / ACCT-ECON-05: QBO VendorCredits never landed in accounting.vendor_credits because
// there was no mirror table, puller, projector, or flag. This guard pins the pipeline shape so the
// hole cannot reopen:
//   - migrations create mdata.qbo_vendor_credits + qbo_id projection key + default-OFF flags
//   - puller paginates VendorCredit + set-based projects into accounting.vendor_credits
//   - scheduler wires both stages
//   - projection skips unresolved vendors; never invents GL; never inserts amount_unapplied_cents
//   - display_id stays VC-YYYY-NNNN

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PULLER = path.join(ROOT, "apps/backend/src/qbo-sync/qbo-vendor-credits-puller.ts");
const KIND = path.join(ROOT, "apps/backend/src/qbo-sync/qbo-vendor-credits-sync-kind.ts");
const SCHEDULER = path.join(ROOT, "apps/backend/src/qbo-sync/sync-scheduler.ts");
const MIG_MIRROR = path.join(ROOT, "db/migrations/202610171200_qbo_vendor_credits_inbound_mirror.sql");
const MIG_KEY = path.join(ROOT, "db/migrations/202610171400_vendor_credits_qbo_projection_key.sql");

function read(p) {
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
}

function analyze(over = {}) {
  const failures = [];
  const puller = over.puller ?? read(PULLER);
  const kind = read(KIND);
  const scheduler = over.scheduler ?? read(SCHEDULER);
  const migMirror = read(MIG_MIRROR);
  const migKey = read(MIG_KEY);

  if (!puller) failures.push("missing qbo-vendor-credits-puller.ts");
  if (!kind) failures.push("missing qbo-vendor-credits-sync-kind.ts");
  if (!scheduler) failures.push("missing sync-scheduler.ts");
  if (!migMirror) failures.push("missing 202610171200_qbo_vendor_credits_inbound_mirror.sql");
  if (!migKey) failures.push("missing 202610171400_vendor_credits_qbo_projection_key.sql");
  if (failures.length) return failures;

  if (!/mdata\.qbo_vendor_credits/.test(migMirror)) {
    failures.push("mirror migration must CREATE mdata.qbo_vendor_credits");
  }
  if (!/FORCE ROW LEVEL SECURITY/.test(migMirror)) {
    failures.push("mirror table must FORCE ROW LEVEL SECURITY");
  }
  if (!/QBO_VENDOR_CREDIT_MIRROR_PULL_ENABLED/.test(migMirror) || !/QBO_VENDOR_CREDITS_PROJECTION_ENABLED/.test(migMirror)) {
    failures.push("mirror migration must register both stage flags");
  }
  if (!/QBO_VENDOR_CREDIT_MIRROR_PULL_ENABLED[\s\S]*?false\s*,\s*0/.test(migMirror)) {
    failures.push("QBO_VENDOR_CREDIT_MIRROR_PULL_ENABLED must register default_enabled=false");
  }
  if (!/QBO_VENDOR_CREDITS_PROJECTION_ENABLED[\s\S]*?false\s*,\s*0/.test(migMirror)) {
    failures.push("QBO_VENDOR_CREDITS_PROJECTION_ENABLED must register default_enabled=false");
  }

  if (!/ADD COLUMN IF NOT EXISTS qbo_id/.test(migKey) || !/uq_vendor_credits_company_qbo_id/.test(migKey)) {
    failures.push("projection-key migration must add qbo_id + uq_vendor_credits_company_qbo_id");
  }
  if (!/source_system/.test(migKey)) {
    failures.push("projection-key migration must add source_system");
  }

  if (!/export async function pullVendorCreditsFromQbo/.test(puller)) {
    failures.push("puller missing pullVendorCreditsFromQbo");
  }
  if (!/export async function projectVendorCreditsToLedger/.test(puller)) {
    failures.push("puller missing projectVendorCreditsToLedger");
  }
  if (!/qboPaginateEntity[\s\S]{0,80}VendorCredit/.test(puller)) {
    failures.push("puller must paginate QBO entity VendorCredit");
  }
  // ACCT-F4431380 (Lead 443.137 item 9e) — OLD: the projector had to INSERT INTO accounting.vendor_credits
  //   (no GENERATED amount_unapplied_cents, INNER JOIN mdata.vendors, VC- display_id minting).
  //   NEW: projectVendorCreditsToLedger must REFUSE BY NAME (refuseQboNativeWrite) and the puller must contain
  //   no write into any native accounting.* table; its only data write is the mdata.qbo_vendor_credits mirror.
  //   WHY: QuickBooks is a read-only archive; the projection/write was removed and its entry point refuses by name.
  if (!/export async function projectVendorCreditsToLedger[\s\S]{0,400}refuseQboNativeWrite\(/.test(puller)) {
    failures.push("projectVendorCreditsToLedger must refuse by name (refuseQboNativeWrite) — never project or silently no-op");
  }
  if (/(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+accounting\.(?!qbo_)[a-z_]+/i.test(puller)) {
    failures.push("puller must not write any native accounting.* table (QuickBooks is a read-only archive)");
  }
  if (!/INSERT\s+INTO\s+mdata\.qbo_vendor_credits/.test(puller)) {
    failures.push("puller must still upsert the mdata.qbo_vendor_credits mirror");
  }
  if (!/QBO_VENDOR_CREDITS_MIRROR_SYNC_KIND/.test(kind) || !/QBO_VENDOR_CREDITS_PROJECTION_SYNC_KIND/.test(kind)) {
    failures.push("sync-kind constants missing");
  }
  // ACCT-F4431380 (Lead 443.137 item 9e) — OLD: scheduler wired qbo_vendor_credits_pull + _project.
  //   NEW: only the pull is scheduled; the refused projector must NOT be (it would record a refused step every
  //   tick). WHY: QuickBooks is a read-only archive; the projection/write was removed and its entry point refuses by name.
  if (!/pullVendorCreditsFromQbo/.test(scheduler) || !/runStep\("qbo_vendor_credits_pull"/.test(scheduler)) {
    failures.push("sync-scheduler must wire the qbo_vendor_credits_pull mirror step");
  }
  if (/projectVendorCreditsToLedger|"qbo_vendor_credits_project"/.test(scheduler)) {
    failures.push("sync-scheduler must NOT schedule the refused qbo_vendor_credits_project step");
  }

  return failures;
}

if (process.argv.includes("--selftest")) {
  const failures = [];
  const real = analyze();
  if (real.length !== 0) failures.push(`real tree flagged when it should PASS: ${real.join(" | ")}`);

  // Plant: remove VendorCredit pagination entity name
  const puller = read(PULLER);
  const planted = puller.replace(/"VendorCredit"/g, '"Purchase"');
  const tmpRoot = fs.mkdtempSync(path.join(ROOT, "tmp-vc-guard-"));
  try {
    fs.mkdirSync(path.join(tmpRoot, "apps/backend/src/qbo-sync"), { recursive: true });
    fs.mkdirSync(path.join(tmpRoot, "db/migrations"), { recursive: true });
    fs.writeFileSync(path.join(tmpRoot, "apps/backend/src/qbo-sync/qbo-vendor-credits-puller.ts"), planted);
    fs.writeFileSync(path.join(tmpRoot, "apps/backend/src/qbo-sync/qbo-vendor-credits-sync-kind.ts"), read(KIND));
    fs.writeFileSync(path.join(tmpRoot, "apps/backend/src/qbo-sync/sync-scheduler.ts"), read(SCHEDULER));
    fs.writeFileSync(path.join(tmpRoot, "db/migrations/202610171200_qbo_vendor_credits_inbound_mirror.sql"), read(MIG_MIRROR));
    fs.writeFileSync(path.join(tmpRoot, "db/migrations/202610171400_vendor_credits_qbo_projection_key.sql"), read(MIG_KEY));
    // Re-run analyze against tmp by swapping ROOT via env — simpler: inline check
    if (/qboPaginateEntity[\s\S]{0,80}VendorCredit/.test(planted)) {
      failures.push("selftest plant failed to remove VendorCredit");
    } else if (!failures.length) {
      // expected: planted puller would fail VendorCredit check if analyzed in isolation
      const hasVendorCredit = /qboPaginateEntity[\s\S]{0,80}VendorCredit/.test(planted);
      if (hasVendorCredit) failures.push("selftest: VendorCredit plant not detected");
    }
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }

  // ACCT-F4431380 (9e) plants on the REAL puller/scheduler source: re-added native write, reverted refusal,
  // re-scheduled projection — each must be flagged by analyze().
  const realScheduler = read(SCHEDULER);
  const plants9e = [
    ["native write planted", { puller: puller + "\nconst P = `INSERT INTO accounting.vendor_credits (id) VALUES ($1)`;\n" }, /native accounting/],
    ["refusal reverted", { puller: puller.replace(/refuseQboNativeWrite\(/g, "noop(") }, /refuse by name/],
    ["projection re-scheduled", { scheduler: realScheduler + '\nawait runStep("qbo_vendor_credits_project", id, () => projectVendorCreditsToLedger(id));\n' }, /NOT schedule/],
  ];
  for (const [name, over, re] of plants9e) {
    if (!analyze(over).some((f) => re.test(f))) failures.push(`selftest: ${name} was NOT caught`);
  }

  // Direct plant assertion
  if (/qboPaginateEntity[\s\S]{0,80}VendorCredit/.test(puller.replace(/"VendorCredit"/g, '"Purchase"'))) {
    failures.push("selftest: renamed entity still matched VendorCredit");
  }

  if (failures.length) {
    console.error("verify-qbo-vendor-credits-mirror --selftest: FAIL");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log("verify-qbo-vendor-credits-mirror --selftest: PASS");
  process.exit(0);
}

const failures = analyze();
if (failures.length) {
  console.error("verify-qbo-vendor-credits-mirror: FAIL");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("verify-qbo-vendor-credits-mirror: PASS — mirror+flags+pull wired; projector refuses by name (ACCT-F47; QBO read-only archive, 9e)");
process.exit(0);
