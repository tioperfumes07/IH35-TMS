import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createFuelCardAssignment } from "../../api/fuel-card-assignments";
import { fuelCardTypesCatalogClient } from "../../api/catalogs-fuel";
import { companyWallClockToIso } from "../../lib/businessDate";
import { companyToday } from "../../lib/businessDate";
import { userFacingApiError } from "../../lib/api-error-message";
import { Button } from "../Button";
import { ParityDrawer } from "../parity/ParityDrawer";
import { DatePicker } from "../forms/DatePicker";
import { EntityPicker } from "../EntityPicker";
import { SelectCombobox } from "../Combobox";

type Props = {
  open: boolean;
  operatingCompanyId: string;
  onClose: () => void;
  onCreated: () => void;
};

/** E-22 — card -> truck registry create form. Only the card's last 4-6 digits are ever stored. */
export function AssignFuelCardDrawer({ open, operatingCompanyId, onClose, onCreated }: Props) {
  const [cardDigits, setCardDigits] = useState("");
  const [unitId, setUnitId] = useState("");
  const [driverId, setDriverId] = useState("");
  const [cardTypeId, setCardTypeId] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState(companyToday());
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState("");

  useEffect(() => {
    if (!open) return;
    setCardDigits("");
    setUnitId("");
    setDriverId("");
    setCardTypeId("");
    setEffectiveFrom(companyToday());
    setNotes("");
    setSubmitError("");
    setSaving(false);
  }, [open]);

  const cardTypesQuery = useQuery({
    queryKey: ["fuel", "card-types", operatingCompanyId],
    // A small reference catalog (a handful of fuel card brands), not a paginated list — stay under
    // the silent-list-cap guard's MIN_CAP threshold rather than adding pager chrome to a dropdown.
    queryFn: () => fuelCardTypesCatalogClient.list({ operating_company_id: operatingCompanyId, is_active: "true", limit: 50 }),
    enabled: open && Boolean(operatingCompanyId),
  });
  const cardTypes = cardTypesQuery.data?.rows ?? [];

  const digitsValid = /^[0-9]{4,6}$/.test(cardDigits.trim());
  const valid = digitsValid && Boolean(unitId) && Boolean(effectiveFrom);

  const close = () => {
    if (saving) return;
    onClose();
  };

  const submit = async () => {
    if (!valid) return;
    setSaving(true);
    setSubmitError("");
    try {
      await createFuelCardAssignment(operatingCompanyId, {
        card_last_digits: cardDigits.trim(),
        unit_id: unitId,
        driver_id: driverId || null,
        fuel_card_type_id: cardTypeId || null,
        effective_from: companyWallClockToIso(`${effectiveFrom}T00:00`),
        notes: notes.trim() || null,
      });
      onCreated();
      onClose();
    } catch (err) {
      setSubmitError(userFacingApiError(err, "Failed to assign card"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ParityDrawer
      open={open}
      onClose={close}
      title="Assign fuel card"
      footer={
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={close} disabled={saving}>
            Cancel
          </Button>
          <Button type="button" loading={saving} disabled={!valid} onClick={() => void submit()} data-testid="fuel-cards-assign-submit">
            Assign
          </Button>
        </div>
      }
    >
      <div className="space-y-3 text-xs" data-testid="fuel-cards-assign-drawer">
        <label className="block font-semibold text-gray-700">
          Card last digits (4-6) *
          <input
            className="mt-1 h-9 w-full rounded-sm border border-gray-300 px-2 text-xs"
            value={cardDigits}
            onChange={(e) => setCardDigits(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))}
            placeholder="1234"
            data-testid="fuel-cards-assign-digits"
          />
          {cardDigits && !digitsValid ? <span className="mt-1 block text-[11px] text-red-700">4-6 digits only.</span> : null}
        </label>

        <label className="block font-semibold text-gray-700">
          Truck / Unit *
          <div className="mt-1">
            <EntityPicker
              kind="unit"
              operatingCompanyId={operatingCompanyId}
              value={unitId || null}
              onChange={(next) => setUnitId(next ?? "")}
              placeholder="Search unit…"
              dataTestId="fuel-cards-assign-unit"
              allowClear
            />
          </div>
        </label>

        <label className="block font-semibold text-gray-700">
          Driver (optional)
          <div className="mt-1">
            <EntityPicker
              kind="driver"
              operatingCompanyId={operatingCompanyId}
              value={driverId || null}
              onChange={(next) => setDriverId(next ?? "")}
              placeholder="Search driver…"
              dataTestId="fuel-cards-assign-driver"
              allowClear
            />
          </div>
        </label>

        {cardTypes.length > 0 ? (
          <label className="block font-semibold text-gray-700">
            Card type (optional)
            <div className="mt-1">
              <SelectCombobox
                className="h-9 w-full rounded-sm border border-gray-300 px-2 text-xs"
                value={cardTypeId}
                onChange={(e) => setCardTypeId(e.target.value)}
                data-testid="fuel-cards-assign-card-type"
              >
                <option value="">Any card type</option>
                {cardTypes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.display_name}
                  </option>
                ))}
              </SelectCombobox>
            </div>
          </label>
        ) : null}

        <label className="block font-semibold text-gray-700">
          Effective from *
          <div className="mt-1">
            <DatePicker value={effectiveFrom} onChange={setEffectiveFrom} data-testid="fuel-cards-assign-effective-from" />
          </div>
        </label>

        <label className="block font-semibold text-gray-700">
          Notes
          <input
            className="mt-1 h-9 w-full rounded-sm border border-gray-300 px-2 text-xs"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            data-testid="fuel-cards-assign-notes"
          />
        </label>

        {submitError ? (
          <div className="rounded-sm border border-red-300 bg-red-50 px-2 py-1 text-xs text-red-800" role="alert" data-testid="fuel-cards-assign-error">
            {submitError}
          </div>
        ) : null}
      </div>
    </ParityDrawer>
  );
}
