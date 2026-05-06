import { useMemo, useState } from "react";
import type { DispatchLoadRow } from "../../api/loads";
import { useCreateLoad } from "../../api/loads";
import { Button } from "../Button";
import { Combobox } from "../Combobox";
import { Modal } from "../Modal";

type CustomerOption = { id: string; label: string };
type CompanyOption = { id: string; label: string };

type Props = {
  open: boolean;
  companies: CompanyOption[];
  customers: CustomerOption[];
  defaultCompanyId: string | null;
  onClose: () => void;
  onCreated: (load: DispatchLoadRow | null) => void;
};

type StopForm = {
  location_id: string;
  address_line1: string;
  city: string;
  state: string;
  country: string;
  scheduled_arrival_at: string;
};

function emptyStop(): StopForm {
  return {
    location_id: "",
    address_line1: "",
    city: "",
    state: "",
    country: "USA",
    scheduled_arrival_at: "",
  };
}

export function NewLoadModal({ open, companies, customers, defaultCompanyId, onClose, onCreated }: Props) {
  const createLoad = useCreateLoad();
  const [step, setStep] = useState(1);
  const [companyId, setCompanyId] = useState<string | null>(defaultCompanyId);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [rateCents, setRateCents] = useState("0");
  const [notes, setNotes] = useState("");
  const [pickup, setPickup] = useState<StopForm>(emptyStop());
  const [delivery, setDelivery] = useState<StopForm>(emptyStop());

  const currentStepValid = useMemo(() => {
    if (step === 1) return Boolean(companyId && customerId && /^\d+$/.test(rateCents));
    if (step === 2) return Boolean(pickup.city && pickup.state && pickup.country && pickup.scheduled_arrival_at);
    return Boolean(delivery.city && delivery.state && delivery.country && delivery.scheduled_arrival_at);
  }, [companyId, customerId, delivery, pickup, rateCents, step]);

  const reset = () => {
    setStep(1);
    setCompanyId(defaultCompanyId);
    setCustomerId(null);
    setRateCents("0");
    setNotes("");
    setPickup(emptyStop());
    setDelivery(emptyStop());
  };

  return (
    <Modal open={open} onClose={onClose} title="New Load Wizard">
      <div className="mb-3 flex items-center gap-2 text-xs">
        {[1, 2, 3].map((value) => (
          <div key={value} className={`rounded px-2 py-1 ${step === value ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600"}`}>
            Step {value}
          </div>
        ))}
      </div>

      {step === 1 ? (
        <div className="space-y-2">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-600">Operating Company</label>
            <Combobox
              options={companies.map((company) => ({ value: company.id, label: company.label }))}
              value={companyId}
              onChange={(nextCompanyId) => setCompanyId(nextCompanyId)}
              placeholder="Select company"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-600">Customer</label>
            <Combobox
              options={customers.map((customer) => ({ value: customer.id, label: customer.label }))}
              value={customerId}
              onChange={(nextCustomerId) => setCustomerId(nextCustomerId)}
              placeholder="Select customer"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-600">Rate (cents)</label>
            <input
              value={rateCents}
              onChange={(event) => setRateCents(event.target.value.replace(/[^\d]/g, ""))}
              className="h-9 w-full rounded border border-gray-300 px-2 text-sm"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-600">Notes</label>
            <textarea rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} className="w-full rounded border border-gray-300 px-2 py-2 text-sm" />
          </div>
        </div>
      ) : null}

      {step === 2 ? (
        <StopStep title="Pickup stop" value={pickup} onChange={setPickup} />
      ) : null}

      {step === 3 ? (
        <StopStep title="Delivery stop" value={delivery} onChange={setDelivery} />
      ) : null}

      <div className="mt-4 flex justify-between">
        <div>
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
        </div>
        <div className="flex gap-2">
          {step > 1 ? (
            <Button type="button" variant="secondary" onClick={() => setStep((current) => Math.max(1, current - 1))}>
              Back
            </Button>
          ) : null}
          {step < 3 ? (
            <Button type="button" onClick={() => setStep((current) => Math.min(3, current + 1))} disabled={!currentStepValid}>
              Next
            </Button>
          ) : (
            <Button
              type="button"
              loading={createLoad.isPending}
              disabled={!currentStepValid || !companyId || !customerId}
              onClick={async () => {
                if (!companyId || !customerId) return;
                const result = await createLoad.mutateAsync({
                  operating_company_id: companyId,
                  customer_id: customerId,
                  rate_total_cents: Number(rateCents || "0"),
                  notes: notes || undefined,
                  pickup: {
                    location_id: pickup.location_id || undefined,
                    address_line1: pickup.address_line1 || undefined,
                    city: pickup.city,
                    state: pickup.state,
                    country: pickup.country,
                    scheduled_arrival_at: new Date(pickup.scheduled_arrival_at).toISOString(),
                  },
                  delivery: {
                    location_id: delivery.location_id || undefined,
                    address_line1: delivery.address_line1 || undefined,
                    city: delivery.city,
                    state: delivery.state,
                    country: delivery.country,
                    scheduled_arrival_at: new Date(delivery.scheduled_arrival_at).toISOString(),
                  },
                });
                onCreated(result as DispatchLoadRow);
                reset();
                onClose();
              }}
            >
              Create Load
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}

function StopStep({ title, value, onChange }: { title: string; value: StopForm; onChange: (next: StopForm) => void }) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-gray-700">{title}</h3>
      <div className="space-y-1">
        <label className="text-xs font-semibold text-gray-600">Address line 1 (optional)</label>
        <input value={value.address_line1} onChange={(event) => onChange({ ...value, address_line1: event.target.value })} className="h-9 w-full rounded border border-gray-300 px-2 text-sm" />
      </div>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
        <div className="space-y-1">
          <label className="text-xs font-semibold text-gray-600">City</label>
          <input value={value.city} onChange={(event) => onChange({ ...value, city: event.target.value })} className="h-9 w-full rounded border border-gray-300 px-2 text-sm" />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-semibold text-gray-600">State</label>
          <input value={value.state} onChange={(event) => onChange({ ...value, state: event.target.value })} className="h-9 w-full rounded border border-gray-300 px-2 text-sm" />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-semibold text-gray-600">Country</label>
          <input value={value.country} onChange={(event) => onChange({ ...value, country: event.target.value })} className="h-9 w-full rounded border border-gray-300 px-2 text-sm" />
        </div>
      </div>
      <div className="space-y-1">
        <label className="text-xs font-semibold text-gray-600">Scheduled arrival</label>
        <input
          type="datetime-local"
          value={value.scheduled_arrival_at}
          onChange={(event) => onChange({ ...value, scheduled_arrival_at: event.target.value })}
          className="h-9 w-full rounded border border-gray-300 px-2 text-sm"
        />
      </div>
    </div>
  );
}
