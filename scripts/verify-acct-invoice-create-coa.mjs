#!/usr/bin/env node
/**
 * Guard: Invoice create uses income CoA ReferenceSelect + optional load linkage (15/22).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fail = (m) => {
  console.error(`FAIL: ${m}`);
  process.exit(1);
};

const base = fs.readFileSync(path.join(root, "apps/frontend/src/pages/accounting/modals/InvoiceTypeModalBase.tsx"), "utf8");
const linesRoute = fs.readFileSync(path.join(root, "apps/backend/src/accounting/invoice-lines.routes.ts"), "utf8");
const invoicesRoute = fs.readFileSync(path.join(root, "apps/backend/src/accounting/invoices.routes.ts"), "utf8");
const api = fs.readFileSync(path.join(root, "apps/frontend/src/api/accounting.ts"), "utf8");

if (!base.includes('createKind="account"')) fail("InvoiceTypeModalBase must use ReferenceSelect createKind=account for income CoA");
if (!base.includes("getCoaAccounts")) fail("InvoiceTypeModalBase must load entity-scoped CoA via getCoaAccounts");
if (!base.includes("listLoads")) fail("InvoiceTypeModalBase must list loads for optional load linkage");
if (!base.includes("operating_company_id")) fail("InvoiceTypeModalBase catalogs must be entity-scoped");
if (!base.includes("addInvoiceLine")) fail("InvoiceTypeModalBase must persist line with income account at create");
if (!base.includes("patchInvoice")) fail("InvoiceTypeModalBase must patch source_load_id when load linked");
if (!base.includes('createKind="customer"')) fail("InvoiceTypeModalBase must keep customer ReferenceSelect");

if (!linesRoute.includes("account_id: z.string().uuid().optional()")) {
  fail("invoice-lines create schema must accept optional account_id");
}
if (!linesRoute.includes("assertExplicitIncomeAccount")) {
  fail("invoice-lines route must validate explicit income account_id");
}

if (!invoicesRoute.includes("source_load_id: z.string().uuid().nullable().optional()")) {
  fail("invoice patch schema must accept source_load_id for draft linkage");
}

if (!api.includes("account_id?: string")) fail("addInvoiceLine API must expose account_id");
if (!api.includes("source_load_id: string | null")) fail("patchInvoice API must expose source_load_id");

console.log("PASS: verify-acct-invoice-create-coa");
