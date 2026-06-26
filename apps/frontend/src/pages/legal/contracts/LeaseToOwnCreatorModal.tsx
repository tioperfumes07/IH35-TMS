// LEGAL-CONTRACT-CREATOR-01 — Lease-to-Own creator modal (additive, behind LEGAL_CONTRACTS_ENABLED).
// Calls the REAL backend routes (ensure-template, fleet) and saves via the existing createContractInstance
// with filled_variables = { seller, lessee, terms, vehicles[] }. Live preview merges the verbatim template.
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { legalContractsApi, type LeaseToOwnFleetUnit } from "../../../api/legal-contracts";
import { legalTemplatesApi } from "../../../api/legal-templates";
import { Button } from "../../../components/Button";
import { Modal } from "../../../components/Modal";
import { useToast } from "../../../components/Toast";

type Props = {
  open: boolean;
  operatingCompanyId: string;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
};

type TruckTerms = { lienholder: string; balance_owed: string; monthly_lease_amount: string; payment_due_date: string };

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
  const [terms, setTerms] = useState({
    term_months: "60", use_charge_pct: "10", governing_law: "Texas", venue_county: "Webb",
    execution_date: "", reference_no: "",
  });
  const [sellerSigner, setSellerSigner] = useState({ signer_name: "Jorge Munoz", signer_title: "Manager" });
  const [search, setSearch] = useState("");
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
    for (const u of units) if (u.owner_company_id) m.set(u.owner_company_id, u.owner_label ?? u.owner_company_id);
    if (seller?.id) m.set(seller.id, seller.short_name ?? seller.legal_name);
    return Array.from(m.entries());
  }, [units, seller]);

  // template content for the live preview — real backend call
  const templateQuery = useQuery({
    queryKey: ["legal", "lease-to-own", "template-content", operatingCompanyId, templateId],
    enabled: open && Boolean(operatingCompanyId && templateId),
    queryFn: () => legalTemplatesApi.get(templateId, operatingCompanyId),
  });

  const filteredUnits = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return units;
    return units.filter((u) => [u.unit_number, u.vin, u.make, u.model, String(u.year ?? "")].join(" ").toLowerCase().includes(q));
  }, [units, search]);

  const selectedList = useMemo(
    () => units.filter((u) => selected[u.id]).map((u, i) => ({ unit: u, terms: selected[u.id], sort: i })),
    [units, selected],
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
        signer_name: lessee.name || "Lessee",
        language: "en",
        filled_variables: filledVariables,
      }),
    onSuccess: async () => {
      pushToast("Lease-to-own draft saved", "success");
      await onSaved();
      onClose();
    },
    onError: (e) => pushToast(`Save failed: ${String((e as Error)?.message ?? e)}`, "error"),
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

  const canSave = Boolean(lessee.name.trim()) && selectedList.length > 0 && Boolean(seller);

  return (
    <Modal open={open} onClose={onClose} title="New Lease-to-Own Contract">
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2 text-xs">
          {STEPS.map((s, i) => (
            <button key={s} onClick={() => setStepIdx(i)}
              className={`rounded px-2 py-1 ${i === stepIdx ? "bg-[#1f2a44] text-white" : "bg-slate-100 text-slate-600"}`}>
              {i + 1}. {s}
            </button>
          ))}
        </div>

        {ensureQuery.isError && <p className="text-sm text-[#dc2626]">Could not load the lease-to-own template (is the feature flag on?).</p>}

        {/* Step 1 — Parties & Terms */}
        {stepIdx === 0 && (
          <div className="grid gap-3 md:grid-cols-2">
            <div className="md:col-span-2 rounded bg-slate-50 p-2 text-sm">
              <strong>Seller:</strong> {seller ? seller.legal_name : "loading…"} <span className="text-slate-500">(equipment owner — TRK default)</span>
            </div>
            <label className="flex flex-col gap-1 text-sm">Truck-owner to lease from
              <select className="rounded border px-2 py-1" value={ownerCompanyId} onChange={(e) => setOwnerCompanyId(e.target.value)}>
                {ownerOptions.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">Lessee (Buyer) legal name
              <input className="rounded border px-2 py-1" value={lessee.name} onChange={(e) => setLessee({ ...lessee, name: e.target.value })} placeholder="Acme Transportation, Inc." />
            </label>
            <label className="flex flex-col gap-1 text-sm">Lessee entity type
              <input className="rounded border px-2 py-1" value={lessee.entity_type} onChange={(e) => setLessee({ ...lessee, entity_type: e.target.value })} placeholder="Inc. / LLC" />
            </label>
            <label className="flex flex-col gap-1 text-sm">Lessee signer
              <input className="rounded border px-2 py-1" value={lessee.signer} onChange={(e) => setLessee({ ...lessee, signer: e.target.value })} />
            </label>
            <label className="flex flex-col gap-1 text-sm">Lessee signer title
              <input className="rounded border px-2 py-1" value={lessee.title} onChange={(e) => setLessee({ ...lessee, title: e.target.value })} placeholder="President" />
            </label>
            <label className="flex flex-col gap-1 text-sm md:col-span-2">Lessee address
              <input className="rounded border px-2 py-1" value={lessee.address} onChange={(e) => setLessee({ ...lessee, address: e.target.value })} />
            </label>
            <label className="flex flex-col gap-1 text-sm">Lease term (months)
              <input type="number" className="rounded border px-2 py-1" value={terms.term_months} onChange={(e) => setTerms({ ...terms, term_months: e.target.value })} />
            </label>
            <label className="flex flex-col gap-1 text-sm">Use charge (%)
              <input type="number" className="rounded border px-2 py-1" value={terms.use_charge_pct} onChange={(e) => setTerms({ ...terms, use_charge_pct: e.target.value })} />
            </label>
            <label className="flex flex-col gap-1 text-sm">Governing law
              <input className="rounded border px-2 py-1" value={terms.governing_law} onChange={(e) => setTerms({ ...terms, governing_law: e.target.value })} />
            </label>
            <label className="flex flex-col gap-1 text-sm">Venue county
              <input className="rounded border px-2 py-1" value={terms.venue_county} onChange={(e) => setTerms({ ...terms, venue_county: e.target.value })} />
            </label>
            <label className="flex flex-col gap-1 text-sm">Execution date
              <input type="date" className="rounded border px-2 py-1" value={terms.execution_date} onChange={(e) => setTerms({ ...terms, execution_date: e.target.value })} />
            </label>
            <label className="flex flex-col gap-1 text-sm">Reference # (optional)
              <input className="rounded border px-2 py-1" value={terms.reference_no} onChange={(e) => setTerms({ ...terms, reference_no: e.target.value })} />
            </label>
          </div>
        )}

        {/* Step 2 — Vehicles */}
        {stepIdx === 1 && (
          <div className="space-y-2">
            <input className="w-full rounded border px-2 py-1 text-sm" placeholder="Search unit #, VIN, make, model…" value={search} onChange={(e) => setSearch(e.target.value)} />
            <p className="text-xs text-slate-500">{selectedList.length} selected · {filteredUnits.length} shown</p>
            <div className="max-h-72 overflow-auto rounded border">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50"><tr><th className="p-1"></th><th className="p-1 text-left">Unit</th><th className="p-1 text-left">VIN</th><th className="p-1 text-left">Make/Model/Yr</th><th className="p-1 text-left">Owner</th><th className="p-1 text-left">Status</th></tr></thead>
                <tbody>
                  {filteredUnits.map((u) => (
                    <tr key={u.id} className="border-t">
                      <td className="p-1"><input type="checkbox" checked={Boolean(selected[u.id])} onChange={() => toggleUnit(u)} /></td>
                      <td className="p-1">{u.unit_number}</td>
                      <td className="p-1 font-mono text-xs">{u.vin}</td>
                      <td className="p-1">{[u.make, u.model, u.year].filter(Boolean).join(" ")}</td>
                      <td className="p-1"><span className="rounded bg-slate-100 px-1 text-xs">{u.owner_label ?? "—"}</span></td>
                      <td className="p-1 text-xs">{u.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {fleetQuery.isLoading && <p className="text-xs text-slate-500">Loading fleet…</p>}
          </div>
        )}

        {/* Step 3 — Per-truck terms */}
        {stepIdx === 2 && (
          <div className="max-h-80 overflow-auto rounded border">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50"><tr><th className="p-1 text-left">Unit</th><th className="p-1 text-left">Lienholder</th><th className="p-1 text-left">Balance owed</th><th className="p-1 text-left">Monthly lease</th><th className="p-1 text-left">Due date</th></tr></thead>
              <tbody>
                {selectedList.map(({ unit, terms: t }) => (
                  <tr key={unit.id} className="border-t">
                    <td className="p-1">{unit.unit_number} <span className="text-xs text-slate-500">{[unit.make, unit.model, unit.year].filter(Boolean).join(" ")}</span></td>
                    <td className="p-1"><input className="w-28 rounded border px-1" value={t.lienholder} onChange={(e) => setTruckTerm(unit.id, "lienholder", e.target.value)} /></td>
                    <td className="p-1"><input className="w-28 rounded border px-1" value={t.balance_owed} onChange={(e) => setTruckTerm(unit.id, "balance_owed", e.target.value)} placeholder="0.00" /></td>
                    <td className="p-1"><input className="w-28 rounded border px-1" value={t.monthly_lease_amount} onChange={(e) => setTruckTerm(unit.id, "monthly_lease_amount", e.target.value)} placeholder="0.00" /></td>
                    <td className="p-1"><input className="w-24 rounded border px-1" value={t.payment_due_date} onChange={(e) => setTruckTerm(unit.id, "payment_due_date", e.target.value)} placeholder="1st" /></td>
                  </tr>
                ))}
                {selectedList.length === 0 && <tr><td colSpan={5} className="p-3 text-center text-sm text-slate-500">Select vehicles in step 2 first.</td></tr>}
              </tbody>
            </table>
          </div>
        )}

        {/* Step 4 — Preview & Save */}
        {stepIdx === 3 && (
          <div className="space-y-2">
            {!canSave && <p className="text-xs text-[#dc2626]">Need a lessee name and at least one vehicle to save.</p>}
            <div className="max-h-96 overflow-auto rounded border bg-white p-4 text-sm" dangerouslySetInnerHTML={{ __html: previewHtml || "<p>Loading preview…</p>" }} />
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
    </Modal>
  );
}
