import { useEffect, useMemo, useReducer, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  addForm425CExhibitA,
  addForm425CExhibitB,
  amendForm425CReport,
  attachForm425CLineFile,
  createForm425CReport,
  generateForm425CPdf,
  getForm425CReport,
  importForm425CBanking,
  listForm425CReports,
  markForm425CFiled,
  patchForm425CReport,
  type Form425CReport,
} from "../../api/form425c";
import { Button } from "../../components/Button";
import { PageHeader } from "../../components/layout/PageHeader";
import { useToast } from "../../components/Toast";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { ExhibitDrawer } from "./components/ExhibitDrawer";
import { FilingHistoryPage } from "./components/FilingHistoryPage";
import { Form425CHeaderStrip } from "./components/Form425CHeaderStrip";
import { MergeExportPage } from "./components/MergeExportPage";
import { Part1ComplianceQuestions } from "./components/Part1ComplianceQuestions";
import { Part2UnusualEvents } from "./components/Part2UnusualEvents";
import { Part3CashSummary } from "./components/Part3CashSummary";
import { Part4PayablesReceivables } from "./components/Part4PayablesReceivables";
import { Part5Employees } from "./components/Part5Employees";
import { Part6ProfessionalFees } from "./components/Part6ProfessionalFees";
import { Part7Projections } from "./components/Part7Projections";
import { Part8Attachments } from "./components/Part8Attachments";

type FormState = {
  part1_answers: Record<string, string>;
  part2_answers: Record<string, string>;
  line_19_opening_cash: number | null;
  line_20_receipts: number | null;
  line_21_disbursements: number | null;
  line_22_net_cash_flow: number | null;
  line_23_ending_cash: number | null;
  line_24_payables: number | null;
  line_25_receivables: number | null;
  line_26_employees_at_filing: number | null;
  line_27_employees_now: number | null;
  line_28_bk_fees_this_month: number | null;
  line_29_bk_fees_since_filing: number | null;
  line_30_other_fees_this_month: number | null;
  line_31_other_fees_since_filing: number | null;
  line_32_proj_receipts: number | null;
  line_33_proj_disbursements: number | null;
  line_34_proj_net_cash_flow: number | null;
  line_35_next_proj_receipts: number | null;
  line_36_next_proj_disbursements: number | null;
  line_37_next_proj_net_cash_flow: number | null;
  projection_override_reason: string;
  attachment_38_bank_statements_uuids: string[];
  attachment_39_recon_reports_uuids: string[];
  attachment_40_financial_reports_uuids: string[];
  attachment_41_budget_uuids: string[];
  attachment_42_job_costing_uuids: string[];
};

type Action =
  | { type: "set"; payload: Partial<FormState> }
  | { type: "hydrate"; payload: FormState };

const SUBNAV = [
  { id: "form_lines", label: "Form (Lines 1-37)" },
  { id: "exhibit_a", label: "Exhibit A" },
  { id: "exhibit_b", label: "Exhibit B" },
  { id: "exhibit_c", label: "Exhibit C (auto)" },
  { id: "exhibit_d", label: "Exhibit D (auto)" },
  { id: "exhibit_e", label: "Exhibit E (auto)" },
  { id: "exhibit_f", label: "Exhibit F (auto)" },
  { id: "merge_export", label: "Merge & Export" },
  { id: "filing_history", label: "Filing History" },
] as const;

const EMPTY_STATE: FormState = {
  part1_answers: {},
  part2_answers: {},
  line_19_opening_cash: null,
  line_20_receipts: null,
  line_21_disbursements: null,
  line_22_net_cash_flow: null,
  line_23_ending_cash: null,
  line_24_payables: null,
  line_25_receivables: null,
  line_26_employees_at_filing: null,
  line_27_employees_now: null,
  line_28_bk_fees_this_month: null,
  line_29_bk_fees_since_filing: null,
  line_30_other_fees_this_month: null,
  line_31_other_fees_since_filing: null,
  line_32_proj_receipts: null,
  line_33_proj_disbursements: null,
  line_34_proj_net_cash_flow: null,
  line_35_next_proj_receipts: null,
  line_36_next_proj_disbursements: null,
  line_37_next_proj_net_cash_flow: null,
  projection_override_reason: "",
  attachment_38_bank_statements_uuids: [],
  attachment_39_recon_reports_uuids: [],
  attachment_40_financial_reports_uuids: [],
  attachment_41_budget_uuids: [],
  attachment_42_job_costing_uuids: [],
};

