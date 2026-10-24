import { TourMilesPanel } from "../../components/dispatch/TourMilesPanel";
import { getTourReadout, type TourLeg } from "../../api/tourReadout";
import { entityLabel } from "../../lib/entity-label";
import { useSearchParams } from "react-router-dom";
import { settlementLabel } from "../../lib/settlementNumber";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  closeSettlementPayRun,
  getDebtSummary,
  getPreSettlementForDriver,
  listOpenPreSettlementsByDriver,
  settleAndPay,
  type PreSettlementLine,
} from "../../api/driverFinance";
import { getCoaAccounts } from "../../api/banking";
import { ApiError } from "../../api/client";
import {
  ExpenseLoadConfirmEngineUnavailableError,
  listExpenseLoadConfirmations,
} from "../../api/expenseLoadConfirmations";
import { useAuth } from "../../auth/useAuth";
import { Button } from "../../components/Button";
import { Combobox } from "../../components/Combobox";
import { CreateDriverModal } from "../../components/drivers/CreateDriverModal";
import { ExpenseLoadConfirmationsBoard } from "../../components/expenses/ExpenseLoadConfirmationsBoard";
import { PageHeader } from "../../components/layout/PageHeader";
import { NavyPageSubNav } from "../../components/layout/NavyPageSubNav";
import { PaymentMethodPicker } from "../../components/driver-finance/PaymentMethodPicker";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { V3Panel } from "../../components/v3/V3Panel";
import { useToast } from "../../components/Toast";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { EntityLink } from "../../components/shared/EntityLink";
import { MoneyCell } from "../../components/shared/MoneyCell";
import { V3 } from "../../design/v3-tokens";
import { formatUsd } from "../../lib/money";
import { formatDateUS } from "../../lib/formatDate";
import { InfoPopover } from "../../components/shared/InfoPopover";
import { SETTLEMENTS_SUBNAV } from "./settlementsSubnav";

/** Board Miles (doc) — driver-bill miles_basis when present, else practical; never invent. */
function milesDocForLeg(
  leg: TourLeg,
  bills: Array<{ load_id: string; miles_basis: number | null }> | undefined,
): string {
  const bill = (bills ?? []).find((b) => b.load_id === leg.load_id);
  const n = bill?.miles_basis ?? leg.miles_practical;
  if (n == null || !Number.isFinite(Number(n))) return "—";
  return Number(n).toLocaleString("en-US", { maximumFractionDigits: 1, minimumFractionDigits: 0 });
}

/** ROUND 443.280-A — working 7-step close (board Settlements-Close.png). Steps clickable; Back/Next advance. */
const CLOSE_BOARD_STEPS = [
  { n: 1, label: "Driver" },
  { n: 2, label: "Loads & miles" },
  { n: 3, label: "Gross" },
  { n: 4, label: "Deductions" },
  { n: 5, label: "Escrow" },
  { n: 6, label: "Advances" },
  { n: 7, label: "Net & pay" },
] as const;

type CloseWizardStep = (typeof CLOSE_BOARD_STEPS)[number]["n"];

type DraftJeRow = { id: string; account: string; debit: string; credit: string };

type LoadBoardRow = {
  id: string;
  load_id: string;
  load_number: string | null;
  lane: string;
  delivered: string;
  miles_doc: string;
  pay: number;
  is_gross?: boolean;
};

type LineBoardRow = { id: string; description: string; amount: number };

// Owner-locked driver-bond/escrow cap (Phase 3 Settlement Pay-Run spec). This is the total escrow
// balance ceiling shown as a progress indicator on the close screen — NOT a GL posting rule; the
// actual escrow-contribution deduction amount continues to come from the existing settlement lines.
// ACCT-F5657 — was 2000 (superseded). Owner ruling C2b (2026-07-26, "IT IS 2500 NOW") raised the cap
// to $2,500 — the backend (escrow-resolver.service.ts's ESCROW_CAP_CENTS = 250_000) and its own
// guard (verify-settlement-escrow-cap.mjs) were already correct; only this display literal was stale,
// showing "Cap $2,000" / a wrong "% to cap" to the person actually closing the settlement.
const ESCROW_CAP_DOLLARS = 2500;

const DEDUCTION_LINE_TYPES = new Set(["deduction", "abandonment_chargeback"]);
const ESCROW_LINE_TYPES = new Set(["escrow_contribution"]);
const ADVANCE_RECOVERY_LINE_TYPES = new Set(["advance_recovery"]);
const EARNINGS_LINE_TYPES = new Set(["earnings", "extra_pay", "team_split_primary", "team_split_secondary"]);
const REIMBURSEMENT_LINE_TYPES = new Set(["reimbursement"]);

// Roles permitted to Close a settlement on this screen — mirrors the review-role set used
// elsewhere in driver-finance (cash-advance-requests office review, settlement finalize).
const CLOSE_ROLES = new Set(["Owner", "Administrator", "Manager", "Accountant"]);

