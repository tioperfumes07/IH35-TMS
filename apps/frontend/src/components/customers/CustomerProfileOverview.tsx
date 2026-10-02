/**
 * ROUND 326 item 1B — the customer profile surface, one read (GET /api/v1/customers/:id/profile).
 * Locked customer layout (DESIGN-DECISIONS-LOCKED: entity header + financial summary + transaction tables),
 * GLOBAL-TYPE-SIZE-BASELINE tokens, tabular-nums on every money figure. Each block renders its value or the
 * engine's named empty reason — never a placeholder. Every row drills to its record (invoice/payment/load/vendor).
 */
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { apiRequest } from "../../api/client";
import { formatUsdCents } from "../../lib/money";
import { formatDateUS } from "../../lib/formatDate";
import { ParityTable, type ParityColumn } from "../parity/ParityTable";
import { ListErrorState } from "../ListErrorState";
import { ProfileKpi, ProfileSection } from "../profile/ProfileBlocks";

type Block<T> = { value: T; empty_reason: string | null };
type OpenLoad = { id: string; load_number: string; status: string; rate_total_cents: number; origin: string | null; destination: string | null; invoiced: boolean };
type Payment = { id: string; display_id: string | null; payment_date: string | null; payment_method: string | null; reference: string | null; amount_cents: number; amount_applied_cents: number; amount_unapplied_cents: number; days_to_pay: number | null };
type Doc = { file_id: string; original_filename: string; mime_type: string | null; document_date: string | null; expiration_date: string | null; linked_at: string };
type Contact = { id: string; name: string; title: string | null; email: string | null; phone: string | null; mobile: string | null; department: string | null; is_primary: boolean };
type Rate = { load_id: string; load_number: string; rate_total_cents: number; loaded_miles: number | null; origin: string | null; destination: string | null; pickup_at: string; rate_per_mile_cents: number | null };

export type CustomerProfile = {
  customer: { id: string; name: string; status: string };
  ar_aging: Block<{ current_cents: number; d1_30_cents: number; d31_60_cents: number; d61_90_cents: number; d90_plus_cents: number; total_open_cents: number; overdue_cents: number; open_invoice_count: number }>;
  credit: Block<{ credit_limit_cents: number | null; credit_limit_source: string | null; open_ar_cents: number; uninvoiced_open_load_cents: number; exposure_cents: number; available_cents: number | null; over_limit: boolean }>;
  open_loads: Block<OpenLoad[]>;
  payment_history: Block<{ payment_count: number; paid_cents: number; last_payment_date: string | null; avg_days_to_pay: number | null; recent: Payment[] }>;
  factoring: Block<{ eligible: boolean; factoring_company_vendor_id: string | null; factoring_company_name: string | null; recourse_type: string | null; advance_rate_override: number | null; reserve_pct_override: number | null; purchased_line_count: number; purchased_gross_cents: number; last_purchase_date: string | null }>;
  documents: Block<Doc[]>;
  contacts: Block<Contact[]>;
  rate_history: Block<Rate[]>;
};

const money = "tabular-nums";
const Section = ProfileSection;
const Kpi = ProfileKpi;

