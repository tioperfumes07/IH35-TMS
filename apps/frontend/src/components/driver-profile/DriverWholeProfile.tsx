/**
 * ROUND 326 item 3 — the whole driver in one read (GET /api/v1/drivers/:id/whole-profile). Seventeen blocks, each a
 * value or the engine's named empty reason (never a placeholder). Locked baseline tokens, tabular-nums on money,
 * sortable ParityTables, every row drills to its record through resolveEntityRoute.
 */
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { apiRequest } from "../../api/client";
import { formatUsdCents } from "../../lib/money";
import { formatDateUS } from "../../lib/formatDate";
import { ParityTable, type ParityColumn } from "../parity/ParityTable";
import { ListErrorState } from "../ListErrorState";
import { EntityLink, resolveEntityRoute, type EntityKind } from "../shared/EntityLink";
import { ProfileKpi, ProfileRows, ProfileSection } from "../profile/ProfileBlocks";

type Block<T> = { value: T; empty_reason: string | null };
type Rate = { id: string; basis_type: string; rate_per_mile_cents: number | null; rate_empty_per_mile_cents: number | null; flat_per_load_cents: number | null; miles_basis: string | null; effective_from: string | null; effective_to: string | null; is_active: boolean; is_test_data: boolean };
type Line = { id: string; line_type: string | null; category: string | null; description: string | null; amount_cents: number; load_id: string | null };
type Settlement = { id: string; display_id: string | null; status: string; period_start: string | null; period_end: string | null; first_load_number: string | null; last_load_number: string | null; gross_cents: number; deductions_cents: number; reimbursements_cents: number; net_cents: number; paid_at: string | null; lines: Line[] };
type Advance = { id: string; display_id: string | null; amount_cents: number; outstanding_cents: number; purpose: string | null; status: string | null; posting_date: string | null; load_id: string | null };
type EscrowAccount = { id: string; purpose: string | null; status: string | null; balance_cents: number };
type EscrowPosting = { id: string; posting_type: string; amount_cents: number; source_type: string | null; note: string | null; posted_at: string; linked_journal_entry_id: string | null };
type Deduction = { id: string; deduction_type: string; amount_cents: number; remaining_balance_cents: number | null; reason: string | null; status: string | null; applied_to_settlement_id: string | null; load_id: string | null; created_at: string };
type Reimb = { id: string; reimbursement_type: string | null; amount_cents: number; reason: string | null; status: string | null; posting_date: string | null; load_id: string | null };
type Fuel = { id: string; at: string; gallons: number | null; total_cents: number; location_city: string | null; location_state: string | null; unit_number: string | null; vendor_name: string | null };
type UnitAssign = { id: string; unit_id: string; unit_number: string | null; started_at: string | null; ended_at: string | null; source: string | null };
type Trailer = { id: string; equipment_number: string | null; equipment_type: string | null; source: string; last_seen_at: string | null };
type Load = { id: string; load_number: string; status: string; seat: string; unit_number: string | null; origin: string | null; destination: string | null; first_stop_at: string | null; rate_total_cents: number };
type SafetyRow = { id: string; source: string; kind: string | null; severity: string | null; status: string | null; at: string | null; title: string | null };
type DaRow = { id: string; source: string; test_type: string | null; result: string | null; at: string | null };
type Policy = { id: string; insurer_name: string | null; policy_number: string | null; coverage_type: string | null; effective_date: string | null; expiry_date: string | null; confirmed_by_insurer_at: string | null; is_active: boolean };
type Doc = { id: string; source: string; name: string | null; doc_type: string | null; document_date: string | null; expiration_date: string | null; added_at: string };
type SamsaraLink = { samsara_driver_id: string; samsara_username: string | null; status: string | null; last_at: string | null; source: string };

