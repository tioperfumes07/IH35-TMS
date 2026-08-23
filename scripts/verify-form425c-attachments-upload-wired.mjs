#!/usr/bin/env node
/**
 * F425C-ATTACHMENTS-CHECKBOX-NO-UPLOAD — Part 8 Attachments (lines 38-42) rendered a manually
 * toggleable checkbox bound only to local form state. Save Draft never sent att38-42 to the
 * server (no such columns) and there was no file-picker anywhere, even though the backend has a
 * real endpoint (POST /api/v1/form-425c/:id/attachments/:line, attachForm425CLineFile) that
 * appends a confirmed docs.files uuid to the correct attachment_3X_..._uuids column. Checking the
 * box was a dead click: nothing persisted, and the printed filing's "attached" checkmark is driven
 * by that same discarded local boolean when the server doesn't return print_html.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-form425c-attachments-upload-wired";
const HOME_PAGE = "apps/frontend/src/pages/form425c/Form425CHome.tsx";
const TAB_PAGE = "apps/frontend/src/pages/form425c/tabs/CurrentPeriodTab.tsx";

export function collectProblems(homeSrc, tabSrc) {
  const problems = [];

  if (!homeSrc.includes("attachForm425CLineFile")) {
    problems.push(`${HOME_PAGE}: must call attachForm425CLineFile — the real attachment endpoint, not a local-only boolean`);
  }
  if (!homeSrc.includes("requestUploadUrlFromFile") || !homeSrc.includes("uploadFileToR2") || !homeSrc.includes("confirmUpload")) {
    problems.push(`${HOME_PAGE}: attachment upload must use the real docs upload chain (requestUploadUrlFromFile -> uploadFileToR2 -> confirmUpload)`);
  }
  if (!homeSrc.includes("Create / Load Draft before attaching a file")) {
    problems.push(`${HOME_PAGE}: attaching without reportId must toast, not silently no-op`);
  }
  if (!homeSrc.includes("attachMutation.mutate({ line, file }")) {
    problems.push(`${HOME_PAGE}: onAttachFile must dispatch the attach mutation with line + file`);
  }

  if (tabSrc.includes("setForm((prev) => ({ ...prev, [key]: e.target.checked }))")) {
    problems.push(`${TAB_PAGE}: attachment checkbox must not be a manually-toggleable local boolean — it must reflect a real uploaded file`);
  }
  if (!tabSrc.includes('type="file"')) {
    problems.push(`${TAB_PAGE}: Part 8 Attachments must offer a real file picker, not a checkbox with no upload path`);
  }
  if (!tabSrc.includes("onAttachFile(line as number, file)") && !tabSrc.includes("onAttachFile(line, file)")) {
    problems.push(`${TAB_PAGE}: file picker must call onAttachFile(line, file)`);
  }

  return problems;
}

const goodHome = `
  import { attachForm425CLineFile } from "../../api/form425c";
  import { confirmUpload, requestUploadUrlFromFile, uploadFileToR2 } from "../../api/docs";
  const attachMutation = useMutation({
    mutationFn: async ({ line, file }) => {
      const reportId = form.reportId;
      if (!reportId) throw new Error("Create / Load Draft before attaching a file");
      const { file_id, presigned_url } = await requestUploadUrlFromFile(file, { operating_company_id: companyId });
      await uploadFileToR2(presigned_url, file, file.type || "application/octet-stream");
      await confirmUpload(file_id);
      await attachForm425CLineFile(reportId, companyId, line, file_id);
    },
  });
  onAttachFile={(line, file) => {
    if (!form.reportId) {
      pushToast("Create / Load Draft before attaching a file", "error");
      return;
    }
    attachMutation.mutate({ line, file });
  }}
`;
const goodTab = `
  <input
    id={inputId}
    type="file"
    onChange={(e) => {
      const file = e.target.files?.[0];
      if (file) onAttachFile(line as number, file);
    }}
  />
`;
const badHome = `
  const attachMutation = null;
`;
const badTab = `
  <input
    type="checkbox"
    checked={Boolean((form)[key])}
    onChange={(e) => setForm((prev) => ({ ...prev, [key]: e.target.checked }))}
  />
`;

if (process.argv.includes("--selftest")) {
  if (collectProblems(goodHome, goodTab).length) {
    console.error(`${LABEL} --selftest FAIL good`);
    process.exit(1);
  }
  if (collectProblems(badHome, badTab).length < 5) {
    console.error(`${LABEL} --selftest FAIL bad too weak`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS`);
  process.exit(0);
}

const homeSrc = fs.readFileSync(path.join(ROOT, HOME_PAGE), "utf8");
const tabSrc = fs.readFileSync(path.join(ROOT, TAB_PAGE), "utf8");
const problems = collectProblems(homeSrc, tabSrc);
if (problems.length) {
  console.error(`${LABEL}: FAIL\n${problems.map((p) => `  - ${p}`).join("\n")}`);
  process.exit(1);
}
console.log(`${LABEL}: PASS — Part 8 Attachments upload real, not a dead checkbox`);
process.exit(0);
