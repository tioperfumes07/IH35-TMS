import { useQuery } from "@tanstack/react-query";
import { Truck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { getMyEquipment } from "../api/pwa-live";
import { PwaCard } from "../components/PwaCard";

function equipmentLabel(value: string | null | undefined, fallback: string) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : fallback;
}

export function EquipmentPage() {
  const { t } = useTranslation();
  const equipmentQuery = useQuery({
    queryKey: ["pwa", "equipment"],
    queryFn: getMyEquipment,
  });

  if (equipmentQuery.isLoading) {
    return <div className="min-h-screen bg-pwa-bg px-4 py-3 text-pwa-text-secondary">{t("common.loading")}</div>;
  }

  const data = equipmentQuery.data;
  const truck = data?.truck ?? null;
  const trailer = data?.trailer ?? null;

  return (
    <div className="min-h-screen bg-pwa-bg px-4 py-3 text-pwa-text-primary">
      <div className="mx-auto flex w-full max-w-md flex-col gap-3 pb-24">
        <PwaCard title={t("equipment.title")} subtitle={t("equipment.subtitle")}>
          <div className="mb-2 inline-flex items-center gap-2 text-sm font-semibold">
            <Truck className="h-4 w-4" />
            {t("equipment.assigned_heading")}
          </div>
          {!truck && !trailer ? <p className="text-sm text-pwa-text-secondary">{t("equipment.empty")}</p> : null}
          {truck ? (
            <div className="rounded-lg border border-pwa-border bg-[#101522] p-3">
              <div className="text-xs uppercase tracking-wide text-pwa-text-secondary">{t("equipment.truck")}</div>
              <div className="mt-1 text-lg font-semibold">{equipmentLabel(truck.unit_number, t("equipment.unassigned"))}</div>
              <div className="mt-2 space-y-1 text-xs text-pwa-text-secondary">
                <div>{t("equipment.vin")}: {equipmentLabel(truck.vin, "—")}</div>
                <div>
                  {t("equipment.make_model")}: {equipmentLabel([truck.make, truck.model].filter(Boolean).join(" "), "—")}
                </div>
                <div>{t("equipment.source")}: {truck.assignment_source}</div>
              </div>
            </div>
          ) : null}
          {trailer ? (
            <div className="mt-3 rounded-lg border border-pwa-border bg-[#101522] p-3">
              <div className="text-xs uppercase tracking-wide text-pwa-text-secondary">{t("equipment.trailer")}</div>
              <div className="mt-1 text-lg font-semibold">{equipmentLabel(trailer.equipment_number, t("equipment.unassigned"))}</div>
              <div className="mt-2 text-xs text-pwa-text-secondary">
                {t("equipment.type")}: {equipmentLabel(trailer.equipment_type, "—")}
              </div>
            </div>
          ) : null}
        </PwaCard>
      </div>
    </div>
  );
}
