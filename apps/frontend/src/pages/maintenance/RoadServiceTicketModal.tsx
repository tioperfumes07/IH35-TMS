import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listUnits } from "../../api/mdata";
import { Button } from "../../components/Button";
import { Modal } from "../../components/Modal";
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
  const unitsQuery = useQuery({
    queryKey: ["units", "road-service", operatingCompanyId],
    queryFn: () =>
      listUnits({ operating_company_id: operatingCompanyId }).then((res) =>
        (res.units as Array<{ id: string; display_id?: string | null; unit_number?: string | null }>)
      ),
    enabled: open && Boolean(operatingCompanyId),
  });

  const [ticketNumber, setTicketNumber] = useState("");
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

  async function handleSubmit() {
    setError(null);
    if (!ticketNumber.trim() || !vendorName.trim() || !unitId) {
      setError("Ticket #, vendor, and unit are required.");
      return;
    }
    try {
      await createTicket.mutateAsync({
        ticket_number: ticketNumber.trim(),
        vendor_name: vendorName.trim(),
        unit_id: unitId,
        service_type: serviceType,
        location_address: locationAddress || undefined,
        initial_complaint: initialComplaint || undefined,
      });
      onClose();
      setTicketNumber("");
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
          <input className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm" value={ticketNumber} onChange={(e) => setTicketNumber(e.target.value)} />
        </label>
        <label className="block text-xs font-medium text-gray-700">
          Vendor
          <input className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm" value={vendorName} onChange={(e) => setVendorName(e.target.value)} />
        </label>
        <label className="block text-xs font-medium text-gray-700">
          Unit
          <SelectCombobox
            className="mt-1 h-9 w-full rounded border border-gray-300 px-2 text-[13px]"
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
            className="mt-1 h-9 w-full rounded border border-gray-300 px-2 text-[13px]"
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
          <input className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm" value={locationAddress} onChange={(e) => setLocationAddress(e.target.value)} />
        </label>
        <label className="block text-xs font-medium text-gray-700">
          Initial complaint
          <textarea className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm" value={initialComplaint} onChange={(e) => setInitialComplaint(e.target.value)} />
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
