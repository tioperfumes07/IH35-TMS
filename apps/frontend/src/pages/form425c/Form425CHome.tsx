import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createForm425CReport,
  generateForm425CPdf,
  getForm425CFilingHtml,
  getForm425CReport,
  importForm425CBanking,
  listForm425CProfiles,
  listForm425CReports,
  markForm425CFiled,
  patchForm425CReport,
  upsertForm425CProfile,
  amendForm425CReport,
  attachForm425CLineFile,
  addForm425CExhibitA,
  addForm425CExhibitB,
  type Form425CReport,
} from "../../api/form425c";
import { confirmUpload, requestUploadUrlFromFile, uploadFileToR2 } from "../../api/docs";
import { useToast } from "../../components/Toast";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { PageHeader } from "../../components/layout/PageHeader";
import { NavyPageSubNav } from "../../components/layout/NavyPageSubNav";
import { RelatedModuleLinks } from "../../components/shared/RelatedModuleLinks";
import { buildPrintHTML, suggestedFilename } from "./lib/buildPrintHTML";
import { DEFAULT_PROFILES } from "./lib/constants";
import { courtDistrictCaption } from "./lib/courtDistrictCaption";
import { optionalFormInt, optionalFormNumber } from "./lib/optionalFormNumber";
import { casePetitionDateFromReports, resolveCreatePetitionDate } from "./lib/petitionDate";
import type { CompanyKey, CompanyProfiles, CurrentFormState, HistoryReportRow } from "./types";
import { CurrentPeriodTab } from "./tabs/CurrentPeriodTab";
import { HistoryTab } from "./tabs/HistoryTab";
import { MergeExportTab } from "./tabs/MergeExportTab";
import { ProfilesTab } from "./tabs/ProfilesTab";
import { QBImportTab } from "./tabs/QBImportTab";
import { userFacingApiError } from "../../lib/api-error-message";

type TabId = "profile" | "qb" | "form" | "merge" | "history";
const FORM425C_TAB_IDS = new Set<string>(["profile", "qb", "form", "merge", "history"]);

export function parseForm425CTab(raw: string | null): TabId {
  if (raw && FORM425C_TAB_IDS.has(raw)) return raw as TabId;
  return "profile";
}

const TABS: Array<{ id: TabId; label: string }> = [
  { id: "profile", label: "Profiles & Defaults" },
  { id: "qb", label: "Deposit Import" },
  { id: "form", label: "Form 425C" },
  { id: "merge", label: "Merge & Export" },
  { id: "history", label: "History" },
];

function emptyForm(): CurrentFormState {
  return {
    reportId: null,
    status: "missing",
    answers: {},
    openingBalance: "",
    totalReceipts: "",
    totalDisbursements: "",
    totalPayables: "",
    totalReceivables: "",
    numEmployeesAtFiling: "",
    numEmployeesNow: "",
    proFeesThisMonth: "",
    proFeesSinceFiling: "",
    otherProFeesThisMonth: "",
    otherProFeesSinceFiling: "",
    projReceiptsLast: "",
    projDisbLast: "",
    projReceiptsNext: "",
    projDisbNext: "",
    projectionOverrideReason: "",
    hasCarryForward: false,
    att38: false,
    att39: false,
    att40: false,
    att41: false,
    att42: false,
    notes: "",
    amendedFromUuid: null,
    filedAt: null,
  };
}

function monthKey(year: number, month: number) {
  return `${year}-${String(month + 1).padStart(2, "0")}`;
}

function answersFromReport(report: Record<string, unknown>): Record<number, "yes" | "no" | "na"> {
  const part1 = (report.part1_answers ?? {}) as Record<string, string>;
  const part2 = (report.part2_answers ?? {}) as Record<string, string>;
  const merged: Record<number, "yes" | "no" | "na"> = {};
  for (const [key, value] of Object.entries({ ...part1, ...part2 })) {
    const n = Number(key);
    const ans = String(value ?? "").trim().toLowerCase();
    if (n >= 1 && n <= 18 && (ans === "yes" || ans === "no" || ans === "na")) {
      merged[n] = ans;
    }
  }
  return merged;
}

