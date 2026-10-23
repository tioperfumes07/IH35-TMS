import { TourMilesPanel } from "../../components/dispatch/TourMilesPanel";
import { getTourReadout, type TourLeg } from "../../api/tourReadout";
import { entityLabel } from "../../lib/entity-label";
import { useSearchParams } from "react-router-dom";
import { settlementLabel } from "../../lib/settlementNumber";
import { useMemo, useState } from "react";
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
import { useAuth } from "../../auth/useAuth";
import { Button } from "../../components/Button";
import { Combobox } from "../../components/Combobox";
import { CreateDriverModal } from "../../components/drivers/CreateDriverModal";
import { PageHeader } from "../../components/layout/PageHeader";
import { NavyPageSubNav } from "../../components/layout/NavyPageSubNav";
import { PaymentMethodPicker } from "../../components/driver-finance/PaymentMethodPicker";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { V3KpiTile } from "../../components/v3/V3KpiTile";
import { V3Panel } from "../../components/v3/V3Panel";
import { useToast } from "../../components/Toast";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { EntityLink } from "../../components/shared/EntityLink";
import { V3 } from "../../design/v3-tokens";
import { formatUsd, QBO_MONEY_CELL_CLASS } from "../../lib/money";
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

/** Board chrome only (ROUND 443.250 Settlements-Close.dc.html) — not a multi-step engine. */
const CLOSE_BOARD_STEPS = [
  { n: 1, label: "Driver" },
  { n: 2, label: "Loads & miles" },
  { n: 3, label: "Gross" },
  { n: 4, label: "Deductions" },
  { n: 5, label: "Escrow" },
  { n: 6, label: "Advances" },
  { n: 7, label: "Net & pay" },
] as const;

type DraftJeRow = { id: string; account: string; debit: string; credit: string };

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