export type DriverWholeProfileData = {
  driver: { id: string; name: string };
  pay_basis: Block<{ current: Rate | null; history: Rate[] }>;
  settlements: Block<Settlement[]>;
  advances: Block<{ outstanding_cents: number; rows: Advance[] }>;
  escrow: Block<{ balance_cents: number; accounts: EscrowAccount[]; postings: EscrowPosting[] }>;
  deductions: Block<{ total_cents: number; rows: Deduction[] }>;
  reimbursements: Block<{ total_cents: number; rows: Reimb[] }>;
  fuel: Block<Fuel[]>;
  equipment: Block<{ units: UnitAssign[]; trailers: Trailer[] }>;
  loads: Block<Load[]>;
  safety: Block<SafetyRow[]>;
  drug_alcohol: Block<DaRow[]>;
  medical_card: Block<{ expires_on: string | null; days_to_expiry: number | null; source: string | null; cards: Array<{ id: string; card_number: string | null; issued_date: string | null; expiry_date: string | null }> }>;
  cdl: Block<{ number_on_file: boolean; state: string | null; class: string | null; expires_on: string | null; days_to_expiry: number | null; restrictions: string | null; endorsements: string[]; hazmat_expires_on: string | null }>;
  insurance: Block<Policy[]>;
  documents: Block<Doc[]>;
  hos: Block<{ clock: { duty_status: string | null; driving_hours_remaining: number | null; on_duty_hours_remaining: number | null; cycle_hours_remaining: number | null; time_to_next_break_minutes: number | null; polled_at: string } | null; last: { duty_status: string; started_at: string } | null; hours_8d: Array<{ duty_status: string; hours: number }> }>;
  samsara: Block<{ samsara_driver_id: string | null; last_login_at: string | null; links: SamsaraLink[] }>;
};

const d = (v: string | null | undefined) => (v ? formatDateUS(v) : "—");
const expiryTone = (days: number | null) => (days != null && days < 30 ? "text-red-600" : "");
const rateLabel = (r: Rate | null) =>
  !r ? "No rate card" : r.basis_type === "per_mile_pay" ? `${formatUsdCents(r.rate_per_mile_cents ?? 0)}/mi (${r.miles_basis ?? "—"})` : `${formatUsdCents(r.flat_per_load_cents ?? 0)}/load`;

