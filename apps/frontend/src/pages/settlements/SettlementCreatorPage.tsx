/**
 * ROUND 180 / R-186 — Settlement Creator.
 * Mid form (AlwaysTrack PDF order) + right JE preview. Post disabled until control totals match.
 */
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "../../components/layout/PageHeader";
import { Button } from "../../components/Button";
import { EntityPicker } from "../../components/EntityPicker";
import { DatePicker } from "../../components/forms/DatePicker";
import { MoneyInput } from "../../components/forms/MoneyInput";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { useToast } from "../../components/Toast";
import { formatUsdCents } from "../../lib/money";
import {
  previewSettlementCreator,
  postSettlementCreator,
  type SettlementCreatorDraft,
  type SettlementCreatorPreview,
  type SettlementCreatorFuelCard,
  type SettlementCreatorFactorOption,
} from "../../api/settlementCreator";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";

type LoadDraft = SettlementCreatorDraft["loads"][number];
type FuelDraft = SettlementCreatorDraft["fuel_purchases"][number];
type ExpDraft = SettlementCreatorDraft["expenses"][number];
type MoneyDraft = { description: string; amount_cents: number; load_number?: string | null };

function emptyLoad(): LoadDraft {
  return {
    load_number: "",
    customer_name: "",
    pickup_date: "",
    pickup_city: "",
    delivery_date: "",
    delivery_city: "",
    line_haul_miles: null,
    line_haul_rate_cents: null,
    line_haul_amount_cents: null,
    factoring: "faro_usmca",
    date_sent_to_factoring: "",
    loaded_miles: null,
    empty_miles: null,
    picks: null,
    drops: null,
  };
}

