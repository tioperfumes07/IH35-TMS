#!/usr/bin/env node
/**
 * verify-load-detail-drawer-mutation-errors-surfaced.mjs (DISP-F6320, verify-step 4646)
 *
 * Root cause: `apps/frontend/src/components/dispatch/LoadDetailDrawer.tsx`'s `updateMutation`
 * (shared by the Dispatch Flag select AND the factoring-package Generate/Email/Mark-uploaded
 * buttons), `createInvoiceMutation` (backing "Create / View Invoice"), and
 * `distributeMutation` (backing driver-instructions "Resend") had NO `onError`
 * handler, and every call site did `void mutation.mutateAsync(...).then(...)` or
 * `await mutation.mutateAsync(...)` with no `.catch()` anywhere in the chain. On a rejected
 * PATCH/POST (validation error, 500, network failure) this was a silent no-op on real, live,
 * mounted dispatch surfaces: no toast, no revert explanation, and the chained `.then()`
 * (refetch/success-toast) never ran since the promise rejected.
 *
 * Also DSP-MONEY-F7175: Create/View Invoice must fail closed while listLoadInvoices is
 * loading/errored, View an existing id without a second create, and toast if create returns no id.
 * mutations, matching the established convention used elsewhere in the dispatch module
 * (CancelLoadModal.tsx, InlineUnitPicker.tsx, AssignDriverDropdown.tsx).
 *
 * Usage:
 *   node scripts/verify-load-detail-drawer-mutation-errors-surfaced.mjs            # scan
 *   node scripts/verify-load-detail-drawer-mutation-errors-surfaced.mjs --selftest # regression harness
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const FILE = "apps/frontend/src/components/dispatch/LoadDetailDrawer.tsx";

const IMPORTS_ERROR_HELPER_RE = /import\s*\{[^}]*\buserFacingApiError\b[^}]*\}\s*from\s*["']\.\.\/\.\.\/lib\/api-error-message["']/;

function extractMutationBlock(src, mutationName) {
  const startRe = new RegExp(`const ${mutationName} = useMutation\\(\\{`);
  const m = startRe.exec(src);
  if (!m) return null;
  // Grab from the match to the next "});" that closes the useMutation({...}) call.
  const closeIdx = src.indexOf("\n  });", m.index);
  if (closeIdx === -1) return null;
  return src.slice(m.index, closeIdx);
}

export function checkLoadDetailDrawerMutationErrors(src) {
  const offenders = [];
  if (!/invoiceLookupFailed/.test(src) || !/loadInvoicesQuery\.isError/.test(src)) {
    offenders.push(
      `${FILE}: DSP-MONEY-F7175 — Create/View Invoice must fail closed on loadInvoicesQuery.isError (absent cache is not "no invoice").`,
    );
  }
  if (!/existingInvoiceId/.test(src) || !/navigate\(`\/accounting\/invoices\/\$\{existingInvoiceId\}`\)/.test(src)) {
    offenders.push(`${FILE}: DSP-MONEY-F7175 — existing invoice must View via navigate, not createInvoiceFromLoad.`);
  }
  if (!/Invoice create did not return an id/.test(src)) {
    offenders.push(`${FILE}: DSP-MONEY-F7175 — missing invoice.id after create must toast, not silent return.`);
  }
  if (!IMPORTS_ERROR_HELPER_RE.test(src)) {
    offenders.push(`${FILE}: does not import userFacingApiError from ../../lib/api-error-message — DISP-F6320 regression.`);
  }
  const updateBlock = extractMutationBlock(src, "updateMutation");
  if (!updateBlock || !/onError:/.test(updateBlock)) {
    offenders.push(`${FILE}: updateMutation has no onError — a failed PATCH (dispatch flag, factoring package) will silently do nothing again.`);
  }
  const invoiceBlock = extractMutationBlock(src, "createInvoiceMutation");
  if (!invoiceBlock || !/onError:/.test(invoiceBlock)) {
    offenders.push(`${FILE}: createInvoiceMutation has no onError — "Create / View Invoice" will silently do nothing on failure again.`);
  }
  const distributeBlock = extractMutationBlock(src, "distributeMutation");
  if (!distributeBlock || !/onError:/.test(distributeBlock)) {
    offenders.push(`${FILE}: distributeMutation has no onError — driver-instructions "Resend" will silently do nothing on failure again.`);
  }
  return offenders;
}

export function run() {
  const src = fs.readFileSync(path.join(repoRoot, FILE), "utf8");
  const offenders = checkLoadDetailDrawerMutationErrors(src);
  return { ok: offenders.length === 0, offenders };
}

if (process.argv.includes("--selftest")) {
  const buggy = `
    const updateMutation = useMutation({
      mutationFn: ({ id, body }) => updateLoad(id, body),
    });
    const createInvoiceMutation = useMutation({
      mutationFn: ({ operatingCompanyId, loadId }) =>
        createInvoiceFromLoad(operatingCompanyId, { load_id: loadId }),
    });
    const distributeMutation = useMutation({
      mutationFn: ({ loadId, operatingCompanyId }) =>
        distributeLoadInstructions(loadId, operatingCompanyId),
      onSuccess: () => pushToast("Driver instructions distributed", "success"),
    });
  `;
  const fixed = fs.readFileSync(path.join(repoRoot, FILE), "utf8");

  const buggyOffenders = checkLoadDetailDrawerMutationErrors(buggy);
  const fixedOffenders = checkLoadDetailDrawerMutationErrors(fixed);

  if (buggyOffenders.length >= 4 && fixedOffenders.length === 0) {
    console.log("verify-load-detail-drawer-mutation-errors-surfaced selftest OK");
    process.exit(0);
  }
  console.error("verify-load-detail-drawer-mutation-errors-surfaced selftest FAILED", {
    buggyOffenders,
    fixedOffenders,
  });
  process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { ok, offenders } = run();
  if (!ok) {
    console.error(
      "verify-load-detail-drawer-mutation-errors-surfaced FAIL:\n  " + offenders.map((o) => "✗ " + o).join("\n  "),
    );
    process.exit(1);
  }
  console.log(
    "verify-load-detail-drawer-mutation-errors-surfaced OK — update, invoice, and driver-instruction distribution mutations surface failures via toast, never a silent no-op",
  );
}
