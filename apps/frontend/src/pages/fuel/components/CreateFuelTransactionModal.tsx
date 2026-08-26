import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createFuelTransaction, type FuelType } from "../../../api/fuelPlanner";
import { suggestExpenseLoad } from "../../../api/maintenance";
import { Button } from "../../../components/Button";
import { Modal } from "../../../components/Modal";
import { DatePicker } from "../../../components/forms/DatePicker";
import { MoneyInput } from "../../../components/forms/MoneyInput";
import { EntityPicker } from "../../../components/parity/EntityPicker";
import { SelectCombobox } from "../../../components/shared/SelectCombobox";
import { useToast } from "../../../components/Toast";
import { companyToday } from "../../../lib/businessDate";
import { userFacingApiError } from "../../../lib/api-error-message";

type Props = {
  open: boolean;
  operatingCompanyId: string;
  onClose: () => void;
  onCreated: () => void;
};

const FUEL_TYPES: Array<{ value: FuelType; label: string }> = [
  { value: "diesel", label: "Diesel" },
  { value: "def", label: "DEF" },
  { value: "gas", label: "Gas" },
  { value: "reefer_diesel", label: "Reefer diesel" },
  { value: "other", label: "Other" },
];

/**
 * RANK3 FE — office manual create → POST /api/v1/fuel/transactions (#6319).
 * G18: load_id OR load_exemption_reason (never silent unattributed). Historical QBO null loads stay exempt; this is going-forward only.
 */
