import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const routes = fs.readFileSync(path.join(here, "../expenses.routes.ts"), "utf8");

// GO-09 L2 (2026-09-01) — accounting.expenses gets vendor_document_number: the VENDOR's own
// receipt/invoice number, distinct from expense_number (OURS, company-wide unique, mint-if-blank).
// vendor_document_number is NEVER minted server-side; blank stays blank. Mirrors
// accounting.bills.bill_number's existing pattern (L1's "TWO numbers" design) exactly, including
// the per-(company, vendor) duplicate guard -- two DIFFERENT vendors may reuse the same number,
// the SAME vendor reusing it is very likely a double-entry. Static source-shape guard, matching
// this directory's own established convention (see expenses-trailer-id.test.ts).
describe("accounting/expenses.routes GO-09 vendor_document_number", () => {
  it("accepts vendor_document_number on the create body schema, optional and nullable -- never minted", () => {
    expect(routes).toContain("vendor_document_number: z.string().trim().max(80).optional().nullable()");
  });

  it("does NOT touch expense_number's own company-wide uniqueness (L2 lock: do not move it per-vendor)", () => {
    // expense_number's mint path (nextExpenseDisplayId) and its own duplicate-number handling stay
    // completely separate from the new field -- this guard fails if a future edit accidentally
    // conflates the two by reusing expense_number's INSERT slot for vendor_document_number.
    expect(routes).toContain("const operatorExpenseNumber = body.expense_number?.trim() || null;");
    expect(routes).toContain("const operatorVendorDocumentNumber = body.vendor_document_number?.trim() || null;");
  });

  it("writes vendor_document_number on INSERT only when the column exists (columnExists-guarded)", () => {
    expect(routes).toContain('await columnExists(client, "accounting", "expenses", "vendor_document_number")');
    expect(routes).toContain("if (hasVendorDocumentNumber) {");
    expect(routes).toContain("columns.push(`vendor_document_number`);");
    expect(routes).toContain("values.push(operatorVendorDocumentNumber);");
  });

  it("checks for a per-(company, vendor) duplicate BEFORE insert and returns a sentinel, never replies from inside the transaction callback", () => {
    expect(routes).toContain("AND vendor_uuid = $2::uuid");
    expect(routes).toContain("AND vendor_document_number = $3");
    expect(routes).toContain("AND voided_at IS NULL");
    expect(routes).toContain("duplicateVendorDocumentNumber: true as const");
    // NOT a reply.send() from inside withCompanyScope's callback -- would double-send once the
    // outer handler's own reply.code(201).send(...) is reached (matches the memo-duplicate
    // sentinel pattern already established a few lines above this one in the same file).
  });

  it("the outer handler converts the sentinel into a structured 409, matching duplicate_expense_submission's shape", () => {
    expect(routes).toContain('if ("duplicateVendorDocumentNumber" in payload)');
    expect(routes).toContain('error: "duplicate_vendor_document_number"');
    expect(routes).toContain("existing_id: (payload as { existingExpenseId?: string }).existingExpenseId ?? null");
  });

  it("returns vendor_document_number on both the list SELECT and the detail SELECT", () => {
    const hits = [...routes.matchAll(/e\.vendor_document_number\s+AS vendor_document_number/g)];
    expect(hits.length).toBe(2);
  });

  it("ExpenseListRow type carries vendor_document_number", () => {
    expect(routes).toContain("vendor_document_number: string | null;");
  });
});