function toFormState(report: Record<string, unknown>): CurrentFormState {
  return {
    reportId: String(report.id),
    status: (report.status as CurrentFormState["status"]) ?? "draft",
    answers: answersFromReport(report),
    openingBalance: String(report.line_19_opening_cash ?? ""),
    totalReceipts: String(report.line_20_receipts ?? ""),
    totalDisbursements: String(report.line_21_disbursements ?? ""),
    totalPayables: String(report.line_24_payables ?? ""),
    totalReceivables: String(report.line_25_receivables ?? ""),
    numEmployeesAtFiling: String(report.line_26_employees_at_filing ?? ""),
    numEmployeesNow: String(report.line_27_employees_now ?? ""),
    proFeesThisMonth: String(report.line_28_bk_fees_this_month ?? ""),
    proFeesSinceFiling: String(report.line_29_bk_fees_since_filing ?? ""),
    otherProFeesThisMonth: String(report.line_30_other_fees_this_month ?? ""),
    otherProFeesSinceFiling: String(report.line_31_other_fees_since_filing ?? ""),
    projReceiptsLast: String(report.line_32_proj_receipts ?? ""),
    projDisbLast: String(report.line_33_proj_disbursements ?? ""),
    projReceiptsNext: String(report.line_35_next_proj_receipts ?? ""),
    projDisbNext: String(report.line_36_next_proj_disbursements ?? ""),
    projectionOverrideReason: String(report.projection_override_reason ?? ""),
    hasCarryForward: Boolean(report.carry_forward_source_report_id),
    att38: Array.isArray(report.attachment_38_bank_statements_uuids) && report.attachment_38_bank_statements_uuids.length > 0,
    att39: Array.isArray(report.attachment_39_recon_reports_uuids) && report.attachment_39_recon_reports_uuids.length > 0,
    att40: Array.isArray(report.attachment_40_financial_reports_uuids) && report.attachment_40_financial_reports_uuids.length > 0,
    att41: Array.isArray(report.attachment_41_budget_uuids) && report.attachment_41_budget_uuids.length > 0,
    att42: Array.isArray(report.attachment_42_job_costing_uuids) && report.attachment_42_job_costing_uuids.length > 0,
    notes: "",
    amendedFromUuid: String(report.amended_from_uuid ?? ""),
    filedAt: report.filed_at ? String(report.filed_at) : null,
  };
}

