import { Button } from "../../components/Button";
import { FlatFieldGrid } from "../../components/layout/FlatFieldGrid";
import type { Factor } from "../../api/factoring";
import { parseRemittanceDetails, rateToPctString } from "../../lib/factorProfile";

type Props = {
  factor: Factor;
  saving?: boolean;
  onSave: () => void;
};

function dash(value: string | number | null | undefined): string {
  if (value == null || value === "") return "—";
  return String(value);
}

export function FactoringProfilePanel({ factor, saving, onSave }: Props) {
  const remit = parseRemittanceDetails(factor.remittance_details);
  const feeTiers = Array.isArray(factor.fee_schedule) ? factor.fee_schedule.length : 0;
  const reserveTiers = Array.isArray(factor.reserve_schedule) ? factor.reserve_schedule.length : 0;

  return (
    <section className="rounded-sm border border-gray-200 bg-white p-3 text-xs" data-testid="factoring-profile-panel" data-factoring-profile-panel>
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <h3 className="font-medium text-gray-900">Active factoring company profile</h3>
          <p className="text-xs text-gray-500">{factor.name} · primary factoring company on file</p>
        </div>
        <Button size="sm" variant="secondary" onClick={onSave} loading={saving} data-testid="factoring-profile-edit">
          Edit factoring profile
        </Button>
      </div>
      <FlatFieldGrid
        columns={3}
        fields={[
          { label: "Advance rate %", value: dash(rateToPctString(factor.advance_rate)) },
          { label: "Fee rate %", value: dash(rateToPctString(factor.fee_rate)) },
          { label: "Reserve rate %", value: dash(rateToPctString(factor.reserve_rate)) },
          { label: "Recourse days", value: dash(factor.recourse_days) },
          { label: "Telephone", value: dash(remit.telephone) },
          { label: "Address", value: dash(remit.address) },
          { label: "General email", value: dash(remit.generalEmail) },
          { label: "Primary contact", value: dash(remit.primaryContactName) },
          { label: "Primary contact email", value: dash(remit.primaryContactEmail) },
          { label: "Accounting contact", value: dash(remit.accountingContact) },
          { label: "Disputes contact", value: dash(remit.disputesContact) },
          { label: "Escrow reserves % (extra)", value: dash(remit.escrowReservesPct) },
          { label: "Late fees % (extra)", value: dash(remit.lateFeesPct) },
          { label: "Chargebacks % (extra)", value: dash(remit.chargebacksPct) },
          {
            label: "Tier schedules",
            value: feeTiers || reserveTiers ? `fee ${feeTiers} · reserve ${reserveTiers}` : "Flat rates only",
          },
        ]}
      />
    </section>
  );
}
