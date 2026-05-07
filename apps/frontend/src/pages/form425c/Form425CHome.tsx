import { useEffect, useMemo, useState } from "react";
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
import { buildPrintHTML, suggestedFilename } from "./lib/buildPrintHTML";
import { DEFAULT_PROFILES } from "./lib/constants";
import type { CompanyKey, CompanyProfiles, CurrentFormState, HistoryReportRow } from "./types";
import { CurrentPeriodTab } from "./tabs/CurrentPeriodTab";
import { HistoryTab } from "./tabs/HistoryTab";
import { MergeExportTab } from "./tabs/MergeExportTab";
import { ProfilesTab } from "./tabs/ProfilesTab";
import { QBImportTab } from "./tabs/QBImportTab";

type TabId = "profile" | "qb" | "form" | "merge" | "history";

const TABS: Array<{ id: TabId; label: string }> = [
  { id: "profile", label: "⚙ Profiles & Defaults" },
  { id: "qb", label: "📥 QB Import" },
  { id: "form", label: "📋 Form 425C" },
  { id: "merge", label: "📁 Merge & Export" },
  { id: "history", label: "📊 History" },
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

  const [tab, setTab] = useState<TabId>("profile");
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
  }, [profilesQuery.data?.profiles]);

  useEffect(() => {
    if (!detailQuery.data?.report) {
      const defaults = profiles[activeCompany].defaultAnswers;
      setForm((prev) => ({ ...emptyForm(), answers: { ...defaults }, projectionOverrideReason: prev.projectionOverrideReason }));
      return;
    }
    setForm(toFormState(detailQuery.data.report as Record<string, unknown>, profiles[activeCompany].defaultAnswers));
    setDirty(false);
  }, [detailQuery.data?.report, profiles, activeCompany]);

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
      }),
    onSuccess: async () => {
      pushToast("Profile defaults saved", "success");
      await queryClient.invalidateQueries({ queryKey: ["form-425c", "profiles", companyId] });
    },
    onError: (error) => pushToast(String((error as Error).message || "Failed to save profile"), "error"),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      createForm425CReport(companyId, {
        reporting_month: `${monthKey(year, month)}-01`,
        case_number: profiles[activeCompany].caseNumber || "25-00000",
        court_district: `${profiles[activeCompany].division} Division · ${profiles[activeCompany].district} District`,
        petition_date: "2025-02-03",
        subchapter: "V",
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["form-425c", "reports", companyId] });
      pushToast("Report created", "success");
    },
    onError: (error) => pushToast(String((error as Error).message || "Create report failed"), "error"),
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!form.reportId) return;
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
    onError: (error) => pushToast(String((error as Error).message || "Save failed"), "error"),
  });

  const importMutation = useMutation({
    mutationFn: () => importForm425CBanking(form.reportId!, companyId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["form-425c", "detail", companyId, form.reportId ?? ""] });
      pushToast("Lines 19-23 imported from Banking", "success");
    },
    onError: (error) => pushToast(String((error as Error).message || "Banking import failed"), "error"),
  });

  const generateMutation = useMutation({
    mutationFn: () => generateForm425CPdf(form.reportId!, companyId),
    onSuccess: async (res) => {
      const printHtml = res.print_html || buildPrintHTML(form, profiles[activeCompany], month, year);
      const w = window.open("", "_blank");
      if (!w) return;
      w.document.write(printHtml);
      w.document.close();
      setTimeout(() => w.print(), 600);
      pushToast(`Ready to print: ${res.suggested_filename || suggestedFilename(profiles[activeCompany].name, month, year)}`, "success");
      await queryClient.invalidateQueries({ queryKey: ["form-425c"] });
    },
    onError: (error) => pushToast(String((error as Error).message || "PDF generation failed"), "error"),
  });

  const markFiledMutation = useMutation({
    mutationFn: () => markForm425CFiled(form.reportId!, companyId),
    onSuccess: async () => {
      pushToast("Report marked filed", "success");
      await queryClient.invalidateQueries({ queryKey: ["form-425c"] });
    },
    onError: (error) => pushToast(String((error as Error).message || "Mark filed failed"), "error"),
  });

  const amendMutation = useMutation({
    mutationFn: (id: string) => amendForm425CReport(id, companyId),
    onSuccess: async () => {
      pushToast("Amendment draft created", "success");
      await queryClient.invalidateQueries({ queryKey: ["form-425c"] });
    },
    onError: (error) => pushToast(String((error as Error).message || "Amend failed"), "error"),
  });

  useEffect(() => {
    if (!dirty || !form.reportId) return;
    const timer = setTimeout(() => saveMutation.mutate(), 10_000);
    return () => clearTimeout(timer);
  }, [dirty, form.reportId, form, saveMutation]);

  const historyReports = ((reportsQuery.data?.reports ?? []) as HistoryReportRow[]).filter((r) => r.status === "filed");

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="bg-gradient-to-r from-slate-900 to-blue-900 px-5 py-3 text-white">
        <div className="text-lg font-extrabold">IH 35 GROUP</div>
        <div className="text-xs opacity-75">Official Form 425C — Monthly Operating Report System</div>
      </div>

      <div className="flex gap-1 bg-white px-4 pt-2 shadow-sm">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-t px-3 py-2 text-sm font-semibold ${tab === t.id ? "bg-slate-800 text-white" : "text-slate-600 hover:bg-slate-100"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "profile" ? (
        <ProfilesTab
          profiles={profiles}
          activeCompany={activeCompany}
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
            createMutation.mutate();
          }}
          onImportBanking={() => importMutation.mutate()}
          onSave={() => saveMutation.mutate()}
          onGeneratePdf={() => generateMutation.mutate()}
          onMarkFiled={() => markFiledMutation.mutate()}
          loading={importMutation.isPending || saveMutation.isPending}
          autoSaveLabel={dirty ? "Auto-save pending..." : autoSavedAt ? `Auto-saved at ${new Date(autoSavedAt).toLocaleTimeString()}` : "No unsaved changes"}
        />
      ) : null}

      {tab === "merge" ? (
        <MergeExportTab company={profiles[activeCompany]} month={month} year={year} canGenerate={Boolean(form.reportId)} generating={generateMutation.isPending} onGenerate={() => generateMutation.mutate()} />
      ) : null}

      {tab === "history" ? (
        <HistoryTab
          reports={historyReports}
          loading={reportsQuery.isLoading}
          onOpen={(id) => {
            const row = historyReports.find((r) => r.id === id);
            if (row?.reporting_month) {
              const d = new Date(row.reporting_month);
              if (!Number.isNaN(d.getTime())) {
                setYear(d.getUTCFullYear());
                setMonth(d.getUTCMonth());
              }
            }
            setTab("form");
          }}
          onAmend={(id) => amendMutation.mutate(id)}
        />
      ) : null}
    </div>
  );
}

