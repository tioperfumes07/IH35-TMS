#!/usr/bin/env node
/**
 * F425C-SAVE-DRAFT-SILENT — Save Draft wiped form.reportId on list/detail invalidate
 * (buttons died, no toast). History Open with no reporting_month still switched tabs.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-form425c-save-draft-toasts";
const PAGE = "apps/frontend/src/pages/form425c/Form425CHome.tsx";

export function collectProblems(src) {
  const problems = [];
  if (!src.includes("if (detailQuery.isFetching || selectedReport?.id) return")) {
    problems.push(`${PAGE}: must not wipe form while detail is refetching or a report is selected`);
  }
  if (!src.includes("loadedId === selectedReport.id")) {
    problems.push(`${PAGE}: hydrate only when detail report id matches the selected period — leftover month change kept prior MOR cash`);
  }
  if (!src.includes("loadedId !== selectedReport.id")) {
    problems.push(`${PAGE}: must clear stale MOR cash when the selected period id is not the loaded detail id`);
  }
  if (!src.includes("form.reportId !== selectedReport?.id")) {
    problems.push(`${PAGE}: Import/Generate/Mark Filed must refuse when the loaded draft is not the selected period`);
  }
  if (!src.includes('pushToast("Draft saved"')) {
    problems.push(`${PAGE}: manual Save Draft must toast Draft saved`);
  }
  if (!src.includes("Create / Load Draft before saving")) {
    problems.push(`${PAGE}: Save Draft without reportId must toast, not return silently`);
  }
  if (!src.includes("Could not open that report")) {
    problems.push(`${PAGE}: History Open without reporting_month must toast, not silent tab switch`);
  }
  if (!src.includes("reporting month is invalid")) {
    problems.push(`${PAGE}: History Open with an unparseable reporting_month must toast, not switch tabs onto the wrong period`);
  }
  if (!src.includes("Opened report in Form 425C")) {
    problems.push(`${PAGE}: History Open must toast when a report loads`);
  }
  if (!src.includes("Create / Load Draft before generating the filing package")) {
    problems.push(`${PAGE}: Merge Generate without reportId must toast, not a dead disabled button`);
  }
  if (!src.includes("Create / Load Draft before importing from Banking")) {
    problems.push(`${PAGE}: Form Import from Banking without reportId must toast, not a dead disabled button`);
  }
  if (!src.includes("Create / Load Draft before generating the filing PDF")) {
    problems.push(`${PAGE}: Form Generate PDF without reportId must toast, not a dead disabled button`);
  }
  if (!src.includes("Create / Load Draft before marking filed")) {
    problems.push(`${PAGE}: Form Mark Filed without reportId must toast, not a dead disabled button`);
  }
  if (!src.includes("Draft saved — generating filing PDF")) {
    problems.push(`${PAGE}: dirty Generate PDF must save first then toast, not silently print a stale PDF`);
  }
  if (!src.includes("Draft saved — marking filed")) {
    problems.push(`${PAGE}: dirty Mark Filed must save first then toast, not silently file a stale draft`);
  }
  if (!src.includes("Create / Load Draft before autosave")) {
    problems.push(`${PAGE}: dirty autosave without reportId must toast, not silently skip`);
  }
  const profiles = fs.readFileSync(path.join(ROOT, "apps/frontend/src/pages/form425c/tabs/ProfilesTab.tsx"), "utf8");
  if (!profiles.includes('bankAccounts: [...draft.bankAccounts, { id: "", label: "", number: "" }]')) {
    problems.push("apps/frontend/src/pages/form425c/tabs/ProfilesTab.tsx: Bank Accounts must + Create a new row, not a dead heading with no add");
  }
  // F425C-ATTACHMENTS-CHECKBOX-NO-UPLOAD superseded the toast-only patch with a real upload —
  // the durable invariant is that the box can never again be a manually-settable local boolean.
  // See scripts/verify-form425c-attachments-upload-wired.mjs for the full upload-wiring assertions.
  const formTab = fs.readFileSync(path.join(ROOT, "apps/frontend/src/pages/form425c/tabs/CurrentPeriodTab.tsx"), "utf8");
  if (formTab.includes("setForm((prev) => ({ ...prev, [key]: e.target.checked }))")) {
    problems.push("apps/frontend/src/pages/form425c/tabs/CurrentPeriodTab.tsx: Part 8 checkboxes must not be a manually-toggleable local boolean — attach a real file instead");
  }
  const qbTab = fs.readFileSync(path.join(ROOT, "apps/frontend/src/pages/form425c/tabs/QBImportTab.tsx"), "utf8");
  if (qbTab.includes("useState(new Date().getMonth())")) {
    problems.push("apps/frontend/src/pages/form425c/tabs/QBImportTab.tsx: Month/Year must be the Form period, not a silent local picker");
  }
  if (!qbTab.includes("qbDateInPeriod") || !qbTab.includes("month/year filter excluded pasted rows")) {
    problems.push("apps/frontend/src/pages/form425c/tabs/QBImportTab.tsx: Parse must filter to selected month/year and toast when the filter drops all rows");
  }
  if (!src.includes("month={month}") || !src.includes("<QBImportTab")) {
    problems.push(`${PAGE}: QB Import must receive the Form month/year, not a disconnected local period`);
  }
  if (src.includes("onApplyTotal")) {
    problems.push(`${PAGE}: Apply to Line 20 must not write form.totalReceipts — Save Draft cannot PATCH lines 19-21`);
  }
  if (!qbTab.includes("court cash is banking SoR")) {
    problems.push("apps/frontend/src/pages/form425c/tabs/QBImportTab.tsx: Apply to Line 20 must toast banking SoR, not silently paint an unsaved Line 20");
  }
  if (!formTab.includes("readOnly") || !formTab.includes("Save Draft does not write them")) {
    problems.push("apps/frontend/src/pages/form425c/tabs/CurrentPeriodTab.tsx: Lines 19-21 must be readOnly banking SoR — editable + Save was a silent no-op");
  }
  const saveChunk = (src.split("const saveMutation")[1] ?? "").split("const importMutation")[0];
  if (saveChunk.includes("line_19") || saveChunk.includes("line_20_receipts") || saveChunk.includes("line_21_disbursements")) {
    problems.push(`${PAGE}: Save Draft must not PATCH lines 19-21 (banking import is SoR)`);
  }
  if (src.includes("new Date(row.reporting_month)")) {
    problems.push(`${PAGE}: History Open must parse YYYY-MM from reporting_month slice, not Date (UTC/local month shift)`);
  }
  if (!src.includes("setOpenedReportId(id)") || !src.includes("openedReportId")) {
    problems.push(`${PAGE}: History Open must select the clicked report id — same-month filed+amendment find() kept the wrong row`);
  }
  if (!src.includes("setOpenedReportId(created.id)")) {
    problems.push(`${PAGE}: Create / Amend must pin created.id — month-only find() can hydrate the other same-month MOR`);
  }
  if (!src.includes("Create already in progress")) {
    problems.push(`${PAGE}: double-click Create must toast, not fire a second POST that 500s on UNIQUE(month, status)`);
  }
  if (!src.includes("matches.find((r) => r.status !== \"filed\")") && !src.includes("r.status !== \"filed\"")) {
    problems.push(`${PAGE}: period picker must prefer a non-filed row when several share the month`);
  }
  if (!src.includes("Carry-forward override needs a reason of at least 30 characters")) {
    problems.push(`${PAGE}: carry-forward save without 30-char reason must throw/toast, not hit a 500`);
  }
  const routes = fs.readFileSync(path.join(ROOT, "apps/backend/src/compliance/form-425c.routes.ts"), "utf8");
  if (!routes.includes("form_425c_period_draft_exists")) {
    problems.push("apps/backend/src/compliance/form-425c.routes.ts: Create when a draft already exists for the month must 409, not UNIQUE 500");
  }
  if (!routes.includes('reply.code(422).send({') || !routes.includes("projection_override_reason_required_min_30_chars")) {
    problems.push("apps/backend/src/compliance/form-425c.routes.ts: short carry-forward reason must 422, not 500");
  }
  if (!routes.includes("mor_cash_zero_with_activity") || !routes.includes('reply.code(422).send({')) {
    problems.push("apps/backend/src/compliance/form-425c.routes.ts: banking import $0-with-activity must 422, not 502/500");
  }
  const summaryChunk = routes.split('app.get("/api/v1/form-425c/banking-summary"')[1] ?? "";
  if (!summaryChunk.includes("mor_cash_zero_with_activity") || !summaryChunk.includes("reply.code(422)")) {
    problems.push("apps/backend/src/compliance/form-425c.routes.ts: GET banking-summary $0-with-activity must 422, not an uncaught 500");
  }
  if (!routes.includes('error: "file_not_found"') || !routes.includes("Attachment file UUID not found")) {
    problems.push("apps/backend/src/compliance/form-425c.routes.ts: missing attachment file UUID must 404, not 500");
  }
  const mergeTab = fs.readFileSync(path.join(ROOT, "apps/frontend/src/pages/form425c/tabs/MergeExportTab.tsx"), "utf8");
  if (!mergeTab.includes("!canGenerate") || !mergeTab.includes("Create / Load Draft before generating the filing package")) {
    problems.push("apps/frontend/src/pages/form425c/tabs/MergeExportTab.tsx: Generate without a draft must show the Create/Load warning, not a silent live-looking button");
  }
  if (mergeTab.includes("disabled={generating || !canGenerate}")) {
    problems.push("apps/frontend/src/pages/form425c/tabs/MergeExportTab.tsx: Generate without a draft must stay clickable so the parent toast fires — a disabled button is a dead click");
  }
  if (!src.includes("This MOR is filed — use Amend on History")) {
    problems.push(`${PAGE}: Save/Import/Generate on a filed MOR must toast Amend — not silently rewrite the court filing`);
  }
  if (!src.includes('form.status === "filed"')) {
    problems.push(`${PAGE}: filed status must block Save Draft / autosave / Import / Generate`);
  }
  if (!routes.includes("form_425c_filed_immutable") || !routes.includes('reply.code(409).send({')) {
    problems.push("apps/backend/src/compliance/form-425c.routes.ts: PATCH/import/generate on filed must 409, not rewrite or un-file");
  }
  if (!routes.includes("AND status <> 'filed'")) {
    problems.push("apps/backend/src/compliance/form-425c.routes.ts: generate UPDATE must refuse status=filed (would set ready_to_file)");
  }
  const patchChunk = (routes.split('app.patch("/api/v1/form-425c/:id"')[1] ?? "").split('app.post("/api/v1/form-425c/:id/import-banking"')[0];
  const importChunk = (routes.split('app.post("/api/v1/form-425c/:id/import-banking"')[1] ?? "").split('app.post("/api/v1/form-425c/:id/generate-filing-pdf"')[0];
  if (!patchChunk.includes("AND status <> 'filed'") || !importChunk.includes("AND status <> 'filed'")) {
    problems.push("apps/backend/src/compliance/form-425c.routes.ts: PATCH and Import UPDATE must refuse status=filed — SELECT-then-UPDATE without the predicate could rewrite a just-filed MOR");
  }
  if (!routes.includes("form_425c_amendment_already_open") || !routes.includes("form_425c_amend_source_not_filed")) {
    problems.push(
      "apps/backend/src/compliance/form-425c.routes.ts: second Amend on a filed MOR must 409 — UNIQUE(opco, month, status) was a 500",
    );
  }
  const amendChunk = (routes.split('app.post("/api/v1/form-425c/:id/amend"')[1] ?? "").split('app.post("/api/v1/form-425c/:id/exhibit-a"')[0];
  if (
    !amendChunk.includes("INSERT INTO compliance.form_425c_exhibit_a_entries") ||
    !amendChunk.includes("INSERT INTO compliance.form_425c_exhibit_b_entries") ||
    !amendChunk.includes("WHERE report_id = $2")
  ) {
    problems.push("apps/backend/src/compliance/form-425c.routes.ts: Amend must copy Exhibit A/B rows onto the new draft — dropping them was a silent incomplete amendment");
  }
  const attachChunk = routes.split('app.post("/api/v1/form-425c/:id/attachments/:line"')[1] ?? "";
  if (!attachChunk.includes("assertMutableForm425CReport") || !attachChunk.includes("AND status <> 'filed'")) {
    problems.push("apps/backend/src/compliance/form-425c.routes.ts: attachment POST must refuse filed MORs — UPDATE without status was a silent rewrite");
  }
  if (!src.includes("addForm425CExhibitA") || !src.includes("addForm425CExhibitB") || !src.includes("onSaveExhibit")) {
    problems.push(`${PAGE}: flagged questionnaire must POST exhibit A/B — not a dead hop to /425c/exhibits A–F`);
  }
  if (!routes.includes("assertMutableForm425CReport") || !routes.includes("form_425c_exhibit_insert_blocked")) {
    problems.push(
      "apps/backend/src/compliance/form-425c.routes.ts: exhibit A/B POST must refuse filed/missing reports — empty INSERT RETURNING was a silent 201",
    );
  }
  const exhibitAChunk = (routes.split('app.post("/api/v1/form-425c/:id/exhibit-a"')[1] ?? "").split('app.post("/api/v1/form-425c/:id/exhibit-b"')[0];
  const exhibitBChunk = (routes.split('app.post("/api/v1/form-425c/:id/exhibit-b"')[1] ?? "").split('app.post("/api/v1/form-425c/:id/attachments')[0];
  if (!exhibitAChunk.includes("assertMutableForm425CReport") || !exhibitBChunk.includes("assertMutableForm425CReport")) {
    problems.push("apps/backend/src/compliance/form-425c.routes.ts: both exhibit A and B POSTs must assert the MOR is a non-filed report for this opco");
  }
  if (!formTab.includes("onSaveExhibit") || !formTab.includes("Save Exhibit")) {
    problems.push("apps/frontend/src/pages/form425c/tabs/CurrentPeriodTab.tsx: Exhibit required must save a line explanation, not only link to /425c/exhibits");
  }
  if (formTab.includes('to="/425c/exhibits"') && formTab.includes("Exhibit required")) {
    problems.push("apps/frontend/src/pages/form425c/tabs/CurrentPeriodTab.tsx: Exhibit required must not navigate to A–F builder in place of Exhibit A/B");
  }
  if (profiles.includes('to="/425c/exhibits"') && profiles.includes("Exhibit required")) {
    problems.push("apps/frontend/src/pages/form425c/tabs/ProfilesTab.tsx: default flagged answers must hop to Form 425C Exhibit A/B, not A–F builder");
  }
  if (!profiles.includes('to="/425c?tab=form"') || !profiles.includes("Save Exhibit on Form 425C")) {
    problems.push("apps/frontend/src/pages/form425c/tabs/ProfilesTab.tsx: Exhibit required on defaults must open /425c?tab=form");
  }
  const historyTab = fs.readFileSync(path.join(ROOT, "apps/frontend/src/pages/form425c/tabs/HistoryTab.tsx"), "utf8");
  if (!historyTab.includes('statusFilter === "amended"') || !historyTab.includes("amended_from_uuid")) {
    problems.push(
      "apps/frontend/src/pages/form425c/tabs/HistoryTab.tsx: Status=amended must match amended_from_uuid drafts — status==='amended' is never written by Amend",
    );
  }
  if (historyTab.includes("return reports.filter((r) => r.status === statusFilter);") && !historyTab.includes('statusFilter === "amended"')) {
    problems.push("apps/frontend/src/pages/form425c/tabs/HistoryTab.tsx: must not filter amended by status equality alone");
  }
  const pdf = fs.readFileSync(path.join(ROOT, "apps/backend/src/compliance/form-425c-pdf.ts"), "utf8");
  if (!pdf.includes("form_425c_exhibit_a_entries") || !pdf.includes("form_425c_exhibit_b_entries") || !pdf.includes("exhibitSection")) {
    problems.push("apps/backend/src/compliance/form-425c-pdf.ts: Generate Filing PDF must include saved Exhibit A/B rows, not only [Exhibit required]");
  }
  const fePrint = fs.readFileSync(path.join(ROOT, "apps/frontend/src/pages/form425c/lib/buildPrintHTML.ts"), "utf8");
  if (!fePrint.includes("exhibitPrintBlock") || !fePrint.includes("No Exhibit explanation saved")) {
    problems.push("apps/frontend/src/pages/form425c/lib/buildPrintHTML.ts: print fallback must include Exhibit A/B explanations");
  }
  if (!src.includes("exhibitEntries.a") || !src.includes("exhibitEntries.b")) {
    problems.push(`${PAGE}: Generate PDF fallback must pass saved exhibit rows into buildPrintHTML`);
  }
  return problems;
}

const good = `
  if (detailQuery.isFetching || selectedReport?.id) return;
  if (selectedReport?.id && loadedId === selectedReport.id) {
  if (selectedReport?.id && loadedId !== selectedReport.id) {
  if (!form.reportId || form.reportId !== selectedReport?.id) {
  pushToast("Create / Load Draft before saving", "error");
  pushToast("Draft saved", "success");
  pushToast("Could not open that report", "error");
  pushToast("Could not open that report — reporting month is invalid", "error");
  pushToast("Opened report in Form 425C", "success");
  pushToast("Create / Load Draft before generating the filing package", "error");
  pushToast("Create / Load Draft before importing from Banking", "error");
  pushToast("Create / Load Draft before generating the filing PDF", "error");
  pushToast("Create / Load Draft before marking filed", "error");
  pushToast("Draft saved — generating filing PDF", "success");
  pushToast("Draft saved — marking filed", "success");
  pushToast("Create / Load Draft before autosave", "error");
  month={month}
  <QBImportTab
  setOpenedReportId(id)
  setOpenedReportId(created.id)
  openedReportId
  Create already in progress
  matches.find((r) => r.status !== "filed")
  throw new Error("Carry-forward override needs a reason of at least 30 characters");
  throw new Error("This MOR is filed — use Amend on History");
  form.status === "filed"
  addForm425CExhibitA
  addForm425CExhibitB
  onSaveExhibit
  exhibitEntries.a
  exhibitEntries.b
`;
const bad = `
  if (!detailQuery.data?.report) {
    setForm(emptyForm());
    return;
  }
  onOpen={(id) => { setTab("form"); }}
  setForm((prev) => ({ ...prev, [key]: e.target.checked }))
`;

if (process.argv.includes("--selftest")) {
  if (collectProblems(good).length) {
    console.error(`${LABEL} --selftest FAIL good`);
    process.exit(1);
  }
  if (collectProblems(bad).length < 4) {
    console.error(`${LABEL} --selftest FAIL bad too weak`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS`);
  process.exit(0);
}

const src = fs.readFileSync(path.join(ROOT, PAGE), "utf8");
const problems = collectProblems(src);
if (problems.length) {
  console.error(`${LABEL}: FAIL\n${problems.map((p) => `  - ${p}`).join("\n")}`);
  process.exit(1);
}
console.log(`${LABEL}: PASS — ${PAGE} Save Draft / History Open not silent`);
process.exit(0);
