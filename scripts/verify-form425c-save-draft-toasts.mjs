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
  if (src.includes("{ ...defaults, ...(report.part1_answers") || !src.includes("function answersFromReport")) {
    problems.push(`${PAGE}: hydrate must not spread profile defaults over unanswered lines — autosave then wrote invented Yes/No onto the MOR`);
  }
  if (src.includes("answers: { ...DEFAULT_PROFILES.trucking.defaultAnswers }") || src.includes("answers: { ...defaults }")) {
    problems.push(`${PAGE}: empty / period-switch form must not paint profile default Yes/No — that is a silent court questionnaire`);
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
  if (formTab.includes('?? (q.expectYes ? "yes" : "no")')) {
    problems.push("apps/frontend/src/pages/form425c/tabs/CurrentPeriodTab.tsx: unanswered questionnaire radios must stay empty — inventing Yes/No is a silent court answer");
  }
  if (
    formTab.includes("${netCash.toFixed(2)}") ||
    formTab.includes("${cashEnd.toFixed(2)}") ||
    formTab.includes("${nv(form.totalReceipts).toFixed(2)}") ||
    !formTab.includes("function moneyCell") ||
    !formTab.includes("function computedDiff")
  ) {
    problems.push("apps/frontend/src/pages/form425c/tabs/CurrentPeriodTab.tsx: empty banking/projection fields must render — not $0.00 (silent invented court cash)");
  }
  if (profiles.includes('?? (q.expectYes ? "yes" : "no")')) {
    problems.push("apps/frontend/src/pages/form425c/tabs/ProfilesTab.tsx: unanswered default-questionnaire radios must stay empty — inventing Yes/No was a silent Save Defaults write");
  }
  const constants = fs.readFileSync(path.join(ROOT, "apps/frontend/src/pages/form425c/lib/constants.ts"), "utf8");
  if (constants.includes("DEFAULT_Q") || constants.includes("1: \"yes\"") || constants.includes("defaultAnswers: { ...DEFAULT_Q }")) {
    problems.push("apps/frontend/src/pages/form425c/lib/constants.ts: client DEFAULT_PROFILES must not seed invented Yes/No before the filing profile loads");
  }
  if (constants.includes("WF-3500") || constants.includes("WF-1") || constants.includes("xxxx3500")) {
    problems.push("apps/frontend/src/pages/form425c/lib/constants.ts: client DEFAULT_PROFILES must not seed invented DIP bank accounts before the filing profile loads");
  }
  if (
    constants.includes("IH 35 TRUCKING") ||
    constants.includes("IH 35 TRANSPORTATION") ||
    constants.includes("San Antonio") ||
    constants.includes("Laredo") ||
    constants.includes("484121")
  ) {
    problems.push("apps/frontend/src/pages/form425c/lib/constants.ts: client DEFAULT_PROFILES must not seed an invented debtor name/address before the filing profile loads");
  }
  const qbTab = fs.readFileSync(path.join(ROOT, "apps/frontend/src/pages/form425c/tabs/QBImportTab.tsx"), "utf8");
  if (qbTab.includes("useState(new Date().getMonth())")) {
    problems.push("apps/frontend/src/pages/form425c/tabs/QBImportTab.tsx: Month/Year must be the Form period, not a silent local picker");
  }
  if (!qbTab.includes("qbDateInPeriod") || !qbTab.includes("month/year filter excluded pasted rows")) {
    problems.push("apps/frontend/src/pages/form425c/tabs/QBImportTab.tsx: Parse must filter to selected month/year and toast when the filter drops all rows");
  }
  if (qbTab.includes('?? "WF-3500"') || qbTab.includes("?? 'WF-3500'")) {
    problems.push("apps/frontend/src/pages/form425c/tabs/QBImportTab.tsx: paste placeholder must not invent WF-3500 when Profiles has no DIP account");
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
  if (!src.includes("will not invent a court caption") || src.includes("${profiles[activeCompany].division} Division · ${profiles[activeCompany].district} District")) {
    problems.push(`${PAGE}: Create must refuse empty division/district — must not POST invented " Division ·  District"`);
  }
  if (!src.includes("will not create a court MOR without a debtor name")) {
    problems.push(`${PAGE}: Create must refuse empty debtor name after DEFAULT_PROFILES emptied — must not POST a nameless court MOR`);
  }
  if (src.includes("Number(form.totalPayables || 0)") || src.includes("Number(form.projReceiptsLast || 0)") || !src.includes("optionalFormNumber")) {
    problems.push(`${PAGE}: Save Draft must send null for empty money/count fields — Number(x || 0) invents $0 on the court MOR`);
  }
  const printHtml = fs.readFileSync(path.join(ROOT, "apps/frontend/src/pages/form425c/lib/buildPrintHTML.ts"), "utf8");
  if (printHtml.includes("${p.division} Division · ${p.district} District") || !printHtml.includes("courtDistrictCaption")) {
    problems.push("apps/frontend/src/pages/form425c/lib/buildPrintHTML.ts: court line must use courtDistrictCaption — empty profile must not print invented Division/District");
  }
  if (printHtml.includes("function nv(") || printHtml.includes("nv(form.totalReceipts)") || printHtml.includes("|| 0")) {
    problems.push("apps/frontend/src/pages/form425c/lib/buildPrintHTML.ts: empty cash/projection fields must not print invented $0 nets (nv || 0)");
  }
  if (!src.includes("matches.find((r) => r.status !== \"filed\")") && !src.includes("r.status !== \"filed\"")) {
    problems.push(`${PAGE}: period picker must prefer a non-filed row when several share the month`);
  }
  if (!src.includes("Carry-forward override needs a reason of at least 30 characters")) {
    problems.push(`${PAGE}: carry-forward save without 30-char reason must throw/toast, not hit a 500`);
  }
  const routes = fs.readFileSync(path.join(ROOT, "apps/backend/src/compliance/form-425c.routes.ts"), "utf8");
  if (routes.includes("Number(incoming32 ?? current.line_32_proj_receipts ?? 0)") || routes.includes("Number(b.line_35_next_proj_receipts ?? current.line_35_next_proj_receipts ?? 0)")) {
    problems.push("apps/backend/src/compliance/form-425c.routes.ts: PATCH must not invent line 34/37 nets from empty projections as $0");
  }
  if (routes.includes("Number(prev?.line_35_next_proj_receipts ?? 0)") || routes.includes("Number(prev?.line_36_next_proj_disbursements ?? 0)")) {
    problems.push("apps/backend/src/compliance/form-425c.routes.ts: Create must not invent $0 line 32–34 when the prior month has no next-month projections");
  }
  if (!routes.includes("form_425c_period_draft_exists")) {
    problems.push("apps/backend/src/compliance/form-425c.routes.ts: Create when a draft already exists for the month must 409, not UNIQUE 500");
  }
  const createChunk = (routes.split('app.post("/api/v1/form-425c", {')[1] ?? "").split('app.patch("/api/v1/form-425c/:id"')[0];
  if (!createChunk.includes("form_425c_operating_company_not_found") || !createChunk.includes("sendForm425CCompanyMissing")) {
    problems.push("apps/backend/src/compliance/form-425c.routes.ts: Create on a missing/inactive company must 404, not an uncaught 500 from ensureDefaultProfile");
  }
  if (!src.includes("Select an operating company before creating a report")) {
    problems.push(`${PAGE}: Create / Load Draft without an operating company must toast, not POST an empty uuid`);
  }
  if (!src.includes("Could not load Form 425C reports")) {
    problems.push(`${PAGE}: reports GET failure must toast — History empty with no toast was a silent miss`);
  }
  if (!src.includes("Could not load Form 425C report detail")) {
    problems.push(`${PAGE}: report detail GET failure must toast — Form cash empty with no toast was a silent miss`);
  }
  const listChunk = (routes.split('app.get("/api/v1/form-425c", {')[1] ?? "").split("app.get(\"/api/v1/form-425c/profiles\"")[0];
  const detailChunk = (routes.split('app.get("/api/v1/form-425c/:id", {')[1] ?? "").split("app.get(\"/api/v1/form-425c/:id/filing-html\"")[0];
  if (!listChunk.includes("sendForm425CForbiddenMembership")) {
    problems.push("apps/backend/src/compliance/form-425c.routes.ts: History list GET must 403 on forbidden_company_membership, not an uncaught 500");
  }
  if (!listChunk.includes("sendForm425CCompanyMissing")) {
    problems.push("apps/backend/src/compliance/form-425c.routes.ts: History list GET must 404 a missing/inactive company, not an uncaught 500");
  }
  if (!detailChunk.includes("sendForm425CForbiddenMembership")) {
    problems.push("apps/backend/src/compliance/form-425c.routes.ts: report detail GET must 403 on forbidden_company_membership, not an uncaught 500");
  }
  if (!detailChunk.includes("sendForm425CCompanyMissing")) {
    problems.push("apps/backend/src/compliance/form-425c.routes.ts: report detail GET must 404 a missing/inactive company, not an uncaught 500");
  }
  const ensureChunk = (routes.split("async function ensureDefaultProfile")[1] ?? "").split("app.get(\"/api/v1/form-425c\"")[0];
  if (ensureChunk.includes('"1": "yes"') || ensureChunk.includes("JSON.stringify(defaultAnswers)")) {
    problems.push("apps/backend/src/compliance/form-425c.routes.ts: ensureDefaultProfile must not invent Yes/No default_questionnaire_answers on first GET");
  }
  if (!ensureChunk.includes("'{}'::jsonb")) {
    problems.push("apps/backend/src/compliance/form-425c.routes.ts: first profile insert must store empty default_questionnaire_answers");
  }
  const profilesGetChunk = (routes.split('app.get("/api/v1/form-425c/profiles"')[1] ?? "").split("app.get(\"/api/v1/form-425c/banking-summary\"")[0];
  if (!profilesGetChunk.includes("sendForm425CForbiddenMembership")) {
    problems.push("apps/backend/src/compliance/form-425c.routes.ts: profiles GET must 403 on forbidden_company_membership, not an uncaught 500");
  }
  const profilesPostChunk = (routes.split('app.post("/api/v1/form-425c/profiles"')[1] ?? "").split('app.post("/api/v1/form-425c"')[0];
  if (!profilesGetChunk.includes("form_425c_operating_company_not_found") || !profilesGetChunk.includes("sendForm425CCompanyMissing")) {
    problems.push("apps/backend/src/compliance/form-425c.routes.ts: GET profiles on a missing/inactive company must 404, not an uncaught 500");
  }
  if (!profilesPostChunk.includes("form_425c_operating_company_not_found") || !profilesPostChunk.includes("rateLimit") || !profilesPostChunk.includes("sendForm425CForbiddenMembership")) {
    problems.push("apps/backend/src/compliance/form-425c.routes.ts: POST profiles must rate-limit and 404 missing company / 403 membership — uncaught throw was a 500");
  }
  if (!src.includes("Could not load Form 425C profile")) {
    problems.push(`${PAGE}: Profiles GET failure must toast — keeping DEFAULT_PROFILES with no toast was a silent wrong debtor`);
  }
  if (!src.includes("Select an operating company before saving profile defaults")) {
    problems.push(`${PAGE}: Save Defaults without an operating company must toast, not POST an empty uuid`);
  }
  if (profiles.includes("disabled={saving || !canSave}")) {
    problems.push("apps/frontend/src/pages/form425c/tabs/ProfilesTab.tsx: Save Defaults must stay clickable when canSave is false so the parent toast fires — disabled is a leftover dead click");
  }
  if (!routes.includes('reply.code(422).send({') || !routes.includes("projection_override_reason_required_min_30_chars")) {
    problems.push("apps/backend/src/compliance/form-425c.routes.ts: short carry-forward reason must 422, not 500");
  }
  if (!routes.includes("mor_cash_zero_with_activity") || !routes.includes('reply.code(422).send({')) {
    problems.push("apps/backend/src/compliance/form-425c.routes.ts: banking import $0-with-activity must 422, not 502/500");
  }
  const summaryChunk = (routes.split('app.get("/api/v1/form-425c/banking-summary"')[1] ?? "").split(
    'app.get("/api/v1/form-425c/:id"',
  )[0];
  if (!summaryChunk.includes("mor_cash_zero_with_activity") || !summaryChunk.includes("reply.code(422)")) {
    problems.push("apps/backend/src/compliance/form-425c.routes.ts: GET banking-summary $0-with-activity must 422, not an uncaught 500");
  }
  if (!summaryChunk.includes("sendForm425CForbiddenMembership") || !summaryChunk.includes("sendForm425CCompanyMissing")) {
    problems.push(
      "apps/backend/src/compliance/form-425c.routes.ts: GET banking-summary must 403 membership / 404 missing company — blanket 502 was a unique leftover 500-class",
    );
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
  if (!mergeTab.includes("Set the debtor name in Profiles before a court filename")) {
    problems.push("apps/frontend/src/pages/form425c/tabs/MergeExportTab.tsx: empty debtor must not show a fabricated court filename");
  }
  const mergeChunk = (src.split('tab === "merge"')[1] ?? "").split('tab === "history"')[0];
  if (mergeChunk.includes("generateMutation.mutate")) {
    problems.push(
      `${PAGE}: Merge Generate must not POST generate-filing-pdf — that silently flipped draft → ready_to_file`,
    );
  }
  if (!mergeChunk.includes("historyPrintMutation.mutate") || !mergeChunk.includes("status unchanged")) {
    problems.push(
      `${PAGE}: Merge Generate must use History Print GET (read-only) and toast that status is unchanged`,
    );
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
  if (!importChunk.includes("form_425c_operating_company_not_found") || !importChunk.includes("sendForm425CCompanyMissing")) {
    problems.push(
      "apps/backend/src/compliance/form-425c.routes.ts: Import from Banking must 404 missing company — blanket 502 was a leftover 500-class",
    );
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
  if (!attachChunk.includes("sendForm425CForbiddenMembership")) {
    problems.push("apps/backend/src/compliance/form-425c.routes.ts: attachment POST must 403 on forbidden_company_membership, not an uncaught 500");
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
  if (!routes.includes("function sendExhibitWriteError") || !(routes.split("function sendExhibitWriteError")[1] ?? "").includes("sendForm425CForbiddenMembership")) {
    problems.push("apps/backend/src/compliance/form-425c.routes.ts: Exhibit A/B POST must 403 on forbidden_company_membership, not an uncaught 500");
  }
  if (!(routes.split("function sendExhibitWriteError")[1] ?? "").includes("sendForm425CCompanyMissing")) {
    problems.push("apps/backend/src/compliance/form-425c.routes.ts: Exhibit A/B POST must 404 a missing/inactive company, not an uncaught 500");
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
  if (!historyTab.includes("onPrint(r.id)") || !historyTab.includes("Print")) {
    problems.push("apps/frontend/src/pages/form425c/tabs/HistoryTab.tsx: History must Print a filing — filed MORs had no reprint hop after Generate was blocked");
  }
  if (!src.includes('const printHtml = String(res.print_html ?? "").trim()') || !src.includes("w.document.write(printHtml)")) {
    problems.push(`${PAGE}: History Print must write trimmed print_html — untrimmed whitespace was a blank court print`);
  }
  if (!src.includes("Wait for the filing profile to load") || !src.includes("Active debtor key is not this entity's filing profile")) {
    problems.push(`${PAGE}: Save Defaults must refuse trucking-key-before-USMCA-profile-load — that posted the wrong debtor key`);
  }
  if (!src.includes("!res.print_html?.trim()") && !src.includes('const printHtml = String(res.print_html ?? "").trim()')) {
    problems.push(`${PAGE}: History Print must toast when filing-html is empty — writing blank print_html was a silent no-op`);
  }
  if (!src.includes("getForm425CFilingHtml") || !src.includes("historyPrintMutation")) {
    problems.push(`${PAGE}: History Print must GET filing-html — not POST generate-filing-pdf (that mutates / refuses filed)`);
  }
  if (!routes.includes("/filing-html") || !routes.includes("buildForm425CPrintDocument")) {
    problems.push("apps/backend/src/compliance/form-425c.routes.ts: GET filing-html must reprint without INSERT/UPDATE");
  }
  const filingHtmlChunk = (routes.split('app.get("/api/v1/form-425c/:id/filing-html"')[1] ?? "").split('app.post("/api/v1/form-425c/profiles"')[0];
  if (!filingHtmlChunk.includes("sendForm425CForbiddenMembership")) {
    problems.push("apps/backend/src/compliance/form-425c.routes.ts: History/Merge print GET filing-html must 403 on forbidden_company_membership, not an uncaught 500");
  }
  if (!filingHtmlChunk.includes("form_425c_profile_required") || !filingHtmlChunk.includes("422")) {
    problems.push("apps/backend/src/compliance/form-425c.routes.ts: reprint must 422 when the profile/debtor name is missing — not print IH 35 / Debtor");
  }
  const generateChunk = (routes.split('app.post("/api/v1/form-425c/:id/generate-filing-pdf"')[1] ?? "").split('app.post("/api/v1/form-425c/:id/mark-filed"')[0];
  if (!generateChunk.includes("sendForm425CForbiddenMembership")) {
    problems.push("apps/backend/src/compliance/form-425c.routes.ts: Generate PDF must 403 on forbidden_company_membership, not an uncaught 500");
  }
  if (!generateChunk.includes("form_425c_filing_file_insert_failed") || !generateChunk.includes("502")) {
    problems.push("apps/backend/src/compliance/form-425c.routes.ts: Generate must 502 when the filing snapshot INSERT returns no file — not ready_to_file with a null PDF");
  }
  if (!generateChunk.includes("form_425c_r2_not_configured") || !generateChunk.includes("form_425c_r2_put_failed")) {
    problems.push("apps/backend/src/compliance/form-425c.routes.ts: Generate must 502 when R2 put is missing/fails — not ready_to_file with a ghost r2_key");
  }
  if (!generateChunk.includes("form_425c_profile_required") || !generateChunk.includes("sendForm425CCompanyMissing")) {
    problems.push("apps/backend/src/compliance/form-425c.routes.ts: Generate must 422 without a profile name and 404 a missing company — not invent IH 35 or 500");
  }
  const pdfLib = fs.readFileSync(path.join(ROOT, "apps/backend/src/compliance/form-425c-pdf.ts"), "utf8");
  if (!pdfLib.includes("form_425c_filing_file_insert_failed") || pdfLib.includes("fileInsert.rows[0]?.id ?? null")) {
    problems.push("apps/backend/src/compliance/form-425c-pdf.ts: Generate must throw when docs.files INSERT returns no id — null fileId marked the MOR ready");
  }
  if (!pdfLib.includes("form_425c_profile_required") || pdfLib.includes('?? "IH 35"') || pdfLib.includes('?? "Debtor"')) {
    problems.push("apps/backend/src/compliance/form-425c-pdf.ts: missing profile must throw — suggested_filename used IH 35 / Debtor on a court artifact");
  }
  if (!pdfLib.includes("form_425c_answers_incomplete") || pdfLib.includes('?? (expectYes ? "yes" : "no")')) {
    problems.push("apps/backend/src/compliance/form-425c-pdf.ts: unanswered questionnaire must throw — inventing yes/no on a court print is silent fabrication");
  }
  if (!routes.includes("sendForm425CAnswersIncomplete") || !src.includes("questionnaire is incomplete")) {
    problems.push(`${PAGE}: Generate/reprint must 422 unanswered 1–18 and the client must not invent Yes/No after empty HTML`);
  }
  if (!pdfLib.includes("putObjectBytes") || !pdfLib.includes("isR2Configured") || !pdfLib.includes("form_425c_r2_put_failed")) {
    problems.push("apps/backend/src/compliance/form-425c-pdf.ts: Generate must putObjectBytes before docs.files upload_completed_at — r2_key-only was a silent court artifact");
  }
  if (!pdfLib.includes("export async function buildForm425CPrintDocument") || !pdfLib.includes("Read-only court HTML")) {
    problems.push("apps/backend/src/compliance/form-425c-pdf.ts: reprint must be a read-only builder, not generateForm425CPdf");
  }
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
  if (
    fePrint.includes('?? (q.expectYes ? "yes" : "no")') ||
    fePrint.includes('form.answers[q.num] || "yes"') ||
    fePrint.includes('form.answers[q.num] || "no"') ||
    !fePrint.includes('if (!name) return ""')
  ) {
    problems.push("apps/frontend/src/pages/form425c/lib/buildPrintHTML.ts: must not invent Yes/No or a blank-debtor court filename");
  }
  if (!src.includes("Print opened without a debtor filename") || src.includes("res.suggested_filename || suggestedFilename")) {
    problems.push(`${PAGE}: Generate toast must not invent a court PDF name when suggested_filename and Profiles name are empty`);
  }
  if (src.includes("Ready to print: ${res.suggested_filename}")) {
    problems.push(`${PAGE}: History Print must refuse an empty suggested_filename — interpolating it was a silent success toast`);
  }
  if (!src.includes("exhibitEntries.a") || !src.includes("exhibitEntries.b")) {
    problems.push(`${PAGE}: Generate PDF fallback must pass saved exhibit rows into buildPrintHTML`);
  }
  if (
    !src.includes('String(res.print_html ?? "").trim()') ||
    !src.includes("Generate returned empty filing HTML")
  ) {
    problems.push(
      `${PAGE}: Form Generate must trim print_html before the client fallback and toast if still empty — whitespace-only HTML was a silent blank print`,
    );
  }
  if (
    src.includes('String(res.print_html ?? "").trim() ||') ||
    !src.includes("Profiles has no debtor name")
  ) {
    problems.push(
      `${PAGE}: empty Generate HTML must not fall through to buildPrintHTML when Profiles has no debtor name — that invented a court print after the server refused`,
    );
  }
  const markChunk = (routes.split('app.post("/api/v1/form-425c/:id/mark-filed"')[1] ?? "").split('app.post("/api/v1/form-425c/:id/amend"')[0];
  if (
    !markChunk.includes('SELECT case_number, status') ||
    !markChunk.includes('existing.status === "filed"') ||
    !markChunk.includes("form_425c_filed_immutable") ||
    !markChunk.includes("409")
  ) {
    problems.push(
      "apps/backend/src/compliance/form-425c.routes.ts: Mark Filed on a filed MOR must 409 — UPDATE 0 rows was a silent 404 report_not_found_or_invalid_state",
    );
  }
  if (
    !markChunk.includes("form_425c_generate_required") ||
    !markChunk.includes("filed_pdf_uuid IS NOT NULL") ||
    !src.includes("Generate the filing PDF before marking filed")
  ) {
    problems.push(
      "Mark Filed without a Generate snapshot must 422 + toast — draft→filed with null filed_pdf_uuid was a silent court filing",
    );
  }
  const exhibitsViewer = fs.readFileSync(path.join(ROOT, "apps/frontend/src/pages/reports/form-425c/ExhibitsViewer.tsx"), "utf8");
  if (!exhibitsViewer.includes("printLetterHtml") || !exhibitsViewer.includes("buildExhibitsPrintBodyHtml")) {
    problems.push("apps/frontend/src/pages/reports/form-425c/ExhibitsViewer.tsx: A–F builder must print the built package — JSON-only was a silent incomplete court hop");
  }
  if (!exhibitsViewer.includes("Build all exhibits first") || exhibitsViewer.includes("disabled={!built}")) {
    problems.push("apps/frontend/src/pages/reports/form-425c/ExhibitsViewer.tsx: Print before Build must toast, not a dead disabled button");
  }
  if (!exhibitsViewer.includes("Period end must be on or after period start")) {
    problems.push("apps/frontend/src/pages/reports/form-425c/ExhibitsViewer.tsx: inverted A–F period must toast, not POST a silent empty court package");
  }
  if (exhibitsViewer.includes('?? "Company"') || exhibitsViewer.includes("?? 'Company'")) {
    problems.push("apps/frontend/src/pages/reports/form-425c/ExhibitsViewer.tsx: Print must not invent debtor name Company on a court exhibit");
  }
  if (!exhibitsViewer.includes("will not invent a court debtor")) {
    problems.push("apps/frontend/src/pages/reports/form-425c/ExhibitsViewer.tsx: Print with no legal_name must toast, not invent Company");
  }
  if (exhibitsViewer.includes("toISOString().slice(0, 10)") && exhibitsViewer.includes("function defaultPeriod")) {
    problems.push("apps/frontend/src/pages/reports/form-425c/ExhibitsViewer.tsx: default A–F period must use local Y-M-D — toISOString shifted the court month");
  }
  if (!exhibitsViewer.includes("function ymdLocal")) {
    problems.push("apps/frontend/src/pages/reports/form-425c/ExhibitsViewer.tsx: default A–F period must format local calendar dates, not UTC ISO");
  }
  const exhibitsRoutes = fs.readFileSync(path.join(ROOT, "apps/backend/src/reports/form-425c/exhibits/routes.ts"), "utf8");
  if (!exhibitsRoutes.includes("period_end_before_start") || !exhibitsRoutes.includes("period_end < parsed.data.period_start")) {
    problems.push("apps/backend/src/reports/form-425c/exhibits/routes.ts: inverted period must 422 — 200 empty A–F was a silent court package");
  }
  const exhibitsPrint = fs.readFileSync(path.join(ROOT, "apps/frontend/src/pages/reports/form-425c/exhibitsPrintHtml.ts"), "utf8");
  if (
    !exhibitsPrint.includes("export function buildExhibitsPrintBodyHtml") ||
    !exhibitsPrint.includes("Exhibit A") ||
    !exhibitsPrint.includes("Exhibit F") ||
    !exhibitsPrint.includes("total_cents")
  ) {
    problems.push("apps/frontend/src/pages/reports/form-425c/exhibitsPrintHtml.ts: print body must include A–F totals, not empty chrome");
  }
  if (!exhibitsPrint.includes("form_425c_exhibits_debtor_required")) {
    problems.push("apps/frontend/src/pages/reports/form-425c/exhibitsPrintHtml.ts: empty debtor name must throw — not print a blank or invented Company");
  }
  return problems;
}

const good = `
  if (detailQuery.isFetching || selectedReport?.id) return;
  function answersFromReport
  answers: {}
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
  getForm425CFilingHtml
  historyPrintMutation
  const printHtml = String(res.print_html ?? "").trim()
  w.document.write(printHtml)
  Wait for the filing profile to load
  Active debtor key is not this entity's filing profile
  the server returned empty HTML
  String(res.print_html ?? "").trim()
  Generate returned empty filing HTML
  Profiles has no debtor name
  questionnaire is incomplete
  Print opened without a debtor filename
  tab === "merge"
          historyPrintMutation.mutate(form.reportId);
          status unchanged
  tab === "history"
  Could not load Form 425C profile
  Select an operating company before saving profile defaults
  Select an operating company before creating a report
  Could not load Form 425C reports
  Could not load Form 425C report detail
  Generate the filing PDF before marking filed
  will not invent a court caption
  will not create a court MOR without a debtor name
  optionalFormNumber
`;
const bad = `
  if (!detailQuery.data?.report) {
    setForm(emptyForm());
    return;
  }
  onOpen={(id) => { setTab("form"); }}
  setForm((prev) => ({ ...prev, [key]: e.target.checked }))
  tab === "merge"
          generateMutation.mutate();
  tab === "history"
`;

if (process.argv.includes("--selftest")) {
  const goodProblems = collectProblems(good);
  if (goodProblems.length) {
    console.error(`${LABEL} --selftest FAIL good\n${goodProblems.map((p) => `  - ${p}`).join("\n")}`);
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
