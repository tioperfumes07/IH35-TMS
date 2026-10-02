/**
 * ROUND 312 B-2 — QBO Make Deposit.
 * Pick undeposited receipts → one deposit JE + accounting.deposits header/lines; cash-back optional;
 * batch grid paste / fill-down / duplicate per §23.
 */
import { useMemo, useRef, useState, type ClipboardEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { Button } from "../../components/Button";
import { DatePicker } from "../../components/forms/DatePicker";
import { MoneyInput } from "../../components/forms/MoneyInput";
import { SaveDropdown } from "../../components/forms/SaveDropdown";
import { ReferenceSelect, type ReferenceOption } from "../../components/parity/ReferenceSelect";
import { EntityLink } from "../../components/shared/EntityLink";
import { ListErrorBanner } from "../../components/shared/ListErrorBanner";
import { NavyPageSubNav } from "../../components/layout/NavyPageSubNav";
import { BANKING_MODULE_TABS, BANKING_SUBNAV_TAB_IDS } from "./BANKING_NAV_CONFIG";
import { BANKING_TAB_PATH } from "../../router/route-manifest";
import { getBankingTiles } from "../../api/banking";
import { listCatalogAccounts } from "../../api/catalog-accounts";
import {
  createBankDeposit,
  listBankDeposits,
  listUndepositedReceipts,
  voidBankDeposit,
  type UndepositedReceipt,
} from "../../api/bankDeposits";
import { formatCurrencyFromCents } from "../lists/accounting/coa-list-utils";
import { formatDateUS } from "../../lib/formatDate";
import { userFacingApiError } from "../../lib/api-error-message";
import { coaAccountReferenceOption } from "../../components/parity/referenceOptionLabels";

type BatchRow = {
  key: string;
  bank_account_id: string;
  deposit_date: string;
  payment_ids: string[];
  factoring_advance_ids: string[];
  cash_back_cents: number;
  cash_back_account_id: string;
  memo: string;
  status: "draft" | "saved" | "error";
  error: string | null;
  display_id: string | null;
  deposit_id: string | null;
};

function newBatchRow(today: string): BatchRow {
  return {
    key: crypto.randomUUID(),
    bank_account_id: "",
    deposit_date: today,
    payment_ids: [],
    factoring_advance_ids: [],
    cash_back_cents: 0,
    cash_back_account_id: "",
    memo: "",
    status: "draft",
    error: null,
    display_id: null,
    deposit_id: null,
  };
}

function todayChicago(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date()
  );
}