// SETTLE-SWEEP (GPT financial review, docs/bus/OUTBOX-GPT.md "SETTLE-SWEEP Settlement Close
// MEASURED/CONFIRMED"): this page collected a payment method (PaymentMethodPicker below) but
// `closeMut` only ever called `settleAndPay` (approve + PDF + notify) -- the picked account was
// never used to actually post the GL entry. `closeSettlementPayRun` (the ONLY live GL poster for a
// driver settlement, per docs/audit/SETL-POST-01-DRY-RUN-2026-09-06.md) is a SEPARATE, complementary
// action, not a duplicate: /settle never posts a JE, /payrun-close never renders a PDF or notifies
// the driver. Recommendation: "existing CloseTripPanel/PayRunClosePanel; no new GL math" -- this
// reuses the exact same poster PayRunClosePanel already calls, adding no new posting logic.
// Several close-time decisions (an outstanding driver loan, a net-pay floor breach, a missing
// per-driver escrow account) are interactive/human decisions by design (SET-05, GO-22 B7) that
// PayRunClosePanel has dedicated UI for; this page does not attempt to rebuild that UI -- when the
// poster refuses for one of those reasons, the settle (approve+notify) already succeeded and stays
// in place, and the user is told plainly to finish posting from Settlement Detail's Pay Run Close
// panel instead of silently failing or guessing at a decision.
const PAYRUN_NEEDS_HUMAN_REVIEW_CODES = new Set([
  "OUTSTANDING_LOAN_DECISION_REQUIRED",
  "NET_PAY_FLOOR_BREACH",
  "NET_PAY_NEGATIVE",
  "SETTLEMENT_ALREADY_POSTED_BY_OTHER_POSTER",
  "DRIVER_ESCROW_ACCOUNT_UNBOUND",
  "DRIVER_PAY_ACCOUNT_MISSING",
  "REIMBURSEMENT_EXPENSE_ACCOUNT_MISSING",
  "DETENTION_PAY_EXPENSE_ACCOUNT_MISSING",
  "DEDUCTION_RECOVERY_ACCOUNT_MISSING",
  "CHARGEBACK_RECOVERY_ACCOUNT_MISSING",
  "ADVANCE_CLEARING_ACCOUNT_MISSING",
  "PAYMENT_METHOD_NO_GL_ACCOUNT",
  "UNBALANCED_ENTRY",
  "SETTLEMENT_HAS_NO_LOAD_ACTIVITY",
  "SETTLEMENT_NOT_POSTABLE",
]);

function extractPayRunErrorCode(error: unknown): string {
  if (error instanceof ApiError && error.data && typeof error.data === "object") {
    return String((error.data as { error?: string }).error ?? `HTTP_${error.status}`);
  }
  return "UNKNOWN";
}

function sumLines(lines: PreSettlementLine[], types: Set<string>): number {
  return lines.filter((l) => types.has(l.line_type)).reduce((sum, l) => sum + Number(l.amount ?? 0), 0);
}

function nextStepLabel(step: CloseWizardStep): string {
  const next = CLOSE_BOARD_STEPS.find((s) => s.n === step + 1);
  return next ? `Next: ${next.label}` : "Next";
}

