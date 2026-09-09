#!/usr/bin/env node
// SETTLEMENT-DETAIL-NUMBER-COLUMN-RAW-UUID (owner 2026-09-09, "do not give me this current shit" on
// the driver settlement detail page): ExtraPaySection, ReimbursementsSection, and DeductionsSection's
// "Number" column rendered the raw settlement_lines row uuid (e.g. "c1ebbf54-12d7-48f1-82fb-
// 2f54411345c9") -- meaningless to a reader and a direct contributor to the page looking broken.
// The page's own cited reference design (docs/design/reference/DRIVER-SETTLEMENT-DETAIL-REFERENCE-
// 2026-09-05.html) specifies a human line spine instead: `S-<settlement>-<n>`, incrementing across
// every line-item table in render order (Earnings, Empty Miles, Additional Pay, Reimbursements,
// Deductions). Fixed by computing that spine once in SettlementDetailPage.tsx and threading it down
// as `seq_label`. This guard pins: the spine is computed and passed to all 3 previously-broken
// sections, and none of the 3 section components fell back to rendering the raw id as their primary
// Number-column value.
//
// Usage: node scripts/verify-settlement-detail-line-number-spine.mjs [--selftest]
import fs from "node:fs";

const LABEL = "verify-settlement-detail-line-number-spine";
const DETAIL_PAGE = "apps/frontend/src/pages/driver-finance/SettlementDetailPage.tsx";
const EXTRA_PAY = "apps/frontend/src/pages/driver-finance/components/ExtraPaySection.tsx";
const REIMBURSEMENTS = "apps/frontend/src/pages/driver-finance/components/ReimbursementsSection.tsx";
const DEDUCTIONS = "apps/frontend/src/pages/driver-finance/components/DeductionsSection.tsx";

export function detailPageComputesAndThreadsSpine(src) {
  return (
    /const seqLabel = \(\): string => \{/.test(src) &&
    /seqCounter \+= 1/.test(src) &&
    /<ExtraPaySection lines=\{extraWithSeq\}/.test(src) &&
    /<ReimbursementsSection lines=\{reimbursementsWithSeq\}/.test(src) &&
    /rows=\{deductionsWithSeq\}/.test(src)
  );
}

export function sectionRendersSpineNotRawId(src) {
  // The Number column must prefer seq_label; a bare "line.id ?? " / "row.id ?? " with nothing else
  // in front of it as the WHOLE render body is the regressed shape.
  return /seq_label \?\? (line|row)\.id \?\? "—"/.test(src);
}

function violations(files) {
  const errors = [];
  if (!detailPageComputesAndThreadsSpine(files.detailPage)) {
    errors.push("SettlementDetailPage.tsx no longer computes the seq_label spine and threads it to ExtraPaySection/ReimbursementsSection/DeductionsSection");
  }
  if (!sectionRendersSpineNotRawId(files.extraPay)) errors.push("ExtraPaySection.tsx's Number column no longer prefers seq_label over the raw row id");
  if (!sectionRendersSpineNotRawId(files.reimbursements)) errors.push("ReimbursementsSection.tsx's Number column no longer prefers seq_label over the raw row id");
  if (!sectionRendersSpineNotRawId(files.deductions)) errors.push("DeductionsSection.tsx's Number column no longer prefers seq_label over the raw row id");
  return errors;
}

function check(files) {
  const errors = violations(files);
  if (errors.length) throw new Error(errors.join("; "));
}

function loadFiles() {
  return {
    detailPage: fs.readFileSync(DETAIL_PAGE, "utf8"),
    extraPay: fs.readFileSync(EXTRA_PAY, "utf8"),
    reimbursements: fs.readFileSync(REIMBURSEMENTS, "utf8"),
    deductions: fs.readFileSync(DEDUCTIONS, "utf8"),
  };
}

const files = loadFiles();

if (process.argv.includes("--selftest")) {
  let caught = 0;
  const mutations = [
    { ...files, detailPage: files.detailPage.replace("<ExtraPaySection lines={extraWithSeq}", "<ExtraPaySection lines={extra}") },
    { ...files, detailPage: files.detailPage.replace("<ReimbursementsSection lines={reimbursementsWithSeq}", "<ReimbursementsSection lines={reimbursements}") },
    { ...files, detailPage: files.detailPage.replace("rows={deductionsWithSeq}", "rows={deductions}") },
    { ...files, extraPay: files.extraPay.replace('render: (line) => line.seq_label ?? line.id ?? "—",', 'render: (line) => line.id ?? "—",') },
    { ...files, reimbursements: files.reimbursements.replace('render: (line) => line.seq_label ?? line.id ?? "—",', 'render: (line) => line.id ?? "—",') },
    { ...files, deductions: files.deductions.replace('render: (row) => row.seq_label ?? row.id ?? "—",', 'render: (row) => row.id ?? "—",') },
  ];
  for (const mutated of mutations) {
    try {
      check(mutated);
    } catch {
      caught += 1;
      continue;
    }
    throw new Error("a mutation escaped detection");
  }
  check(files);
  console.log(`${LABEL} SELFTEST PASS (${caught}/${mutations.length} planted defects caught)`);
} else {
  check(files);
  console.log(`${LABEL} PASS -- driver settlement detail's Number column uses the S-<settlement>-<n> line spine, not the raw settlement_lines row uuid`);
}
