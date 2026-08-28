#!/usr/bin/env node
/**
 * LV-SYSTEM-AUDIT-LOAD-LINK-DEAD-END — GET /dispatch/loads/:id must LEFT JOIN customers
 * (and flag colors), not INNER JOIN.
 *
 * Live defect (2026-08-17): L-20260816-0168 customer CC2-BOOKLOAD-INLINE-TEST had
 * deactivated_at set. customers_select RLS hides deactivated rows, so INNER JOIN customers
 * returned 0 rows → dispatch_load_not_found while GET /mdata/loads/:id still 200'd. Audit trail
 * → /dispatch/loads/:id opened a drawer with "Couldn't load this load's overview."
 *
 *   node scripts/verify-dispatch-load-detail-deactivated-customer-left-join.mjs [--selftest]
 */
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SELFTEST = process.argv.includes("--selftest");
const LABEL = "verify-dispatch-load-detail-deactivated-customer-left-join";
const TARGET = "apps/backend/src/dispatch/loads.routes.ts";
const DRAWER = "apps/frontend/src/components/dispatch/LoadDetailDrawer.tsx";
const LOAD_API = "apps/frontend/src/api/loads.ts";
const FACTORING_TAB = "apps/frontend/src/components/dispatch/tabs/FactoringTab.tsx";
const FINES_CARD = "apps/frontend/src/components/dispatch/tabs/FinesDeductionsCard.tsx";
const BOOK_LOAD = "apps/frontend/src/pages/dispatch/components/BookLoadModalV4.tsx";
const CASH_ADVANCE = "apps/frontend/src/pages/cash-advances/components/CreateAdvanceModal.tsx";
const INVOICE_DETAIL = "apps/frontend/src/pages/accounting/InvoiceDetailPage.tsx";
const INVOICE_MODAL = "apps/frontend/src/pages/accounting/modals/InvoiceTypeModalBase.tsx";

/** Slice the GET /api/v1/dispatch/loads/:id handler body (through the first null-detail return). */
function detailGetSlice(src) {
  const start = src.indexOf('app.get("/api/v1/dispatch/loads/:id"');
  if (start < 0) return "";
  const endMarker = "if (!detail) return reply.code(404).send({ error: \"dispatch_load_not_found\" });";
  const end = src.indexOf(endMarker, start);
  if (end < 0) return src.slice(start, start + 12000);
  return src.slice(start, end);
}

