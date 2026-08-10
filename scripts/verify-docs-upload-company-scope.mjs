#!/usr/bin/env node
/**
 * verify-docs-upload-company-scope.mjs
 *
 * 0441-mod12-docs-lowest-uuid-company-bug-live: standalone Documents page uploads and
 * VersionHistoryModal new-version uploads MUST pass the VIEWED operating_company_id (from
 * CompanyContext / DocumentsTab), not rely on the backend resolveOperatingCompanyId fallback
 * (which can pick the uploader's default or lowest-UUID accessible company).
 *
 * This guard complements verify-docs-upload-viewed-entity.mjs (entity-profile mount sites).
 * It asserts:
 *   1. pages/Documents.tsx reads selectedCompanyId from CompanyContext and passes
 *      operatingCompanyId= into its bare <UploadModal>.
 *   2. VersionHistoryModal accepts operatingCompanyId and forwards it to <UploadModal>.
 *   3. DocumentsTab (the sole VersionHistoryModal caller) passes operatingCompanyId= through.
 *
 * Usage:
 *   node scripts/verify-docs-upload-company-scope.mjs            # scan real files
 *   node scripts/verify-docs-upload-company-scope.mjs --selftest # inject regressions -> must FAIL
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-docs-upload-company-scope";

const DOCUMENTS_PAGE = "apps/frontend/src/pages/Documents.tsx";
const VERSION_HISTORY_MODAL = "apps/frontend/src/components/documents/VersionHistoryModal.tsx";
const DOCUMENTS_TAB = "apps/frontend/src/components/documents/DocumentsTab.tsx";
const UPLOAD_MODAL = "apps/frontend/src/components/documents/UploadModal.tsx";

function stripComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

/**
 * @param {{
 *   documentsPage: string,
 *   versionHistoryModal: string,
 *   documentsTab: string,
 *   uploadModal?: string,
 * }} args
 * @returns {string[]} errors
 */
export function assertGuard({ documentsPage, versionHistoryModal, documentsTab, uploadModal }) {
  const errors = [];
  const dp = stripComments(documentsPage);
  const vhm = stripComments(versionHistoryModal);
  const dt = stripComments(documentsTab);
  const um = uploadModal != null ? stripComments(uploadModal) : "";

  if (!/useCompanyContext/.test(dp)) {
    errors.push(`${DOCUMENTS_PAGE}: must call useCompanyContext() to read the viewed company`);
  }
  if (!/\bselectedCompanyId\b/.test(dp)) {
    errors.push(`${DOCUMENTS_PAGE}: must destructure selectedCompanyId from CompanyContext`);
  }
  if (!/<UploadModal[\s\S]{0,400}?operatingCompanyId=\{selectedCompanyId/.test(dp)) {
    errors.push(
      `${DOCUMENTS_PAGE}: bare <UploadModal> must pass operatingCompanyId={selectedCompanyId ...} (company-scoped upload)`
    );
  }

  if (!/operatingCompanyId\??:\s*string/.test(vhm)) {
    errors.push(`${VERSION_HISTORY_MODAL}: VersionHistoryModalProps must declare operatingCompanyId`);
  }
  if (!/<UploadModal[\s\S]{0,600}?operatingCompanyId=\{operatingCompanyId\}/.test(vhm)) {
    errors.push(`${VERSION_HISTORY_MODAL}: <UploadModal> must forward operatingCompanyId={operatingCompanyId}`);
  }

  if (!/<VersionHistoryModal[\s\S]{0,600}?operatingCompanyId=\{operatingCompanyId\}/.test(dt)) {
    errors.push(`${DOCUMENTS_TAB}: <VersionHistoryModal> caller must pass operatingCompanyId={operatingCompanyId}`);
  }

  // FE Render build unblock: Customer type uses `name` / `customer_code`, not customer_name/display_id.
  if (um) {
    if (/customer\.customer_name/.test(um) || /customer\.display_id/.test(um)) {
      errors.push(
        `${UPLOAD_MODAL}: customer option label must use Customer.name / customer_code (not customer_name/display_id) — tsc exit 2 on Render otherwise`
      );
    }
    if (!/customer\.name/.test(um)) {
      errors.push(`${UPLOAD_MODAL}: customer option label must read customer.name`);
    }
  }

  return errors;
}

function readReal(rel) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) return null;
  return fs.readFileSync(abs, "utf8");
}