function reducer(state: FormState, action: Action): FormState {
  if (action.type === "hydrate") return action.payload;
  return { ...state, ...action.payload };
}

function monthNow() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function toNumber(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function fromReport(report?: Record<string, unknown> | null): FormState {
  if (!report) return EMPTY_STATE;
  return {
    part1_answers: (report.part1_answers as Record<string, string>) ?? {},
    part2_answers: (report.part2_answers as Record<string, string>) ?? {},
    line_19_opening_cash: toNumber(report.line_19_opening_cash),
    line_20_receipts: toNumber(report.line_20_receipts),
    line_21_disbursements: toNumber(report.line_21_disbursements),
    line_22_net_cash_flow: toNumber(report.line_22_net_cash_flow),
    line_23_ending_cash: toNumber(report.line_23_ending_cash),
    line_24_payables: toNumber(report.line_24_payables),
    line_25_receivables: toNumber(report.line_25_receivables),
    line_26_employees_at_filing: toNumber(report.line_26_employees_at_filing),
    line_27_employees_now: toNumber(report.line_27_employees_now),
    line_28_bk_fees_this_month: toNumber(report.line_28_bk_fees_this_month),
    line_29_bk_fees_since_filing: toNumber(report.line_29_bk_fees_since_filing),
    line_30_other_fees_this_month: toNumber(report.line_30_other_fees_this_month),
    line_31_other_fees_since_filing: toNumber(report.line_31_other_fees_since_filing),
    line_32_proj_receipts: toNumber(report.line_32_proj_receipts),
    line_33_proj_disbursements: toNumber(report.line_33_proj_disbursements),
    line_34_proj_net_cash_flow: toNumber(report.line_34_proj_net_cash_flow),
    line_35_next_proj_receipts: toNumber(report.line_35_next_proj_receipts),
    line_36_next_proj_disbursements: toNumber(report.line_36_next_proj_disbursements),
    line_37_next_proj_net_cash_flow: toNumber(report.line_37_next_proj_net_cash_flow),
    projection_override_reason: String(report.projection_override_reason ?? ""),
    attachment_38_bank_statements_uuids: (report.attachment_38_bank_statements_uuids as string[]) ?? [],
    attachment_39_recon_reports_uuids: (report.attachment_39_recon_reports_uuids as string[]) ?? [],
    attachment_40_financial_reports_uuids: (report.attachment_40_financial_reports_uuids as string[]) ?? [],
    attachment_41_budget_uuids: (report.attachment_41_budget_uuids as string[]) ?? [],
    attachment_42_job_costing_uuids: (report.attachment_42_job_costing_uuids as string[]) ?? [],
  };
}

export function Form425CPage() {
  const queryClient = useQueryClient();
  const { selectedCompanyId } = useCompanyContext();
  const { pushToast } = useToast();
  const companyId = selectedCompanyId ?? "";
  const [tab, setTab] = useState<(typeof SUBNAV)[number]["id"]>("form_lines");
  const [month, setMonth] = useState(monthNow());
  const [activeReportId, setActiveReportId] = useState<string | null>(null);
  const [state, dispatch] = useReducer(reducer, EMPTY_STATE);
  const [dirty, setDirty] = useState(false);
  const [autoSavedAt, setAutoSavedAt] = useState<string | null>(null);
  const [drawer, setDrawer] = useState<{ type: "A" | "B"; lineNumber: number } | null>(null);

  const reportsQuery = useQuery({
    queryKey: ["form-425c", "reports", companyId],
    queryFn: () => listForm425CReports(companyId),
    enabled: Boolean(companyId),
  });

  useEffect(() => {
    const first = reportsQuery.data?.reports?.[0];
    if (!activeReportId && first?.id) setActiveReportId(first.id);
  }, [reportsQuery.data?.reports, activeReportId]);

  const reportDetailQuery = useQuery({
    queryKey: ["form-425c", "detail", companyId, activeReportId ?? ""],
    queryFn: () => getForm425CReport(activeReportId!, companyId),
    enabled: Boolean(companyId && activeReportId),
  });

  useEffect(() => {
    if (reportDetailQuery.data?.report) {
      dispatch({ type: "hydrate", payload: fromReport(reportDetailQuery.data.report) });
      setDirty(false);
    }
  }, [reportDetailQuery.data?.report]);

  const currentReport = reportDetailQuery.data?.report ?? null;
  const carryForwardSource = String(currentReport?.carry_forward_source_report_id ?? "");
  const saveMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) => patchForm425CReport(activeReportId!, companyId, payload),
    onSuccess: async () => {
      setAutoSavedAt(new Date().toISOString());
      await queryClient.invalidateQueries({ queryKey: ["form-425c", "detail", companyId, activeReportId ?? ""] });
      await queryClient.invalidateQueries({ queryKey: ["form-425c", "reports", companyId] });
    },
    onError: (error) => pushToast(String((error as Error).message || "Auto-save failed"), "error"),
  });

  useEffect(() => {
    if (!dirty || !activeReportId || !companyId) return;
    const timer = setTimeout(() => {
      const payload: Record<string, unknown> = { ...state };
      saveMutation.mutate(payload);
      setDirty(false);
    }, 10_000);
    return () => clearTimeout(timer);
  }, [dirty, state, activeReportId, companyId]); // eslint-disable-line react-hooks/exhaustive-deps

  const createMutation = useMutation({
    mutationFn: () =>
      createForm425CReport(companyId, {
        reporting_month: `${month}-01`,
        case_number: "25-50241",
        court_district: "Southern District of Texas",
        petition_date: "2025-02-03",
        subchapter: "V",
      }),
    onSuccess: async (report) => {
      pushToast("Form 425C report created", "success");
      setActiveReportId(report.id);
      await queryClient.invalidateQueries({ queryKey: ["form-425c", "reports", companyId] });
    },
    onError: (error) => pushToast(String((error as Error).message || "Create failed"), "error"),
  });

  const importMutation = useMutation({
    mutationFn: () => importForm425CBanking(activeReportId!, companyId),
    onSuccess: async () => {
      pushToast("Banking lines 19-23 imported", "success");
      await queryClient.invalidateQueries({ queryKey: ["form-425c", "detail", companyId, activeReportId ?? ""] });
    },
    onError: (error) => pushToast(String((error as Error).message || "Import failed"), "error"),
  });

  const generateMutation = useMutation({
    mutationFn: () => generateForm425CPdf(activeReportId!, companyId),
    onSuccess: async () => {
      pushToast("Filing PDF generated", "success");
      await queryClient.invalidateQueries({ queryKey: ["form-425c"] });
    },
    onError: (error) => pushToast(String((error as Error).message || "PDF generation failed"), "error"),
  });

  const markFiledMutation = useMutation({
    mutationFn: (id: string) => markForm425CFiled(id, companyId),
    onSuccess: async () => {
      pushToast("Report marked filed", "success");
      await queryClient.invalidateQueries({ queryKey: ["form-425c"] });
    },
    onError: (error) => pushToast(String((error as Error).message || "Mark filed failed"), "error"),
  });

  const amendMutation = useMutation({
    mutationFn: (id: string) => amendForm425CReport(id, companyId),
    onSuccess: async (report) => {
      pushToast("Amendment draft created", "success");
      setActiveReportId(report.id);
      await queryClient.invalidateQueries({ queryKey: ["form-425c"] });
    },
    onError: (error) => pushToast(String((error as Error).message || "Amend failed"), "error"),
  });

  const exhibitAByLine = useMemo(() => {
    const map: Record<number, number> = {};
    for (const row of reportDetailQuery.data?.exhibit_a ?? []) {
      const line = Number(row.line_number ?? 0);
      if (!line) continue;
      map[line] = (map[line] ?? 0) + 1;
    }
    return map;
  }, [reportDetailQuery.data?.exhibit_a]);
  const exhibitBByLine = useMemo(() => {
    const map: Record<number, number> = {};
    for (const row of reportDetailQuery.data?.exhibit_b ?? []) {
      const line = Number(row.line_number ?? 0);
      if (!line) continue;
      map[line] = (map[line] ?? 0) + 1;
    }
    return map;
  }, [reportDetailQuery.data?.exhibit_b]);

  const onAttach = async (line: number, fileUuid: string) => {
    if (!activeReportId || !companyId || !fileUuid.trim()) return;
    try {
      await attachForm425CLineFile(activeReportId, companyId, line, fileUuid.trim());
      pushToast(`Attachment line ${line} linked`, "success");
      await queryClient.invalidateQueries({ queryKey: ["form-425c", "detail", companyId, activeReportId] });
    } catch (error) {
      pushToast(String((error as Error).message || "Attachment link failed"), "error");
    }
  };

  return (
    <div className="space-y-3">
      <PageHeader
        title="Form 425C"
        subtitle="Chapter 11 monthly operating report"
        actions={
          <div className="flex items-center gap-2">
            <input
              type="month"
              className="h-8 rounded border border-gray-300 px-2 text-xs"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
            />
            <Button size="sm" onClick={() => createMutation.mutate()} disabled={!companyId}>
              + Generate New Submission
            </Button>
          </div>
        }
      />

      <div className="overflow-x-auto rounded bg-[#1A1F36] px-2 py-1 text-[11px] text-white">
        <div className="flex min-w-max gap-4">
          {SUBNAV.map((item) => (
            <button key={item.id} type="button" className={tab === item.id ? "border-b border-white pb-0.5 font-semibold" : ""} onClick={() => setTab(item.id)}>
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <Form425CHeaderStrip report={currentReport} month={month} />

      {tab === "form_lines" ? (
        <div className="space-y-3">
          <Part1ComplianceQuestions
            answers={state.part1_answers}
            exhibitCountByLine={exhibitAByLine}
            onChange={(answers) => {
              dispatch({ type: "set", payload: { part1_answers: answers } });
              setDirty(true);
            }}
            onOpenExhibit={(lineNumber) => setDrawer({ type: "A", lineNumber })}
          />
          <Part2UnusualEvents
            answers={state.part2_answers}
            exhibitCountByLine={exhibitBByLine}
            onChange={(answers) => {
              dispatch({ type: "set", payload: { part2_answers: answers } });
              setDirty(true);
            }}
            onOpenExhibit={(lineNumber) => setDrawer({ type: "B", lineNumber })}
          />
          <Part3CashSummary
            state={state}
            onChange={(payload) => {
              dispatch({ type: "set", payload });
              setDirty(true);
            }}
            onImport={() => importMutation.mutate()}
            importing={importMutation.isPending}
          />
          <Part4PayablesReceivables
            line24={state.line_24_payables}
            line25={state.line_25_receivables}
            onChange={(payload) => {
              dispatch({ type: "set", payload });
              setDirty(true);
            }}
          />
          <Part5Employees
            line26={state.line_26_employees_at_filing}
            line27={state.line_27_employees_now}
            onChange={(payload) => {
              dispatch({ type: "set", payload });
              setDirty(true);
            }}
          />
          <Part6ProfessionalFees
            state={state}
            onChange={(payload) => {
              dispatch({ type: "set", payload });
              setDirty(true);
            }}
          />
          <Part7Projections
            state={state}
            hasCarryForward={Boolean(carryForwardSource)}
            onChange={(payload) => {
              dispatch({ type: "set", payload });
              setDirty(true);
            }}
          />
          <Part8Attachments state={state} onAttach={onAttach} />
        </div>
      ) : null}

      {tab === "exhibit_a" ? (
        <ExhibitDrawer
          open
          title="Exhibit A entries"
          entries={reportDetailQuery.data?.exhibit_a ?? []}
          onSubmit={async (lineNumber, explanation) => {
            if (!activeReportId || !companyId) return;
            await addForm425CExhibitA(activeReportId, companyId, lineNumber, explanation);
            await queryClient.invalidateQueries({ queryKey: ["form-425c", "detail", companyId, activeReportId] });
          }}
          lineBounds={{ min: 1, max: 9 }}
        />
      ) : null}

      {tab === "exhibit_b" ? (
        <ExhibitDrawer
          open
          title="Exhibit B entries"
          entries={reportDetailQuery.data?.exhibit_b ?? []}
          onSubmit={async (lineNumber, explanation) => {
            if (!activeReportId || !companyId) return;
            await addForm425CExhibitB(activeReportId, companyId, lineNumber, explanation);
            await queryClient.invalidateQueries({ queryKey: ["form-425c", "detail", companyId, activeReportId] });
          }}
          lineBounds={{ min: 10, max: 18 }}
        />
      ) : null}

      {["exhibit_c", "exhibit_d", "exhibit_e", "exhibit_f"].includes(tab) ? (
        <div className="rounded border border-gray-200 bg-white p-4 text-sm text-gray-600">
          {tab === "exhibit_c" ? "Exhibit C (cash receipts detail) is generated from Banking import lines 19-23." : null}
          {tab === "exhibit_d" ? "Exhibit D (cash disbursements detail) is generated from Banking transaction activity." : null}
          {tab === "exhibit_e" ? "Exhibit E (payables aging) consumes accounting bills data." : null}
          {tab === "exhibit_f" ? "Exhibit F (receivables aging) consumes accounting invoices data." : null}
        </div>
      ) : null}

      {tab === "merge_export" ? (
        <MergeExportPage
          canGenerate={Boolean(activeReportId)}
          isGenerating={generateMutation.isPending}
          onGenerate={() => generateMutation.mutate()}
          onMarkFiled={() => activeReportId && markFiledMutation.mutate(activeReportId)}
          markingFiled={markFiledMutation.isPending}
        />
      ) : null}

      {tab === "filing_history" ? (
        <FilingHistoryPage
          reports={reportsQuery.data?.reports ?? []}
          onOpen={(id) => {
            setActiveReportId(id);
            setTab("form_lines");
          }}
          onMarkFiled={(id) => markFiledMutation.mutate(id)}
          onAmend={(id) => amendMutation.mutate(id)}
        />
      ) : null}

      <div className="flex items-center justify-between rounded border border-gray-200 bg-white px-3 py-2 text-xs text-gray-600">
        <span>{dirty ? "Auto-save pending..." : autoSavedAt ? `Auto-saved at ${new Date(autoSavedAt).toLocaleTimeString()}` : "No unsaved changes"}</span>
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={() => saveMutation.mutate({ ...state })} disabled={!activeReportId || saveMutation.isPending}>
            Save Draft
          </Button>
          <Button size="sm" variant="secondary" onClick={() => generateMutation.mutate()} disabled={!activeReportId || generateMutation.isPending}>
            Preview PDF
          </Button>
          <Button size="sm" onClick={() => generateMutation.mutate()} disabled={!activeReportId || generateMutation.isPending}>
            Save & Generate Filing PDF
          </Button>
        </div>
      </div>

      {drawer ? (
        <ExhibitDrawer
          open
          title={drawer.type === "A" ? `Exhibit A entry for line ${drawer.lineNumber}` : `Exhibit B entry for line ${drawer.lineNumber}`}
          entries={drawer.type === "A" ? reportDetailQuery.data?.exhibit_a ?? [] : reportDetailQuery.data?.exhibit_b ?? []}
          lineBounds={drawer.type === "A" ? { min: 1, max: 9 } : { min: 10, max: 18 }}
          initialLineNumber={drawer.lineNumber}
          onClose={() => setDrawer(null)}
          onSubmit={async (lineNumber, explanation) => {
            if (!activeReportId || !companyId) return;
            if (drawer.type === "A") {
              await addForm425CExhibitA(activeReportId, companyId, lineNumber, explanation);
            } else {
              await addForm425CExhibitB(activeReportId, companyId, lineNumber, explanation);
            }
            await queryClient.invalidateQueries({ queryKey: ["form-425c", "detail", companyId, activeReportId] });
            setDrawer(null);
          }}
        />
      ) : null}
    </div>
  );
}