export function MakeDepositPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const navigate = useNavigate();
  const qc = useQueryClient();
  const today = todayChicago();
  const [searchParams] = useSearchParams();
  // B-5 §23 type-strip deep-link: /banking/deposits?batch=1 opens the batch grid (createBankDeposit engine).
  const openBatchFromQuery =
    searchParams.get("batch") === "1" || searchParams.get("mode") === "batch";

  const [bankAccountId, setBankAccountId] = useState("");
  const [depositDate, setDepositDate] = useState(today);
  const [memo, setMemo] = useState("");
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [cashBackCents, setCashBackCents] = useState(0);
  const [cashBackAccountId, setCashBackAccountId] = useState("");
  const [voidReason, setVoidReason] = useState("");
  const [voidTargetId, setVoidTargetId] = useState<string | null>(null);
  const [mode, setMode] = useState<"single" | "batch">(openBatchFromQuery ? "batch" : "single");
  const [batchRows, setBatchRows] = useState<BatchRow[]>(() => [newBatchRow(today), newBatchRow(today)]);
  const pasteRef = useRef<HTMLTextAreaElement | null>(null);

  const receiptsQ = useQuery({
    queryKey: ["bank-deposits", "undeposited", companyId],
    queryFn: () => listUndepositedReceipts(companyId),
    enabled: !!companyId,
  });
  const depositsQ = useQuery({
    queryKey: ["bank-deposits", "list", companyId],
    queryFn: () => listBankDeposits(companyId, { limit: 50 }),
    enabled: !!companyId,
  });
  const tilesQ = useQuery({
    queryKey: ["bank-deposits", "tiles", companyId],
    queryFn: () => getBankingTiles(companyId),
    enabled: !!companyId,
  });
  const accountsQ = useQuery({
    queryKey: ["bank-deposits", "coa", companyId],
    queryFn: () => listCatalogAccounts({ status: "active", operating_company_id: companyId, postable_only: true }),
    enabled: !!companyId && cashBackCents > 0,
  });

  const bankOptions = useMemo<ReferenceOption[]>(() => {
    const tiles = (tilesQ.data?.tiles ?? []).filter((t) => t.tile_kind === "real" && t.ledger_account_id);
    return tiles.map((t) => ({
      value: t.id,
      label: t.display_name,
      type: formatCurrencyFromCents(Math.round((t.current_balance ?? 0) * 100)),
    }));
  }, [tilesQ.data]);

  const cashBackOptions = useMemo<ReferenceOption[]>(
    () => (accountsQ.data?.accounts ?? []).map((a) => coaAccountReferenceOption(a)),
    [accountsQ.data]
  );

  const receipts = receiptsQ.data?.rows ?? [];
  const selectedReceipts = receipts.filter((r) => selected[`${r.kind}:${r.id}`]);
  const selectedTotal = selectedReceipts.reduce((s, r) => s + r.amount_cents, 0);
  const netDeposit = Math.max(0, selectedTotal - cashBackCents);

  const createMut = useMutation({
    mutationFn: () =>
      createBankDeposit({
        operating_company_id: companyId,
        bank_account_id: bankAccountId,
        deposit_date: depositDate,
        memo: memo || null,
        payment_ids: selectedReceipts.filter((r) => r.kind === "customer_payment").map((r) => r.id),
        factoring_advance_ids: selectedReceipts.filter((r) => r.kind === "factoring_advance").map((r) => r.id),
        cash_back_cents: cashBackCents,
        cash_back_account_id: cashBackCents > 0 ? cashBackAccountId || null : null,
      }),
    onSuccess: async () => {
      setSelected({});
      setCashBackCents(0);
      setCashBackAccountId("");
      setMemo("");
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["bank-deposits", "undeposited", companyId] }),
        qc.invalidateQueries({ queryKey: ["bank-deposits", "list", companyId] }),
      ]);
    },
  });

  const voidMut = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      voidBankDeposit(id, { operating_company_id: companyId, reason }),
    onSuccess: async () => {
      setVoidTargetId(null);
      setVoidReason("");
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["bank-deposits", "undeposited", companyId] }),
        qc.invalidateQueries({ queryKey: ["bank-deposits", "list", companyId] }),
      ]);
    },
  });

  const toggle = (r: UndepositedReceipt) => {
    const key = `${r.kind}:${r.id}`;
    setSelected((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const saveBatch = async () => {
    for (let i = 0; i < batchRows.length; i++) {
      const row = batchRows[i]!;
      if (row.status === "saved") continue;
      if (!row.bank_account_id || (!row.payment_ids.length && !row.factoring_advance_ids.length)) continue;
      try {
        const res = await createBankDeposit({
          operating_company_id: companyId,
          bank_account_id: row.bank_account_id,
          deposit_date: row.deposit_date || today,
          memo: row.memo || null,
          payment_ids: row.payment_ids,
          factoring_advance_ids: row.factoring_advance_ids,
          cash_back_cents: row.cash_back_cents,
          cash_back_account_id: row.cash_back_cents > 0 ? row.cash_back_account_id || null : null,
        });
        setBatchRows((prev) =>
          prev.map((r, idx) =>
            idx === i ? { ...r, status: "saved", error: null, display_id: res.deposit.display_id, deposit_id: res.deposit.id } : r
          )
        );
      } catch (err) {
        setBatchRows((prev) =>
          prev.map((r, idx) =>
            idx === i ? { ...r, status: "error", error: userFacingApiError(err, "Deposit failed") } : r
          )
        );
      }
    }
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["bank-deposits", "undeposited", companyId] }),
      qc.invalidateQueries({ queryKey: ["bank-deposits", "list", companyId] }),
    ]);
  };

  const onPasteBatch = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const text = e.clipboardData.getData("text/plain");
    if (!text.trim()) return;
    e.preventDefault();
    const lines = text.trim().split(/\r?\n/).filter(Boolean);
    const parsed = lines.map((line) => {
      const cols = line.split("\t");
      const row = newBatchRow(cols[0]?.trim() || today);
      row.memo = cols[1]?.trim() ?? "";
      return row;
    });
    setBatchRows((prev) => [...prev.filter((r) => r.status === "saved" || r.bank_account_id || r.payment_ids.length), ...parsed]);
    if (pasteRef.current) pasteRef.current.value = "";
  };

  const tabs = BANKING_MODULE_TABS.filter((t) => (BANKING_SUBNAV_TAB_IDS as readonly string[]).includes(t.id));

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[#F7F8FA]" data-page="make-deposit">
      <NavyPageSubNav
        items={tabs.map((t) => ({
          label: t.label,
          to: t.id === "deposits" ? "/banking/deposits" : (BANKING_TAB_PATH[t.id] ?? "/banking"),
        }))}
      />
      <div className="mx-auto w-full max-w-[1200px] space-y-4 p-4">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h1 className=" font-semibold text-[#0F1219]">Make Deposit</h1>
            <p className=" text-[#6B7280]">
              Move Undeposited Funds receipts into a bank account (QBO Make Deposit). Void reverses the JE.
            </p>
          </div>
          <div className="flex gap-2">
            <Button type="button" variant={mode === "single" ? "primary" : "secondary"} onClick={() => setMode("single")}>
              Single
            </Button>
            <Button type="button" variant={mode === "batch" ? "primary" : "secondary"} onClick={() => setMode("batch")}>
              Batch grid
            </Button>
            <Link className="inline-flex h-7 items-center rounded-sm border border-[#E5E7EB] bg-white px-2 text-[#1F2A44]" to="/banking/register">
              Register
            </Link>
          </div>
        </div>

        {receiptsQ.isError ? <ListErrorBanner message="Failed to load undeposited receipts." onRetry={() => void receiptsQ.refetch()} /> : null}

        {mode === "single" ? (
          <section className="space-y-3 rounded-sm border border-[#E5E7EB] bg-white p-3" data-section="make-deposit-single">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <label className="block text-[#4B5563]">
                <span className="mb-1 block font-bold uppercase">Deposit to</span>
                <ReferenceSelect
                  size="sm"
                  value={bankAccountId || null}
                  onChange={(id) => setBankAccountId(id ?? "")}
                  options={bankOptions}
                  placeholder="Bank account"
                  createKind="account"
                  operatingCompanyId={companyId}
                />
              </label>
              <label className="block text-[#4B5563]">
                <span className="mb-1 block font-bold uppercase">Date</span>
                <DatePicker value={depositDate} onChange={setDepositDate} />
              </label>
              <label className="block text-[#4B5563]">
                <span className="mb-1 block font-bold uppercase">Memo</span>
                <input
                  className="h-7 w-full rounded-sm border border-[#E5E7EB] px-2"
                  value={memo}
                  onChange={(e) => setMemo(e.target.value)}
                />
              </label>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full border-collapse tabular-nums">
                <thead>
                  <tr className="border-b border-[#E5E7EB] text-column-header font-bold uppercase text-[#4B5563]">
                    <th className="px-2 py-[7px] text-center">☐</th>
                    <th className="px-2 py-[7px] text-center">Type</th>
                    <th className="px-2 py-[7px] text-center">Ref</th>
                    <th className="px-2 py-[7px] text-center">Payee</th>
                    <th className="px-2 py-[7px] text-center">Date</th>
                    <th className="px-2 py-[7px] text-center">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {receipts.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-2 py-4 text-center text-[#6B7280]">
                        No undeposited receipts in Undeposited Funds.
                      </td>
                    </tr>
                  ) : (
                    receipts.map((r) => {
                      const key = `${r.kind}:${r.id}`;
                      return (
                        <tr key={key} className="border-b border-[#E5E7EB]">
                          <td className="px-2 py-[7px] text-center">
                            <input type="checkbox" checked={Boolean(selected[key])} onChange={() => toggle(r)} />
                          </td>
                          <td className="px-2 py-[7px] text-center">{r.kind === "customer_payment" ? "Payment" : "Faro advance"}</td>
                          <td className="px-2 py-[7px] text-center">
                            {r.kind === "customer_payment" ? (
                              <EntityLink kind="payment" id={r.id} label={r.display_id ?? r.id.slice(0, 8)} />
                            ) : (
                              <EntityLink kind="factoring_advance" id={r.id} label={r.display_id ?? r.id.slice(0, 8)} />
                            )}
                          </td>
                          <td className="px-2 py-[7px] text-center">{r.payee_name ?? "—"}</td>
                          <td className="px-2 py-[7px] text-center">{r.receipt_date ? formatDateUS(r.receipt_date) : "—"}</td>
                          <td className="px-2 py-[7px] text-center">{formatCurrencyFromCents(r.amount_cents)}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <label className="block text-[#4B5563]">
                <span className="mb-1 block font-bold uppercase">Cash back</span>
                <MoneyInput valueCents={cashBackCents} onChangeCents={(c) => setCashBackCents(c ?? 0)} />
              </label>
              {cashBackCents > 0 ? (
                <label className="block text-[#4B5563]">
                  <span className="mb-1 block font-bold uppercase">Cash-back account</span>
                  <ReferenceSelect
                    size="sm"
                    value={cashBackAccountId || null}
                    onChange={(id) => setCashBackAccountId(id ?? "")}
                    options={cashBackOptions}
                    placeholder="Account"
                    createKind="account"
                    operatingCompanyId={companyId}
                  />
                </label>
              ) : null}
              <div className="flex flex-col justify-end text-[#1F2A44]">
                <div>Selected: {formatCurrencyFromCents(selectedTotal)}</div>
                <div>Net to bank: {formatCurrencyFromCents(netDeposit)}</div>
              </div>
            </div>

            {createMut.isError ? <p className=" text-red-700">{userFacingApiError(createMut.error, "Deposit failed")}</p> : null}
            {createMut.isSuccess ? (
              <p className=" text-[#16A34A]">
                Saved{" "}
                <EntityLink kind="deposit" id={createMut.data.deposit.id} label={createMut.data.deposit.display_id} />
                {createMut.data.deposit.journal_entry_id ? (
                  <>
                    {" · "}
                    <EntityLink kind="journal_entry" id={createMut.data.deposit.journal_entry_id} label="JE" />
                  </>
                ) : null}
              </p>
            ) : null}

            <div data-b5-deposit-save-close="1" data-testid="b5-deposit-save-close">
              <SaveDropdown
                storageKey="make-deposit"
                primaryLabel="Save and close"
                disabled={!bankAccountId || selectedReceipts.length === 0 || createMut.isPending || (cashBackCents > 0 && !cashBackAccountId)}
                loading={createMut.isPending}
                onSave={() => createMut.mutate()}
                onSaveAndClose={async () => {
                  await createMut.mutateAsync();
                  navigate("/banking/deposits");
                }}
                onSaveAndAddAnother={() => createMut.mutate()}
                menuLabels={{
                  save: "Save",
                  save_and_close: "Save and close",
                  save_and_add_another: "Save and new",
                }}
              />
            </div>
          </section>
        ) : (
          <section className="space-y-3 rounded-sm border border-[#E5E7EB] bg-white p-3" data-section="make-deposit-batch" data-b5-batch-deposits="1">
            <p className=" text-[#6B7280]">
              §23 batch grid: paste date/memo rows, fill bank + receipt ids, Save all — each row posts through the same Make Deposit engine.
            </p>
            <textarea
              ref={pasteRef}
              className="h-16 w-full rounded-sm border border-[#E5E7EB] p-2"
              placeholder="Paste spreadsheet rows (date, memo) here"
              onPaste={onPasteBatch}
            />
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" onClick={() => setBatchRows((prev) => [...prev, newBatchRow(today)])}>
                Add row
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() =>
                  setBatchRows((prev) => {
                    const last = prev[prev.length - 1];
                    return last ? [...prev, { ...last, key: crypto.randomUUID(), status: "draft", error: null, display_id: null, deposit_id: null }] : prev;
                  })
                }
              >
                Duplicate last
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() =>
                  setBatchRows((prev) => {
                    const firstBank = prev.find((r) => r.bank_account_id)?.bank_account_id ?? "";
                    if (!firstBank) return prev;
                    return prev.map((r) => (r.bank_account_id ? r : { ...r, bank_account_id: firstBank }));
                  })
                }
              >
                Fill-down bank
              </Button>
              <Button type="button" onClick={() => void saveBatch()}>
                Save all
              </Button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse tabular-nums">
                <thead>
                  <tr className="border-b border-[#E5E7EB] text-column-header font-bold uppercase text-[#4B5563]">
                    <th className="px-2 py-[7px] text-center">Date</th>
                    <th className="px-2 py-[7px] text-center">Bank</th>
                    <th className="px-2 py-[7px] text-center">Payment ids</th>
                    <th className="px-2 py-[7px] text-center">Advance ids</th>
                    <th className="px-2 py-[7px] text-center">Cash back</th>
                    <th className="px-2 py-[7px] text-center">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {batchRows.map((row, idx) => (
                    <tr key={row.key} className="border-b border-[#E5E7EB]">
                      <td className="px-2 py-[7px]">
                        <DatePicker
                          value={row.deposit_date}
                          onChange={(v) => setBatchRows((prev) => prev.map((r, i) => (i === idx ? { ...r, deposit_date: v } : r)))}
                        />
                      </td>
                      <td className="px-2 py-[7px] min-w-[180px]">
                        <ReferenceSelect
                          size="sm"
                          value={row.bank_account_id || null}
                          onChange={(id) =>
                            setBatchRows((prev) => prev.map((r, i) => (i === idx ? { ...r, bank_account_id: id ?? "" } : r)))
                          }
                          options={bankOptions}
                          placeholder="Bank"
                          createKind="account"
                          operatingCompanyId={companyId}
                        />
                      </td>
                      <td className="px-2 py-[7px]">
                        <input
                          className="h-7 w-full rounded-sm border border-[#E5E7EB] px-2"
                          placeholder="payment ids (comma)"
                          aria-label="Customer payment ids"
                          value={row.payment_ids.join(",")}
                          onChange={(e) =>
                            setBatchRows((prev) =>
                              prev.map((r, i) =>
                                i === idx
                                  ? {
                                      ...r,
                                      payment_ids: e.target.value
                                        .split(",")
                                        .map((s) => s.trim())
                                        .filter(Boolean),
                                    }
                                  : r
                              )
                            )
                          }
                        />
                      </td>
                      <td className="px-2 py-[7px]">
                        <input
                          className="h-7 w-full rounded-sm border border-[#E5E7EB] px-2"
                          placeholder="advance ids (comma)"
                          aria-label="Factoring advance ids"
                          value={row.factoring_advance_ids.join(",")}
                          onChange={(e) =>
                            setBatchRows((prev) =>
                              prev.map((r, i) =>
                                i === idx
                                  ? {
                                      ...r,
                                      factoring_advance_ids: e.target.value
                                        .split(",")
                                        .map((s) => s.trim())
                                        .filter(Boolean),
                                    }
                                  : r
                              )
                            )
                          }
                        />
                      </td>
                      <td className="px-2 py-[7px]">
                        <MoneyInput
                          valueCents={row.cash_back_cents}
                          onChangeCents={(c) => setBatchRows((prev) => prev.map((r, i) => (i === idx ? { ...r, cash_back_cents: c ?? 0 } : r)))}
                        />
                      </td>
                      <td className="px-2 py-[7px] text-center">
                        {row.status === "saved" && row.deposit_id && row.display_id ? <EntityLink kind="deposit" id={row.deposit_id} label={row.display_id} /> : row.status === "error" ? row.error : "draft"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        <section className="space-y-2 rounded-sm border border-[#E5E7EB] bg-white p-3" data-section="deposits-list">
          <h2 className=" font-bold uppercase text-[#4B5563]">Recent deposits</h2>
          <table className="w-full border-collapse tabular-nums">
            <thead>
              <tr className="border-b border-[#E5E7EB] text-column-header font-bold uppercase text-[#4B5563]">
                <th className="px-2 py-[7px] text-center">Deposit</th>
                <th className="px-2 py-[7px] text-center">Date</th>
                <th className="px-2 py-[7px] text-center">Bank</th>
                <th className="px-2 py-[7px] text-center">Amount</th>
                <th className="px-2 py-[7px] text-center">JE</th>
                <th className="px-2 py-[7px] text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(depositsQ.data?.rows ?? []).map((d) => (
                <tr key={d.id} className="border-b border-[#E5E7EB]">
                  <td className="px-2 py-[7px] text-center"><EntityLink kind="deposit" id={d.id} label={d.display_id} /></td>
                  <td className="px-2 py-[7px] text-center">{formatDateUS(d.deposit_date)}</td>
                  <td className="px-2 py-[7px] text-center">{d.bank_account_name ?? "—"}</td>
                  <td className="px-2 py-[7px] text-center">{formatCurrencyFromCents(Number(d.amount_deposited_cents))}</td>
                  <td className="px-2 py-[7px] text-center">
                    {d.journal_entry_id ? <EntityLink kind="journal_entry" id={d.journal_entry_id} label="JE" /> : "—"}
                  </td>
                  <td className="px-2 py-[7px] text-center">
                    {d.voided_at ? (
                      <span className="text-[#6B7280]">Voided</span>
                    ) : (
                      <Button type="button" variant="secondary" onClick={() => setVoidTargetId(d.id)}>
                        Void
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {voidTargetId ? (
            <div className="flex flex-wrap items-end gap-2 border-t border-[#E5E7EB] pt-2">
              <label className="block">
                <span className="mb-1 block font-bold uppercase text-[#4B5563]">Void reason</span>
                <input
                  className="h-7 w-72 rounded-sm border border-[#E5E7EB] px-2"
                  value={voidReason}
                  onChange={(e) => setVoidReason(e.target.value)}
                />
              </label>
              <Button
                type="button"
                disabled={voidReason.trim().length < 3 || voidMut.isPending}
                onClick={() => voidMut.mutate({ id: voidTargetId, reason: voidReason })}
              >
                Confirm void
              </Button>
              <Button type="button" variant="secondary" onClick={() => setVoidTargetId(null)}>
                Cancel
              </Button>
              {voidMut.isError ? <span className=" text-red-700">{userFacingApiError(voidMut.error, "Void failed")}</span> : null}
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}

export default MakeDepositPage;