function selftest() {
  const goodDocumentsPage = `
    import { useCompanyContext } from "../contexts/CompanyContext";
    export function DocumentsPage() {
      const { selectedCompanyId } = useCompanyContext();
      return uploadOpen ? (
        <UploadModal operatingCompanyId={selectedCompanyId ?? undefined} onClose={close} onUploadSuccess={ok} />
      ) : null;
    }
  `;
  const goodVersionHistoryModal = `
    type VersionHistoryModalProps = { operatingCompanyId?: string; onClose: () => void; };
    export function VersionHistoryModal({ operatingCompanyId, onClose }: VersionHistoryModalProps) {
      return uploadOpen ? (
        <UploadModal parentFileId={root} operatingCompanyId={operatingCompanyId} onClose={close} onUploadSuccess={ok} />
      ) : null;
    }
  `;
  const goodDocumentsTab = `
    export function DocumentsTab({ operatingCompanyId }: { operatingCompanyId?: string }) {
      return (
        <VersionHistoryModal rootFileId={id} operatingCompanyId={operatingCompanyId} onClose={close} onVersionUploaded={ok} />
      );
    }
  `;

  const cases = [
    {
      name: "all wired → 0 errors",
      in: {
        documentsPage: goodDocumentsPage,
        versionHistoryModal: goodVersionHistoryModal,
        documentsTab: goodDocumentsTab,
      },
      want: 0,
    },
    {
      name: "Documents page drops CompanyContext → FAIL",
      in: {
        documentsPage: goodDocumentsPage
          .replaceAll("useCompanyContext", "useMissingContext")
          .replaceAll("selectedCompanyId", "missingCompanyId"),
        versionHistoryModal: goodVersionHistoryModal,
        documentsTab: goodDocumentsTab,
      },
      wantMin: 1,
    },
    {
      name: "Documents page UploadModal omits operatingCompanyId → FAIL",
      in: {
        documentsPage: goodDocumentsPage.replace("operatingCompanyId={selectedCompanyId ?? undefined}", ""),
        versionHistoryModal: goodVersionHistoryModal,
        documentsTab: goodDocumentsTab,
      },
      wantMin: 1,
    },
    {
      name: "VersionHistoryModal stops forwarding operatingCompanyId → FAIL",
      in: {
        documentsPage: goodDocumentsPage,
        versionHistoryModal: goodVersionHistoryModal.replace("operatingCompanyId={operatingCompanyId}", ""),
        documentsTab: goodDocumentsTab,
      },
      wantMin: 1,
    },
    {
      name: "DocumentsTab drops operatingCompanyId on VersionHistoryModal → FAIL",
      in: {
        documentsPage: goodDocumentsPage,
        versionHistoryModal: goodVersionHistoryModal,
        documentsTab: goodDocumentsTab.replace("operatingCompanyId={operatingCompanyId}", ""),
      },
      wantMin: 1,
    },
    {
      name: "UploadModal uses phantom customer_name → FAIL",
      in: {
        documentsPage: goodDocumentsPage,
        versionHistoryModal: goodVersionHistoryModal,
        documentsTab: goodDocumentsTab,
        uploadModal: `label: customer.customer_name ?? customer.display_id ?? customer.id,`,
      },
      wantMin: 1,
    },
    {
      name: "UploadModal uses Customer.name → PASS",
      in: {
        documentsPage: goodDocumentsPage,
        versionHistoryModal: goodVersionHistoryModal,
        documentsTab: goodDocumentsTab,
        uploadModal: `label: customer.name ?? customer.customer_code ?? customer.id,`,
      },
      want: 0,
    },
  ];

  let failed = 0;
  for (const c of cases) {
    const errs = assertGuard(c.in);
    const n = errs.length;
    const ok = c.want !== undefined ? n === c.want : n >= c.wantMin;
    if (!ok) failed++;
    console.log(`${ok ? "ok  " : "FAIL"}  ${c.name}  (errors=${n})`);
  }
  if (failed) {
    console.error(`\n${LABEL} SELFTEST FAILED: ${failed}`);
    process.exit(1);
  }
  console.log(`\n${LABEL} SELFTEST PASS`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const documentsPage = readReal(DOCUMENTS_PAGE);
const versionHistoryModal = readReal(VERSION_HISTORY_MODAL);
const documentsTab = readReal(DOCUMENTS_TAB);
const uploadModal = readReal(UPLOAD_MODAL);
if (documentsPage === null) {
  console.error(`[${LABEL}] FAILED — missing file ${DOCUMENTS_PAGE}`);
  process.exit(1);
}
if (versionHistoryModal === null) {
  console.error(`[${LABEL}] FAILED — missing file ${VERSION_HISTORY_MODAL}`);
  process.exit(1);
}
if (documentsTab === null) {
  console.error(`[${LABEL}] FAILED — missing file ${DOCUMENTS_TAB}`);
  process.exit(1);
}
if (uploadModal === null) {
  console.error(`[${LABEL}] FAILED — missing file ${UPLOAD_MODAL}`);
  process.exit(1);
}

const errors = assertGuard({ documentsPage, versionHistoryModal, documentsTab, uploadModal });
if (errors.length) {
  console.error(`[${LABEL}] FAILED — ${errors.length} issue(s):`);
  for (const e of errors) console.error(`  ✗ ${e}`);
  process.exit(1);
}
console.log(
  `[${LABEL}] OK — Documents page and VersionHistoryModal thread selectedCompanyId / operatingCompanyId ` +
    "into UploadModal so standalone and new-version uploads file under the viewed company, not the lowest-UUID fallback."
);
