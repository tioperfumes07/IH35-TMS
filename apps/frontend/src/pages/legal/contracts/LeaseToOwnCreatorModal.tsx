// LEGAL-CONTRACT-CREATOR-01 — Lease-to-Own creator modal (additive, behind LEGAL_CONTRACTS_ENABLED).
// Calls the REAL backend routes (ensure-template, fleet) and saves via the existing createContractInstance
// with filled_variables = { seller, lessee, terms, vehicles[] }. Live preview merges the verbatim template.
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { legalContractsApi, type LeaseToOwnFleetUnit } from "../../../api/legal-contracts";
import { legalTemplatesApi } from "../../../api/legal-templates";
import { Button } from "../../../components/Button";
import { ParityDrawer } from "../../../components/parity/ParityDrawer";
import { DatePicker } from "../../../components/forms/DatePicker";
import { MoneyInput } from "../../../components/forms/MoneyInput";
import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
import { ListErrorState } from "../../../components/ListErrorState";
import { useToast } from "../../../components/Toast";
import { entityLabel } from "../../../lib/entity-label";
import { userFacingApiError } from "../../../lib/api-error-message";
import { Combobox } from "../../../components/Combobox";
import { EntityPicker } from "../../../components/parity/EntityPicker";
import { getCustomerDetail } from "../../../api/mdata";

type Props = {
  open: boolean;
  operatingCompanyId: string;
  onClose: () => void;
  onSaved: (contractId: string) => Promise<void> | void;
};

type TruckTerms = { lienholder: string; balance_owed: string; monthly_lease_amount: string; payment_due_date: string };

type FleetPickerRow = LeaseToOwnFleetUnit & { selected: boolean };
type PerTruckTermsRow = { unit: LeaseToOwnFleetUnit; terms: TruckTerms };

const STEPS = ["Parties & Terms", "Vehicles", "Per-truck Terms", "Preview & Save"] as const;

