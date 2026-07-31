import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { listUnits, listVendors } from "../../api/mdata";
import { Button } from "../../components/Button";
import { Modal } from "../../components/Modal";
import { ReferenceSelect } from "../../components/parity/ReferenceSelect";
import { vendorReferenceOption } from "../../components/parity/referenceOptionLabels";
import { SelectCombobox } from "../../components/shared/SelectCombobox";
import { useRoadServiceTickets, type RoadServiceType } from "../../hooks/useRoadServiceTickets";

type Props = {
  open: boolean;
  onClose: () => void;
  operatingCompanyId: string;
};

const SERVICE_TYPES: Array<{ value: RoadServiceType; label: string }> = [
  { value: "tire_change", label: "Tire change" },
  { value: "jump_start", label: "Jump start" },
  { value: "fuel_delivery", label: "Fuel delivery" },
  { value: "lockout", label: "Lockout" },
  { value: "tow", label: "Tow" },
  { value: "other", label: "Other" },
];

export function RoadServiceTicketModal({ open, onClose, operatingCompanyId }: Props) {
  const { createTicket } = useRoadServiceTickets();
  const queryClient = useQueryClient();
  const unitsQuery = useQuery({
    queryKey: ["units", "road-service", operatingCompanyId],
    queryFn: () =>
      listUnits({ operating_company_id: operatingCompanyId }).then((res) =>
        (res.units as Array<{ id: string; display_id?: string | null; unit_number?: string | null }>)
      ),
    enabled: open && Boolean(operatingCompanyId),
  });

  const vendorsQuery = useQuery({
    queryKey: ["mdata", "vendors", operatingCompanyId, "road-service"],
    queryFn: () => listVendors({ operating_company_id: operatingCompanyId, status: "active", limit: 200 }),
    enabled: open && Boolean(operatingCompanyId),
  });

  const [ticketNumber, setTicketNumber] = useState("");
  const [vendorId, setVendorId] = useState("");
  const [vendorName, setVendorName] = useState("");
  const [unitId, setUnitId] = useState("");
  const [serviceType, setServiceType] = useState<RoadServiceType>("tire_change");
  const [locationAddress, setLocationAddress] = useState("");
  const [initialComplaint, setInitialComplaint] = useState("");
  const [error, setError] = useState<string | null>(null);

  const unitOptions = (unitsQuery.data ?? []).map((unit) => ({
    value: unit.id,
    label: unit.display_id ?? unit.unit_number ?? unit.id,
  }));

  const vendorOptions = useMemo(
    () => (vendorsQuery.data?.vendors ?? []).map(vendorReferenceOption).sort((a, b) => a.label.localeCompare(b.label)),
    [vendorsQuery.data?.vendors]
  );

  async function handleSubmit() {
    setError(null);
    if (!ticketNumber.trim() || !vendorId || !vendorName.trim() || !unitId) {
      setError("Ticket #, vendor, and unit are required.");
      return;
    }
    try {
      await createTicket.mutateAsync({
        ticket_number: ticketNumber.trim(),
        vendor_name: vendorName.trim(),
        vendor_id: vendorId,
        unit_id: unitId,
        service_type: serviceType,
        location_address: locationAddress || undefined,
        initial_complaint: initialComplaint || undefined,
      });
      onClose();
      setTicketNumber("");
      setVendorId("");
      setVendorName("");
      setUnitId("");
      setLocationAddress("");
      setInitialComplaint("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create ticket");
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Road service ticket">
      <div className="space-y-3" data-testid="road-service-ticket-modal">
        <label className="block text-xs font-medium text-gray-700">
          Ticket #
          <input className="mt-1 w-full rounded-sm border border-gray-300 px-2 py-1 text-sm" value={ticketNumber} onChange={(e) => setTicketNumber(e.target.value)} />
        </label>
        <label className="block text-xs font-medium text-gray-700">
          Vendor
          {/*
            LST-PICKER-01 (guard 1866): free-text vendor_name alone cannot satisfy POST
            (vendor_id required → mdata.vendors). ReferenceSelect createKind=vendor wires the
            canonical AP vendor + keeps vendor_name for display/memo.
          */}
          <div className="mt-1" data-testid="road-service-vendor-select">
            <ReferenceSelect
              value={vendorId || null}
              onChange={(next) => {
                const id = next ?? "";
                const opt = vendorOptions.find((o) => o.value === id);
                setVendorId(id);
                setVendorName(opt?.label ?? "");
              }}
              options={vendorOptions}
              createKind="vendor"
              operatingCompanyId={operatingCompanyId}
              placeholder={vendorsQuery.isLoading ? "Loading vendors…" : "Select vendor…"}
              loading={vendorsQuery.isLoading}
              onOptionCreated={async (opt) => {
                setVendorId(opt.value);
                setVendorName(opt.label);
                await queryClient.invalidateQueries({ queryKey: ["mdata", "vendors", operatingCompanyId, "road-service"] });
              }}
            />
          </div>
        </label>
        <label className="block text-xs font-medium text-gray-700">
          Unit
          <SelectCombobox
            className="mt-1 h-9 w-full rounded-sm border border-gray-300 px-2 text-[13px]"
            value={unitId}
            onChange={(e) => setUnitId(e.target.value)}
          >
            <option value="">Select unit…</option>
            {unitOptions.map((unit) => (
              <option key={unit.value} value={unit.value}>
                {unit.label}
              </option>
            ))}
          </SelectCombobox>
        </label>
        <label className="block text-xs font-medium text-gray-700">
          Service type
          <SelectCombobox
            className="mt-1 h-9 w-full rounded-sm border border-gray-300 px-2 text-[13px]"
            value={serviceType}
            onChange={(e) => setServiceType(e.target.value as RoadServiceType)}
          >
            {SERVICE_TYPES.map((row) => (
              <option key={row.value} value={row.value}>
                {row.label}
              </option>
            ))}
          </SelectCombobox>
        </label>
        <label className="block text-xs font-medium text-gray-700">
          Location
          <input className="mt-1 w-full rounded-sm border border-gray-300 px-2 py-1 text-sm" value={locationAddress} onChange={(e) => setLocationAddress(e.target.value)} />
        </label>
        <label className="block text-xs font-medium text-gray-700">
          Initial complaint
          <textarea className="mt-1 w-full rounded-sm border border-gray-300 px-2 py-1 text-sm" value={initialComplaint} onChange={(e) => setInitialComplaint(e.target.value)} />
        </label>
        {error ? <p className="text-xs text-red-600">{error}</p> : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void handleSubmit()}>
            Save ticket
          </Button>
        </div>
      </div>
    </Modal>
  );
}