export function CreateFuelTransactionModal({ open, operatingCompanyId, onClose, onCreated }: Props) {
  const { pushToast } = useToast();
  const [saving, setSaving] = useState(false);
  const [transactionDate, setTransactionDate] = useState(companyToday);
  const [driverId, setDriverId] = useState("");
  const [unitId, setUnitId] = useState("");
  const [trailerId, setTrailerId] = useState("");
  const [vendorId, setVendorId] = useState("");
  const [loadId, setLoadId] = useState("");
  const [loadExemptionReason, setLoadExemptionReason] = useState("");
  const [fuelType, setFuelType] = useState<FuelType>("diesel");
  const [gallons, setGallons] = useState("");
  const [pricePerGallon, setPricePerGallon] = useState("");
  const [totalCost, setTotalCost] = useState<number | null>(null);
  const [locationCity, setLocationCity] = useState("");
  const [locationState, setLocationState] = useState("");
  const [notes, setNotes] = useState("");
  const [suggestionPinned, setSuggestionPinned] = useState(false);
  const lifecycleGenerationRef = useRef(0);

  useEffect(() => {
    lifecycleGenerationRef.current += 1;
    setSaving(false);
    if (!open) return;
    setTransactionDate(companyToday());
    setDriverId("");
    setUnitId("");
    setTrailerId("");
    setVendorId("");
    setLoadId("");
    setLoadExemptionReason("");
    setFuelType("diesel");
    setGallons("");
    setPricePerGallon("");
    setTotalCost(null);
    setLocationCity("");
    setLocationState("");
    setNotes("");
    setSuggestionPinned(false);
  }, [open, operatingCompanyId]);

  const suggestionQuery = useQuery({
    queryKey: ["fuel-office-create", "suggest-load", operatingCompanyId, driverId, unitId, trailerId, transactionDate],
    queryFn: () =>
      suggestExpenseLoad({
        operating_company_id: operatingCompanyId,
        driver_id: driverId || undefined,
        unit_id: unitId || undefined,
        trailer_id: trailerId || undefined,
        transaction_date: transactionDate,
      }),
    enabled: open && Boolean(operatingCompanyId && transactionDate && (driverId || unitId || trailerId)),
  });

  useEffect(() => {
    setSuggestionPinned(false);
  }, [driverId, unitId, trailerId, transactionDate]);

  useEffect(() => {
    if (loadId || suggestionPinned) return;
    const suggested = suggestionQuery.data?.data;
    if (!suggested?.load_id) return;
    setLoadId(suggested.load_id);
    setSuggestionPinned(true);
  }, [loadId, suggestionPinned, suggestionQuery.data]);

  const submit = async () => {
    if (totalCost == null || !(totalCost > 0)) {
      pushToast("Total cost is required", "error");
      return;
    }
    if (!loadId && loadExemptionReason.trim().length < 3) {
      pushToast("Pick a trip/load, or enter a load exemption reason (G18)", "error");
      return;
    }
    const submissionGeneration = lifecycleGenerationRef.current;
    setSaving(true);
    try {
      const gallonsNum = gallons.trim() ? Number(gallons) : undefined;
      const ppgNum = pricePerGallon.trim() ? Number(pricePerGallon) : undefined;
      await createFuelTransaction(operatingCompanyId, {
        transaction_at: transactionDate,
        driver_id: driverId || null,
        unit_id: unitId || null,
        trailer_id: trailerId || null,
        vendor_id: vendorId || null,
        fuel_type: fuelType,
        gallons: gallonsNum && Number.isFinite(gallonsNum) && gallonsNum > 0 ? gallonsNum : undefined,
        price_per_gallon: ppgNum && Number.isFinite(ppgNum) && ppgNum > 0 ? ppgNum : undefined,
        total_cost: totalCost,
        location_city: locationCity.trim() || undefined,
        location_state: locationState.trim() || undefined,
        notes: notes.trim() || undefined,
        load_id: loadId || null,
        load_exemption_reason: loadId ? undefined : loadExemptionReason.trim(),
      });
      pushToast("Fuel purchase recorded", "success");
      if (lifecycleGenerationRef.current !== submissionGeneration) return;
      onCreated();
      onClose();
    } catch (error) {
      pushToast(userFacingApiError(error, "Failed to record fuel purchase"), "error");
    } finally {
      if (lifecycleGenerationRef.current === submissionGeneration) setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Create Fuel Purchase" variant="drawer">
      <div className="space-y-3 text-xs" data-testid="create-fuel-transaction-modal">
        <div className="block font-semibold text-gray-700">
          <label htmlFor="fuel-purchase-date">Purchase date *</label>
          <div className="mt-1">
            <DatePicker id="fuel-purchase-date" className="w-full" value={transactionDate} onChange={setTransactionDate} />
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <label className="block font-semibold text-gray-700">
            Driver
            <div className="mt-1">
              <EntityPicker
                kind="driver"
                operatingCompanyId={operatingCompanyId}
                value={driverId || null}
                onChange={(next) => setDriverId(next ?? "")}
                placeholder="Search driver…"
                dataTestId="fuel-create-driver"
                allowClear
              />
            </div>
          </label>
          <label className="block font-semibold text-gray-700">
            Vendor
            <div className="mt-1">
              <EntityPicker
                kind="vendor"
                operatingCompanyId={operatingCompanyId}
                value={vendorId || null}
                onChange={(next) => setVendorId(next ?? "")}
                placeholder="Search vendor…"
                dataTestId="fuel-create-vendor"
                allowCreate
                allowClear
              />
            </div>
          </label>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <label className="block font-semibold text-gray-700">
            Truck / Unit
            <div className="mt-1">
              <EntityPicker
                kind="unit"
                operatingCompanyId={operatingCompanyId}
                value={unitId || null}
                onChange={(next) => setUnitId(next ?? "")}
                placeholder="Search unit…"
                dataTestId="fuel-create-unit"
                allowClear
              />
            </div>
          </label>
          <label className="block font-semibold text-gray-700">
            Trailer
            <div className="mt-1">
              <EntityPicker
                kind="trailer"
                operatingCompanyId={operatingCompanyId}
                value={trailerId || null}
                onChange={(next) => setTrailerId(next ?? "")}
                placeholder="Search trailer…"
                dataTestId="fuel-create-trailer"
                allowClear
              />
            </div>
          </label>
        </div>

        <label className="block font-semibold text-gray-700">
          Trip / Load
          <div className="mt-1">
            <EntityPicker
              kind="load"
              operatingCompanyId={operatingCompanyId}
              value={loadId || null}
              onChange={(next) => {
                setLoadId(next ?? "");
                setSuggestionPinned(Boolean(next));
              }}
              placeholder="Search trip / load…"
              dataTestId="fuel-create-load"
              allowClear
            />
          </div>
          {suggestionPinned && loadId && suggestionQuery.data?.data?.load_id === loadId ? (
            <p className="mt-1 text-[11px] text-slate-600" data-testid="fuel-create-load-suggested">
              Suggested from driver / unit / trailer + date
            </p>
          ) : null}
        </label>

        {!loadId ? (
          <label className="block font-semibold text-gray-700">
            Load exemption reason * (G18 — required when no trip)
            <input
              className="mt-1 h-9 w-full rounded-sm border border-gray-300 px-2 text-sm"
              value={loadExemptionReason}
              onChange={(e) => setLoadExemptionReason(e.target.value)}
              placeholder="e.g. Yard fuel — no active trip"
              data-testid="fuel-create-load-exemption"
            />
          </label>
        ) : null}

        <div className="grid gap-3 md:grid-cols-3">
          <label className="block font-semibold text-gray-700">
            Fuel type
            <div className="mt-1">
              <SelectCombobox
                className="h-9 w-full rounded-sm border border-gray-300 px-2 text-sm"
                value={fuelType}
                onChange={(e) => setFuelType(e.target.value as FuelType)}
              >
                {FUEL_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </SelectCombobox>
            </div>
          </label>
          <label className="block font-semibold text-gray-700">
            Gallons
            <input
              className="mt-1 h-9 w-full rounded-sm border border-gray-300 px-2 text-sm"
              inputMode="decimal"
              value={gallons}
              onChange={(e) => setGallons(e.target.value)}
              data-testid="fuel-create-gallons"
            />
          </label>
          <label className="block font-semibold text-gray-700">
            $/gal
            <input
              className="mt-1 h-9 w-full rounded-sm border border-gray-300 px-2 text-sm"
              inputMode="decimal"
              value={pricePerGallon}
              onChange={(e) => setPricePerGallon(e.target.value)}
              data-testid="fuel-create-ppg"
            />
          </label>
        </div>

        <label className="block font-semibold text-gray-700">
          Total cost (USD) *
          <MoneyInput
            valueDollars={totalCost}
            onChangeDollars={setTotalCost}
            ariaLabel="Total cost (USD)"
            className="mt-1 w-full"
          />
        </label>

        <div className="grid gap-3 md:grid-cols-2">
          <label className="block font-semibold text-gray-700">
            City
            <input
              className="mt-1 h-9 w-full rounded-sm border border-gray-300 px-2 text-sm"
              value={locationCity}
              onChange={(e) => setLocationCity(e.target.value)}
            />
          </label>
          <label className="block font-semibold text-gray-700">
            State
            <input
              className="mt-1 h-9 w-full rounded-sm border border-gray-300 px-2 text-sm"
              value={locationState}
              onChange={(e) => setLocationState(e.target.value)}
              maxLength={10}
            />
          </label>
        </div>

        <label className="block font-semibold text-gray-700">
          Notes
          <input
            className="mt-1 h-9 w-full rounded-sm border border-gray-300 px-2 text-sm"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </label>

        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" loading={saving} onClick={() => void submit()} data-testid="fuel-create-submit">
            + Create
          </Button>
        </div>
      </div>
    </Modal>
  );
}
