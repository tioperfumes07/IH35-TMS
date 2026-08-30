#!/usr/bin/env node
/**
 * VEND-LINK-01 — Bills/allocations EntityLink uses mdata_vendor_id (canonical uuid), not legacy
 * TEXT QBO vendor_id / vendor_uuid.
 *
 * Composes verify-bill-vendor-link-canonical-uuid (ACCT-F84 / ACCT-F603 sibling) and locks the
 * vendors module-completion row.
 *
 *   node scripts/verify-vend-link-01-vendor-uuid-entitylink.mjs
 *   node scripts/verify-vend-link-01-vendor-uuid-entitylink.mjs --selftest
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { auditSurface, auditBackend } from "./verify-bill-vendor-link-canonical-uuid.mjs";
import { openWaveIdsForModule } from "./lib/open-wave-modules.mjs";
import { scoreManifest } from "./verify-module-completion.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-vend-link-01-vendor-uuid-entitylink";
const MANIFEST = "docs/module-completion/vendors.json";

const SURFACES = [
  "apps/frontend/src/pages/accounting/BillsPage.tsx",
  "apps/frontend/src/pages/accounting/BillDetailPage.tsx",
  "apps/frontend/src/pages/accounting/BillPaymentsListPage.tsx",
  "apps/frontend/src/pages/accounting/BillPaymentDetailPage.tsx",
  "apps/frontend/src/pages/accounting/AllocationsPage.tsx",
];

const BACKEND_SOURCES = [
  { file: "apps/backend/src/accounting/bills.service.ts", needs: ["mdata_vendor_id"] },
  { file: "apps/backend/src/accounting/allocations.service.ts", needs: ["mdata_vendor_id"] },
];

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

export function collectProblems(overrides = {}) {
  const problems = [];
  const manifestRaw = overrides.manifest ?? read(MANIFEST);

  for (const rel of SURFACES) {
    problems.push(...auditSurface(rel, overrides[rel] ?? read(rel)));
  }
  for (const { file, needs } of BACKEND_SOURCES) {
    problems.push(...auditBackend(file, overrides[file] ?? read(file), needs));
  }

  let manifest;
  try {
    manifest = JSON.parse(manifestRaw);
  } catch {
    problems.push(`${MANIFEST}: invalid JSON`);
    return problems;
  }

  const item = manifest.items?.find((i) => i.id === "VEND-LINK-01");
  if (!item) {
    problems.push(`${MANIFEST}: missing VEND-LINK-01 item`);
  } else if (item.status !== "PASS") {
    problems.push(`${MANIFEST}: VEND-LINK-01 must be PASS (got ${item.status})`);
  }

  if (overrides.checkComplete !== false) {
    // Checklist may be 7/7 PASS with complete:false while a shared-class wave still lists
    // vendors (CLS-ORPHAN-SURFACE). Align with verify-no-false-green-certify — never force
    // complete:true under an open shared class.
    //
    // ACCT-GUARD-F7300-class fix (2026-08-29): this check used to require complete:true
    // whenever no open wave listed vendors, based purely on item.status. It never learned
    // about universal prod_verified on N (verify-module-completion.mjs). A PASS item only
    // counts toward N if it is ALSO prod_verified. With
    // CLS-ORPHAN-SURFACE drained (2026-08-09) but zero of the 7 vendors items prod_verified yet,
    // this guard was demanding complete:true on a manifest whose HONEST scored N is 0, not 7 —
    // which would have been a false green and would have failed
    // verify-module-manifest-integrity.mjs the moment anyone tried to set it. Use the SAME
    // scoreManifest() the rest of the module-completion system trusts, so this guard can never
    // again disagree with it about what "complete" means.
    const { N, M } = scoreManifest(manifest);
    const openWaves =
      overrides.openWaveIds !== undefined
        ? overrides.openWaveIds
        : openWaveIdsForModule("vendors");
    if (openWaves.length) {
      if (manifest.complete === true) {
        problems.push(
          `${MANIFEST}: complete:true ILLEGAL while open wave(s) list vendors: ${openWaves.join(", ")}`
        );
      }
    } else if (N === M) {
      if (manifest.complete !== true) {
        problems.push(
          `${MANIFEST}: complete must be true when VEND-LINK-01 closes the module, every item scores toward N (prod_verified), and no shared-class waves list vendors`
        );
      }
    } else if (manifest.complete === true) {
      problems.push(
        `${MANIFEST}: complete:true is a false green — scored ${N} of ${M} (prod_verified required, not just status:PASS); honest complete:false is correct until GUARD stamps the remaining items`
      );
    }
    // NOTE: this used to also assert pass_count === total_count unconditionally. That assumed
    // pass_count always means "every item currently shows status:PASS" — true before URGENT_6
    // existed, but pass_count is now the HONEST scored N (verify-module-manifest-integrity.mjs),
    // which can legitimately be less than total_count for a URGENT_6 module with unverified PASS
    // items (vendors: pass_count 0, total_count 7, all 7 items genuinely status:PASS). That
    // arithmetic is verify-module-manifest-integrity.mjs's job, not this guard's — re-asserting a
    // stale definition here is exactly the ACCT-GUARD-F7300 class of bug this fix exists to close.
  }

  if (overrides.runSibling !== false) {
    const sibling = spawnSync(
      process.execPath,
      [path.join(ROOT, "scripts/verify-bill-vendor-link-canonical-uuid.mjs")],
      { cwd: ROOT, encoding: "utf8" }
    );
    if (sibling.status !== 0) {
      problems.push(
        `verify-bill-vendor-link-canonical-uuid failed:\n${(sibling.stdout || "") + (sibling.stderr || "")}`.trim()
      );
    }
  }

  return problems;
}

const IS_MAIN = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (IS_MAIN && process.argv.includes("--selftest")) {
  const failures = [];

  const good = collectProblems({ checkComplete: false, runSibling: false });
  if (good.length) {
    failures.push(`tip unclean: ${good.join(" | ")}`);
  }

  const legacyBug = `<EntityLink kind="vendor" id={bill.vendor_id} label={bill.vendor_name} />`;
  if (!auditSurface("x.tsx", legacyBug).some((p) => p.includes("legacy TEXT"))) {
    failures.push("legacy vendor_id EntityLink id not caught");
  }

  const canonical = `<EntityLink kind="vendor" id={bill.mdata_vendor_id} label={entityLabel(bill.vendor_name, bill.vendor_id, "Vendor")} />`;
  if (auditSurface("x.tsx", canonical).length !== 0) {
    failures.push("canonical mdata_vendor_id EntityLink wrongly flagged");
  }

  const brokenManifest = JSON.stringify({
    complete: false,
    pass_count: 6,
    total_count: 7,
    items: [{ id: "VEND-LINK-01", status: "OPEN" }],
  });
  const manifestProblems = collectProblems({
    manifest: brokenManifest,
    checkComplete: false,
    runSibling: false,
  });
  if (!manifestProblems.some((p) => /VEND-LINK-01 must be PASS/.test(p))) {
    failures.push("OPEN VEND-LINK-01 manifest row not caught");
  }

  const falseGreen = collectProblems({
    manifest: JSON.stringify({
      complete: true,
      pass_count: 7,
      total_count: 7,
      items: [{ id: "VEND-LINK-01", status: "PASS" }],
    }),
    openWaveIds: ["CLS-ORPHAN-SURFACE"],
    runSibling: false,
  });
  if (!falseGreen.some((p) => /complete:true ILLEGAL/.test(p))) {
    failures.push("complete:true under open shared-class wave not caught");
  }

  const honestHold = collectProblems({
    manifest: JSON.stringify({
      complete: false,
      pass_count: 7,
      total_count: 7,
      items: [{ id: "VEND-LINK-01", status: "PASS" }],
    }),
    openWaveIds: ["CLS-ORPHAN-SURFACE"],
    runSibling: false,
  });
  if (honestHold.length) {
    failures.push(`honest complete:false under open wave wrongly flagged: ${honestHold.join(" | ")}`);
  }

  // ACCT-GUARD-F7300-class regression coverage: a PASS item only scores toward N if it is ALSO
  // prod_verified. complete:true must be a false
  // green when items are PASS-but-unverified, and legal once every item is genuinely prod_verified.
  const urgent6FalseGreen = collectProblems({
    manifest: JSON.stringify({
      module: "vendors",
      complete: true,
      pass_count: 1,
      total_count: 1,
      items: [{ id: "VEND-LINK-01", status: "PASS", prod_verified: false }],
    }),
    openWaveIds: [],
    runSibling: false,
  });
  if (!urgent6FalseGreen.some((p) => /false green/.test(p))) {
    failures.push("complete:true with no waves but zero prod_verified not caught");
  }

  const urgent6HonestComplete = collectProblems({
    manifest: JSON.stringify({
      module: "vendors",
      complete: true,
      pass_count: 1,
      total_count: 1,
      items: [{ id: "VEND-LINK-01", status: "PASS", prod_verified: true }],
    }),
    openWaveIds: [],
    runSibling: false,
  });
  if (urgent6HonestComplete.length) {
    failures.push(
      `complete:true with every item genuinely prod_verified wrongly flagged: ${urgent6HonestComplete.join(" | ")}`
    );
  }

  const sibling = spawnSync(
    process.execPath,
    [path.join(ROOT, "scripts/verify-bill-vendor-link-canonical-uuid.mjs"), "--selftest"],
    { cwd: ROOT, encoding: "utf8" }
  );
  if (sibling.status !== 0) {
    failures.push("verify-bill-vendor-link-canonical-uuid sibling selftest failed");
  }

  if (failures.length) {
    for (const f of failures) console.error(`  ✗ ${LABEL}: ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL}: selftest PASS — legacy id caught, canonical passes, manifest row enforced`);
  process.exit(0);
}

if (IS_MAIN) {
  const problems = collectProblems();
  if (problems.length) {
    for (const p of problems) console.error(`  ✗ ${p}`);
    process.exit(1);
  }
  console.log(
    `${LABEL} OK — bill/allocation vendor EntityLink uses mdata_vendor_id; VEND-LINK-01 module row PASS`
  );
}