function check(src, drawerSrc, loadApiSrc, factoringSrc, finesSrc, bookLoadSrc, cashAdvanceSrc, invoiceDetailSrc, invoiceModalSrc) {
  const problems = [];
  const detail = detailGetSlice(src);
  if (!detail) {
    problems.push(`${TARGET}: missing GET /api/v1/dispatch/loads/:id handler`);
    return problems;
  }

  // Detail GET must LEFT JOIN customers (INNER JOIN is the planted defect).
  if (!/LEFT JOIN mdata\.customers c ON c\.id = l\.customer_id/.test(detail)) {
    problems.push(
      `${TARGET}: GET /dispatch/loads/:id must LEFT JOIN mdata.customers — INNER JOIN 404s when the customer is deactivated (RLS)`,
    );
  }
  if (/\n\s*JOIN mdata\.customers c ON c\.id = l\.customer_id/.test(detail)) {
    problems.push(
      `${TARGET}: GET /dispatch/loads/:id still has INNER JOIN mdata.customers — deactivated customers become dispatch_load_not_found`,
    );
  }

  // Flag colors: same class — missing/invisible flag must not drop the load.
  if (!/LEFT JOIN catalogs\.dispatch_flag_colors df ON df\.id = ml\.dispatch_flag_color_id/.test(detail)) {
    problems.push(
      `${TARGET}: GET /dispatch/loads/:id must LEFT JOIN catalogs.dispatch_flag_colors (INNER JOIN drops the load)`,
    );
  }
  if (/\n\s*JOIN catalogs\.dispatch_flag_colors df ON df\.id = ml\.dispatch_flag_color_id/.test(detail)) {
    problems.push(`${TARGET}: GET /dispatch/loads/:id still INNER JOINs dispatch_flag_colors`);
  }

  // Drawer: ALWAYS race mdata with dispatch (not wait for dispatchFailed). Error-only gating
  // left Overview on "Loading load overview..." while a slow dispatch GET hung 20s+
  // (LV-CUSTOMERS-LOADS-DRAWER-INDEFINITE-LOADING). Prefer dispatch data when present.
  if (!/useDispatchLoad\(loadId,\s*operatingCompanyId\)/.test(drawerSrc)) {
    problems.push(`${DRAWER}: must call useDispatchLoad(loadId, operatingCompanyId)`);
  }
  if (!/useLoad\(loadId,\s*operatingCompanyId\)/.test(drawerSrc)) {
    problems.push(
      `${DRAWER}: must always race company-scoped useLoad(loadId, operatingCompanyId) in parallel with dispatch`,
    );
  }
  if (/useLoad\(operatingCompanyId \? \(dispatchFailed \? loadId : null\) : loadId\)/.test(drawerSrc)) {
    problems.push(
      `${DRAWER}: must not gate useLoad on dispatchFailed — that leaves Overview loading while dispatch is slow-but-not-failed`,
    );
  }
  if (!/dispatchLoadQuery\.data \?\? mdataLoadQuery\.data/.test(drawerSrc)) {
    problems.push(
      `${DRAWER}: must prefer dispatchLoadQuery.data ?? mdataLoadQuery.data so mdata settles the drawer first`,
    );
  }

  if (!/export function useLoad\(id: string \| null, operatingCompanyId: string \| null\)/.test(loadApiSrc)) {
    problems.push(`${LOAD_API}: shared useLoad must require an operating-company scope`);
  }
  if (!/queryKey: \["loads", "detail", operatingCompanyId, id\]/.test(loadApiSrc)) {
    problems.push(`${LOAD_API}: load-detail cache key must include operating company before load id`);
  }
  if (!/queryFn: \(\) => getLoad\(id as string, operatingCompanyId as string\)/.test(loadApiSrc)) {
    problems.push(`${LOAD_API}: useLoad must send operating_company_id to the canonical detail GET`);
  }
  if (!/enabled: Boolean\(id && operatingCompanyId\)/.test(loadApiSrc)) {
    problems.push(`${LOAD_API}: useLoad must not issue an unscoped detail read`);
  }
  for (const [file, consumer] of [[FACTORING_TAB, factoringSrc], [FINES_CARD, finesSrc]]) {
    if (!/useLoad\(loadId,\s*operatingCompanyId\)/.test(consumer)) {
      problems.push(`${file}: load detail read must carry its existing operatingCompanyId prop`);
    }
  }
  if (!/queryKey: \["book-load-edit", operatingCompanyId, editLoadId\]/.test(bookLoadSrc)) {
    problems.push(`${BOOK_LOAD}: edit prefill cache key must own company + load identity`);
  }
  if (!/getLoad\(editLoadId as string, operatingCompanyId\)/.test(bookLoadSrc)) {
    problems.push(`${BOOK_LOAD}: edit prefill must send its operating-company scope`);
  }
  if (!/enabled: Boolean\(open && editLoadId && operatingCompanyId\)/.test(bookLoadSrc)) {
    problems.push(`${BOOK_LOAD}: edit prefill must not run before company scope exists`);
  }
  if (!/queryKey: \["cash-advances", "load-detail", operatingCompanyId, loadId\]/.test(cashAdvanceSrc)) {
    problems.push(`${CASH_ADVANCE}: load-detail cache identity must include operating company`);
  }
  if (!/getLoad\(String\(loadId\), operatingCompanyId\)/.test(cashAdvanceSrc)) {
    problems.push(`${CASH_ADVANCE}: load detail must send its existing operatingCompanyId prop`);
  }
  if (!/enabled: open && Boolean\(operatingCompanyId && loadId\)/.test(cashAdvanceSrc)) {
    problems.push(`${CASH_ADVANCE}: load detail must not run before company scope exists`);
  }
  if (!/queryKey: \["accounting", "invoice", "source-load", selectedCompanyId, sourceLoadId\]/.test(invoiceDetailSrc)) {
    problems.push(`${INVOICE_DETAIL}: source-load cache identity must include selected company`);
  }
  if (!/getLoad\(String\(sourceLoadId\), selectedCompanyId!\)/.test(invoiceDetailSrc)) {
    problems.push(`${INVOICE_DETAIL}: source-load detail must send selected company`);
  }
  if (!/enabled: Boolean\(selectedCompanyId && sourceLoadId\)/.test(invoiceDetailSrc)) {
    problems.push(`${INVOICE_DETAIL}: source-load detail must not run before selected company exists`);
  }
  if (!/queryKey: \["invoice-type-modal", "load-detail", operatingCompanyId, loadId\]/.test(invoiceModalSrc)) {
    problems.push(`${INVOICE_MODAL}: load-detail cache identity must include operating company`);
  }
  if (!/getLoad\(String\(loadId\), operatingCompanyId\)/.test(invoiceModalSrc)) {
    problems.push(`${INVOICE_MODAL}: load detail must send its existing operatingCompanyId prop`);
  }

  return problems;
}

