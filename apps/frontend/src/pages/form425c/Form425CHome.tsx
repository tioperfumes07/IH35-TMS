import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createForm425CReport,
  generateForm425CPdf,
  getForm425CReport,
  importForm425CBanking,
  listForm425CProfiles,
  listForm425CReports,
  markForm425CFiled,
  patchForm425CReport,
  upsertForm425CProfile,
  amendForm425CReport,
  type Form425CReport,
} from "../../api/form425c";
import { useToast } from "../../components/Toast";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { PageHeader } from "../../components/layout/PageHeader";
import { SecondaryNavTabs } from "../../components/shared/SecondaryNavTabs";
import { RelatedModuleLinks } from "../../components/shared/RelatedModuleLinks";
import { buildPrintHTML, suggestedFilename } from "./lib/buildPrintHTML";
import { DEFAULT_PROFILES } from "./lib/constants";
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
    answers: { ...DEFAULT_PROFILES.trucking.defaultAnswers },
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
  };
}

function monthKey(year: number, month: number) {
  return `${year}-${String(month + 1).padStart(2, "0")}`;
}

function toFormState(report: Record<string, unknown>, defaults: Record<number, "yes" | "no" | "na">): CurrentFormState {
  return {
    reportId: String(report.id),
    status: (report.status as CurrentFormState["status"]) ?? "draft",
    answers: { ...defaults, ...(report.part1_answers as Record<number, "yes" | "no" | "na">), ...(report.part2_answers as Record<number, "yes" | "no" | "na">) },
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
  const [profiles, setProfiles] = useState<CompanyProfiles>(DEFAULT_PROFILES);
  const [form, setForm] = useState<CurrentFormState>(emptyForm());
  const [dirty, setDirty] = useState(false);
  const [autoSavedAt, setAutoSavedAt] = useState<string | null>(null);

  const profilesQuery = useQuery({
    queryKey: ["form-425c", "profiles", companyId],
    enabled: Boolean(companyId),
    queryFn: () => listForm425CProfiles(companyId),
  });

  const availableCompanies = useMemo<CompanyKey[]>(() => {
    const keys = profilesQuery.data?.profiles?.map((row) => row.company_key) ?? [];
    return keys.length > 0 ? [...new Set(keys)] : [activeCompany];
  }, [activeCompany, profilesQuery.data?.profiles]);

  const reportsQuery = useQuery({
    queryKey: ["form-425c", "reports", companyId],
    enabled: Boolean(companyId),
    queryFn: () => listForm425CReports(companyId),
  });

  const selectedReport = useMemo(() => {
    const key = `${monthKey(year, month)}-01`;
    return (reportsQuery.data?.reports ?? []).find((r) => String(r.reporting_month).slice(0, 10) === key) as Form425CReport | undefined;
  }, [reportsQuery.data?.reports, month, year]);

  const detailQuery = useQuery({
    queryKey: ["form-425c", "detail", companyId, selectedReport?.id ?? ""],
    enabled: Boolean(companyId && selectedReport?.id),
    queryFn: () => getForm425CReport(selectedReport!.id, companyId),
  });

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
        defaultAnswers: Object.fromEntries(Object.entries(row.default_questionnaire_answers).map(([k, v]) => [Number(k), v])) as CompanyProfiles[CompanyKey]["defaultAnswers"],
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
    if (detailQuery.data?.report) {
      setForm(toFormState(detailQuery.data.report as Record<string, unknown>, profiles[activeCompany].defaultAnswers));
      setDirty(false);
      return;
    }
    // Save/list invalidate briefly drops detail + selectedReport. Wiping here disabled
    // Save Draft / Import from Banking / Generate / Mark Filed with no toast (leftover silent).
    if (detailQuery.isFetching || selectedReport?.id) return;
    const defaults = profiles[activeCompany].defaultAnswers;
    setForm((prev) => ({ ...emptyForm(), answers: { ...defaults }, projectionOverrideReason: prev.projectionOverrideReason }));
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
      const petitionDate = resolveCreatePetitionDate(profiles[activeCompany].petitionDate);
      return createForm425CReport(companyId, {
        reporting_month: `${monthKey(year, month)}-01`,
        case_number: profiles[activeCompany].caseNumber,
        court_district: `${profiles[activeCompany].division} Division · ${profiles[activeCompany].district} District`,
        petition_date: petitionDate,
        subchapter: "V",
      });
    },
    onSuccess: async () => {
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
      await patchForm425CReport(form.reportId, companyId, {
        operating_company_id: companyId,
        part1_answers: Object.fromEntries(Object.entries(form.answers).filter(([k]) => Number(k) <= 9)),
        part2_answers: Object.fromEntries(Object.entries(form.answers).filter(([k]) => Number(k) >= 10)),
        line_24_payables: Number(form.totalPayables || 0),
        line_25_receivables: Number(form.totalReceivables || 0),
        line_26_employees_at_filing: Number(form.numEmployeesAtFiling || 0),
        line_27_employees_now: Number(form.numEmployeesNow || 0),
        line_28_bk_fees_this_month: Number(form.proFeesThisMonth || 0),
        line_29_bk_fees_since_filing: Number(form.proFeesSinceFiling || 0),
        line_30_other_fees_this_month: Number(form.otherProFeesThisMonth || 0),
        line_31_other_fees_since_filing: Number(form.otherProFeesSinceFiling || 0),
        line_32_proj_receipts: Number(form.projReceiptsLast || 0),
        line_33_proj_disbursements: Number(form.projDisbLast || 0),
        line_35_next_proj_receipts: Number(form.projReceiptsNext || 0),
        line_36_next_proj_disbursements: Number(form.projDisbNext || 0),
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
    onError: (error) => pushToast(userFacingApiError(error, "Banking import failed"), "error"),
  });

  const generateMutation = useMutation({
    mutationFn: () => generateForm425CPdf(form.reportId!, companyId),
    onSuccess: async (res) => {
      const printHtml = res.print_html || buildPrintHTML(form, profiles[activeCompany], month, year);
      const w = window.open("", "_blank");
      if (!w) {
        pushToast("Popup blocked — allow popups to print the filing PDF", "error");
        return;
      }
      w.document.write(printHtml);
      w.document.close();
      setTimeout(() => w.print(), 600);
      pushToast(`Ready to print: ${res.suggested_filename || suggestedFilename(profiles[activeCompany].name, month, year)}`, "success");
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
    onSuccess: async () => {
      pushToast("Amendment draft created", "success");
      await queryClient.invalidateQueries({ queryKey: ["form-425c"] });
    },
    onError: (error) => pushToast(userFacingApiError(error, "Amend failed"), "error"),
  });

  useEffect(() => {
    if (!dirty || !form.reportId) return;
    const timer = setTimeout(() => saveMutation.mutate(), 10_000);
    return () => clearTimeout(timer);
  }, [dirty, form.reportId, form, saveMutation]);

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

      <SecondaryNavTabs
        className="px-4 pt-2"
        tabs={TABS.map((t) => ({ id: t.id, label: t.label }))}
        activeId={tab}
        onChange={(next) => setTab(next as TabId)}
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
          onSave={() => saveProfileMutation.mutate()}
          saving={saveProfileMutation.isPending}
        />
      ) : null}

      {tab === "qb" ? <QBImportTab activeCompany={activeCompany} setActiveCompany={setActiveCompany} profiles={profiles} onApplyTotal={(total) => setForm((prev) => ({ ...prev, totalReceipts: total.toFixed(2) }))} /> : null}

      {tab === "form" ? (
        <CurrentPeriodTab
          activeCompany={activeCompany}
          setActiveCompany={setActiveCompany}
          month={month}
          year={year}
          setMonth={setMonth}
          setYear={setYear}
          profiles={profiles}
          form={form}
          setForm={(updater) => {
            setForm((prev) => updater(prev));
            setDirty(true);
          }}
          onCreateOrLoad={() => {
            if (selectedReport?.id) {
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
            createMutation.mutate();
          }}
          onImportBanking={() => importMutation.mutate()}
          onSave={() => {
            if (!form.reportId) {
              pushToast("Create / Load Draft before saving", "error");
              return;
            }
            saveMutation.mutate(undefined, {
              onSuccess: () => pushToast("Draft saved", "success"),
            });
          }}
          onGeneratePdf={() => generateMutation.mutate()}
          onMarkFiled={() => markFiledMutation.mutate()}
          loading={importMutation.isPending || saveMutation.isPending}
          autoSaveLabel={dirty ? "Auto-save pending..." : autoSavedAt ? `Auto-saved at ${new Date(autoSavedAt).toLocaleTimeString()}` : "No unsaved changes"}
        />
      ) : null}

      {tab === "merge" ? (
        <MergeExportTab
          company={profiles[activeCompany]}
          month={month}
          year={year}
          canGenerate={Boolean(form.reportId)}
          generating={generateMutation.isPending}
          onGenerate={() => {
            if (!form.reportId) {
              pushToast("Create / Load Draft before generating the filing package", "error");
              return;
            }
            generateMutation.mutate();
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
            const d = new Date(row.reporting_month);
            if (!Number.isNaN(d.getTime())) {
              setYear(d.getUTCFullYear());
              setMonth(d.getUTCMonth());
            }
            setTab("form");
            pushToast("Opened report in Form 425C", "success");
          }}
          onAmend={(id) => amendMutation.mutate(id)}
        />
      ) : null}
    </div>
  );
}
