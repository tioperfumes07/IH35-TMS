import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  createCashAdvance,
  listUnpaidBills,
  type CashAdvanceMethod,
  type CashAdvancePurpose,
  type CashAdvanceRecoveryMode,
} from "../../../api/cashAdvances";
import { cashAdvanceTypesCatalogClient } from "../../../api/catalogs-driver";
import { getAllAccounts } from "../../../api/banking";
import { listDrivers, listUnits } from "../../../api/mdata";
import { listLoads, getLoad } from "../../../api/loads";
import { Button } from "../../../components/Button";
import { Combobox } from "../../../components/Combobox";
import { CreateDriverModal } from "../../../components/drivers/CreateDriverModal";
import { MoneyInput } from "../../../components/forms/MoneyInput";
import { ParityDrawer } from "../../../components/parity/ParityDrawer";
import { useToast } from "../../../components/Toast";
import { SelectCombobox } from "../../../components/shared/SelectCombobox";
import {
  formatBankAccountPickerLabel,
  type BankAccountPickerRow,
} from "../../banking/transferAccountPicker";

type Props = {
  open: boolean;
  operatingCompanyId: string;
  onClose: () => void;
  onCreated: () => void;
};

/** Catalog code → existing CashAdvancePurpose enum (UI-only; no FK on driver_advances yet). */
function purposeFromCatalogCode(code: string): CashAdvancePurpose {
  const c = code.trim().toUpperCase();
  if (c === "FUEL") return "fuel_deposit";
  if (c === "EMERGENCY") return "family_emergency";
  return "other";
}

/** Economics-only purposes not represented as catalog rows (lumper / border / vendor). */
const ECONOMIC_PURPOSE_OPTIONS: Array<{ value: CashAdvancePurpose; label: string; hint: string }> = [
  { value: "lumper", label: "Lumper fee", hint: "Expense on load (not personal amortize)" },
  { value: "border_fee", label: "Border fee", hint: "Driver settlement recovery" },
  { value: "vendor_payment", label: "Vendor payment", hint: "Optional bill linkage" },
];

const FALLBACK_PURPOSE_OPTIONS: Array<{ value: CashAdvancePurpose; label: string; hint: string }> = [
  { value: "family_emergency", label: "Personal / family", hint: "Driver-owed → deduct from settlements" },
  { value: "fuel_deposit", label: "Fuel deposit", hint: "Trip cash advance — load + unit required" },
  { value: "other", label: "Other", hint: "Driver settlement recovery" },
  ...ECONOMIC_PURPOSE_OPTIONS,
];

const METHOD_OPTIONS: Array<{ value: CashAdvanceMethod; label: string }> = [
  { value: "direct_bank_transfer", label: "Direct bank transfer" },
  { value: "wire", label: "Wire (3rd party)" },
  { value: "comdata", label: "Comdata / EFS card load" },
  { value: "in_person_check", label: "In-person check" },
];

const PHASE4_APPROVAL_MESSAGE = "Owner approval required — feature available Phase 4";

function isDriverOwedPurpose(purpose: CashAdvancePurpose) {
  return purpose !== "lumper";
}

function requiresLoad(purpose: CashAdvancePurpose) {
  return purpose === "lumper" || purpose === "fuel_deposit";
}

