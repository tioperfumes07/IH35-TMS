#!/usr/bin/env node
/** @matrix-built {"modules":["accounting","home","inventory","reports"],"cols":["invoice"],"leafRe":"^(accounting\\.modal\\.invoice_create|accounting\\.parity\\.invoice_create|accounting\\.modal\\.driver_damage_invoice|accounting\\.modal\\.driver_misc_invoice|accounting\\.modal\\.manual_invoice|accounting\\.parity\\.invoice_type_modal_base|invoices\\.create)$","task":"LINK-F5191-INVOICE-COLUMN-HONESTY"} */
/**
 * LINK-F5191 — invoice Required-column honesty audit, full sweep. Two parallel Explore
 * investigations covered accounting (8 leaves) and a mixed customers/factoring/finance/home/
 * inventory/reports 11-leaf batch. Of 19 total leaves: 7 were already correctly built (no
 * action, cited for the record -- invoices.list, customers:md.new_transaction/detail.billing/
 * detail.billing.record_payment, factoring:submit.queue/factoring.wizard.batch,
 * finance:nav.ar_ap_aging), 7 were real gaps closing to 2 code fixes, and 5 were
 * false-required (each verified against a real absence of any owning accounting.invoices
 * row in the relevant flow).
 *
 * BUILT (7 leaves close to 2 files, one root cause: a real accounting.invoices id was already
 * available post-create -- already used functionally in patchInvoice/addInvoiceLine calls --
 * but the surface tore itself down (navigated away / closed) in the same tick as onCreated
 * fired, before any EntityLink could be shown):
 *   - InvoiceTypeModalBase.tsx (the shared create shell wrapped by DriverDamageInvoiceModal.tsx
 *     / DriverMiscInvoiceModal.tsx / ManualInvoiceModal.tsx, closing
 *     accounting.modal.driver_damage_invoice / .driver_misc_invoice / .manual_invoice /
 *     accounting.parity.invoice_type_modal_base): now holds createdInvoice state and renders
 *     an EntityLink kind="invoice" confirmation with a Done button; onCreated (which the
 *     parent InvoicesListPage.tsx uses to close-and-navigate) now fires only after Done.
 *   - InvoiceCreateModal.tsx (closing accounting.modal.invoice_create + .parity.invoice_create
 *     + invoices.create): the "from an existing load" step's own direct createFromLoad() call
 *     gets the same confirmation-step treatment; the "blank invoice" step delegates to
 *     InvoiceCreateBlankPage -> ManualInvoiceModal -> InvoiceTypeModalBase and inherits its
 *     confirmation from the fix above with no separate code needed.
 *
 * RECLASSIFIED false-required (dropped, not force-built -- 5 leaves across 3 modules):
 *   home:surface.quick_actions (pure launcher chrome, navigates away on create);
 *   inventory:assignments.banner/search/vendor_link (vendor_invoice_number is free text with
 *   no FK to accounting.invoices); reports:report.ar_aging (customer-bucket rollup, no
 *   invoice_id per row).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TYPE_MODAL_BASE = "apps/frontend/src/pages/accounting/modals/InvoiceTypeModalBase.tsx";
const CREATE_MODAL = "apps/frontend/src/pages/accounting/InvoiceCreateModal.tsx";
const FILES = [TYPE_MODAL_BASE, CREATE_MODAL];
const LABEL = "verify-invoice-required-honest";
const SELFTEST = process.argv.includes("--selftest");

const REQUIRED_FILES = {
  accounting: "docs/specs/scoreboard/modules/accounting.required.json",
  home: "docs/specs/scoreboard/modules/home.required.json",
  inventory: "docs/specs/scoreboard/modules/inventory.required.json",
  reports: "docs/specs/scoreboard/modules/reports.required.json",
};

const DROPPED = [
  ["home", "surface.quick_actions"],
  ["inventory", "assignments.banner"],
  ["inventory", "assignments.search"],
  ["inventory", "assignments.vendor_link"],
  ["reports", "report.ar_aging"],
];

const KEEP_REQUIRED = [
  ["accounting", "invoices.create"],
  ["accounting", "accounting.modal.invoice_create"],
  ["accounting", "accounting.modal.driver_damage_invoice"],
  ["accounting", "accounting.modal.driver_misc_invoice"],
  ["accounting", "accounting.modal.manual_invoice"],
  ["accounting", "accounting.parity.invoice_create"],
  ["accounting", "accounting.parity.invoice_type_modal_base"],
];

function readJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, rel), "utf8"));
}
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

export function assertInvoiceHonest(sources, docs) {
  const src = {};
  for (const rel of FILES) src[rel] = sources?.[rel] ?? read(rel);
  const problems = [];

  for (const [mod, id] of DROPPED) {
    const leaf = (docs[mod].leaves || []).find((l) => l.id === id);
    if (!leaf) { problems.push(`${mod}:${id} missing from required.json`); continue; }
    if ((leaf.required || []).includes("invoice")) problems.push(`${mod}:${id} must not require invoice`);
  }
  for (const [mod, id] of KEEP_REQUIRED) {
    const leaf = (docs[mod].leaves || []).find((l) => l.id === id);
    if (!leaf) { problems.push(`${mod}:${id} missing from required.json`); continue; }
    if (!(leaf.required || []).includes("invoice")) problems.push(`${mod}:${id} must keep invoice`);
  }

  const typeModalBase = src[TYPE_MODAL_BASE];
  const createModal = src[CREATE_MODAL];

  if (!/setCreatedInvoice\(/.test(typeModalBase)) problems.push(`${TYPE_MODAL_BASE}: must hold created invoice in state`);
  if (!/kind="invoice"/.test(typeModalBase)) problems.push(`${TYPE_MODAL_BASE}: must EntityLink kind=invoice for the created invoice`);
  if (!/setCreatedFromLoad\(/.test(createModal)) problems.push(`${CREATE_MODAL}: must hold created-from-load invoice in state`);
  if (!/kind="invoice"/.test(createModal)) problems.push(`${CREATE_MODAL}: must EntityLink kind=invoice for the from-load confirmation`);

  return problems;
}

function selftest() {
  const good = {
    [TYPE_MODAL_BASE]: `
      const [createdInvoice, setCreatedInvoice] = useState(null);
      setCreatedInvoice({ id: created.id, display_id: created.display_id ?? null });
      <EntityLink kind="invoice" id={createdInvoice.id} label="x" />
    `,
    [CREATE_MODAL]: `
      const [createdFromLoad, setCreatedFromLoad] = useState(null);
      setCreatedFromLoad({ id: result.invoice.id, display_id: result.invoice.display_id ?? null });
      <EntityLink kind="invoice" id={createdFromLoad.id} label="x" />
    `,
  };
  const docs = {};
  for (const [mod, rel] of Object.entries(REQUIRED_FILES)) docs[mod] = readJson(rel);

  const goodProblems = assertInvoiceHonest(good, docs);
  if (goodProblems.length) {
    console.error(`${LABEL} SELFTEST FAIL — known-good fixture flagged: ${goodProblems.join("; ")}`);
    process.exit(1);
  }

  let mutationCount = 0;
  const sourceMutations = [
    { ...good, [TYPE_MODAL_BASE]: good[TYPE_MODAL_BASE].replace("setCreatedInvoice(", "setXxx(") },
    { ...good, [TYPE_MODAL_BASE]: good[TYPE_MODAL_BASE].replace('kind="invoice"', "") },
    { ...good, [CREATE_MODAL]: good[CREATE_MODAL].replace("setCreatedFromLoad(", "setXxx(") },
    { ...good, [CREATE_MODAL]: good[CREATE_MODAL].replace('kind="invoice"', "") },
  ];
  for (const mutated of sourceMutations) {
    mutationCount++;
    if (assertInvoiceHonest(mutated, docs).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — source mutation ${mutationCount} escaped detection`);
      process.exit(1);
    }
  }
  for (const [mod, id] of DROPPED) {
    mutationCount++;
    const mutatedDocs = structuredClone(docs);
    const leaf = mutatedDocs[mod].leaves.find((l) => l.id === id);
    leaf.required = [...new Set([...(leaf.required || []), "invoice"])];
    if (assertInvoiceHonest(good, mutatedDocs).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — mutation escaped detection: re-add invoice to ${mod}:${id}`);
      process.exit(1);
    }
  }
  for (const [mod, id] of KEEP_REQUIRED) {
    mutationCount++;
    const mutatedDocs = structuredClone(docs);
    const leaf = mutatedDocs[mod].leaves.find((l) => l.id === id);
    leaf.required = (leaf.required || []).filter((c) => c !== "invoice");
    if (assertInvoiceHonest(good, mutatedDocs).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — mutation escaped detection: drop invoice from ${mod}:${id}`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} SELFTEST PASS — ${mutationCount} mutations all detected`);
  process.exit(0);
}

if (SELFTEST) selftest();

const liveDocs = {};
for (const [mod, rel] of Object.entries(REQUIRED_FILES)) liveDocs[mod] = readJson(rel);
const failures = assertInvoiceHonest(undefined, liveDocs);
if (failures.length) {
  console.error(`${LABEL} FAIL:\n${failures.map((f) => ` - ${f}`).join("\n")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS`);
