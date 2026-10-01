/**
 * ROUND 312 B-3 — Batch Settlements grid (§23).
 * Per row: driver, period, SET-01 loads auto-pulled, deductions, advances.
 * Save all → driver_finance.* via settlement creator only.
 */
import { useMemo, useRef, useState, type ClipboardEvent } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { Button } from "../../components/Button";
import { DatePicker } from "../../components/forms/DatePicker";
import { MoneyInput } from "../../components/forms/MoneyInput";
import { ReferenceSelect, type ReferenceOption } from "../../components/parity/ReferenceSelect";
import { EntityLink } from "../../components/shared/EntityLink";
import { ListErrorBanner } from "../../components/shared/ListErrorBanner";
import { NavyPageSubNav } from "../../components/layout/NavyPageSubNav";
import { listDrivers } from "../../api/mdata";
import {
  listBatchSettlementEligibleLoads,
  postBatchSettlements,
  type Set01EligibleLoad,
} from "../../api/batchSettlements";
import { formatCurrencyFromCents } from "../lists/accounting/coa-list-utils";
import { formatDateUS } from "../../lib/formatDate";
import { userFacingApiError } from "../../lib/api-error-message";

type BatchRow = {
  key: string;
  driver_id: string;
  period_start: string;
  period_end: string;
  settlement_no: string;
  deduction_cents: number;
  deduction_desc: string;
  advance_cents: number;
  advance_desc: string;
  admin_fee_cents: number;
  loads: Set01EligibleLoad[];
  loads_error: string | null;
  status: "draft" | "saved" | "error";
  error: string | null;
  settlement_id: string | null;
  source_document_ref: string | null;
  display_id: string | null;
};