/** mustache-lite merge: {{a.b}} flat lookups + a single {{#each vehicles}}…{{/each}} block. */
function mergeTemplate(html: string, vars: Record<string, unknown>): string {
  const lookup = (path: string): string => {
    const v = path.split(".").reduce<unknown>((acc, k) => (acc && typeof acc === "object" ? (acc as any)[k] : undefined), vars);
    return v == null ? "" : String(v);
  };
  let out = html.replace(/{{#each vehicles}}([\s\S]*?){{\/each}}/g, (_m, inner: string) => {
    const list = Array.isArray((vars as any).vehicles) ? ((vars as any).vehicles as any[]) : [];
    return list
      .map((veh) => inner.replace(/{{\s*this\.([a-z0-9_]+)\s*}}/gi, (_n, k: string) => (veh[k] == null ? "" : String(veh[k]))))
      .join("");
  });
  out = out.replace(/{{\s*([a-z0-9_.]+)\s*}}/gi, (_m, path: string) => lookup(path));
  return out;
}

export function LeaseToOwnCreatorModal({ open, operatingCompanyId, onClose, onSaved }: Props) {
  const { pushToast } = useToast();
  const [stepIdx, setStepIdx] = useState(0);

  // deal-level
  const [ownerCompanyId, setOwnerCompanyId] = useState<string>("");
  const [lessee, setLessee] = useState({ name: "", entity_type: "Inc.", signer: "", title: "", address: "" });
  const [lesseeCustomerId, setLesseeCustomerId] = useState("");
  const [terms, setTerms] = useState({
    term_months: "60", use_charge_pct: "10", governing_law: "Texas", venue_county: "Webb",
    execution_date: "", reference_no: "",
  });
  const [sellerSigner, setSellerSigner] = useState({ signer_name: "Jorge Munoz", signer_title: "Manager" });
  const [selected, setSelected] = useState<Record<string, TruckTerms>>({});

  // ensure the canonical template exists + get seller default (TRK) — real backend call
  const ensureQuery = useQuery({
    queryKey: ["legal", "lease-to-own", "ensure", operatingCompanyId],
    enabled: open && Boolean(operatingCompanyId),
    queryFn: () => legalContractsApi.ensureLeaseToOwnTemplate(operatingCompanyId),
  });
  const seller = ensureQuery.data?.seller_default ?? null;
  const templateId = ensureQuery.data?.template.id ?? "";

  useEffect(() => {
    if (seller?.id && !ownerCompanyId) setOwnerCompanyId(seller.id); // default owner = TRK, selectable
  }, [seller?.id, ownerCompanyId]);

  // fleet for the picker — real backend call, owner-filtered
  const fleetQuery = useQuery({
    queryKey: ["legal", "lease-to-own", "fleet", operatingCompanyId, ownerCompanyId],
    enabled: open && Boolean(operatingCompanyId),
    queryFn: () => legalContractsApi.leaseToOwnFleet({ operating_company_id: operatingCompanyId, owner_company_id: ownerCompanyId || undefined }),
  });
  const units: LeaseToOwnFleetUnit[] = fleetQuery.data?.units ?? [];
  const ownerOptions = useMemo(() => {
    const m = new Map<string, string>();
    for (const u of units) if (u.owner_company_id) m.set(u.owner_company_id, entityLabel(u.owner_label, u.owner_company_id, "Owner"));
    if (seller?.id) m.set(seller.id, seller.short_name ?? seller.legal_name);
    return Array.from(m.entries()).map(([value, label]) => ({ value, label }));
  }, [units, seller]);

  // template content for the live preview — real backend call
  const templateQuery = useQuery({
    queryKey: ["legal", "lease-to-own", "template-content", operatingCompanyId, templateId],
    enabled: open && Boolean(operatingCompanyId && templateId),
    queryFn: () => legalTemplatesApi.get(templateId, operatingCompanyId),
  });

  // Free-text search: ParityTable toolbar owns it (LEG-F3502) — no page-local unit filter.
  const selectedList = useMemo(
    () => units.filter((u) => selected[u.id]).map((u, i) => ({ unit: u, terms: selected[u.id], sort: i })),
    [units, selected],
  );
  const fleetRows = useMemo<FleetPickerRow[]>(
    () => units.map((unit) => ({ ...unit, selected: Boolean(selected[unit.id]) })),
    [units, selected],
  );
  const fleetColumns = useMemo<ParityColumn<FleetPickerRow>[]>(
    () => [
      {
        key: "selected",
        label: "Select",
        alwaysVisible: true,
        render: (row) => (
          <input
            type="checkbox"
            aria-label={`Select unit ${row.unit_number}`}
            checked={row.selected}
            onChange={() => toggleUnit(row)}
          />
        ),
      },
      { key: "unit_number", label: "Unit", sortable: true, alwaysVisible: true },
      { key: "vin", label: "VIN", sortable: true, render: (row) => <span className="font-mono text-xs">{row.vin}</span> },
      {
        key: "make_model_year",
        label: "Make/Model/Yr",
        sortable: true,
        sortValue: (row) => [row.make, row.model, row.year].filter(Boolean).join(" "),
        render: (row) => [row.make, row.model, row.year].filter(Boolean).join(" "),
      },
      {
        key: "owner_label",
        label: "Owner",
        sortable: true,
        render: (row) => <span className="rounded-sm bg-slate-100 px-1 text-xs">{row.owner_label ?? "—"}</span>,
      },
      { key: "status", label: "Status", sortable: true, render: (row) => <span className="text-xs">{row.status}</span> },
    ],
    [],
  );
  const perTruckTermsRows = useMemo<PerTruckTermsRow[]>(
    () => selectedList.map(({ unit, terms: truckTerms }) => ({ unit, terms: truckTerms })),
    [selectedList],
  );
  const perTruckTermsColumns = useMemo<ParityColumn<PerTruckTermsRow>[]>(
    () => [
      {
        key: "unit",
        label: "Unit",
        alwaysVisible: true,
        sortValue: (row) => row.unit.unit_number,
        render: (row) => (
          <>
            {row.unit.unit_number} <span className="text-xs text-slate-500">{[row.unit.make, row.unit.model, row.unit.year].filter(Boolean).join(" ")}</span>
          </>
        ),
      },
      {
        key: "lienholder",
        label: "Lienholder",
        sortValue: (row) => row.terms.lienholder,
        render: (row) => <input className="w-28 rounded-sm border px-1" value={row.terms.lienholder} onChange={(event) => setTruckTerm(row.unit.id, "lienholder", event.target.value)} />,
      },
      {
        key: "balance_owed",
        label: "Balance owed",
        sortValue: (row) => Number(row.terms.balance_owed) || 0,
        render: (row) => <MoneyInput className="w-28" valueDollars={row.terms.balance_owed ? Number(row.terms.balance_owed) : null} onChangeDollars={(d) => setTruckTerm(row.unit.id, "balance_owed", d == null ? "" : String(d))} ariaLabel={`Balance owed for ${row.unit.unit_number} (USD)`} />,
      },
      {
        key: "monthly_lease_amount",
        label: "Monthly lease",
        sortValue: (row) => Number(row.terms.monthly_lease_amount) || 0,
        render: (row) => <MoneyInput className="w-28" valueDollars={row.terms.monthly_lease_amount ? Number(row.terms.monthly_lease_amount) : null} onChangeDollars={(d) => setTruckTerm(row.unit.id, "monthly_lease_amount", d == null ? "" : String(d))} ariaLabel={`Monthly lease for ${row.unit.unit_number} (USD)`} />,
      },
      {
        key: "payment_due_date",
        label: "Due date",
        sortValue: (row) => row.terms.payment_due_date,
        render: (row) => <input className="w-24 rounded-sm border px-1" value={row.terms.payment_due_date} onChange={(event) => setTruckTerm(row.unit.id, "payment_due_date", event.target.value)} placeholder="1st" />,
      },
    ],
    [],
  );

  const filledVariables = useMemo(() => {
    const year = terms.execution_date ? terms.execution_date.slice(0, 4) : "";
    return {
      seller: seller
        ? { company_id: seller.id, legal_name: seller.legal_name, signer_name: sellerSigner.signer_name, signer_title: sellerSigner.signer_title,
            address: [seller.address_line1, seller.address_line2, seller.postal_code].filter(Boolean).join(", ") }
        : {},
      lessee: { name: lessee.name, entity_type: lessee.entity_type, signer: lessee.signer, title: lessee.title, address: lessee.address },
      terms: { ...terms, execution_year: year, truck_count: selectedList.length },
      vehicles: selectedList.map((s) => ({
        unit_id: s.unit.id, owner_company_id: s.unit.owner_company_id, owner_label: s.unit.owner_label,
        unit_number: s.unit.unit_number, year: s.unit.year, make: s.unit.make, model: s.unit.model, vin: s.unit.vin,
        lienholder: s.terms.lienholder || "None", balance_owed: s.terms.balance_owed, monthly_lease_amount: s.terms.monthly_lease_amount,
        payment_due_date: s.terms.payment_due_date, sort_order: s.sort,
      })),
    };
  }, [seller, sellerSigner, lessee, terms, selectedList]);

  const previewHtml = useMemo(() => {
    const html = templateQuery.data?.content_html_en;
    return html ? mergeTemplate(html, filledVariables) : "";
  }, [templateQuery.data, filledVariables]);

  const saveMutation = useMutation({
    mutationFn: () =>
      legalContractsApi.create(operatingCompanyId, {
        template_code: "lease_to_own",
        signer_type: "customer",
        signer_entity_id: lesseeCustomerId,
        signer_name: lessee.name || "Lessee",
        language: "en",
        filled_variables: filledVariables,
      }),
    onSuccess: async (created) => {
      pushToast("Lease-to-own draft saved", "success");
      await onSaved(created.id);
      onClose();
    },
    onError: (e) => pushToast(userFacingApiError(e, "Save failed"), "error"),
  });

  function toggleUnit(u: LeaseToOwnFleetUnit) {
    setSelected((prev) => {
      const next = { ...prev };
      if (next[u.id]) delete next[u.id];
      else next[u.id] = { lienholder: "None", balance_owed: "", monthly_lease_amount: "", payment_due_date: "" };
      return next;
    });
  }
  function setTruckTerm(id: string, key: keyof TruckTerms, value: string) {
    setSelected((prev) => ({ ...prev, [id]: { ...prev[id], [key]: value } }));
  }

  const canSave = Boolean(lesseeCustomerId && lessee.name.trim()) && selectedList.length > 0 && Boolean(seller);

  return (
    <ParityDrawer open={open} onClose={onClose} title="New Lease-to-Own Contract" size="wide">
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2 text-xs">
          {STEPS.map((s, i) => (
            <button key={s} onClick={() => setStepIdx(i)}
              className={`rounded-sm px-2 py-1 ${i === stepIdx ? "bg-[#1f2a44] text-white" : "bg-slate-100 text-slate-600"}`}>
              {i + 1}. {s}
            </button>
          ))}
        </div>

        {ensureQuery.isError && <p className="text-sm text-crit">Could not load the lease-to-own template (is the feature flag on?).</p>}

        {/* Step 1 — Parties & Terms */}
        {stepIdx === 0 && (
          <div className="grid gap-3 md:grid-cols-2">
            <div className="md:col-span-2 rounded-sm bg-slate-50 p-2 text-sm">
              <strong>Seller:</strong> {seller ? seller.legal_name : "loading…"} <span className="text-slate-500">(equipment owner — TRK default)</span>
            </div>
            <label className="flex flex-col gap-1 text-sm">Seller signer
              <input className="rounded-sm border px-2 py-1" value={sellerSigner.signer_name} onChange={(e) => setSellerSigner({ ...sellerSigner, signer_name: e.target.value })} />
            </label>
            <label className="flex flex-col gap-1 text-sm">Seller signer title
              <input className="rounded-sm border px-2 py-1" value={sellerSigner.signer_title} onChange={(e) => setSellerSigner({ ...sellerSigner, signer_title: e.target.value })} />
            </label>
            <div className="flex flex-col gap-1 text-sm">
              <label htmlFor="lease-to-own-owner-picker">Truck-owner to lease from</label>
              <Combobox
                id="lease-to-own-owner-picker"
                options={ownerOptions}
                value={ownerCompanyId || null}
                onChange={(next) => setOwnerCompanyId(next ?? "")}
                placeholder="Select truck owner"
                loading={fleetQuery.isLoading || ensureQuery.isLoading}
                allowClear={false}
              />
            </div>
            <div className="flex flex-col gap-1 text-sm md:col-span-2" data-testid="lease-to-own-lessee-customer-block">
              <label>Lessee customer *</label>
              {/* CLS-SILENT-CAP: EntityPicker server-search — no capped listCustomers roster. */}
              <EntityPicker
                kind="customer"
                allowCreate
                nestedInDrawer
                operatingCompanyId={operatingCompanyId}
                value={lesseeCustomerId || null}
                onChange={(id, option) => {
                  setLesseeCustomerId(id ?? "");
                  if (!id) return;
                  if (option?.label) {
                    setLessee((current) => ({ ...current, name: option.label }));
                  }
                  void getCustomerDetail(id, operatingCompanyId).then(({ customer }) =>
                    setLessee((current) => ({
                      ...current,
                      name: entityLabel(customer.name, customer.id, "Customer"),
                      address: [customer.billing_address, customer.billing_city, customer.billing_state, customer.billing_zip]
                        .filter(Boolean)
                        .join(", "),
                    })),
                  );
                }}
                enabled={open}
                placeholder="Search customer…"
                dataField="lease-to-own-lessee-customer"
                className="w-full"
              />
            </div>
            <label className="flex flex-col gap-1 text-sm">Lessee (Buyer) legal name
              <input className="rounded-sm border px-2 py-1" value={lessee.name} onChange={(e) => setLessee({ ...lessee, name: e.target.value })} placeholder="Acme Transportation, Inc." />
            </label>
            <label className="flex flex-col gap-1 text-sm">Lessee entity type
              <input className="rounded-sm border px-2 py-1" value={lessee.entity_type} onChange={(e) => setLessee({ ...lessee, entity_type: e.target.value })} placeholder="Inc. / LLC" />
            </label>
            <label className="flex flex-col gap-1 text-sm">Lessee signer
              <input className="rounded-sm border px-2 py-1" value={lessee.signer} onChange={(e) => setLessee({ ...lessee, signer: e.target.value })} />
            </label>
            <label className="flex flex-col gap-1 text-sm">Lessee signer title
              <input className="rounded-sm border px-2 py-1" value={lessee.title} onChange={(e) => setLessee({ ...lessee, title: e.target.value })} placeholder="President" />
            </label>
            <label className="flex flex-col gap-1 text-sm md:col-span-2">Lessee address
              <input className="rounded-sm border px-2 py-1" value={lessee.address} onChange={(e) => setLessee({ ...lessee, address: e.target.value })} />
            </label>
            <label className="flex flex-col gap-1 text-sm">Lease term (months)
              <input type="number" className="rounded-sm border px-2 py-1" value={terms.term_months} onChange={(e) => setTerms({ ...terms, term_months: e.target.value })} />
            </label>
            <label className="flex flex-col gap-1 text-sm">Use charge (%)
              <input type="number" className="rounded-sm border px-2 py-1" value={terms.use_charge_pct} onChange={(e) => setTerms({ ...terms, use_charge_pct: e.target.value })} />
            </label>
            <label className="flex flex-col gap-1 text-sm">Governing law
              <input className="rounded-sm border px-2 py-1" value={terms.governing_law} onChange={(e) => setTerms({ ...terms, governing_law: e.target.value })} />
            </label>
            <label className="flex flex-col gap-1 text-sm">Venue county
              <input className="rounded-sm border px-2 py-1" value={terms.venue_county} onChange={(e) => setTerms({ ...terms, venue_county: e.target.value })} />
            </label>
            <label className="flex flex-col gap-1 text-sm">Execution date
              <DatePicker className="" value={terms.execution_date} onChange={(next) => setTerms({ ...terms, execution_date: next })} />
            </label>
            <label className="flex flex-col gap-1 text-sm">Reference # (optional)
              <input className="rounded-sm border px-2 py-1" value={terms.reference_no} onChange={(e) => setTerms({ ...terms, reference_no: e.target.value })} />
            </label>
          </div>
        )}

        {/* Step 2 — Vehicles */}
        {stepIdx === 1 && (
          <div className="space-y-2">
            <p className="text-xs text-slate-500">{selectedList.length} selected · {units.length} eligible</p>
            {fleetQuery.isError ? (
              <ListErrorState title="Couldn't load eligible fleet" status={0} message={(fleetQuery.error as Error)?.message} onRetry={() => void fleetQuery.refetch()} />
            ) : (
              <ParityTable<FleetPickerRow>
                columns={fleetColumns}
                rows={fleetRows}
                rowKey={(row) => row.id}
                loading={fleetQuery.isLoading}
                storageKey="legal-lease-to-own-fleet-picker"
                emptyText="No eligible fleet units found for this owner."
                initialPageSize={15}
                tableTestId="lease-to-own-fleet-picker"
              />
            )}
          </div>
        )}

        {/* Step 3 — Per-truck terms */}
        {stepIdx === 2 && (
          <ParityTable<PerTruckTermsRow>
            columns={perTruckTermsColumns}
            rows={perTruckTermsRows}
            rowKey={(row) => row.unit.id}
            storageKey="legal-lease-to-own-per-truck-terms"
            emptyText="Select vehicles in step 2 first."
            initialPageSize={15}
            tableTestId="lease-to-own-per-truck-terms"
          />
        )}

        {/* Step 4 — Preview & Save */}
        {stepIdx === 3 && (
          <div className="space-y-2">
            {!canSave && <p className="text-xs text-crit">Need a linked lessee customer and at least one vehicle to save.</p>}
            <div className="max-h-96 overflow-auto rounded-sm border bg-white p-4 text-sm" dangerouslySetInnerHTML={{ __html: previewHtml || "<p>Loading preview…</p>" }} />
          </div>
        )}

        <div className="flex justify-between pt-2">
          <Button variant="secondary" size="sm" disabled={stepIdx === 0} onClick={() => setStepIdx((i) => Math.max(0, i - 1))}>Back</Button>
          {stepIdx < STEPS.length - 1 ? (
            <Button size="sm" onClick={() => setStepIdx((i) => Math.min(STEPS.length - 1, i + 1))}>Next</Button>
          ) : (
            <Button size="sm" loading={saveMutation.isPending} disabled={!canSave} onClick={() => saveMutation.mutate()}>Save draft</Button>
          )}
        </div>
      </div>
    </ParityDrawer>
  );
}
