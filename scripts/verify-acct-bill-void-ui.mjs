#!/usr/bin/env node
/**
 * ACCT-PR-14/22 — Bill detail UI Void wired to the existing governed void API.
 *
 * USMCA audit found `voidVendorBill` (apps/frontend/src/api/accounting.ts) already existed as a
 * fully-governed backend-enforced void call, but no UI surface on the Bill detail page called it —
 * an ORPHAN_NEW defect (Rule 21): API built, never mounted, so a user could never void a bill from
 * the app. This guard asserts:
 *
 *   1. BillDetailPage imports and calls `voidVendorBill` (the SAME governed API — no new/duplicate
 *      void endpoint or hand-rolled fetch invented for this surface).
 *   2. It uses the shared `VoidReasonModal` chrome (QBO/NetSuite-parity void drawer already used by
 *      Invoice void / JE void / Bill-payment void) — not a native window.confirm()/prompt().
 *   3. A reason is required before the void call fires (matches backend `void_reason_required`).
 *   4. The mutation invalidates the bill detail + bills list queries on success (UI reflects the
 *      voided status without a manual refresh).
 *   5. A void-specific error surface exists so a role-gated rejection
 *      (forbidden_owner_only / forbidden_void_owner_or_accountant_only) or a payments-blocked
 *      rejection (bill_has_payments_cannot_void) renders human-readable text, not a raw error code.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const failures = [];

function read(rel) {
  try {
    return readFileSync(resolve(ROOT, rel), "utf8");
  } catch {
    failures.push(`missing file: ${rel}`);
    return "";
  }
}

const PAGE_PATH = "apps/frontend/src/pages/accounting/BillDetailPage.tsx";
const API_PATH = "apps/frontend/src/api/accounting.ts";
const BACKEND_ROUTE_PATH = "apps/backend/src/accounting/bills.routes.ts";

const page = read(PAGE_PATH);
const api = read(API_PATH);
const backendRoute = read(BACKEND_ROUTE_PATH);

// 1. The governed API export must still exist (this guard does not re-derive it — it asserts wiring).
if (!/export function voidVendorBill\(/.test(api)) {
  failures.push(`${API_PATH}: voidVendorBill(...) export not found — governed void API must exist before it can be wired`);
}

// 2. Backend route this UI depends on must still exist (bills/:id/void) — a defect here means the
//    wired UI call would 404 in production.
if (!/["'`]\/api\/v1\/accounting\/bills\/:id\/void["'`]/.test(backendRoute)) {
  failures.push(`${BACKEND_ROUTE_PATH}: POST /api/v1/accounting/bills/:id/void route not found`);
}

// 3. BillDetailPage imports the governed API — no duplicate/hand-rolled void fetch.
if (!/import\s*\{[^}]*\bvoidVendorBill\b[^}]*\}\s*from\s*["']\.\.\/\.\.\/api\/accounting["']/.test(page)) {
  failures.push(`${PAGE_PATH}: must import voidVendorBill from ../../api/accounting (reuse the governed API)`);
}

// 4. Calls it inside a mutation (mounted, not just imported-and-unused).
if (!/mutationFn:\s*\(reason:\s*string\)\s*=>\s*voidVendorBill\(/.test(page)) {
  failures.push(`${PAGE_PATH}: voidVendorBill must be called from a mutation (mutationFn) — imported-but-unused is the exact ORPHAN_NEW defect this guard blocks`);
}

// 5. Uses the shared VoidReasonModal chrome (QBO-parity void drawer, matches invoice/JE/bill-payment
//    void surfaces) — never a native window.confirm/prompt on a money action.
if (!/import\s*\{\s*VoidReasonModal\s*\}\s*from\s*["']\.\.\/\.\.\/components\/accounting\/VoidReasonModal["']/.test(page)) {
  failures.push(`${PAGE_PATH}: must use the shared VoidReasonModal (../../components/accounting/VoidReasonModal) — not a bespoke dialog`);
}
if (/window\.(confirm|prompt)\(/.test(page)) {
  failures.push(`${PAGE_PATH}: must not use window.confirm()/window.prompt() for a financial void — use VoidReasonModal`);
}

// 6. There is a Void trigger control mounted in the rendered tree (a Button whose onClick opens the
//    VoidReasonModal) — not just the modal declared and never opened.
if (!/onClick=\{\(\)\s*=>\s*setVoidOpen\(true\)\}/.test(page)) {
  failures.push(`${PAGE_PATH}: no control found that opens the void modal (setVoidOpen(true)) — modal would be unreachable`);
}

// 7. Query invalidation on success — the detail + list views must reflect the void without a manual
//    refresh (Law of the Land — forward+reverse drill-through must show current state).
if (!/invalidateQueries\(\{\s*queryKey:\s*\[["']accounting["'],\s*["']bill["']/.test(page)) {
  failures.push(`${PAGE_PATH}: void success must invalidate the ["accounting","bill",...] detail query`);
}
if (!/invalidateQueries\(\{\s*queryKey:\s*\[["']accounting["'],\s*["']bills["']\]\s*\}\)/.test(page)) {
  failures.push(`${PAGE_PATH}: void success must invalidate the ["accounting","bills"] list query`);
}

// 8. Role-gated / state-blocked void errors get human-readable copy (not a raw error code shown
//    verbatim to the user).
const REQUIRED_ERROR_CODES = [
  "forbidden_owner_only",
  "forbidden_void_owner_or_accountant_only",
  "bill_has_payments_cannot_void",
];
for (const code of REQUIRED_ERROR_CODES) {
  if (!page.includes(code)) {
    failures.push(`${PAGE_PATH}: missing a mapped human-readable message for void rejection code "${code}"`);
  }
}

// CONTRACT PARITY: the drawer's client-side minimum must match the server's zod contract
// (bills.routes.ts `reason: z.string().trim().min(3)`). minLength={1} let Void enable on a 2-char
// reason that then 400s server-side, so the void silently failed for anyone who typed "ok".
if (!/minLength=\{3\}/.test(page)) {
  failures.push(`${PAGE_PATH}: void reason minLength must be 3 to match the backend contract reason.min(3) — a lower client minimum lets the request 400`);
}

// The catch must re-throw the ORIGINAL error. Wrapping it in a plain Error discards
// ApiError.data.details, which VoidReasonModal.extractVoidError reads to surface
// details.fieldErrors.reason[0] — otherwise the user sees "API request failed with status 400".
if (/throw new Error\(billVoidErrorMessage\(/.test(page)) {
  failures.push(`${PAGE_PATH}: void catch must re-throw the original error — wrapping it hides ApiError.data.details`);
}

if (failures.length > 0) {
  console.error("verify-acct-bill-void-ui FAILED:");
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log("verify-acct-bill-void-ui: OK — Bill detail Void wired to the governed voidVendorBill API.");
