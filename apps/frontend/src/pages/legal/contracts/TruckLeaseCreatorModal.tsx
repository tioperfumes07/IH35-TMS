import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { legalContractsApi } from "../../../api/legal-contracts";
import { truckLeaseApi } from "../../../api/truck-lease";
import { Button } from "../../../components/Button";
import { ParityDrawer } from "../../../components/parity/ParityDrawer";
import { useToast } from "../../../components/Toast";
import { userFacingApiError } from "../../../lib/api-error-message";
import { ReferenceSelect } from "../../../components/parity/ReferenceSelect";
import { CappedListNotice } from "../../../components/CappedListNotice";
import { getVendor, listVendors } from "../../../api/mdata";

type Props = {
  open: boolean;
  operatingCompanyId: string;
  onClose: () => void;
  onSaved: (contractId: string) => void;
};

type VehicleRow = {
  key: string;
  unit_number: string;
  year: string;
  make: string;
  model: string;
  vin: string;
  lienholder: string;
  permitted_use: string;
  mileage_limit_annual: string;
};

function emptyVehicle(key: string): VehicleRow {
  return { key, unit_number: "", year: "", make: "", model: "", vin: "", lienholder: "", permitted_use: "For-hire commercial transportation", mileage_limit_annual: "150000" };
}

