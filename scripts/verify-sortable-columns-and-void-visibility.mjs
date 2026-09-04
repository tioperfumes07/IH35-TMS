#!/usr/bin/env node
// verify:sortable-columns-and-void-visibility
// Owner law (2026-09-01), enumerated read-only by Cascade in
// docs/audit/SWEEP-SORTABLE-AND-VOID-VISIBILITY-2026-08-31.md before this guard was written, per
// instruction — the assertions below are built against that enumeration's own citations, not
// guessed. Two independent checks, both SHRINK-ONLY RATCHETS (this repo's established convention
// for a systemic, pre-existing, owner-acknowledged gap — see verify-a11y-input-labels.mjs and
// verify-no-selftest-mutates-tracked-source.mjs): the current violation counts are massive
// (Cascade: declared sortable 412/567 columns, ACTUALLY sorting under owner law ~0/412; every one
// of 8 voidable document types missing a detail void banner) and "owner designs fix; product PRs
// later" — a hard zero-tolerance gate would instantly redline every unrelated PR in the repo on
// debt nobody has been asked to pay down yet. This guard prevents the debt from growing and gives
// a concrete, live number to shrink as the real fix lands.
//
// A) SORTABLE
//   A1 — a ParityTable/DataTable column array entry with a `label`/`key` but no `sortable` key on
//        the same object literal. Ratchets the raw count.
//   A2 — a file that mounts ParityTable/DataTable AND references `has_more`/`hasMore` (the
//        server-pagination signal every server-paginated list in this repo already uses — see
//        InvoicesListPage.tsx:250) WITHOUT passing `sortMode="external"` to that mount. Internal
//        sort (ParityTable's own default — ParityTable.tsx:319) only reorders the fetched page;
//        exactly the invoice defect Cascade root-caused (InvoicesListPage.tsx:227-235 fetches no
//        offset/limit, relies on the backend's own default cap, then sorts only that page).
//   A3 — ParityTable sortable header <button> must use h-full w-full (SWEEP-A / SORT-01 hit target).
//        Label-only inline-flex left most of <th> dead; resize grip keeps the right w-2 edge only.
//
// B) VOID VISIBILITY
//   For the 6 document types that use the literal 'void' domain (not 'cancel' — Cascade
//   distinguishes settlements/loads as a different domain, out of scope here): invoices, bills,
//   bill payments, customer payments, expenses, manual journal entries.
//   B1 — the detail page for a voided document renders NO void banner (no code path that reads
//        `voided_at`/`void_reason` and renders them together, near the top of the page).
//   B2 — the list page for that document type has NO void/voided filter option.
//   Ratchets the count of document types failing each check (max 6 each).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FRONTEND_SRC = path.join(ROOT, "apps/frontend/src");
const BASELINE_REL = "scripts/.sortable-void-visibility-baseline.json";
const SELF_PATH = fileURLToPath(import.meta.url);

