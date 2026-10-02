/**
 * ROUND 326 item 2 — the vendor profile surface, one read (GET /api/v1/vendors/:id/profile). Locked vendor layout
 * (DESIGN-DECISIONS-LOCKED: entity header + summary + transaction tables), baseline tokens, tabular-nums on money.
 * Nine blocks, each a value or the engine's named empty reason. Every row drills to its record.
 */
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { apiRequest } from "../../api/client";
import { formatUsdCents } from "../../lib/money";
import { formatDateUS } from "../../lib/formatDate";
import { ParityTable, type ParityColumn } from "../parity/ParityTable";
import { ListErrorState } from "../ListErrorState";
import { resolveEntityRoute } from "../shared/EntityLink";
import { ProfileKpi, ProfileRows, ProfileSection } from "../profile/ProfileBlocks";

type Block<T> = { value: T; empty_reason: string | null };
type Bill = { id: string; bill_no: string | null; bill_date: string | null; due_date: string | null; status: string; amount_cents: number; paid_cents: number; open_cents: number; days_past_due: number };
type Policy = { id: string; insurer_name: string | null; policy_number: string | null; coverage_type: string | null; effective_date: string | null; expiry_date: string | null; status: string | null; total_premium_cents: number; days_to_expiry: number | null };
type WorkOrder = { id: string; wo_no: string | null; status: string; opened_at: string | null; closed_at: string | null; unit_number: string | null; role: string; cost_cents: number | null; vendor_work_order_number: string | null };
type Fuel = { id: string; at: string; gallons: number | null; price_per_gallon: string | null; total_cents: number; location_city: string | null; location_state: string | null; unit_number: string | null };
type Lane = { id: string | null; location_name: string | null; location_type: string | null; city: string | null; state: string | null; source: string; visits: number | null };
type History = { kind: "bill" | "bill_payment" | "expense"; id: string; ref: string | null; txn_date: string | null; amount_cents: number; status: string | null };

export type VendorProfile = {
  vendor: { id: string; name: string };
  ap_aging: Block<{ current_cents: number; d1_30_cents: number; d31_60_cents: number; d61_90_cents: number; d90_plus_cents: number; total_open_cents: number; overdue_cents: number; open_bill_count: number }>;
  open_bills: Block<Bill[]>;
  form_1099: Block<{ tax_year: number; eligible_1099: boolean; has_tax_id: boolean; paid_ytd_cents: number; bill_payments_ytd_cents: number; expenses_ytd_cents: number; threshold_cents: number; reportable: boolean; missing_tax_id: boolean; review_eligibility: boolean }>;
  insurance_authority: Block<{ policies: Policy[]; authority: { mc_number: string | null; dot_number: string | null; safer_status: string | null; authority_status: string | null; out_of_service: string | null; verified_at: string | null } }>;
  work_orders: Block<WorkOrder[]>;
  fuel: Block<{ txns_90d: number; gallons_90d: number; total_cents_90d: number; last_at: string | null; recent: Fuel[] }>;
  lanes: Block<Lane[]>;
  terms: Block<{ terms_name: string | null; days_until_due: number | null; early_payment_discount_pct: number | null; early_payment_discount_days: number | null; default_expense_account: string | null }>;
  history: Block<History[]>;
};

const HISTORY_LABEL: Record<History["kind"], string> = { bill: "Bill", bill_payment: "Bill payment", expense: "Expense" };
const go = (navigate: (to: string) => void, kind: Parameters<typeof resolveEntityRoute>[0], id: string) => {
  const to = resolveEntityRoute(kind, id);
  if (to) navigate(to);
};
const d = (v: string | null) => (v ? formatDateUS(v) : "—");