function main() {
  const src = readFileSync(path.join(ROOT, TARGET), "utf8");
  const drawerSrc = readFileSync(path.join(ROOT, DRAWER), "utf8");
  const loadApiSrc = readFileSync(path.join(ROOT, LOAD_API), "utf8");
  const factoringSrc = readFileSync(path.join(ROOT, FACTORING_TAB), "utf8");
  const finesSrc = readFileSync(path.join(ROOT, FINES_CARD), "utf8");
  const bookLoadSrc = readFileSync(path.join(ROOT, BOOK_LOAD), "utf8");
  const cashAdvanceSrc = readFileSync(path.join(ROOT, CASH_ADVANCE), "utf8");
  const invoiceDetailSrc = readFileSync(path.join(ROOT, INVOICE_DETAIL), "utf8");
  const invoiceModalSrc = readFileSync(path.join(ROOT, INVOICE_MODAL), "utf8");

  if (SELFTEST) {
    const dir = mkdtempSync(path.join(tmpdir(), "load-detail-lj-"));
    try {
      const planted = src
        .replace(
          /LEFT JOIN mdata\.customers c ON c\.id = l\.customer_id/g,
          "JOIN mdata.customers c ON c.id = l.customer_id",
        )
        .replace(
          /LEFT JOIN catalogs\.dispatch_flag_colors df ON df\.id = ml\.dispatch_flag_color_id/g,
          "JOIN catalogs.dispatch_flag_colors df ON df.id = ml.dispatch_flag_color_id",
        );
      const plantedPath = path.join(dir, "loads.routes.ts");
      writeFileSync(plantedPath, planted);
      const plantedProblems = check(planted, drawerSrc, loadApiSrc, factoringSrc, finesSrc, bookLoadSrc, cashAdvanceSrc, invoiceDetailSrc, invoiceModalSrc);
      if (plantedProblems.length === 0) {
        console.error(`${LABEL} --selftest FAIL: planted INNER JOIN customers did not trip the guard`);
        process.exit(1);
      }
      // Plant the pre-fix drawer gate: mdata only after dispatchFailed — must FAIL.
      const gatedDrawer = drawerSrc
        .replace(/useLoad\(loadId, operatingCompanyId\)/g, "useLoad(operatingCompanyId ? (dispatchFailed ? loadId : null) : loadId, operatingCompanyId)")
        .replace(
          /dispatchLoadQuery\.data \?\? mdataLoadQuery\.data/g,
          "dispatchLoadQuery.data ? dispatchLoadQuery.data : mdataLoadQuery.data",
        );
      // Ensure planted drawer still mentions dispatchFailed so the positive-control regex can fire.
      const gatedDrawerFull = gatedDrawer.includes("dispatchFailed")
        ? gatedDrawer
        : gatedDrawer.replace(
            "const mdataLoadQuery = useLoad(",
            "const dispatchFailed = Boolean(operatingCompanyId && dispatchLoadQuery.isError);\n  const mdataLoadQuery = useLoad(",
          );
      const gatedProblems = check(src, gatedDrawerFull, loadApiSrc, factoringSrc, finesSrc, bookLoadSrc, cashAdvanceSrc, invoiceDetailSrc, invoiceModalSrc);
      if (!gatedProblems.some((p) => /gate useLoad on dispatchFailed|must always race company-scoped useLoad/.test(p))) {
        console.error(
          `${LABEL} --selftest FAIL: gated-on-dispatchFailed drawer did not trip the race assertion:\n${gatedProblems.join("\n")}`,
        );
        process.exit(1);
      }
      const unscopedApi = loadApiSrc
        .replace("export function useLoad(id: string | null, operatingCompanyId: string | null)", "export function useLoad(id: string | null)")
        .replace('["loads", "detail", operatingCompanyId, id]', '["loads", "detail", id]')
        .replace("getLoad(id as string, operatingCompanyId as string)", "getLoad(id as string)")
        .replace("Boolean(id && operatingCompanyId)", "Boolean(id)");
      const unscopedConsumers = check(
        src,
        drawerSrc.replace("useLoad(loadId, operatingCompanyId)", "useLoad(loadId)"),
        unscopedApi,
        factoringSrc.replace("useLoad(loadId, operatingCompanyId)", "useLoad(loadId)"),
        finesSrc.replace("useLoad(loadId, operatingCompanyId)", "useLoad(loadId)"),
        bookLoadSrc
          .replace('["book-load-edit", operatingCompanyId, editLoadId]', '["book-load-edit", editLoadId]')
          .replace("getLoad(editLoadId as string, operatingCompanyId)", "getLoad(editLoadId as string)")
          .replace("Boolean(open && editLoadId && operatingCompanyId)", "Boolean(open && editLoadId)"),
        cashAdvanceSrc
          .replace('["cash-advances", "load-detail", operatingCompanyId, loadId]', '["cash-advances", "load-detail", loadId]')
          .replace("getLoad(String(loadId), operatingCompanyId)", "getLoad(String(loadId))")
          .replace("Boolean(operatingCompanyId && loadId)", "Boolean(loadId)"),
        invoiceDetailSrc
          .replace('["accounting", "invoice", "source-load", selectedCompanyId, sourceLoadId]', '["accounting", "invoice", "source-load", sourceLoadId]')
          .replace("getLoad(String(sourceLoadId), selectedCompanyId!)", "getLoad(String(sourceLoadId))")
          .replace("Boolean(selectedCompanyId && sourceLoadId)", "Boolean(sourceLoadId)"),
        invoiceModalSrc
          .replace('["invoice-type-modal", "load-detail", operatingCompanyId, loadId]', '["invoice-type-modal", "load-detail", loadId]')
          .replace("getLoad(String(loadId), operatingCompanyId)", "getLoad(String(loadId))"),
      );
      if (unscopedConsumers.length < 16) {
        console.error(`${LABEL} --selftest FAIL: planted unscoped vertical was not fully detected:\n${unscopedConsumers.join("\n")}`);
        process.exit(1);
      }
      const good = check(src, drawerSrc, loadApiSrc, factoringSrc, finesSrc, bookLoadSrc, cashAdvanceSrc, invoiceDetailSrc, invoiceModalSrc);
      if (good.length) {
        console.error(`${LABEL} --selftest FAIL: real source already red:\n${good.join("\n")}`);
        process.exit(1);
      }
      console.log(
        `${LABEL} --selftest OK — planted INNER JOIN, gated fallback, and sixteen unscoped load-detail mutations fail; fixed source passes`,
      );
      return;
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  const problems = check(src, drawerSrc, loadApiSrc, factoringSrc, finesSrc, bookLoadSrc, cashAdvanceSrc, invoiceDetailSrc, invoiceModalSrc);
  if (problems.length) {
    console.error(`${LABEL} FAIL:\n${problems.map((p) => `  - ${p}`).join("\n")}`);
    process.exit(1);
  }
  console.log(
    `${LABEL} OK — all load-detail reads are company-scoped across dispatch, cash advance, and invoice surfaces; fallback race preserved`,
  );
}

main();