export function DriverWholeProfile(props: { operatingCompanyId: string; driverId: string }) {
  const navigate = useNavigate();
  const go = (kind: EntityKind, id: string | null) => {
    const to = id ? resolveEntityRoute(kind, id) : null;
    if (to) navigate(to);
  };
  const q = useQuery({
    queryKey: ["driver-whole-profile", props.operatingCompanyId, props.driverId],
    queryFn: () => apiRequest<DriverWholeProfileData>(`/api/v1/drivers/${props.driverId}/whole-profile?operating_company_id=${props.operatingCompanyId}`),
  });
  if (q.isLoading) return <div className="text-xs text-[color:var(--ih-muted)]">Loading driver profile…</div>;
  if (q.isError || !q.data) return <ListErrorState status={0} message="Failed to load the driver profile." onRetry={() => void q.refetch()} />;
  const p = q.data;
  const lastSettlement = p.settlements.value[0] ?? null;
  const tbl = { density: "compact" as const, suppressToolbarRange: true };

  const settlementCols: Array<ParityColumn<Settlement>> = [
    { key: "display_id", label: "Settlement", sortable: true },
    { key: "period_start", label: "Period", sortable: true, render: (r) => `${d(r.period_start)} – ${d(r.period_end)}` },
    { key: "first_load_number", label: "Loads", sortable: true, render: (r) => [r.first_load_number, r.last_load_number].filter(Boolean).join(" → ") || "—" },
    { key: "status", label: "Status", sortable: true },
    { key: "gross_cents", label: "Gross", sortable: true, kind: "money" },
    { key: "deductions_cents", label: "Deductions", sortable: true, kind: "money" },
    { key: "reimbursements_cents", label: "Reimb.", sortable: true, kind: "money" },
    { key: "net_cents", label: "Net", sortable: true, kind: "money" },
    { key: "lines", label: "Lines", sortable: true, render: (r) => String(r.lines.length), sortValue: (r) => r.lines.length },
  ];
  const lineRows = p.settlements.value.flatMap((s) => s.lines.map((l) => ({ ...l, settlement: s.display_id ?? "—", settlement_id: s.id })));
  const lineCols: Array<ParityColumn<(typeof lineRows)[number]>> = [
    { key: "settlement", label: "Settlement", sortable: true },
    { key: "line_type", label: "Type", sortable: true },
    { key: "category", label: "Category", sortable: true },
    { key: "description", label: "Description", sortable: true, allowWrap: true },
    { key: "amount_cents", label: "Amount", sortable: true, kind: "money" },
  ];
  const advCols: Array<ParityColumn<Advance>> = [
    { key: "display_id", label: "Advance", sortable: true },
    { key: "posting_date", label: "Date", sortable: true, render: (r) => d(r.posting_date) },
    { key: "purpose", label: "Purpose", sortable: true },
    { key: "status", label: "Status", sortable: true },
    { key: "amount_cents", label: "Amount", sortable: true, kind: "money" },
    { key: "outstanding_cents", label: "Outstanding", sortable: true, kind: "money" },
  ];
  const escCols: Array<ParityColumn<EscrowPosting>> = [
    { key: "posted_at", label: "Date", sortable: true, render: (r) => d(r.posted_at) },
    { key: "posting_type", label: "Type", sortable: true },
    { key: "source_type", label: "Source", sortable: true },
    { key: "note", label: "Note", sortable: true, allowWrap: true },
    { key: "amount_cents", label: "Amount", sortable: true, kind: "money" },
  ];
  const dedCols: Array<ParityColumn<Deduction>> = [
    { key: "created_at", label: "Date", sortable: true, render: (r) => d(r.created_at) },
    { key: "deduction_type", label: "Type", sortable: true },
    { key: "reason", label: "Reason", sortable: true, allowWrap: true },
    { key: "status", label: "Status", sortable: true },
    { key: "amount_cents", label: "Amount", sortable: true, kind: "money" },
    { key: "remaining_balance_cents", label: "Remaining", sortable: true, kind: "money" },
  ];
  const reimbCols: Array<ParityColumn<Reimb>> = [
    { key: "posting_date", label: "Date", sortable: true, render: (r) => d(r.posting_date) },
    { key: "reimbursement_type", label: "Type", sortable: true },
    { key: "reason", label: "Reason", sortable: true, allowWrap: true },
    { key: "status", label: "Status", sortable: true },
    { key: "amount_cents", label: "Amount", sortable: true, kind: "money" },
  ];
  const fuelCols: Array<ParityColumn<Fuel>> = [
    { key: "at", label: "Date", sortable: true, render: (r) => d(r.at) },
    { key: "vendor_name", label: "Vendor", sortable: true },
    { key: "unit_number", label: "Unit", sortable: true },
    { key: "location_city", label: "City", sortable: true },
    { key: "location_state", label: "State", sortable: true },
    { key: "gallons", label: "Gallons", sortable: true, kind: "number" },
    { key: "total_cents", label: "Total", sortable: true, kind: "money" },
  ];
  const unitCols: Array<ParityColumn<UnitAssign>> = [
    { key: "unit_number", label: "Truck", sortable: true },
    { key: "started_at", label: "From", sortable: true, render: (r) => d(r.started_at) },
    { key: "ended_at", label: "To", sortable: true, render: (r) => (r.ended_at ? d(r.ended_at) : "Current") },
    { key: "source", label: "Source", sortable: true },
  ];
  const trailerCols: Array<ParityColumn<Trailer>> = [
    { key: "equipment_number", label: "Trailer", sortable: true },
    { key: "equipment_type", label: "Type", sortable: true },
    { key: "source", label: "Source", sortable: true },
    { key: "last_seen_at", label: "Last DVIR", sortable: true, render: (r) => d(r.last_seen_at) },
  ];
  const loadCols: Array<ParityColumn<Load>> = [
    { key: "load_number", label: "Load", sortable: true, render: (r) => <EntityLink kind="load" id={r.id} label={r.load_number} /> },
    { key: "first_stop_at", label: "Date", sortable: true, render: (r) => d(r.first_stop_at) },
    { key: "seat", label: "Seat", sortable: true },
    { key: "unit_number", label: "Truck", sortable: true },
    { key: "origin", label: "Origin", sortable: true },
    { key: "destination", label: "Destination", sortable: true },
    { key: "status", label: "Status", sortable: true },
    { key: "rate_total_cents", label: "Rate", sortable: true, kind: "money" },
  ];
  const safetyCols: Array<ParityColumn<SafetyRow>> = [
    { key: "at", label: "Date", sortable: true, render: (r) => d(r.at) },
    { key: "source", label: "Source", sortable: true },
    { key: "kind", label: "Event", sortable: true },
    { key: "severity", label: "Severity", sortable: true },
    { key: "status", label: "Status", sortable: true },
    { key: "title", label: "Title", sortable: true, allowWrap: true },
  ];
  const daCols: Array<ParityColumn<DaRow>> = [
    { key: "at", label: "Date", sortable: true, render: (r) => d(r.at) },
    { key: "source", label: "Source", sortable: true },
    { key: "test_type", label: "Test", sortable: true },
    { key: "result", label: "Result", sortable: true },
  ];
  const insCols: Array<ParityColumn<Policy>> = [
    { key: "insurer_name", label: "Insurer", sortable: true },
    { key: "policy_number", label: "Policy", sortable: true },
    { key: "coverage_type", label: "Coverage", sortable: true },
    { key: "expiry_date", label: "Expires", sortable: true, render: (r) => d(r.expiry_date) },
    { key: "confirmed_by_insurer_at", label: "Insurer confirmed", sortable: true, render: (r) => d(r.confirmed_by_insurer_at) },
    { key: "is_active", label: "Active", sortable: true, render: (r) => (r.is_active ? "Yes" : "No") },
  ];
  const docCols: Array<ParityColumn<Doc>> = [
    { key: "name", label: "Document", sortable: true, allowWrap: true },
    { key: "source", label: "Source", sortable: true },
    { key: "doc_type", label: "Type / status", sortable: true },
    { key: "document_date", label: "Date", sortable: true, render: (r) => d(r.document_date) },
    { key: "expiration_date", label: "Expires", sortable: true, render: (r) => d(r.expiration_date) },
  ];
  const samsaraCols: Array<ParityColumn<SamsaraLink>> = [
    { key: "samsara_driver_id", label: "Samsara ID", sortable: true },
    { key: "samsara_username", label: "Username", sortable: true },
    { key: "source", label: "Source", sortable: true },
    { key: "status", label: "Status", sortable: true },
    { key: "last_at", label: "Last seen / login", sortable: true, render: (r) => d(r.last_at) },
  ];

  const med = p.medical_card.value;
  const cdl = p.cdl.value;
  const hos = p.hos.value;
  return (
    <div data-testid="driver-whole-profile" className="space-y-2">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <ProfileKpi label="Pay" value={rateLabel(p.pay_basis.value.current)} />
        <ProfileKpi label="Last net" value={lastSettlement ? formatUsdCents(lastSettlement.net_cents) : "—"} />
        <ProfileKpi label="Escrow" value={formatUsdCents(p.escrow.value.balance_cents)} />
        <ProfileKpi label="Advances owed" value={formatUsdCents(p.advances.value.outstanding_cents)} tone={p.advances.value.outstanding_cents > 0 ? "red" : undefined} />
        <ProfileKpi label="CDL expires" value={d(cdl.expires_on)} tone={cdl.days_to_expiry != null && cdl.days_to_expiry < 30 ? "red" : undefined} />
        <ProfileKpi label="Medical expires" value={d(med.expires_on)} tone={med.days_to_expiry != null && med.days_to_expiry < 30 ? "red" : undefined} />
      </div>

      <div className="grid gap-2 lg:grid-cols-3">
        <ProfileSection title="Pay basis" testId="driver-profile-pay-basis" reason={p.pay_basis.empty_reason}>
          <ProfileRows rows={p.pay_basis.value.history.map((r) => [
            `${d(r.effective_from)} – ${r.effective_to ? d(r.effective_to) : "open"}${r.is_active ? " (active)" : ""}`,
            rateLabel(r),
          ])} />
        </ProfileSection>
        <ProfileSection title="CDL" testId="driver-profile-cdl" reason={p.cdl.empty_reason}>
          <ProfileRows rows={[
            ["Number on file", cdl.number_on_file ? "Yes" : "No"],
            ["State / class", `${cdl.state ?? "—"} / ${cdl.class ?? "—"}`],
            ["Expires", d(cdl.expires_on), expiryTone(cdl.days_to_expiry)],
            ["Endorsements", cdl.endorsements.join(", ") || "None"],
            ["Hazmat expires", d(cdl.hazmat_expires_on)],
            ["Restrictions", cdl.restrictions ?? "None"],
          ]} />
        </ProfileSection>
        <ProfileSection title="Medical card" testId="driver-profile-medical-card" reason={p.medical_card.empty_reason}>
          <ProfileRows rows={[
            ["Expires", d(med.expires_on), expiryTone(med.days_to_expiry)],
            ["Days left", med.days_to_expiry == null ? "—" : String(med.days_to_expiry), expiryTone(med.days_to_expiry)],
            ["Card on file", med.cards[0]?.card_number ? "Yes" : "No"],
            ["Source", med.source ?? "—"],
          ]} />
        </ProfileSection>
      </div>

      <ProfileSection title={`Settlements (${p.settlements.value.length})`} testId="driver-profile-settlements" reason={p.settlements.empty_reason}>
        {p.settlements.value.length ? <ParityTable columns={settlementCols} rows={p.settlements.value} rowKey={(r) => r.id} onRowClick={(r) => go("settlement", r.id)} {...tbl} /> : null}
        {lineRows.length ? <ParityTable columns={lineCols} rows={lineRows} rowKey={(r) => r.id} onRowClick={(r) => go("settlement", r.settlement_id)} {...tbl} /> : null}
      </ProfileSection>

      <div className="grid gap-2 lg:grid-cols-2">
        <ProfileSection title={`Advances (${p.advances.value.rows.length})`} testId="driver-profile-advances" reason={p.advances.empty_reason}>
          {p.advances.value.rows.length ? <ParityTable columns={advCols} rows={p.advances.value.rows} rowKey={(r) => r.id} onRowClick={(r) => go("cash_advance", r.id)} {...tbl} /> : null}
        </ProfileSection>
        <ProfileSection title={`Escrow — ${formatUsdCents(p.escrow.value.balance_cents)}`} testId="driver-profile-escrow" reason={p.escrow.empty_reason}>
          <ProfileRows rows={p.escrow.value.accounts.map((a) => [`${a.purpose ?? "Escrow"} (${a.status ?? "—"})`, formatUsdCents(a.balance_cents)])} />
          {p.escrow.value.postings.length ? <ParityTable columns={escCols} rows={p.escrow.value.postings} rowKey={(r) => r.id} onRowClick={(r) => go("journal_entry", r.linked_journal_entry_id)} {...tbl} /> : null}
        </ProfileSection>
        <ProfileSection title={`Deductions — ${formatUsdCents(p.deductions.value.total_cents)}`} testId="driver-profile-deductions" reason={p.deductions.empty_reason}>
          {p.deductions.value.rows.length ? <ParityTable columns={dedCols} rows={p.deductions.value.rows} rowKey={(r) => r.id} onRowClick={(r) => go("settlement", r.applied_to_settlement_id)} {...tbl} /> : null}
        </ProfileSection>
        <ProfileSection title={`Reimbursements — ${formatUsdCents(p.reimbursements.value.total_cents)}`} testId="driver-profile-reimbursements" reason={p.reimbursements.empty_reason}>
          {p.reimbursements.value.rows.length ? <ParityTable columns={reimbCols} rows={p.reimbursements.value.rows} rowKey={(r) => r.id} onRowClick={(r) => go("driver_reimbursement", r.id)} {...tbl} /> : null}
        </ProfileSection>
      </div>

      <ProfileSection title={`Loads run (${p.loads.value.length})`} testId="driver-profile-loads" reason={p.loads.empty_reason}>
        {p.loads.value.length ? <ParityTable columns={loadCols} rows={p.loads.value} rowKey={(r) => r.id} onRowClick={(r) => go("load", r.id)} {...tbl} /> : null}
      </ProfileSection>

      <ProfileSection title={`Fuel purchases (${p.fuel.value.length})`} testId="driver-profile-fuel" reason={p.fuel.empty_reason}>
        {p.fuel.value.length ? <ParityTable columns={fuelCols} rows={p.fuel.value} rowKey={(r) => r.id} onRowClick={(r) => go("fuel_transaction", r.id)} {...tbl} /> : null}
      </ProfileSection>

      <ProfileSection title="Trucks & trailers" testId="driver-profile-equipment" reason={p.equipment.empty_reason}>
        <div className="grid gap-2 lg:grid-cols-2">
          {p.equipment.value.units.length ? <ParityTable columns={unitCols} rows={p.equipment.value.units} rowKey={(r) => r.id} onRowClick={(r) => go("unit", r.unit_id)} {...tbl} /> : <p className="text-center text-[color:var(--ih-muted)]">No truck assignment recorded.</p>}
          {p.equipment.value.trailers.length ? <ParityTable columns={trailerCols} rows={p.equipment.value.trailers} rowKey={(r) => `${r.source}:${r.id}`} onRowClick={(r) => go("trailer", r.id)} {...tbl} /> : <p className="text-center text-[color:var(--ih-muted)]">No trailer assigned or on a DVIR.</p>}
        </div>
      </ProfileSection>

      <div className="grid gap-2 lg:grid-cols-2">
        <ProfileSection title={`Safety events (${p.safety.value.length})`} testId="driver-profile-safety" reason={p.safety.empty_reason}>
          {p.safety.value.length ? <ParityTable columns={safetyCols} rows={p.safety.value} rowKey={(r) => `${r.source}:${r.id}`} {...tbl} /> : null}
        </ProfileSection>
        <ProfileSection title={`Drug & alcohol (${p.drug_alcohol.value.length})`} testId="driver-profile-drug-alcohol" reason={p.drug_alcohol.empty_reason}>
          {p.drug_alcohol.value.length ? <ParityTable columns={daCols} rows={p.drug_alcohol.value} rowKey={(r) => `${r.source}:${r.id}`} {...tbl} /> : null}
        </ProfileSection>
        <ProfileSection title={`Insurance (${p.insurance.value.length})`} testId="driver-profile-insurance" reason={p.insurance.empty_reason}>
          {p.insurance.value.length ? <ParityTable columns={insCols} rows={p.insurance.value} rowKey={(r) => r.id} onRowClick={(r) => go("insurance_policy", r.id)} {...tbl} /> : null}
        </ProfileSection>
        <ProfileSection title={`Documents (${p.documents.value.length})`} testId="driver-profile-documents" reason={p.documents.empty_reason}>
          {p.documents.value.length ? <ParityTable columns={docCols} rows={p.documents.value} rowKey={(r) => `${r.source}:${r.id}`} {...tbl} /> : null}
        </ProfileSection>
        <ProfileSection title="Hours of service" testId="driver-profile-hos" reason={p.hos.empty_reason}>
          <ProfileRows rows={[
            ["Current status", hos.clock?.duty_status ?? hos.last?.duty_status ?? "—"],
            ["Drive left (h)", hos.clock?.driving_hours_remaining == null ? "—" : String(hos.clock.driving_hours_remaining)],
            ["On-duty left (h)", hos.clock?.on_duty_hours_remaining == null ? "—" : String(hos.clock.on_duty_hours_remaining)],
            ["Cycle left (h)", hos.clock?.cycle_hours_remaining == null ? "—" : String(hos.clock.cycle_hours_remaining)],
            ["Clock read", d(hos.clock?.polled_at)],
            ...hos.hours_8d.map((h): [string, string] => [`${h.duty_status} — last 8 days (h)`, String(h.hours)]),
          ]} />
        </ProfileSection>
        <ProfileSection title="Samsara linkage" testId="driver-profile-samsara" reason={p.samsara.empty_reason}>
          {p.samsara.value.links.length ? <ParityTable columns={samsaraCols} rows={p.samsara.value.links} rowKey={(r) => `${r.source}:${r.samsara_driver_id}`} {...tbl} /> : null}
        </ProfileSection>
      </div>
    </div>
  );
}