export function CreateAdvanceModal({ open, operatingCompanyId, onClose, onCreated }: Props) {
  const { pushToast } = useToast();
  const [driverId, setDriverId] = useState<string | null>(null);
  const [driverCreateOpen, setDriverCreateOpen] = useState(false);
  const [amount, setAmount] = useState("300");
  const [purpose, setPurpose] = useState<CashAdvancePurpose>("family_emergency");
  const [advanceTypeCode, setAdvanceTypeCode] = useState<string>("EMERGENCY");
  const [method, setMethod] = useState<CashAdvanceMethod>("direct_bank_transfer");

  const advanceTypesQuery = useQuery({
    queryKey: ["catalogs", "cash-advance-types", operatingCompanyId],
    queryFn: () =>
      cashAdvanceTypesCatalogClient.list({
        operating_company_id: operatingCompanyId,
        is_active: "true",
        limit: 200,
      }),
    enabled: open && Boolean(operatingCompanyId),
  });
  const [fromBankAccountId, setFromBankAccountId] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [linkedBillEnabled, setLinkedBillEnabled] = useState(false);
  const [linkedBillId, setLinkedBillId] = useState("");
  const [loadId, setLoadId] = useState<string | null>(null);
  const [unitId, setUnitId] = useState<string | null>(null);
  const [trailerId, setTrailerId] = useState<string | null>(null);
  const [recoveryMode, setRecoveryMode] = useState<CashAdvanceRecoveryMode>("full");
  const [periods, setPeriods] = useState(4);
  const [weeklyAmount, setWeeklyAmount] = useState("75");
  const [cadence, setCadence] = useState<"weekly" | "biweekly">("weekly");
  const [abovePolicyWarn, setAbovePolicyWarn] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setAbovePolicyWarn(null);
  }, [open]);

  useEffect(() => {
    if (purpose === "lumper") {
      setRecoveryMode("full");
      setLinkedBillEnabled(false);
    }
  }, [purpose]);

  const driversQuery = useQuery({
    queryKey: ["cash-advances", "drivers", operatingCompanyId],
    queryFn: () => listDrivers({ operating_company_id: operatingCompanyId, status: "Active", search: "", limit: 200 }),
    enabled: open && Boolean(operatingCompanyId),
  });

  const billsQuery = useQuery({
    queryKey: ["cash-advances", "unpaid-bills", operatingCompanyId],
    queryFn: () => listUnpaidBills(operatingCompanyId),
    enabled: open && Boolean(operatingCompanyId),
  });

  const bankAccountsQuery = useQuery({
    queryKey: ["banking", "accounts-all", operatingCompanyId, "cash-advance-create"],
    queryFn: () => getAllAccounts(operatingCompanyId),
    enabled: open && Boolean(operatingCompanyId) && method === "direct_bank_transfer",
  });

  const loadsQuery = useQuery({
    queryKey: ["cash-advances", "loads", operatingCompanyId, driverId],
    queryFn: () =>
      listLoads({
        operating_company_id: [operatingCompanyId],
        driver_id: driverId,
        status: ["assigned", "dispatched", "at_pickup", "in_transit", "at_delivery", "booked", "planned"],
        limit: 50,
        sort: "created_at_desc",
      }),
    enabled: open && Boolean(operatingCompanyId) && Boolean(driverId),
  });

  const loadDetailQuery = useQuery({
    queryKey: ["cash-advances", "load-detail", loadId],
    queryFn: () => getLoad(String(loadId)),
    enabled: open && Boolean(loadId),
  });

  const fleetQuery = useQuery({
    queryKey: ["cash-advances", "fleet", operatingCompanyId],
    queryFn: () => listUnits({ operating_company_id: operatingCompanyId, include: "trailers", limit: 500 }),
    enabled: open && Boolean(operatingCompanyId) && (requiresLoad(purpose) || Boolean(loadId)),
  });

  useEffect(() => {
    if (!loadDetailQuery.data) return;
    const assignedUnit = loadDetailQuery.data.assigned_unit_id;
    if (assignedUnit) setUnitId(String(assignedUnit));
  }, [loadDetailQuery.data]);

  const driverOptions = useMemo(
    () =>
      (driversQuery.data?.drivers ?? []).map((d) => ({
        value: d.id,
        label: `${d.first_name ?? ""} ${d.last_name ?? ""}`.trim() || d.id,
      })),
    [driversQuery.data]
  );

  const bankAccounts = useMemo(() => {
    const rows = (bankAccountsQuery.data?.accounts ?? []).map(
      (row): BankAccountPickerRow => ({
        id: String(row.id ?? ""),
        display_name: (row.display_name as string | null | undefined) ?? null,
        account_name: (row.account_name as string | null | undefined) ?? null,
        institution_name: (row.institution_name as string | null | undefined) ?? null,
        account_mask: (row.account_mask as string | null | undefined) ?? null,
        ledger_account_id: (row.ledger_account_id as string | null | undefined) ?? null,
      })
    );
    return rows
      .filter((a) => a.id.length > 0)
      .map((a) => ({ id: a.id, name: formatBankAccountPickerLabel(a) }));
  }, [bankAccountsQuery.data?.accounts]);

  const loadOptions = useMemo(
    () =>
      (loadsQuery.data?.loads ?? []).map((load) => ({
        value: load.id,
        label: `${load.load_number} · ${load.status}${load.first_pickup_city ? ` · ${load.first_pickup_city}` : ""}`,
      })),
    [loadsQuery.data]
  );

  const unitOptions = useMemo(() => {
    const rows = (fleetQuery.data?.units ?? []) as Array<Record<string, unknown>>;
    return rows
      .filter((u) => String(u.kind ?? "truck") === "truck" || !u.kind)
      .map((u) => ({
        value: String(u.id),
        label: String(u.unit_number ?? u.display_id ?? u.id),
      }));
  }, [fleetQuery.data]);

  const trailerOptions = useMemo(() => {
    const rows = (fleetQuery.data?.units ?? []) as Array<Record<string, unknown>>;
    return rows
      .filter((u) => String(u.kind ?? "") === "trailer")
      .map((u) => ({
        value: String(u.id),
        label: String(u.equipment_number ?? u.unit_number ?? u.display_id ?? u.id),
      }));
  }, [fleetQuery.data]);

  const selectedBill = useMemo(
    () => billsQuery.data?.bills?.find((row) => String(row.id) === linkedBillId) ?? null,
    [billsQuery.data?.bills, linkedBillId]
  );

  const purposeOptions = useMemo(() => {
    const rows = advanceTypesQuery.data?.rows ?? [];
    if (rows.length === 0) return FALLBACK_PURPOSE_OPTIONS;
    const fromCatalog = rows.map((row) => ({
      value: purposeFromCatalogCode(row.code) as CashAdvancePurpose,
      label: row.display_name,
      hint: row.description?.trim() || `Catalog type ${row.code}`,
      catalogCode: row.code,
    }));
    // Deduplicate by purpose value while keeping first catalog label; append economic extras.
    const seen = new Set<string>();
    const merged: Array<{ value: CashAdvancePurpose; label: string; hint: string; catalogCode?: string }> = [];
    for (const opt of fromCatalog) {
      if (seen.has(opt.value)) continue;
      seen.add(opt.value);
      merged.push(opt);
    }
    for (const opt of ECONOMIC_PURPOSE_OPTIONS) {
      if (seen.has(opt.value)) continue;
      seen.add(opt.value);
      merged.push(opt);
    }
    return merged;
  }, [advanceTypesQuery.data?.rows]);

  const purposeMeta = purposeOptions.find((p) => p.value === purpose);
  const showRecovery = isDriverOwedPurpose(purpose);
  const showOpsLinks = requiresLoad(purpose) || purpose === "border_fee" || purpose === "other" || Boolean(loadId);

  const createMutation = useMutation({
    mutationFn: () => {
      const parsedAmount = Number(amount || "0");
      const payload = {
        driver_id: String(driverId),
        amount: parsedAmount,
        purpose,
        disbursement_method: method,
        recipient_info: {
          recipient_type: linkedBillEnabled ? ("vendor" as const) : ("driver" as const),
          recipient_name: recipientName || undefined,
        },
        linked_bill_id: linkedBillEnabled && linkedBillId ? linkedBillId : undefined,
        load_id: loadId || null,
        unit_id: unitId || null,
        trailer_id: trailerId || null,
        from_bank_account_id: method === "direct_bank_transfer" ? fromBankAccountId || null : null,
        recovery_mode: purpose === "lumper" ? undefined : recoveryMode,
        economic_routing: purpose === "lumper" ? ("load_expense" as const) : ("driver_settlement" as const),
        repayment_schedule:
          purpose === "lumper"
            ? undefined
            : recoveryMode === "full"
              ? undefined
              : {
                  weekly_installment_amount: Number(weeklyAmount || "0"),
                  total_periods: periods,
                  cadence,
                },
      };
      return createCashAdvance(operatingCompanyId, payload);
    },
    onSuccess: () => {
      pushToast(
        purpose === "lumper"
          ? "Lumper advance created (expense posting HOLD — linkage captured)"
          : "Cash advance created",
        "success"
      );
      onCreated();
    },
    onError: (error) => {
      const message = String((error as Error).message ?? "Failed to create advance");
      if (message.includes("above_policy_owner_approval_required") || message.includes("403")) {
        setAbovePolicyWarn(PHASE4_APPROVAL_MESSAGE);
        pushToast(PHASE4_APPROVAL_MESSAGE, "error");
        return;
      }
      pushToast(message, "error");
    },
  });

  if (!open) return null;

  return (
    <>
      <ParityDrawer
        open={open}
        onClose={onClose}
        title="Create Advance"
        subtitle="Purpose decides economics — personal → settlement · lumper → load expense"
        size="wide"
        footer={
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="button"
              loading={createMutation.isPending}
              onClick={() => {
                if (!driverId) {
                  pushToast("Driver is required", "error");
                  return;
                }
                if (Number(amount) <= 0) {
                  pushToast("Amount must be greater than 0", "error");
                  return;
                }
                if (method === "direct_bank_transfer" && !fromBankAccountId) {
                  pushToast("Select the bank account to transfer from", "error");
                  return;
                }
                if (requiresLoad(purpose) && !loadId) {
                  pushToast("Load is required for this purpose", "error");
                  return;
                }
                if (purpose === "fuel_deposit" && !unitId) {
                  pushToast("Unit is required for fuel deposit", "error");
                  return;
                }
                if (linkedBillEnabled && !linkedBillId) {
                  pushToast("Select an unpaid bill to link this advance to", "error");
                  return;
                }
                if (showRecovery && recoveryMode === "amortize" && Number(weeklyAmount) <= 0) {
                  pushToast("Per-period amount must be greater than 0", "error");
                  return;
                }
                createMutation.mutate();
              }}
            >
              + Create Advance
            </Button>
          </div>
        }
      >
        <div className="space-y-4 text-xs">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1 md:col-span-2">
              <span className="font-medium text-gray-700">Driver</span>
              <Combobox
                options={driverOptions}
                value={driverId}
                onChange={(v) => {
                  setDriverId(v);
                  setLoadId(null);
                }}
                placeholder="Select driver"
                loading={driversQuery.isLoading}
                allowAddNew={{
                  label: "+ Create driver",
                  onAdd: () => setDriverCreateOpen(true),
                }}
              />
            </label>

            <label className="space-y-1">
              <span className="font-medium text-gray-700">Amount</span>
              <MoneyInput
                valueDollars={amount ? Number(amount) : null}
                onChangeDollars={(d) => {
                  const next = d == null ? "" : String(d);
                  setAmount(next);
                  if (recoveryMode === "amortize" && periods > 0 && d != null && d > 0) {
                    setWeeklyAmount((d / periods).toFixed(2));
                  }
                }}
                ariaLabel="Advance amount (USD)"
                className="w-full"
              />
            </label>

            <label className="space-y-1" data-testid="advance-purpose">
              <span className="font-medium text-gray-700">Purpose</span>
              <SelectCombobox
                className="w-full rounded-sm border border-gray-300 px-2 py-1"
                value={purpose}
                onChange={(e) => {
                  const next = e.target.value as CashAdvancePurpose;
                  setPurpose(next);
                  const match = purposeOptions.find((o) => o.value === next);
                  if (match && "catalogCode" in match && match.catalogCode) {
                    setAdvanceTypeCode(match.catalogCode);
                  }
                }}
              >
                {purposeOptions.map((option) => (
                  <option
                    key={`${option.value}-${"catalogCode" in option ? option.catalogCode : option.label}`}
                    value={option.value}
                  >
                    {option.label}
                  </option>
                ))}
              </SelectCombobox>
              {purposeMeta ? <p className="text-[11px] text-gray-500">{purposeMeta.hint}</p> : null}
              {advanceTypesQuery.isError ? (
                <p className="text-[11px] text-amber-700">
                  Could not load cash advance types — using built-in purposes until the catalog is reachable.
                </p>
              ) : null}
              {/* UI-only taxonomy until WAVE-V-SETTLE adds cash_advance_type_id FK. */}
              <span className="sr-only" data-testid="advance-type-code">
                {advanceTypeCode}
              </span>
            </label>

            <label className="space-y-1">
              <span className="font-medium text-gray-700">Disbursement method</span>
              <SelectCombobox
                className="w-full rounded-sm border border-gray-300 px-2 py-1"
                value={method}
                onChange={(e) => setMethod(e.target.value as CashAdvanceMethod)}
                aria-label="Disbursement method"
              >
                {METHOD_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </SelectCombobox>
            </label>

            {method === "direct_bank_transfer" ? (
              <label className="space-y-1" data-field="from_bank_account_id">
                <span className="font-medium text-gray-700">Bank account</span>
                <SelectCombobox
                  className="w-full rounded-sm border border-gray-300 px-2 py-1"
                  value={fromBankAccountId}
                  onChange={(e) => setFromBankAccountId(e.target.value)}
                  aria-label="From bank account"
                >
                  <option value="">Select bank account</option>
                  {bankAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </SelectCombobox>
              </label>
            ) : (
              <label className="space-y-1">
                <span className="font-medium text-gray-700">Recipient name (wire / check / vendor)</span>
                <input
                  className="w-full rounded-sm border border-gray-300 px-2 py-1"
                  value={recipientName}
                  onChange={(e) => setRecipientName(e.target.value)}
                  placeholder="Recipient name"
                />
              </label>
            )}
          </div>

          {/* Ops linkage — flat section, no nested bordered box */}
          <section className="space-y-2 border-t border-gray-100 pt-3" data-section="ops-linkage">
            <div className="font-semibold text-gray-800">Ops linkage</div>
            <p className="text-[11px] text-gray-500">
              {purpose === "lumper"
                ? "Lumper requires a load; truck/trailer default from the load when available."
                : purpose === "fuel_deposit"
                  ? "Fuel deposit requires load and unit."
                  : "Optional load / unit / trailer for trip context."}
            </p>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="space-y-1 md:col-span-2" data-field="load_id">
                <span className="font-medium text-gray-700">
                  Load{requiresLoad(purpose) ? " *" : " (optional)"}
                </span>
                <Combobox
                  options={loadOptions}
                  value={loadId}
                  onChange={setLoadId}
                  placeholder={driverId ? "Select load" : "Select driver first"}
                  loading={loadsQuery.isLoading}
                  disabled={!driverId}
                  allowClear
                />
              </label>
              {(showOpsLinks || requiresLoad(purpose)) && (
                <>
                  <label className="space-y-1" data-field="unit_id">
                    <span className="font-medium text-gray-700">
                      Unit / truck{purpose === "fuel_deposit" ? " *" : ""}
                    </span>
                    <Combobox
                      options={unitOptions}
                      value={unitId}
                      onChange={setUnitId}
                      placeholder="Select unit"
                      loading={fleetQuery.isLoading}
                      allowClear
                    />
                  </label>
                  <label className="space-y-1" data-field="trailer_id">
                    <span className="font-medium text-gray-700">Trailer</span>
                    <Combobox
                      options={trailerOptions}
                      value={trailerId}
                      onChange={setTrailerId}
                      placeholder="Select trailer"
                      loading={fleetQuery.isLoading}
                      allowClear
                    />
                  </label>
                </>
              )}
            </div>
          </section>

          {/* Bill linkage — flat section */}
          {purpose !== "lumper" ? (
            <section className="space-y-2 border-t border-gray-100 pt-3" data-section="bill-linkage">
              <div className="flex items-center justify-between gap-2">
                <div className="font-semibold text-gray-800">Bill payment linkage</div>
                <label className="inline-flex items-center gap-1 text-gray-700">
                  <input
                    type="checkbox"
                    checked={linkedBillEnabled}
                    onChange={(e) => setLinkedBillEnabled(e.target.checked)}
                  />
                  Apply to unpaid vendor bill
                </label>
              </div>
              {linkedBillEnabled ? (
                <label className="space-y-1">
                  <span className="font-medium text-gray-700">Unpaid bill</span>
                  <SelectCombobox
                    className="w-full rounded-sm border border-gray-300 px-2 py-1"
                    value={linkedBillId}
                    onChange={(e) => {
                      const value = e.target.value;
                      setLinkedBillId(value);
                      const bill = (billsQuery.data?.bills ?? []).find((row) => String(row.id) === value);
                      if (bill?.total_amount != null) {
                        setAmount(String(Number(bill.total_amount)));
                      }
                    }}
                  >
                    <option value="">Select unpaid bill</option>
                    {(billsQuery.data?.bills ?? []).map((bill) => (
                      <option key={String(bill.id)} value={String(bill.id)}>
                        {String(bill.display_id)} · ${Number(bill.total_amount ?? 0).toFixed(2)}
                      </option>
                    ))}
                  </SelectCombobox>
                  {selectedBill ? (
                    <p className="text-[11px] text-gray-500">
                      Selected {String(selectedBill.display_id)} — amount auto-fills; recipient becomes vendor on
                      disbursement.
                    </p>
                  ) : null}
                </label>
              ) : null}
            </section>
          ) : (
            <section className="space-y-1 border-t border-gray-100 pt-3" data-section="lumper-economics">
              <div className="font-semibold text-gray-800">Economics</div>
              <p className="text-[11px] text-gray-600">
                Lumper routes as <strong>load expense</strong> (not a personal multi-period debt). Full expense JE
                posting is financial HOLD until CPA/Neon — this create stamps purpose, load, unit, trailer, and bank
                for linkage.
              </p>
            </section>
          )}

          {/* Recovery — flat section; periods only when amortize */}
          {showRecovery ? (
            <section className="space-y-2 border-t border-gray-100 pt-3" data-section="recovery-mode">
              <div className="font-semibold text-gray-800">Settlement recovery</div>
              <div className="flex flex-col gap-2" role="radiogroup" aria-label="Recovery mode">
                <label className="inline-flex items-start gap-2">
                  <input
                    type="radio"
                    name="recovery_mode"
                    value="full"
                    checked={recoveryMode === "full"}
                    onChange={() => setRecoveryMode("full")}
                  />
                  <span>
                    <span className="font-medium">Next settlement — deduct in full</span>
                    <span className="block text-[11px] text-gray-500">Single deduction of the remaining balance</span>
                  </span>
                </label>
                <label className="inline-flex items-start gap-2">
                  <input
                    type="radio"
                    name="recovery_mode"
                    value="amortize"
                    checked={recoveryMode === "amortize"}
                    onChange={() => setRecoveryMode("amortize")}
                  />
                  <span>
                    <span className="font-medium">Amortize</span>
                    <span className="block text-[11px] text-gray-500">Split across periods with cadence</span>
                  </span>
                </label>
              </div>
              {recoveryMode === "amortize" ? (
                <div className="grid gap-2 md:grid-cols-3" data-section="amortize-schedule">
                  <label className="space-y-1">
                    <span>Periods</span>
                    <input
                      type="number"
                      min={1}
                      max={104}
                      className="w-full rounded-sm border border-gray-300 px-2 py-1"
                      value={periods}
                      onChange={(e) => {
                        const nextPeriods = Number(e.target.value || "1");
                        setPeriods(nextPeriods);
                        const parsedAmount = Number(amount || "0");
                        if (nextPeriods > 0 && parsedAmount > 0) {
                          setWeeklyAmount((parsedAmount / nextPeriods).toFixed(2));
                        }
                      }}
                    />
                  </label>
                  <label className="space-y-1">
                    <span>Per period amount</span>
                    <MoneyInput
                      valueDollars={weeklyAmount ? Number(weeklyAmount) : null}
                      onChangeDollars={(d) => setWeeklyAmount(d == null ? "" : String(d))}
                      ariaLabel="Per-period amount (USD)"
                      className="w-full"
                    />
                  </label>
                  <label className="space-y-1">
                    <span>Cadence</span>
                    <SelectCombobox
                      className="w-full rounded-sm border border-gray-300 px-2 py-1"
                      value={cadence}
                      onChange={(e) => setCadence(e.target.value as "weekly" | "biweekly")}
                    >
                      <option value="weekly">Weekly</option>
                      <option value="biweekly">Biweekly</option>
                    </SelectCombobox>
                  </label>
                </div>
              ) : null}
            </section>
          ) : null}

          {abovePolicyWarn ? (
            <div className="rounded-sm border border-slate-300 bg-slate-50 p-2 text-slate-800">{abovePolicyWarn}</div>
          ) : null}
        </div>
      </ParityDrawer>

      {operatingCompanyId ? (
        <CreateDriverModal
          open={driverCreateOpen}
          companyId={operatingCompanyId}
          onClose={() => setDriverCreateOpen(false)}
          onCreated={(id) => {
            setDriverId(id);
            setDriverCreateOpen(false);
            void driversQuery.refetch();
          }}
        />
      ) : null}
    </>
  );
}