export function CustomerProfileOverview(props: { operatingCompanyId: string; customerId: string }) {
  const navigate = useNavigate();
  const q = useQuery({
    queryKey: ["customer-profile", props.operatingCompanyId, props.customerId],
    queryFn: () =>
      apiRequest<CustomerProfile>(`/api/v1/customers/${props.customerId}/profile?operating_company_id=${props.operatingCompanyId}`),
  });
  if (q.isLoading) return <div className="text-xs text-[color:var(--ih-muted)]">Loading profile…</div>;
  if (q.isError || !q.data) return <ListErrorState status={0} message="Failed to load the customer profile." onRetry={() => void q.refetch()} />;
  const p = q.data;
  const a = p.ar_aging.value;
  const c = p.credit.value;
  const f = p.factoring.value;
  const ph = p.payment_history.value;

  const loadCols: Array<ParityColumn<OpenLoad>> = [
    { key: "load_number", label: "Load", sortable: true },
    { key: "status", label: "Status", sortable: true },
    { key: "origin", label: "Origin", sortable: true },
    { key: "destination", label: "Destination", sortable: true },
    { key: "rate_total_cents", label: "Rate", sortable: true, kind: "money" },
    { key: "invoiced", label: "Invoiced", sortable: true, render: (r) => (r.invoiced ? "Yes" : "No"), sortValue: (r) => (r.invoiced ? 1 : 0) },
  ];
  const payCols: Array<ParityColumn<Payment>> = [
    { key: "payment_date", label: "Date", sortable: true, render: (r) => (r.payment_date ? formatDateUS(r.payment_date) : "—") },
    { key: "display_id", label: "No.", sortable: true },
    { key: "payment_method", label: "Method", sortable: true },
    { key: "reference", label: "Reference", sortable: true },
    { key: "amount_cents", label: "Amount", sortable: true, kind: "money" },
    { key: "amount_unapplied_cents", label: "Unapplied", sortable: true, kind: "money" },
    { key: "days_to_pay", label: "Days to pay", sortable: true, kind: "number" },
  ];
  const rateCols: Array<ParityColumn<Rate>> = [
    { key: "pickup_at", label: "Pickup", sortable: true, render: (r) => formatDateUS(r.pickup_at) },
    { key: "load_number", label: "Load", sortable: true },
    { key: "origin", label: "Origin", sortable: true },
    { key: "destination", label: "Destination", sortable: true },
    { key: "loaded_miles", label: "Loaded mi", sortable: true, kind: "number" },
    { key: "rate_total_cents", label: "Rate", sortable: true, kind: "money" },
    { key: "rate_per_mile_cents", label: "Rate / mi", sortable: true, kind: "money" },
  ];
  const docCols: Array<ParityColumn<Doc>> = [
    { key: "original_filename", label: "File", sortable: true },
    { key: "document_date", label: "Doc date", sortable: true, render: (r) => (r.document_date ? formatDateUS(r.document_date) : "—") },
    { key: "expiration_date", label: "Expires", sortable: true, render: (r) => (r.expiration_date ? formatDateUS(r.expiration_date) : "—") },
    { key: "linked_at", label: "Linked", sortable: true, render: (r) => formatDateUS(r.linked_at) },
  ];
  const contactCols: Array<ParityColumn<Contact>> = [
    { key: "name", label: "Name", sortable: true, render: (r) => `${r.name}${r.is_primary ? " (primary)" : ""}` },
    { key: "title", label: "Title", sortable: true },
    { key: "department", label: "Department", sortable: true },
    { key: "email", label: "Email", sortable: true },
    { key: "phone", label: "Phone", sortable: true },
    { key: "mobile", label: "Mobile", sortable: true },
  ];

  return (
    <div data-testid="customer-profile-overview" className="space-y-2">
      <div data-testid="customer-financial-summary" className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Kpi label="Open balance" value={formatUsdCents(a.total_open_cents)} />
        <Kpi label="Overdue" value={formatUsdCents(a.overdue_cents)} tone={a.overdue_cents > 0 ? "red" : undefined} />
        <Kpi label="Credit limit" value={c.credit_limit_cents == null ? "Not set" : formatUsdCents(c.credit_limit_cents)} />
        <Kpi label="Exposure" value={formatUsdCents(c.exposure_cents)} tone={c.over_limit ? "red" : undefined} />
        <Kpi label="Available" value={c.available_cents == null ? "—" : formatUsdCents(c.available_cents)} tone={c.available_cents != null && c.available_cents < 0 ? "red" : "green"} />
        <Kpi label="Avg days to pay" value={ph.avg_days_to_pay == null ? "—" : String(ph.avg_days_to_pay)} />
      </div>

      <div className="grid gap-2 lg:grid-cols-3">
        <Section title="AR aging" testId="customer-profile-ar-aging" reason={p.ar_aging.empty_reason}>
          <table className={`w-full ${money}`}>
            <tbody>
              {([
                ["Current", a.current_cents],
                ["1–30 days", a.d1_30_cents],
                ["31–60 days", a.d31_60_cents],
                ["61–90 days", a.d61_90_cents],
                ["Over 90 days", a.d90_plus_cents],
              ] as const).map(([label, cents]) => (
                <tr key={label} className="border-b border-[color:var(--ih-rule)]">
                  <td className="py-1">{label}</td>
                  <td className="py-1 text-right">{formatUsdCents(cents)}</td>
                </tr>
              ))}
              <tr className="font-semibold">
                <td className="py-1">Total open ({a.open_invoice_count} invoices)</td>
                <td className="py-1 text-right">{formatUsdCents(a.total_open_cents)}</td>
              </tr>
            </tbody>
          </table>
        </Section>

        <Section title="Credit limit & exposure" testId="customer-profile-credit" reason={p.credit.empty_reason}>
          <table className={`w-full ${money}`}>
            <tbody>
              <tr className="border-b border-[color:var(--ih-rule)]"><td className="py-1">Open AR</td><td className="py-1 text-right">{formatUsdCents(c.open_ar_cents)}</td></tr>
              <tr className="border-b border-[color:var(--ih-rule)]"><td className="py-1">Open loads not yet invoiced</td><td className="py-1 text-right">{formatUsdCents(c.uninvoiced_open_load_cents)}</td></tr>
              <tr className="border-b border-[color:var(--ih-rule)] font-semibold"><td className="py-1">Exposure</td><td className={`py-1 text-right ${c.over_limit ? "text-red-600" : ""}`}>{formatUsdCents(c.exposure_cents)}</td></tr>
              <tr><td className="py-1">Limit{c.credit_limit_source ? ` (${c.credit_limit_source})` : ""}</td><td className="py-1 text-right">{c.credit_limit_cents == null ? "Not set" : formatUsdCents(c.credit_limit_cents)}</td></tr>
            </tbody>
          </table>
        </Section>

        <Section title="Factoring eligibility" testId="customer-profile-factoring" reason={p.factoring.empty_reason}>
          <table className={`w-full ${money}`}>
            <tbody>
              <tr className="border-b border-[color:var(--ih-rule)]"><td className="py-1">Eligible</td><td className="py-1 text-right">{f.eligible ? "Yes" : "No"}</td></tr>
              <tr className="border-b border-[color:var(--ih-rule)]">
                <td className="py-1">Factor</td>
                <td className="py-1 text-right">
                  {f.factoring_company_vendor_id ? (
                    <button type="button" className="text-[color:var(--ih-green)] underline" onClick={() => navigate(`/vendors/${f.factoring_company_vendor_id}`)}>
                      {f.factoring_company_name ?? "Factor"}
                    </button>
                  ) : "None assigned"}
                </td>
              </tr>
              <tr className="border-b border-[color:var(--ih-rule)]"><td className="py-1">Recourse</td><td className="py-1 text-right">{f.recourse_type ?? "Factor default"}</td></tr>
              <tr className="border-b border-[color:var(--ih-rule)]"><td className="py-1">Purchased lines</td><td className="py-1 text-right">{f.purchased_line_count}</td></tr>
              <tr><td className="py-1">Purchased gross</td><td className="py-1 text-right">{formatUsdCents(f.purchased_gross_cents)}</td></tr>
            </tbody>
          </table>
        </Section>
      </div>

      <Section title={`Open loads (${p.open_loads.value.length})`} testId="customer-profile-open-loads" reason={p.open_loads.empty_reason}>
        {p.open_loads.value.length ? (
          <ParityTable columns={loadCols} rows={p.open_loads.value} rowKey={(r) => r.id} onRowClick={(r) => navigate(`/dispatch/loads/${r.id}`)} density="compact" suppressToolbarRange />
        ) : null}
      </Section>

      <Section title={`Payment history (${ph.payment_count} · ${formatUsdCents(ph.paid_cents)})`} testId="customer-profile-payments" reason={p.payment_history.empty_reason}>
        {ph.recent.length ? (
          <ParityTable columns={payCols} rows={ph.recent} rowKey={(r) => r.id} onRowClick={(r) => navigate(`/accounting/payments/${r.id}`)} density="compact" suppressToolbarRange />
        ) : null}
      </Section>

      <Section title={`Rate history (${p.rate_history.value.length})`} testId="customer-profile-rate-history" reason={p.rate_history.empty_reason}>
        {p.rate_history.value.length ? (
          <ParityTable columns={rateCols} rows={p.rate_history.value} rowKey={(r) => r.load_id} onRowClick={(r) => navigate(`/dispatch/loads/${r.load_id}`)} density="compact" suppressToolbarRange />
        ) : null}
      </Section>

      <div className="grid gap-2 lg:grid-cols-2">
        <Section title={`Contacts (${p.contacts.value.length})`} testId="customer-profile-contacts" reason={p.contacts.empty_reason}>
          {p.contacts.value.length ? <ParityTable columns={contactCols} rows={p.contacts.value} rowKey={(r) => r.id} density="compact" suppressToolbarRange /> : null}
        </Section>
        <Section title={`Documents (${p.documents.value.length})`} testId="customer-profile-documents" reason={p.documents.empty_reason}>
          {p.documents.value.length ? <ParityTable columns={docCols} rows={p.documents.value} rowKey={(r) => r.file_id} onRowClick={(r) => navigate(`/documents?file=${r.file_id}`)} density="compact" suppressToolbarRange /> : null}
        </Section>
      </div>
    </div>
  );
}
