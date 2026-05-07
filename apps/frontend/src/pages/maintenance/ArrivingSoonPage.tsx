import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../auth/useAuth";
import { getArrivingSoon, logArrivingSoonView, type ArrivingSoonCard as ArrivingSoonCardType } from "../../api/maintenance";
import { ArrivingSoonCard } from "./components/ArrivingSoonCard";
import { ArrivingSoonFilterBar } from "./components/ArrivingSoonFilterBar";
import { ConvertIssueToWOModal } from "./components/ConvertIssueToWOModal";

type Props = {
  operatingCompanyId: string;
};

export function ArrivingSoonPage({ operatingCompanyId }: Props) {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const canConvert = ["Owner", "Administrator", "Manager", "Maintenance"].includes(String(auth.user?.role ?? ""));
  const [withinHours, setWithinHours] = useState(48);
  const [severityMin, setSeverityMin] = useState<"info" | "warning" | "severe">("info");
  const [includeAlreadyArrived, setIncludeAlreadyArrived] = useState(true);
  const [includeNonYard, setIncludeNonYard] = useState(true);
  const [selectedCard, setSelectedCard] = useState<ArrivingSoonCardType | null>(null);

  const query = useQuery({
    queryKey: ["maintenance", "arriving-soon", operatingCompanyId, withinHours, severityMin, includeAlreadyArrived, includeNonYard],
    queryFn: () =>
      getArrivingSoon({
        operating_company_id: operatingCompanyId,
        within_hours: withinHours,
        severity_min: severityMin,
        include_already_arrived: includeAlreadyArrived,
        include_non_yard_destination: includeNonYard,
      }),
    enabled: Boolean(operatingCompanyId),
    refetchInterval: 60_000,
  });

  useEffect(() => {
    if (!operatingCompanyId) return;
    void logArrivingSoonView(operatingCompanyId);
  }, [operatingCompanyId]);

  const cards = query.data?.cards ?? [];
  const counts = query.data?.counts ?? { total: 0, severe: 0, warning: 0, info: 0, already_arrived: 0 };

  return (
    <div className="space-y-3">
      <ArrivingSoonFilterBar
        withinHours={withinHours}
        severityMin={severityMin}
        includeAlreadyArrived={includeAlreadyArrived}
        includeNonYard={includeNonYard}
        counts={counts}
        onWithinHoursChange={setWithinHours}
        onSeverityMinChange={setSeverityMin}
        onIncludeAlreadyArrivedChange={setIncludeAlreadyArrived}
        onIncludeNonYardChange={setIncludeNonYard}
      />

      {cards.length === 0 ? (
        <div className="rounded border border-gray-200 bg-white p-6 text-center text-sm text-gray-500">
          No units arriving with open issues. The shop has nothing to prep right now.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {cards.map((card) => (
            <ArrivingSoonCard key={`${card.load_id}:${card.unit_id}`} card={card} canConvert={canConvert} onConvert={setSelectedCard} />
          ))}
        </div>
      )}

      <ConvertIssueToWOModal
        open={Boolean(selectedCard)}
        operatingCompanyId={operatingCompanyId}
        card={selectedCard}
        onClose={() => setSelectedCard(null)}
        onDone={() => {
          setSelectedCard(null);
          void queryClient.invalidateQueries({ queryKey: ["maintenance", "arriving-soon", operatingCompanyId] });
        }}
      />
    </div>
  );
}
