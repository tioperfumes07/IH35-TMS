import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getSafetySettings } from "../../api/safety";
import { SafetySettingsForm } from "./components/SafetySettingsForm";

type Props = {
  operatingCompanyId: string;
};

export function SafetySettingsPage({ operatingCompanyId }: Props) {
  const queryClient = useQueryClient();
  const settingsQuery = useQuery({
    queryKey: ["safety", "settings", operatingCompanyId],
    queryFn: () => getSafetySettings(operatingCompanyId),
    enabled: Boolean(operatingCompanyId),
  });

  if (settingsQuery.isLoading) return <div className="text-sm text-gray-500">Loading settings...</div>;
  if (!settingsQuery.data) return <div className="text-sm text-gray-500">Settings not found.</div>;

  return (
    <SafetySettingsForm
      operatingCompanyId={operatingCompanyId}
      settings={settingsQuery.data}
      onSaved={() => void queryClient.invalidateQueries({ queryKey: ["safety", "settings", operatingCompanyId] })}
    />
  );
}