export function SettlementCloseArrivalPage() {
  const { selectedCompanyId } = useCompanyContext();
  const { user } = useAuth();
  const { pushToast } = useToast();
  const qc = useQueryClient();
  const companyId = selectedCompanyId ?? "";
  const role = String(user?.role ?? "");
  const currentUserId = String(user?.uuid ?? "");
  const canClose = CLOSE_ROLES.has(role);

  // LEAD 443.269-A 3b: "Close tour → Settlement" on a pre-settlement opens this page for THAT driver (?driver_id=).
  const [closeSearchParams] = useSearchParams();
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(() => closeSearchParams.get("driver_id"));
  const [paymentMethodId, setPaymentMethodId] = useState<string | null>(null);
  const [paymentMethodGlAccountId, setPaymentMethodGlAccountId] = useState<string | null>(null);
  const [driverCreateOpen, setDriverCreateOpen] = useState(false);

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
  // summary) vs the $2,000 owner-locked cap. "$X to cap" = headroom remaining BEFORE this
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
    canClose && !isMaker && Boolean(settlement) && ["closed", "open"].includes(String(settlement?.status ?? ""));

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
      { key: "account", label: "Account", render: (row) => row.account },
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

  const openDriverCount = openQuery.data?.pre_settlements?.length ?? 0;
  const moneyOrDash = (n: number) => (settlement ? formatUsd(n) : "—");
  // Presentation highlight only (board Settlements-Close.dc.html shows STEP 3 Gross when the
  // loads table + Result are on screen). Does not gate Close or change posting.
  const activeStep = settlement ? 3 : 1;

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

  return (
    <div className="space-y-3" data-settlement-close-v3="1">
      <PageHeader title="Settlement Close — Driver Arrival" subtitle="Close ONE driver's settlement on arrival: gross, deductions, escrow, advances, net" />

      <NavyPageSubNav items={[...SETTLEMENTS_SUBNAV]} />

      {/* ROUND 443.250 V3 board (Settlements-Close.dc.html) — Result strip + 7-step chrome.
          Money values are the same settlement / line totals already computed for Close; Open
          drivers counts listOpenPreSettlementsByDriver. No new query math. */}
      <div
        style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(120px,1fr))", gap: 8 }}
        data-testid="settlement-close-v3-kpis"
        data-settlement-close-v3-kpis="1"
      >
        <V3KpiTile
          label="Open drivers"
          value={openQuery.isError ? "—" : String(openDriverCount)}
          sub="open pre-settlements on arrival"
          testId="settlement-close-kpi-open-drivers"
        />
        <V3KpiTile
          label="Gross"
          value={moneyOrDash(gross || earnings)}
          sub="settlement gross / earnings"
          testId="settlement-close-kpi-gross"
        />
        <V3KpiTile
          label="Deductions"
          value={moneyOrDash(Math.abs(otherDeductionsTotal))}
          sub="other deductions total"
          testId="settlement-close-kpi-deductions"
        />
        <V3KpiTile
          label="Escrow"
          value={moneyOrDash(Math.abs(escrowContributionThisSettlement))}
          sub="contribution this settlement"
          testId="settlement-close-kpi-escrow"
        />
        <V3KpiTile
          label="Advances recovered"
          value={moneyOrDash(Math.abs(advanceRecoveryTotal))}
          sub="advance recovery lines"
          testId="settlement-close-kpi-advances"
        />
        <V3KpiTile
          label="Net to driver"
          value={moneyOrDash(netPay)}
          sub="settlement net pay"
          testId="settlement-close-kpi-net"
        />
      </div>

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
          const on = step.n === activeStep;
          return (
            <div
              key={step.n}
              style={{
                flex: 1,
                padding: "10px 12px",
                borderRight: idx < CLOSE_BOARD_STEPS.length - 1 ? `1px solid ${V3.borderSoft}` : undefined,
                background: on ? V3.shell : V3.surface,
                color: on ? V3.onShell : V3.ink,
              }}
            >
              <div style={{ font: `600 10px ${V3.font}`, opacity: 0.7 }}>STEP {step.n}</div>
              <div style={{ font: `700 12px ${V3.font}` }}>{step.label}</div>
            </div>
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
                  Open pre-settlements only (names from open-by-driver join). Nested +Create driver stays
                  wired for picker law; a new driver appears here after their first pre-settlement exists.
                </span>
              </InfoPopover>
            </span>
            <div className="mt-1">
              <Combobox
                options={openOptions}
                value={selectedDriverId}
                onChange={setSelectedDriverId}
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
          {selectedDriverId && detailQuery.isError ? <p className="text-xs text-red-600">No active pre-settlement found for this driver.</p> : null}

          {settlement ? (
            <>
              {/* ROUND 443.274-C Settlements-Close.dc.html — 2fr|1fr Driver on arrival | Result */}
              <div
                style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12, alignItems: "start" }}
                data-settlement-close-v3-board="1"
                data-testid="settlement-close-v3-board"
              >
                <V3Panel
                  title={`Driver on arrival · ${driverBoardName}${unitLabel ? ` · ${unitLabel}` : ""} · ${settlementBoardNum}`}
                  testId="settlement-close-arrival-panel"
                >
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-xs" data-testid="settlement-close-loads-table">
                      <thead>
                        <tr style={{ background: V3.page }}>
                          {["Load", "Lane", "Delivered", "Miles (doc)", "Pay"].map((h) => (
                            <th
                              key={h}
                              className="whitespace-nowrap px-3 py-1.5 text-left font-semibold uppercase tracking-wide text-[#4B5563]"
                              style={{
                                fontSize: 11,
                                borderBottom: `1px solid ${V3.border}`,
                                textAlign: h === "Miles (doc)" || h === "Pay" ? "right" : "left",
                              }}
                            >
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {tourReadoutQuery.isLoading ? (
                          <tr>
                            <td colSpan={5} className="px-3 py-2 text-gray-500">
                              Loading loads…
                            </td>
                          </tr>
                        ) : null}
                        {tourReadoutQuery.isError ? (
                          <tr>
                            <td colSpan={5} className="px-3 py-2 text-red-600">
                              Could not load tour legs.{" "}
                              <button type="button" className="underline" onClick={() => void tourReadoutQuery.refetch()}>
                                Retry
                              </button>
                            </td>
                          </tr>
                        ) : null}
                        {!tourReadoutQuery.isLoading && !tourReadoutQuery.isError && tourLegs.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="px-3 py-2 text-gray-500">
                              No loads on this open tour.
                            </td>
                          </tr>
                        ) : null}
                        {tourLegs.map((leg) => (
                          <tr key={leg.load_id}>
                            <td className="whitespace-nowrap px-3 py-1.5" style={{ borderBottom: `1px solid ${V3.borderSoft}` }}>
                              <EntityLink
                                kind="load"
                                id={leg.load_id}
                                label={entityLabel(leg.load_number, leg.load_id, "Load")}
                              />
                            </td>
                            <td className="whitespace-nowrap px-3 py-1.5" style={{ borderBottom: `1px solid ${V3.borderSoft}` }}>
                              {leg.lane?.trim() || "—"}
                            </td>
                            <td className="whitespace-nowrap px-3 py-1.5" style={{ borderBottom: `1px solid ${V3.borderSoft}` }}>
                              {formatDateUS(leg.delivery_date)}
                            </td>
                            <td
                              className={`${QBO_MONEY_CELL_CLASS} whitespace-nowrap px-3 py-1.5`}
                              style={{ borderBottom: `1px solid ${V3.borderSoft}`, textAlign: "right" }}
                            >
                              {milesDocForLeg(leg, tourBills)}
                            </td>
                            <td
                              className={`${QBO_MONEY_CELL_CLASS} whitespace-nowrap px-3 py-1.5`}
                              style={{ borderBottom: `1px solid ${V3.borderSoft}`, textAlign: "right" }}
                            >
                              {formatUsd(Number(leg.driver_pay_cents ?? 0) / 100)}
                            </td>
                          </tr>
                        ))}
                        <tr style={{ background: V3.page }}>
                          <td className="px-3 py-2 font-bold" style={{ borderTop: `1px solid ${V3.border}` }}>
                            Gross
                          </td>
                          <td style={{ borderTop: `1px solid ${V3.border}` }} />
                          <td style={{ borderTop: `1px solid ${V3.border}` }} />
                          <td
                            className={`${QBO_MONEY_CELL_CLASS} px-3 py-2 font-bold`}
                            style={{ borderTop: `1px solid ${V3.border}`, textAlign: "right" }}
                          >
                            {grossMilesDoc > 0
                              ? grossMilesDoc.toLocaleString("en-US", { maximumFractionDigits: 1 })
                              : "—"}
                          </td>
                          <td
                            className={`${QBO_MONEY_CELL_CLASS} px-3 py-2 font-bold`}
                            style={{ borderTop: `1px solid ${V3.border}`, textAlign: "right" }}
                          >
                            {formatUsd(boardGrossPay)}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </V3Panel>

                <V3Panel title="Result" testId="settlement-close-result-panel">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <Button type="button" variant="secondary" onClick={() => setSelectedDriverId(null)}>
                      Back
                    </Button>
                    <span
                      className="inline-flex h-7 items-center rounded-sm px-3 text-xs font-semibold text-white"
                      style={{ background: V3.shell }}
                      data-testid="settlement-close-next-deductions"
                    >
                      Next: Deductions
                    </span>
                  </div>
                  <table className="w-full border-collapse text-xs" data-testid="settlement-close-result-table">
                    <thead>
                      <tr style={{ background: V3.page }}>
                        <th
                          className="px-3 py-1.5 text-left font-semibold uppercase tracking-wide text-[#4B5563]"
                          style={{ fontSize: 11, borderBottom: `1px solid ${V3.border}` }}
                        >
                          Line
                        </th>
                        <th
                          className="px-3 py-1.5 text-right font-semibold uppercase tracking-wide text-[#4B5563]"
                          style={{ fontSize: 11, borderBottom: `1px solid ${V3.border}` }}
                        >
                          Amount
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {(
                        [
                          ["Gross", boardGrossPay],
                          ["Deductions", Math.abs(otherDeductionsTotal)],
                          ["Escrow", Math.abs(escrowContributionThisSettlement)],
                          ["Advances recovered", Math.abs(advanceRecoveryTotal)],
                          ["Net to driver", netPay],
                        ] as const
                      ).map(([label, amount]) => (
                        <tr key={label}>
                          <td className="px-3 py-1.5" style={{ borderBottom: `1px solid ${V3.borderSoft}` }}>
                            {label}
                          </td>
                          <td
                            className={`${QBO_MONEY_CELL_CLASS} px-3 py-1.5`}
                            style={{ borderBottom: `1px solid ${V3.borderSoft}`, textAlign: "right" }}
                          >
                            {formatUsd(amount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </V3Panel>
              </div>

              <V3Panel
                title="Settlement close"
                subtitle="Driver arrival · gross · deductions · escrow · advances · net & pay"
                testId="settlement-close-detail-panel"
              >
              <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-xs font-semibold text-gray-900">
                    <EntityLink kind="driver" id={settlement.driver_id} label={driverBoardName} />{" "}
                    —{" "}
                    <EntityLink
                      kind="settlement"
                      id={settlement.id}
                      label={settlementBoardNum}
                    />
                  </div>
                  <div className="text-xs text-gray-600">
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
                  {/* COL-06: period_start/period_end were already on this detail payload
                      (pre-settlement.routes.ts by-driver already selects both) -- just never
                      rendered on the close/arrival detail. */}
                  <div className="text-xs text-gray-500">
                    Period: {formatDateUS(settlement.period_start)} – {formatDateUS(settlement.period_end)}
                  </div>
                </div>
              </div>

              {/* LEAD 443.269-A item 5 (owner: miles everywhere) — the tour's miles from OUR database (lane history) and
                  Google shortest / practical, real driven, and which one the bill uses: the same panel as Pre-Settlement. */}
              <SettlementCloseMiles settlementId={settlement.id} operatingCompanyId={companyId} />

              {/* Gross / earnings */}
              <div className="border-t border-gray-100 pt-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-gray-900">Gross pay</span>
                  <span className="font-semibold text-gray-900">{formatUsd(gross || earnings)}</span>
                </div>
              </div>

              {/* Deductions */}
              <div className="border-t border-gray-100 pt-2">
                <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Deductions</div>
                {otherDeductions.length === 0 ? (
                  <p className="text-xs text-gray-500">No deductions on this settlement.</p>
                ) : (
                  otherDeductions.map((l) => (
                    <div key={l.id} className="flex items-center justify-between text-xs text-gray-700">
                      <span>{l.description}</span>
                      <span>-{formatUsd(Math.abs(l.amount))}</span>
                    </div>
                  ))
                )}
                <div className="mt-1 flex items-center justify-between border-t border-gray-100 pt-1 text-xs text-gray-600">
                  <span>Deductions total</span>
                  <span>-{formatUsd(Math.abs(otherDeductionsTotal))}</span>
                </div>
              </div>

              {/* Escrow contribution + cap indicator */}
              <div className="border-t border-gray-100 pt-2">
                <div className="mb-1 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-gray-500">
                  <span>Escrow contribution</span>
                  <span>Cap {formatUsd(ESCROW_CAP_DOLLARS)}</span>
                </div>
                {escrowLines.length === 0 ? (
                  <p className="text-xs text-gray-500">No escrow contribution on this settlement.</p>
                ) : (
                  escrowLines.map((l) => (
                    <div key={l.id} className="flex items-center justify-between text-xs text-gray-700">
                      <span>{l.description}</span>
                      <span>-{formatUsd(Math.abs(l.amount))}</span>
                    </div>
                  ))
                )}
                <div className="mt-1 flex items-center justify-between text-xs text-gray-600">
                  <span>Contribution this settlement</span>
                  <span>{formatUsd(escrowContributionThisSettlement)}</span>
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
                {/* LINK-F5187: debtQuery already fetches the driver's real open driver_finance.driver_liabilities
                    rows (source_liabilities) to compute currentEscrowTotal above -- they were discarded after
                    the sum, leaving no way to drill from this close screen to what the escrow balance is made of. */}
                {((debtQuery.data?.source_liabilities as Array<{ id?: unknown; type?: unknown; current_balance?: unknown }> | undefined) ?? []).length > 0 ? (
                  <div className="mt-2 flex flex-wrap items-center gap-1 border-t border-gray-100 pt-1 text-xs text-gray-600">
                    <span>Open liabilities:</span>
                    {(debtQuery.data?.source_liabilities as Array<{ id?: unknown; type?: unknown; current_balance?: unknown }>).map((liability, idx) => {
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
              </div>

              {/* Advance recoveries */}
              <div className="border-t border-gray-100 pt-2">
                <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Advance recoveries</div>
                {advanceRecoveryLines.length === 0 ? (
                  <p className="text-xs text-gray-500">No advance recovery on this settlement.</p>
                ) : (
                  advanceRecoveryLines.map((l) => (
                    <div key={l.id} className="flex items-center justify-between text-xs text-gray-700">
                      <span>{l.description}</span>
                      <span>-{formatUsd(Math.abs(l.amount))}</span>
                    </div>
                  ))
                )}
                <div className="mt-1 flex items-center justify-between text-xs text-gray-600">
                  <span>Total active debt (all liabilities)</span>
                  <span>{formatUsd(debtQuery.data?.total_active_debt ?? 0)}</span>
                </div>
              </div>

              {/* Reimbursements */}
              {reimbursements !== 0 ? (
                <div className="border-t border-gray-100 pt-2">
                  <div className="flex items-center justify-between text-xs text-gray-700">
                    <span>Reimbursements</span>
                    <span>{formatUsd(reimbursements)}</span>
                  </div>
                </div>
              ) : null}

              {/* NET */}
              <div className="border-t border-gray-200 pt-2">
                <div className="flex items-center justify-between text-xs font-semibold text-gray-900">
                  <span>NET PAY</span>
                  <span>{formatUsd(netPay)}</span>
                </div>
              </div>

              {/* Payment method */}
              <div className="border-t border-gray-100 pt-2">
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

              {/* Draft JE preview — SETL-F3552: ParityTable owns Search+Range+gear (raw HTML table skipped surface bar). */}
              <div className="border-t border-gray-100 pt-2">
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
              </div>

              {/* Close action */}
              <div className="flex items-center justify-end gap-2 border-t border-gray-200 pt-3">
                {!canClose ? <span className="text-xs text-gray-500">Your role cannot close settlements.</span> : null}
                {isMaker ? (
                  <span className="text-xs text-[#1F2A44]">You opened this settlement — a different approver must close it (maker ≠ checker).</span>
                ) : null}
                <Button
                  disabled={!canSubmitClose || closeMut.isPending}
                  loading={closeMut.isPending}
                  onClick={() => closeMut.mutate()}
                  title={isMaker ? "Maker ≠ checker — a different user must close this settlement." : undefined}
                >
                  Close settlement
                </Button>
              </div>
            </div>
              </V3Panel>
            </>
          ) : null}
        </div>
      )}
      <CreateDriverModal
        open={driverCreateOpen}
        companyId={companyId}
        onClose={() => setDriverCreateOpen(false)}
        onCreated={(createdId) => {
          setSelectedDriverId(createdId);
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
