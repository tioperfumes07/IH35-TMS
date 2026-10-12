#!/usr/bin/env node
/**
 * verify-journal-entry-detail-page-uses-paritytable — qbo-parity (JournalEntryDetailPage surface)
 *
 * Financial surface (owner greenlit UI-only migration). The Postings grid on the journal-entry
 * detail page must use the shared ParityTable grammar (sort/resize/gear), not a hand-rolled
 * <table>. DISPLAY-ONLY migration: the column set/order (Line / Account / Class / Entity /
 * Side / Amount / Description), the cents→USD money formatting, the "No posting lines." empty
 * text, the ListErrorState detail-query error surface, and the "Journal entry not found."
 * missing-record surface must all be preserved 1:1. Read-only GL surface — this page posts
 * nothing and must stay that way (no new GL math, no posting changes). See the 443.99 note below:
 * the grid now lives in the shared PostingGrid, and the reversing void is the one allowed mutation.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-journal-entry-detail-page-uses-paritytable";
const PAGE = "apps/frontend/src/pages/accounting/journal-entries/JournalEntryDetailPage.tsx";

const GRID = "apps/frontend/src/components/accounting/PostingGrid.tsx";

// 443.99 class B (CC-2, 2026-10-12) — two owner-era redesigns made the old anchors stale.
//   old rule: the PAGE itself renders <ParityTable> with labels Line/Account/Class/Entity/Side/Amount/Description,
//             an inline `currency: "USD"` formatter, "No posting lines.", and contains no useMutation at all.
//   new rule: the page renders the shared <PostingGrid storageKey="journal-entry-detail-postings"> (imported from
//             components/accounting/PostingGrid), and PostingGrid.tsx carries every one of the old grid rules:
//             ParityTable, no hand-rolled <table>/<thead>, labels Line/Account/Class/Entity/Side/Debit/Credit/
//             Description, "No posting lines.", cents→USD via lib/money formatUsdCents. Mutations: the page may hold
//             exactly ONE useMutation and it must call voidJournalEntry (the reversing-void engine) behind
//             VoidReasonModal; it may import no posting/create/update JE API and do no GL math.
//   why: ACCT-F5919 (#20772) moved the postings onto the shared PostingGrid and split "Amount" into real QBO
//        Debit/Credit columns with a balance check; VIS-03 put the existing role-gated reversing void "inside the
//        transaction" on this page. Both are deliberate; the page still posts nothing. Not looser: a second
//        mutation, a non-void mutation, a posting import, a hand-rolled table, or a dropped column still fails.
const GRID_LABELS = ["Line", "Account", "Class", "Entity", "Side", "Debit", "Credit", "Description"];

function assertMigrated(src, grid) {
  const errors = [];
  if (!/import\s*\{\s*PostingGrid\s*\}\s*from\s*["'][./]+components\/accounting\/PostingGrid["']/.test(src)) {
    errors.push(`${PAGE}: must import the shared PostingGrid from components/accounting/PostingGrid`);
  }
  if (!/<PostingGrid\b[^>]*storageKey="journal-entry-detail-postings"/.test(src)) {
    errors.push(`${PAGE}: Postings grid must render <PostingGrid storageKey="journal-entry-detail-postings">`);
  }
  for (const [file, code] of [[PAGE, src], [GRID, grid]]) {
    if (/<table[\s>]/.test(code)) errors.push(`${file}: must not contain hand-rolled <table>`);
    if (/<thead[\s>]/.test(code)) errors.push(`${file}: must not contain hand-rolled <thead>`);
  }
  if (!/import\s*\{[^}]*\bParityTable\b[^}]*\}\s*from\s*["'][./]+parity\/ParityTable["']/.test(grid) || !/<ParityTable\b/.test(grid)) {
    errors.push(`${GRID}: must render the shared <ParityTable> (sort/resize/gear)`);
  }
  for (const label of GRID_LABELS) {
    if (!grid.includes(`label: "${label}"`)) errors.push(`${GRID}: missing column label: "${label}"`);
  }
  if (!grid.includes("No posting lines.")) errors.push(`${GRID}: must keep the "No posting lines." emptyText`);
  if (!/import\s*\{[^}]*\bformatUsdCents\b[^}]*\}\s*from\s*["'][./]+lib\/money["']/.test(grid) || !/\bformatUsdCents\(p\.amount_cents\)/.test(grid)) {
    errors.push(`${GRID}: must keep the cents→USD money formatting (formatUsdCents) for Debit/Credit`);
  }
  if (!src.includes("ListErrorState")) {
    errors.push(`${PAGE}: must render ListErrorState on detail-query load failure`);
  }
  if (!src.includes("Couldn't load journal entry")) {
    errors.push(`${PAGE}: must keep ListErrorState title for detail-query outage`);
  }
  if (!src.includes("Journal entry not found.")) {
    errors.push(`${PAGE}: must keep the "Journal entry not found." missing-record surface`);
  }
  const mutations = [...src.matchAll(/useMutation\(\{([\s\S]*?)\n  \}\);/g)];
  const calls = (src.match(/\buseMutation\(/g) ?? []).length;
  if (calls > 1 || mutations.length !== calls || (calls === 1 && !/mutationFn:[^\n]*\bvoidJournalEntry\(/.test(mutations[0][1]))) {
    errors.push(`${PAGE}: display-only GL surface — the only mutation allowed is the reversing void (voidJournalEntry)`);
  }
  if (calls === 1 && !src.includes("<VoidReasonModal")) {
    errors.push(`${PAGE}: the void mutation must sit behind VoidReasonModal (typed reason)`);
  }
  if (/\b(postJournalEntry|createJournalEntry|updateJournalEntry|postManualJournalEntry)\b/.test(src)) {
    errors.push(`${PAGE}: display-only GL surface — must not import a posting/create/update journal-entry API`);
  }
  return errors;
}

function selftest() {
  const goodPage = `
    import { useMutation, useQuery } from "@tanstack/react-query";
    import { voidJournalEntry } from "../../../api/accounting";
    import { ListErrorState } from "../../../components/ListErrorState";
    import { PostingGrid } from "../../../components/accounting/PostingGrid";
    import { VoidReasonModal } from "../../../components/accounting/VoidReasonModal";
    export function JournalEntryDetailPage() {
      const voidMutation = useMutation({
        mutationFn: (reason) => voidJournalEntry(id, companyId, reason),
      });
      if (isError) return <ListErrorState title="Couldn't load journal entry" status={0} onRetry={() => {}} />;
      if (!data) return <div>Journal entry not found.</div>;
      return (<>
        <VoidReasonModal open={open} onSubmit={(r) => voidMutation.mutateAsync(r)} />
        <PostingGrid postings={postings} storageKey="journal-entry-detail-postings" />
      </>);
    }
  `.replace(/\n    /g, "\n");
  const goodGrid = `
    import { ParityTable, type ParityColumn } from "../parity/ParityTable";
    import { formatUsdCents } from "../../lib/money";
    const columns = [
      { key: "line_sequence", label: "Line" },
      { key: "account_name", label: "Account" },
      { key: "description", label: "Description" },
      { key: "class_name", label: "Class" },
      { key: "debit", label: "Debit", render: (p) => (p.debit_or_credit === "debit" ? formatUsdCents(p.amount_cents) : "") },
      { key: "credit", label: "Credit", render: (p) => (p.debit_or_credit === "credit" ? formatUsdCents(p.amount_cents) : "") },
      { key: "entity_uuid", label: "Entity" },
      { key: "debit_or_credit", label: "Side" },
    ];
    <ParityTable rows={rows} columns={columns} emptyText="No posting lines." />
  `;
  const cases = [
    ["hand-rolled table on the page", goodPage.replace("<PostingGrid", "<table><thead /></table><PostingGrid"), goodGrid],
    ["page drops the shared grid", goodPage.replace(/<PostingGrid[^>]*\/>/, "<div />"), goodGrid],
    ["grid drops ParityTable", goodPage, goodGrid.replace("<ParityTable", "<table")],
    ["grid drops the Credit column", goodPage, goodGrid.replace('label: "Credit"', 'label: "Cr"')],
    ["grid loses USD formatting", goodPage, goodGrid.replaceAll("formatUsdCents(p.amount_cents)", "String(p.amount_cents)")],
    ["grid loses the empty text", goodPage, goodGrid.replace("No posting lines.", "")],
    ["a non-void mutation", goodPage.replace("voidJournalEntry(id, companyId, reason)", "postJournalEntry(body)"), goodGrid],
    ["a second mutation", goodPage.replace("if (isError)", "const m2 = useMutation({\n    mutationFn: (reason) => voidJournalEntry(id, companyId, reason),\n  });\n  if (isError)"), goodGrid],
    ["void without the reason modal", goodPage.replace(/<VoidReasonModal[\s\S]*?\/>/, ""), goodGrid],
    ["outage surface removed", goodPage.replace("Couldn't load journal entry", "Error"), goodGrid],
  ];
  const goodErrors = assertMigrated(goodPage, goodGrid);
  if (goodErrors.length) {
    console.error(`${LABEL} --selftest FAIL good fixture:`, goodErrors);
    process.exit(1);
  }
  const readOnly = assertMigrated(goodPage.replace(/const voidMutation[\s\S]*?\n  \}\);\n/, "").replace(/<VoidReasonModal[\s\S]*?\/>/, ""), goodGrid);
  if (readOnly.length) {
    console.error(`${LABEL} --selftest FAIL read-only page (no mutation) rejected:`, readOnly);
    process.exit(1);
  }
  let caught = 0;
  for (const [name, page, grid] of cases) {
    if (assertMigrated(page, grid).length) caught += 1;
    else console.error(`${LABEL} --selftest planted violation escaped — ${name}`);
  }
  if (caught !== cases.length) process.exit(1);
  console.log(`${LABEL} SELFTEST: ${caught}/${cases.length} planted violations caught --selftest PASS`);
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }
  const src = fs.readFileSync(path.join(ROOT, PAGE), "utf8");
  const grid = fs.readFileSync(path.join(ROOT, GRID), "utf8");
  const errors = assertMigrated(src, grid);
  if (errors.length) {
    console.error(`FAIL ${LABEL}:`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log(`OK ${LABEL}: ${PAGE} Postings render through the shared PostingGrid (ParityTable, Debit/Credit); error surfaces preserved; only mutation is the reversing void.`);
}

main();