export function SettlementCloseArrivalPage() {
  const { selectedCompanyId } = useCompanyContext();
  const { user } = useAuth();
  const { pushToast } = useToast();
  const qc = useQueryClient();
  const companyId = selectedCompanyId ?? "";
  const role = String(user?.role ?? "");
  const currentUserId = String(user?.uuid ?? "");
  const canClose = CLOSE_ROLES.has(role);

  // LEAD 443.269-A 3b / 443.293-B: Dispatch "Close settlement" opens this page for THAT driver
  // (?driver_id=&settlement_id=). Same wizard as Settlements › Settlement Close queue — one engine.
  const [closeSearchParams] = useSearchParams();
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(() => closeSearchParams.get("driver_id"));
  const [paymentMethodId, setPaymentMethodId] = useState<string | null>(null);
  const [paymentMethodGlAccountId, setPaymentMethodGlAccountId] = useState<string | null>(null);
  const [driverCreateOpen, setDriverCreateOpen] = useState(false);
  // ROUND 443.280-A — real wizard state (was hardcoded activeStep = settlement ? 3 : 1).
  const [wizardStep, setWizardStep] = useState<CloseWizardStep>(1);

  // Keep picker in sync when Dispatch navigates here with a different driver_id (same mount).
  useEffect(() => {
    const fromUrl = closeSearchParams.get("driver_id");
    if (fromUrl && fromUrl !== selectedDriverId) setSelectedDriverId(fromUrl);
  }, [closeSearchParams, selectedDriverId]);

  const openQuery = useQuery({
    queryKey: ["driver-finance", "pre-settlements", "open-by-driver", companyId],
    queryFn: () => listOpenPreSettlementsByDriver(companyId),
    enabled: Boolean(companyId),
  });

  const openOptions = useMemo(
    () =>
      (openQuery.data?.pre_settlements ?? []).map((row) => {
        const name = entityLabel((row.driver_name ?? "").trim() || null, row.driver_id, "Driver");
        // COL-06: period_start/period_end are already on the row (pre-settlement.routes.ts
        // open-by-driver already selects them) -- the picker just never surfaced them, so two
        // open pre-settlements for the same driver were indistinguishable by settlement # alone.
        const period =
          row.period_start || row.period_end
            ? `${formatDateUS(row.period_start ?? null)} – ${formatDateUS(row.period_end ?? null)} · `
            : "";
        return {
          value: row.driver_id,
          label: `${name} — ${entityLabel(row.settlement_number, row.settlement_id, "Settlement")}`,
          sublabel: `${period}Net ${formatUsd(row.net_pay)} · ${row.status}`,
        };
      }),
    [openQuery.data]
  );

  const detailQuery = useQuery({
    queryKey: ["driver-finance", "pre-settlements", "by-driver", companyId, selectedDriverId],
    queryFn: () => getPreSettlementForDriver(String(selectedDriverId), companyId),
    enabled: Boolean(companyId) && Boolean(selectedDriverId),
  });

  const settlementIdForReadout = detailQuery.data?.settlement?.id ?? null;
  // ROUND 443.274-C board — Load·Lane·Delivered·Miles (doc)·Pay from the same tour readout
  // SettlementCloseMiles already used (LDT-5 one engine). Chrome only; no new math.
  const tourReadoutQuery = useQuery({
    queryKey: ["tour-readout", "settlement-close-board", companyId, settlementIdForReadout],
    queryFn: () => getTourReadout(String(settlementIdForReadout), companyId),
    enabled: Boolean(companyId) && Boolean(settlementIdForReadout),
  });

  // 443.288-C — settlement cannot close while any expense on its loads is proposed (ruling §3).
  const loadConfirmQ = useQuery({
    queryKey: ["expense-load-confirmations", "close-gate", companyId, settlementIdForReadout],
    queryFn: () =>
      listExpenseLoadConfirmations(companyId, {
        status: "proposed",
        settlement_id: String(settlementIdForReadout),
        limit: 500,
      }),
    enabled: Boolean(companyId) && Boolean(settlementIdForReadout),
    retry: false,
  });
  const loadConfirmEngineUnavailable =
    loadConfirmQ.error instanceof ExpenseLoadConfirmEngineUnavailableError;
  const proposedExpenseLoadCount = loadConfirmQ.data?.rows?.length ?? 0;
  const loadConfirmBlocksClose =
    Boolean(settlementIdForReadout) &&
    (loadConfirmQ.isLoading || loadConfirmEngineUnavailable || proposedExpenseLoadCount > 0);

  const debtQuery = useQuery({
    queryKey: ["driver-finance", "debt-summary", companyId, selectedDriverId],
    queryFn: () => getDebtSummary(String(selectedDriverId), companyId),
    enabled: Boolean(companyId) && Boolean(selectedDriverId),
  });

  const accountsQuery = useQuery({
    queryKey: ["catalogs", "accounts", "for-settlement-close-preview", companyId],
    queryFn: () => getCoaAccounts(companyId),
    enabled: Boolean(paymentMethodGlAccountId) && Boolean(companyId),
  });
  const paymentMethodGlName = useMemo(() => {
    if (!paymentMethodGlAccountId) return null;
    return (accountsQuery.data?.accounts ?? []).find((a) => a.id === paymentMethodGlAccountId)?.account_name ?? null;
  }, [accountsQuery.data, paymentMethodGlAccountId]);

  const closeMut = useMutation({
    meta: { loads: true },
    mutationFn: async () => {
      const settlementId = String(detailQuery.data?.settlement?.id);
      // Fail closed — closer must confirm proposed expense loads first (443.288 ruling §3).
      if (loadConfirmBlocksClose) {
        throw new Error(
          loadConfirmEngineUnavailable
            ? "Expense load confirm engine is not deployed yet (443.288-B). Close is blocked."
            : `Confirm ${proposedExpenseLoadCount} proposed expense load${proposedExpenseLoadCount === 1 ? "" : "s"} before close.`,
        );
      }
      await settleAndPay(settlementId, companyId);
      // Additive only: unchanged behavior when no payment method is picked (canSubmitClose never
      // required one). When one IS picked, actually post the GL entry through the same poster
      // PayRunClosePanel uses -- see PAYRUN_NEEDS_HUMAN_REVIEW_CODES above for why a refusal here
      // does not roll back or fail the settle that already succeeded.
      if (!paymentMethodId) return { posted: false as const, needsReview: null };
      try {
        await closeSettlementPayRun(settlementId, { operating_company_id: companyId, payment_method_id: paymentMethodId });
        return { posted: true as const, needsReview: null };
      } catch (err) {
        const code = extractPayRunErrorCode(err);
        if (PAYRUN_NEEDS_HUMAN_REVIEW_CODES.has(code)) {
          return { posted: false as const, needsReview: code };
        }
        throw err;
      }
    },
    onSuccess: (outcome) => {
      if (outcome.posted) {
        pushToast("Settlement closed, driver notified, and payment posted to GL", "success");
      } else if (outcome.needsReview) {
        pushToast(
          `Settlement closed and driver notified. GL posting needs review (${outcome.needsReview}) — finish it from Settlement Detail's Pay Run Close panel.`,
          "info"
        );
      } else {
        pushToast("Settlement closed and driver notified", "success");
      }
      setSelectedDriverId(null);
      setWizardStep(1);
      void qc.invalidateQueries({ queryKey: ["driver-finance", "pre-settlements"] });
    },
    onError: (err) => pushToast(err instanceof Error ? err.message : "Close failed", "error"),
  });

  const settlement = detailQuery.data?.settlement ?? null;
  const lines = detailQuery.data?.lines ?? [];

  const gross = Number(settlement?.gross_pay ?? 0);
  const earnings = sumLines(lines, EARNINGS_LINE_TYPES);
  const otherDeductions = lines.filter((l) => DEDUCTION_LINE_TYPES.has(l.line_type));
  const otherDeductionsTotal = sumLines(lines, DEDUCTION_LINE_TYPES);
  const escrowLines = lines.filter((l) => ESCROW_LINE_TYPES.has(l.line_type));
  const escrowContributionThisSettlement = sumLines(lines, ESCROW_LINE_TYPES);
  const advanceRecoveryLines = lines.filter((l) => ADVANCE_RECOVERY_LINE_TYPES.has(l.line_type));
  const advanceRecoveryTotal = sumLines(lines, ADVANCE_RECOVERY_LINE_TYPES);
  const reimbursements = sumLines(lines, REIMBURSEMENT_LINE_TYPES);
  const netPay = Number(settlement?.net_pay ?? 0);

  // Escrow cap indicator: current total escrow balance (pre + post clause, from the shared debt
  // summary) vs the $2,500 owner-locked cap. "$X to cap" = headroom remaining BEFORE this
  // settlement's contribution is added; the closing escrow_contribution line above shows what
  // this settlement adds toward it.
  const currentEscrowTotal = Number(debtQuery.data?.escrow_pre_clause ?? 0) + Number(debtQuery.data?.escrow_post_clause ?? 0);
  const escrowToCap = Math.max(0, ESCROW_CAP_DOLLARS - currentEscrowTotal);
  const escrowCapPct = Math.min(100, Math.max(0, (currentEscrowTotal / ESCROW_CAP_DOLLARS) * 100));

  // maker <> checker: when the backend surfaces who opened/acknowledged this pre-settlement, the
  // Close action is disabled for that same user (mirrors the acknowledge->finalize separation on
  // the periodic settlement flow). Defensive optional read — a safe no-op until that field lands.
  const makerId = String((settlement as unknown as Record<string, unknown> | null)?.acknowledged_by_user_id ?? "");
  const isMaker = Boolean(makerId) && makerId === currentUserId;

  const canSubmitClose =
    canClose &&
    !isMaker &&
    Boolean(settlement) &&
    ["closed", "open"].includes(String(settlement?.status ?? "")) &&
    !loadConfirmBlocksClose;

  const draftJeRows = useMemo<DraftJeRow[]>(() => {
    if (!settlement) return [];
    const rows: DraftJeRow[] = [
      {
        id: "gross",
        account: "Driver pay expense",
        debit: formatUsd(gross || earnings),
        credit: "—",
      },
    ];
    if (escrowContributionThisSettlement !== 0) {
      rows.push({
        id: "escrow",
        account: "Driver escrow liability",
        debit: "—",
        credit: formatUsd(Math.abs(escrowContributionThisSettlement)),
      });
    }
    if (advanceRecoveryTotal !== 0) {
      rows.push({
        id: "advances",
        account: "Driver advances receivable",
        debit: "—",
        credit: formatUsd(Math.abs(advanceRecoveryTotal)),
      });
    }
    if (otherDeductionsTotal !== 0) {
      rows.push({
        id: "other-deductions",
        account: "Other settlement deductions",
        debit: "—",
        credit: formatUsd(Math.abs(otherDeductionsTotal)),
      });
    }
    rows.push({
      id: "cash",
      account: paymentMethodGlName ?? "Cash / bank (select payment method)",
      debit: "—",
      credit: formatUsd(netPay),
    });
    return rows;
  }, [
    settlement,
    gross,
    earnings,
    escrowContributionThisSettlement,
    advanceRecoveryTotal,
    otherDeductionsTotal,
    paymentMethodGlName,
    netPay,
  ]);

  const draftJeColumns = useMemo<ParityColumn<DraftJeRow>[]>(
    () => [
      { key: "account", label: "Account", sortable: true, sortValue: (row) => row.account, render: (row) => row.account },
      {
        key: "debit",
        label: "Debit",
        render: (row) => <span className="tabular-nums">{row.debit}</span>,
      },
      {
        key: "credit",
        label: "Credit",
        render: (row) => <span className="tabular-nums">{row.credit}</span>,
      },
    ],
    [],
  );

  const tourLegs = tourReadoutQuery.data?.legs ?? [];
  const tourBills = tourReadoutQuery.data?.driver_settlement?.driver_bills;
  const unitLabel =
    tourReadoutQuery.data?.tour?.unit_number?.trim() ||
    tourLegs.find((l) => l.unit_number)?.unit_number?.trim() ||
    null;
  const driverBoardName = entityLabel(
    settlement?.driver_name?.trim() ||
      (openQuery.data?.pre_settlements ?? []).find((r) => r.driver_id === settlement?.driver_id)?.driver_name?.trim() ||
      tourReadoutQuery.data?.tour?.driver_name?.trim() ||
      null,
    settlement?.driver_id,
    "Driver",
  );
  const settlementBoardNum = settlement ? settlementLabel(settlement) : "—";
  const grossMilesDoc = tourLegs.reduce((sum, leg) => {
    const bill = (tourBills ?? []).find((b) => b.load_id === leg.load_id);
    const n = bill?.miles_basis ?? leg.miles_practical;
    return sum + (n != null && Number.isFinite(Number(n)) ? Number(n) : 0);
  }, 0);
  const grossPayFromLegs = tourLegs.reduce((sum, leg) => sum + Number(leg.driver_pay_cents ?? 0) / 100, 0);
  const boardGrossPay = settlement ? gross || earnings || grossPayFromLegs : 0;

  const loadBoardRows = useMemo<LoadBoardRow[]>(() => {
    const rows: LoadBoardRow[] = tourLegs.map((leg) => ({
      id: leg.load_id,
      load_id: leg.load_id,
      load_number: leg.load_number,
      lane: leg.lane?.trim() || "—",
      delivered: formatDateUS(leg.delivery_date),
      miles_doc: milesDocForLeg(leg, tourBills),
      pay: Number(leg.driver_pay_cents ?? 0) / 100,
    }));
    if (settlement && (tourLegs.length > 0 || boardGrossPay !== 0)) {
      rows.push({
        id: "__gross__",
        load_id: "",
        load_number: null,
        lane: "",
        delivered: "",
        miles_doc:
          grossMilesDoc > 0
            ? grossMilesDoc.toLocaleString("en-US", { maximumFractionDigits: 1 })
            : "—",
        pay: boardGrossPay,
        is_gross: true,
      });
    }
    return rows;
  }, [tourLegs, tourBills, settlement, boardGrossPay, grossMilesDoc]);

  const loadBoardColumns = useMemo<ParityColumn<LoadBoardRow>[]>(
    () => [
      {
        key: "load",
        label: "Load",
        render: (row) =>
          row.is_gross ? (
            <span className="font-bold">Gross</span>
          ) : (
            <EntityLink kind="load" id={row.load_id} label={entityLabel(row.load_number, row.load_id, "Load")} />
          ),
      },
      { key: "lane", label: "Lane", sortable: true, sortValue: (row) => (row.is_gross ? "" : row.lane), render: (row) => (row.is_gross ? "" : row.lane) },
      { key: "delivered", label: "Delivered", sortable: true, sortValue: (row) => (row.is_gross ? "" : row.delivered), render: (row) => (row.is_gross ? "" : row.delivered) },
      {
        key: "miles",
        label: "Miles (doc)",
        render: (row) => (
          <span className={row.is_gross ? "font-bold tabular-nums" : "tabular-nums"} data-quantity="miles">
            {row.miles_doc}
          </span>
        ),
      },
      {
        key: "pay",
        label: "Pay",
        render: (row) =>
          row.is_gross ? (
            <MoneyCell
              cents={Math.round(row.pay * 100)}
              format={(c) => formatUsd(c / 100)}
              className="font-bold"
              drill={{ entity: { kind: "settlement", id: settlement?.id } }}
            />
          ) : (
            <MoneyCell
              cents={Math.round(row.pay * 100)}
              format={(c) => formatUsd(c / 100)}
              drill={{ entity: { kind: "load", id: row.load_id } }}
            />
          ),
      },
    ],
    [settlement?.id],
  );

  const deductionRows = useMemo<LineBoardRow[]>(
    () =>
      otherDeductions.map((l) => ({
        id: l.id,
        description: l.description || "Deduction",
        amount: Math.abs(Number(l.amount ?? 0)),
      })),
    [otherDeductions],
  );
  const escrowRows = useMemo<LineBoardRow[]>(
    () =>
      escrowLines.map((l) => ({
        id: l.id,
        description: l.description || "Escrow contribution",
        amount: Math.abs(Number(l.amount ?? 0)),
      })),
    [escrowLines],
  );
  const advanceRows = useMemo<LineBoardRow[]>(
    () =>
      advanceRecoveryLines.map((l) => ({
        id: l.id,
        description: l.description || "Advance recovery",
        amount: Math.abs(Number(l.amount ?? 0)),
      })),
    [advanceRecoveryLines],
  );

  const lineColumns = useMemo<ParityColumn<LineBoardRow>[]>(
    () => [
      { key: "description", label: "Description", sortable: true, sortValue: (row) => row.description, render: (row) => row.description },
      {
        key: "amount",
        label: "Amount",
        render: (row) => (
          <MoneyCell
            cents={-Math.round(Math.abs(row.amount) * 100)}
            format={(c) => formatUsd(c / 100)}
            drill={{ entity: { kind: "settlement", id: settlement?.id } }}
          />
        ),
      },
    ],
    [settlement?.id],
  );

  const resultLines = [
    ["Gross", boardGrossPay],
    ["Deductions", Math.abs(otherDeductionsTotal)],
    ["Escrow", Math.abs(escrowContributionThisSettlement)],
    ["Advances recovered", Math.abs(advanceRecoveryTotal)],
    ["Net to driver", netPay],
  ] as const;

  const goBack = () => {
    if (wizardStep > 1) {
      setWizardStep((s) => (s - 1) as CloseWizardStep);
      return;
    }
    setSelectedDriverId(null);
    setWizardStep(1);
  };

  const goNext = () => {
    if (wizardStep < 7) setWizardStep((s) => (s + 1) as CloseWizardStep);
  };

  const selectDriver = (id: string | null) => {
    setSelectedDriverId(id);
    setWizardStep(1);
    setPaymentMethodId(null);
    setPaymentMethodGlAccountId(null);
  };

  const arrivalTitle = settlement
    ? `Driver on arrival · ${driverBoardName}${unitLabel ? ` · ${unitLabel}` : ""} · ${settlementBoardNum}`
    : "Driver on arrival";

  const stepPanel = (() => {
    if (!settlement) {
      return (
        <V3Panel title={arrivalTitle} testId="settlement-close-arrival-panel">
          <p className="text-xs text-gray-600">Select a driver with an open pre-settlement to begin close.</p>
        </V3Panel>
      );
    }

    if (wizardStep === 1) {
      return (
        <V3Panel title={arrivalTitle} testId="settlement-close-arrival-panel">
          <div className="space-y-2 text-xs">
            <div className="font-semibold text-gray-900">
              <EntityLink kind="driver" id={settlement.driver_id} label={driverBoardName} />
              {" — "}
              <EntityLink kind="settlement" id={settlement.id} label={settlementLabel(settlement)} />
            </div>
            <div className="text-gray-600">
              <EntityLink
                kind="load"
                id={settlement.first_load_id ?? ""}
                label={entityLabel(settlement.first_load_number, settlement.first_load_id, "Load")}
              />{" "}
              →{" "}
              <EntityLink
                kind="load"
                id={settlement.last_load_id ?? ""}
                label={entityLabel(settlement.last_load_number, settlement.last_load_id, "Load")}
              />{" "}
              · status: {settlement.status}
            </div>
            <div className="text-gray-500">
              Period: {formatDateUS(settlement.period_start)} – {formatDateUS(settlement.period_end)}
            </div>
            {unitLabel ? <div className="text-gray-600">Unit: {unitLabel}</div> : null}
          </div>
        </V3Panel>
      );
    }

    if (wizardStep === 2 || wizardStep === 3) {
      return (
        <V3Panel title={arrivalTitle} testId="settlement-close-arrival-panel">
          {tourReadoutQuery.isError ? (
            <p className="mb-2 text-xs text-red-600">
              Could not load tour legs.{" "}
              <button type="button" className="underline" onClick={() => void tourReadoutQuery.refetch()}>
                Retry
              </button>
            </p>
          ) : null}
          <ParityTable<LoadBoardRow>
            title={wizardStep === 3 ? "Gross — loads on arrival" : "Loads & miles"}
            columns={loadBoardColumns}
            rows={loadBoardRows}
            rowKey={(row) => row.id}
            loading={tourReadoutQuery.isLoading}
            emptyText="No loads on this open tour."
            storageKey="settlement-close-loads-board"
            exportFilename="settlement-close-loads"
            tableTestId="settlement-close-loads-table"
          />
          {wizardStep === 2 ? (
            <SettlementCloseMiles settlementId={settlement.id} operatingCompanyId={companyId} />
          ) : null}
        </V3Panel>
      );
    }

    if (wizardStep === 4) {
      return (
        <V3Panel title="Deductions" testId="settlement-close-arrival-panel">
          <ParityTable<LineBoardRow>
            title="Other deductions"
            columns={lineColumns}
            rows={deductionRows}
            rowKey={(row) => row.id}
            loading={false}
            emptyText="No deductions on this settlement."
            storageKey="settlement-close-deductions"
            exportFilename="settlement-close-deductions"
            tableTestId="settlement-close-deductions-table"
          />
          <div className="mt-2 flex items-center justify-between border-t border-gray-100 pt-2 text-xs text-gray-600">
            <span>Deductions total</span>
            <MoneyCell
              cents={-Math.round(Math.abs(otherDeductionsTotal) * 100)}
              format={(c) => formatUsd(c / 100)}
              drill={{ entity: { kind: "settlement", id: settlement?.id } }}
            />
          </div>
        </V3Panel>
      );
    }

    if (wizardStep === 5) {
      return (
        <V3Panel title="Escrow" testId="settlement-close-arrival-panel">
          <div className="mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-gray-500">
            <span>Escrow contribution</span>
            <span>Cap {formatUsd(ESCROW_CAP_DOLLARS)}</span>
          </div>
          <ParityTable<LineBoardRow>
            title="Escrow this settlement"
            columns={lineColumns}
            rows={escrowRows}
            rowKey={(row) => row.id}
            loading={false}
            emptyText="No escrow contribution on this settlement."
            storageKey="settlement-close-escrow"
            exportFilename="settlement-close-escrow"
            tableTestId="settlement-close-escrow-table"
          />
          <div className="mt-2 flex items-center justify-between text-xs text-gray-600">
            <span>Contribution this settlement</span>
            <MoneyCell
              cents={Math.round(escrowContributionThisSettlement * 100)}
              format={(c) => formatUsd(c / 100)}
              drill={{ entity: { kind: "settlement", id: settlement?.id } }}
            />
          </div>
          <div className="mt-2">
            <div className="h-2 w-full rounded-sm bg-gray-200">
              <div className="h-2 rounded-sm bg-[#4B5563]" style={{ width: `${escrowCapPct}%` }} />
            </div>
            <div className="mt-1 flex items-center justify-between text-xs text-gray-600">
              <span>Current escrow balance: {formatUsd(currentEscrowTotal)}</span>
              <span className={escrowToCap === 0 ? "font-semibold text-[#1F2A44]" : ""}>
                {escrowToCap === 0 ? "At cap" : `${formatUsd(escrowToCap)} to cap`}
              </span>
            </div>
          </div>
          {((debtQuery.data?.source_liabilities as Array<{ id?: unknown; type?: unknown }> | undefined) ?? []).length >
          0 ? (
            <div className="mt-2 flex flex-wrap items-center gap-1 border-t border-gray-100 pt-1 text-xs text-gray-600">
              <span>Open liabilities:</span>
              {(debtQuery.data?.source_liabilities as Array<{ id?: unknown; type?: unknown }>).map((liability, idx) => {
                const id = String(liability.id ?? "");
                if (!id) return null;
                return (
                  <EntityLink
                    key={id}
                    kind="liability"
                    id={id}
                    label={entityLabel(String(liability.type ?? "Liability"), id, `#${idx + 1}`)}
                    className="text-red-600 hover:underline"
                  />
                );
              })}
            </div>
          ) : null}
        </V3Panel>
      );
    }

    if (wizardStep === 6) {
      return (
        <V3Panel title="Advances" testId="settlement-close-arrival-panel">
          <ParityTable<LineBoardRow>
            title="Advance recoveries"
            columns={lineColumns}
            rows={advanceRows}
            rowKey={(row) => row.id}
            loading={false}
            emptyText="No advance recovery on this settlement."
            storageKey="settlement-close-advances"
            exportFilename="settlement-close-advances"
            tableTestId="settlement-close-advances-table"
          />
          <div className="mt-2 flex items-center justify-between text-xs text-gray-600">
            <span>Total active debt (all liabilities)</span>
            <MoneyCell
              cents={Math.round(Number(debtQuery.data?.total_active_debt ?? 0) * 100)}
              format={(c) => formatUsd(c / 100)}
              drill={{ entity: { kind: "settlement", id: settlement?.id } }}
            />
          </div>
        </V3Panel>
      );
    }

    // Step 7 — Net & pay (PaymentMethodPicker + draft JE + Close). Board lacks a second form under
    // the stepper; this is the only close action surface.
    return (
      <V3Panel title="Net & pay" testId="settlement-close-arrival-panel">
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs font-semibold text-gray-900">
            <span>NET PAY</span>
            <MoneyCell
              cents={Math.round(netPay * 100)}
              format={(c) => formatUsd(c / 100)}
              className="font-semibold"
              drill={{ entity: { kind: "settlement", id: settlement?.id } }}
            />
          </div>
          {reimbursements !== 0 ? (
            <div className="flex items-center justify-between text-xs text-gray-700">
              <span>Reimbursements</span>
              <MoneyCell
                cents={Math.round(reimbursements * 100)}
                format={(c) => formatUsd(c / 100)}
                drill={{ entity: { kind: "settlement", id: settlement?.id } }}
              />
            </div>
          ) : null}
          <div>
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Payment method</div>
            <div className="max-w-sm">
              <PaymentMethodPicker
                operatingCompanyId={companyId}
                value={paymentMethodId}
                onChange={(id, glAccountId) => {
                  setPaymentMethodId(id);
                  setPaymentMethodGlAccountId(glAccountId);
                }}
              />
            </div>
          </div>
          <ParityTable<DraftJeRow>
            title="Draft JE preview — not posted"
            titleInfo={
              <InfoPopover label="About the draft JE preview">
                <span className="block">
                  Preview only — computed client-side from this settlement&apos;s lines for review before Close. Actual GL
                  posting reuses the existing settlement posting path (behind SETTLEMENT_GL_POSTING_ENABLED).
                </span>
              </InfoPopover>
            }
            columns={draftJeColumns}
            rows={draftJeRows}
            rowKey={(row) => row.id}
            loading={false}
            emptyText="No draft JE lines for this settlement."
            storageKey="settlement-close-draft-je"
            exportFilename="settlement-close-draft-je"
            tableTestId="settlement-close-draft-je-table"
          />
          <div className="flex items-center justify-end gap-2 border-t border-gray-200 pt-3">
            {!canClose ? <span className="text-xs text-gray-500">Your role cannot close settlements.</span> : null}
            {isMaker ? (
              <span className="text-xs text-[#1F2A44]">
                You opened this settlement — a different approver must close it (maker ≠ checker).
              </span>
            ) : null}
            <Button
              disabled={!canSubmitClose || closeMut.isPending}
              loading={closeMut.isPending}
              onClick={() => closeMut.mutate()}
              title={isMaker ? "Maker ≠ checker — a different user must close this settlement." : undefined}
              data-testid="settlement-close-submit"
            >
              Close settlement
            </Button>
          </div>
        </div>
      </V3Panel>
    );
  })();

  return (
    <div className="space-y-3" data-settlement-close-v3="1">
      <PageHeader
        title="Settlement Close — Driver Arrival"
        subtitle="Close ONE driver's settlement on arrival: gross, deductions, escrow, advances, net"
      />

      <NavyPageSubNav items={[...SETTLEMENTS_SUBNAV]} />

      {/* ROUND 443.280-A — board has no 6-tile KPI strip; Result panel carries the live totals. */}

      <div
        data-testid="settlement-close-v3-steps"
        data-settlement-close-v3-steps="1"
        style={{
          display: "flex",
          border: `1px solid ${V3.border}`,
          borderRadius: 2,
          background: V3.surface,
          overflow: "hidden",
        }}
      >
        {CLOSE_BOARD_STEPS.map((step, idx) => {
          const on = step.n === wizardStep;
          const reachable = Boolean(settlement) || step.n === 1;
          return (
            <button
              key={step.n}
              type="button"
              disabled={!reachable}
              onClick={() => reachable && setWizardStep(step.n)}
              data-testid={`settlement-close-step-${step.n}`}
              data-active={on ? "1" : "0"}
              style={{
                flex: 1,
                padding: "10px 12px",
                borderRight: idx < CLOSE_BOARD_STEPS.length - 1 ? `1px solid ${V3.borderSoft}` : undefined,
                background: on ? V3.shell : V3.surface,
                color: on ? V3.onShell : V3.ink,
                textAlign: "left",
                cursor: reachable ? "pointer" : "not-allowed",
                opacity: reachable ? 1 : 0.5,
              }}
            >
              <div style={{ font: `600 10px ${V3.font}`, opacity: 0.7 }}>STEP {step.n}</div>
              <div style={{ font: `700 12px ${V3.font}` }}>{step.label}</div>
            </button>
          );
        })}
      </div>

      {!companyId ? (
        <p className="text-xs text-gray-600">Select an operating company first.</p>
      ) : (
        <div className="space-y-3" data-testid="settlement-close-panel">
          <label className="block max-w-xl">
            <span className="flex items-center gap-1 text-xs font-medium text-gray-600">
              Driver with an open pre-settlement (on arrival)
              <InfoPopover label="About the driver picker">
                <span className="block">
                  Open pre-settlements only (names from open-by-driver join). Nested +Create driver stays wired for
                  picker law; a new driver appears here after their first pre-settlement exists.
                </span>
              </InfoPopover>
            </span>
            <div className="mt-1">
              <Combobox
                options={openOptions}
                value={selectedDriverId}
                onChange={selectDriver}
                placeholder="Select driver with open pre-settlement"
                loading={openQuery.isLoading}
                allowClear
                allowAddNew={{
                  label: "+ Create driver",
                  onAdd: () => setDriverCreateOpen(true),
                }}
              />
            </div>
          </label>

          {selectedDriverId && detailQuery.isLoading ? <p className="text-xs text-gray-600">Loading settlement…</p> : null}
          {selectedDriverId && detailQuery.isError ? (
            <p className="text-xs text-red-600">No active pre-settlement found for this driver.</p>
          ) : null}

          {/* ROUND 443.280-A board — 2fr|1fr step body | Result. No layered form under the board. */}
          <div
            style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12, alignItems: "start" }}
            data-settlement-close-v3-board="1"
            data-testid="settlement-close-v3-board"
          >
            {stepPanel}

            <V3Panel title="Result" testId="settlement-close-result-panel">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <Button type="button" variant="secondary" onClick={goBack} data-testid="settlement-close-back">
                  Back
                </Button>
                {wizardStep < 7 ? (
                  <Button
                    type="button"
                    onClick={goNext}
                    disabled={!settlement}
                    data-testid="settlement-close-next"
                  >
                    {nextStepLabel(wizardStep)}
                  </Button>
                ) : (
                  <Button
                    type="button"
                    disabled={!canSubmitClose || closeMut.isPending}
                    loading={closeMut.isPending}
                    onClick={() => closeMut.mutate()}
                    data-testid="settlement-close-next-close"
                  >
                    Close settlement
                  </Button>
                )}
              </div>
              <div className="space-y-0" data-testid="settlement-close-result-table">
                <div
                  className="grid grid-cols-2 gap-2 px-3 py-1.5 text-section-header font-semibold uppercase tracking-wide text-[#4B5563]"
                  style={{ background: V3.page, borderBottom: `1px solid ${V3.border}` }}
                >
                  <span>Line</span>
                  <span className="text-right">Amount</span>
                </div>
                {resultLines.map(([label, amount]) => (
                  <div
                    key={label}
                    className="grid grid-cols-2 gap-2 px-3 py-1.5 text-xs"
                    style={{ borderBottom: `1px solid ${V3.borderSoft}` }}
                  >
                    <span>{label}</span>
                    <MoneyCell
                      cents={settlement ? Math.round(Number(amount) * 100) : null}
                      format={(c) => formatUsd(c / 100)}
                      drill={{ entity: { kind: "settlement", id: settlement?.id } }}
                    />
                  </div>
                ))}
              </div>
            </V3Panel>
          </div>

          {settlement ? (
            <div
              data-testid="settlement-close-expense-load-confirmations"
              data-blocks-close={loadConfirmBlocksClose ? "1" : "0"}
              style={{
                border: `1px solid ${loadConfirmBlocksClose ? "#DC2626" : V3.border}`,
                borderRadius: 2,
                background: V3.surface,
                padding: 12,
              }}
            >
              <p className="mb-2 text-xs text-[#4B5563]">
                Blocking before close — confirm every proposed expense-to-load assignment on this
                settlement&apos;s loads. Empty means confirmed.
              </p>
              {loadConfirmEngineUnavailable ? (
                <p className="text-xs text-red-700" data-testid="settlement-close-load-confirm-engine-missing">
                  Confirm engine not on this deploy yet (443.288-B). Close stays blocked until the
                  engine is live — empty is not confirmed while the engine is missing.
                </p>
              ) : null}
              {!loadConfirmEngineUnavailable ? (
                <ExpenseLoadConfirmationsBoard
                  operatingCompanyId={companyId}
                  settlementId={settlement.id}
                  defaultStatus="proposed"
                  compact
                  testId="settlement-close-expense-load-confirmations-board"
                  onQueueChanged={() => {
                    void qc.invalidateQueries({
                      queryKey: ["expense-load-confirmations", "close-gate", companyId, settlement.id],
                    });
                  }}
                />
              ) : null}
            </div>
          ) : null}
        </div>
      )}
      <CreateDriverModal
        open={driverCreateOpen}
        companyId={companyId}
        onClose={() => setDriverCreateOpen(false)}
        onCreated={(createdId) => {
          selectDriver(createdId);
          setDriverCreateOpen(false);
        }}
      />
    </div>
  );
}

/** 443.269-A item 5 — the settlement's tour legs (one readout) → the shared miles panel. Reads only. */
function SettlementCloseMiles({ settlementId, operatingCompanyId }: { settlementId: string; operatingCompanyId: string }) {
  const readout = useQuery({
    queryKey: ["tour-readout", "settlement", operatingCompanyId, settlementId],
    queryFn: () => getTourReadout(settlementId, operatingCompanyId),
    enabled: Boolean(settlementId && operatingCompanyId),
  });
  if (readout.isError) {
    return (
      <div className="border-t border-gray-100 pt-2 text-xs text-red-700" data-testid="settlement-close-miles-error">
        Could not load this settlement&apos;s miles.{" "}
        <button type="button" className="underline" onClick={() => void readout.refetch()}>
          Retry
        </button>
      </div>
    );
  }
  const legs = readout.data?.legs ?? [];
  if (!legs.length) return null;
  return (
    <div className="border-t border-gray-100 pt-2" data-testid="settlement-close-miles">
      <div className="mb-1 text-xs font-semibold text-gray-900">Miles — our database · Google · real driven</div>
      <TourMilesPanel legs={legs} operatingCompanyId={operatingCompanyId} />
    </div>
  );
}
