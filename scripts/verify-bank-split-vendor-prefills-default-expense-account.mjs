#!/usr/bin/env node
// VEND-F-SILENT-BILL-GL-UI
//
// apps/frontend/src/pages/banking/components/BankTransactionSplitModal.tsx's multi-vendor-mode
// line picker for Driver and Product/Service both prefill the line's gl_account_id from that
// entity's own default_expense_account_id when the category is still empty ("ACCT-F18 Option-B" —
// confirmed already correctly implemented for vendors too in the sibling
// BankingTransactionsDesignView.tsx's inline categorize row). The Vendor picker in THIS file never
// did: vendorsQuery discarded default_expense_account_id from the response entirely (even though
// the backend's VENDOR_SELECT_COLUMNS always returns it), and the vendor onChange handler never
// consulted it — a vendor's default expense account was captured on vendor create/edit and then
// used nowhere in the actual bill-categorization UI, a silent dead field.
//
// This guard statically asserts the vendor onChange handler in BankTransactionSplitModal.tsx
// prefills gl_account_id from default_expense_account_id, mirroring the Driver/Product-Service
// prefill pattern already present in the same file.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TARGET = path.join(
  __dirname,
  "..",
  "apps/frontend/src/pages/banking/components/BankTransactionSplitModal.tsx"
);

function check(src) {
  if (!src.includes("default_expense_account_id")) {
    return { ok: false, reason: "default_expense_account_id not referenced anywhere in the file" };
  }
  const vendorsQueryStart = src.indexOf("const vendorsQuery = useQuery");
  if (vendorsQueryStart === -1) return { ok: false, reason: "vendorsQuery not found" };
  const vendorsQueryEnd = src.indexOf("});", vendorsQueryStart);
  const vendorsQueryBlock = src.slice(vendorsQueryStart, vendorsQueryEnd);
  if (!vendorsQueryBlock.includes("default_expense_account_id")) {
    return { ok: false, reason: "vendorsQuery still discards default_expense_account_id from the response" };
  }

  // Find the multi_vendor per-line Vendor <ReferenceSelect>'s onChange — the one that patches
  // vendor_id on a line (not the single_vendor_multi_category top-level setSingleVendorId picker,
  // which intentionally applies one vendor to every differently-categorized line and must NOT
  // auto-prefill a single shared category).
  const patchVendorIdx = src.indexOf("vendor_id: v ?? undefined");
  if (patchVendorIdx === -1) return { ok: false, reason: "multi-vendor-mode vendor_id patch call not found" };
  const onChangeStart = src.lastIndexOf("onChange={(v)", patchVendorIdx);
  const onChangeEnd = src.indexOf("options={(vendorsQuery.data", patchVendorIdx);
  if (onChangeStart === -1 || onChangeEnd === -1 || onChangeEnd < patchVendorIdx) {
    return { ok: false, reason: "could not isolate the multi-vendor vendor picker's onChange block" };
  }
  const onChangeBlock = src.slice(onChangeStart, onChangeEnd);
  if (!onChangeBlock.includes("default_expense_account_id")) {
    return { ok: false, reason: "multi-vendor vendor picker's onChange never reads default_expense_account_id" };
  }
  if (!/gl_account_id\s*:/.test(onChangeBlock)) {
    return { ok: false, reason: "multi-vendor vendor picker's onChange never sets gl_account_id" };
  }
  if (!onChangeBlock.includes("!line.gl_account_id")) {
    return { ok: false, reason: "prefill doesn't guard on an empty line.gl_account_id (would clobber a real user choice)" };
  }
  return { ok: true };
}

function selftest() {
  const REGRESSED = `
  const vendorsQuery = useQuery({
    queryKey: ["banking", "split-vendors", companyId],
    queryFn: () => listVendors({ operating_company_id: companyId }).then((res) => (res.vendors ?? []) as Array<{ id: string; name: string }>),
    enabled: Boolean(open && companyId),
  });
  // ...
  <ReferenceSelect
    value={line.vendor_id ?? null}
    onChange={(v) => patchLine(line._key, { vendor_id: v ?? undefined })}
    options={(vendorsQuery.data ?? []).map((v) => ({ value: v.id, label: v.name }))}
  />
`;
  const r1 = check(REGRESSED);
  if (r1.ok) throw new Error("selftest FAILED to catch the original no-prefill regression");

  const FIXED = `
  const vendorsQuery = useQuery({
    queryKey: ["banking", "split-vendors", companyId],
    queryFn: () =>
      listVendors({ operating_company_id: companyId }).then(
        (res) => (res.vendors ?? []) as Array<{ id: string; name: string; default_expense_account_id?: string | null }>
      ),
    enabled: Boolean(open && companyId),
  });
  // ...
  <ReferenceSelect
    value={line.vendor_id ?? null}
    onChange={(v) => {
      const vendorAcct = (vendorsQuery.data ?? []).find((row) => row.id === v)?.default_expense_account_id;
      patchLine(line._key, {
        vendor_id: v ?? undefined,
        ...(vendorAcct && !line.gl_account_id ? { gl_account_id: vendorAcct } : {}),
      });
    }}
    options={(vendorsQuery.data ?? []).map((v) => ({ value: v.id, label: v.name }))}
  />
`;
  const r2 = check(FIXED);
  if (!r2.ok) throw new Error("selftest FAILED to accept the real fix shape: " + r2.reason);

  console.log("  selftest: OK (regression caught, fix accepted)");
}

const isSelftest = process.argv.includes("--selftest");
selftest();
if (isSelftest) {
  console.log("PASS (selftest only)");
  process.exit(0);
}

let src;
try {
  src = readFileSync(TARGET, "utf8");
} catch (err) {
  console.error(`FAIL(gated): cannot read ${TARGET}: ${err.message}`);
  process.exit(1);
}

const result = check(src);
if (!result.ok) {
  console.error(`FAIL(gated): BankTransactionSplitModal.tsx — ${result.reason}`);
  process.exit(1);
}

console.log("PASS: BankTransactionSplitModal.tsx's multi-vendor picker prefills gl_account_id from the vendor's default_expense_account_id");
process.exit(0);
