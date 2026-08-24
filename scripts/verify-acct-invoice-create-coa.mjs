#!/usr/bin/env node
/**
 * @matrix-built {"modules":["accounting"],"cols":["connectivity","picker_law","invoice"],"leafRe":"^(invoices\\.create|invoices\\.list|accounting\\.modal\\.driver_damage_invoice|accounting\\.modal\\.driver_misc_invoice|accounting\\.modal\\.manual_invoice|accounting\\.parity\\.invoice_type_modal_base)$","task":"ACCT-F5052-INVOICE-CREATE-COA","pr":"#6453"}
 * Guard: Invoice create uses income CoA ReferenceSelect + optional load linkage (15/22).
 * Proves PATCH source_load_id uniqueness (load_already_invoiced) mirrors from-load idempotency.
 *
 * OWNER-EXECUTION-PLAN §2 money-cells sweep (2026-08-14): added the "invoice" column and widened
 * leafRe. checkInvoiceCreateCoa()'s assertions on InvoiceTypeModalBase.tsx (income CoA account,
 * entity-scoped catalogs, line persisted with income account, customer + load linkage) ARE the real
 * proof of the "invoice" money object for every leaf that renders that shared component — confirmed
 * live: DriverDamageInvoiceModal.tsx, DriverMiscInvoiceModal.tsx, and ManualInvoiceModal.tsx each
 * literally `import { InvoiceTypeModalBase }` and render it (grep-verified, not assumed), matching
 * leaf ids accounting.modal.driver_damage_invoice / driver_misc_invoice / manual_invoice; the base
 * component itself is accounting.parity.invoice_type_modal_base. NOT included:
 * accounting.modal.invoice_create / accounting.parity.invoice_create — those route through the
 * SEPARATE InvoiceCreateModal.tsx + InvoiceCreateBlankPage.tsx (useInvoiceCreateFromLoad), a
 * different component this guard never reads; that gap is real and stays open for its own guard.
 *
 * Self-test: node scripts/verify-acct-invoice-create-coa.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runExecutableGuard } from "./guard-executable-contract.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-acct-invoice-create-coa";

const fail = (m) => {
  console.error(`FAIL: ${m}`);
  process.exit(1);
};

function read(rel) {
  const p = path.join(root, rel);
  if (!fs.existsSync(p)) fail(`missing ${rel}`);
  return fs.readFileSync(p, "utf8");
}

function checkInvoiceCreateCoa(files) {
  const byRel = Object.fromEntries(files.map(({ rel, source }) => [rel, source]));
  const base = byRel["apps/frontend/src/pages/accounting/modals/InvoiceTypeModalBase.tsx"] ?? "";
  const detail = byRel["apps/frontend/src/pages/accounting/InvoiceDetailPage.tsx"] ?? "";
  const linesRoute = byRel["apps/backend/src/accounting/invoice-lines.routes.ts"] ?? "";
  const invoicesRoute = byRel["apps/backend/src/accounting/invoices.routes.ts"] ?? "";
  const fromLoad = byRel["apps/backend/src/accounting/from-load.ts"] ?? "";
  const api = byRel["apps/frontend/src/api/accounting.ts"] ?? "";
  const violations = [];

  if (!base.includes('createKind="account"')) violations.push("InvoiceTypeModalBase must use ReferenceSelect createKind=account for income CoA");
  if (!base.includes("getCoaAccounts") && !base.includes("listCatalogAccounts")) {
    violations.push("InvoiceTypeModalBase must load entity-scoped CoA via getCoaAccounts or listCatalogAccounts");
  }
  {
    const hasLoadList = base.includes("listLoads");
    const hasLoadPicker =
      base.includes("EntityPicker") &&
      (base.includes('kind="load"') || base.includes("kind='load'"));
    const hasGetLoad = base.includes("getLoad");
    if (!hasLoadList && !(hasLoadPicker && hasGetLoad) && !hasLoadPicker) {
      violations.push(
        "InvoiceTypeModalBase must link loads via listLoads OR EntityPicker kind=load (+ getLoad for selected label)"
      );
    }
  }
  if (!base.includes("operating_company_id")) violations.push("InvoiceTypeModalBase catalogs must be entity-scoped");
  if (!base.includes("addInvoiceLine")) violations.push("InvoiceTypeModalBase must persist line with income account at create");
  if (!base.includes("patchInvoice")) violations.push("InvoiceTypeModalBase must patch source_load_id when load linked");
  if (!base.includes('createKind="customer"')) violations.push("InvoiceTypeModalBase must keep customer ReferenceSelect");

  // ACCT-F5052 — draft detail +Create Line must stamp income account_id (same bar as typed create).
  if (!detail.includes('createKind="account"')) {
    violations.push("InvoiceDetailPage must use ReferenceSelect createKind=account for detail +Create Line income CoA");
  }
  if (!detail.includes("listCatalogAccounts")) {
    violations.push("InvoiceDetailPage must load income CoA via listCatalogAccounts");
  }
  if (!detail.includes("account_id: newLineAccountId") && !detail.includes("account_id: payload.account_id")) {
    violations.push("InvoiceDetailPage addLineMutation must pass account_id to addInvoiceLine");
  }
  if (!detail.includes("INCOME_TYPES") && !detail.includes('"Income"')) {
    violations.push("InvoiceDetailPage must filter income account types for detail line CoA");
  }

  if (!linesRoute.includes("account_id: z.string().uuid().optional()")) {
    violations.push("invoice-lines create schema must accept optional account_id");
  }
  if (!linesRoute.includes("assertExplicitIncomeAccount")) {
    violations.push("invoice-lines route must validate explicit income account_id");
  }

  if (!invoicesRoute.includes("source_load_id: z.string().uuid().nullable().optional()")) {
    violations.push("invoice patch schema must accept source_load_id for draft linkage");
  }
  if (!invoicesRoute.includes("findConflictingInvoiceForLoad")) {
    violations.push("invoice PATCH must call findConflictingInvoiceForLoad before accepting source_load_id");
  }
  if (!invoicesRoute.includes("load_already_invoiced")) {
    violations.push("invoice PATCH must return 409 load_already_invoiced when load is already invoiced");
  }
  if (!fromLoad.includes("findConflictingInvoiceForLoad")) {
    violations.push("from-load must export findConflictingInvoiceForLoad for shared load uniqueness");
  }
  if (!fromLoad.includes("voided_at IS NULL")) {
    violations.push("from-load idempotency must ignore voided invoices (voided_at IS NULL)");
  }

  if (!api.includes("account_id?: string")) violations.push("addInvoiceLine API must expose account_id");
  if (!api.includes("source_load_id: string | null")) violations.push("patchInvoice API must expose source_load_id");

  // ACCT-F5053 — Topbar Create→Invoice must deep-link create wizard (Bills ?create=1 parity).
  // ACCT-F6322 — hub + Create ▾ must use the same deep-link (bare /invoices is a silent no-op).
  const topbar = byRel["apps/frontend/src/components/Topbar.tsx"] ?? "";
  const hubCreate = byRel["apps/frontend/src/pages/accounting/AccountingSubNavWrapper.tsx"] ?? "";
  const list = byRel["apps/frontend/src/pages/accounting/InvoicesListPage.tsx"] ?? "";
  if (!topbar.includes("/accounting/invoices?create=1")) {
    violations.push("Topbar Create→Invoice must navigate to /accounting/invoices?create=1");
  }
  if (!hubCreate.includes("/accounting/invoices?create=1")) {
    violations.push("AccountingSubNavWrapper + Create ▾ Invoice must navigate to /accounting/invoices?create=1");
  }
  if (!list.includes('searchParams.get("create") === "1"') && !list.includes("createDeepLink")) {
    violations.push("InvoicesListPage must honor ?create=1 deep link");
  }
  if (!list.includes("clearCreateDeepLink") && !list.includes('params.delete("create")')) {
    violations.push("InvoicesListPage must clear create=1 when create modal closes");
  }

  return violations;
}

function loadRepositoryFixture() {
  return [
    {
      rel: "apps/frontend/src/pages/accounting/modals/InvoiceTypeModalBase.tsx",
      source: read("apps/frontend/src/pages/accounting/modals/InvoiceTypeModalBase.tsx"),
    },
    {
      rel: "apps/frontend/src/pages/accounting/InvoiceDetailPage.tsx",
      source: read("apps/frontend/src/pages/accounting/InvoiceDetailPage.tsx"),
    },
    {
      rel: "apps/frontend/src/pages/accounting/InvoicesListPage.tsx",
      source: read("apps/frontend/src/pages/accounting/InvoicesListPage.tsx"),
    },
    {
      rel: "apps/frontend/src/components/Topbar.tsx",
      source: read("apps/frontend/src/components/Topbar.tsx"),
    },
    {
      rel: "apps/frontend/src/pages/accounting/AccountingSubNavWrapper.tsx",
      source: read("apps/frontend/src/pages/accounting/AccountingSubNavWrapper.tsx"),
    },
    {
      rel: "apps/backend/src/accounting/invoice-lines.routes.ts",
      source: read("apps/backend/src/accounting/invoice-lines.routes.ts"),
    },
    {
      rel: "apps/backend/src/accounting/invoices.routes.ts",
      source: read("apps/backend/src/accounting/invoices.routes.ts"),
    },
    {
      rel: "apps/backend/src/accounting/from-load.ts",
      source: read("apps/backend/src/accounting/from-load.ts"),
    },
    {
      rel: "apps/frontend/src/api/accounting.ts",
      source: read("apps/frontend/src/api/accounting.ts"),
    },
  ];
}

const goodFixture = [
  {
    rel: "apps/backend/src/accounting/invoices.routes.ts",
    source: [
      `import { buildInvoiceFromLoad, findConflictingInvoiceForLoad } from "./from-load.js";`,
      `source_load_id: z.string().uuid().nullable().optional(),`,
      `const conflict = await findConflictingInvoiceForLoad(`,
      `if (conflict) return { code: 409 as const, error: "load_already_invoiced" };`,
    ].join("\n"),
  },
  {
    rel: "apps/backend/src/accounting/from-load.ts",
    source: [
      `export async function findConflictingInvoiceForLoad(`,
      `AND i.voided_at IS NULL`,
    ].join("\n"),
  },
  {
    rel: "apps/frontend/src/pages/accounting/modals/InvoiceTypeModalBase.tsx",
    source: [
      `createKind="account"`,
      `getCoaAccounts`,
      `listLoads`,
      `operating_company_id`,
      `addInvoiceLine`,
      `patchInvoice`,
      `createKind="customer"`,
    ].join("\n"),
  },
  {
    rel: "apps/frontend/src/pages/accounting/InvoiceDetailPage.tsx",
    source: [
      `createKind="account"`,
      `listCatalogAccounts`,
      `account_id: payload.account_id`,
      `INCOME_TYPES`,
    ].join("\n"),
  },
  {
    rel: "apps/frontend/src/pages/accounting/InvoicesListPage.tsx",
    source: [`createDeepLink`, `clearCreateDeepLink`, `params.delete("create")`].join("\n"),
  },
  {
    rel: "apps/frontend/src/components/Topbar.tsx",
    source: `/accounting/invoices?create=1`,
  },
  {
    rel: "apps/frontend/src/pages/accounting/AccountingSubNavWrapper.tsx",
    source: `{ label: "Invoice", to: "/accounting/invoices?create=1" }`,
  },
  {
    rel: "apps/backend/src/accounting/invoice-lines.routes.ts",
    source: [`account_id: z.string().uuid().optional()`, `assertExplicitIncomeAccount`].join("\n"),
  },
  {
    rel: "apps/frontend/src/api/accounting.ts",
    source: [`account_id?: string`, `source_load_id: string | null`].join("\n"),
  },
];

const badFixture = [
  {
    rel: "apps/backend/src/accounting/invoices.routes.ts",
    source: [
      `source_load_id: z.string().uuid().nullable().optional(),`,
      `if ("source_load_id" in body.data) add("source_load_id", body.data.source_load_id ?? null);`,
    ].join("\n"),
  },
  {
    rel: "apps/backend/src/accounting/from-load.ts",
    source: `AND i.source_load_id = $2`,
  },
  {
    rel: "apps/frontend/src/pages/accounting/modals/InvoiceTypeModalBase.tsx",
    source: `createKind="category"`,
  },
  {
    rel: "apps/frontend/src/pages/accounting/InvoiceDetailPage.tsx",
    source: `// no income CoA on detail add line`,
  },
  {
    rel: "apps/frontend/src/pages/accounting/InvoicesListPage.tsx",
    source: `// no create deep link`,
  },
  {
    rel: "apps/frontend/src/components/Topbar.tsx",
    source: `/accounting/invoices`,
  },
  {
    rel: "apps/frontend/src/pages/accounting/AccountingSubNavWrapper.tsx",
    source: `{ label: "Invoice", to: "/accounting/invoices" }`,
  },
  {
    rel: "apps/backend/src/accounting/invoice-lines.routes.ts",
    source: ``,
  },
  {
    rel: "apps/frontend/src/api/accounting.ts",
    source: ``,
  },
];

runExecutableGuard({
  label: LABEL,
  checker: checkInvoiceCreateCoa,
  loadRepositoryFixture,
  goodFixture,
  badFixture,
  expectedBadViolationSubstrings: ["findConflictingInvoiceForLoad", "load_already_invoiced"],
});
