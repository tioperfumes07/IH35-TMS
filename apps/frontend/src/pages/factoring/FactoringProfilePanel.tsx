import { Button } from "../../components/Button";
import { FlatFieldGrid } from "../../components/layout/FlatFieldGrid";
import type { VendorProfileMeta } from "../../lib/vendorProfileMeta";

type Props = {
  meta: VendorProfileMeta;
  saving?: boolean;
  onSave: () => void;
};

export function FactoringProfilePanel({ meta, saving, onSave }: Props) {
  const { factoring } = meta;

  return (
    <section className="rounded border border-gray-200 bg-white p-3 text-sm" data-factoring-profile-panel>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="font-medium text-gray-900">Active factoring company profile</h3>
        <Button size="sm" variant="secondary" onClick={onSave} loading={saving}>
          Edit factoring profile
        </Button>
      </div>
      <FlatFieldGrid
        columns={3}
        fields={[
          { label: "Telephone", value: meta.telephone },
          { label: "Address", value: meta.address },
          { label: "General email", value: meta.generalEmail },
          { label: "Primary contact", value: meta.primaryContactName },
          { label: "Primary contact email", value: meta.primaryContactEmail },
          { label: "Accounting contact", value: meta.accountingContact },
          { label: "Disputes contact", value: meta.disputesContact },
          { label: "Factoring reserves %", value: factoring.factoringReservesPct },
          { label: "Escrow reserves %", value: factoring.escrowReservesPct },
          { label: "Late fees %", value: factoring.lateFeesPct },
          { label: "Chargebacks %", value: factoring.chargebacksPct },
          {
            label: "31-60 advance/fee %",
            value: `${factoring.advanceRate31To60Pct || "—"} / ${factoring.advanceFee31To60Pct || "—"}`,
          },
          {
            label: "61-90 advance/fee %",
            value: `${factoring.advanceRate61To90Pct || "—"} / ${factoring.advanceFee61To90Pct || "—"}`,
          },
        ]}
      />
    </section>
  );
}