function walk(dir, out = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === "__tests__") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, out);
    } else if (entry.isFile() && /\.tsx$/.test(entry.name) && !/\.(test|spec)\.tsx$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

// --- A1: column entries missing `sortable` -------------------------------------------------
// A column-array entry, loosely: `{ ... label: "X" ... }` or `{ ... key: "x" ... }` up to the
// next top-level `},` at the same nesting depth. Heuristic, not a parser — matches this repo's
// existing verify-a11y-input-labels.mjs class of check.
function countMissingSortableDeclarations(src) {
  if (!/\b(ParityTable|DataTable)\b/.test(src)) return 0;
  const COLUMN_OBJECT_RE = /\{[^{}]*?\b(?:label|key)\s*:\s*(?:"[^"]*"|'[^']*'|`[^`]*`)[^{}]*?\}/g;
  let n = 0;
  let m;
  while ((m = COLUMN_OBJECT_RE.exec(src)) !== null) {
    const block = m[0];
    // Skip obvious non-column objects: no comma-separated multi-field shape, or clearly an
    // action/render-only column (has `render:`/`Cell:`/`actions` and no `label`) is still counted
    // if it declares a label — a labeled column is a sortable candidate by this repo's own
    // convention (ParityTable/DataTable both gate the header button on `column.sortable`).
    if (!/\blabel\s*:/.test(block)) continue; // key-only entries (e.g. row config) are not columns
    if (!/\bsortable\s*:/.test(block)) n++;
  }
  return n;
}

// --- A2: internal sort on a server-paginated mount ------------------------------------------
function isServerPaginatedWithoutExternalSort(src) {
  if (!/\b(ParityTable|DataTable)\b/.test(src)) return false;
  const paginated = /\bhas_?[Mm]ore\b/.test(src);
  if (!paginated) return false;
  return !/sortMode\s*=\s*"external"/.test(src);
}

function scanSortable() {
  const files = walk(FRONTEND_SRC);
  let missingSortableCount = 0;
  let internalSortOnPaginatedCount = 0;
  const internalSortFiles = [];
  for (const file of files) {
    const src = fs.readFileSync(file, "utf8");
    missingSortableCount += countMissingSortableDeclarations(src);
    if (isServerPaginatedWithoutExternalSort(src)) {
      internalSortOnPaginatedCount++;
      internalSortFiles.push(path.relative(ROOT, file));
    }
  }
  return { missingSortableCount, internalSortOnPaginatedCount, internalSortFiles };
}

const PARITY_TABLE_PATH = "apps/frontend/src/components/parity/ParityTable.tsx";

/** A3 — ParityTable sort header must fill the cell, not just the label (SORT-01 / SWEEP-A). */
function parityTableSortHitTargetOk(src) {
  const body =
    src ??
    (fs.existsSync(path.join(ROOT, PARITY_TABLE_PATH))
      ? fs.readFileSync(path.join(ROOT, PARITY_TABLE_PATH), "utf8")
      : null);
  if (body == null) {
    return { ok: false, reason: `${PARITY_TABLE_PATH} missing` };
  }
  // Matches both `column.sortable ? (` and the later `column.sortable !== false ? (` shape (SORT-01,
  // landed via a parallel branch 2026-08-31) — the guard's invariant is the button's own h-full w-full
  // hit target, not the exact spelling of the sortable condition.
  const m = body.match(/column\.sortable[^?\n]*\?\s*\(\s*<button[\s\S]{0,1200}?onClick=\{\(\) => toggleSort\(key\)\}/);
  if (!m) return { ok: false, reason: "could not locate sortable header <button>" };
  const block = m[0];
  if (!/\bw-full\b/.test(block) || !/\bh-full\b/.test(block)) {
    return { ok: false, reason: "sortable header button lost h-full w-full — label-only hit target regression" };
  }
  return { ok: true };
}

// --- B: void visibility, 6 literal-'void' document types ------------------------------------
const VOID_DOC_TYPES = [
  {
    name: "invoices",
    listFile: "apps/frontend/src/pages/accounting/InvoicesListPage.tsx",
    detailFile: "apps/frontend/src/pages/accounting/InvoiceDetailPage.tsx",
  },
  {
    name: "bills",
    listFile: "apps/frontend/src/pages/accounting/BillsPage.tsx",
    detailFile: "apps/frontend/src/pages/accounting/BillDetailPage.tsx",
  },
  {
    name: "bill_payments",
    listFile: "apps/frontend/src/pages/accounting/BillPaymentsListPage.tsx",
    detailFile: "apps/frontend/src/pages/accounting/BillPaymentDetailPage.tsx",
  },
  {
    name: "customer_payments",
    listFile: "apps/frontend/src/pages/accounting/PaymentsListPage.tsx",
    detailFile: "apps/frontend/src/pages/accounting/PaymentDetailPage.tsx",
  },
  {
    name: "expenses",
    listFile: "apps/frontend/src/pages/accounting/ExpensesListPage.tsx",
    detailFile: "apps/frontend/src/pages/accounting/ExpenseDetailPage.tsx",
  },
  {
    name: "manual_journal_entries",
    listFile: "apps/frontend/src/pages/accounting/ManualJEListPage.tsx",
    detailFile: "apps/frontend/src/pages/accounting/JournalEntryDetailPage.tsx",
  },
];

function readIfExists(relPath) {
  const abs = path.join(ROOT, relPath);
  return fs.existsSync(abs) ? fs.readFileSync(abs, "utf8") : null;
}

// A "void banner" is code that reads BOTH voided_at and void_reason (however named) and renders
// them together — a loose but real signal: both identifiers present within ~400 chars of each
// other, near a conditional render (an `&&` or ternary gating on the voided/at field).
function hasVoidBanner(detailSrc) {
  if (detailSrc == null) return false;
  const VOIDED_AT_RE = /\bvoided_at\b/g;
  let m;
  while ((m = VOIDED_AT_RE.exec(detailSrc)) !== null) {
    const windowText = detailSrc.slice(Math.max(0, m.index - 400), m.index + 400);
    if (/\bvoid_reason\b/.test(windowText) && /(&&|\?)/.test(windowText)) {
      return true;
    }
  }
  return false;
}

// A real filter option, not just any string mention of "void"/"voided" anywhere in the file
// (e.g. a status-equality guard like `bill.status !== "voided"` is not a filter — confirmed live:
// BillPaymentsListPage.tsx:122 has exactly that pattern with no actual filter option anywhere in
// the file). Matches the concrete shapes this repo actually uses: a JSX <option value="void...">,
// a `{ value: "void...", label: ... }` STATUS_OPTIONS-style array entry, or a status Set literal
// listing "void"/"voided" alongside other short status words.
function hasVoidFilter(listSrc) {
  if (listSrc == null) return false;
  if (/<option\s+value=["'`]void(?:ed)?["'`]/.test(listSrc)) return true;
  if (/\bvalue\s*:\s*["'`]void(?:ed)?["'`]\s*,\s*label\s*:/.test(listSrc)) return true;
  if (/(?:Set\(\[|new Set\(\[)[^\]]*["'`]void(?:ed)?["'`]/.test(listSrc)) return true;
  return false;
}

function scanVoidVisibility() {
  const missingBanner = [];
  const missingFilter = [];
  for (const doc of VOID_DOC_TYPES) {
    const detailSrc = readIfExists(doc.detailFile);
    const listSrc = readIfExists(doc.listFile);
    if (!hasVoidBanner(detailSrc)) missingBanner.push(doc.name);
    if (!hasVoidFilter(listSrc)) missingFilter.push(doc.name);
  }
  return { missingBanner, missingFilter };
}

function loadBaseline() {
  const p = path.join(ROOT, BASELINE_REL);
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return { missingSortableCount: 0, internalSortOnPaginatedCount: 0, missingBannerCount: 0, missingFilterCount: 0 };
  }
}

function run() {
  const sortable = scanSortable();
  const voidVis = scanVoidVisibility();
  const baseline = loadBaseline();

  const hitTarget = parityTableSortHitTargetOk();
  if (!hitTarget.ok) {
    console.error(`verify:sortable-columns-and-void-visibility FAIL (A3) — ${hitTarget.reason}`);
    process.exit(1);
  }

  const failures = [];
  console.log(
    `verify:sortable-columns-and-void-visibility — ` +
      `A1 missing-sortable=${sortable.missingSortableCount} (baseline ${baseline.missingSortableCount}) · ` +
      `A2 internal-sort-on-paginated=${sortable.internalSortOnPaginatedCount} (baseline ${baseline.internalSortOnPaginatedCount}) · ` +
      `B1 missing-void-banner=${voidVis.missingBanner.length}/6 (baseline ${baseline.missingBannerCount}) · ` +
      `B2 missing-void-filter=${voidVis.missingFilter.length}/6 (baseline ${baseline.missingFilterCount})`
  );

  if (sortable.missingSortableCount > baseline.missingSortableCount) {
    failures.push(
      `A1: ${sortable.missingSortableCount - baseline.missingSortableCount} NEW ParityTable/DataTable ` +
        `column(s) with a label but no \`sortable\` — above baseline ${baseline.missingSortableCount}.`
    );
  }
  if (sortable.internalSortOnPaginatedCount > baseline.internalSortOnPaginatedCount) {
    failures.push(
      `A2: ${sortable.internalSortOnPaginatedCount - baseline.internalSortOnPaginatedCount} NEW server-paginated ` +
        `list(s) relying on internal sort (no sortMode="external") — above baseline ${baseline.internalSortOnPaginatedCount}: ` +
        sortable.internalSortFiles.join(", ")
    );
  }
  if (voidVis.missingBanner.length > baseline.missingBannerCount) {
    failures.push(
      `B1: ${voidVis.missingBanner.length} of 6 voidable document detail pages have no void banner ` +
        `(above baseline ${baseline.missingBannerCount}): ${voidVis.missingBanner.join(", ")}`
    );
  }
  if (voidVis.missingFilter.length > baseline.missingFilterCount) {
    failures.push(
      `B2: ${voidVis.missingFilter.length} of 6 voidable document lists have no void filter ` +
        `(above baseline ${baseline.missingFilterCount}): ${voidVis.missingFilter.join(", ")}`
    );
  }

  if (failures.length > 0) {
    console.error("verify:sortable-columns-and-void-visibility FAIL — new regressions above baseline:");
    for (const f of failures) console.error("  ✗ " + f);
    process.exit(1);
  }
  console.log("verify:sortable-columns-and-void-visibility PASS (no NEW regression above the ratcheted baseline)");
}

if (process.argv.includes("--selftest")) {
  // No file on disk is ever touched — every assertion is a pure in-memory check against
  // fabricated source strings, matching this repo's convention for this class of guard.
  const assert = await import("node:assert/strict").then((m) => m.default);

  // A1: a labeled column with no sortable key is counted; one that has sortable is not.
  const a1Src = `
    import { ParityTable } from "../../components/parity/ParityTable";
    const columns = [
      { key: "a", label: "A" },
      { key: "b", label: "B", sortable: true },
    ];
  `;
  assert.equal(countMissingSortableDeclarations(a1Src), 1, "exactly one labeled column lacks sortable");

  // A2: has_more present + no sortMode="external" => flagged; with sortMode="external" => not.
  const a2BadSrc = `
    import { ParityTable } from "../../components/parity/ParityTable";
    const hasMore = query.data?.has_more;
    <ParityTable columns={columns} rows={rows} />
  `;
  assert.equal(isServerPaginatedWithoutExternalSort(a2BadSrc), true, "paginated + internal sort must be flagged");
  const a2GoodSrc = `
    import { ParityTable } from "../../components/parity/ParityTable";
    const hasMore = query.data?.has_more;
    <ParityTable columns={columns} rows={rows} sortMode="external" onSortChange={onSortChange} />
  `;
  assert.equal(isServerPaginatedWithoutExternalSort(a2GoodSrc), false, "external sort must not be flagged");

  // B1: voided_at + void_reason near a conditional => banner detected; voided_at alone => not.
  const bannerSrc = `
    {data.voided_at && (
      <div className="void-banner">Voided {data.voided_at} — {data.void_reason}</div>
    )}
  `;
  assert.equal(hasVoidBanner(bannerSrc), true, "a real voided_at + void_reason conditional must be detected");
  const noBannerSrc = `<StatusBadge status={data.voided_at ? "voided" : data.status} />`;
  assert.equal(hasVoidBanner(noBannerSrc), false, "a bare voided_at status check must not count as a banner");

  // B2: a real filter option (JSX <option>, STATUS_OPTIONS-style entry, or a status Set) is
  // detected; a bare status-equality guard (the confirmed BillPaymentsListPage.tsx false-positive
  // trap) must NOT be mistaken for a filter.
  assert.equal(hasVoidFilter(`<option value="voided">Voided</option>`), true, "a JSX void option must be detected");
  assert.equal(
    hasVoidFilter(`const STATUS_OPTIONS = [{ value: "void", label: "Void" }];`),
    true,
    "a STATUS_OPTIONS-style void entry must be detected"
  );
  assert.equal(
    hasVoidFilter(`const STATUS_FILTER_VALUES = new Set(["unpaid", "paid", "voided"]);`),
    true,
    "a status Set containing voided must be detected"
  );
  assert.equal(
    hasVoidFilter(`return rows.filter((bill) => bill.status !== "voided");`),
    false,
    "a bare status-equality guard must NOT be mistaken for a filter option"
  );

  // A3: ParityTable sort button must stay h-full w-full (not label-only).
  const a3Good = `{column.sortable ? (
<button type="button" className="inline-flex h-full w-full items-center gap-1" onClick={() => toggleSort(key)}>Label</button>) : null}`;
  assert.equal(parityTableSortHitTargetOk(a3Good).ok, true, "A3 good shape passes");
  const a3Bad = `{column.sortable ? (
<button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort(key)}>Label</button>) : null}`;
  assert.equal(parityTableSortHitTargetOk(a3Bad).ok, false, "A3 label-only regression fails");

  console.log("verify:sortable-columns-and-void-visibility --selftest PASS");
  process.exit(0);
}

run();