export function Form425CHome() {
  const queryClient = useQueryClient();
  const { selectedCompanyId } = useCompanyContext();
  const { pushToast } = useToast();
  const companyId = selectedCompanyId ?? "";

  const [searchParams, setSearchParams] = useSearchParams();
  const tab = parseForm425CTab(searchParams.get("tab"));
  const setTab = (next: TabId) => {
    const params = new URLSearchParams(searchParams);
    if (next === "profile") params.delete("tab");
    else params.set("tab", next);
    setSearchParams(params, { replace: true });
  };
  const [activeCompany, setActiveCompany] = useState<CompanyKey>("trucking");
  const [month, setMonth] = useState(new Date().getMonth());
  const [year, setYear] = useState(new Date().getFullYear());
  const [openedReportId, setOpenedReportId] = useState<string | null>(null);
  const setMonthFromPicker = (next: number) => {
    setOpenedReportId(null);
    setMonth(next);
  };
  const setYearFromPicker = (next: number) => {
    setOpenedReportId(null);
    setYear(next);
  };
  const [profiles, setProfiles] = useState<CompanyProfiles>(DEFAULT_PROFILES);
  const [form, setForm] = useState<CurrentFormState>(emptyForm());
  const [dirty, setDirty] = useState(false);
  const [autoSavedAt, setAutoSavedAt] = useState<string | null>(null);
  const profileErrorToast = useRef(false);

  const profilesQuery = useQuery({
    queryKey: ["form-425c", "profiles", companyId],
    enabled: Boolean(companyId),
    queryFn: () => listForm425CProfiles(companyId),
  });

  useEffect(() => {
    if (!profilesQuery.isError) {
      profileErrorToast.current = false;
      return;
    }
    if (profileErrorToast.current) return;
    profileErrorToast.current = true;
    pushToast(userFacingApiError(profilesQuery.error, "Could not load Form 425C profile"), "error");
  }, [profilesQuery.isError, profilesQuery.error, pushToast]);

  const availableCompanies = useMemo<CompanyKey[]>(() => {
    const keys = profilesQuery.data?.profiles?.map((row) => row.company_key) ?? [];
    return keys.length > 0 ? [...new Set(keys)] : [activeCompany];
  }, [activeCompany, profilesQuery.data?.profiles]);

  const reportsQuery = useQuery({
    queryKey: ["form-425c", "reports", companyId],
    enabled: Boolean(companyId),
    queryFn: () => listForm425CReports(companyId),
  });
  const reportsErrorToast = useRef(false);
  useEffect(() => {
    if (!reportsQuery.isError) {
      reportsErrorToast.current = false;
      return;
    }
    if (reportsErrorToast.current) return;
    reportsErrorToast.current = true;
    pushToast(userFacingApiError(reportsQuery.error, "Could not load Form 425C reports"), "error");
  }, [reportsQuery.isError, reportsQuery.error, pushToast]);

  const selectedReport = useMemo(() => {
    const reports = reportsQuery.data?.reports ?? [];
    if (openedReportId) {
      const byId = reports.find((r) => r.id === openedReportId);
      if (byId) return byId as Form425CReport;
    }
    const key = `${monthKey(year, month)}-01`;
    const matches = reports.filter((r) => String(r.reporting_month).slice(0, 10) === key);
    return (matches.find((r) => r.status !== "filed") ?? matches[0]) as Form425CReport | undefined;
  }, [reportsQuery.data?.reports, month, year, openedReportId]);

  const detailQuery = useQuery({
    queryKey: ["form-425c", "detail", companyId, selectedReport?.id ?? ""],
    enabled: Boolean(companyId && selectedReport?.id),
    queryFn: () => getForm425CReport(selectedReport!.id, companyId),
  });
  const detailErrorToast = useRef(false);
  useEffect(() => {
    if (!detailQuery.isError) {
      detailErrorToast.current = false;
      return;
    }
    if (detailErrorToast.current) return;
    detailErrorToast.current = true;
    pushToast(userFacingApiError(detailQuery.error, "Could not load Form 425C report detail"), "error");
  }, [detailQuery.isError, detailQuery.error, pushToast]);

  const exhibitEntries = useMemo(() => {
    const loadedId = String((detailQuery.data?.report as { id?: string } | undefined)?.id ?? "");
    if (!selectedReport?.id || loadedId !== selectedReport.id) {
      return { a: [] as Array<Record<string, unknown>>, b: [] as Array<Record<string, unknown>> };
    }
    return {
      a: detailQuery.data?.exhibit_a ?? [],
      b: detailQuery.data?.exhibit_b ?? [],
    };
  }, [detailQuery.data, selectedReport?.id]);

  useEffect(() => {
    if (!profilesQuery.data?.profiles) return;
    const merged: CompanyProfiles = {
      trucking: { ...DEFAULT_PROFILES.trucking },
      transportation: { ...DEFAULT_PROFILES.transportation },
    };
    for (const row of profilesQuery.data.profiles) {
        merged[row.company_key] = {
          name: row.company_name,
          caseNumber: row.case_number,
          petitionDate: String(row.petition_date ?? "").slice(0, 10),
          district: row.district,
        division: row.division,
        judge: row.judge,
        ein: row.ein,
        address: row.filing_address,
        lineOfBusiness: row.line_of_business,
        naiscCode: row.naisc_code,
        bankAccounts: row.bank_accounts,
        defaultAnswers: Object.fromEntries(Object.entries(row.default_questionnaire_answers ?? {}).map(([k, v]) => [Number(k), v])) as CompanyProfiles[CompanyKey]["defaultAnswers"],
      };
    }
    setProfiles(merged);
    const filingCompany = profilesQuery.data.profiles[0]?.company_key;
    if (filingCompany) setActiveCompany(filingCompany);
  }, [profilesQuery.data?.profiles]);

  // Hydrate petition date from the earliest existing report (case SoR) — never invent a literal.
  useEffect(() => {
    const caseDate = casePetitionDateFromReports(reportsQuery.data?.reports ?? []);
    if (!caseDate) return;
    setProfiles((prev) => ({
      trucking: { ...prev.trucking, petitionDate: prev.trucking.petitionDate || caseDate },
      transportation: { ...prev.transportation, petitionDate: prev.transportation.petitionDate || caseDate },
    }));
  }, [reportsQuery.data?.reports]);

  useEffect(() => {
    const loadedId = String((detailQuery.data?.report as { id?: string } | undefined)?.id ?? "");
    // Period change (e.g. August → January) must not keep the prior MOR cash on screen
    // or Import/Generate/Mark Filed will mutate the wrong month while the picker lies.
    if (selectedReport?.id && loadedId === selectedReport.id) {
      setForm(toFormState(detailQuery.data!.report as Record<string, unknown>));
      setDirty(false);
      return;
    }
    // Picker changed (August → January) while React Query still holds the prior month's
    // detail: keep showing that cash = silent wrong period. Clear until ids match.
    if (selectedReport?.id && loadedId !== selectedReport.id) {
      setForm((prev) => {
        if (prev.reportId === selectedReport.id) return prev;
        if (!prev.reportId) return prev;
        return { ...emptyForm(), projectionOverrideReason: prev.projectionOverrideReason };
      });
      return;
    }
    // Save/list invalidate briefly drops detail + selectedReport. Wiping here disabled
    // Save Draft / Import from Banking / Generate / Mark Filed with no toast (leftover silent).
    if (detailQuery.isFetching || selectedReport?.id) return;
    setForm((prev) => ({ ...emptyForm(), projectionOverrideReason: prev.projectionOverrideReason }));
  }, [detailQuery.data?.report, detailQuery.isFetching, selectedReport?.id, profiles, activeCompany]);

  const saveProfileMutation = useMutation({
    mutationFn: async () =>
      upsertForm425CProfile(companyId, {
        company_key: activeCompany,
        company_name: profiles[activeCompany].name,
        case_number: profiles[activeCompany].caseNumber,
        district: profiles[activeCompany].district,
        division: profiles[activeCompany].division,
        judge: profiles[activeCompany].judge,
        ein: profiles[activeCompany].ein,
        filing_address: profiles[activeCompany].address,
        line_of_business: profiles[activeCompany].lineOfBusiness,
        naisc_code: profiles[activeCompany].naiscCode,
        default_questionnaire_answers: Object.fromEntries(Object.entries(profiles[activeCompany].defaultAnswers).map(([k, v]) => [String(k), v])),
        bank_accounts: profiles[activeCompany].bankAccounts,
        petition_date: /^\d{4}-\d{2}-\d{2}$/.test(profiles[activeCompany].petitionDate?.trim() ?? "")
          ? profiles[activeCompany].petitionDate.trim()
          : null,
      }),
    onSuccess: async () => {
      pushToast("Profile defaults saved", "success");
      await queryClient.invalidateQueries({ queryKey: ["form-425c", "profiles", companyId] });
    },
    onError: (error) => pushToast(userFacingApiError(error, "Failed to save profile"), "error"),
  });

  const createMutation = useMutation({
    mutationFn: () => {
      if (!String(profiles[activeCompany].name ?? "").trim()) {
        throw new Error("Set the debtor name in Profiles before creating a report — will not create a court MOR without a debtor name");
      }
      const petitionDate = resolveCreatePetitionDate(profiles[activeCompany].petitionDate);
      const courtDistrict = courtDistrictCaption(
        profiles[activeCompany].division,
        profiles[activeCompany].district,
      );
      if (!courtDistrict) {
        throw new Error("Set court division and district in Profiles before creating a report — will not invent a court caption");
      }
      return createForm425CReport(companyId, {
        reporting_month: `${monthKey(year, month)}-01`,
        case_number: profiles[activeCompany].caseNumber,
        court_district: courtDistrict,
        petition_date: petitionDate,
        subchapter: "V",
      });
    },
    onSuccess: async (created) => {
      setOpenedReportId(created.id);
      await queryClient.invalidateQueries({ queryKey: ["form-425c", "reports", companyId] });
      pushToast("Report created", "success");
    },
    onError: (error) => pushToast(userFacingApiError(error, "Create report failed"), "error"),
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!form.reportId) {
        throw new Error("Create / Load Draft before saving");
      }
      if (form.status === "filed") {
        throw new Error("This MOR is filed — use Amend on History");
      }
      if (form.hasCarryForward && String(form.projectionOverrideReason ?? "").trim().length < 30) {
        throw new Error("Carry-forward override needs a reason of at least 30 characters");
      }
      await patchForm425CReport(form.reportId, companyId, {
        operating_company_id: companyId,
        part1_answers: Object.fromEntries(Object.entries(form.answers).filter(([k]) => Number(k) <= 9)),
        part2_answers: Object.fromEntries(Object.entries(form.answers).filter(([k]) => Number(k) >= 10)),
        line_24_payables: optionalFormNumber(form.totalPayables),
        line_25_receivables: optionalFormNumber(form.totalReceivables),
        line_26_employees_at_filing: optionalFormInt(form.numEmployeesAtFiling),
        line_27_employees_now: optionalFormInt(form.numEmployeesNow),
        line_28_bk_fees_this_month: optionalFormNumber(form.proFeesThisMonth),
        line_29_bk_fees_since_filing: optionalFormNumber(form.proFeesSinceFiling),
        line_30_other_fees_this_month: optionalFormNumber(form.otherProFeesThisMonth),
        line_31_other_fees_since_filing: optionalFormNumber(form.otherProFeesSinceFiling),
        line_32_proj_receipts: optionalFormNumber(form.projReceiptsLast),
        line_33_proj_disbursements: optionalFormNumber(form.projDisbLast),
        line_35_next_proj_receipts: optionalFormNumber(form.projReceiptsNext),
        line_36_next_proj_disbursements: optionalFormNumber(form.projDisbNext),
        projection_override_reason: form.projectionOverrideReason,
      });
    },
    onSuccess: async () => {
      setAutoSavedAt(new Date().toISOString());
      setDirty(false);
      await queryClient.invalidateQueries({ queryKey: ["form-425c", "detail", companyId, form.reportId ?? ""] });
      await queryClient.invalidateQueries({ queryKey: ["form-425c", "reports", companyId] });
    },
    onError: (error) => pushToast(userFacingApiError(error, "Save failed"), "error"),
  });

  const importMutation = useMutation({
    mutationFn: () => importForm425CBanking(form.reportId!, companyId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["form-425c", "detail", companyId, form.reportId ?? ""] });
      pushToast("Lines 19-23 imported from Banking", "success");
    },
    onError: (error) => {
      const msg = String((error as { message?: string })?.message ?? error);
      if (msg.includes("mor_cash_zero_with_activity") || msg.includes("will not write $0 onto a court filing")) {
        pushToast(
          "Banking import blocked: in-scope transactions with $0 receipts and $0 disbursements — not writing $0 onto the filing",
          "error",
        );
        return;
      }
      pushToast(userFacingApiError(error, "Banking import failed"), "error");
    },
  });

  const generateMutation = useMutation({
    mutationFn: () => generateForm425CPdf(form.reportId!, companyId),
    onSuccess: async (res) => {
      let printHtml = String(res.print_html ?? "").trim();
      if (!printHtml) {
        const debtor = String(profiles[activeCompany].name ?? "").trim();
        if (!debtor) {
          pushToast("Generate returned empty filing HTML and Profiles has no debtor name — not inventing a court print", "error");
          return;
        }
        const unanswered = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18].some((n) => {
          const ans = String(form.answers[n] ?? "").trim().toLowerCase();
          return ans !== "yes" && ans !== "no" && ans !== "na";
        });
        if (unanswered) {
          pushToast("Generate returned empty filing HTML and questionnaire is incomplete — not inventing Yes/No on a court print", "error");
          return;
        }
        if (!courtDistrictCaption(profiles[activeCompany].division, profiles[activeCompany].district)) {
          pushToast("Generate returned empty filing HTML and Profiles has no court — will not invent a court caption", "error");
          return;
        }
        printHtml = buildPrintHTML(form, profiles[activeCompany], month, year, exhibitEntries.a, exhibitEntries.b);
      }
      if (!printHtml.trim()) {
        pushToast("Generate returned empty filing HTML — not opening a blank print", "error");
        return;
      }
      const w = window.open("", "_blank");
      if (!w) {
        pushToast("Popup blocked — allow popups to print the filing PDF", "error");
        return;
      }
      w.document.write(printHtml);
      w.document.close();
      setTimeout(() => w.print(), 600);
      const fileName =
        String(res.suggested_filename ?? "").trim() || suggestedFilename(profiles[activeCompany].name, month, year);
      if (!fileName) {
        pushToast("Print opened without a debtor filename — set Profiles; will not invent a court PDF name", "error");
      } else {
        pushToast(`Ready to print: ${fileName}`, "success");
      }
      await queryClient.invalidateQueries({ queryKey: ["form-425c"] });
    },
    onError: (error) => pushToast(userFacingApiError(error, "PDF generation failed"), "error"),
  });

  const markFiledMutation = useMutation({
    mutationFn: () => markForm425CFiled(form.reportId!, companyId),
    onSuccess: async () => {
      pushToast("Report marked filed", "success");
      await queryClient.invalidateQueries({ queryKey: ["form-425c"] });
    },
    onError: (error) => pushToast(userFacingApiError(error, "Mark filed failed"), "error"),
  });

  const amendMutation = useMutation({
    mutationFn: (id: string) => amendForm425CReport(id, companyId),
    onSuccess: async (created) => {
      pushToast("Amendment draft created", "success");
      setOpenedReportId(created.id);
      const ymd = String(created.reporting_month ?? "").slice(0, 10);
      const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
      if (match) {
        setYear(Number(match[1]));
        setMonth(Number(match[2]) - 1);
      }
      setTab("form");
      await queryClient.invalidateQueries({ queryKey: ["form-425c"] });
    },
    onError: (error) => pushToast(userFacingApiError(error, "Amend failed"), "error"),
  });

  const historyPrintMutation = useMutation({
    mutationFn: (id: string) => getForm425CFilingHtml(id, companyId),
    onSuccess: (res) => {
      const printHtml = String(res.print_html ?? "").trim();
      if (!printHtml) {
        pushToast("Could not print that filing — the server returned empty HTML", "error");
        return;
      }
      const w = window.open("", "_blank");
      if (!w) {
        pushToast("Popup blocked — allow popups to print the filing", "error");
        return;
      }
      w.document.write(printHtml);
      w.document.close();
      setTimeout(() => w.print(), 600);
      const fileName = String(res.suggested_filename ?? "").trim();
      if (!fileName) {
        pushToast("Print opened without a debtor filename — will not invent a court PDF name", "error");
      } else {
        pushToast(`Ready to print: ${fileName}`, "success");
      }
    },
    onError: (error) => pushToast(userFacingApiError(error, "Could not print that filing"), "error"),
  });

  const autosaveBlockedToast = useRef(false);

  // Part 8 checkboxes (att38-42) are display-only — a real attachment requires an uploaded file.
  // Save Draft never sent these booleans to the server (no such columns); the actual truth is
  // attachment_3X_..._uuids arrays, written only by this upload → confirm → link chain.
  const attachMutation = useMutation({
    mutationFn: async ({ line, file }: { line: number; file: File }) => {
      const reportId = form.reportId;
      if (!reportId) throw new Error("Create / Load Draft before attaching a file");
      const { file_id, presigned_url } = await requestUploadUrlFromFile(file, { operating_company_id: companyId });
      await uploadFileToR2(presigned_url, file, file.type || "application/octet-stream");
      await confirmUpload(file_id);
      await attachForm425CLineFile(reportId, companyId, line, file_id);
    },
    onSuccess: async () => {
      pushToast("File attached", "success");
      await queryClient.invalidateQueries({ queryKey: ["form-425c", "detail", companyId, form.reportId ?? ""] });
    },
    onError: (error) => pushToast(userFacingApiError(error, "Attachment upload failed"), "error"),
  });

  const exhibitMutation = useMutation({
    mutationFn: async ({ line, explanation }: { line: number; explanation: string }) => {
      const reportId = form.reportId;
      if (!reportId || reportId !== selectedReport?.id) {
        throw new Error("Create / Load Draft before saving an exhibit entry");
      }
      if (form.status === "filed") {
        throw new Error("This MOR is filed — use Amend on History");
      }
      const text = explanation.trim();
      if (text.length < 3) {
        throw new Error("Exhibit explanation needs at least 3 characters");
      }
      if (line >= 1 && line <= 9) {
        return addForm425CExhibitA(reportId, companyId, line, text);
      }
      if (line >= 10 && line <= 18) {
        return addForm425CExhibitB(reportId, companyId, line, text);
      }
      throw new Error("Exhibit line must be 1–9 (A) or 10–18 (B)");
    },
    onSuccess: async () => {
      pushToast("Exhibit entry saved", "success");
      await queryClient.invalidateQueries({ queryKey: ["form-425c", "detail", companyId, form.reportId ?? ""] });
    },
    onError: (error) => pushToast(userFacingApiError(error, "Exhibit save failed"), "error"),
  });

  useEffect(() => {
    if (!dirty) return;
    if (!form.reportId || form.reportId !== selectedReport?.id) {
      if (!autosaveBlockedToast.current) {
        autosaveBlockedToast.current = true;
        pushToast("Create / Load Draft before autosave", "error");
      }
      return;
    }
    if (form.status === "filed") {
      if (!autosaveBlockedToast.current) {
        autosaveBlockedToast.current = true;
        pushToast("This MOR is filed — use Amend on History", "error");
      }
      return;
    }
    autosaveBlockedToast.current = false;
    const timer = setTimeout(() => saveMutation.mutate(), 10_000);
    return () => clearTimeout(timer);
  }, [dirty, form.reportId, form, selectedReport?.id, saveMutation, pushToast]);

  // History is the canonical report list (draft + ready_to_file + filed + amended).
  // Status narrowing belongs on HistoryTab's filter, never a silent filed-only hide.
  const historyReports = (reportsQuery.data?.reports ?? []) as HistoryReportRow[];

  return (
    <div className="min-h-screen bg-slate-100" data-form425c-page="true">
      <div className="px-4 pt-4">
        <PageHeader title="Form 425C" backHref="/" breadcrumb={["Home", "Form 425C"]} />
      </div>
      <div className="flex items-center justify-between gap-2 bg-[#1f2a44] px-5 py-3 text-white">
        <div>
          <div className="text-lg font-extrabold">{profiles[activeCompany].name || "Form 425C"}</div>
          <div className="text-xs opacity-75">Official Form 425C — Monthly Operating Report System</div>
        </div>
        <Link to="/425c/exhibits" className="shrink-0 text-xs font-semibold text-white hover:underline">
          Exhibits A–F →
        </Link>
      </div>

      <NavyPageSubNav
        items={TABS.map((t) => ({ label: t.label, to: `#${t.id}` }))}
        activeId={tab}
        onTabChange={(next) => setTab(next as TabId)}
        itemIds={TABS.map((t) => t.id)}
      />

      <RelatedModuleLinks
        className="mx-4 mt-3"
        testId="form-425c-related-module-links"
        links={[
          { label: "Deposit Import", to: "/425c?tab=qb" },
          { label: "Merge & Export", to: "/425c?tab=merge" },
          { label: "History", to: "/425c?tab=history" },
        ]}
      />

      {tab === "profile" ? (
        <ProfilesTab
          profiles={profiles}
          activeCompany={activeCompany}
          availableCompanies={availableCompanies}
          setActiveCompany={setActiveCompany}
          onChange={(company, updater) => {
            setProfiles((prev) => ({ ...prev, [company]: updater(prev[company]) }));
          }}
          onSave={() => {
            if (!companyId) {
              pushToast("Select an operating company before saving profile defaults", "error");
              return;
            }
            if (!profilesQuery.isSuccess) {
              pushToast("Wait for the filing profile to load — Save Defaults will not send a trucking key onto this entity", "error");
              return;
            }
            const loadedKeys = [...new Set((profilesQuery.data?.profiles ?? []).map((row) => row.company_key))];
            if (!loadedKeys.includes(activeCompany)) {
              pushToast("Active debtor key is not this entity's filing profile — not saving the wrong debtor", "error");
              return;
            }
            saveProfileMutation.mutate();
          }}
          saving={saveProfileMutation.isPending}
          canSave={Boolean(companyId && profilesQuery.isSuccess && availableCompanies.includes(activeCompany))}
        />
      ) : null}

      {tab === "qb" ? (
        <QBImportTab
          activeCompany={activeCompany}
          setActiveCompany={setActiveCompany}
          month={month}
          year={year}
          setMonth={setMonthFromPicker}
          setYear={setYearFromPicker}
          profiles={profiles}
          availableCompanies={availableCompanies}
        />
      ) : null}

      {tab === "form" ? (
        <CurrentPeriodTab
          activeCompany={activeCompany}
          setActiveCompany={setActiveCompany}
          month={month}
          year={year}
          setMonth={setMonthFromPicker}
          setYear={setYearFromPicker}
          profiles={profiles}
          availableCompanies={availableCompanies}
          form={form}
          setForm={(updater) => {
            setForm((prev) => updater(prev));
            setDirty(true);
          }}
          onCreateOrLoad={() => {
            if (!companyId) {
              pushToast("Select an operating company before creating a report", "error");
              return;
            }
            if (createMutation.isPending) {
              pushToast("Create already in progress", "error");
              return;
            }
            if (selectedReport?.id) {
              if (selectedReport.status === "filed") {
                pushToast("This MOR is filed — use Amend on History", "error");
                return;
              }
              queryClient.invalidateQueries({ queryKey: ["form-425c", "detail", companyId, selectedReport.id] });
              pushToast("Loaded existing report for selected period", "success");
              return;
            }
            if (!profiles[activeCompany].caseNumber?.trim()) {
              pushToast("Set the case number in Profiles & Defaults before creating a report", "error");
              return;
            }
            if (!/^\d{4}-\d{2}-\d{2}$/.test(profiles[activeCompany].petitionDate?.trim() ?? "")) {
              pushToast("Set Petition Date in Profiles & Defaults before creating a report (court case filing date — never hardcode)", "error");
              setTab("profile");
              return;
            }
            if (!courtDistrictCaption(profiles[activeCompany].division, profiles[activeCompany].district)) {
              pushToast("Set court division and district in Profiles before creating a report — will not invent a court caption", "error");
              setTab("profile");
              return;
            }
            if (!String(profiles[activeCompany].name ?? "").trim()) {
              pushToast("Set the debtor name in Profiles before creating a report — will not create a court MOR without a debtor name", "error");
              setTab("profile");
              return;
            }
            createMutation.mutate();
          }}
          onImportBanking={() => {
            if (!form.reportId || form.reportId !== selectedReport?.id) {
              pushToast("Create / Load Draft before importing from Banking", "error");
              return;
            }
            if (form.status === "filed") {
              pushToast("This MOR is filed — use Amend on History", "error");
              return;
            }
            importMutation.mutate();
          }}
          onSave={() => {
            if (!form.reportId || form.reportId !== selectedReport?.id) {
              pushToast("Create / Load Draft before saving", "error");
              return;
            }
            if (form.status === "filed") {
              pushToast("This MOR is filed — use Amend on History", "error");
              return;
            }
            saveMutation.mutate(undefined, {
              onSuccess: () => pushToast("Draft saved", "success"),
            });
          }}
          onGeneratePdf={() => {
            if (!form.reportId || form.reportId !== selectedReport?.id) {
              pushToast("Create / Load Draft before generating the filing PDF", "error");
              return;
            }
            if (form.status === "filed") {
              pushToast("This MOR is filed — use Amend on History", "error");
              return;
            }
            if (dirty) {
              saveMutation.mutate(undefined, {
                onSuccess: () => {
                  pushToast("Draft saved — generating filing PDF", "success");
                  generateMutation.mutate();
                },
              });
              return;
            }
            generateMutation.mutate();
          }}
          onMarkFiled={() => {
            if (!form.reportId || form.reportId !== selectedReport?.id) {
              pushToast("Create / Load Draft before marking filed", "error");
              return;
            }
            if (form.status === "filed") {
              pushToast("This MOR is filed — use Amend on History", "error");
              return;
            }
            if (form.status !== "ready_to_file") {
              pushToast("Generate the filing PDF before marking filed — a draft has no court snapshot", "error");
              return;
            }
            if (dirty) {
              saveMutation.mutate(undefined, {
                onSuccess: () => {
                  pushToast("Draft saved — marking filed", "success");
                  markFiledMutation.mutate();
                },
              });
              return;
            }
            markFiledMutation.mutate();
          }}
          onAttachFile={(line, file) => {
            if (!form.reportId || form.reportId !== selectedReport?.id) {
              pushToast("Create / Load Draft before attaching a file", "error");
              return;
            }
            if (form.status === "filed") {
              pushToast("This MOR is filed — use Amend on History", "error");
              return;
            }
            attachMutation.mutate({ line, file });
          }}
          exhibitA={exhibitEntries.a}
          exhibitB={exhibitEntries.b}
          onSaveExhibit={(line, explanation) => {
            if (!form.reportId || form.reportId !== selectedReport?.id) {
              pushToast("Create / Load Draft before saving an exhibit entry", "error");
              return;
            }
            if (form.status === "filed") {
              pushToast("This MOR is filed — use Amend on History", "error");
              return;
            }
            exhibitMutation.mutate({ line, explanation });
          }}
          savingExhibit={exhibitMutation.isPending}
          attaching={attachMutation.isPending}
          loading={importMutation.isPending || saveMutation.isPending}
          autoSaveLabel={dirty ? "Auto-save pending..." : autoSavedAt ? `Auto-saved at ${new Date(autoSavedAt).toLocaleTimeString()}` : "No unsaved changes"}
        />
      ) : null}

      {tab === "merge" ? (
        <MergeExportTab
          company={profiles[activeCompany]}
          month={month}
          year={year}
          canGenerate={Boolean(form.reportId && form.reportId === selectedReport?.id)}
          generating={historyPrintMutation.isPending}
          onGenerate={() => {
            if (!form.reportId || form.reportId !== selectedReport?.id) {
              pushToast("Create / Load Draft before generating the filing package", "error");
              return;
            }
            // Merge print is read-only (same GET as History Print). Form "Generate PDF"
            // is the write path that inserts docs.files and sets ready_to_file.
            if (dirty && form.status !== "filed") {
              saveMutation.mutate(undefined, {
                onSuccess: () => {
                  pushToast("Draft saved — opening print window (status unchanged)", "success");
                  historyPrintMutation.mutate(form.reportId!);
                },
              });
              return;
            }
            historyPrintMutation.mutate(form.reportId);
          }}
        />
      ) : null}

      {tab === "history" ? (
        <HistoryTab
          reports={historyReports}
          loading={reportsQuery.isLoading}
          onOpen={(id) => {
            const row = historyReports.find((r) => r.id === id);
            if (!row?.reporting_month) {
              pushToast("Could not open that report", "error");
              return;
            }
            const ymd = String(row.reporting_month).slice(0, 10);
            const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
            if (!match) {
              pushToast("Could not open that report — reporting month is invalid", "error");
              return;
            }
            setOpenedReportId(id);
            setYear(Number(match[1]));
            setMonth(Number(match[2]) - 1);
            setTab("form");
            pushToast("Opened report in Form 425C", "success");
          }}
          onAmend={(id) => amendMutation.mutate(id)}
          onPrint={(id) => {
            if (!id) {
              pushToast("Could not print that filing", "error");
              return;
            }
            historyPrintMutation.mutate(id);
          }}
        />
      ) : null}
    </div>
  );
}
