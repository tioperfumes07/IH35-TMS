#!/usr/bin/env node
/**
 * ACCT-F5791 — RECORD-PAYMENT-MODAL-BLANK-CUSTOMER-ON-DEACTIVATED. RecordPaymentModal.tsx's
 * customer combobox sources its options from listCustomers({operating_company_id, limit: 5000})
 * (no status filter → active-only, matches RLS default). Invoice detail passes
 * prefillCustomerId={invoice.customer_id}; when that invoice's customer has since been
 * deactivated, customerId state IS correctly set (Amount / Apply-to-invoices resolve fine — live
 * confirmed: paid INV-2026-00037 for a deactivated customer, payment_customer_id matched
 * exactly), but the combobox has no matching option among the active-only rows and silently
 * renders the "Select customer" placeholder instead of the real name — a cosmetic instance of
 * this session's deactivated-customer-contradiction class, this time on the FE options list
 * rather than backend RLS.
 *
 * Fixed additively: customerOptions is a useMemo that, ONLY when prefillCustomerId is set and not
 * present among the active customersQuery rows, unshifts one synthetic option using a new
 * prefillCustomerName prop (passed from InvoiceDetailPage as invoice.customer_name — already
 * resolved server-side by the earlier ACCT-F5784/F5787 fixes). The active-customer options list
 * itself (customersQuery) is never widened — search/picker semantics for a NEW customer pick are
 * unchanged.
 *
 * INVARIANT (static — no database): RecordPaymentModal.tsx must accept prefillCustomerName, must
 * build customerOptions via useMemo with a prefillCustomerId-not-in-base fallback that unshifts a
 * synthetic option, and InvoiceDetailPage.tsx must pass prefillCustomerName={invoice.customer_name}
 * alongside prefillCustomerId.
 *
 * Self-test: node scripts/verify-record-payment-modal-deactivated-customer-option.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MODAL_FILE = "apps/frontend/src/pages/accounting/RecordPaymentModal.tsx";
const DETAIL_FILE = "apps/frontend/src/pages/accounting/InvoiceDetailPage.tsx";
const LABEL = "verify-record-payment-modal-deactivated-customer-option";

export function checkModalSource(src) {
  const problems = [];
  if (!/prefillCustomerName\?:\s*string\s*\|\s*null/.test(src)) {
    problems.push("Props no longer declares prefillCustomerName — the fallback label has nowhere to come from");
  }
  if (!/const customerOptions = useMemo\(/.test(src)) {
    problems.push("customerOptions is no longer a useMemo — the synthetic-option fallback logic is missing or was inlined into a plain map (loses the not-in-base check)");
  }
  if (!/if \(prefillCustomerId && !base\.some\(\(opt\) => opt\.value === prefillCustomerId\)\)/.test(src)) {
    problems.push("customerOptions no longer checks whether prefillCustomerId is missing from the active-only base list — a deactivated customer's id would render blank again");
  }
  if (!/base\.unshift\(\{\s*value:\s*prefillCustomerId,\s*label:\s*prefillCustomerName/.test(src)) {
    problems.push("customerOptions no longer unshifts a synthetic option carrying prefillCustomerName — the combobox would still render blank for a deactivated customer");
  }
  return problems;
}

export function checkDetailSource(src) {
  const problems = [];
  if (!/prefillCustomerName=\{invoice\.customer_name\}/.test(src)) {
    problems.push("InvoiceDetailPage no longer passes prefillCustomerName={invoice.customer_name} to RecordPaymentModal — the fallback label would be empty even if the modal still supports it");
  }
  return problems;
}

function selftest() {
  const goodModalSrc = `
    type Props = {
      prefillCustomerId?: string;
      prefillCustomerName?: string | null;
    };
    export function RecordPaymentModal({ prefillCustomerId, prefillCustomerName }: Props) {
      const customerOptions = useMemo(() => {
        const base = (customersQuery.data ?? []).map((row) => ({ value: row.id, label: row.name, type: row.customer_code ?? undefined }));
        if (prefillCustomerId && !base.some((opt) => opt.value === prefillCustomerId)) {
          base.unshift({ value: prefillCustomerId, label: prefillCustomerName ?? "Customer (inactive)", type: undefined });
        }
        return base;
      }, [customersQuery.data, prefillCustomerId, prefillCustomerName]);
    }
  `;
  const goodDetailSrc = `
    <RecordPaymentModal
      prefillCustomerId={invoice.customer_id}
      prefillCustomerName={invoice.customer_name}
      prefillAmountCents={invoice.amount_open_cents}
    />
  `;

  const cases = [
    { name: "good modal source", src: goodModalSrc, fn: checkModalSource, expectProblems: false },
    { name: "good detail source", src: goodDetailSrc, fn: checkDetailSource, expectProblems: false },
    {
      name: "props missing prefillCustomerName",
      src: goodModalSrc.replace("prefillCustomerName?: string | null;\n", ""),
      fn: checkModalSource,
      expectProblems: true,
    },
    {
      name: "customerOptions reverted to plain map (no useMemo)",
      src: goodModalSrc.replace(
        /const customerOptions = useMemo\([\s\S]*?\}, \[customersQuery\.data, prefillCustomerId, prefillCustomerName\]\);/,
        `const customerOptions = (customersQuery.data ?? []).map((row) => ({ value: row.id, label: row.name, type: row.customer_code ?? undefined }));`
      ),
      fn: checkModalSource,
      expectProblems: true,
    },
    {
      name: "not-in-base check removed",
      src: goodModalSrc.replace(
        `if (prefillCustomerId && !base.some((opt) => opt.value === prefillCustomerId)) {\n          base.unshift({ value: prefillCustomerId, label: prefillCustomerName ?? "Customer (inactive)", type: undefined });\n        }\n        `,
        ""
      ),
      fn: checkModalSource,
      expectProblems: true,
    },
    {
      name: "detail page drops prefillCustomerName",
      src: goodDetailSrc.replace("prefillCustomerName={invoice.customer_name}\n      ", ""),
      fn: checkDetailSource,
      expectProblems: true,
    },
  ];

  let failed = 0;
  for (const c of cases) {
    const problems = c.fn(c.src);
    const hasProblems = problems.length > 0;
    const ok = hasProblems === c.expectProblems;
    console.log(`${ok ? "OK" : "FAIL"} [${c.name}] expectProblems=${c.expectProblems} got=${problems.length}`);
    if (!ok) {
      failed++;
      for (const p of problems) console.log(`    - ${p}`);
    }
  }
  if (failed > 0) {
    console.error(`${LABEL} --selftest FAILED: ${failed} case(s)`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest OK — ${cases.length} cases`);
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }

  const modalPath = path.join(ROOT, MODAL_FILE);
  const detailPath = path.join(ROOT, DETAIL_FILE);
  if (!fs.existsSync(modalPath)) {
    console.error(`${LABEL}: FAIL — ${MODAL_FILE} not found`);
    process.exit(1);
  }
  if (!fs.existsSync(detailPath)) {
    console.error(`${LABEL}: FAIL — ${DETAIL_FILE} not found`);
    process.exit(1);
  }

  const modalSrc = fs.readFileSync(modalPath, "utf8");
  const detailSrc = fs.readFileSync(detailPath, "utf8");
  const problems = [...checkModalSource(modalSrc), ...checkDetailSource(detailSrc)];

  if (problems.length > 0) {
    console.error(`${LABEL}: FAIL`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }

  console.log(`${LABEL}: OK — RecordPaymentModal falls back to a synthetic customer option (labeled from InvoiceDetailPage's already-resolved invoice.customer_name) when prefillCustomerId points at a deactivated customer excluded from the active-only options list; active-customer options list itself unchanged.`);
}

main();