export function VendorProfileOverview(props: { operatingCompanyId: string; vendorId: string }) {
  const navigate = useNavigate();
  const q = useQuery({
    queryKey: ["vendor-profile", props.operatingCompanyId, props.vendorId],
    queryFn: () => apiRequest<VendorProfile>(`/api/v1/vendors/${props.vendorId}/profile?operating_company_id=${props.operatingCompanyId}`),
  });
  if (q.isLoading) return <div className="text-xs text-[#6B7280]">Loading profile…</div>;
  if (q.isError || !q.data) return <ListErrorState status={0} message="Failed to load the vendor profile." onRetry={() => void q.refetch()} />;
  const p = q.data;
  const a = p.ap_aging.value;
  const f = p.form_1099.value;
  const ia = p.insurance_authority.value;
  const fu = p.fuel.value;
  const t = p.terms.value;

  const billCols: Array<ParityColumn<Bill>> = [
    { key: "bill_no", label: "Bill", sortable: true },
    { key: "bill_date", label: "Date", sortable: true, render: (r) => d(r.bill_date) },
    { key: "due_date", label: "Due", sortable: true, render: (r) => d(r.due_date) },
    { key: "days_past_due", label: "Days past due", sortable: true, kind: "number" },
    { key: "amount_cents", label: "Amount", sortable: true, kind: "money" },
    { key: "open_cents", label: "Open", sortable: true, kind: "money" },
  ];
  const policyCols: Array<ParityColumn<Policy>> = [
    { key: "insurer_name", label: "Insurer", sortable: true },
    { key: "policy_number", label: "Policy", sortable: true },
    { key: "coverage_type", label: "Coverage", sortable: true },
    { key: "effective_date", label: "Effective", sortable: true, render: (r) => d(r.effective_date) },
    { key: "expiry_date", label: "Expires", sortable: true, render: (r) => d(r.expiry_date) },
    { key: "days_to_expiry", label: "Days left", sortable: true, kind: "number" },
    { key: "status", label: "Status", sortable: true },
  ];
  const woCols: Array<ParityColumn<WorkOrder>> = [
    { key: "wo_no", label: "WO", sortable: true },
    { key: "role", label: "Role", sortable: true },
    { key: "status", label: "Status", sortable: true },
    { key: "unit_number", label: "Unit", sortable: true },
    { key: "opened_at", label: "Opened", sortable: true, render: (r) => d(r.opened_at) },
    { key: "closed_at", label: "Closed", sortable: true, render: (r) => d(r.closed_at) },
    { key: "cost_cents", label: "Cost", sortable: true, kind: "money" },
  ];
  const fuelCols: Array<ParityColumn<Fuel>> = [
    { key: "at", label: "Date", sortable: true, render: (r) => d(r.at) },
    { key: "unit_number", label: "Unit", sortable: true },
    { key: "location_city", label: "City", sortable: true },
    { key: "location_state", label: "State", sortable: true },
    { key: "gallons", label: "Gallons", sortable: true, kind: "number" },
    { key: "total_cents", label: "Total", sortable: true, kind: "money" },
  ];
  const laneCols: Array<ParityColumn<Lane>> = [
    { key: "source", label: "Source", sortable: true },
    { key: "location_name", label: "Location", sortable: true, render: (r) => r.location_name ?? "—" },
    { key: "city", label: "City", sortable: true },
    { key: "state", label: "State", sortable: true },
    { key: "visits", label: "Purchases", sortable: true, kind: "number" },
  ];
  const histCols: Array<ParityColumn<History>> = [
    { key: "txn_date", label: "Date", sortable: true, render: (r) => d(r.txn_date) },
    { key: "kind", label: "Type", sortable: true, render: (r) => HISTORY_LABEL[r.kind] },
    { key: "ref", label: "No.", sortable: true },
    { key: "status", label: "Status", sortable: true },
    { key: "amount_cents", label: "Amount", sortable: true, kind: "money" },
  ];

  return (
    <div data-testid="vendor-profile-overview" className="space-y-2">
      <div data-testid="vendor-financial-summary" className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <ProfileKpi label="Open balance" value={formatUsdCents(a.total_open_cents)} />
        <ProfileKpi label="Overdue" value={formatUsdCents(a.overdue_cents)} tone={a.overdue_cents > 0 ? "red" : undefined} />
        <ProfileKpi label={`Paid ${f.tax_year}`} value={formatUsdCents(f.paid_ytd_cents)} />
        <ProfileKpi label="Fuel 90 days" value={formatUsdCents(fu.total_cents_90d)} />
        <ProfileKpi label="Work orders" value={String(p.work_orders.value.length)} />
        <ProfileKpi label="Terms" value={t.terms_name ?? "Not set"} />
      </div>

      <div className="grid gap-2 lg:grid-cols-3">
        <ProfileSection title="AP aging" testId="vendor-profile-ap-aging" reason={p.ap_aging.empty_reason}>
          <ProfileRows rows={[
            ["Current", formatUsdCents(a.current_cents)],
            ["1–30 days", formatUsdCents(a.d1_30_cents)],
            ["31–60 days", formatUsdCents(a.d31_60_cents)],
            ["61–90 days", formatUsdCents(a.d61_90_cents)],
            ["Over 90 days", formatUsdCents(a.d90_plus_cents)],
            [`Total open (${a.open_bill_count} bills)`, formatUsdCents(a.total_open_cents), "font-semibold"],
          ]} />
        </ProfileSection>
        <ProfileSection title={`1099 status — ${f.tax_year}`} testId="vendor-profile-1099" reason={p.form_1099.empty_reason}>
          <ProfileRows rows={[
            ["1099-eligible", f.eligible_1099 ? "Yes" : "No"],
            ["Tax ID on file", f.has_tax_id ? "Yes" : "No", f.missing_tax_id ? "text-red-600" : ""],
            ["Bill payments", formatUsdCents(f.bill_payments_ytd_cents)],
            ["Expenses", formatUsdCents(f.expenses_ytd_cents)],
            ["Paid this year", formatUsdCents(f.paid_ytd_cents), "font-semibold"],
            ["Reporting threshold", formatUsdCents(f.threshold_cents)],
            ["Status", f.reportable ? (f.missing_tax_id ? "Reportable — tax ID missing" : "Reportable") : f.review_eligibility ? "Over threshold — not marked eligible" : "Below threshold or not eligible", f.missing_tax_id || f.review_eligibility ? "text-red-600" : ""],
          ]} />
        </ProfileSection>
        <ProfileSection title="Terms" testId="vendor-profile-terms" reason={p.terms.empty_reason}>
          <ProfileRows rows={[
            ["Payment terms", t.terms_name ?? "Not set"],
            ["Days until due", t.days_until_due == null ? "—" : String(t.days_until_due)],
            ["Early-pay discount", t.early_payment_discount_pct == null ? "—" : `${t.early_payment_discount_pct}% in ${t.early_payment_discount_days ?? "—"} days`],
            ["Default expense account", t.default_expense_account ?? "Not set"],
          ]} />
        </ProfileSection>
      </div>

      <ProfileSection title={`Open bills (${p.open_bills.value.length})`} testId="vendor-profile-open-bills" reason={p.open_bills.empty_reason}>
        {p.open_bills.value.length ? <ParityTable columns={billCols} rows={p.open_bills.value} rowKey={(r) => r.id} onRowClick={(r) => go(navigate, "bill", r.id)} density="compact" suppressToolbarRange /> : null}
      </ProfileSection>

      <ProfileSection title="Insurance & authority" testId="vendor-profile-insurance-authority" reason={p.insurance_authority.empty_reason}>
        <ProfileRows rows={[
          ["MC / DOT", `${ia.authority.mc_number ?? "—"} / ${ia.authority.dot_number ?? "—"}`],
          ["SAFER status", ia.authority.safer_status ?? "Not verified"],
          ["Authority", ia.authority.authority_status ?? "—"],
          ["Operating status", ia.authority.out_of_service ?? "—"],
          ["Verified", d(ia.authority.verified_at)],
        ]} />
        {ia.policies.length ? <ParityTable columns={policyCols} rows={ia.policies} rowKey={(r) => r.id} density="compact" suppressToolbarRange /> : null}
      </ProfileSection>

      <ProfileSection title={`Work orders (${p.work_orders.value.length})`} testId="vendor-profile-work-orders" reason={p.work_orders.empty_reason}>
        {p.work_orders.value.length ? <ParityTable columns={woCols} rows={p.work_orders.value} rowKey={(r) => r.id} onRowClick={(r) => go(navigate, "work_order", r.id)} density="compact" suppressToolbarRange /> : null}
      </ProfileSection>

      <ProfileSection title={`Fuel — ${fu.txns_90d} purchases, ${fu.gallons_90d.toLocaleString()} gal in 90 days`} testId="vendor-profile-fuel" reason={p.fuel.empty_reason}>
        {fu.recent.length ? <ParityTable columns={fuelCols} rows={fu.recent} rowKey={(r) => r.id} density="compact" suppressToolbarRange /> : null}
      </ProfileSection>

      <div className="grid gap-2 lg:grid-cols-2">
        <ProfileSection title={`Lanes & locations (${p.lanes.value.length})`} testId="vendor-profile-lanes" reason={p.lanes.empty_reason}>
          {p.lanes.value.length ? <ParityTable columns={laneCols} rows={p.lanes.value} rowKey={(r) => `${r.source}:${r.id ?? ""}:${r.city ?? ""}:${r.state ?? ""}`} density="compact" suppressToolbarRange /> : null}
        </ProfileSection>
        <ProfileSection title={`History (${p.history.value.length})`} testId="vendor-profile-history" reason={p.history.empty_reason}>
          {p.history.value.length ? <ParityTable columns={histCols} rows={p.history.value} rowKey={(r) => `${r.kind}:${r.id}`} onRowClick={(r) => go(navigate, r.kind, r.id)} density="compact" suppressToolbarRange /> : null}
        </ProfileSection>
      </div>
    </div>
  );
}