function dollarsToCents(raw: string): number {
  const n = Number(String(raw).replace(/[,$]/g, ""));
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2 rounded-sm border border-[#E5E7EB] bg-white p-3">
      <h2 className="text-center text-section-header font-bold uppercase tracking-wide text-[#4B5563]">{title}</h2>
      {children}
    </section>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1 text-section-header font-semibold uppercase text-[#4B5563]">
      <span className="text-center">{label}</span>
      {children}
    </label>
  );
}

const inputClass =
  "h-7 w-full rounded-sm border border-[#E5E7EB] px-2 text-center text-xs text-[#0F1219]";

export function SettlementCreatorPage() {
  const navigate = useNavigate();
  const { pushToast } = useToast();
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";

  const [settlementNo, setSettlementNo] = useState("");
  const [driverId, setDriverId] = useState<string | null>(null);
  const [unitId, setUnitId] = useState<string | null>(null);
  const [trailerNumber, setTrailerNumber] = useState("");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [loads, setLoads] = useState<LoadDraft[]>([emptyLoad()]);
  const [fuels, setFuels] = useState<FuelDraft[]>([]);
  const [expenses, setExpenses] = useState<ExpDraft[]>([]);
  const [deductions] = useState<MoneyDraft[]>([]);
  const [reimbursements] = useState<MoneyDraft[]>([]);
  const [escrow] = useState<MoneyDraft[]>([]);
  const [advances] = useState<Array<{ description: string; amount_cents: number }>>([]);
  const [pdfCompanyExpenses, setPdfCompanyExpenses] = useState("");
  const [pdfDriverNet, setPdfDriverNet] = useState("");

  const [preview, setPreview] = useState<SettlementCreatorPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wrongEntity = companyId && companyId !== USMCA;

  const draft: SettlementCreatorDraft | null = useMemo(() => {
    if (!companyId || !driverId) return null;
    return {
      operating_company_id: companyId,
      settlement_no: settlementNo.trim(),
      driver_id: driverId,
      unit_id: unitId,
      trailer_equipment_number: trailerNumber.trim() || null,
      period_start: periodStart,
      period_end: periodEnd,
      loads: loads.map((l) => ({
        ...l,
        load_number: l.load_number.trim(),
        pickup_date: l.pickup_date || null,
        delivery_date: l.delivery_date || null,
        date_sent_to_factoring: l.date_sent_to_factoring || null,
      })),
      fuel_purchases: fuels,
      expenses,
      deductions,
      reimbursements,
      escrow,
      advances,
      pdf_company_expenses_cents: dollarsToCents(pdfCompanyExpenses),
      pdf_driver_net_cents: dollarsToCents(pdfDriverNet),
    };
  }, [
    companyId,
    driverId,
    unitId,
    trailerNumber,
    settlementNo,
    periodStart,
    periodEnd,
    loads,
    fuels,
    expenses,
    deductions,
    reimbursements,
    escrow,
    advances,
    pdfCompanyExpenses,
    pdfDriverNet,
  ]);

  async function onPreview() {
    if (!draft) {
      setError("Select a driver and complete the header.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await previewSettlementCreator(draft);
      setPreview(res.preview);
    } catch (e) {
      setError(String((e as Error).message || "Preview failed"));
      setPreview(null);
    } finally {
      setBusy(false);
    }
  }

  async function onPost() {
    if (!draft || !preview?.can_post) return;
    setBusy(true);
    setError(null);
    try {
      const res = await postSettlementCreator(draft);
      pushToast(`Settlement ${res.source_document_ref} posted`, "success");
      navigate(`/driver-finance/settlements?settlement_id=${encodeURIComponent(res.settlement_id)}`);
    } catch (e) {
      setError(String((e as Error).message || "Post failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3" data-testid="settlement-creator-page">
      <PageHeader
        backHref="/driver-finance/settlements"
        title="Settlement Creator"
        subtitle="Type the AlwaysTrack company + driver settlement. Post when preview ties."
      />

      {!companyId ? (
        <p className="text-xs text-red-600">Select an operating company.</p>
      ) : null}
      {wrongEntity ? (
        <p className="text-xs text-red-600" data-testid="settlement-creator-usmca-only">
          Settlement Creator is USMCA only.
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* Mid form */}
        <div className="space-y-3 rounded-sm border border-[#E5E7EB] bg-[#F7F8FA] p-3">
          <Section title="Header">
            <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
              <Field label="Settlement No.">
                <input className={inputClass} value={settlementNo} onChange={(e) => setSettlementNo(e.target.value)} data-testid="sc-settlement-no" />
              </Field>
              <Field label="Driver">
                <EntityPicker
                  kind="driver"
                  operatingCompanyId={companyId}
                  value={driverId}
                  onChange={setDriverId}
                  allowCreate={false}
                  className="mt-0"
                  dataTestId="sc-driver"
                />
              </Field>
              <Field label="Truck">
                <EntityPicker
                  kind="unit"
                  operatingCompanyId={companyId}
                  value={unitId}
                  onChange={setUnitId}
                  allowCreate={false}
                  className="mt-0"
                  dataTestId="sc-unit"
                />
              </Field>
              <Field label="Trailer">
                <input className={inputClass} value={trailerNumber} onChange={(e) => setTrailerNumber(e.target.value)} placeholder="equipment #" data-testid="sc-trailer" />
              </Field>
              <Field label="Start date">
                <DatePicker value={periodStart} onChange={setPeriodStart} className={inputClass} data-testid="sc-start" />
              </Field>
              <Field label="End date">
                <DatePicker value={periodEnd} onChange={setPeriodEnd} className={inputClass} data-testid="sc-end" />
              </Field>
            </div>
          </Section>

          <Section title="Loads">
            {loads.map((load, idx) => (
              <div key={idx} className="space-y-2 border-t border-[#E5E7EB] pt-2 first:border-t-0 first:pt-0">
                <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                  <Field label="Load No.">
                    <input
                      className={inputClass}
                      value={load.load_number}
                      onChange={(e) => {
                        const next = [...loads];
                        next[idx] = { ...load, load_number: e.target.value };
                        setLoads(next);
                      }}
                      data-testid={`sc-load-number-${idx}`}
                    />
                  </Field>
                  <Field label="Customer">
                    <input
                      className={inputClass}
                      value={load.customer_name ?? ""}
                      onChange={(e) => {
                        const next = [...loads];
                        next[idx] = { ...load, customer_name: e.target.value };
                        setLoads(next);
                      }}
                    />
                  </Field>
                  <Field label="Pickup date">
                    <DatePicker
                      className={inputClass}
                      value={load.pickup_date ?? ""}
                      onChange={(v) => {
                        const next = [...loads];
                        next[idx] = { ...load, pickup_date: v };
                        setLoads(next);
                      }}
                    />
                  </Field>
                  <Field label="Delivery date">
                    <DatePicker
                      className={inputClass}
                      value={load.delivery_date ?? ""}
                      onChange={(v) => {
                        const next = [...loads];
                        next[idx] = { ...load, delivery_date: v };
                        setLoads(next);
                      }}
                    />
                  </Field>
                  <Field label="Loaded miles">
                    <input
                      className={inputClass}
                      value={load.loaded_miles ?? ""}
                      onChange={(e) => {
                        const next = [...loads];
                        next[idx] = { ...load, loaded_miles: e.target.value === "" ? null : Number(e.target.value) };
                        setLoads(next);
                      }}
                    />
                  </Field>
                  <Field label="Rate $/mi">
                    <MoneyInput
                      className={inputClass}
                      valueCents={load.line_haul_rate_cents}
                      onChangeCents={(cents) => {
                        const next = [...loads];
                        next[idx] = { ...load, line_haul_rate_cents: cents };
                        setLoads(next);
                      }}
                      ariaLabel="Rate dollars per mile"
                    />
                  </Field>
                  <Field label="Factoring">
                    <select
                      className={inputClass}
                      value={load.factoring}
                      onChange={(e) => {
                        const next = [...loads];
                        next[idx] = { ...load, factoring: e.target.value as SettlementCreatorFactorOption };
                        setLoads(next);
                      }}
                    >
                      <option value="faro_usmca">Faro USMCA</option>
                      <option value="faro_transportation">Faro Transportation</option>
                      <option value="direct">Direct (not factored)</option>
                    </select>
                  </Field>
                  <Field label="Date sent to factoring">
                    <DatePicker
                      className={inputClass}
                      value={load.date_sent_to_factoring ?? ""}
                      onChange={(v) => {
                        const next = [...loads];
                        next[idx] = { ...load, date_sent_to_factoring: v };
                        setLoads(next);
                      }}
                    />
                  </Field>
                </div>
              </div>
            ))}
            <Button type="button" size="sm" variant="secondary" onClick={() => setLoads([...loads, emptyLoad()])}>
              Add load
            </Button>
          </Section>

          <Section title="Fuel purchases">
            {fuels.map((fuel, idx) => (
              <div key={idx} className="grid grid-cols-2 gap-2 border-t border-[#E5E7EB] pt-2 md:grid-cols-4">
                <Field label="Date">
                  <DatePicker className={inputClass} value={fuel.date} onChange={(v) => {
                    const next = [...fuels]; next[idx] = { ...fuel, date: v }; setFuels(next);
                  }} />
                </Field>
                <Field label="Vendor">
                  <input className={inputClass} value={fuel.vendor_name ?? ""} onChange={(e) => {
                    const next = [...fuels]; next[idx] = { ...fuel, vendor_name: e.target.value }; setFuels(next);
                  }} />
                </Field>
                <Field label="Gallons">
                  <input className={inputClass} value={fuel.gallons || ""} onChange={(e) => {
                    const next = [...fuels]; next[idx] = { ...fuel, gallons: Number(e.target.value) || 0 }; setFuels(next);
                  }} />
                </Field>
                <Field label="CPG $">
                  <MoneyInput
                    className={inputClass}
                    valueCents={fuel.cpg_cents || null}
                    onChangeCents={(cents) => {
                      const next = [...fuels];
                      next[idx] = { ...fuel, cpg_cents: cents ?? 0 };
                      setFuels(next);
                    }}
                    ariaLabel="Cents per gallon"
                  />
                </Field>
                <Field label="Receipt $">
                  <MoneyInput
                    className={inputClass}
                    valueCents={fuel.receipt_cents}
                    onChangeCents={(cents) => {
                      const next = [...fuels];
                      next[idx] = { ...fuel, receipt_cents: cents };
                      setFuels(next);
                    }}
                    ariaLabel="Fuel receipt amount"
                  />
                </Field>
                <Field label="Card">
                  <select className={inputClass} value={fuel.card} onChange={(e) => {
                    const next = [...fuels]; next[idx] = { ...fuel, card: e.target.value as SettlementCreatorFuelCard }; setFuels(next);
                  }}>
                    <option value="dreamline">Dreamline</option>
                    <option value="relay">Relay</option>
                  </select>
                </Field>
                <Field label="Load No.">
                  <input className={inputClass} value={fuel.load_number ?? ""} onChange={(e) => {
                    const next = [...fuels]; next[idx] = { ...fuel, load_number: e.target.value }; setFuels(next);
                  }} />
                </Field>
              </div>
            ))}
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() =>
                setFuels([
                  ...fuels,
                  {
                    date: periodStart || new Date().toISOString().slice(0, 10),
                    gallons: 0,
                    cpg_cents: 0,
                    card: "relay",
                    vendor_name: "",
                    load_number: loads[0]?.load_number ?? "",
                  },
                ])
              }
            >
              Add fuel
            </Button>
          </Section>

          <Section title="Expenses">
            {expenses.map((exp, idx) => (
              <div key={idx} className="grid grid-cols-2 gap-2 border-t border-[#E5E7EB] pt-2 md:grid-cols-4">
                <Field label="Date">
                  <DatePicker className={inputClass} value={exp.date} onChange={(v) => {
                    const next = [...expenses]; next[idx] = { ...exp, date: v }; setExpenses(next);
                  }} />
                </Field>
                <Field label="Item">
                  <input className={inputClass} value={exp.item_name} onChange={(e) => {
                    const next = [...expenses]; next[idx] = { ...exp, item_name: e.target.value }; setExpenses(next);
                  }} />
                </Field>
                <Field label="Amount $">
                  <MoneyInput
                    className={inputClass}
                    valueCents={exp.amount_cents || null}
                    onChangeCents={(cents) => {
                      const next = [...expenses];
                      next[idx] = { ...exp, amount_cents: cents ?? 0 };
                      setExpenses(next);
                    }}
                    ariaLabel="Expense amount"
                  />
                </Field>
                <Field label="Load No.">
                  <input className={inputClass} value={exp.load_number ?? ""} onChange={(e) => {
                    const next = [...expenses]; next[idx] = { ...exp, load_number: e.target.value }; setExpenses(next);
                  }} />
                </Field>
                <label className="flex items-center justify-center gap-2 text-xs text-[#0F1219]">
                  <input
                    type="checkbox"
                    checked={exp.is_company_expense}
                    onChange={(e) => {
                      const next = [...expenses];
                      next[idx] = { ...exp, is_company_expense: e.target.checked };
                      setExpenses(next);
                    }}
                  />
                  Comp. Exp. (Y)
                </label>
                <label className="flex items-center justify-center gap-2 text-xs text-[#0F1219]">
                  <input
                    type="checkbox"
                    checked={exp.is_reimbursable}
                    onChange={(e) => {
                      const next = [...expenses];
                      next[idx] = { ...exp, is_reimbursable: e.target.checked };
                      setExpenses(next);
                    }}
                  />
                  Reimb. (Drv)
                </label>
              </div>
            ))}
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() =>
                setExpenses([
                  ...expenses,
                  {
                    date: periodStart || new Date().toISOString().slice(0, 10),
                    item_name: "",
                    amount_cents: 0,
                    is_company_expense: true,
                    is_reimbursable: false,
                    card: "relay",
                    load_number: loads[0]?.load_number ?? "",
                  },
                ])
              }
            >
              Add expense
            </Button>
          </Section>

          <Section title="PDF control totals">
            <div className="grid grid-cols-2 gap-2">
              <Field label="Company EXPENSES (PDF)">
                <input className={inputClass} value={pdfCompanyExpenses} onChange={(e) => setPdfCompanyExpenses(e.target.value)} data-testid="sc-pdf-expenses" />
              </Field>
              <Field label="Driver net (PDF)">
                <input className={inputClass} value={pdfDriverNet} onChange={(e) => setPdfDriverNet(e.target.value)} data-testid="sc-pdf-net" />
              </Field>
            </div>
          </Section>

          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="secondary" loading={busy} onClick={() => void onPreview()} data-testid="sc-preview">
              Preview JE
            </Button>
            <Button
              type="button"
              size="sm"
              variant="primary"
              loading={busy}
              disabled={!preview?.can_post || Boolean(wrongEntity)}
              onClick={() => void onPost()}
              data-testid="sc-post"
            >
              Post settlement
            </Button>
          </div>
          {error ? <p className="text-xs text-red-600" data-testid="sc-error">{error}</p> : null}
        </div>

        {/* Right preview panel */}
        <aside className="rounded-sm border border-[#E5E7EB] bg-white p-3" data-testid="sc-preview-panel">
          <h2 className="mb-2 text-center text-section-header font-bold uppercase tracking-wide text-[#4B5563]">Live JE preview</h2>
          {!preview ? (
            <p className="text-center text-xs text-[#6B7280]">Run Preview to see Dr/Cr lines and control totals.</p>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2 text-center text-xs">
                <div className="rounded-sm border border-[#E5E7EB] p-2">
                  <div className="text-section-header font-bold uppercase text-[#4B5563]">Company EXP</div>
                  <div className={preview.company_expenses_matches_pdf ? "text-[#16A34A]" : "text-red-600"}>
                    {formatUsdCents(preview.company_expenses_cents)}
                  </div>
                </div>
                <div className="rounded-sm border border-[#E5E7EB] p-2">
                  <div className="text-section-header font-bold uppercase text-[#4B5563]">Driver net</div>
                  <div className={preview.driver_net_matches_pdf ? "text-[#16A34A]" : "text-red-600"}>
                    {formatUsdCents(preview.driver_net_cents)}
                  </div>
                </div>
              </div>
              <div className="max-h-[480px] overflow-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-section-header font-bold uppercase text-[#4B5563]">
                      <th className="p-1 text-center">Account</th>
                      <th className="p-1 text-center">Dr</th>
                      <th className="p-1 text-center">Cr</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.je_lines.map((line, i) => (
                      <tr key={i} className="border-t border-[#E5E7EB]">
                        <td className="p-1 text-center">
                          <div className="font-semibold text-[#0F1219]">{line.account_name}</div>
                          <div className="text-section-header text-[#6B7280]">{line.memo}</div>
                        </td>
                        <td className="whitespace-nowrap p-1 text-center">
                          {line.debit_cents ? formatUsdCents(line.debit_cents) : ""}
                        </td>
                        <td className="whitespace-nowrap p-1 text-center">
                          {line.credit_cents ? formatUsdCents(line.credit_cents) : ""}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {preview.blockers.length ? (
                <ul className="list-disc pl-4 text-xs text-red-600">
                  {preview.blockers.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-center text-xs text-[#16A34A]">Ready to post.</p>
              )}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