function todayChicago(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function weekStart(d: string): string {
  const dt = new Date(`${d}T12:00:00`);
  const day = dt.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  dt.setDate(dt.getDate() + diff);
  return dt.toISOString().slice(0, 10);
}

function newBatchRow(today: string): BatchRow {
  const start = weekStart(today);
  return {
    key: crypto.randomUUID(),
    driver_id: "",
    period_start: start,
    period_end: today,
    settlement_no: "",
    deduction_cents: 0,
    deduction_desc: "Deduction",
    advance_cents: 0,
    advance_desc: "Cash advance",
    admin_fee_cents: 0,
    loads: [],
    loads_error: null,
    status: "draft",
    error: null,
    settlement_id: null,
    source_document_ref: null,
    display_id: null,
  };
}

export function BatchSettlementsPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const today = todayChicago();
  const [rows, setRows] = useState<BatchRow[]>(() => [newBatchRow(today), newBatchRow(today)]);
  const pasteRef = useRef<HTMLTextAreaElement | null>(null);

  const driversQ = useQuery({
    queryKey: ["batch-settlements", "drivers", companyId],
    queryFn: () => listDrivers({ operating_company_id: companyId, limit: 500 }),
    enabled: !!companyId,
  });

  const driverOptions = useMemo<ReferenceOption[]>(() => {
    const list = driversQ.data?.drivers ?? [];
    return list.map((d) => ({
      value: d.id,
      label:
        (d as { full_name?: string }).full_name ||
        [d.first_name, d.last_name].filter(Boolean).join(" ") ||
        d.id.slice(0, 8),
    }));
  }, [driversQ.data]);

  const refreshLoads = async (idx: number, row: BatchRow) => {
    if (!companyId || !row.driver_id || !row.period_start || !row.period_end) return;
    try {
      const res = await listBatchSettlementEligibleLoads({
        operating_company_id: companyId,
        driver_id: row.driver_id,
        period_start: row.period_start,
        period_end: row.period_end,
      });
      setRows((prev) =>
        prev.map((r, i) =>
          i === idx
            ? {
                ...r,
                loads: res.rows.filter((l) => !l.already_on_closed_settlement),
                loads_error: null,
              }
            : r,
        ),
      );
    } catch (err) {
      setRows((prev) =>
        prev.map((r, i) =>
          i === idx ? { ...r, loads: [], loads_error: userFacingApiError(err, "Load pull failed") } : r,
        ),
      );
    }
  };

  const saveMut = useMutation({
    mutationFn: async () => {
      const payloadRows = rows
        .map((r, index) => ({ r, index }))
        .filter(({ r }) => r.status !== "saved" && r.driver_id && r.loads.length > 0)
        .map(({ r, index }) => ({
          index,
          body: {
            driver_id: r.driver_id,
            period_start: r.period_start,
            period_end: r.period_end,
            settlement_no: r.settlement_no.trim() || null,
            load_ids: r.loads.map((l) => l.load_id),
            deductions:
              r.deduction_cents > 0
                ? [{ description: r.deduction_desc || "Deduction", amount_cents: r.deduction_cents }]
                : [],
            advances:
              r.advance_cents > 0
                ? [{ description: r.advance_desc || "Cash advance", amount_cents: r.advance_cents }]
                : [],
            admin_fee_cents: r.admin_fee_cents > 0 ? r.admin_fee_cents : null,
            confirmed_zero_fuel_purchases: true,
          },
        }));
      if (!payloadRows.length) throw new Error("Add at least one row with a driver and SET-01 loads.");
      const res = await postBatchSettlements({
        operating_company_id: companyId,
        rows: payloadRows.map((p) => p.body),
      });
      setRows((prev) => {
        const next = [...prev];
        for (const result of res.results) {
          const mapped = payloadRows[result.index];
          if (!mapped) continue;
          const target = mapped.index;
          if (result.ok) {
            next[target] = {
              ...next[target]!,
              status: "saved",
              error: null,
              settlement_id: result.settlement.settlement_id,
              source_document_ref: result.settlement.source_document_ref,
              display_id: result.settlement.display_id,
            };
          } else {
            next[target] = {
              ...next[target]!,
              status: "error",
              error: result.message || result.error,
            };
          }
        }
        return next;
      });
      return res;
    },
  });

  const onPaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const text = e.clipboardData.getData("text/plain");
    if (!text.trim()) return;
    e.preventDefault();
    const lines = text.trim().split(/\r?\n/).filter(Boolean);
    const parsed = lines.map((line) => {
      const cols = line.split("\t");
      const row = newBatchRow(today);
      row.period_start = cols[0]?.trim() || row.period_start;
      row.period_end = cols[1]?.trim() || row.period_end;
      row.settlement_no = cols[2]?.trim() || "";
      return row;
    });
    setRows((prev) => [...prev.filter((r) => r.status === "saved" || r.driver_id), ...parsed]);
    if (pasteRef.current) pasteRef.current.value = "";
  };

  const fillDown = (field: "period_start" | "period_end" | "driver_id", fromIdx: number) => {
    setRows((prev) => {
      const src = prev[fromIdx];
      if (!src) return prev;
      return prev.map((r, i) => (i <= fromIdx || r.status === "saved" ? r : { ...r, [field]: src[field] }));
    });
  };

  const navItems = [
    { label: "Settlements", to: "/driver-finance/settlements" },
    { label: "Batch Settlements", to: "/driver-finance/settlements/batch" },
    { label: "Company Settlements", to: "/driver-finance/company-settlements" },
    { label: "Settlement Close", to: "/driver-finance/settlement-close" },
    { label: "Pre-Settlements", to: "/drivers/pre-settlements" },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[#F7F8FA]" data-page="batch-settlements">
      <NavyPageSubNav items={navItems} />
      <div className="mx-auto w-full max-w-[1400px] space-y-4 p-4">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h1 className="text-page-title font-semibold text-[#0F1219]">Batch Settlements</h1>
            <p className="text-xs text-[#6B7280]">
              §23 grid — driver + period auto-pulls SET-01 loads; Save all posts each row through the Settlement Creator
              engine (driver_finance.* only). One JE per settlement.
            </p>
          </div>
          <Link
            className="inline-flex h-7 items-center rounded-sm border border-[#E5E7EB] bg-white px-2 text-xs text-[#1F2A44]"
            to="/driver-finance/settlements?creator=1"
          >
            Single Settlement Creator
          </Link>
        </div>

        {(driversQ.isError || saveMut.isError) && (
          <ListErrorBanner
            message={
              driversQ.isError
                ? userFacingApiError(driversQ.error, "Drivers failed to load")
                : userFacingApiError(saveMut.error, "Batch save failed")
            }
          />
        )}

        <section className="space-y-3 rounded-sm border border-[#E5E7EB] bg-white p-3" data-section="batch-settlements-grid">
          <p className="text-column-header font-bold uppercase text-[#4B5563]">Paste / fill-down / duplicate</p>
          <textarea
            ref={pasteRef}
            className="h-16 w-full rounded-sm border border-[#E5E7EB] p-2 text-xs"
            placeholder="Paste TSV: period_start · period_end · settlement# (optional)"
            onPaste={onPaste}
            aria-label="Paste settlement batch rows"
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setRows((prev) => [...prev, newBatchRow(today)])}
            >
              Add row
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() =>
                setRows((prev) => {
                  const last = prev[prev.length - 1];
                  if (!last) return [newBatchRow(today)];
                  return [...prev, { ...newBatchRow(today), ...last, key: crypto.randomUUID(), status: "draft", error: null, settlement_id: null, source_document_ref: null, display_id: null, loads: last.loads }];
                })
              }
            >
              Duplicate last
            </Button>
            <Button type="button" variant="primary" disabled={saveMut.isPending || !companyId} onClick={() => saveMut.mutate()}>
              {saveMut.isPending ? "Saving…" : "Save all"}
            </Button>
            {saveMut.data && (
              <span className="text-xs text-[#6B7280]">
                Saved {saveMut.data.saved} · Failed {saveMut.data.failed}
              </span>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="border-b border-[#E5E7EB] text-column-header font-bold uppercase text-[#4B5563]">
                  <th className="px-2 py-1.5 text-center">Driver</th>
                  <th className="px-2 py-1.5 text-center">Period start</th>
                  <th className="px-2 py-1.5 text-center">Period end</th>
                  <th className="px-2 py-1.5 text-center">Settlement #</th>
                  <th className="px-2 py-1.5 text-center">SET-01 loads</th>
                  <th className="px-2 py-1.5 text-center">Deduction</th>
                  <th className="px-2 py-1.5 text-center">Advance</th>
                  <th className="px-2 py-1.5 text-center">Admin fee</th>
                  <th className="px-2 py-1.5 text-center">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => (
                  <tr key={row.key} className="border-b border-[#E5E7EB] align-top" data-testid={`batch-settlement-row-${idx}`}>
                    <td className="px-2 py-1.5">
                      <ReferenceSelect
                        value={row.driver_id || null}
                        onChange={(v) => {
                          const next = { ...row, driver_id: v ?? "" };
                          setRows((prev) => prev.map((r, i) => (i === idx ? next : r)));
                          void refreshLoads(idx, next);
                        }}
                        options={driverOptions}
                        placeholder="Driver"
                        disabled={row.status === "saved"}
                      />
                      <button
                        type="button"
                        className="mt-1 text-[10px] text-[#6B7280] underline"
                        onClick={() => fillDown("driver_id", idx)}
                      >
                        Fill down
                      </button>
                    </td>
                    <td className="px-2 py-1.5">
                      <DatePicker
                        value={row.period_start}
                        onChange={(v) => {
                          const next = { ...row, period_start: v };
                          setRows((prev) => prev.map((r, i) => (i === idx ? next : r)));
                          void refreshLoads(idx, next);
                        }}
                        disabled={row.status === "saved"}
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <DatePicker
                        value={row.period_end}
                        onChange={(v) => {
                          const next = { ...row, period_end: v };
                          setRows((prev) => prev.map((r, i) => (i === idx ? next : r)));
                          void refreshLoads(idx, next);
                        }}
                        disabled={row.status === "saved"}
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        className="h-7 w-24 rounded-sm border border-[#E5E7EB] px-2 text-center text-xs"
                        value={row.settlement_no}
                        onChange={(e) =>
                          setRows((prev) =>
                            prev.map((r, i) => (i === idx ? { ...r, settlement_no: e.target.value } : r)),
                          )
                        }
                        placeholder="AT #"
                        disabled={row.status === "saved"}
                      />
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      {row.loads_error ? (
                        <span className="text-[#B91C1C]">{row.loads_error}</span>
                      ) : row.loads.length === 0 ? (
                        <span className="text-[#6B7280]">—</span>
                      ) : (
                        <div className="space-y-0.5">
                          {row.loads.map((l) => (
                            <div key={l.load_id}>
                              <EntityLink kind="load" id={l.load_id} label={l.load_number} />
                              <span className="ml-1 text-[#6B7280]">
                                {l.pickup_date ? formatDateUS(l.pickup_date) : "?"} →{" "}
                                {l.delivery_date ? formatDateUS(l.delivery_date) : "open"}
                              </span>
                            </div>
                          ))}
                          <div className="text-[#6B7280]">
                            {row.loads.length} load{row.loads.length === 1 ? "" : "s"} ·{" "}
                            {formatCurrencyFromCents(
                              row.loads.reduce((s, l) => s + (l.rate_total_cents ?? 0), 0),
                            )}
                          </div>
                        </div>
                      )}
                      <button
                        type="button"
                        className="mt-1 text-[10px] text-[#6B7280] underline"
                        onClick={() => void refreshLoads(idx, row)}
                        disabled={!row.driver_id || row.status === "saved"}
                      >
                        Refresh SET-01
                      </button>
                    </td>
                    <td className="px-2 py-1.5">
                      <MoneyInput
                        valueCents={row.deduction_cents}
                        onChangeCents={(cents) =>
                          setRows((prev) =>
                            prev.map((r, i) => (i === idx ? { ...r, deduction_cents: cents ?? 0 } : r)),
                          )
                        }
                        disabled={row.status === "saved"}
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <MoneyInput
                        valueCents={row.advance_cents}
                        onChangeCents={(cents) =>
                          setRows((prev) =>
                            prev.map((r, i) => (i === idx ? { ...r, advance_cents: cents ?? 0 } : r)),
                          )
                        }
                        disabled={row.status === "saved"}
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <MoneyInput
                        valueCents={row.admin_fee_cents}
                        onChangeCents={(cents) =>
                          setRows((prev) =>
                            prev.map((r, i) => (i === idx ? { ...r, admin_fee_cents: cents ?? 0 } : r)),
                          )
                        }
                        disabled={row.status === "saved"}
                      />
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      {row.status === "saved" && row.settlement_id ? (
                        <EntityLink
                          kind="settlement"
                          id={row.settlement_id}
                          label={row.source_document_ref || row.display_id || "Settlement"}
                        />
                      ) : row.status === "error" ? (
                        <span className="text-[#B91C1C]">{row.error}</span>
                      ) : (
                        <span className="text-[#6B7280]">Draft</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
