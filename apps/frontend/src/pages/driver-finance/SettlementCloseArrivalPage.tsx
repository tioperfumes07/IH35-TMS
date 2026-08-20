import { entityLabel } from "../../lib/entity-label";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getDebtSummary,
  getPreSettlementForDriver,
  listOpenPreSettlements,
  settleAndPay,
  type PreSettlementLine,
} from "../../api/driverFinance";
import { getCoaAccounts } from "../../api/banking";
import { useAuth } from "../../auth/useAuth";
import { Button } from "../../components/Button";
import { Combobox } from "../../components/Combobox";
import { CreateDriverModal } from "../../components/drivers/CreateDriverModal";
import { PageHeader } from "../../components/layout/PageHeader";
import { NavyPageSubNav } from "../../components/layout/NavyPageSubNav";
import { PaymentMethodPicker } from "../../components/driver-finance/PaymentMethodPicker";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { useToast } from "../../components/Toast";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { EntityLink } from "../../components/shared/EntityLink";
import { formatUsd } from "../../lib/money";

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

  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);
  const [paymentMethodId, setPaymentMethodId] = useState<string | null>(null);
  const [paymentMethodGlAccountId, setPaymentMethodGlAccountId] = useState<string | null>(null);
  const [driverCreateOpen, setDriverCreateOpen] = useState(false);

  const openQuery = useQuery({
    queryKey: ["driver-finance", "pre-settlements", "open-by-driver", companyId],
    queryFn: () => listOpenPreSettlements(companyId),
    enabled: Boolean(companyId),
  });

  const openOptions = useMemo(
    () =>
      (openQuery.data?.pre_settlements ?? []).map((row) => {
        const name = entityLabel((row.driver_name ?? "").trim() || null, row.driver_id, "Driver");
        return {
          value: row.driver_id,
          label: `${name} — ${entityLabel(row.settlement_number, row.settlement_id, "Settlement")}`,
          sublabel: `Net ${formatUsd(row.net_pay)} · ${row.status}`,
        };
      }),
    [openQuery.data]
  );

  const detailQuery = useQuery({
    queryKey: ["driver-finance", "pre-settlements", "by-driver", companyId, selectedDriverId],
    queryFn: () => getPreSettlementForDriver(String(selectedDriverId), companyId),
    enabled: Boolean(companyId) && Boolean(selectedDriverId),
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
    mutationFn: () => settleAndPay(String(detailQuery.data?.settlement.id), companyId),
    onSuccess: () => {
      pushToast("Settlement closed and driver notified", "success");
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

  return (
    <div className="space-y-4">
      <PageHeader title="Settlement Close — Driver Arrival" subtitle="Close ONE driver's settlement on arrival: gross, deductions, escrow, advances, net" />

      <NavyPageSubNav
        items={[
          { label: "Pre-Settlements", to: "/drivers/pre-settlements" },
          { label: "Settlements", to: "/driver-finance/settlements" },
          { label: "Cash Advance Requests", to: "/driver-finance/cash-advance-requests" },
          { label: "Settlement Close", to: "/driver-finance/settlement-close" },
          { label: "Escrow", to: "/accounting/escrow" },
        ]}
      />

      {!companyId ? (
        <p className="text-sm text-gray-600">Select an operating company first.</p>
      ) : (
        <>
          <label className="block max-w-xl">
            <span className="text-xs font-medium text-gray-600">Driver with an open pre-settlement (on arrival)</span>
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
            <p className="mt-1 text-[11px] text-slate-600">
              Open pre-settlements only (names from open-by-driver join). Nested +Create driver stays
              wired for picker law; a new driver appears here after their first pre-settlement exists.
            </p>
          </label>

          {selectedDriverId && detailQuery.isLoading ? <p className="text-sm text-gray-600">Loading settlement…</p> : null}
          {selectedDriverId && detailQuery.isError ? <p className="text-sm text-red-600">No active pre-settlement found for this driver.</p> : null}

          {settlement ? (
            <div className="space-y-4 border-t border-gray-200 pt-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold text-gray-900">
                    <EntityLink
                      kind="driver"
                      id={settlement.driver_id}
                      label={entityLabel(
                        settlement.driver_name?.trim() ||
                          (openQuery.data?.pre_settlements ?? []).find((r) => r.driver_id === settlement.driver_id)?.driver_name?.trim() ||
                          null,
                        settlement.driver_id,
                        "Driver",
                      )}
                    />{" "}
                    —{" "}
                    <EntityLink
                      kind="settlement"
                      id={settlement.id}
                      label={entityLabel(settlement.display_id, settlement.id, "Settlement")}
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
                </div>
              </div>

              {/* Gross / earnings */}
              <div className="border-t border-gray-100 pt-2">
                <div className="flex items-center justify-between text-sm">
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
                    <div key={l.id} className="flex items-center justify-between text-sm text-gray-700">
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
                    <div key={l.id} className="flex items-center justify-between text-sm text-gray-700">
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
                    <div className="h-2 rounded-sm bg-slate-600" style={{ width: `${escrowCapPct}%` }} />
                  </div>
                  <div className="mt-1 flex items-center justify-between text-[11px] text-gray-600">
                    <span>Current escrow balance: {formatUsd(currentEscrowTotal)}</span>
                    <span className={escrowToCap === 0 ? "font-semibold text-slate-700" : ""}>
                      {escrowToCap === 0 ? "At cap" : `${formatUsd(escrowToCap)} to cap`}
                    </span>
                  </div>
                </div>
                {/* LINK-F5187: debtQuery already fetches the driver's real open driver_finance.driver_liabilities
                    rows (source_liabilities) to compute currentEscrowTotal above -- they were discarded after
                    the sum, leaving no way to drill from this close screen to what the escrow balance is made of. */}
                {((debtQuery.data?.source_liabilities as Array<{ id?: unknown; type?: unknown; current_balance?: unknown }> | undefined) ?? []).length > 0 ? (
                  <div className="mt-2 flex flex-wrap items-center gap-1 border-t border-gray-100 pt-1 text-[11px] text-gray-600">
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
                    <div key={l.id} className="flex items-center justify-between text-sm text-gray-700">
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
                  <div className="flex items-center justify-between text-sm text-gray-700">
                    <span>Reimbursements</span>
                    <span>{formatUsd(reimbursements)}</span>
                  </div>
                </div>
              ) : null}

              {/* NET */}
              <div className="border-t border-gray-200 pt-2">
                <div className="flex items-center justify-between text-base font-semibold text-gray-900">
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
                <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Draft JE preview (not posted)</div>
                <ParityTable<DraftJeRow>
                  columns={draftJeColumns}
                  rows={draftJeRows}
                  rowKey={(row) => row.id}
                  loading={false}
                  emptyText="No draft JE lines for this settlement."
                  storageKey="settlement-close-draft-je"
                  exportFilename="settlement-close-draft-je"
                  tableTestId="settlement-close-draft-je-table"
                />
                <p className="mt-1 text-[10px] text-gray-500">
                  Preview only — computed client-side from this settlement&apos;s lines for review before Close. Actual GL
                  posting reuses the existing settlement posting path (behind SETTLEMENT_GL_POSTING_ENABLED).
                </p>
              </div>

              {/* Close action */}
              <div className="flex items-center justify-end gap-2 border-t border-gray-200 pt-3">
                {!canClose ? <span className="text-xs text-gray-500">Your role cannot close settlements.</span> : null}
                {isMaker ? (
                  <span className="text-xs text-slate-700">You opened this settlement — a different approver must close it (maker ≠ checker).</span>
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
          ) : null}
        </>
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