function centDisplay(cents: number | null): string {
  if (!cents) return "$0.00";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function parseDollars(s: string): number {
  const n = parseFloat(s.replace(/[^0-9.]/g, ""));
  return isNaN(n) ? 0 : Math.round(n * 100);
}

export function TruckLeaseCreatorModal({ open, operatingCompanyId, onClose, onSaved }: Props) {
  const { pushToast } = useToast();
  const queryClient = useQueryClient();

  const [lessor, setLessor] = useState({ legal_name: "", address: "", city_state_zip: "", contact_name: "", contact_title: "Manager", contact_email: "" });
  const [lessee, setLessee] = useState({ legal_name: "", entity_type: "LLC", address: "", city_state_zip: "", signer_name: "", signer_title: "", signer_email: "" });
  const [lesseeVendorId, setLesseeVendorId] = useState("");
  const [vendorSearch, setVendorSearch] = useState("");
  const [terms, setTerms] = useState({
    execution_date: "",
    start_date: "",
    end_date: "",
    term_months: "12",
    monthly_lease_amount: "",
    payment_due_day: "1",
    security_deposit: "0",
    late_fee: "150",
    late_fee_grace_days: "5",
    governing_law: "Texas",
    venue_county: "Webb",
    reference_no: "",
    escrow_agent_name: "IH 35 Transport LLC",
    escrow_amount: "0",
  });
  const [vehicles, setVehicles] = useState<VehicleRow[]>([emptyVehicle("v1")]);

  const ensureQuery = useQuery({
    queryKey: ["legal", "truck-lease", "ensure", operatingCompanyId],
    enabled: open && Boolean(operatingCompanyId),
    queryFn: () => truckLeaseApi.ensureTemplate(operatingCompanyId),
  });
  const templateId = ensureQuery.data?.template.id ?? "";
  const vendorsQuery = useQuery({
    queryKey: ["legal", "truck-lease", "vendors", operatingCompanyId, vendorSearch],
    enabled: open && Boolean(operatingCompanyId),
    queryFn: () => listVendors({ operating_company_id: operatingCompanyId, status: "active", limit: vendorSearch ? 200 : 500, search: vendorSearch || undefined }),
  });
  const vendorOptions = (vendorsQuery.data?.vendors ?? []).map((vendor) => ({ value: vendor.id, label: vendor.name }));

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!templateId) throw new Error("Template not ready. Please try again.");
      if (!lesseeVendorId) throw new Error("Lessee vendor is required.");
      if (!lessee.signer_email.trim()) throw new Error("Lessee signer email is required.");

      const monthlyAmountCents = parseDollars(terms.monthly_lease_amount);
      const securityDepositCents = parseDollars(terms.security_deposit);
      const lateFeeCents = parseDollars(terms.late_fee);
      const escrowCents = parseDollars(terms.escrow_amount);

      const filledVariables = {
        lessor,
        lessee,
        terms: {
          ...terms,
          monthly_lease_amount_cents: monthlyAmountCents,
          monthly_lease_amount_display: centDisplay(monthlyAmountCents),
          security_deposit_cents: securityDepositCents,
          security_deposit_display: centDisplay(securityDepositCents),
          late_fee_cents: lateFeeCents,
          late_fee_display: centDisplay(lateFeeCents),
          escrow_amount_cents: escrowCents,
          escrow_display: centDisplay(escrowCents),
        },
        vehicles: vehicles.map((v, i) => ({ sort_order: i + 1, ...v })),
      };

      return legalContractsApi.create(operatingCompanyId, {
        template_id: templateId,
        signer_name: lessee.signer_name,
        signer_email: lessee.signer_email,
        signer_type: "vendor",
        signer_entity_id: lesseeVendorId,
        language: "en",
        filled_variables: filledVariables,
      });
    },
    onSuccess: async (created) => {
      pushToast("Truck lease agreement created as draft.", "success");
      await queryClient.invalidateQueries({ queryKey: ["legal", "contracts"] });
      onSaved(created.id);
      onClose();
    },
    onError: (error) => pushToast(userFacingApiError(error, "Failed to create lease"), "error"),
  });

  if (!open) return null;

  function updateVehicle(key: string, field: keyof VehicleRow, value: string) {
    setVehicles((prev) => prev.map((v) => v.key === key ? { ...v, [field]: value } : v));
  }

  return (
    <ParityDrawer
      open={open}
      onClose={onClose}
      title="New Truck Lease Agreement"
      subtitle="Commercial operating lease — no purchase option. Saves as draft, then send to signer."
      size="wide"
    >
        {ensureQuery.isLoading ? (
          <div className="px-1 py-8 text-center text-sm text-gray-500">Preparing template…</div>
        ) : ensureQuery.isError ? (
          <div className="px-1 py-8 text-center text-sm text-red-600">Template unavailable. LEGAL_CONTRACTS_ENABLED may be off.</div>
        ) : (
          <div className="space-y-5">

            {/* Lessor */}
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Lessor (equipment owner)</h3>
              <div className="grid gap-2 sm:grid-cols-2">
                {([["legal_name","Legal Name *"],["address","Address"],["city_state_zip","City, State ZIP"],["contact_name","Contact Name"],["contact_title","Title"],["contact_email","Contact Email"]] as [keyof typeof lessor, string][]).map(([k,l]) => (
                  <div key={k}>
                    <label className="block text-[10px] font-semibold text-gray-500 mb-0.5">{l}</label>
                    <input value={lessor[k]} onChange={(e) => setLessor((p) => ({ ...p, [k]: e.target.value }))}
                      className="w-full h-10 rounded-sm border border-gray-300 px-2 text-sm" />
                  </div>
                ))}
              </div>
            </section>

            {/* Lessee */}
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Lessee (operator)</h3>
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="mb-0.5 block text-[10px] font-semibold text-gray-500">Lessee vendor *</label>
                  <ReferenceSelect
                    value={lesseeVendorId || null}
                    onChange={(id) => {
                      setLesseeVendorId(id ?? "");
                      if (id) {
                        void getVendor(id, operatingCompanyId).then((vendor) => setLessee((current) => ({
                          ...current,
                          legal_name: vendor.name,
                          address: vendor.address ?? "",
                          city_state_zip: [vendor.city, vendor.state, vendor.postal_code].filter(Boolean).join(", "),
                          signer_email: vendor.email ?? current.signer_email,
                        })));
                      }
                    }}
                    options={vendorOptions.map(({ value, label }) => ({ value, label, type: value }))}
                    createKind="vendor"
                    operatingCompanyId={operatingCompanyId}
                    placeholder="Search vendor…"
                    onSearch={setVendorSearch}
                    loading={vendorsQuery.isLoading}
                  />
                  <CappedListNotice shown={vendorOptions.length} limit={vendorSearch ? 200 : 500} total={vendorsQuery.data?.total ?? null} hint="Type to search for a vendor not listed." />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-gray-500 mb-0.5">Legal Name *</label>
                  <input value={lessee.legal_name} onChange={(e) => setLessee((p) => ({ ...p, legal_name: e.target.value }))}
                    className="w-full h-10 rounded-sm border border-gray-300 px-2 text-sm" />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-gray-500 mb-0.5">Entity Type</label>
                  <select value={lessee.entity_type} onChange={(e) => setLessee((p) => ({ ...p, entity_type: e.target.value }))}
                    className="w-full h-10 rounded-sm border border-gray-300 px-2 text-sm">
                    {["LLC","Inc.","Corp.","LP","LLLP","Sole Proprietor"].map((t) => <option key={t}>{t}</option>)}
                  </select>
                </div>
                {([["address","Address"],["city_state_zip","City, State ZIP"],["signer_name","Signer Name *"],["signer_title","Signer Title"],["signer_email","Signer Email *"]] as [keyof typeof lessee, string][]).map(([k,l]) => (
                  <div key={k}>
                    <label className="block text-[10px] font-semibold text-gray-500 mb-0.5">{l}</label>
                    <input value={lessee[k]} onChange={(e) => setLessee((p) => ({ ...p, [k]: e.target.value }))}
                      className="w-full h-10 rounded-sm border border-gray-300 px-2 text-sm"
                      type={k === "signer_email" ? "email" : "text"} />
                  </div>
                ))}
              </div>
            </section>

            {/* Terms */}
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Lease Terms</h3>
              <div className="grid gap-2 sm:grid-cols-3">
                {([
                  ["execution_date","Execution Date","date"],["start_date","Start Date","date"],["end_date","End Date","date"],
                  ["term_months","Term (months)","text"],["monthly_lease_amount","Monthly Lease $ *","text"],
                  ["payment_due_day","Payment Due Day","text"],["security_deposit","Security Deposit $","text"],
                  ["late_fee","Late Fee $","text"],["late_fee_grace_days","Grace Days","text"],
                  ["governing_law","Governing Law","text"],["venue_county","Venue County","text"],
                  ["reference_no","Reference No.","text"],["escrow_agent_name","Escrow Agent","text"],
                  ["escrow_amount","Escrow $/mo","text"],
                ] as [keyof typeof terms, string, string][]).map(([k,l,t]) => (
                  <div key={k}>
                    <label className="block text-[10px] font-semibold text-gray-500 mb-0.5">{l}</label>
                    <input type={t} value={terms[k]} onChange={(e) => setTerms((p) => ({ ...p, [k]: e.target.value }))}
                      className="w-full h-10 rounded-sm border border-gray-300 px-2 text-sm" />
                  </div>
                ))}
              </div>
            </section>

            {/* Vehicles */}
            <section>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Vehicles ({vehicles.length})</h3>
                <button type="button" onClick={() => setVehicles((p) => [...p, emptyVehicle(`v${Date.now()}`)])}
                  className="text-xs text-[#1f2a44] hover:underline">+ Add new vehicle</button>
              </div>
              <div className="space-y-3">
                {vehicles.map((v, i) => (
                  <div key={v.key} className="rounded-sm border border-gray-200 bg-gray-50 p-3">
                    <div className="mb-1 flex items-center justify-between">
                      <span className="text-xs font-semibold text-gray-600">Vehicle {i + 1}</span>
                      {vehicles.length > 1 && (
                        <button type="button" onClick={() => setVehicles((p) => p.filter((x) => x.key !== v.key))}
                          className="text-[10px] text-red-600 hover:underline">Remove</button>
                      )}
                    </div>
                    <div className="grid gap-2 sm:grid-cols-3">
                      {([["unit_number","Unit #"],["year","Year"],["make","Make"],["model","Model"],["vin","VIN"],["lienholder","Lienholder"],["permitted_use","Permitted Use"],["mileage_limit_annual","Annual Mi. Limit"]] as [keyof VehicleRow, string][]).map(([k,l]) => (
                        <div key={k}>
                          <label className="block text-[10px] font-semibold text-gray-500 mb-0.5">{l}</label>
                          <input value={v[k]} onChange={(e) => updateVehicle(v.key, k, e.target.value)}
                            className="w-full h-10 rounded-sm border border-gray-300 px-2 text-sm" />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <div className="border-t border-gray-200 pt-3 flex justify-end gap-2">
              <Button variant="secondary" onClick={onClose}>Cancel</Button>
              <Button
                onClick={() => saveMutation.mutate()}
                loading={saveMutation.isPending}
                disabled={!templateId || !lessee.legal_name || !lessee.signer_email || !terms.monthly_lease_amount}
              >
                Save as Draft
              </Button>
            </div>
          </div>
        )}
    </ParityDrawer>
  );
}
